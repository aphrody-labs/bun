import { readFileSync } from "node:fs";
import type { Budget } from "./budget";
import type { ChildMessage, ParentMessage } from "./child";
import { notifyReady, notifyStopping, notifyStatus, startWatchdog } from "./notify";
import type { PressureMonitor } from "./pressure";

export type RestartPolicy = "always" | "on-failure" | "never";
export type ChildState = "starting" | "ready" | "backoff" | "exited" | "stopped";

export interface SpawnSelfOptions {
  /** Share of the supervisor budget, relative to the other children. Default 1. */
  weight?: number;
  min?: number;
  max?: number;
  env?: Record<string, string>;
  restart?: RestartPolicy;
  /** IPC channel for budget, shrink and memory messages. Default true. */
  ipc?: boolean;
  /** Resolves when the child can serve. Without it the child is ready once spawned, or on `{type:"ready"}`. */
  ready?: (child: SupervisedChild) => Promise<void>;
  /** Run `args` as a Bun CLI (`BUN_BE_BUN=1`) instead of the compiled program's own argv. */
  bun?: boolean;
  /** Pass BUN_JSC_forceRAMSize and BUN_JSC_gcMaxHeapSize from the budget. Default true. */
  jsc?: boolean;
  cwd?: string;
}

export interface SupervisorOptions {
  name: string;
  budget: Budget;
  /** Loopback port for `GET /healthz`. 0 picks a free port. Unset disables the server. */
  healthPort?: number;
  /** Extra health check for the watchdog and `/healthz`. */
  healthHandler?: () => boolean | Promise<boolean>;
  /** Stops inbound work (listeners, queues) before children receive SIGTERM. */
  onDrain?: () => void | Promise<void>;
  drainMs?: number;
  backoff?: { baseMs?: number; maxMs?: number; stableMs?: number };
  pressure?: PressureMonitor;
  /** Handle SIGTERM and SIGINT. Default true. */
  signals?: boolean;
  /** Exit the process after a signal-triggered drain. Default true. */
  exitOnSignal?: boolean;
  log?: (message: string) => void;
}

export interface SupervisedChild {
  readonly name: string;
  readonly args: readonly string[];
  readonly budget: Budget;
  readonly pid: number | undefined;
  readonly state: ChildState;
  readonly restarts: number;
  readonly lastMem: { rss: number; heapUsed: number; at: number } | undefined;
  send(msg: ParentMessage): boolean;
}

interface Entry extends SupervisedChild {
  spec: SpawnSelfOptions;
  proc: ReturnType<typeof Bun.spawn> | undefined;
  startedAt: number;
  failures: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  readyP: Promise<void>;
  markReady: () => void;
  offs: Array<() => void>;
  pid: number | undefined;
  state: ChildState;
  restarts: number;
  lastMem: { rss: number; heapUsed: number; at: number } | undefined;
}

const STRIPPED = ["NOTIFY_SOCKET", "WATCHDOG_USEC", "WATCHDOG_PID"];

export class Supervisor {
  readonly name: string;
  readonly budget: Budget;
  #opts: SupervisorOptions;
  #entries: Entry[] = [];
  #startedAt = Date.now();
  #draining = false;
  #drainP: Promise<void> | undefined;
  #server: ReturnType<typeof Bun.serve> | undefined;
  #stopWatchdog: (() => void) | undefined;
  #signalHandler: (() => void) | undefined;
  #log: (message: string) => void;

  constructor(opts: SupervisorOptions) {
    this.name = opts.name;
    this.budget = opts.budget;
    this.#opts = opts;
    this.#log = opts.log ?? ((m) => console.error(`[supervisor ${opts.name}] ${m}`));
  }

  get children(): readonly SupervisedChild[] {
    return this.#entries;
  }
  get draining(): boolean {
    return this.#draining;
  }
  /** URL of the health server, when started. */
  get healthUrl(): string | undefined {
    return this.#server ? `http://127.0.0.1:${this.#server.port}/healthz` : undefined;
  }

  /** Starts the same executable again as a supervised child. */
  spawnSelf(name: string, args: string[], spec: SpawnSelfOptions = {}): SupervisedChild {
    if (this.#draining) throw new Error("supervisor is draining");
    const budget = this.budget.child(name, { weight: spec.weight, min: spec.min, max: spec.max });
    let markReady!: () => void;
    const e: Entry = {
      name,
      args,
      budget,
      spec,
      proc: undefined,
      startedAt: 0,
      failures: 0,
      timer: undefined,
      readyP: undefined as unknown as Promise<void>,
      markReady,
      offs: [],
      pid: undefined,
      state: "starting",
      restarts: 0,
      lastMem: undefined,
      send: (msg) => this.#send(e, msg),
    };
    e.offs.push(
      budget.onResize((bytes) => void e.send({ type: "budget", bytes })),
      budget.onShrink((level) => void e.send({ type: "shrink", level })),
      budget.onIdle(() => void e.send({ type: "idle" })),
    );
    this.#entries.push(e);
    this.#launch(e);
    return e;
  }

  /** Tells systemd the service is ready once every child is ready. */
  async ready(status = "ready"): Promise<void> {
    for (;;) {
      const waiting = this.#entries.map((e) => e.readyP);
      await Promise.all(waiting);
      if (this.#entries.every((e, i) => e.readyP === waiting[i])) break;
    }
    if (!this.#draining) notifyReady(status);
  }

  /** Health server, watchdog and signal handlers. */
  start(): void {
    if (this.#opts.healthPort !== undefined && !this.#server) {
      this.#server = Bun.serve({
        hostname: "127.0.0.1",
        port: this.#opts.healthPort,
        fetch: async (req) => {
          if (new URL(req.url).pathname !== "/healthz")
            return new Response("not found", { status: 404 });
          const healthy = await this.healthy();
          return Response.json(await this.status(healthy), { status: healthy ? 200 : 503 });
        },
      });
    }
    this.#stopWatchdog ??= startWatchdog({ health: () => this.healthy() });
    if (this.#opts.signals !== false && !this.#signalHandler) {
      this.#signalHandler = () => {
        void this.drain().then(() => {
          if (this.#opts.exitOnSignal !== false) process.exit(0);
        });
      };
      process.on("SIGTERM", this.#signalHandler);
      process.on("SIGINT", this.#signalHandler);
    }
  }

  async healthy(): Promise<boolean> {
    if (!this.#draining) {
      for (const e of this.#entries) {
        const ok =
          e.state === "starting" ||
          e.state === "ready" ||
          (e.state === "exited" && e.spec.restart === "never");
        if (!ok) return false;
      }
    }
    try {
      return (await this.#opts.healthHandler?.()) ?? true;
    } catch {
      return false;
    }
  }

  async status(healthy?: boolean) {
    healthy ??= await this.healthy();
    return {
      name: this.name,
      status: this.#draining ? "draining" : healthy ? "ok" : "degraded",
      uptime: Math.floor((Date.now() - this.#startedAt) / 1000),
      pid: process.pid,
      rss: process.memoryUsage().rss,
      pressure: this.#opts.pressure?.level(),
      children: this.#entries.map((e) => ({
        name: e.name,
        state: e.state,
        pid: e.pid,
        restarts: e.restarts,
        rss: (e.pid !== undefined ? this.rssOf(e.pid) : undefined) ?? e.lastMem?.rss,
        budget: e.budget.bytes,
      })),
      budget: this.budget.tree(),
    };
  }

  /** Resident set size of `pid` in bytes, from /proc/<pid>/status. Undefined off Linux. */
  rssOf(pid: number): number | undefined {
    if (process.platform !== "linux") return undefined;
    try {
      const m = /^VmRSS:\s+(\d+)\s+kB/m.exec(readFileSync(`/proc/${pid}/status`, "utf8"));
      return m ? Number(m[1]) * 1024 : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Stops inbound work, sends SIGTERM to the children in reverse launch order, waits up to `drainMs`,
   * then SIGKILL. Resolves only when every child has exited.
   */
  drain(): Promise<void> {
    return (this.#drainP ??= this.#drain());
  }

  async #drain(): Promise<void> {
    this.#draining = true;
    notifyStopping();
    try {
      await this.#opts.onDrain?.();
    } catch (err) {
      this.#log(`onDrain failed: ${err}`);
    }
    const drainMs = this.#opts.drainMs ?? 15_000;
    for (const e of this.#entries) {
      if (e.timer) clearTimeout(e.timer);
      e.timer = undefined;
    }
    const live = [...this.#entries]
      .reverse()
      .filter((e) => e.proc)
      .map((e) => ({ e, proc: e.proc! }));
    for (const { proc } of live) {
      try {
        proc.kill("SIGTERM");
      } catch {}
    }
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">(
      (r) => (deadline = setTimeout(() => r("timeout"), drainMs)),
    );
    for (const { e, proc } of live) {
      if ((await Promise.race([proc.exited, timeout])) === "timeout") {
        this.#log(`${e.name} ignored SIGTERM for ${drainMs} ms, sending SIGKILL`);
        try {
          proc.kill("SIGKILL");
        } catch {}
        await proc.exited;
      }
    }
    clearTimeout(deadline);
    for (const e of this.#entries) {
      e.state = "stopped";
      e.pid = undefined;
      for (const off of e.offs) off();
    }
    this.#stopWatchdog?.();
    this.#stopWatchdog = undefined;
    if (this.#signalHandler) {
      process.off("SIGTERM", this.#signalHandler);
      process.off("SIGINT", this.#signalHandler);
      this.#signalHandler = undefined;
    }
    await this.#server?.stop(true);
    this.#server = undefined;
  }

  #send(e: Entry, msg: ParentMessage): boolean {
    const proc = e.proc as { send?: (m: unknown) => void } | undefined;
    if (!proc?.send || e.spec.ipc === false) return false;
    try {
      proc.send(msg);
      return true;
    } catch {
      return false;
    }
  }

  #launch(e: Entry): void {
    e.timer = undefined;
    e.state = "starting";
    e.readyP = new Promise<void>((r) => (e.markReady = r));
    const bytes = e.budget.bytes;
    const env: Record<string, string | undefined> = { ...process.env };
    for (const k of STRIPPED) delete env[k];
    env.SUPERVISOR_NAME = e.name;
    env.SUPERVISOR_BUDGET_BYTES = String(bytes);
    if (e.spec.jsc !== false && bytes > 0) {
      env.BUN_JSC_forceRAMSize = String(bytes);
      env.BUN_JSC_gcMaxHeapSize = String(Math.floor(bytes * 0.75));
    }
    if (e.spec.bun) env.BUN_BE_BUN = "1";
    Object.assign(env, e.spec.env);

    const proc = Bun.spawn({
      cmd: [process.execPath, ...e.args],
      cwd: e.spec.cwd,
      env,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
      ipc:
        e.spec.ipc === false
          ? undefined
          : (msg: ChildMessage) => {
              if (msg?.type === "mem")
                e.lastMem = { rss: msg.rss, heapUsed: msg.heapUsed, at: Date.now() };
              else if (msg?.type === "ready") this.#markReady(e, proc);
            },
      onExit: (p, code, signal) => this.#exited(e, p, code, signal),
    });
    e.proc = proc;
    e.pid = proc.pid;
    e.startedAt = Date.now();
    if (e.spec.ready) {
      e.spec.ready(e).then(
        () => this.#markReady(e, proc),
        (err) => {
          this.#log(`${e.name} readiness failed: ${err}`);
          try {
            proc.kill("SIGKILL");
          } catch {}
        },
      );
    } else {
      this.#markReady(e, proc);
    }
  }

  #markReady(e: Entry, proc: unknown): void {
    if (e.proc !== proc || e.state !== "starting") return;
    e.state = "ready";
    e.markReady();
  }

  #exited(e: Entry, proc: unknown, code: number | null, signal: unknown): void {
    if (e.proc !== proc) return;
    e.proc = undefined;
    e.pid = undefined;
    if (this.#draining) return;
    const policy = e.spec.restart ?? "always";
    const restart = policy === "always" || (policy === "on-failure" && code !== 0);
    if (!restart) {
      e.state = "exited";
      this.#log(`${e.name} exited (code ${code}, signal ${signal}), not restarting`);
      return;
    }
    const { baseMs = 1000, maxMs = 30_000, stableMs = 60_000 } = this.#opts.backoff ?? {};
    if (Date.now() - e.startedAt >= stableMs) e.failures = 0;
    const delay = Math.min(maxMs, baseMs * 2 ** e.failures);
    e.failures++;
    e.restarts++;
    e.state = "backoff";
    this.#log(`${e.name} exited (code ${code}, signal ${signal}), restart in ${delay} ms`);
    notifyStatus(`${e.name} restarting`);
    e.timer = setTimeout(() => this.#launch(e), delay);
  }
}
