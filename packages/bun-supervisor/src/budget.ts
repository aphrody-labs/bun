import { totalmem } from "node:os";
import { readCgroup, type ReadCgroupOptions } from "./cgroup";

export type ShrinkLevel = "soft" | "hard";
export type ResizeReason = "init" | "rebalance" | "resize" | "pressure" | "release";

export interface ChildBudgetOptions {
  /** Share relative to siblings. Default 1. */
  weight?: number;
  /** Bytes guaranteed to the child. Default 0. */
  min?: number;
  /** Bytes the child never exceeds. Excess goes to siblings. Default Infinity. */
  max?: number;
}

export interface BudgetTree {
  name: string;
  nominal: number;
  bytes: number;
  usage: number;
  children: BudgetTree[];
}

const FACTORS: Record<ShrinkLevel, number> = { soft: 0.85, hard: 0.6 };

/** Splits `total` among `items` by weight, honoring min and max. */
function fill(items: Budget[], total: number): Map<Budget, number> {
  const out = new Map<Budget, number>();
  const open = new Set(items);
  let left = total;
  for (let guard = items.length + 1; guard > 0 && open.size > 0; guard--) {
    let sum = 0;
    for (const b of open) sum += Math.max(b.weight, 0);
    const share = (b: Budget) =>
      sum > 0 ? (left * Math.max(b.weight, 0)) / sum : left / open.size;
    const low = [...open].filter((b) => share(b) < b.min);
    const fixed = low.length > 0 ? low : [...open].filter((b) => share(b) > b.max);
    if (fixed.length === 0) {
      for (const b of open) out.set(b, Math.floor(share(b)));
      return out;
    }
    const target = low.length > 0 ? (b: Budget) => b.min : (b: Budget) => b.max;
    for (const b of fixed) {
      out.set(b, Math.floor(target(b)));
      left -= target(b);
      open.delete(b);
    }
    left = Math.max(left, 0);
  }
  for (const b of open) out.set(b, 0);
  return out;
}

export class Budget {
  readonly name: string;
  readonly parent: Budget | undefined;
  weight = 1;
  min = 0;
  max = Infinity;

  #children = new Set<Budget>();
  #nominal: number;
  #share: number;
  #bytes: number;
  #factor = 1;
  #usage = 0;
  #released = false;
  #resize = new Set<(bytes: number, reason: ResizeReason) => void>();
  #shrink = new Set<(level: ShrinkLevel) => void | Promise<void>>();
  #idle = new Set<() => void | Promise<void>>();

  private constructor(name: string, bytes: number, parent?: Budget) {
    this.name = name;
    this.parent = parent;
    this.#nominal = bytes;
    this.#share = bytes;
    this.#bytes = bytes;
  }

  static root(opts: { name: string; bytes: number }): Budget {
    return new Budget(opts.name, opts.bytes);
  }

  /** memory.high of the cgroup, else memory.max * ratio, else $SUPERVISOR_MEMORY_BYTES, else half of RAM. */
  static fromCgroup(opts: { name: string; ratio?: number } & ReadCgroupOptions): Budget {
    const ratio = opts.ratio ?? 0.85;
    const cg = readCgroup(opts);
    let bytes: number;
    if (cg.high !== null && Number.isFinite(cg.high)) bytes = cg.high;
    else if (cg.max !== null && Number.isFinite(cg.max)) bytes = Math.floor(cg.max * ratio);
    else if (Number(process.env.SUPERVISOR_MEMORY_BYTES) > 0)
      bytes = Number(process.env.SUPERVISOR_MEMORY_BYTES);
    else bytes = Math.floor(totalmem() * 0.5);
    return Budget.root({ name: opts.name, bytes });
  }

  /** Effective share in bytes, reduced under pressure. */
  get bytes(): number {
    return this.#bytes;
  }
  /** Share without pressure reduction. */
  get nominal(): number {
    return this.#nominal;
  }
  get usage(): number {
    return this.#usage;
  }
  get released(): boolean {
    return this.#released;
  }
  get children(): readonly Budget[] {
    return [...this.#children];
  }

  child(name: string, opts: ChildBudgetOptions = {}): Budget {
    const c = new Budget(name, 0, this);
    c.weight = opts.weight ?? 1;
    c.min = opts.min ?? 0;
    c.max = opts.max ?? Infinity;
    this.#children.add(c);
    this.#layout("init");
    return c;
  }

  /** Changes weight, min or max and rebalances the siblings. */
  configure(opts: ChildBudgetOptions): void {
    if (opts.weight !== undefined) this.weight = opts.weight;
    if (opts.min !== undefined) this.min = opts.min;
    if (opts.max !== undefined) this.max = opts.max;
    this.parent?.#layout("rebalance");
  }

  /** Gives the share back to the siblings. */
  release(): void {
    if (this.#released) return;
    this.#released = true;
    const p = this.parent;
    p?.#children.delete(this);
    this.#set(0, 0, "release");
    p?.#layout("release");
  }

  /** Root: new total. Child: pins the share to `bytes` (min = max = bytes). */
  resize(bytes: number): void {
    if (this.parent) {
      this.min = bytes;
      this.max = bytes;
      this.parent.#layout("resize");
    } else {
      this.#set(bytes, bytes, "resize");
    }
  }

  onResize(cb: (bytes: number, reason: ResizeReason) => void): () => void {
    this.#resize.add(cb);
    return () => void this.#resize.delete(cb);
  }
  onShrink(cb: (level: ShrinkLevel) => void | Promise<void>): () => void {
    this.#shrink.add(cb);
    return () => void this.#shrink.delete(cb);
  }
  onIdle(cb: () => void | Promise<void>): () => void {
    this.#idle.add(cb);
    return () => void this.#idle.delete(cb);
  }

  /** Declarative accounting. */
  use(bytes: number): void {
    this.#usage = Math.max(0, this.#usage + bytes);
  }

  /**
   * Reduces the effective size of this subtree, runs shrink callbacks children first,
   * then collects garbage (`soft`: Bun.gc(false), `hard`: Bun.gc(true)).
   */
  async shrink(level: ShrinkLevel): Promise<void> {
    this.#factor = FACTORS[level];
    this.#set(this.#nominal, this.#share, "pressure");
    await this.#walk((b) => b.#shrink, level);
    Bun.gc(level === "hard");
  }

  /** Restores the nominal size after pressure ended. */
  relax(): void {
    if (this.#factor === 1) return;
    this.#factor = 1;
    this.#set(this.#nominal, this.#share, "pressure");
  }

  /** Long quiet period: idle callbacks, then a full collection to return memory. */
  async idle(): Promise<void> {
    await this.#walk((b) => b.#idle);
    Bun.gc(true);
  }

  tree(): BudgetTree {
    return {
      name: this.name,
      nominal: this.#nominal,
      bytes: this.#bytes,
      usage: this.#usage,
      children: [...this.#children].map((c) => c.tree()),
    };
  }

  async #walk(
    pick: (b: Budget) => Set<(arg: any) => void | Promise<void>>,
    arg?: ShrinkLevel,
  ): Promise<void> {
    for (const c of [...this.#children]) await c.#walk(pick, arg);
    for (const cb of [...pick(this)]) {
      try {
        await cb(arg);
      } catch {}
    }
  }

  #set(nominal: number, share: number, reason: ResizeReason): void {
    const before = this.#bytes;
    this.#nominal = nominal;
    this.#share = share;
    this.#bytes = Math.floor(share * this.#factor);
    if (this.#bytes !== before) {
      for (const cb of [...this.#resize]) {
        try {
          cb(this.#bytes, reason);
        } catch {}
      }
    }
    this.#layout(reason);
  }

  #layout(reason: ResizeReason): void {
    const kids = [...this.#children];
    if (kids.length === 0) return;
    const nominal = fill(kids, this.#nominal);
    const share = fill(kids, this.#bytes);
    for (const c of kids) c.#set(nominal.get(c) ?? 0, share.get(c) ?? 0, reason);
  }
}

export interface LruOptions<K, V> {
  sizeOf: (value: V, key: K) => number;
  maxEntries?: number;
  ttlMs?: number;
  /** Clock override for tests. */
  now?: () => number;
}

interface LruEntry<V> {
  value: V;
  size: number;
  expires: number;
}

/** LRU cache whose byte capacity is `budget.bytes`. Shrinks, empties and expires with the budget. */
export class BoundedLRU<K, V> {
  #map = new Map<K, LruEntry<V>>();
  #bytes = 0;
  #budget: Budget;
  #opts: LruOptions<K, V>;
  #off: Array<() => void>;

  constructor(budget: Budget, opts: LruOptions<K, V>) {
    this.#budget = budget;
    this.#opts = opts;
    this.#off = [
      budget.onResize(() => this.#evict(budget.bytes)),
      budget.onShrink((level) =>
        level === "hard" ? this.clear() : this.#evict(Math.floor(budget.bytes / 2)),
      ),
      budget.onIdle(() => this.#expire()),
    ];
  }

  get size(): number {
    return this.#map.size;
  }
  get bytes(): number {
    return this.#bytes;
  }
  get capacity(): number {
    return this.#budget.bytes;
  }

  get(key: K): V | undefined {
    const e = this.#map.get(key);
    if (!e) return undefined;
    if (e.expires <= this.#now()) {
      this.delete(key);
      return undefined;
    }
    this.#map.delete(key);
    this.#map.set(key, e);
    return e.value;
  }

  /** Returns false when the value alone exceeds the capacity. */
  set(key: K, value: V): boolean {
    this.delete(key);
    const size = this.#opts.sizeOf(value, key);
    if (size > this.#budget.bytes) return false;
    const ttl = this.#opts.ttlMs;
    this.#map.set(key, { value, size, expires: ttl ? this.#now() + ttl : Infinity });
    this.#bytes += size;
    this.#budget.use(size);
    this.#expire();
    this.#evict(this.#budget.bytes);
    return true;
  }

  delete(key: K): boolean {
    const e = this.#map.get(key);
    if (!e) return false;
    this.#map.delete(key);
    this.#bytes -= e.size;
    this.#budget.use(-e.size);
    return true;
  }

  clear(): void {
    this.#budget.use(-this.#bytes);
    this.#map.clear();
    this.#bytes = 0;
  }

  dispose(): void {
    this.clear();
    for (const off of this.#off) off();
  }

  #now(): number {
    return (this.#opts.now ?? Date.now)();
  }

  #expire(): void {
    if (!this.#opts.ttlMs) return;
    const now = this.#now();
    for (const [k, e] of this.#map) if (e.expires <= now) this.delete(k);
  }

  #evict(limit: number): void {
    const maxEntries = this.#opts.maxEntries ?? Infinity;
    for (const k of [...this.#map.keys()]) {
      if (this.#bytes <= limit && this.#map.size <= maxEntries) break;
      this.delete(k);
    }
  }
}
