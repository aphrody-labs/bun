// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startWebOS, type WebOSServer } from "../server";

let dataDir: string;
let distDir: string;
let server: WebOSServer;
let base: string;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "bun-webos-server-"));
  distDir = join(dataDir, "dist");
  await mkdir(join(distDir, "workers"), { recursive: true });
  server = await startWebOS({ port: 0, hostname: "127.0.0.1", dataDir, distDir, development: false });
  base = server.url.href.replace(/\/$/, "");
});

afterAll(async () => {
  await server?.stop(true);
  await rm(dataDir, { recursive: true, force: true });
});

const get = (path: string, init?: RequestInit) => fetch(base + path, init);
const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });

test("serves the desktop page as an HTML import", async () => {
  const res = await get("/");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('<script type="module"');
});

test("the M3 native app browser entry bundles with the aphrody M3 front left external", async () => {
  const example = new URL("../examples/m3-native-app/index.html", import.meta.url).pathname;
  const result = await Bun.build({
    entrypoints: [example],
    target: "browser",
    write: false,
    external: ["@aphrody/m3-front/*", "@aphrody/material-web/*"],
  });

  expect(result.success).toBe(true);
  expect(result.outputs.some(output => output.path.endsWith("index.html"))).toBe(true);
  const app = result.outputs.find(output => output.path.endsWith(".js"));
  expect(app).toBeDefined();
  expect(new TextDecoder().decode(app!.contents)).toContain("@aphrody/material-web");
});

describe("commands", () => {
  test("Bun Shell runs a line in the home directory", async () => {
    const res = await post("/api/os/exec", { command: "echo bun-webos" });
    const out = (await res.json()) as { stdout: string; exitCode: number; engine: string };
    expect(out.stdout.trim()).toBe("bun-webos");
    expect(out.engine).toBe("Bun Shell");
    expect(out.exitCode).toBe(0);
  });

  test("a failing command reports its exit code", async () => {
    const out = (await (await post("/api/os/exec", { command: "exit 3" })).json()) as { exitCode: number };
    expect(out.exitCode).toBe(3);
  });

  test("eval runs JavaScript in a child bun", async () => {
    const out = (await (await post("/api/os/eval", { code: "Bun.semver.order('1.0.0', '2.0.0')" })).json()) as {
      stdout: string;
      exitCode: number;
    };
    expect(out.stdout.trim()).toBe("-1");
    expect(out.exitCode).toBe(0);
  });

  test("history is kept in bun:sqlite", async () => {
    const rows = (await (await get("/api/os/history?limit=50")).json()) as { kind: string; input: string }[];
    expect(rows.some(row => row.kind === "shell" && row.input === "echo bun-webos")).toBe(true);
  });

  test("the PTY runs a shell on Bun.Terminal", async () => {
    const ws = new WebSocket(`${base.replace("http", "ws")}/api/os/pty?cols=80&rows=24`);
    ws.binaryType = "arraybuffer";
    const decoder = new TextDecoder();
    let output = "";
    const { promise: started, resolve: onStarted } = Promise.withResolvers<{ type: string; pid: number }>();
    const { promise: prompted, resolve: onPrompt } = Promise.withResolvers<void>();
    const { promise: echoed, resolve: onEchoed } = Promise.withResolvers<void>();
    ws.onmessage = event => {
      if (typeof event.data === "string") {
        const msg = JSON.parse(event.data);
        if (msg.type === "started") onStarted(msg);
        return;
      }
      output += decoder.decode(event.data as ArrayBuffer, { stream: true });
      // Input typed before the first prompt can be dropped by the shell's line editor.
      if (/[>$#] $/.test(output.trimEnd() + " ")) onPrompt();
      if (output.includes("pty-webos-42-ok")) onEchoed();
    };
    const msg = await started;
    expect(msg.pid).toBeGreaterThan(0);
    await prompted;
    // Arithmetic, so the terminal's echo of the typed line does not match.
    ws.send(process.platform === "win32" ? 'echo "pty-webos-$(40+2)-ok"\r' : 'echo "pty-webos-$((40+2))-ok"\r');
    await echoed;
    expect(output).toContain("pty-webos-42-ok");
    ws.close();
  }, 30_000);
});

describe("files", () => {
  test("write, list, read with markdown and hash", async () => {
    expect((await post("/api/os/vfs/mkdir", { path: "/docs" })).status).toBe(200);
    const written = (await (await post("/api/os/vfs/write", { path: "/docs/a.md", text: "# Titre" })).json()) as {
      written: number;
    };
    expect(written.written).toBe(7);
    const listing = (await (await get("/api/os/vfs/list?path=/docs")).json()) as { entries: { name: string }[] };
    expect(listing.entries.map(e => e.name)).toEqual(["a.md"]);
    const file = (await (await get("/api/os/vfs/read?path=/docs/a.md")).json()) as {
      text: string;
      html: string;
      hash: string;
    };
    expect(file.text).toBe("# Titre");
    expect(file.html).toContain("<h1>Titre</h1>");
    expect(file.hash).toBe(Bun.hash("# Titre").toString(16));
    expect(await (await get("/api/os/vfs/raw?path=/docs/a.md")).text()).toBe("# Titre");
  });

  test("search and tar.gz archive", async () => {
    const found = (await (await get("/api/os/vfs/search?path=/&pattern=**/*.md")).json()) as { matches: string[] };
    expect(found.matches).toEqual(["/docs/a.md"]);
    const res = await get("/api/os/vfs/archive?path=/docs");
    expect(res.headers.get("content-type")).toBe("application/gzip");
    const files = await new Bun.Archive(await res.bytes()).files();
    expect([...files.keys()].some(name => name.endsWith("a.md"))).toBe(true);
  });

  test("move and remove; the root cannot be removed", async () => {
    expect((await post("/api/os/vfs/move", { from: "/docs/a.md", to: "/docs/b.md" })).status).toBe(200);
    expect((await get("/api/os/vfs/read?path=/docs/a.md")).status).toBe(404);
    expect((await post("/api/os/vfs/remove", { path: "/docs" })).status).toBe(200);
    expect((await post("/api/os/vfs/remove", { path: "/" })).status).toBe(403);
  });

  test("paths outside the home directory are refused", async () => {
    expect((await get("/api/os/vfs/list?path=../..")).status).toBe(403);
    expect((await post("/api/os/vfs/write", { path: "../escape.txt", text: "x" })).status).toBe(403);
  });
});

describe("host guard", () => {
  test("cross-origin requests get 403", async () => {
    const res = await post("/api/os/exec", { command: "echo no" }, { Origin: "https://example.com" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { status: string }).status).toBe("permission_denied");
  });

  test("hostAccess: false closes every host route", async () => {
    const closed = await startWebOS({
      port: 0,
      dataDir: join(dataDir, "closed"),
      hostAccess: false,
      development: false,
    });
    try {
      expect((await fetch(new URL("/api/os/processes", closed.url))).status).toBe(403);
    } finally {
      await closed.stop(true);
    }
  });
});

describe("system", () => {
  test("processes include this server", async () => {
    const out = (await (await get("/api/os/processes")).json()) as {
      source: string;
      serverPid: number;
      processes: { pid: number; owned: boolean }[];
    };
    expect(out.serverPid).toBe(process.pid);
    expect(out.processes.find(p => p.pid === process.pid)?.owned).toBe(true);
  });

  test("system packages name their source or why none was read", async () => {
    const out = (await (await get("/api/os/apk/packages")).json()) as {
      source: string;
      packages: unknown[];
      unavailable: string[];
    };
    expect(typeof out.source).toBe("string");
    expect(out.packages.length > 0 || out.unavailable.length > 0).toBe(true);
  });

  test("system snapshot and bun:* module report", async () => {
    const snap = (await (await get("/api/webos/system")).json()) as {
      runtime: { bun: string; pid: number };
      modules: { name: string }[];
    };
    expect(snap.runtime).toMatchObject({ bun: Bun.version, pid: process.pid });
    expect(snap.modules.map(m => m.name)).toEqual(["bun:linux", "bun:windows", "bun:cosmic", "bun:wasm"]);
  });

  test("bun:ffi dlopen reads this process id", async () => {
    const probe = (await (await get("/api/ffi/probe")).json()) as { ok: boolean; matchesProcessPid?: boolean };
    expect(probe).toMatchObject({ ok: true, matchesProcessPid: true });
  });

  test("bun:ffi cc compiles and calls C", async () => {
    const out = (await (await post("/api/ffi/cc", { pairs: [[84, 36]] })).json()) as {
      ok: boolean;
      calls?: { result: number }[];
      error?: string;
    };
    expect(out.error).toBeUndefined();
    expect(out.calls?.[0].result).toBe(12);
  });

  test("benchmarks run in a Worker", async () => {
    const out = (await (await post("/api/benchmarks/run", {})).json()) as {
      results: { name: string; iterations: number; durationMs: number }[];
    };
    expect(out.results.length).toBe(7);
    for (const r of out.results) expect(r.iterations).toBeGreaterThan(0);
  }, 30_000);
});

describe("page workers", () => {
  test("a prebuilt dist/workers file is served outside development", async () => {
    await Bun.write(join(distDir, "workers", "repl.js"), "/* prebuilt */");
    const res = await get("/dist/workers/repl.js");
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(await res.text()).toBe("/* prebuilt */");
    await rm(join(distDir, "workers", "repl.js"));
  });

  test("without one, the worker is bundled by Bun.build", async () => {
    const res = await get("/dist/workers/repl.js");
    expect(res.status).toBe(200);
    expect((await res.text()).length).toBeGreaterThan(1000);
  });

  test("unknown workers and unbuilt wasm are 404", async () => {
    expect((await get("/dist/workers/nope.js")).status).toBe(404);
    expect((await get("/dist/wasm/bun/bun_wasm.wasm")).status).toBe(404);
  });
});
