import { describe, expect, test } from "bun:test";
import { BoundedLRU, Budget, readCgroup } from "../../../../packages/bun-supervisor/src";

describe("Budget", () => {
  test("shares proportional to weights", () => {
    const root = Budget.root({ name: "root", bytes: 1000 });
    const a = root.child("a", { weight: 1 });
    expect(a.bytes).toBe(1000);
    const b = root.child("b", { weight: 3 });
    expect([a.bytes, b.bytes]).toEqual([250, 750]);
    b.release();
    expect(a.bytes).toBe(1000);
    expect(root.tree().children.map((c) => c.name)).toEqual(["a"]);
  });

  test("min is honored and max is redistributed", () => {
    const root = Budget.root({ name: "root", bytes: 1000 });
    const a = root.child("a", { weight: 1, min: 600 });
    const b = root.child("b", { weight: 1 });
    expect([a.bytes, b.bytes]).toEqual([600, 400]);
    a.configure({ min: 0, max: 100 });
    expect([a.bytes, b.bytes]).toEqual([100, 900]);
  });

  test("resize is recursive and reports the reason", () => {
    const root = Budget.root({ name: "root", bytes: 1000 });
    const a = root.child("a");
    const leaf = a.child("leaf");
    const seen: Array<[number, string]> = [];
    leaf.onResize((bytes, reason) => seen.push([bytes, reason]));
    root.resize(400);
    expect([a.bytes, leaf.bytes]).toEqual([400, 400]);
    expect(seen).toEqual([[400, "resize"]]);
    a.resize(100);
    expect([a.bytes, leaf.bytes]).toEqual([100, 100]);
    expect(seen.at(-1)).toEqual([100, "resize"]);
  });

  test("shrink reduces bytes, runs children before parents, relax restores", async () => {
    const root = Budget.root({ name: "root", bytes: 1000 });
    const a = root.child("a");
    const order: string[] = [];
    root.onShrink((l) => void order.push(`root:${l}`));
    a.onShrink(async (l) => {
      await Promise.resolve();
      order.push(`a:${l}`);
    });
    a.onShrink(() => {
      throw new Error("callback errors are contained");
    });
    await root.shrink("hard");
    expect(order).toEqual(["a:hard", "root:hard"]);
    expect(a.bytes).toBe(600);
    expect(a.nominal).toBe(1000);
    await root.shrink("soft");
    expect(a.bytes).toBe(850);
    root.relax();
    expect(a.bytes).toBe(1000);
  });

  test("tree reports declared usage", () => {
    const root = Budget.root({ name: "root", bytes: 100 });
    const a = root.child("a");
    a.use(30);
    a.use(-10);
    expect(root.tree()).toEqual({
      name: "root",
      nominal: 100,
      bytes: 100,
      usage: 0,
      children: [{ name: "a", nominal: 100, bytes: 100, usage: 20, children: [] }],
    });
  });

  test("fromCgroup prefers memory.high, then memory.max * ratio", () => {
    const files = (o: Record<string, string>) => ({ name: "x", read: (f: string) => o[f] });
    expect(
      Budget.fromCgroup(files({ "memory.high": "5000\n", "memory.max": "9000\n" })).bytes,
    ).toBe(5000);
    expect(Budget.fromCgroup(files({ "memory.high": "max\n", "memory.max": "1000\n" })).bytes).toBe(
      850,
    );
    expect(Budget.fromCgroup({ ...files({ "memory.max": "1000\n" }), ratio: 0.5 }).bytes).toBe(500);
    expect(Budget.fromCgroup(files({})).bytes).toBeGreaterThan(0);
  });
});

describe("readCgroup", () => {
  test("parses limits, events and PSI", () => {
    const files: Record<string, string> = {
      "memory.current": "123\n",
      "memory.high": "max\n",
      "memory.max": "456\n",
      "memory.swap.max": "0\n",
      "memory.events": "low 0\nhigh 3\nmax 1\noom 0\noom_kill 2\n",
      "memory.pressure":
        "some avg10=1.50 avg60=0.75 avg300=0.10 total=1000\nfull avg10=0.25 avg60=0.00 avg300=0.00 total=10\n",
    };
    const cg = readCgroup({ read: (f) => files[f] });
    expect(cg.current).toBe(123);
    expect(cg.high).toBe(Infinity);
    expect(cg.max).toBe(456);
    expect(cg.swapMax).toBe(0);
    expect(cg.events).toEqual({ high: 3, max: 1, oom: 0, oom_kill: 2 });
    expect(cg.psi.some).toEqual({ avg10: 1.5, avg60: 0.75, total: 1000 });
    expect(cg.psi.full?.avg10).toBe(0.25);
  });

  test("missing files give null", () => {
    const cg = readCgroup({ read: () => undefined });
    expect(cg.current).toBeNull();
    expect(cg.events.oom_kill).toBeNull();
    expect(cg.psi).toEqual({ some: null, full: null });
  });
});

describe("BoundedLRU", () => {
  const size = (v: string) => v.length;

  test("evicts least recently used by bytes and entries", () => {
    const b = Budget.root({ name: "r", bytes: 10 });
    const lru = new BoundedLRU<string, string>(b, { sizeOf: size });
    lru.set("a", "xxxx");
    lru.set("b", "xxxx");
    expect(lru.get("a")).toBe("xxxx");
    lru.set("c", "xxxx");
    expect(lru.get("b")).toBeUndefined();
    expect([lru.size, lru.bytes, b.usage]).toEqual([2, 8, 8]);
    expect(lru.set("big", "x".repeat(11))).toBe(false);
    const capped = new BoundedLRU<string, string>(Budget.root({ name: "r", bytes: 100 }), {
      sizeOf: size,
      maxEntries: 1,
    });
    capped.set("a", "1");
    capped.set("b", "2");
    expect([capped.get("a"), capped.get("b")]).toEqual([undefined, "2"]);
  });

  test("follows the budget: resize evicts, hard shrink empties", async () => {
    const root = Budget.root({ name: "r", bytes: 100 });
    const leaf = root.child("lru");
    const lru = new BoundedLRU<number, string>(leaf, { sizeOf: size });
    for (let i = 0; i < 10; i++) lru.set(i, "xxxxxxxxxx");
    expect(lru.size).toBe(10);
    root.resize(50);
    expect(lru.size).toBe(5);
    expect(lru.get(9)).toBe("xxxxxxxxxx");
    await root.shrink("soft");
    expect(lru.bytes).toBeLessThanOrEqual(Math.floor(leaf.bytes / 2));
    await root.shrink("hard");
    expect(lru.size).toBe(0);
    expect(leaf.usage).toBe(0);
  });

  test("expires entries after ttlMs", () => {
    let t = 0;
    const lru = new BoundedLRU<string, string>(Budget.root({ name: "r", bytes: 100 }), {
      sizeOf: size,
      ttlMs: 10,
      now: () => t,
    });
    lru.set("a", "x");
    t = 9;
    expect(lru.get("a")).toBe("x");
    t = 10;
    expect(lru.get("a")).toBeUndefined();
    expect(lru.size).toBe(0);
  });
});
