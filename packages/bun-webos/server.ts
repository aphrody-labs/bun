#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Bun WebOS server. `startWebOS()` serves the desktop as an HTML import (bundled by Bun, Tailwind
 * through bunfig `[serve.static]`, HMR in development) and the APIs every app calls: Bun Shell, a PTY
 * on Bun.Terminal, a child `bun -p`, the home directory through Bun.file/Bun.Glob/Bun.Archive/
 * Bun.markdown, host processes, system packages, bun:ffi, bun:sqlite history, benchmarks in a Worker.
 * Routes that touch the host answer only on loopback and same-origin requests (src/server/guard.ts).
 */
import type { Server, ServerWebSocket, Subprocess } from "bun";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import index from "./index.html";
import type { BenchResult } from "./src/server/bench-worker";
import { runCc, probeDlopen } from "./src/server/ffi";
import {
  archiveDir,
  listDir,
  makeDir,
  move,
  readFile,
  remove,
  resolveInRoot,
  search,
  VfsError,
  writeFile,
} from "./src/server/files";
import { denyHostAccess, type HostAccessPolicy } from "./src/server/guard";
import { installSystemPackage, listSystemPackages } from "./src/server/packages";
import { listProcesses } from "./src/server/processes";
import { PAGE_WORKERS } from "./src/server/page-workers";
import { resolvePublicAsset } from "./src/server/public-assets";
import { evalJs, runShell, terminalShell } from "./src/server/shell";
import { WebOSStore } from "./src/server/store";
import { systemSnapshot } from "./src/server/system-metrics";

export interface WebOSOptions {
  /** 0 picks a free port. Default: $PORT or 3000. */
  port?: number;
  /** Default 127.0.0.1; host routes refuse to answer on a non-loopback listener. */
  hostname?: string;
  /** Home directory the Files, shell, terminal and REPL work in. Default: <dataDir>/home. */
  root?: string;
  /** bun:sqlite database and default home. Default: ~/.bun-webos ($BUN_WEBOS_DATA). */
  dataDir?: string;
  /** false turns every host route into a 403. Default true. */
  hostAccess?: boolean;
  /** HMR and unminified bundles. Default: NODE_ENV !== "production". */
  development?: boolean;
  /** Output of build.ts (page workers in workers/). Default: <package>/dist. */
  distDir?: string;
  /** Directory served at /dist/wasm/ (bun_wasm.wasm). Default: <distDir>/wasm. */
  wasmDir?: string;
}

interface PtyData {
  kind: "pty";
  cwd: string;
  cols: number;
  rows: number;
  proc?: Subprocess;
}

export type WebOSServer = Server<PtyData>;

const json = (body: unknown, status = 200) => Response.json(body, { status });

async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new VfsError("request body is not JSON", 400);
  }
}

function fail(error: unknown): Response {
  if (error instanceof VfsError) return json({ error: error.message }, error.status);
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") return json({ error: (error as Error).message }, 404);
  if (code === "EACCES" || code === "EPERM") return json({ error: (error as Error).message }, 403);
  return json({ error: (error as Error).message ?? String(error) }, 500);
}

/** Runs the benchmarks of bench-worker.ts in a fresh Bun Worker. */
function runBenchmarksInWorker(): Promise<BenchResult[]> {
  const worker = new Worker(new URL("./src/server/bench-worker.ts", import.meta.url).href);
  return new Promise<BenchResult[]>((resolveResults, reject) => {
    worker.onmessage = (event: MessageEvent<{ ok: boolean; results?: BenchResult[]; error?: string }>) => {
      if (event.data.ok) resolveResults(event.data.results!);
      else reject(new Error(event.data.error));
    };
    worker.onerror = event => reject(new Error(event.message));
    worker.postMessage("run");
  }).finally(() => worker.terminate());
}

const workerBuilds = new Map<string, Promise<Response>>();

/**
 * Page workers: dist/workers/<name> from build.ts outside development (a compiled executable has no
 * sources on disk), else bundled by Bun.build on first request (the browser bundler does not follow
 * `new Worker(new URL())`).
 */
async function pageWorker(name: string, development: boolean, distDir: string): Promise<Response> {
  const source = PAGE_WORKERS[name];
  if (!source) return new Response("unknown worker", { status: 404 });
  const entry = join(import.meta.dir, source);
  const prebuilt = Bun.file(join(distDir, "workers", name));
  if ((!development || !(await Bun.file(entry).exists())) && (await prebuilt.exists()))
    return new Response(prebuilt, { headers: { "Content-Type": "text/javascript" } });
  let pending = workerBuilds.get(name);
  if (!pending) {
    pending = Bun.build({ entrypoints: [entry], target: "browser", format: "esm", minify: !development }).then(
      async result => {
        if (!result.success) return new Response(result.logs.map(String).join("\n"), { status: 500 });
        return new Response(await result.outputs[0].text(), { headers: { "Content-Type": "text/javascript" } });
      },
      error => new Response(`worker build failed: ${(error as Error).message}`, { status: 500 }),
    );
    if (!development) workerBuilds.set(name, pending);
  }
  return pending.then(res => res.clone());
}

export async function startWebOS(options: WebOSOptions = {}): Promise<WebOSServer> {
  const dataDir = resolve(options.dataDir ?? process.env.BUN_WEBOS_DATA ?? join(homedir(), ".bun-webos"));
  const root = resolve(options.root ?? join(dataDir, "home"));
  mkdirSync(root, { recursive: true });
  const development = options.development ?? process.env.NODE_ENV !== "production";
  const distDir = resolve(options.distDir ?? join(import.meta.dir, "dist"));
  const wasmDir = resolve(options.wasmDir ?? join(distDir, "wasm"));
  const policy: HostAccessPolicy = { enabled: options.hostAccess ?? true };
  const store = new WebOSStore(join(dataDir, "webos.sqlite"));
  const children = new Map<number, Subprocess>();
  const track = (proc: Subprocess) => {
    children.set(proc.pid, proc);
    void proc.exited.finally(() => children.delete(proc.pid));
  };

  /** Host route: guard first, then `handler`; errors become JSON with their HTTP status. */
  const host =
    (handler: (req: Request, server: WebOSServer) => Response | Promise<Response> | undefined) =>
    async (req: Request, server: WebOSServer) => {
      const denied = denyHostAccess(req, server, policy);
      if (denied) return denied;
      try {
        return await handler(req, server);
      } catch (error) {
        return fail(error);
      }
    };
  const query = (req: Request, key: string, fallback = "/") => new URL(req.url).searchParams.get(key) ?? fallback;
  const startedAt = Date.now();

  const server: WebOSServer = Bun.serve<PtyData>({
    port: options.port ?? Number(process.env.PORT ?? 3000),
    hostname: options.hostname ?? "127.0.0.1",
    development: development ? { hmr: true, console: true } : false,
    routes: {
      "/": index,

      "/api/webos/system": { GET: async () => json(await systemSnapshot()) },
      "/api/webos/capabilities": {
        GET: async (req: Request, srv: WebOSServer) => {
          const shell = await terminalShell();
          return json({
            hostAccess: denyHostAccess(req, srv, policy) === null,
            root,
            terminal: { shell: shell.name, bunsh: shell.bunsh },
            bunWasm: await Bun.file(join(wasmDir, "bun", "bun_wasm.wasm")).exists(),
          });
        },
      },
      "/api/metrics": {
        GET: () => {
          const memory = process.memoryUsage();
          return json({
            bunVersion: Bun.version,
            uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
            memoryUsageMb: memory.heapUsed / (1024 * 1024),
            timestampNs: Bun.nanoseconds().toString(),
            platform: process.platform,
            arch: process.arch,
            cpus: navigator.hardwareConcurrency,
          });
        },
      },

      "/api/os/exec": {
        POST: host(async req => {
          const { command } = await body<{ command?: string }>(req);
          if (!command?.trim()) return json({ error: "command is required" }, 400);
          const result = await runShell(command, root);
          store.record("shell", command, result.exitCode, result.durationMs);
          return json(result);
        }),
      },
      "/api/os/eval": {
        POST: host(async req => {
          const { code } = await body<{ code?: string }>(req);
          if (!code?.trim()) return json({ error: "code is required" }, 400);
          const result = await evalJs(code, root, track);
          store.record("eval", code, result.exitCode, result.durationMs);
          return json(result);
        }),
      },
      "/api/os/pty": {
        GET: host((req, srv) => {
          const cols = Number(query(req, "cols", "100")) || 100;
          const rows = Number(query(req, "rows", "30")) || 30;
          if (srv.upgrade(req, { data: { kind: "pty", cwd: root, cols, rows } })) return undefined;
          return json({ error: "WebSocket upgrade expected" }, 426);
        }),
      },
      "/api/os/history": { GET: host(req => json(store.history(Number(query(req, "limit", "100"))))) },

      "/api/os/vfs/list": { GET: host(async req => json(await listDir(root, query(req, "path")))) },
      "/api/os/vfs/read": { GET: host(async req => json(await readFile(root, query(req, "path")))) },
      "/api/os/vfs/raw": {
        GET: host(async req => {
          return new Response(Bun.file(await resolveInRoot(root, query(req, "path"))));
        }),
      },
      "/api/os/vfs/search": {
        GET: host(async req => json(await search(root, query(req, "path"), query(req, "pattern", "**/*")))),
      },
      "/api/os/vfs/archive": {
        GET: host(async req => {
          const { name, blob } = await archiveDir(root, query(req, "path"));
          return new Response(blob, {
            headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${name}"` },
          });
        }),
      },
      "/api/os/vfs/write": {
        POST: host(async req => {
          const { path, text } = await body<{ path: string; text: string }>(req);
          return json({ written: await writeFile(root, path, text ?? "") });
        }),
      },
      "/api/os/vfs/mkdir": {
        POST: host(async req => {
          await makeDir(root, (await body<{ path: string }>(req)).path);
          return json({ ok: true });
        }),
      },
      "/api/os/vfs/remove": {
        POST: host(async req => {
          await remove(root, (await body<{ path: string }>(req)).path);
          return json({ ok: true });
        }),
      },
      "/api/os/vfs/move": {
        POST: host(async req => {
          const { from, to } = await body<{ from: string; to: string }>(req);
          await move(root, from, to);
          return json({ ok: true });
        }),
      },

      "/api/os/processes": {
        GET: host(async () => json({ ...(await listProcesses(new Set(children.keys()))), serverPid: process.pid })),
      },
      "/api/os/apk/packages": { GET: host(async () => json(await listSystemPackages(root))) },
      "/api/os/apk/install": {
        POST: host(async req => {
          const { name } = await body<{ name: string }>(req);
          const result = installSystemPackage(name);
          return json(result, result.ok ? 200 : 501);
        }),
      },

      "/api/ffi/probe": { GET: () => json(probeDlopen()) },
      "/api/ffi/cc": {
        POST: async (req: Request) => {
          const { pairs } = await body<{ pairs?: [number, number][] }>(req).catch(() => ({ pairs: undefined }));
          return json(await runCc((pairs ?? [[84, 36]]).slice(0, 16).map(([a, b]) => [a | 0, b | 0])));
        },
      },

      "/api/benchmarks/run": {
        POST: async () => {
          try {
            return json({ results: await runBenchmarksInWorker() });
          } catch (error) {
            return fail(error);
          }
        },
      },
      "/api/transpile": {
        POST: async (req: Request) => {
          const { code, loader } = await body<{ code?: string; loader?: "tsx" | "ts" | "jsx" | "js" }>(req);
          try {
            return json({ code: new Bun.Transpiler({ loader: loader ?? "tsx" }).transformSync(code ?? "") });
          } catch (error) {
            return json({ error: (error as Error).message }, 400);
          }
        },
      },
      "/api/password/hash": {
        POST: async (req: Request) => {
          const { password, algorithm } = await body<{ password?: string; algorithm?: string }>(req);
          const hash = await Bun.password.hash(password ?? "", {
            algorithm: algorithm === "bcrypt" ? "bcrypt" : "argon2id",
          });
          return json({ hash, verified: await Bun.password.verify(password ?? "", hash) });
        },
      },
      "/api/deflate": {
        POST: async (req: Request) => {
          const raw = new TextEncoder().encode((await body<{ text?: string }>(req)).text ?? "");
          const compressed = Bun.deflateSync(raw);
          const pct = raw.byteLength ? ((compressed.byteLength / raw.byteLength) * 100).toFixed(1) : "0";
          return json({
            ratio: `${raw.byteLength} bytes -> ${compressed.byteLength} bytes (${pct}%)`,
            compressedSize: compressed.byteLength,
          });
        },
      },
      "/api/html-rewriter": {
        POST: async (req: Request) => {
          const html = (await body<{ html?: string }>(req)).html ?? "";
          const rewritten = await new HTMLRewriter()
            .on("h1", {
              element(el) {
                el.setAttribute("data-m3-heading", "true");
                el.before('<span class="m3-badge">Bun HTMLRewriter</span> ', { html: true });
              },
            })
            .on("p", {
              element(el) {
                el.after(`<footer class="m3-footer"><small>Rewritten at ${new Date().toISOString()}</small></footer>`, {
                  html: true,
                });
              },
            })
            .transform(new Response(html))
            .text();
          return json({ rewritten });
        },
      },

      "/dist/workers/:name": {
        GET: (req: Bun.BunRequest<"/dist/workers/:name">) => pageWorker(req.params.name, development, distDir),
      },
      "/dist/wasm/*": {
        GET: async (req: Request) => {
          const rel = new URL(req.url).pathname.slice("/dist/wasm/".length);
          const file = await resolvePublicAsset(wasmDir, rel);
          return file
            ? new Response(Bun.file(file))
            : new Response(`not built: ${rel} (expected under ${wasmDir})`, { status: 404 });
        },
      },
    },

    fetch() {
      return new Response("Not Found", { status: 404 });
    },

    websocket: {
      async open(ws: ServerWebSocket<PtyData>) {
        const shell = await terminalShell();
        try {
          const proc = Bun.spawn(shell.cmd, {
            argv0: shell.argv0,
            cwd: ws.data.cwd,
            env: { ...shell.env, TERM: "xterm-256color", COLUMNS: String(ws.data.cols), LINES: String(ws.data.rows) },
            terminal: {
              cols: ws.data.cols,
              rows: ws.data.rows,
              data(_terminal, data) {
                if (ws.readyState === 1) ws.sendBinary(data);
              },
            },
          });
          ws.data.proc = proc;
          track(proc);
          store.record("pty", shell.name, null, null);
          ws.send(JSON.stringify({ type: "started", shell: shell.name, bunsh: shell.bunsh, pid: proc.pid }));
          void proc.exited.then(code => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "exit", code }));
              ws.close(1000, "shell exited");
            }
          });
        } catch (error) {
          ws.send(JSON.stringify({ type: "error", error: (error as Error).message }));
          ws.close(1011, "spawn failed");
        }
      },
      message(ws, message) {
        const terminal = ws.data.proc?.terminal;
        if (!terminal) return;
        if (typeof message === "string" && message.startsWith('{"resize"')) {
          const { resize } = JSON.parse(message) as { resize: [number, number] };
          terminal.resize(resize[0], resize[1]);
          return;
        }
        terminal.write(message);
      },
      close(ws) {
        ws.data.proc?.kill();
      },
    },
  });

  const stop = server.stop.bind(server);
  /** Also kills the shells and evals this server started and waits for them, then closes the store. */
  server.stop = async (closeActiveConnections?: boolean) => {
    const running = [...children.values()];
    for (const proc of running) proc.kill();
    try {
      await stop(closeActiveConnections);
    } finally {
      await Promise.allSettled(running.map(proc => proc.exited));
      store.close();
    }
  };
  return server;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const server = await startWebOS({
    port: flag("--port") === undefined ? undefined : Number(flag("--port")),
    hostname: flag("--hostname"),
    root: flag("--root"),
    dataDir: flag("--data"),
  });
  console.log(`Bun WebOS on ${server.url} (Bun ${Bun.version})`);
}
