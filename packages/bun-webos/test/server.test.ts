// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startWebOS, type WebOSServer } from "../server";
import { Database } from "bun:sqlite";
import { createExplorer } from "../src/server/explorer";
import { hostAccessProblem } from "../src/server/guard";

let dataDir: string;
let distDir: string;
let server: WebOSServer;
let base: string;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "bun-webos-server-"));
  distDir = join(dataDir, "dist");
  await mkdir(join(distDir, "workers"), { recursive: true });
  server = await startWebOS({
    port: 0,
    hostname: "127.0.0.1",
    dataDir,
    distDir,
    development: false,
  });
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

describe("generic index explorer", () => {
  test("disabled host access hides system measurements and local capabilities", async () => {
    const publicServer = await startWebOS({
      port: 0,
      dataDir: join(dataDir, "public-mode"),
      hostAccess: false,
      development: false,
    });
    try {
      expect((await fetch(new URL("/api/webos/system", publicServer.url))).status).toBe(403);
      expect((await fetch(new URL("/api/metrics", publicServer.url))).status).toBe(403);
      const capabilities = await (
        await fetch(new URL("/api/webos/capabilities", publicServer.url))
      ).json();
      expect(capabilities).toEqual({ hostAccess: false, terminal: null, bunWasm: false });
    } finally {
      await publicServer.stop(true);
    }
  });
  test("matching attacker Host and Origin cannot authorize host access", () => {
    const srv = {
      hostname: "127.0.0.1",
      port: 3000,
      requestIP: () => ({ address: "127.0.0.1" }),
    } as unknown as WebOSServer;
    expect(
      hostAccessProblem(
        new Request("http://evil.example:3000/api/explorer/summary", {
          headers: { Origin: "http://evil.example:3000" },
        }),
        srv,
        { enabled: true },
      ),
    ).toContain("authority");
    expect(
      hostAccessProblem(new Request("http://127.0.0.1:3001/api/explorer/summary"), srv, {
        enabled: true,
      }),
    ).toContain("authority");
    expect(
      hostAccessProblem(new Request("http://127.0.0.1:3000/api/explorer/summary"), srv, {
        enabled: true,
      }),
    ).toBeNull();
    const proxyRequest = new Request("http://private-console.example/api/explorer/summary", {
      headers: { Origin: "http://private-console.example" },
    });
    expect(
      hostAccessProblem(proxyRequest, srv, {
        enabled: true,
        trustedOrigins: ["http://private-console.example"],
      }),
    ).toBeNull();
    expect(
      hostAccessProblem(proxyRequest, srv, {
        enabled: false,
        trustedOrigins: ["http://private-console.example"],
      }),
    ).toContain("disabled");
    expect(
      hostAccessProblem(
        new Request("http://evil.example/api/explorer/summary", {
          headers: { Origin: "http://evil.example" },
        }),
        srv,
        { enabled: true, trustedOrigins: ["http://private-console.example"] },
      ),
    ).toContain("authority");
  });
  test("optional metadata and assistant integrations stay disabled by default", async () => {
    expect(await (await get("/api/explorer/summary")).json()).toMatchObject({
      configured: false,
      assistant: false,
      services: false,
    });
    expect((await get("/api/explorer/search")).status).toBe(503);
    expect(
      (await post("/api/explorer/chat", { messages: [{ role: "user", content: "Hello" }] })).status,
    ).toBe(503);
    expect(
      (await get("/api/explorer/summary", { headers: { Origin: "https://example.com" } })).status,
    ).toBe(403);
  });

  test("readonly metadata queries include user-selected volumes and escape LIKE patterns", async () => {
    const path = join(dataDir, "explorer.sqlite");
    const fixture = new Database(path);
    fixture.exec(
      "CREATE TABLE ntfs_entries(volume_id TEXT,record INTEGER,parent_record INTEGER,name TEXT,is_directory INTEGER,attributes INTEGER); INSERT INTO ntfs_entries VALUES ('D:',1,1,'root',1,0),('D:',2,1,'100%.txt',0,0),('E:',3,3,'other',1,0)",
    );
    fixture.close();
    const explorer = createExplorer({ databasePath: path, volume: "D:" });
    try {
      const response = await explorer.handle(
        "search",
        new Request("http://localhost/api/explorer/search?q=%25"),
      );
      expect(await response.json()).toMatchObject({
        items: [{ name: "100%.txt", path: "D:/100%.txt" }],
        more: false,
      });
      const second = new Database(path, { readonly: true });
      expect(
        (second.query("SELECT count(*) AS n FROM ntfs_entries").get() as { n: number }).n,
      ).toBe(3);
      second.close();
    } finally {
      explorer.close();
    }
  });

  test("assistant forwards configured model and streams without personal flags", async () => {
    let input: any;
    const upstream = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        input = await req.json();
        expect(req.headers.get("authorization")).toBe("Bearer test-key");
        return new Response(
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n',
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
    });
    const explorer = createExplorer({
      assistant: { baseUrl: upstream.url.href, model: "test-model", apiKey: "test-key" },
    });
    try {
      const response = await explorer.handle(
        "chat",
        new Request("http://localhost/api/explorer/chat", {
          method: "POST",
          body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
        }),
      );
      expect(await response.text()).toContain('"content":"Hello"');
      expect(input).toEqual({
        model: "test-model",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
        max_tokens: 512,
      });
      expect(response.status).toBe(200);
      expect(
        (
          await explorer.handle(
            "chat",
            new Request("http://localhost/api/explorer/chat", {
              method: "POST",
              body: '{"messages":[null]}',
            }),
          )
        ).status,
      ).toBe(400);
    } finally {
      explorer.close();
      upstream.stop(true);
    }
  });

  test("PE and hardlink queries match generic indexing schemas", async () => {
    const path = join(dataDir, "explorer-pe.sqlite");
    const fixture = new Database(path);
    fixture.exec(
      "CREATE TABLE pe_artifacts(root TEXT,path TEXT,relative_path TEXT,bytes INTEGER,sha256 TEXT,metadata_json TEXT); CREATE TABLE pe_import_edges(root TEXT,source_path TEXT,ordinal INTEGER,module TEXT,resolved_path TEXT,status TEXT,metadata_json TEXT); CREATE TABLE ntfs_entries(volume_id TEXT,record INTEGER,parent_record INTEGER,name TEXT,is_directory INTEGER,attributes INTEGER); CREATE TABLE ntfs_paths(file_id TEXT,path TEXT,record INTEGER,declared_links INTEGER)",
    );
    fixture.query("INSERT INTO pe_artifacts VALUES(?,?,?,?,?,?)").run(
      "D:/apps",
      "D:/apps/demo.dll",
      "demo.dll",
      100,
      "hash",
      JSON.stringify({
        imports: [{ module: "base.dll", functions: ["main"] }],
        sections: [],
        exports: [],
      }),
    );
    fixture.query("INSERT INTO ntfs_paths VALUES(?,?,?,?)").run("id", "D:/apps/demo.dll", 2, 1);
    fixture.close();
    const explorer = createExplorer({ databasePath: path, volume: "D:" });
    try {
      expect(
        await (
          await explorer.handle(
            "search",
            new Request("http://localhost/api/explorer/search?mode=pe&q=demo"),
          )
        ).json(),
      ).toMatchObject({ items: [{ name: "demo.dll", imports: 1 }] });
      expect(
        await (
          await explorer.handle(
            "binary",
            new Request("http://localhost/api/explorer/binary?path=D:/apps/demo.dll"),
          )
        ).json(),
      ).toMatchObject({ imports: [{ module: "base.dll", symbols: 1 }] });
      expect(
        await (
          await explorer.handle(
            "search",
            new Request("http://localhost/api/explorer/search?q=demo"),
          )
        ).json(),
      ).toMatchObject({ items: [{ path: "D:/apps/demo.dll", name: "demo.dll" }] });
    } finally {
      explorer.close();
    }
  });

  test("llama context preparation prunes old turns and preserves the final user message", async () => {
    let submitted: any;
    const upstream = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        const path = new URL(req.url).pathname;
        if (path === "/props")
          return Response.json({ default_generation_settings: { n_ctx: 600 } });
        const input = await req.json();
        if (path === "/apply-template")
          return Response.json({ prompt: input.messages.length > 1 ? "long" : "short" });
        if (path === "/tokenize")
          return Response.json({ tokens: Array(input.content === "long" ? 200 : 10).fill(1) });
        submitted = input;
        return new Response("data: [DONE]\n\n", {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
    });
    const explorer = createExplorer({
      assistant: { baseUrl: upstream.url.href, model: "test-model", llamaContext: true },
    });
    try {
      const response = await explorer.handle(
        "chat",
        new Request("http://localhost/api/explorer/chat", {
          method: "POST",
          body: JSON.stringify({
            messages: [
              { role: "user", content: "old" },
              { role: "assistant", content: "answer" },
              { role: "user", content: "new" },
            ],
          }),
        }),
      );
      expect(await response.text()).toContain("[DONE]");
      expect(submitted.messages).toEqual([{ role: "user", content: "new" }]);
      expect(response.headers.get("X-WebOS-History-Pruned")).toBe("2");
      expect(response.status).toBe(200);
    } finally {
      explorer.close();
      upstream.stop(true);
    }
  });
});

test("serves the desktop page as an HTML import", async () => {
  const res = await get("/");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('<script type="module"');
});

test("the M3 native app browser entry bundles with the aphrody M3 front left external", async () => {
  const example = fileURLToPath(new URL("../examples/m3-native-app/index.html", import.meta.url));
  const result = await Bun.build({
    entrypoints: [example],
    target: "browser",
    external: ["@aphrody/m3-front/*", "@aphrody/material-web/*"],
  });

  expect(result.success).toBe(true);
  expect(result.outputs.some((output) => output.path.endsWith("index.html"))).toBe(true);
  const app = result.outputs.find((output) => output.path.endsWith(".js"));
  expect(app).toBeDefined();
  expect(await app!.text()).toContain("@aphrody/material-web");
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
    const out = (await (await post("/api/os/exec", { command: "exit 3" })).json()) as {
      exitCode: number;
    };
    expect(out.exitCode).toBe(3);
  });

  test("eval runs JavaScript in a child bun", async () => {
    const out = (await (
      await post("/api/os/eval", { code: "Bun.semver.order('1.0.0', '2.0.0')" })
    ).json()) as {
      stdout: string;
      exitCode: number;
    };
    expect(out.stdout.trim()).toBe("-1");
    expect(out.exitCode).toBe(0);
  });

  test("history is kept in bun:sqlite", async () => {
    const rows = (await (await get("/api/os/history?limit=50")).json()) as {
      kind: string;
      input: string;
    }[];
    expect(rows.some((row) => row.kind === "shell" && row.input === "echo bun-webos")).toBe(true);
  });

  test("the PTY runs a shell on Bun.Terminal", async () => {
    const ws = new WebSocket(`${base.replace("http", "ws")}/api/os/pty?cols=80&rows=24`);
    ws.binaryType = "arraybuffer";
    const decoder = new TextDecoder();
    let output = "";
    const { promise: started, resolve: onStarted } = Promise.withResolvers<{
      type: string;
      pid: number;
      shell: string;
      bunsh: boolean;
    }>();
    const { promise: prompted, resolve: onPrompt } = Promise.withResolvers<void>();
    const { promise: echoed, resolve: onEchoed } = Promise.withResolvers<void>();
    const failure = Promise.withResolvers<never>();
    let stage = "startup";
    const deadline = setTimeout(
      () =>
        failure.reject(
          new Error(`PTY stalled during ${stage}: ${Bun.stripANSI(output).slice(-500)}`),
        ),
      20_000,
    );
    ws.onerror = () => failure.reject(new Error("PTY websocket transport failed"));
    ws.onclose = (event) =>
      failure.reject(
        new Error(`PTY websocket closed during ${stage}: ${event.code} ${event.reason}`),
      );
    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        const msg = JSON.parse(event.data);
        if (msg.type === "started") onStarted(msg);
        if (msg.type === "error") failure.reject(new Error(`PTY startup: ${msg.error}`));
        return;
      }
      output += decoder.decode(event.data as ArrayBuffer, { stream: true });
      // Input typed before the first prompt can be dropped by the shell's line editor.
      if (/[>$#]\s*$/.test(Bun.stripANSI(output))) onPrompt();
      if (output.includes("pty-webos-42-ok")) onEchoed();
    };
    try {
      const msg = await Promise.race([started, failure.promise]);
      expect(msg.pid).toBeGreaterThan(0);
      stage = `prompt (${msg.shell}, bunsh=${msg.bunsh})`;
      await Promise.race([prompted, failure.promise]);
      // Quoted fragments make the result distinct from terminal input echo.
      const powershell = /(?:powershell|pwsh)(?:\.exe)?$/i.test(msg.shell);
      const command = powershell
        ? 'Write-Output ("pty-webos-" + (40+2) + "-ok")'
        : process.platform === "win32" && !msg.bunsh
          ? "set /a webos_value=40+2\r\necho pty-webos-%webos_value%-ok"
          : 'echo pty-webos-4"2"-ok';
      ws.send(command + (process.platform === "win32" ? "\r\n" : "\n"));
      stage = `command (${msg.shell}, bunsh=${msg.bunsh})`;
      await Promise.race([echoed, failure.promise]);
      expect(output).toContain("pty-webos-42-ok");
    } finally {
      clearTimeout(deadline);
      ws.onclose = null;
      ws.close();
    }
  }, 30_000);
});

describe("files", () => {
  test("write, list, read with markdown and hash", async () => {
    expect((await post("/api/os/vfs/mkdir", { path: "/docs" })).status).toBe(200);
    const written = (await (
      await post("/api/os/vfs/write", { path: "/docs/a.md", text: "# Titre" })
    ).json()) as {
      written: number;
    };
    expect(written.written).toBe(7);
    const listing = (await (await get("/api/os/vfs/list?path=/docs")).json()) as {
      entries: { name: string }[];
    };
    expect(listing.entries.map((e) => e.name)).toEqual(["a.md"]);
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
    const found = (await (await get("/api/os/vfs/search?path=/&pattern=**/*.md")).json()) as {
      matches: string[];
    };
    expect(found.matches).toEqual(["/docs/a.md"]);
    const res = await get("/api/os/vfs/archive?path=/docs");
    expect(res.headers.get("content-type")).toBe("application/gzip");
    const files = await new Bun.Archive(await res.bytes()).files();
    expect([...files.keys()].some((name) => name.endsWith("a.md"))).toBe(true);
  });

  test("move and remove; the root cannot be removed", async () => {
    expect((await post("/api/os/vfs/move", { from: "/docs/a.md", to: "/docs/b.md" })).status).toBe(
      200,
    );
    expect((await get("/api/os/vfs/read?path=/docs/a.md")).status).toBe(404);
    expect((await post("/api/os/vfs/remove", { path: "/docs" })).status).toBe(200);
    expect((await post("/api/os/vfs/remove", { path: "/" })).status).toBe(403);
  });

  test("paths outside the home directory are refused", async () => {
    expect((await get("/api/os/vfs/list?path=../..")).status).toBe(403);
    expect((await post("/api/os/vfs/write", { path: "../escape.txt", text: "x" })).status).toBe(
      403,
    );
  });
});

describe("host guard", () => {
  test("cross-origin requests get 403", async () => {
    const res = await post(
      "/api/os/exec",
      { command: "echo no" },
      { Origin: "https://example.com" },
    );
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
    expect(out.processes.find((p) => p.pid === process.pid)?.owned).toBe(true);
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
    expect(snap.modules.map((m) => m.name)).toEqual([
      "bun:linux",
      "bun:windows",
      "bun:cosmic",
      "bun:wasm",
    ]);
  });

  test("bun:ffi dlopen reads this process id", async () => {
    const probe = (await (await get("/api/ffi/probe")).json()) as {
      ok: boolean;
      matchesProcessPid?: boolean;
    };
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
