import type { Budget } from "./budget";
import { readCgroup, type CgroupStats } from "./cgroup";

export type PressureLevel = "ok" | "soft" | "hard";
const RANK: Record<PressureLevel, number> = { ok: 0, soft: 1, hard: 2 };
const NAMES: PressureLevel[] = ["ok", "soft", "hard"];

export interface PressureOptions {
  budget: Budget;
  intervalMs?: number;
  /** PSI some avg10 (percent) that enters soft. Default 10. */
  psiHigh?: number;
  /** PSI some avg10 (percent) that enters hard. Default 40. */
  psiCritical?: number;
  /** memory.current / memory.high that enters soft. Default 0.9. */
  highRatio?: number;
  /** Quiet time before `budget.idle()`. Default 60000. */
  idleMs?: number;
  /** Consecutive calmer samples before the level steps down. Default 3. */
  calmSamples?: number;
  /** Minimum time between two shrinks of the same level. Default 10000. */
  shrinkIntervalMs?: number;
  onLevel?: (level: PressureLevel, previous: PressureLevel) => void;
  /** Cgroup reader override (tests). */
  read?: () => CgroupStats;
  now?: () => number;
  /** Subscribes to the runtime event. Default `process.on("memoryPressure")`. Return an unsubscribe. */
  watchRuntime?: (cb: (level: PressureLevel) => void) => () => void;
  /** Starts the sampling timer. Default true. */
  autoStart?: boolean;
}

export interface PressureMonitor {
  stop(): void;
  level(): PressureLevel;
  /** Takes one sample, updates the level and runs shrink or idle actions. */
  sample(): Promise<PressureLevel>;
  /** Last cgroup reading. */
  last(): { current: number | null; limit: number; psi: number } | undefined;
}

function defaultWatch(cb: (level: PressureLevel) => void): () => void {
  const handler = (lvl: unknown) => cb(lvl === 4 || lvl === "critical" ? "hard" : "soft");
  try {
    (process as any).on("memoryPressure", handler);
  } catch {
    return () => {};
  }
  return () => {
    try {
      (process as any).off("memoryPressure", handler);
    } catch {}
  };
}

export function monitorPressure(opts: PressureOptions): PressureMonitor {
  const { budget } = opts;
  const intervalMs = opts.intervalMs ?? 2000;
  const psiHigh = opts.psiHigh ?? 10;
  const psiCritical = opts.psiCritical ?? 40;
  const highRatio = opts.highRatio ?? 0.9;
  const idleMs = opts.idleMs ?? 60_000;
  const calm = opts.calmSamples ?? 3;
  const shrinkEvery = opts.shrinkIntervalMs ?? 10_000;
  const read = opts.read ?? (() => readCgroup());
  const now = opts.now ?? Date.now;

  let level: PressureLevel = "ok";
  let calmCount = 0;
  let okSince = now();
  let idled = false;
  let runtimeFloor: PressureLevel = "ok";
  let prevEvents: CgroupStats["events"] | undefined;
  let lastShrink: Record<"soft" | "hard", number> = { soft: -Infinity, hard: -Infinity };
  let lastReading: ReturnType<PressureMonitor["last"]>;
  let busy: Promise<PressureLevel> | undefined;

  const unwatch = (opts.watchRuntime ?? defaultWatch)((l) => {
    if (RANK[l] > RANK[runtimeFloor]) runtimeFloor = l;
  });

  function classify(stats: CgroupStats, up: boolean): PressureLevel {
    const limit =
      stats.high !== null && Number.isFinite(stats.high)
        ? stats.high
        : stats.max !== null && Number.isFinite(stats.max)
          ? stats.max
          : budget.nominal;
    const psi = stats.psi.some?.avg10 ?? 0;
    const cur = stats.current ?? 0;
    // Stepping down needs lower readings than stepping up.
    const ps = up ? 1 : 0.5;
    const rs = up ? 0 : 0.05;
    lastReading = { current: stats.current, limit, psi };
    if (psi >= psiCritical * ps || (limit > 0 && cur >= limit * (1 - rs))) return "hard";
    if (psi >= psiHigh * ps || (limit > 0 && cur >= limit * (highRatio - rs))) return "soft";
    return "ok";
  }

  async function run(): Promise<PressureLevel> {
    const stats = read();
    let up = classify(stats, true);
    const down = classify(stats, false);
    const ev = stats.events;
    if (prevEvents) {
      if ((ev.oom_kill ?? 0) > (prevEvents.oom_kill ?? 0) || (ev.max ?? 0) > (prevEvents.max ?? 0))
        up = "hard";
      else if ((ev.high ?? 0) > (prevEvents.high ?? 0) && up === "ok") up = "soft";
    }
    prevEvents = ev;
    if (RANK[runtimeFloor] > RANK[up]) up = runtimeFloor;
    runtimeFloor = "ok";

    const before = level;
    if (RANK[up] > RANK[level]) {
      level = up;
      calmCount = 0;
    } else if (RANK[down] < RANK[level]) {
      if (++calmCount >= calm) {
        level = NAMES[RANK[level] - 1]!;
        calmCount = 0;
      }
    } else {
      calmCount = 0;
    }

    const t = now();
    if (level === "ok") {
      if (before !== "ok") {
        okSince = t;
        idled = false;
      }
      budget.relax();
      if (!idled && t - okSince >= idleMs) {
        idled = true;
        await budget.idle();
      }
    } else if (t - lastShrink[level] >= shrinkEvery) {
      lastShrink[level] = t;
      await budget.shrink(level);
    }
    if (level !== before) {
      try {
        opts.onLevel?.(level, before);
      } catch {}
    }
    return level;
  }

  const sample = (): Promise<PressureLevel> => {
    busy ??= run().finally(() => {
      busy = undefined;
    });
    return busy;
  };

  let timer: ReturnType<typeof setInterval> | undefined;
  if (opts.autoStart !== false) {
    timer = setInterval(() => void sample().catch(() => {}), intervalMs);
    timer.unref();
  }

  return {
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      unwatch();
    },
    level: () => level,
    sample,
    last: () => lastReading,
  };
}
