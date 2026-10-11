// Run Cloudflare Workers locally from Bun: Miniflare (workerd) executes the Worker with its bindings
// (KV, D1, R2, Durable Objects, Queues, ...), Bun.serve fronts it, and getPlatformProxy exposes the
// same bindings to code that runs in Bun itself.
import { convertV4MiniflareOptions, Miniflare, type MiniflareOptions, type V4MiniflareOptions } from "miniflare";
import { getPlatformProxy, type GetPlatformProxyOptions, type PlatformProxy } from "wrangler";

export { Miniflare, getPlatformProxy };
export type { GetPlatformProxyOptions, MiniflareOptions, PlatformProxy, V4MiniflareOptions };

/** Flat Worker options (script, scriptPath, kvNamespaces, d1Databases, ...), converted to Miniflare 5 `workers`. */
export type WorkerOptions = V4MiniflareOptions;

export type LocalWorker = {
  miniflare: Miniflare;
  /** Dispatches a request to the Worker inside workerd. */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  /** Like fetch, but leaves the response body encoded as sent (Content-Encoding intact), for proxying. */
  forward(request: Request): Promise<Response>;
  /** Bindings declared in the options (KV namespaces, D1 databases, R2 buckets, ...). */
  bindings<Env = Record<string, unknown>>(): Promise<Env>;
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

const defaults = {
  modules: true,
  compatibilityDate: "2026-10-01",
  compatibilityFlags: ["nodejs_compat"],
};

/** Starts a Worker in workerd. Takes flat Worker options or native Miniflare 5 options (with `workers`). */
export async function startWorker(options: WorkerOptions | MiniflareOptions): Promise<LocalWorker> {
  const native =
    "workers" in options && Array.isArray(options.workers) && !("script" in options || "scriptPath" in options);
  const miniflare = new Miniflare(
    native
      ? (options as MiniflareOptions)
      : convertV4MiniflareOptions({ ...defaults, ...options } as V4MiniflareOptions),
  );
  const runtime = await miniflare.ready;
  const dispose = () => miniflare.dispose();
  // Miniflare.dispatchFetch routes through an undici Dispatcher, which Bun's built-in undici ignores.
  // Send the request straight to workerd with the headers that dispatcher would add.
  const send = (request: Request, decompress: boolean) => {
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set("MF-Original-URL", url.href);
    headers.set("MF-Disable-Pretty-Error", "true");
    return fetch(new URL(url.pathname + url.search, runtime), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
      signal: request.signal,
      decompress,
    });
  };
  return {
    miniflare,
    fetch: (input, init) =>
      send(input instanceof Request ? input : new Request(new URL(String(input), "http://localhost").href, init), true),
    forward: request => send(request, false),
    bindings: () => miniflare.getBindings() as any,
    dispose,
    [Symbol.asyncDispose]: dispose,
  };
}

export type ServeWorkerOptions = (WorkerOptions | MiniflareOptions) & { port?: number; hostname?: string };

/** Starts a Worker in workerd and serves it through Bun.serve. */
export async function serveWorker(options: ServeWorkerOptions) {
  const { port = 0, hostname = "127.0.0.1", ...rest } = options;
  const worker = await startWorker(rest as WorkerOptions);
  const server = Bun.serve({ port, hostname, fetch: request => worker.forward(request) });
  const dispose = async () => {
    server.stop(true);
    await worker.dispose();
  };
  return { server, worker, url: server.url, dispose, [Symbol.asyncDispose]: dispose };
}

export type ExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
};

export type BunStyleHandler<Env> = (
  request: Request,
  context: { env: Env; ctx: ExecutionContextLike },
) => Response | Promise<Response>;

/** Wraps a Bun-style `fetch(request)` handler as a Workers module (`export default toWorker(handler)`). */
export function toWorker<Env = unknown>(handler: BunStyleHandler<Env>) {
  return {
    fetch(request: Request, env: Env, ctx: ExecutionContextLike) {
      return handler(request, { env, ctx });
    },
  };
}

/** Serves a Workers module (`{ fetch(request, env, ctx) }`) directly in Bun with the given env, without workerd. */
export function serveModule<Env>(
  module: { fetch(request: Request, env: Env, ctx: ExecutionContextLike): Response | Promise<Response> },
  env: Env,
  options: { port?: number; hostname?: string } = {},
) {
  const pending = new Set<Promise<unknown>>();
  const ctx: ExecutionContextLike = {
    waitUntil(promise) {
      pending.add(promise);
      promise.finally(() => pending.delete(promise)).catch(() => {});
    },
    passThroughOnException() {},
  };
  const server = Bun.serve({
    port: options.port ?? 0,
    hostname: options.hostname ?? "127.0.0.1",
    fetch: request => module.fetch(request, env, ctx),
  });
  return {
    server,
    url: server.url,
    /** Settles every promise passed to ctx.waitUntil so far. */
    drain: () => Promise.allSettled(pending),
  };
}
