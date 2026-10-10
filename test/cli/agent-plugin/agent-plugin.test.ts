import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { bunEnv, bunExe, isASAN, tempDir } from "harness";
import { join, relative, resolve } from "path";
import { lspExtensions, mcpTools } from "../../../packages/bun-agent-plugin/src/catalog.ts";
import { generate } from "../../../packages/bun-agent-plugin/src/generate.ts";
import { rewriteCommand } from "../../../packages/bun-agent-plugin/src/hooks/rewrite.ts";
import { forbiddenIn } from "../../../packages/bun-agent-plugin/src/sanitize.ts";

const root = resolve(import.meta.dir, "..", "..", "..");
const pkg = join(root, "packages", "bun-agent-plugin");
const cli = join(pkg, "bin", "bun-agent-plugin.ts");

function tree(dir: string, base = dir, out: Record<string, string> = {}): Record<string, string> {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tree(p, base, out);
    else out[relative(base, p).replace(/\\/g, "/")] = readFileSync(p, "utf8");
  }
  return out;
}

async function run(cmd: string[], options: { stdin?: string; env?: Record<string, string>; cwd?: string } = {}) {
  await using proc = Bun.spawn({
    cmd,
    cwd: options.cwd,
    env: { ...bunEnv, ...options.env },
    stdin: options.stdin === undefined ? "ignore" : new TextEncoder().encode(options.stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

describe("generate", () => {
  const files = generate({ root, pkg });
  const json = (path: string) => JSON.parse(String(files.get(path)));

  test("writes the three targets and both marketplaces, with valid manifests", () => {
    const claude = json("claude/.claude-plugin/plugin.json");
    const codex = json("codex/.codex-plugin/plugin.json");
    const agy = json("agy/plugin.json");
    const gemini = json("agy/gemini-extension.json");
    const meta = json("claude/meta.json");
    for (const m of [claude, codex, agy, gemini]) {
      expect(m.name).toBe("bun");
      expect(m.version).toBe(meta.version);
    }
    expect(meta.version).toStartWith(`${meta.bunVersion}+`);
    expect(codex.interface.shortDescription.length).toBeLessThanOrEqual(30);
    expect(json(".claude-plugin/marketplace.json").plugins[0]).toMatchObject({ name: "bun", source: "./claude" });
    expect(json(".agents/plugins/marketplace.json").plugins[0].source).toEqual({ source: "local", path: "./codex" });
    for (const t of ["claude", "codex"]) {
      expect(json(`${t}/.mcp.json`).mcpServers.bun).toEqual({ type: "stdio", command: "bun", args: ["mcp"] });
      const hooks = json(`${t}/hooks/hooks.json`).hooks;
      expect(Object.keys(hooks).sort()).toEqual(["PostToolUse", "PreToolUse", "SessionStart"]);
      expect(hooks.PreToolUse[0].matcher).toBe(t === "claude" ? "Bash|Grep|Glob" : "Bash");
    }
    expect(json("agy/mcp_config.json").mcpServers.bun).toEqual({ command: "bun", args: ["mcp"] });
    expect(json("agy/hooks.json")["bun-commands"].PreToolUse[0].matcher).toBe("run_command");
    expect(String(files.get("codex/AGENTS.md"))).toContain("## Skills");
    expect(String(files.get("agy/GEMINI.md"))).toBe(String(files.get("agy/rules/AGENTS.md")));
  });

  test("ships the repository skills, the derived skills and their references in every target", () => {
    const skills = (t: string) =>
      [...new Set([...files.keys()].filter(k => k.startsWith(`${t}/skills/`)).map(k => k.split("/")[2]))].sort();
    expect(skills("claude")).toEqual(skills("codex"));
    expect(skills("claude")).toEqual(skills("agy"));
    expect(skills("claude")).toEqual(
      expect.arrayContaining([
        "bun-aphrody",
        "bun-build",
        "bun-crates",
        "bun-docs",
        "bun-runtime",
        "bun-tests",
        "verify",
      ]),
    );
    for (const name of skills("claude")) {
      const md = String(files.get(`claude/skills/${name}/SKILL.md`));
      expect(md).toMatch(new RegExp(`^---\\nname: "?${name}"?\\ndescription: `));
      for (const [, link] of md.matchAll(/\]\((references\/[\w.-]+\.md)\)/g))
        expect(files.has(`claude/skills/${name}/${link}`)).toBe(true);
    }
  });

  test(
    "is deterministic and leaks no personal path, address or credential",
    () => {
      const again = generate({ root, pkg });
      expect([...again.keys()]).toEqual([...files.keys()]);
      for (const [k, v] of files) {
        expect(again.get(k)).toEqual(v);
        if (typeof v === "string") expect(forbiddenIn(v)).toBeUndefined();
      }
    },
    isASAN ? 15000 : 5000,
  );

  test("declares the tools of `bun mcp` and the languages of `bun lsp` as their sources define them", () => {
    const tools = mcpTools(root).map(t => t.name);
    expect(tools).toEqual(expect.arrayContaining(["graph_symbols", "docs_search", "git_ingest"]));
    expect(json("claude/hooks/tools.json").tools).toEqual(tools);
    const lsp = lspExtensions(root);
    const declared = json("claude/.claude-plugin/plugin.json").lspServers;
    if (Object.keys(lsp).length)
      expect(declared).toEqual({ bun: { command: "bun", args: ["lsp", "--stdio"], extensionToLanguage: lsp } });
    for (const t of ["claude", "codex", "agy"])
      expect(String(files.get(`${t}/skills/bun-aphrody/SKILL.md`))).toContain("`graph_symbols`");
  });

  test("reads tool names, constants and agent tools from a checkout's sources", () => {
    using dir = tempDir("agent-plugin-catalog", {
      "src/mcp/tools/mod.rs":
        "pub(crate) const BUILTIN: &[&[Tool]] = &[\n    alpha::TOOLS,\n    host::TOOLS,\n    agent::TOOLS,\n];\n",
      "src/mcp/tools/alpha.rs":
        'Tool {\n        name: "alpha_one",\n        title: "First",\n        description: "x",\n},\n',
      "src/mcp/tools/host.rs":
        "Tool {\n        name: bun_host::tools::FIND_NAME,\n        title: bun_host::tools::FIND_TITLE,\n},\n",
      "src/host/tools.rs": 'pub const FIND_NAME: &str = "host_find";\npub const FIND_TITLE: &str = "Find a host";\n',
      "src/mcp/tools/agent.rs": "// generated from its `tools.json`\n",
      "src/agent_tools/tools.json": JSON.stringify({ tools: [{ name: "deps_list", title: "List dependencies" }] }),
      "src/lsp/language.rs": [
        "    pub fn of_path(path: &Path) -> Option<Language> {",
        '            "rs" => Language::Rust,',
        '            "h" | "cc" => {',
        "                Language::Cpp",
        "            }",
        "            _ => return None,",
        "    }",
        "    pub fn language_id(path: &Path) -> &'static str {",
        '            "rs" => "rust",',
        '            _ => "cpp",',
        "    }",
        "",
      ].join("\n"),
    });
    expect(mcpTools(String(dir))).toEqual([
      { name: "alpha_one", title: "First" },
      { name: "host_find", title: "Find a host" },
      { name: "deps_list", title: "List dependencies" },
    ]);
    expect(lspExtensions(String(dir))).toEqual({ ".cc": "cpp", ".h": "cpp", ".rs": "rust" });
  });

  test(
    "takes more skill directories",
    () => {
      using dir = tempDir("agent-plugin-skills", {
        "extra-skill/SKILL.md": "---\nname: extra-skill\ndescription: An extra skill\n---\n\nBody\n",
      });
      const more = generate({ root, pkg, skillDirs: [String(dir)] });
      expect(String(more.get("codex/skills/extra-skill/SKILL.md"))).toContain("Body");
      expect(more.get("claude/meta.json")).not.toEqual(files.get("claude/meta.json"));
    },
    isASAN ? 15000 : 5000,
  );
});

describe("rewriteCommand", () => {
  const cases: [string, string | undefined, { bunCheckout?: boolean; aphrody?: boolean }?][] = [
    ["npm i", "bun i"],
    ["npm install", "bun install"],
    ["npm ci", "bun install --frozen-lockfile"],
    ["npm install -D typescript", "bun install --dev typescript"],
    ["yarn add -D typescript", "bun add --dev typescript"],
    ["pnpm add react", "bun add react"],
    ["npm run build -- --watch", "bun run build --watch"],
    ["npx -y prettier --write .", "bunx prettier --write ."],
    ["node script.js arg", "bun script.js arg"],
    ["cd app && npm test", "cd app && bun run test"],
    ["pip install requests", "bun uv pip install requests", { aphrody: true }],
    ["pip install requests", undefined, { aphrody: false }],
    ["bun test foo.test.ts", "bun bd test foo.test.ts", { bunCheckout: true }],
    ["bun test foo.test.ts", undefined],
    ["echo npm install", undefined],
    ["git commit -m 'npm i'", undefined],
    ["ls -la", undefined],
  ];
  for (const [input, output, options] of cases) {
    test(`${JSON.stringify(input)}${options ? ` ${JSON.stringify(options)}` : ""}`, () => {
      expect(rewriteCommand(input, options)?.command).toBe(output);
    });
  }
});

// Each test below starts bun processes; a debug build takes seconds to start one.
const SPAWN_TIMEOUT = 60_000;

describe("hooks", () => {
  const hook = (name: string) => join(pkg, "src", "hooks", `${name}.ts`);
  // Outside any Bun checkout; the hooks only read it.
  const cwd = resolve(root, "..");

  test.concurrent(
    "PreToolUse rewrites `npm i` to `bun i`, asks unless the agent runs without asking",
    async () => {
      const [ask, bypass, other] = await Promise.all([
        run([bunExe(), hook("pre-tool-use"), "claude"], {
          stdin: JSON.stringify({ tool_input: { command: "npm i" }, cwd, permission_mode: "default" }),
        }),
        run([bunExe(), hook("pre-tool-use"), "claude"], {
          stdin: JSON.stringify({ tool_input: { command: "npm i" }, cwd, permission_mode: "bypassPermissions" }),
        }),
        run([bunExe(), hook("pre-tool-use"), "claude"], {
          stdin: JSON.stringify({ tool_input: { command: "git status" }, cwd }),
        }),
      ]);
      expect(JSON.parse(ask.stdout).hookSpecificOutput).toMatchObject({
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        updatedInput: { command: "bun i" },
      });
      expect(JSON.parse(bypass.stdout).hookSpecificOutput).toMatchObject({
        permissionDecision: "allow",
        updatedInput: { command: "bun i" },
      });
      expect(other.stdout).toBe("");
      expect([ask.exitCode, bypass.exitCode, other.exitCode]).toEqual([0, 0, 0]);
    },
    SPAWN_TIMEOUT,
  );

  test.concurrent(
    "PreToolUse names the rewrite for Codex and Antigravity",
    async () => {
      const [codex, agy] = await Promise.all([
        run([bunExe(), hook("pre-tool-use"), "codex"], {
          stdin: JSON.stringify({ tool_input: { command: "npx tsc" }, cwd }),
        }),
        run([bunExe(), hook("pre-tool-use"), "agy"], {
          stdin: JSON.stringify({ toolCall: { args: { CommandLine: "node x.js" } }, workspacePaths: [cwd] }),
        }),
      ]);
      expect(JSON.parse(codex.stdout).hookSpecificOutput.permissionDecisionReason).toContain("Run instead: bunx tsc");
      expect(JSON.parse(agy.stdout)).toMatchObject({ decision: "ask", overwrite: { CommandLine: "bun x.js" } });
      expect([codex.exitCode, agy.exitCode]).toEqual([0, 0]);
    },
    SPAWN_TIMEOUT,
  );

  test.concurrent(
    "SessionStart recognizes the Aphrody runtime and the checkout",
    async () => {
      using home = tempDir("agent-plugin-session", {});
      const { stdout, exitCode } = await run([bunExe(), hook("session-start"), "claude"], {
        stdin: JSON.stringify({ cwd: root, source: "startup" }),
        env: { BUN_INSTALL: String(home) },
      });
      const context = JSON.parse(stdout).hookSpecificOutput.additionalContext;
      expect(context).toContain("(Aphrody runtime, aphrody-labs/bun)");
      expect(context).toContain("bun bd test");
      expect(exitCode).toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  test.concurrent(
    "PreToolUse names the `bun mcp` tools to prefer over Grep, once per session",
    async () => {
      using out = tempDir("agent-plugin-prefer", {});
      for (const [k, v] of generate({ root, pkg }))
        if (k.startsWith("claude/hooks/")) {
          mkdirSync(join(String(out), "hooks"), { recursive: true });
          writeFileSync(join(String(out), k.slice("claude/".length)), v);
        }
      const event = JSON.stringify({
        tool_name: "Grep",
        tool_input: { pattern: "x" },
        session_id: `t${process.pid}${Date.now()}`,
        cwd,
      });
      const prefer = join(String(out), "hooks", "pre-tool-use.ts");
      const first = await run([bunExe(), prefer, "claude"], { stdin: event });
      const second = await run([bunExe(), prefer, "claude"], { stdin: event });
      expect(JSON.parse(first.stdout).hookSpecificOutput.additionalContext).toContain(
        "mcp__plugin_bun_bun__graph_symbols",
      );
      expect(second.stdout).toBe("");
      expect([first.exitCode, second.exitCode]).toEqual([0, 0]);
    },
    SPAWN_TIMEOUT,
  );
});

describe("bun agent-plugin", () => {
  test.concurrent(
    "installs the embedded plugin and uninstalls it, leaving the other plugins as they were",
    async () => {
      const settings = { enabledPlugins: { "aphrody@aphrody": true }, theme: "dark" };
      const config = 'model = "o3"\n\n[mcp_servers.other]\ncommand = "other"\n';
      using home = tempDir("agent-plugin-home", {
        ".claude/settings.json": JSON.stringify(settings, null, 2) + "\n",
        ".codex/config.toml": config,
        ".gemini/config/.keep": "",
      });
      const h = String(home);
      const install = await run([bunExe(), "agent-plugin", "install", "--home", h, "--json"], { cwd: h });
      expect(install.stderr).toBe("");
      const report = JSON.parse(install.stdout);
      expect(report.targets).toEqual(["claude", "codex", "agy"]);

      const merged = JSON.parse(readFileSync(join(h, ".claude/settings.json"), "utf8"));
      expect(merged.enabledPlugins).toEqual({ "aphrody@aphrody": true, "bun@aphrody-bun": true });
      expect(merged.extraKnownMarketplaces["aphrody-bun"].source).toEqual({
        source: "directory",
        path: join(h, ".bun", "agent-plugin"),
      });
      const toml = readFileSync(join(h, ".codex/config.toml"), "utf8");
      expect(toml).toStartWith(config);
      expect(toml).toContain('[plugins."bun@aphrody-bun"]');
      expect(readFileSync(join(h, ".codex/AGENTS.md"), "utf8")).toContain("aphrody-labs/bun");
      const plugin = tree(join(h, ".bun/agent-plugin"));
      expect(JSON.parse(plugin["claude/.claude-plugin/plugin.json"]).name).toBe("bun");
      expect(existsSync(join(h, ".gemini/config/plugins/bun/hooks.json"))).toBe(true);

      const again = await run([bunExe(), "agent-plugin", "install", "--update", "--home", h, "--json"], { cwd: h });
      expect(JSON.parse(again.stdout).skipped).toBe("up to date");

      const uninstall = await run([bunExe(), "agent-plugin", "uninstall", "--home", h, "--quiet"], { cwd: h });
      expect(uninstall.stderr).toBe("");
      expect(JSON.parse(readFileSync(join(h, ".claude/settings.json"), "utf8"))).toEqual(settings);
      expect(readFileSync(join(h, ".codex/config.toml"), "utf8")).toBe(config);
      expect(existsSync(join(h, ".codex/AGENTS.md")) ? readFileSync(join(h, ".codex/AGENTS.md"), "utf8") : "").toBe("");
      expect(existsSync(join(h, ".gemini/config/plugins/bun"))).toBe(false);
      expect(existsSync(join(h, ".bun/agent-plugin"))).toBe(false);
      expect([install.exitCode, again.exitCode, uninstall.exitCode]).toEqual([0, 0, 0]);
    },
    SPAWN_TIMEOUT,
  );

  test.concurrent(
    "--update does nothing when the plugin was never installed",
    async () => {
      using home = tempDir("agent-plugin-update", { ".claude/settings.json": "{}\n" });
      const { stdout, exitCode } = await run(
        [bunExe(), "agent-plugin", "install", "--update", "--home", String(home), "--json"],
        { cwd: String(home) },
      );
      expect(JSON.parse(stdout).skipped).toBe("not installed");
      expect(readFileSync(join(String(home), ".claude/settings.json"), "utf8")).toBe("{}\n");
      expect(exitCode).toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  test.concurrent(
    "the package's own CLI generates the same plugin as the executable carries",
    async () => {
      using out = tempDir("agent-plugin-generate", {});
      const embedded = join(String(out), "embedded");
      const fromCheckout = join(String(out), "checkout");
      const [a, b] = await Promise.all([
        run([bunExe(), "agent-plugin", "generate", "--out", embedded, "--quiet"], { cwd: String(out) }),
        run([bunExe(), cli, "generate", "--root", root, "--out", fromCheckout, "--quiet"]),
      ]);
      expect(a.stderr + b.stderr).toBe("");
      expect(tree(embedded)).toEqual(tree(fromCheckout));
      expect([a.exitCode, b.exitCode]).toEqual([0, 0]);
    },
    SPAWN_TIMEOUT,
  );
  test.concurrent(
    "the published package installs from bundled plugins without a checkout",
    async () => {
      using directory = tempDir("agent-plugin-published", {});
      const standalone = join(String(directory), "package");
      for (const path of ["bin", "src", "package.json"])
        cpSync(join(pkg, path), join(standalone, path), { recursive: true });
      for (const [path, contents] of generate({ root, pkg })) {
        const destination = join(standalone, "plugins", path);
        mkdirSync(resolve(destination, ".."), { recursive: true });
        writeFileSync(destination, contents);
      }
      const home = join(String(directory), "home");
      mkdirSync(home);
      const { stdout, stderr, exitCode } = await run(
        [
          bunExe(),
          join(standalone, "bin/bun-agent-plugin.ts"),
          "install",
          "codex",
          "--home",
          home,
          "--dry-run",
          "--json",
        ],
        { cwd: home },
      );
      expect(stderr).toBe("");
      expect(stdout).toContain("codex");
      expect(existsSync(join(home, ".codex/config.toml"))).toBe(false);
      expect(exitCode).toBe(0);
    },
    SPAWN_TIMEOUT,
  );
});
