import { describe, expect, test } from "bun:test";
import {
  Budget,
  monitorPressure,
  type CgroupStats,
  type PressureLevel,
} from "../../../../packages/bun-supervisor/src";

function stats(current: number, psi = 0, events: Partial<CgroupStats["events"]> = {}): CgroupStats {
  return {
    dir: null,
    current,
    high: 1000,
    max: Infinity,
    swapMax: 0,
    events: { high: 0, max: 0, oom: 0, oom_kill: 0, ...events },
    psi: { some: { avg10: psi, avg60: 0, total: 0 }, full: null },
  };
}

function setup(extra: Record<string, unknown> = {}) {
  const budget = Budget.root({ name: "r", bytes: 1000 });
  const calls: string[] = [];
  budget.onShrink((l) => void calls.push(`shrink:${l}`));
  budget.onIdle(() => void calls.push("idle"));
  let cur: CgroupStats = stats(100);
  let t = 0;
  const levels: string[] = [];
  const mon = monitorPressure({
    budget,
    autoStart: false,
    read: () => cur,
    now: () => t,
    watchRuntime: () => () => {},
    onLevel: (l, p) => levels.push(`${p}>${l}`),
    ...extra,
  });
  return {
    budget,
    calls,
    levels,
    mon,
    set: (s: CgroupStats) => (cur = s),
    tick: (ms: number) => (t += ms),
  };
}

describe("monitorPressure", () => {
  test("goes ok -> soft -> hard immediately and shrinks", async () => {
    const s = setup();
    expect(await s.mon.sample()).toBe("ok");
    s.set(stats(950));
    expect(await s.mon.sample()).toBe("soft");
    s.set(stats(100, 50));
    expect(await s.mon.sample()).toBe("hard");
    expect(s.calls).toEqual(["shrink:soft", "shrink:hard"]);
    expect(s.levels).toEqual(["ok>soft", "soft>hard"]);
    expect(s.budget.bytes).toBe(600);
    s.mon.stop();
  });

  test("hysteresis: needs calm samples and a lower reading to step down", async () => {
    const s = setup();
    s.set(stats(950));
    await s.mon.sample();
    s.set(stats(880)); // below highRatio but inside the hysteresis band
    for (let i = 0; i < 5; i++) expect(await s.mon.sample()).toBe("soft");
    s.set(stats(700));
    const seq: PressureLevel[] = [];
    for (let i = 0; i < 3; i++) seq.push(await s.mon.sample());
    expect(seq).toEqual(["soft", "soft", "ok"]);
    expect(s.budget.bytes).toBe(1000);
  });

  test("hard is stepped down through soft", async () => {
    const s = setup({ calmSamples: 1 });
    s.set(stats(100, 90));
    await s.mon.sample();
    s.set(stats(100, 0));
    expect(await s.mon.sample()).toBe("soft");
    expect(await s.mon.sample()).toBe("ok");
  });

  test("debounces shrinks of the same level to one per 10 s", async () => {
    const s = setup();
    s.set(stats(100, 90));
    await s.mon.sample();
    s.tick(5000);
    await s.mon.sample();
    expect(s.calls).toEqual(["shrink:hard"]);
    s.tick(5000);
    await s.mon.sample();
    expect(s.calls).toEqual(["shrink:hard", "shrink:hard"]);
  });

  test("events: oom_kill increase forces hard", async () => {
    const s = setup();
    await s.mon.sample();
    s.set(stats(100, 0, { oom_kill: 1 }));
    expect(await s.mon.sample()).toBe("hard");
  });

  test("runtime memoryPressure event raises the level for one sample", async () => {
    let fire!: (l: PressureLevel) => void;
    const s = setup({ watchRuntime: (cb: (l: PressureLevel) => void) => ((fire = cb), () => {}) });
    fire("soft");
    expect(await s.mon.sample()).toBe("soft");
  });

  test("idle callbacks run once after idleMs of ok", async () => {
    const s = setup({ idleMs: 1000 });
    await s.mon.sample();
    s.tick(999);
    await s.mon.sample();
    expect(s.calls).toEqual([]);
    s.tick(1);
    await s.mon.sample();
    s.tick(5000);
    await s.mon.sample();
    expect(s.calls).toEqual(["idle"]);
  });
});
