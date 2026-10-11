const fs = require("node:fs");
const path: typeof import("node:path") = require("node:path");
const os = require("node:os");
const manifests = require("internal/chrome-manifests");

type Options = { timeout?: number; signal?: AbortSignal };
type Pending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type Listener = (params: Record<string, unknown>, sessionId?: string) => void;

function timeoutValue(value: number | undefined): number {
  const result = value ?? 10000;
  if (!Number.isSafeInteger(result) || result < 1 || result > 2147483647)
    throw new RangeError("timeout must be an integer from 1 to 2147483647 milliseconds");
  return result;
}

function endpointURL(endpoint: string): string {
  const url = new URL(endpoint);
  if (
    !["ws:", "wss:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new TypeError(
      "CDP endpoint must be a loopback WebSocket URL without credentials or fragment",
    );
  return url.href;
}

function validateURL(value: string): string {
  if (value === "about:blank") return value;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new TypeError("navigation URL must use HTTP(S) without credentials, or about:blank");
  return url.href;
}

class ChromiumConnection {
  #socket: WebSocket;
  #timeout: number;
  #nextId = 0;
  #pending = new Map<number, Pending>();
  #listeners = new Map<string, Set<Listener>>();
  #closed = false;
  #removeAbort: (() => void) | undefined;

  constructor(socket: WebSocket, timeout: number, signal?: AbortSignal) {
    this.#socket = socket;
    this.#timeout = timeout;
    socket.addEventListener("message", (event) => this.#message(event));
    socket.addEventListener("close", () => this.close());
    socket.addEventListener("error", () => this.close());
    if (signal) {
      const abort = () => this.close();
      signal.addEventListener("abort", abort, { once: true });
      this.#removeAbort = () => signal.removeEventListener("abort", abort);
      if (signal.aborted) this.close();
    }
  }

  get closed(): boolean {
    return this.#closed;
  }

  async gpu(sessionId: string) {
    if (typeof sessionId !== "string" || !sessionId)
      throw new TypeError("gpu requires an attached target sessionId");
    const response = await this.send<any>(
      "Runtime.evaluate",
      {
        expression: `(async () => {
        if (!navigator.gpu) return { available: false, adapter: false, fallback: null, info: null };
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return { available: true, adapter: false, fallback: null, info: null };
        const info = adapter.info;
        return { available: true, adapter: true,
          fallback: typeof info?.isFallbackAdapter === "boolean" ? info.isFallbackAdapter : null,
          info: info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : null };
      })()`,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    const { exceptionDetails } = response;
    if (exceptionDetails) throw new Error(exceptionDetails.text ?? "WebGPU probe failed");
    return response.result.value;
  }

  async send<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<T> {
    if (this.#closed) throw new Error("Chrome connection closed");
    if (typeof method !== "string" || !/^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/.test(method))
      throw new TypeError("CDP method must have Domain.command syntax");
    if (!params || typeof params !== "object" || Array.isArray(params))
      throw new TypeError("params must be an object");
    if (sessionId !== undefined && (typeof sessionId !== "string" || !sessionId))
      throw new TypeError("sessionId must be a nonempty string");
    const id = ++this.#nextId;
    const payload = JSON.stringify({
      id,
      method,
      params,
      ...(sessionId === undefined ? {} : { sessionId }),
    });
    if (this.#closed) throw new Error("Chrome connection closed");
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, this.#timeout);
      this.#pending.set(id, { resolve, reject, timer });
      try {
        this.#socket.send(payload);
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  on(method: string, callback: Listener): () => void {
    if (this.#closed) throw new Error("Chrome connection closed");
    if (typeof method !== "string" || !method.includes("."))
      throw new TypeError("event must have Domain.event syntax");
    if (typeof callback !== "function") throw new TypeError("callback must be a function");
    let listeners = this.#listeners.get(method);
    if (!listeners) this.#listeners.set(method, (listeners = new Set()));
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
      if (!listeners.size && this.#listeners.get(method) === listeners)
        this.#listeners.delete(method);
    };
  }

  #message(event: MessageEvent): void {
    let message;
    try {
      if (typeof event.data !== "string") throw new TypeError("CDP messages must be text");
      message = JSON.parse(event.data);
      if (!message || typeof message !== "object" || Array.isArray(message))
        throw new TypeError("invalid CDP message");
    } catch {
      this.close();
      return;
    }
    const { id, error: protocolError, method } = message;
    if (Number.isSafeInteger(id)) {
      const pending = this.#pending.get(id);
      if (!pending) return;
      this.#pending.delete(id);
      clearTimeout(pending.timer);
      if (protocolError) {
        const error = new Error(String(protocolError.message ?? "CDP command failed"));
        Object.assign(error, { code: protocolError.code, data: protocolError.data });
        pending.reject(error);
      } else pending.resolve(message.result);
    } else if (typeof method === "string") {
      const listeners = this.#listeners.get(method);
      if (listeners)
        for (const callback of Array.from(listeners)) {
          try {
            callback.$call(undefined, message.params ?? {}, message.sessionId);
          } catch (error) {
            reportError(error);
          }
        }
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#removeAbort?.();
    this.#listeners.clear();
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Chrome connection closed"));
    }
    this.#pending.clear();
    this.#socket.close();
  }
}

async function connect(endpoint: string, options: Options = {}): Promise<ChromiumConnection> {
  const timeout = timeoutValue(options.timeout);
  const url = endpointURL(endpoint);
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const signal = options.signal;
    const timer = setTimeout(() => fail(new Error("CDP connection timed out")), timeout);
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      socket.removeEventListener("error", error);
      socket.removeEventListener("close", closed);
      socket.removeEventListener("open", opened);
    };
    const fail = (reason: any) => {
      cleanup();
      socket.close();
      reject(reason);
    };
    const abort = () => fail(signal?.reason);
    const error = () => fail(new Error("CDP WebSocket connection failed"));
    const closed = () => fail(new Error("CDP WebSocket closed before opening"));
    const opened = () => {
      cleanup();
      const connection = new ChromiumConnection(socket, timeout, signal);
      if (connection.closed) reject(signal?.reason ?? new Error("Chrome connection closed"));
      else resolve(connection);
    };
    signal?.addEventListener("abort", abort, { once: true });
    socket.addEventListener("error", error, { once: true });
    socket.addEventListener("close", closed, { once: true });
    socket.addEventListener("open", opened, { once: true });
    if (signal?.aborted) abort();
  });
}

function findExecutable(): string | null {
  const configured = process.env.BUN_CHROMIUM_PATH ?? process.env.BUN_CHROME_PATH;
  if (configured) return Bun.which(configured);
  for (const name of ["chromium", "chromium-browser", "google-chrome", "chrome", "msedge"]) {
    const found = Bun.which(name);
    if (found) return found;
  }
  const candidates =
    process.platform === "win32"
      ? [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA]
          .filter((root): root is string => typeof root === "string")
          .flatMap((root) =>
            [
              "Chromium/Application/chrome.exe",
              "Google/Chrome/Application/chrome.exe",
              "Microsoft/Edge/Application/msedge.exe",
            ].map((name) => path.join(root, name)),
          )
      : process.platform === "darwin"
        ? [
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          ]
        : ["/usr/bin/chromium", "/usr/bin/google-chrome", "/snap/bin/chromium"];
  for (const candidate of candidates) if (Bun.which(candidate)) return candidate;
  return null;
}

async function launch(
  options: Options & {
    executable?: string;
    userDataDir?: string;
    headless?: boolean;
    url?: string;
    extensions?: string[];
    webgpu?: boolean;
  } = {},
) {
  const timeout = timeoutValue(options.timeout);
  options.signal?.throwIfAborted();
  const executable = options.executable ?? findExecutable();
  if (!executable || !Bun.which(executable))
    throw new Error("Chromium executable not found; set BUN_CHROMIUM_PATH or executable");
  const url = validateURL(options.url ?? "about:blank");
  const extensions = options.extensions ?? [];
  if (
    !Array.isArray(extensions) ||
    extensions.some(
      (dir) =>
        typeof dir !== "string" || !path.isAbsolute(dir) || dir.includes(",") || dir.includes("\0"),
    )
  )
    throw new TypeError("extensions must be absolute directory paths without commas or NUL");
  for (const dir of extensions) {
    manifests.validateExtension(JSON.parse(await Bun.file(path.join(dir, "manifest.json")).text()));
  }
  options.signal?.throwIfAborted();
  if (options.webgpu !== undefined && typeof options.webgpu !== "boolean")
    throw new TypeError("webgpu must be a boolean");
  const ownedProfile = options.userDataDir === undefined;
  if (
    !ownedProfile &&
    (typeof options.userDataDir !== "string" || !path.isAbsolute(options.userDataDir))
  )
    throw new TypeError("userDataDir must be an absolute dedicated directory path");
  const userDataDir: string = ownedProfile
    ? fs.mkdtempSync(path.join(os.tmpdir(), "bun-chromium-"))
    : options.userDataDir!;
  fs.mkdirSync(userDataDir, { recursive: true });
  const args = [
    executable,
    `--user-data-dir=${userDataDir}`,
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
  ];
  if (options.headless === true) args.push("--headless=new");
  args.push(
    options.webgpu === false
      ? "--disable-features=WebGPUService"
      : "--enable-features=WebGPUService",
  );
  if (extensions.length) args.push(`--load-extension=${extensions.join(",")}`);
  args.push(url);
  let proc: Bun.Subprocess<"ignore", "ignore", "pipe"> | undefined;
  let connection: ChromiumConnection | undefined;
  let closed = false;
  let abort: (() => void) | undefined;
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      closed = true;
      if (abort) options.signal?.removeEventListener("abort", abort);
      connection?.close();
      if (proc && proc.exitCode === null) proc.kill();
      if (proc) await proc.exited;
      if (ownedProfile) fs.rmSync(userDataDir, { recursive: true, force: true });
    })());
  try {
    proc = Bun.spawn(args, { stdin: "ignore", stdout: "ignore", stderr: "pipe" });
    const child = proc;
    const endpoint = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (error?: any, value?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", cancelled);
        if (error !== undefined) reject(error);
        else resolve(value!);
      };
      const timer = setTimeout(
        () => finish(new Error("Chromium debugging endpoint timed out")),
        timeout,
      );
      const cancelled = () => finish(options.signal?.reason);
      options.signal?.addEventListener("abort", cancelled, { once: true });
      const drain = async () => {
        const reader = child.stderr.getReader();
        const decoder = new TextDecoder();
        let tail = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            tail += decoder.decode(value, { stream: true });
            const match = /DevTools listening on (wss?:\/\/[^\s]+)[\r\n]/.exec(tail);
            if (match) finish(undefined, match[1]);
            tail = tail.slice(-16384);
          }
          finish(new Error("Chromium exited before publishing its debugging endpoint"));
        } catch (error) {
          finish(error);
        } finally {
          reader.releaseLock();
        }
      };
      void drain();
      if (options.signal?.aborted) cancelled();
    });
    connection = await connect(endpoint, options);
    const backgroundClose = async () => {
      try {
        await close();
      } catch (error) {
        reportError(error);
      }
    };
    abort = () => {
      void backgroundClose();
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    const { signal } = options;
    if (signal?.aborted) {
      await close();
      signal.throwIfAborted();
    }
    const exited = async () => {
      await child.exited;
      if (!closed) await backgroundClose();
    };
    void exited();
    return { connection, process: proc, userDataDir, close };
  } catch (error) {
    await close();
    throw error;
  }
}

async function readBookmarks(file: string) {
  if (typeof file !== "string" || !path.isAbsolute(file))
    throw new TypeError("Bookmarks file must be an absolute path");
  const document = await Bun.file(file).json();
  if (
    !document ||
    typeof document.roots !== "object" ||
    !document.roots ||
    Array.isArray(document.roots)
  )
    throw new TypeError("invalid Chrome Bookmarks roots");
  const result: { id: string; name: string; url: string; folder: string[] }[] = [];
  const stack = Object.values(document.roots).map((node) => ({
    node: node as any,
    folder: [] as string[],
  }));
  while (stack.length) {
    const { node, folder } = stack.pop()!;
    if (!node || typeof node.name !== "string") throw new TypeError("invalid bookmark node");
    if (node.type === "url") {
      if (typeof node.url !== "string" || typeof node.id !== "string")
        throw new TypeError("invalid bookmark URL node");
      result.push({ id: node.id, name: node.name, url: node.url, folder });
    } else if (node.type === "folder") {
      const { children } = node;
      if (!Array.isArray(children)) throw new TypeError("invalid bookmark folder children");
      const parent = [...folder, node.name];
      for (let i = children.length - 1; i >= 0; i--)
        stack.push({ node: children[i], folder: parent });
    } else throw new TypeError("invalid bookmark folder node");
  }
  return result;
}

export default {
  ChromiumConnection,
  connect,
  launch,
  findExecutable,
  manifests,
  profiles: { readBookmarks },
  protocol: { validateURL },
};
