#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import { frame, mapURIs, originalURI, readMessages, virtualURI, type Message } from "./protocol.ts";

export type Backend = "typescript" | "python" | "ruff";
export interface LSPConfig {
  root: string;
  typescript?: string[];
  python?: string[];
  ruff?: string[];
  requestTimeoutMs?: number;
  maxMessageBytes?: number;
  maxPending?: number;
}
type Reply = { resolve: (message: Message) => void; reject: (reason: unknown) => void; cleanup: () => void };

function command(value: unknown, name: string): string[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || !value.length || value.length > 64 || value.some(arg => typeof arg !== "string" || !arg.length || arg.includes("\0"))) throw new TypeError(`invalid ${name} command`);
  const executable = Bun.which(value[0]) ?? (Bun.file(resolve(value[0])).size ? resolve(value[0]) : undefined);
  if (!executable) throw new Error(`${name} native executable is unavailable`);
  return [executable, ...value.slice(1)];
}

export function configuration(value: Partial<LSPConfig> = {}, env = process.env): LSPConfig {
  const fromEnv = (key: string) => env[key] ? JSON.parse(env[key]!) : undefined;
  const ts = Bun.which("tsgo");
  const ty = Bun.which("ty");
  const ruff = Bun.which("ruff");
  const integer = (n: number, min: number, max: number) => { if (!Number.isSafeInteger(n) || n < min || n > max) throw new RangeError("invalid LSP limit"); return n; };
  return {
    root: resolve(value.root ?? process.cwd()),
    typescript: command(value.typescript ?? fromEnv("BUV_TS_LSP_COMMAND") ?? (ts ? [ts, "--lsp", "-stdio"] : undefined), "TypeScript"),
    python: command(value.python ?? fromEnv("BUV_PYTHON_LSP_COMMAND") ?? (ty ? [ty, "server"] : undefined), "Python"),
    ruff: command(value.ruff ?? fromEnv("BUV_RUFF_LSP_COMMAND") ?? (ruff ? [ruff, "server"] : undefined), "Ruff"),
    requestTimeoutMs: integer(value.requestTimeoutMs ?? 30000, 1, 300000),
    maxMessageBytes: integer(value.maxMessageBytes ?? 8 * 1024 * 1024, 1, 64 * 1024 * 1024),
    maxPending: integer(value.maxPending ?? 256, 1, 4096),
  };
}

export class NativePeer {
  readonly kind: Backend;
  readonly process: Bun.Subprocess<"pipe", "pipe", "pipe">;
  readonly #pending = new Map<number, Reply>();
  readonly #config: LSPConfig;
  #sequence = 0;
  #writes: Promise<void> = Promise.resolve();
  #closed = false;
  readonly done: Promise<void>;

  constructor(kind: Backend, argv: string[], config: LSPConfig, onMessage: (message: Message) => Promise<void> = async () => {}) {
    this.kind = kind;
    this.#config = config;
    this.process = Bun.spawn({ cmd: argv, cwd: config.root, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    const drain = (async () => { for await (const _ of this.process.stderr) {} })();
    this.done = (async () => {
      try {
        for await (const message of readMessages(this.process.stdout, config.maxMessageBytes)) {
          if (message.method === undefined && typeof message.id === "number" && this.#pending.has(message.id)) {
            const reply = this.#pending.get(message.id)!;
            this.#pending.delete(message.id);
            reply.cleanup();
            reply.resolve(message);
          } else await onMessage(message);
        }
      } finally {
        this.#closed = true;
        for (const reply of this.#pending.values()) { reply.cleanup(); reply.reject(new Error(`${kind} server exited`)); }
        this.#pending.clear();
        await drain;
      }
    })();
    void this.done.catch(() => {});
  }

  send(message: Message): Promise<void> {
    this.#writes = this.#writes.then(async () => {
      if (this.#closed) throw new Error(`${this.kind} server is closed`);
      this.process.stdin.write(frame(message, this.#config.maxMessageBytes));
      await this.process.stdin.flush();
    });
    return this.#writes;
  }

  async request(method: string, params?: unknown, signal?: AbortSignal): Promise<Message> {
    signal?.throwIfAborted();
    if (this.#pending.size >= (this.#config.maxPending ?? 256)) throw new Error("native LSP pending request limit reached");
    const id = ++this.#sequence;
    return new Promise<Message>((resolveReply, reject) => {
      const remove = () => { clearTimeout(timeout); signal?.removeEventListener("abort", abort); this.#pending.delete(id); };
      const cancel = (reason: unknown) => { remove(); void this.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } }).catch(() => {}); reject(reason); };
      const abort = () => cancel(signal?.reason ?? new DOMException("Request aborted", "AbortError"));
      const timeout = setTimeout(() => cancel(new Error(`${this.kind} LSP request timed out`)), this.#config.requestTimeoutMs ?? 30000);
      this.#pending.set(id, { resolve: resolveReply, reject, cleanup: remove });
      signal?.addEventListener("abort", abort, { once: true });
      void this.send({ jsonrpc: "2.0", id, method, params }).catch(error => { remove(); reject(error); });
    });
  }

  async close(): Promise<void> {
    if (this.process.exitCode === null) this.process.kill();
    try { await this.process.stdin.end(); } catch {}
    await this.process.exited;
    await this.done.catch(() => {});
  }
}

export async function serveLSP(config: LSPConfig, input: ReadableStream<Uint8Array>, output: (message: Message) => Promise<void>, signal?: AbortSignal): Promise<void> {
  const peers = new Map<Backend, NativePeer>();
  const requests = new Map<string, AbortController>();
  const serverRequests = new Map<string, { peer: NativePeer; id: Message["id"] }>();
  const tasks = new Set<Promise<void>>();
  const opened = new Map<string, Backend>();
  let ready = false;
  let stopped = false;
  let serverSequence = 0;
  const key = (id: Message["id"]) => `${typeof id}:${id}`;
  const peerFor = (params: any): NativePeer | undefined => {
    const uri = params?.textDocument?.uri;
    if (typeof uri === "string" && /\.py(?:\?|$)/.test(uri)) return peers.get("python") ?? peers.get("ruff");
    return peers.get("typescript");
  };
  const reply = (id: Message["id"], code: number, message: string) => output({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  const onBackend = (peer: NativePeer, message: Message) => {
    if (message.method && message.id !== undefined) {
      if (serverRequests.size >= (config.maxPending ?? 256)) return peer.send({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "server request limit reached" } });
      const id = `buv-server:${peer.kind}:${++serverSequence}`;
      serverRequests.set(id, { peer, id: message.id });
      return output(mapURIs({ ...message, id }, originalURI));
    }
    return output(mapURIs(message, originalURI));
  };
  for (const kind of ["typescript", "python", "ruff"] as const) {
    const argv = config[kind];
    if (argv) {
      const peer = new NativePeer(kind, argv, config, message => onBackend(peer, message));
      peers.set(kind, peer);
    }
  }
  const handle = async (message: Message) => {
    if (message.method === undefined) {
      const routed = serverRequests.get(String(message.id));
      if (routed) { serverRequests.delete(String(message.id)); await routed.peer.send({ ...mapURIs(message, virtualURI), id: routed.id }); }
      return;
    }
    if (message.method === "$/cancelRequest") { requests.get(key(message.params?.id))?.abort(new DOMException("Request canceled", "AbortError")); return; }
    if (message.method === "exit") { stopped = true; return; }
    if (message.method === "initialize") {
      if (ready || requests.has(key(message.id))) { await reply(message.id, -32600, "already initialized"); return; }
      if (!peers.size) { await reply(message.id, -32002, "no configured native language server"); return; }
      const control = new AbortController();
      requests.set(key(message.id), control);
      try {
        const params = mapURIs(message.params ?? {}, virtualURI);
        params.capabilities ??= {};
        params.capabilities.general ??= {};
        params.capabilities.general.positionEncodings = ["utf-16"];
        const results = await Promise.all([...peers.values()].map(async peer => ({ peer, result: await peer.request("initialize", params, control.signal) })));
        const failures = results.find(entry => entry.result.error);
        if (failures) { await output({ ...failures.result, id: message.id }); return; }
        const primary = results.find(entry => entry.peer.kind === "typescript") ?? results[0]!;
        ready = true;
        await output({ ...primary.result, id: message.id, result: { ...primary.result.result, serverInfo: { name: "Buv native LSP broker", version: "0.1.0" }, capabilities: { ...primary.result.result.capabilities, experimental: { ...primary.result.result.capabilities?.experimental, buvBackends: results.map(entry => ({ name: entry.peer.kind, serverInfo: entry.result.result.serverInfo })) } } } });
      } finally { requests.delete(key(message.id)); }
      return;
    }
    if (!ready) { if (message.id !== undefined) await reply(message.id, -32002, "native servers are not initialized"); return; }
    if (message.method === "initialized" || message.method.startsWith("workspace/did") || message.method === "$/setTrace") {
      await Promise.all([...peers.values()].map(peer => peer.send(mapURIs(message, virtualURI))));
      return;
    }
    if (message.method === "shutdown") {
      const replies = await Promise.all([...peers.values()].map(peer => peer.request("shutdown")));
      await output({ jsonrpc: "2.0", id: message.id, result: null, ...(replies.find(entry => entry.error)?.error ? { error: replies.find(entry => entry.error)!.error } : {}) });
      return;
    }
    if (message.method === "buv/backendStatus") {
      await output({ jsonrpc: "2.0", id: message.id, result: ["typescript", "python", "ruff"].map(name => ({ name, configured: peers.has(name as Backend) })) });
      return;
    }
    const peer = peerFor(message.params);
    if (!peer) { if (message.id !== undefined) await reply(message.id, -32601, "native backend is unavailable for this document"); return; }
    const mapped = peer.kind === "typescript" ? mapURIs(message, virtualURI) : message;
    if (message.method === "textDocument/didOpen") {
      if (opened.size >= 4096) throw new Error("open document limit reached");
      opened.set(message.params.textDocument.uri, peer.kind);
      const uri = message.params.textDocument.uri;
      if (/\.pyts$/.test(uri)) mapped.params.textDocument.languageId = "typescript";
      if (/\.pytsx$/.test(uri)) mapped.params.textDocument.languageId = "typescriptreact";
      if (/\.pyjs$/.test(uri)) mapped.params.textDocument.languageId = "javascript";
    } else if (message.method === "textDocument/didClose") opened.delete(message.params.textDocument.uri);
    if (message.id === undefined) {
      await peer.send(mapped);
      if (peer.kind === "python" && message.method.startsWith("textDocument/did")) await peers.get("ruff")?.send(mapped);
      return;
    }
    if (requests.size >= (config.maxPending ?? 256) || requests.has(key(message.id))) { await reply(message.id, -32600, "client pending request limit or duplicate ID"); return; }
    const control = new AbortController();
    requests.set(key(message.id), control);
    try { const result = await peer.request(message.method, mapped.params, control.signal); await output({ ...mapURIs(result, originalURI), id: message.id }); }
    catch (error) { await reply(message.id, control.signal.aborted ? -32800 : -32603, error instanceof Error ? error.message : "native language server request failed"); }
    finally { requests.delete(key(message.id)); }
  };
  try {
    for await (const message of readMessages(input, config.maxMessageBytes, signal)) {
      if (stopped) break;
      const task = handle(message).catch(async error => { if (message.id !== undefined) await reply(message.id, -32603, error instanceof Error ? error.message : "LSP broker failure"); });
      tasks.add(task);
      void task.finally(() => tasks.delete(task)).catch(() => {});
      if (tasks.size >= (config.maxPending ?? 256)) await Promise.race(tasks);
      if (message.method === "exit") break;
    }
  } finally {
    for (const control of requests.values()) control.abort();
    await Promise.allSettled([...peers.values()].map(peer => peer.close()));
    await Promise.allSettled(tasks);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const index = args.indexOf("--config");
  const raw = index >= 0 ? await Bun.file(resolve(args[index + 1]!)).json() : {};
  const config = configuration(raw);
  const control = new AbortController();
  process.once("SIGINT", () => control.abort());
  process.once("SIGTERM", () => control.abort());
  const writer = Bun.stdout.writer();
  let writes = Promise.resolve();
  const output = (message: Message) => { writes = writes.then(async () => { writer.write(frame(message, config.maxMessageBytes)); await writer.flush(); }); return writes; };
  try { await serveLSP(config, Bun.stdin.stream(), output, control.signal); }
  catch (error) { console.error(error instanceof Error ? error.message : "LSP broker failed"); process.exitCode = 1; }
  finally { await writes.catch(() => {}); await writer.flush(); }
}
