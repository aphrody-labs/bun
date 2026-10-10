import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { bunEnv, bunExe, tempDir } from "harness";
import { join } from "path";

type Json = any;

/** `bun mcp` over stdio with an isolated home, agent directory and memory database. */
function mcp(cwd: string, home: string, extraEnv: Record<string, string> = {}, args: string[] = []) {
  const env: Record<string, string | undefined> = {
    ...bunEnv,
    HOME: home,
    USERPROFILE: home,
    BUN_INSTALL: join(home, ".bun"),
    CODEX_HOME: join(home, ".codex"),
    BUN_MCP_MEMORY_DB: join(home, "memory.db"),
    BUN_MCP_PROFILE: "generic",
    ...extraEnv,
  };
  for (const k of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "REDIS_URL", "VALKEY_URL", "BUN_MCP_MAX_TOKENS"])
    if (!(k in extraEnv)) delete env[k];
  const proc = Bun.spawn({
    cmd: [bunExe(), "mcp", ...args],
    cwd,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let id = 0;
  async function next(): Promise<Json> {
    while (true) {
      const nl = buffer.indexOf("\n");
      if (nl >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        return JSON.parse(line);
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("bun mcp closed stdout: " + (await proc.stderr.text()));
      buffer += decoder.decode(value, { stream: true });
    }
  }
  async function request(method: string, params: Json = {}): Promise<Json> {
    const message = { jsonrpc: "2.0", id: ++id, method, params };
    proc.stdin.write(JSON.stringify(message) + "\n");
    proc.stdin.flush();
    const reply = await next();
    expect(reply.id).toBe(message.id);
    return reply;
  }
  async function call(name: string, args: Json = {}) {
    const reply = await request("tools/call", { name, arguments: args });
    if (reply.error) throw new Error(JSON.stringify(reply.error));
    return reply.result as { content: { type: string; text: string }[]; isError: boolean; _meta?: { cursor: string } };
  }
  async function initialize() {
    const reply = await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    proc.stdin.flush();
    return reply;
  }
  return {
    proc,
    next,
    request,
    call,
    initialize,
    async [Symbol.asyncDispose]() {
      proc.stdin.end();
      await proc.exited;
    },
  };
}

describe.concurrent("bun mcp", () => {
  test.each(["generic", "codex", "claude", "agy"])("reads installed plugin skills for %s", async profile => {
    const target = profile === "generic" ? "codex" : profile;
    using dir = tempDir("mcp-installed-skills", {
      "runtime-install/agent/skills/installed-probe/SKILL.md": "# Legacy skill body",
      [`runtime-install/agent-plugin/${target}/skills/installed-probe/SKILL.md`]:
        "---\nname: installed-probe\ndescription: Installed plugin probe\n---\n# Installed skill body",
    });
    await using server = mcp(String(dir), String(dir), {
      BUN_INSTALL: join(String(dir), "runtime-install"),
      BUN_MCP_PROFILE: profile,
    });
    await server.initialize();
    const skill = await server.call("skill_read", { name: "installed-probe" });
    expect(skill.isError).toBe(false);
    expect(skill.content[0].text).toContain("Installed skill body");
    expect(skill.content[0].text).not.toContain("Legacy skill body");
  });

  test("initialize handshake", async () => {
    using dir = tempDir("mcp-init", {});
    await using server = mcp(String(dir), String(dir));
    const reply = await server.initialize();
    expect(reply.result.protocolVersion).toBe("2025-06-18");
    expect(reply.result.serverInfo.name).toBe("bun");
    expect(reply.result.serverInfo.version).toStartWith(Bun.version);
    expect(Object.keys(reply.result.capabilities).sort()).toEqual(["logging", "prompts", "resources", "tools"]);
    expect(reply.result.instructions).toContain("profile generic");
    expect((await server.request("ping")).result).toEqual({});
    expect((await server.request("no/such/method")).error.code).toBe(-32601);
  });

  test("an unknown protocol version gets the latest one", async () => {
    using dir = tempDir("mcp-version", {});
    await using server = mcp(String(dir), String(dir));
    const reply = await server.request("initialize", { protocolVersion: "1999-01-01", capabilities: {} });
    expect(reply.result.protocolVersion).toBe("2025-06-18");
  });

  test("tools/list is paginated", async () => {
    using dir = tempDir("mcp-list", {});
    await using server = mcp(String(dir), String(dir), { BUN_MCP_PAGE_SIZE: "4" });
    await server.initialize();
    const names: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const reply = await server.request("tools/list", cursor ? { cursor } : {});
      expect(reply.result.tools.length).toBeLessThanOrEqual(4);
      for (const tool of reply.result.tools) {
        names.push(tool.name);
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties.cursor.type).toBe("string");
        expect(typeof tool.annotations.readOnlyHint).toBe("boolean");
      }
      cursor = reply.result.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBeGreaterThan(3);
    expect(new Set(names).size).toBe(names.length);
    for (const name of [
      "docs_search",
      "docs_read",
      "skills_list",
      "skill_read",
      "memory_search",
      "memory_write",
      "graph_query",
      "graph_symbols",
      "graph_callers",
      "graph_path",
      "graph_community",
      "graph_impact",
      "vfs_find",
      "vfs_grep",
      "vfs_edit",
      "vfs_apply",
      "lsp_diagnostics",
      "run",
      "test",
    ])
      expect(names).toContain(name);
  });

  test("docs_search finds Bun.serve, docs_read pages with a cursor", async () => {
    using dir = tempDir("mcp-docs", {});
    await using server = mcp(String(dir), String(dir));
    await server.initialize();
    const search = await server.call("docs_search", { query: "Bun.serve routes", limit: 5 });
    expect(search.isError).toBe(false);
    expect(search.content[0].text).toContain("runtime/http/");

    const first = await server.call("docs_read", { path: "runtime/http/server", max_tokens: 256 });
    expect(first.isError).toBe(false);
    const cursor = first._meta?.cursor;
    expect(cursor).toMatch(/^\d+\.\d+$/);
    expect(first.content[0].text).toContain(`"cursor":"${cursor}"`);
    expect(first.content[0].text.length).toBeLessThan(256 * 4 + 300);

    const second = await server.call("docs_read", { cursor });
    expect(second.isError).toBe(false);
    expect(second.content[0].text.length).toBeGreaterThan(0);
    expect(second.content[0].text).not.toBe(first.content[0].text);

    const llms = await server.request("resources/read", { uri: "bun://docs/llms.txt" });
    expect(llms.result.contents[0].text).toStartWith("# Bun");
  });

  test("memory_write then memory_search", async () => {
    using dir = tempDir("mcp-memory", {});
    await using server = mcp(String(dir), String(dir));
    await server.initialize();
    const write = await server.call("memory_write", {
      name: "release-checklist",
      description: "How releases are cut",
      body: "Run the zebra-crossing gate before tagging a release.",
    });
    expect(write.isError).toBe(false);
    const found = await server.call("memory_search", { query: "zebra crossing" });
    expect(found.content[0].text).toContain("release-checklist");
    const none = await server.call("memory_search", { query: "unrelatedword" });
    expect(none.content[0].text).not.toContain("release-checklist");
    expect(existsSync(join(String(dir), "memory.db"))).toBe(true);
  });

  test("vfs_edit is a dry run, vfs_apply writes the previewed plan", async () => {
    using dir = tempDir("mcp-vfs", {
      "src/a.ts": "export const greeting = 'hello';\n",
      "src/b.ts": "import { greeting } from './a';\nconsole.log(greeting, 'hello');\n",
    });
    await using server = mcp(String(dir), String(dir));
    await server.initialize();
    const grep = await server.call("vfs_grep", { pattern: "hello" });
    expect(grep.content[0].text).toContain("src/a.ts");
    expect(grep.content[0].text).toContain("src/b.ts");

    const preview = await server.call("vfs_edit", {
      ops: [{ op: "replace", files: ["src"], find: "hello", replace: "bonjour" }],
    });
    expect(preview.isError).toBe(false);
    const text = preview.content[0].text;
    expect(text).toContain("Dry run");
    expect(text).toContain("-export const greeting = 'hello';");
    expect(text).toContain("+export const greeting = 'bonjour';");
    expect(readFileSync(join(String(dir), "src/a.ts"), "utf8")).toContain("hello");

    const plan = Number(text.match(/"plan": (\d+)/)![1]);
    const applied = await server.call("vfs_apply", { plan });
    expect(applied.content[0].text).toStartWith("Applied.");
    expect(applied.isError).toBe(false);
    expect(readFileSync(join(String(dir), "src/a.ts"), "utf8")).toBe("export const greeting = 'bonjour';\n");
    expect(readFileSync(join(String(dir), "src/b.ts"), "utf8")).toContain("'bonjour'");
    expect((await server.call("vfs_apply", { plan })).isError).toBe(true);

    const find = await server.call("vfs_find", { query: "b.ts" });
    expect(find.content[0].text).toContain("src/b.ts");
  });

  test("git_ingest and deps_* read the project and its installed dependencies", async () => {
    using dir = tempDir("mcp-agent-tools", {
      "package.json": JSON.stringify({ name: "app", dependencies: { "left-pad": "^1.3.0" } }),
      ".gitignore": "ignored.txt\n",
      "ignored.txt": "secret\n",
      "src/index.ts": "import leftPad from 'left-pad';\nconsole.log(leftPad('a', 3));\n",
      "node_modules/left-pad/package.json": JSON.stringify({
        name: "left-pad",
        version: "1.3.0",
        description: "String left pad",
        license: "WTFPL",
      }),
      "node_modules/left-pad/README.md": "# left-pad\n\nPads strings.\n\n## Usage\n\nleftPad('foo', 5)\n",
      "node_modules/left-pad/index.js": "module.exports = leftPad;\nfunction leftPad(str, len) {}\n",
    });
    await using server = mcp(String(dir), String(dir));
    await server.initialize();

    const ingest = (await server.call("git_ingest", { subpath: "src" })).content[0].text;
    expect(ingest).toContain("Files analyzed: 1\n");
    expect(ingest).toContain("FILE: src/index.ts");
    expect(ingest).not.toContain("secret");

    const list = JSON.parse((await server.call("deps_list", { ecosystem: "npm" })).content[0].text);
    expect(list.dependencies.map((d: Json) => [d.name, d.version])).toEqual([["left-pad", "1.3.0"]]);

    const read = JSON.parse((await server.call("deps_read", { name: "left-pad", path: "index.js" })).content[0].text);
    expect(read.content).toStartWith("module.exports = leftPad;");
    expect((await server.call("deps_read", { name: "left-pad", path: "../package.json" })).isError).toBe(true);

    const hits = JSON.parse(
      (await server.call("deps_search", { query: "leftPad", names: ["left-pad"] })).content[0].text,
    );
    expect(hits.matches.length).toBe(3);
    const docs = JSON.parse((await server.call("deps_docs", { query: "usage", names: ["left-pad"] })).content[0].text);
    expect(docs.results[0].heading).toBe("## Usage");
  });

  test("graph_path, graph_impact and graph_community walk the code graph", async () => {
    using dir = tempDir("mcp-graph", {
      "src/low.ts": `export function lowLevel() { return 1; }\n`,
      "src/mid.ts": `import { lowLevel } from "./low";\nexport function middle() { return lowLevel() + 1; }\n`,
      "src/top.ts": `import { middle } from "./mid";\nexport function topLevel() { return middle() * 2; }\n`,
    });
    await using server = mcp(String(dir), String(dir));
    const path = await server.call("graph_path", { from: "topLevel", to: "lowLevel" });
    expect(path.isError, path.content[0].text).toBe(false);
    expect(path.content[0].text).toContain("middle");
    expect(path.content[0].text).toContain("hops from");
    const explicitPath = await server.call("graph_path", { from: "topLevel()", to: "lowLevel()" });
    expect(explicitPath.isError, explicitPath.content[0].text).toBe(false);
    expect(explicitPath.content[0].text).toContain("middle");
    const impact = await server.call("graph_impact", { symbol: "lowLevel" });
    expect(impact.isError).toBe(false);
    expect(impact.content[0].text).toContain("middle");
    expect(impact.content[0].text).toContain("topLevel");
    expect(impact.content[0].text).toContain("src/top.ts");
    const community = await server.call("graph_community", {});
    expect(community.isError).toBe(false);
    expect(community.content[0].text).toContain("communities, modularity");
    const missing = await server.call("graph_impact", { symbol: "doesNotExist" });
    expect(missing.isError).toBe(true);
  });

  test("invalid JSON and unknown tools are reported", async () => {
    using dir = tempDir("mcp-errors", {});
    await using server = mcp(String(dir), String(dir));
    server.proc.stdin.write("{not json\n");
    server.proc.stdin.flush();
    const parse = await server.next();
    expect(parse.id).toBeNull();
    expect(parse.error.code).toBe(-32700);
    const unknown = await server.request("tools/call", { name: "nope" });
    expect(unknown.error.code).toBe(-32602);
    const missing = await server.call("docs_read", {});
    expect(missing.isError).toBe(true);
  });
});

describe.concurrent("bun mcp install", () => {
  test("adds the bun server to Claude, Codex and agy configs and keeps the others", async () => {
    using dir = tempDir("mcp-install", {
      ".claude.json": JSON.stringify({ numStartups: 3, mcpServers: { other: { command: "other" } } }),
      ".codex/config.toml": 'model = "x"\n\n[mcp_servers.other]\ncommand = "other"\n',
    });
    const home = String(dir);
    const env = {
      ...bunEnv,
      HOME: home,
      USERPROFILE: home,
      BUN_INSTALL: join(home, ".bun"),
      CODEX_HOME: join(home, ".codex"),
    };
    await using proc = Bun.spawn({ cmd: [bunExe(), "mcp", "install", "all"], env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stderr).toBe("");
    expect(stdout).toContain("installed claude");
    expect(stdout).toContain("installed codex");
    expect(stdout).toContain("installed agy");

    const claude = JSON.parse(readFileSync(join(home, ".claude.json"), "utf8"));
    expect(claude.numStartups).toBe(3);
    expect(claude.mcpServers.other).toEqual({ command: "other" });
    expect(claude.mcpServers.bun).toMatchObject({ type: "stdio", args: ["mcp"] });

    const codex = readFileSync(join(home, ".codex", "config.toml"), "utf8");
    expect(codex).toContain('model = "x"');
    expect(codex).toContain("[mcp_servers.other]");
    expect(codex).toContain("[mcp_servers.bun]");
    expect(codex).toContain('args = ["mcp"]');

    const agy = JSON.parse(readFileSync(join(home, ".gemini", "config", "mcp_config.json"), "utf8"));
    expect(agy.mcpServers.bun.args).toEqual(["mcp"]);

    const manifest = JSON.parse(readFileSync(join(home, ".bun", "agent", "mcp", "manifest.json"), "utf8"));
    expect(manifest.installed).toEqual(["agy", "claude", "codex"]);
    expect(manifest.tools.map((t: Json) => t.name)).toContain("docs_search");
    expect(exitCode).toBe(0);

    await using again = Bun.spawn({
      cmd: [bunExe(), "mcp", "uninstall", "codex"],
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await again.exited).toBe(0);
    const after = readFileSync(join(home, ".codex", "config.toml"), "utf8");
    expect(after).not.toContain("[mcp_servers.bun]");
    expect(after).toContain("[mcp_servers.other]");
  });

  test("tools --markdown prints the tool table", async () => {
    await using proc = Bun.spawn({ cmd: [bunExe(), "mcp", "tools", "--markdown"], env: bunEnv, stdout: "pipe" });
    const [stdout, exitCode] = await Promise.all([proc.stdout.text(), proc.exited]);
    expect(stdout).toStartWith("| Tool | Description | Arguments | Kind |");
    expect(stdout).toContain("| `docs_search` |");
    expect(exitCode).toBe(0);
  });
});

test("bun mcp --http serves streamable HTTP", async () => {
  using dir = tempDir("mcp-http", {});
  await using proc = Bun.spawn({
    cmd: [bunExe(), "mcp", "--http", "0"],
    cwd: String(dir),
    env: { ...bunEnv, HOME: String(dir), USERPROFILE: String(dir), BUN_INSTALL: join(String(dir), ".bun") },
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = proc.stderr.getReader();
  let err = "";
  while (!err.includes("\n")) {
    const { value, done } = await reader.read();
    if (done) break;
    err += new TextDecoder().decode(value);
  }
  const url = err.match(/http:\/\/\S+\/mcp/)![0];
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }),
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("mcp-session-id")).toBeTruthy();
  const body = await res.json();
  expect(body).toMatchObject({ result: { serverInfo: { name: "bun" } } });
  const note = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  expect(note.status).toBe(202);
  const foreign = await fetch(url, { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" });
  expect(foreign.status).toBe(403);
  proc.kill();
});
