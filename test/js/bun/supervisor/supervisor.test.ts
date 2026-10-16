import { describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { bunEnv, bunExe, isLinux, tempDir } from "harness";
import { join } from "node:path";
import { Budget, Supervisor } from "../../../../packages/bun-supervisor/src";
import { ServiceSupervisor } from "../../../../packages/bun-supervisor/src/services";
import { planWindowsService } from "../../../../packages/bun-supervisor/src/windows-service-plan";

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
    log: m => logs.push(m),
    signals: false,
    ...extra,
  });
  return { sup, logs };
}

describe("Windows service plan", () => {
  test("quotes argv for NSSM without applying a service or starting it", () => {
    const plan = planWindowsService({
      name: "BunWorker",
      nssmPath: "C:\\tools\\nssm.exe",
      executable: "C:\\tools\\bun.exe",
      directory: "C:\\apps\\worker",
      existing: true,
      start: "manual",
      args: ["run", "C:\\Program Files\\worker.ts", "", 'a"b', "C:\\trailing path\\"],
    });
    expect(plan.commands.some(command => command[1] === "install")).toBe(false);
    expect(plan.commands.some(command => command[1] === "start")).toBe(false);
    expect(plan.startsService).toBe(false);
    expect(plan.commands.find(command => command[3] === "AppParameters")?.[4]).toBe(
      'run "C:\\Program Files\\worker.ts" "" "a\\"b" "C:\\trailing path\\\\"',
    );
    expect(plan.commands.find(command => command[3] === "Start")?.[4]).toBe("SERVICE_DEMAND_START");
  });

  test("rejects relative executables and control characters", () => {
    const options = {
      name: "BunWorker",
      nssmPath: "C:\\tools\\nssm.exe",
      executable: "C:\\tools\\bun.exe",
      directory: "C:\\apps",
    };
    expect(() => planWindowsService({ ...options, executable: "bun.exe" })).toThrow("absolute");
    expect(() => planWindowsService({ ...options, args: ["bad\nargument"] })).toThrow("argument");
    expect(() => planWindowsService({ ...options, name: "worker/other" })).toThrow("name");
  });
});

describe("ServiceSupervisor", () => {
  test("rejects duplicate IDs, traversal, reserved filenames and invalid commands", () => {
    const service = { id: "worker", command: [bunExe(), "-e", idle] };
    expect(() => new ServiceSupervisor({ services: [service, { ...service, id: "WORKER" }] })).toThrow("duplicate");
    for (const id of ["../outside", "a/b", "a\\b", "CON", "nul", ""]) {
      expect(() => new ServiceSupervisor({ services: [{ ...service, id }] })).toThrow("Invalid");
    }
    expect(() => new ServiceSupervisor({ services: [{ ...service, command: [] }] })).toThrow("command");
    expect(() => new ServiceSupervisor({ services: [service], probeTimeoutMs: 0 })).toThrow("probeTimeoutMs");
  });

  test("uses configured cwd/env/logs and writes the final stopped snapshot", async () => {
    using dir = tempDir("service-supervisor", {});
    const logDirectory = join(String(dir), "logs");
    const statusFile = join(String(dir), "status.json");
    const sup = new ServiceSupervisor({
      cwd: String(dir),
      env: { ...bunEnv, SERVICE_TEST_VALUE: "shared" },
      logDirectory,
      statusFile,
      healthPort: 0,
      signals: false,
      services: [
        {
          id: "worker",
          env: { SERVICE_TEST_VALUE: "override" },
          command: [
            bunExe(),
            "-e",
            `console.log(JSON.stringify({cwd:process.cwd(),value:process.env.SERVICE_TEST_VALUE})); ${idle}`,
          ],
        },
      ],
    });
    let pid: number | null = null;
    try {
      await sup.start();
      const line = await waitFor(() => {
        const file = join(logDirectory, "worker.log");
        return existsSync(file) && readFileSync(file, "utf8").trim();
      });
      expect(JSON.parse(line)).toEqual({ cwd: String(dir), value: "override" });
      const response = await fetch(sup.healthUrl!);
      expect(response.status).toBe(200);
      const health = (await response.json()) as { ok: boolean };
      expect(health.ok).toBe(true);
      const head = await fetch(sup.healthUrl!, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
      const post = await fetch(sup.healthUrl!, { method: "POST" });
      expect(post.status).toBe(405);
      expect(post.headers.get("allow")).toBe("GET, HEAD");
      await post.body?.cancel();
      const rebound = await fetch(sup.healthUrl!, {
        headers: { Host: "evil.example", Origin: "http://evil.example" },
      });
      expect(rebound.status).toBe(403);
      await rebound.body?.cancel();
      pid = sup.status().services[0]!.pid;
    } finally {
      await sup.stop();
    }
    expect(pid).not.toBeNull();
    expect(alive(pid!)).toBe(false);
    expect(JSON.parse(readFileSync(statusFile, "utf8")).services[0].state).toBe("stopped");
    expect(sup.healthUrl).toBeUndefined();
    await expect(sup.start()).rejects.toThrow("stopped");
  });

  test("health follows HTTP probe results", async () => {
    let ready = false;
    const health = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("health", { status: ready ? 200 : 503 }),
    });
    const sup = new ServiceSupervisor({
      signals: false,
      healthPort: 0,
      env: bunEnv,
      services: [
        {
          id: "worker",
          command: [bunExe(), "-e", idle],
          health: `http://127.0.0.1:${health.port}`,
        },
      ],
    });
    try {
      await sup.start();
      const bad = await fetch(sup.healthUrl!);
      expect(bad.status).toBe(503);
      await bad.body?.cancel();
      ready = true;
      await sup.probe();
      expect(sup.status().services[0]!.healthy).toBe(true);
      const good = await fetch(sup.healthUrl!);
      expect(good.status).toBe(200);
      await good.body?.cancel();
    } finally {
      await sup.stop();
      await health.stop(true);
    }
  });

  test("cancels restart backoff on stop and honors clean on-failure exits", async () => {
    const sup = new ServiceSupervisor({
      signals: false,
      env: bunEnv,
      backoff: { baseMs: 60_000, maxMs: 60_000 },
      services: [
        { id: "crash", command: [bunExe(), "-e", "process.exit(3)"] },
        { id: "clean", command: [bunExe(), "-e", "process.exit(0)"], restart: "on-failure" },
      ],
    });
    try {
      await sup.start();
      await waitFor(
        () => sup.status().services[0]!.state === "backoff" && sup.status().services[1]!.state === "exited",
      );
      expect(sup.status().services.map(service => service.restarts)).toEqual([1, 0]);
    } finally {
      await sup.stop();
    }
    expect(sup.status().services.map(service => [service.state, service.pid])).toEqual([
      ["stopped", null],
      ["stopped", null],
    ]);
  });

  test("failed initial snapshot releases children and health server", async () => {
    using dir = tempDir("service-supervisor-failure", {});
    let pid: number | undefined;
    const sup = new ServiceSupervisor({
      signals: false,
      healthPort: 0,
      statusFile: String(dir),
      env: bunEnv,
      services: [{ id: "worker", command: [bunExe(), "-e", idle] }],
      log: event => {
        if (event.event === "started") pid = event.pid;
      },
    });
    try {
      await expect(sup.start()).rejects.toThrow();
    } finally {
      await sup.stop().catch(() => {});
    }
    expect(pid).toBeDefined();
    expect(alive(pid!)).toBe(false);
    expect(sup.healthUrl).toBeUndefined();
  });

  test.skipIf(process.platform !== "win32")("Windows Job closes descendants during stop", async () => {
    using dir = tempDir("service-supervisor-job", {});
    const sup = new ServiceSupervisor({
      signals: false,
      logDirectory: String(dir),
      env: bunEnv,
      services: [
        {
          id: "parent",
          command: [
            bunExe(),
            "-e",
            `const child=Bun.spawn({cmd:[process.execPath,"-e",${JSON.stringify(idle)}],stdin:"ignore",stdout:"ignore",stderr:"ignore"}); console.log(child.pid); ${idle}`,
          ],
        },
      ],
    });
    let descendant: number | undefined;
    try {
      await sup.start();
      descendant = await waitFor(() => {
        const file = join(String(dir), "parent.log");
        return existsSync(file) && Number(readFileSync(file, "utf8").trim());
      });
      expect(alive(descendant)).toBe(true);
      await sup.stop();
      await waitFor(() => !alive(descendant!));
    } finally {
      await sup.stop();
      if (descendant && alive(descendant)) process.kill(descendant, "SIGKILL");
    }
  });
});

describe("ServiceSupervisor pause leases", () => {
  test("rejects unknown IDs before start and rejects an exited service", async () => {
    let starts = 0;
    const sup = new ServiceSupervisor({
      signals: false,
      env: bunEnv,
      services: [{ id: "done", command: [bunExe(), "-e", "process.exit(0)"], restart: "never" }],
      log: event => {
        if (event.event === "started") starts++;
      },
    });
    try {
      await expect(sup.pause("missing")).rejects.toThrow("Unknown service");
      await expect(sup.resume("missing")).rejects.toThrow("Unknown service");
      expect(starts).toBe(0);
      await sup.start();
      await waitFor(() => sup.status().services[0]!.state === "exited");
      await expect(sup.pause("done")).rejects.toThrow("not supervised");
    } finally {
      await sup.stop();
    }
  });

  test("pause owns child termination without restarting it, and leaves peers running", async () => {
    const sup = new ServiceSupervisor({
      signals: false,
      env: bunEnv,
      services: [
        { id: "worker", command: [bunExe(), "-e", idle] },
        { id: "peer", command: [bunExe(), "-e", idle] },
      ],
    });
    try {
      await sup.start();
      const initial = sup.status().services;
      await sup.pause("worker");
      const paused = sup.status().services;
      expect(paused[0]).toMatchObject({ state: "paused", pid: null, healthy: false, restarts: 0 });
      expect(alive(initial[0]!.pid!)).toBe(false);
      expect(paused[1]!.pid).toBe(initial[1]!.pid);
      expect(alive(paused[1]!.pid!)).toBe(true);
      await sup.probe();
      expect(sup.status().services[0]!.state).toBe("paused");
      await sup.resume("worker");
      const resumed = await waitFor(() => {
        const status = sup.status().services[0]!;
        return status.state === "running" && status;
      });
      expect(resumed.restarts).toBe(0);
      expect(resumed.pid).not.toBe(initial[0]!.pid);
    } finally {
      await sup.stop();
    }
  });

  test("lease finally restores its own pause but preserves a caller's existing pause", async () => {
    const sup = new ServiceSupervisor({
      signals: false,
      env: bunEnv,
      services: [{ id: "worker", command: [bunExe(), "-e", idle] }],
    });
    try {
      await expect(
        sup.withPaused("worker", async signal => {
          expect(signal.aborted).toBe(false);
          expect(sup.status().services[0]!.state).toBe("paused");
          throw new Error("lease failure");
        }),
      ).rejects.toThrow("lease failure");
      await waitFor(() => sup.status().services[0]!.state === "running");
      await sup.pause("worker");
      expect(await sup.withPaused("worker", async () => 42)).toBe(42);
      expect(sup.status().services[0]).toMatchObject({ state: "paused", restarts: 0 });
      await sup.stop();
      await expect(sup.resume("worker")).rejects.toThrow("stopped");
      await expect(sup.pause("missing")).rejects.toThrow("Unknown service");
    } finally {
      await sup.stop();
    }
  });

  test("pause cancels backoff and global stop overrides a pending lease resume", async () => {
    const sup = new ServiceSupervisor({
      signals: false,
      env: bunEnv,
      backoff: { baseMs: 60_000 },
      services: [{ id: "crash", command: [bunExe(), "-e", "process.exit(1)"] }],
    });
    try {
      await sup.start();
      await waitFor(() => sup.status().services[0]!.state === "backoff");
      await sup.pause("crash");
      const restarts = sup.status().services[0]!.restarts;
      let enter!: () => void;
      let release!: () => void;
      const entered = new Promise<void>(done => {
        enter = done;
      });
      const gate = new Promise<void>(done => {
        release = done;
      });
      const lease = sup.withPaused("crash", async signal => {
        enter();
        await gate;
        expect(signal.aborted).toBe(true);
      });
      await entered;
      await sup.stop();
      release();
      await lease;
      expect(sup.status().services[0]).toMatchObject({ state: "stopped", restarts, pid: null });
    } finally {
      await sup.stop();
    }
  });

  test.skipIf(process.platform !== "win32")("pause closes the Windows Job containing descendants", async () => {
    using dir = tempDir("service-supervisor-pause-job", {});
    const sup = new ServiceSupervisor({
      signals: false,
      logDirectory: String(dir),
      env: bunEnv,
      services: [
        {
          id: "parent",
          command: [
            bunExe(),
            "-e",
            `const child=Bun.spawn({cmd:[process.execPath,"-e",${JSON.stringify(idle)}],stdin:"ignore",stdout:"ignore",stderr:"ignore"}); console.log(child.pid); ${idle}`,
          ],
        },
      ],
    });
    let descendant: number | undefined;
    try {
      await sup.start();
      descendant = await waitFor(() => {
        const path = join(String(dir), "parent.log");
        return existsSync(path) && Number(readFileSync(path, "utf8").trim());
      });
      expect(alive(descendant)).toBe(true);
      await sup.pause("parent");
      await waitFor(() => !alive(descendant!));
      expect(sup.status().services[0]).toMatchObject({ state: "paused", restarts: 0 });
    } finally {
      await sup.stop();
      if (descendant && alive(descendant)) process.kill(descendant, "SIGKILL");
    }
  });
});

describe("Supervisor", () => {
  test("restarts a crashing child with exponential backoff", async () => {
    const { sup, logs } = make({ backoff: { baseMs: 20, maxMs: 80 } });
    const child = sup.spawnSelf("crash", ["-e", "process.exit(3)"], { bun: true });
    await waitFor(() => child.restarts >= 4);
    await sup.drain();
    const delays = logs.map(l => /restart in (\d+) ms/.exec(l)?.[1]).filter(Boolean);
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
    const delays = logs.map(l => /restart in (\d+) ms/.exec(l)?.[1]).filter(Boolean);
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
    const gate = new Promise<void>(r => (release = r));
    sup.spawnSelf("a", ["-e", idle], { ready: () => gate });
    sup.spawnSelf("b", ["-e", idle]);
    let done = false;
    const p = sup.ready().then(() => (done = true));
    await Bun.sleep(50);
    expect(done).toBe(false);
    release();
    await p;
    expect(sup.children.map(c => c.state)).toEqual(["ready", "ready"]);
    await sup.drain();
  });

  test("drain stops inbound first, returns only when all children are dead", async () => {
    const order: string[] = [];
    const { sup } = make({
      onDrain: () => {
        order.push(`onDrain alive=${sup.children.every(c => c.pid !== undefined && alive(c.pid))}`);
      },
    });
    sup.spawnSelf("a", ["-e", idle]);
    sup.spawnSelf("b", ["-e", idle]);
    const pids = sup.children.map(c => c.pid!);
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
    expect(logs.some(l => l.includes("SIGKILL"))).toBe(true);
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
