import { closeSync, mkdirSync, openSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import type { RestartPolicy } from "./supervisor";

export interface ProcessJob {
  assign(pid: number): void;
  close(): void;
}

export interface ServiceDefinition {
  id: string;
  command: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  health?: string;
  restart?: RestartPolicy;
}

export interface ServiceSupervisorOptions {
  services: ServiceDefinition[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  /** Append stdout and stderr to <id>.log in this directory. Defaults to inherited streams. */
  logDirectory?: string;
  /** Optional atomic JSON status snapshot. */
  statusFile?: string;
  /** Loopback GET /health endpoint. Zero allocates a free port; unset disables it. */
  healthPort?: number;
  probeIntervalMs?: number;
  probeTimeoutMs?: number;
  drainMs?: number;
  backoff?: { baseMs?: number; maxMs?: number; stableMs?: number };
  signals?: boolean;
  /** Optional process-tree ownership provider, such as a Windows Job adapter. */
  createJob?: () => ProcessJob;
  log?: (event: ServiceEvent) => void;
}

export interface ServiceEvent {
  event: "started" | "launch-failed" | "restart-pending" | "probe-failed" | "shutdown-failed";
  service?: string;
  pid?: number;
  exit?: number | null;
  backoff?: number;
  error?: string;
}

export interface ServiceStatus {
  id: string;
  pid: number | null;
  healthy: boolean;
  restarts: number;
  lastExit: number | null;
  startedAt: string | null;
  state: "pending" | "running" | "backoff" | "paused" | "exited" | "stopped";
}

type Child = ReturnType<typeof Bun.spawn>;
interface Entry extends ServiceStatus {
  definition: ServiceDefinition;
  child?: Child;
  job?: ProcessJob;
}
interface Control {
  paused: boolean;
  interrupt: AbortController;
  operations: Promise<void>;
  wake?: () => void;
  acknowledge?: () => void;
}

function positive(value: number | undefined, fallback: number, name: string, zero = false): number {
  value ??= fallback;
  if (!Number.isFinite(value) || value < (zero ? 0 : 1)) throw new Error(`Invalid ${name}`);
  return value;
}

/** Supervises arbitrary commands without depending on a machine-specific service manifest. */
export class ServiceSupervisor {
  #options: ServiceSupervisorOptions;
  #entries: Entry[];
  #controls = new Map<Entry, Control>();
  #abort = new AbortController();
  #server?: ReturnType<typeof Bun.serve>;
  #runs: Promise<void>[] = [];
  #probe?: Promise<void>;
  #timer?: ReturnType<typeof setInterval>;
  #start?: Promise<void>;
  #stop?: Promise<void>;
  #signal = () => {
    void this.stop().catch(error => this.#log({ event: "shutdown-failed", error: String(error) }));
  };
  #probeInterval: number;
  #probeTimeout: number;
  #drainMs: number;
  #baseMs: number;
  #maxMs: number;
  #stableMs: number;

  constructor(options: ServiceSupervisorOptions) {
    if (!Array.isArray(options.services) || !options.services.length) throw new Error("Services must not be empty");
    const ids = new Set<string>();
    this.#entries = options.services.map(definition => {
      if (
        typeof definition.id !== "string" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(definition.id) ||
        /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(definition.id) ||
        ids.has(definition.id.toLowerCase())
      ) {
        throw new Error(`Invalid or duplicate service id: ${definition.id}`);
      }
      ids.add(definition.id.toLowerCase());
      if (
        !Array.isArray(definition.command) ||
        !definition.command.length ||
        definition.command.some(arg => typeof arg !== "string" || arg.includes("\0")) ||
        !definition.command[0]
      ) {
        throw new Error(`Invalid command: ${definition.id}`);
      }
      if (definition.restart !== undefined && !["always", "on-failure", "never"].includes(definition.restart)) {
        throw new Error(`Invalid restart policy: ${definition.id}`);
      }
      if (definition.health) {
        const url = new URL(definition.health);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error(`Invalid health URL: ${definition.id}`);
      }
      return {
        definition: { ...definition, command: [...definition.command], env: { ...definition.env } },
        id: definition.id,
        pid: null,
        healthy: false,
        restarts: 0,
        lastExit: null,
        startedAt: null,
        state: "pending",
      };
    });
    for (const entry of this.#entries)
      this.#controls.set(entry, {
        paused: false,
        interrupt: new AbortController(),
        operations: Promise.resolve(),
      });
    this.#options = { ...options, env: { ...options.env } };
    this.#probeInterval = positive(options.probeIntervalMs, 10_000, "probeIntervalMs");
    this.#probeTimeout = positive(options.probeTimeoutMs, 3000, "probeTimeoutMs");
    this.#drainMs = positive(options.drainMs, 15_000, "drainMs", true);
    this.#baseMs = positive(options.backoff?.baseMs, 1000, "baseMs");
    this.#maxMs = positive(options.backoff?.maxMs, 30_000, "maxMs");
    this.#stableMs = positive(options.backoff?.stableMs, 60_000, "stableMs", true);
    if (
      options.healthPort !== undefined &&
      (!Number.isInteger(options.healthPort) || options.healthPort < 0 || options.healthPort > 65535)
    ) {
      throw new Error("Invalid healthPort");
    }
  }

  get healthUrl(): string | undefined {
    return this.#server ? `http://127.0.0.1:${this.#server.port}/health` : undefined;
  }

  status() {
    return {
      observedAt: new Date().toISOString(),
      runtime: Bun.version,
      runtimeRevision: Bun.revision,
      ok: !this.#abort.signal.aborted && this.#entries.every(entry => entry.healthy),
      services: this.#entries.map(({ definition: _definition, child: _child, job: _job, ...status }) => status),
    };
  }

  start(): Promise<void> {
    if (this.#abort.signal.aborted) return Promise.reject(new Error("Supervisor is stopped"));
    return (this.#start ??= this.#initialize());
  }

  #entry(id: string): Entry {
    const entry = this.#entries.find(entry => entry.id === id);
    if (!entry) throw new Error(`Unknown service: ${id}`);
    return entry;
  }

  #operation<T>(entry: Entry, operation: () => Promise<T>): Promise<T> {
    const control = this.#controls.get(entry)!;
    const result = control.operations.then(operation);
    control.operations = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  /** Stops this service and its Windows Job before resolving; other services keep running. */
  async pause(id: string): Promise<void> {
    const entry = this.#entry(id);
    await this.start();
    return this.#operation(entry, () => this.#pause(entry));
  }

  async #pause(entry: Entry): Promise<void> {
    if (this.#abort.signal.aborted) throw new Error("Supervisor is stopped");
    const control = this.#controls.get(entry)!;
    if (control.paused) return;
    if (entry.state === "exited" || entry.state === "stopped")
      throw new Error(`Service is not supervised: ${entry.id}`);
    const acknowledged = new Promise<void>(done => {
      control.acknowledge = done;
    });
    control.paused = true;
    entry.healthy = false;
    control.interrupt.abort();
    try {
      await this.#terminate(entry);
      await acknowledged;
      if (this.#abort.signal.aborted) throw new Error("Supervisor is stopped");
      await this.#writeStatus();
    } finally {
      control.acknowledge = undefined;
    }
  }

  /** Resumes only a paused service. Explicit pauses do not increase its restart counter. */
  async resume(id: string): Promise<void> {
    const entry = this.#entry(id);
    await this.start();
    return this.#operation(entry, () => this.#resume(entry));
  }

  async #resume(entry: Entry): Promise<void> {
    if (this.#abort.signal.aborted) throw new Error("Supervisor is stopped");
    const control = this.#controls.get(entry)!;
    if (!control.paused) return;
    control.paused = false;
    control.wake?.();
    await this.#writeStatus();
  }

  /** Serializes a temporary lease and restores only a pause acquired by this call. */
  async withPaused<T>(id: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const entry = this.#entry(id);
    await this.start();
    return this.#operation(entry, async () => {
      const alreadyPaused = this.#controls.get(entry)!.paused;
      await this.#pause(entry);
      try {
        return await operation(this.#abort.signal);
      } finally {
        if (!alreadyPaused && !this.#abort.signal.aborted) await this.#resume(entry);
      }
    });
  }

  async #terminate(entry: Entry): Promise<void> {
    const child = entry.child;
    if (!child) return;
    try {
      child.kill("SIGTERM");
    } catch {}
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        child.exited,
        new Promise<void>(done => {
          timer = setTimeout(done, this.#drainMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    const job = entry.job;
    entry.job = undefined;
    try {
      job?.close();
    } catch {}
    if (child.exitCode === null) {
      try {
        child.kill("SIGKILL");
      } catch {}
    }
    await child.exited;
  }

  async #initialize(): Promise<void> {
    try {
      if (this.#abort.signal.aborted) return;
      let createJob = this.#options.createJob;
      if (!createJob && process.platform === "win32") {
        const specifier = "bun:windows";
        try {
          const { default: windows } = await import(specifier);
          createJob = () => new windows.Job({ killOnClose: true });
        } catch (error) {
          if (!(error instanceof Error) || !('code' in error) || error.code !== "ERR_MODULE_NOT_FOUND" || !error.message.includes(specifier)) throw error;
        }
      }
      if (this.#options.logDirectory) mkdirSync(this.#options.logDirectory, { recursive: true });
      if (this.#options.healthPort !== undefined) {
        this.#server = Bun.serve({
          hostname: "127.0.0.1",
          port: this.#options.healthPort,
          fetch: (request, server) => {
            const url = new URL(request.url);
            const origin = request.headers.get("origin");
            if (
              url.hostname !== "127.0.0.1" ||
              Number(url.port || 80) !== server.port ||
              (origin !== null && origin !== url.origin) ||
              request.headers.get("sec-fetch-site") === "cross-site"
            ) {
              return new Response("Host access refused", { status: 403 });
            }
            if (url.pathname !== "/health") return new Response("Not found", { status: 404 });
            if (request.method !== "GET" && request.method !== "HEAD") {
              return new Response("Method not allowed", {
                status: 405,
                headers: { Allow: "GET, HEAD" },
              });
            }
            const status = this.status();
            return Response.json(status, {
              status: status.ok ? 200 : 503,
              headers: { "Cache-Control": "no-store" },
            });
          },
        });
      }
      if (this.#options.signals !== false) {
        process.on("SIGINT", this.#signal);
        process.on("SIGTERM", this.#signal);
      }
      this.#runs = this.#entries.map(entry => this.#supervise(entry, createJob));
      this.#timer = setInterval(() => {
        void this.probe().catch(error => this.#log({ event: "probe-failed", error: String(error) }));
      }, this.#probeInterval);
      await this.probe();
    } catch (error) {
      this.#abort.abort();
      await this.#shutdown(false).catch(() => {});
      throw error;
    }
  }

  #log(event: ServiceEvent): void {
    try {
      this.#options.log?.(event);
    } catch {
      /* Observers cannot change process ownership. */
    }
  }

  async #supervise(entry: Entry, createJob: (() => ProcessJob) | undefined): Promise<void> {
    let failures = 0;
    const control = this.#controls.get(entry)!;
    while (!this.#abort.signal.aborted) {
      if (control.paused) {
        entry.state = "paused";
        control.acknowledge?.();
        await new Promise<void>(done => {
          const wake = () => {
            this.#abort.signal.removeEventListener("abort", wake);
            control.wake = undefined;
            done();
          };
          control.wake = wake;
          this.#abort.signal.addEventListener("abort", wake, { once: true });
          if (this.#abort.signal.aborted || !control.paused) wake();
        });
        continue;
      }
      control.interrupt = new AbortController();
      let fd: number | undefined;
      let child: Child | undefined;
      const started = Date.now();
      try {
        if (this.#options.logDirectory) fd = openSync(resolve(this.#options.logDirectory, `${entry.id}.log`), "a");
        if (createJob) entry.job = createJob();
        child = Bun.spawn({
          cmd: entry.definition.command,
          cwd: entry.definition.cwd ?? this.#options.cwd,
          env: { ...process.env, ...this.#options.env, ...entry.definition.env },
          stdin: "ignore",
          stdout: fd ?? "inherit",
          stderr: fd ?? "inherit",
        });
        entry.child = child;
        entry.job?.assign(child.pid);
        entry.pid = child.pid;
        entry.state = "running";
        entry.startedAt = new Date().toISOString();
        entry.healthy = !entry.definition.health;
        this.#log({ event: "started", service: entry.id, pid: child.pid });
        entry.lastExit = await child.exited;
      } catch (error) {
        if (child) {
          try {
            child.kill("SIGKILL");
          } catch {}
          entry.lastExit = await child.exited;
        } else {
          entry.lastExit = -1;
        }
        this.#log({ event: "launch-failed", service: entry.id, error: String(error) });
      } finally {
        entry.pid = null;
        entry.healthy = false;
        entry.child = undefined;
        try {
          entry.job?.close();
        } finally {
          entry.job = undefined;
          if (fd !== undefined) closeSync(fd);
        }
      }
      if (this.#abort.signal.aborted) break;
      if (control.paused) continue;
      const policy = entry.definition.restart ?? "always";
      if (policy === "never" || (policy === "on-failure" && entry.lastExit === 0)) {
        entry.state = "exited";
        return;
      }
      if (Date.now() - started >= this.#stableMs) failures = 0;
      const backoff = Math.min(this.#maxMs, this.#baseMs * 2 ** Math.min(failures++, 30));
      entry.restarts++;
      entry.state = "backoff";
      this.#log({ event: "restart-pending", service: entry.id, exit: entry.lastExit, backoff });
      await new Promise<void>(resolveWait => {
        const done = () => {
          clearTimeout(timer);
          this.#abort.signal.removeEventListener("abort", done);
          control.interrupt.signal.removeEventListener("abort", done);
          resolveWait();
        };
        const timer = setTimeout(done, backoff);
        this.#abort.signal.addEventListener("abort", done, { once: true });
        control.interrupt.signal.addEventListener("abort", done, { once: true });
        if (this.#abort.signal.aborted || control.interrupt.signal.aborted) done();
      });
    }
    entry.state = "stopped";
    control.acknowledge?.();
  }

  probe(): Promise<void> {
    if (this.#abort.signal.aborted) return Promise.resolve();
    return (this.#probe ??= this.#probeHealth().finally(() => {
      this.#probe = undefined;
    }));
  }

  async #probeHealth(): Promise<void> {
    await Promise.all(
      this.#entries.map(async entry => {
        const child = entry.child;
        if (!child || !entry.definition.health) return;
        let healthy = false;
        try {
          const response = await fetch(entry.definition.health, {
            signal: AbortSignal.any([
              this.#abort.signal,
              this.#controls.get(entry)!.interrupt.signal,
              AbortSignal.timeout(this.#probeTimeout),
            ]),
          });
          healthy = response.ok;
          await response.body?.cancel();
        } catch {
          healthy = false;
        }
        if (entry.child === child && !this.#abort.signal.aborted && !this.#controls.get(entry)!.paused)
          entry.healthy = healthy;
      }),
    );
    await this.#writeStatus();
  }

  async #writeStatus(): Promise<void> {
    if (!this.#options.statusFile) return;
    const file = resolve(this.#options.statusFile);
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await Bun.write(temporary, JSON.stringify(this.status(), null, 2) + "\n");
      renameSync(temporary, file);
    } finally {
      await Bun.file(temporary)
        .delete()
        .catch(() => {});
    }
  }

  stop(): Promise<void> {
    return (this.#stop ??= this.#shutdown());
  }

  async #shutdown(waitForStart = true): Promise<void> {
    this.#abort.abort();
    if (waitForStart) await this.#start?.catch(() => {});
    clearInterval(this.#timer);
    process.off("SIGINT", this.#signal);
    process.off("SIGTERM", this.#signal);
    await this.#server?.stop(true);
    this.#server = undefined;
    const children = this.#entries.flatMap(entry => (entry.child ? [entry.child] : []));
    for (const child of children) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(children.map(child => child.exited)),
        new Promise<void>(done => {
          timer = setTimeout(done, this.#drainMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    for (const entry of this.#entries) {
      const job = entry.job;
      entry.job = undefined;
      try {
        job?.close();
      } catch {}
    }
    for (const child of children) {
      if (child.exitCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {}
      }
    }
    await Promise.all(this.#runs);
    await this.#probe;
    for (const entry of this.#entries) {
      entry.state = "stopped";
      entry.healthy = false;
    }
    if (waitForStart) await this.#writeStatus();
  }
}
