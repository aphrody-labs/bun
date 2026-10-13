// SPDX-License-Identifier: MIT
import { constants, cpus, freemem, totalmem, uptime } from "node:os";
import { hostTarget } from "./target.ts";

export interface SystemStats {
  readonly os: string;
  readonly arch: string;
  readonly timestamp_ms: number;
  readonly uptimeSeconds: number;
  readonly totalMemoryBytes: number;
  readonly freeMemoryBytes: number;
  readonly cpuCores: number;
}

export const system = {
  stats(): SystemStats {
    return {
      os: process.platform,
      arch: process.arch,
      timestamp_ms: Date.now(),
      uptimeSeconds: Math.floor(uptime()),
      totalMemoryBytes: totalmem(),
      freeMemoryBytes: freemem(),
      cpuCores: cpus().length,
    };
  },
  info() {
    return {
      name: "bun",
      version: Bun.version,
      revision: Bun.revision,
      target: hostTarget(),
      executable: process.execPath,
    };
  },
  capabilities(): string[] {
    return ["system.stats", "process.supervise", "http.probe"];
  },
};

export interface SpawnOptions {
  readonly program: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  readonly stdio?: "inherit" | "null" | "capture" | "capture-lossless";
  readonly maxOutputBytes?: number;
}

export interface ProcessStatus {
  readonly running: boolean;
  readonly exitCode: number;
  readonly signal: number;
  readonly pid: number;
}

export interface ProcessOutput {
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly status: ProcessStatus;
}

export class ProcessExitedError extends Error {
  constructor(readonly status: ProcessStatus) {
    super(`process ${status.pid} exited before readiness (code ${status.exitCode}, signal ${status.signal})`);
    this.name = "ProcessExitedError";
  }
}

const owned = new Set<ManagedProcess>();
process.once("exit", () => {
  for (const child of owned) child.release();
});

export class ManagedProcess implements Disposable, AsyncDisposable {
  readonly pid: number;
  #child: Bun.Subprocess<"ignore", "pipe" | "inherit" | "ignore", "pipe" | "inherit" | "ignore">;
  #job?: import("bun:windows").Job;
  #failure?: unknown;
  #chunks: Uint8Array[][] = [[], []];
  #sizes = [0, 0];
  #totals = [0, 0];
  #complete = false;
  #released = false;
  #drained: Promise<void>;
  #collection?: Promise<ProcessOutput>;
  #changes = new Set<() => void>();

  constructor(options: SpawnOptions) {
    if (!options.program || options.program.includes("\0"))
      throw new TypeError("program must be a nonempty executable path");
    const lossless = options.stdio === "capture-lossless";
    const budget = options.maxOutputBytes ?? 64 * 1024 * 1024;
    if (
      !Number.isInteger(budget) ||
      budget < 1 ||
      budget > 64 * 1024 * 1024 ||
      (options.maxOutputBytes !== undefined && !lossless)
    )
      throw new RangeError("maxOutputBytes requires lossless capture and must be 1..64 MiB");
    const capture = lossless || options.stdio === "capture";
    const output: "pipe" | "ignore" | "inherit" = capture ? "pipe" : options.stdio === "null" ? "ignore" : "inherit";
    const spawnOptions = {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdin: "ignore" as const,
      stdout: output,
      stderr: output,
      windowsHide: true,
      detached: process.platform !== "win32",
    };
    try {
      if (process.platform === "win32") {
        const { Job } = require("bun:windows") as typeof import("bun:windows");
        this.#job = new Job({ killOnClose: true });
        this.#child = this.#job.spawn([options.program, ...(options.args ?? [])], spawnOptions);
      } else this.#child = Bun.spawn([options.program, ...(options.args ?? [])], spawnOptions);
    } catch (error) {
      this.#job?.close();
      throw error;
    }
    this.pid = this.#child.pid;
    owned.add(this);
    void this.#child.exited.then(() => this.#notify());
    const drain = async (stream: ReadableStream<Uint8Array>, index: number) => {
      const reader = stream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          this.#chunks[index]!.push(value.slice());
          this.#sizes[index]! += value.length;
          this.#totals[index]! += value.length;
          this.#notify();
          if (lossless && this.#totals[index]! > budget)
            throw new RangeError("Captured process output exceeds its byte budget");
          if (!lossless) {
            while (this.#sizes[index]! > 64 * 1024) {
              const first = this.#chunks[index]![0]!;
              const remove = Math.min(first.length, this.#sizes[index]! - 64 * 1024);
              if (remove === first.length) this.#chunks[index]!.shift();
              else this.#chunks[index]![0] = first.slice(remove);
              this.#sizes[index]! -= remove;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    };
    this.#drained = (
      capture
        ? Promise.all([
            drain(this.#child.stdout as ReadableStream<Uint8Array>, 0),
            drain(this.#child.stderr as ReadableStream<Uint8Array>, 1),
          ])
        : Promise.resolve()
    )
      .then(() => {
        this.#complete = true;
        this.#notify();
      })
      .catch(error => {
        this.#failure = error;
        this.#terminate();
        this.#notify();
      });
  }

  #terminate(): void {
    if (this.#job && !this.#job.closed) this.#job.terminate();
    else if (process.platform !== "win32") {
      try {
        process.kill(-this.pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") this.#child.kill("SIGKILL");
      }
    } else this.#child.kill("SIGKILL");
  }

  #notify(): void {
    for (const wake of this.#changes) wake();
    this.#changes.clear();
  }

  #changed(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.#changes.delete(wake);
        signal.removeEventListener("abort", abort);
      };
      const wake = () => {
        cleanup();
        resolve();
      };
      const abort = () => {
        cleanup();
        reject(signal.reason);
      };
      this.#changes.add(wake);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }

  status(): ProcessStatus {
    const signal = this.#child.signalCode;
    return {
      running: this.#child.exitCode === null && signal === null,
      exitCode: signal ? -1 : (this.#child.exitCode ?? 0),
      signal: typeof signal === "number" ? signal : signal ? (constants.signals[signal] ?? 0) : 0,
      pid: this.pid,
    };
  }

  #take(index: number): Uint8Array {
    const result = new Uint8Array(this.#sizes[index]!);
    let offset = 0;
    for (const chunk of this.#chunks[index]!) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    this.#chunks[index] = [];
    this.#sizes[index] = 0;
    return result;
  }
  takeStdoutBytes(): Uint8Array {
    return this.#take(0);
  }
  takeStderrBytes(): Uint8Array {
    return this.#take(1);
  }
  takeStdout(): string {
    return new TextDecoder().decode(this.takeStdoutBytes());
  }
  takeStderr(): string {
    return new TextDecoder().decode(this.takeStderrBytes());
  }
  outputComplete(): boolean {
    return this.#complete;
  }
  stderrTail(maxBytes = 8192): string {
    if (!Number.isInteger(maxBytes) || maxBytes < 0) throw new RangeError("maxBytes must be a nonnegative integer");
    const bytes = new Uint8Array(this.#sizes[1]!);
    let offset = 0;
    for (const chunk of this.#chunks[1]!) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - maxBytes)));
  }

  async waitForStdoutLine(
    options: { timeoutMs?: number; signal?: AbortSignal; pollMs?: number } = {},
  ): Promise<string> {
    const timeout = options.timeoutMs ?? 10_000;
    if (!Number.isInteger(timeout) || timeout <= 0) throw new RangeError("timeoutMs must be a positive integer");
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)])
      : AbortSignal.timeout(timeout);
    const decoder = new TextDecoder();
    let text = "";
    try {
      for (;;) {
        signal.throwIfAborted();
        if (this.#failure) throw this.#failure;
        text += decoder.decode(this.takeStdoutBytes(), { stream: !this.#complete });
        const newline = text.indexOf("\n");
        if (newline >= 0) return text.slice(0, newline).trim();
        if (!this.status().running && this.#complete) throw new ProcessExitedError(this.status());
        await this.#changed(signal);
      }
    } catch (error) {
      await this.stopAsync();
      throw error;
    }
  }

  async waitForExit(options: { signal?: AbortSignal; pollMs?: number } = {}): Promise<number> {
    const signal = options.signal;
    const abort = () => this.#terminate();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      signal?.throwIfAborted();
      const code = await this.#child.exited;
      signal?.throwIfAborted();
      return code;
    } catch (error) {
      await this.stopAsync();
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  collectOutput(
    options: { timeoutMs?: number; signal?: AbortSignal; onStderr?: (bytes: Uint8Array) => void } = {},
  ): Promise<ProcessOutput> {
    if (this.#collection) return this.#collection;
    const timeout = options.timeoutMs ?? 30_000;
    if (!Number.isInteger(timeout) || timeout <= 0) throw new RangeError("timeoutMs must be a positive integer");
    this.#collection = (async () => {
      const signal = options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout);
      const abort = () => this.#terminate();
      signal.addEventListener("abort", abort, { once: true });
      try {
        signal.throwIfAborted();
        await this.#child.exited;
        await this.#drained;
        signal.throwIfAborted();
        if (this.#failure) throw this.#failure;
        const stderr = this.takeStderrBytes();
        options.onStderr?.(stderr);
        return { stdout: this.takeStdoutBytes(), stderr, status: this.status() };
      } finally {
        signal.removeEventListener("abort", abort);
        this.release();
        await this.#child.exited;
        await this.#drained;
      }
    })();
    return this.#collection;
  }

  async stopAsync(): Promise<ProcessStatus> {
    if (!this.#released) this.#terminate();
    await this.#child.exited;
    await this.#drained;
    return this.status();
  }
  release(): void {
    if (this.#released) return;
    this.#released = true;
    this.#terminate();
    this.#job?.close();
    owned.delete(this);
  }
  [Symbol.dispose](): void {
    this.release();
  }
  async [Symbol.asyncDispose](): Promise<void> {
    await this.stopAsync();
    this.release();
  }
}

export const processes = {
  spawn(options: SpawnOptions): ManagedProcess {
    return new ManagedProcess(options);
  },
  async probeHttp(host: string, port: number, path = "/", timeoutMs = 500): Promise<number | undefined> {
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(timeoutMs) || timeoutMs <= 0)
      throw new RangeError("Invalid HTTP probe port or timeout");
    const hostname = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
    const origin = new URL(`http://${hostname}:${port}/`);
    const url = new URL(path, origin);
    if (url.origin !== origin.origin || url.username || url.password)
      throw new TypeError("HTTP probe path must remain within its selected host");
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      await response.body?.cancel();
      return response.status;
    } catch {
      return undefined;
    }
  },
};
