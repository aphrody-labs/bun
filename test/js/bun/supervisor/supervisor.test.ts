import { describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { isLinux, tempDir } from "harness";
import { join } from "node:path";
import { Budget, Supervisor } from "../../../../packages/bun-supervisor/src";

const src = join(import.meta.dir, "../../../../packages/bun-supervisor/src").replaceAll("\\", "/");

async function waitFor<T>(fn: () => T | undefined | false, ms = 20_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error("timed out");
    await Bun.sleep(5);
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const idle = "setInterval(() => {}, 1000)";

function make(extra: Record<string, unknown> = {}) {
  const logs: string[] = [];
  const sup = new Supervisor({
    name: "test",
    budget: Budget.root({ name: "test", bytes: 10_000_000 }),
    log: (m) => logs.push(m),
    signals: false,
    ...extra,
  });
  return { sup, logs };
}

describe("Supervisor", () => {
  test("restarts a crashing child with exponential backoff", async () => {
    const { sup, logs } = make({ backoff: { baseMs: 20, maxMs: 80 } });
    const child = sup.spawnSelf("crash", ["-e", "process.exit(3)"], { bun: true });
    await waitFor(() => child.restarts >= 4);
    await sup.drain();
    const delays = logs.map((l) => /restart in (\d+) ms/.exec(l)?.[1]).filter(Boolean);
    expect(delays.slice(0, 4)).toEqual(["20", "40", "80", "80"]);
    expect(child.state).toBe("stopped");
  });

  test("restart policies: never and on-failure", async () => {
    const { sup } = make({ backoff: { baseMs: 10 } });
    const never = sup.spawnSelf("never", ["-e", "process.exit(1)"], { restart: "never" });
    const clean = sup.spawnSelf("clean", ["-e", "process.exit(0)"], { restart: "on-failure" });
    await waitFor(() => never.state === "exited" && clean.state === "exited");
    expect([never.restarts, clean.restarts]).toEqual([0, 0]);
    expect(await sup.healthy()).toBe(false);
    await sup.drain();
  });

  test("resets the backoff after a stable run", async () => {
    const { sup, logs } = make({ backoff: { baseMs: 20, maxMs: 1000, stableMs: 1 } });
    const child = sup.spawnSelf("stable", ["-e", "setTimeout(() => process.exit(1), 150)"]);
    await waitFor(() => child.restarts >= 3);
    await sup.drain();
    const delays = logs.map((l) => /restart in (\d+) ms/.exec(l)?.[1]).filter(Boolean);
    expect(delays.slice(0, 3)).toEqual(["20", "20", "20"]);
  });

  test("passes the budget in the environment and over IPC, and relays resize and shrink", async () => {
    using dir = tempDir("supervisor-ipc", {});
    const log = join(String(dir), "child.log");
    const script = `
      import { childBudget } from "${src}/child.ts";
      import { appendFileSync } from "node:fs";
      const log = (s) => appendFileSync(${JSON.stringify(log)}, s + "\\n");
      const b = childBudget({ reportMs: 20, ready: true });
      log("start " + b.name + " " + b.bytes + " " + process.env.BUN_JSC_forceRAMSize + " " + process.env.BUN_JSC_gcMaxHeapSize);
      b.onResize((x, r) => log("resize " + x + " " + r));
      b.onShrink((l) => log("shrink " + l));
      setInterval(() => {}, 1000);
    `;
    const { sup } = make();
    const child = sup.spawnSelf("worker", ["-e", script], { bun: true });
    const lines = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);
    await sup.ready();
    await waitFor(() => lines().length >= 1);
    expect(lines()[0]).toBe("start worker 10000000 10000000 7500000");
    await waitFor(() => child.lastMem);
    expect(child.lastMem!.rss).toBeGreaterThan(0);

    sup.budget.resize(5_000_000);
    await waitFor(() => lines().includes("resize 5000000 resize"));

    await sup.budget.shrink("hard");
    await waitFor(() => lines().includes("shrink hard"));
    expect(child.budget.bytes).toBe(3_000_000);
    await sup.drain();
  });

  test("ready waits for every ready callback", async () => {
    const { sup } = make();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    sup.spawnSelf("a", ["-e", idle], { ready: () => gate });
    sup.spawnSelf("b", ["-e", idle]);
    let done = false;
    const p = sup.ready().then(() => (done = true));
    await Bun.sleep(50);
    expect(done).toBe(false);
    release();
    await p;
    expect(sup.children.map((c) => c.state)).toEqual(["ready", "ready"]);
    await sup.drain();
  });

  test("drain stops inbound first, returns only when all children are dead", async () => {
    const order: string[] = [];
    const { sup } = make({
      onDrain: () => {
        order.push(
          `onDrain alive=${sup.children.every((c) => c.pid !== undefined && alive(c.pid))}`,
        );
      },
    });
    sup.spawnSelf("a", ["-e", idle]);
    sup.spawnSelf("b", ["-e", idle]);
    const pids = sup.children.map((c) => c.pid!);
    await sup.ready();
    await sup.drain();
    expect(order).toEqual(["onDrain alive=true"]);
    expect(pids.map(alive)).toEqual([false, false]);
    expect(sup.draining).toBe(true);
    await sup.drain();
    expect(() => sup.spawnSelf("late", ["-e", idle])).toThrow("draining");
  });

  test.skipIf(!isLinux)("drain escalates to SIGKILL after drainMs", async () => {
    const { sup, logs } = make({ drainMs: 300 });
    sup.spawnSelf("stubborn", ["-e", `process.on("SIGTERM", () => {}); ${idle}`]);
    const pid = sup.children[0]!.pid!;
    await sup.ready();
    await Bun.sleep(200);
    const t = Date.now();
    await sup.drain();
    expect(Date.now() - t).toBeGreaterThanOrEqual(250);
    expect(alive(pid)).toBe(false);
    expect(logs.some((l) => l.includes("SIGKILL"))).toBe(true);
  });

  test("/healthz reports children, budget and 503 when a child is down", async () => {
    const { sup } = make({ healthPort: 0, backoff: { baseMs: 60_000 } });
    sup.spawnSelf("up", ["-e", idle], { weight: 3 });
    sup.start();
    await sup.ready();
    const res = await fetch(sup.healthUrl!);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe("ok");
    expect(body.children).toHaveLength(1);
    expect(body.children[0]).toMatchObject({ name: "up", state: "ready", budget: 10_000_000 });
    expect(body.children[0].pid).toBeGreaterThan(0);
    expect(body.budget.children[0].name).toBe("up");

    sup.spawnSelf("down", ["-e", "process.exit(1)"]);
    await waitFor(() => sup.children[1]!.state === "backoff");
    const bad = await fetch(sup.healthUrl!);
    expect(bad.status).toBe(503);
    expect(((await bad.json()) as any).status).toBe("degraded");
    await sup.drain();
  });

  test.skipIf(!isLinux)("rssOf reads /proc/<pid>/status", () => {
    const { sup } = make();
    expect(sup.rssOf(process.pid)!).toBeGreaterThan(0);
    expect(sup.rssOf(2 ** 22 + 1)).toBeUndefined();
  });
});
