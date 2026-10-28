import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tempDir } from "harness";
import { generate } from "../../../packages/bun-agent-plugin/src/generate.ts";
import { install, uninstall } from "../../../packages/bun-agent-plugin/src/install.ts";
import { BunPlugin } from "../../../packages/bun-agent-plugin/src/opencode-plugin.ts";

const root = resolve(import.meta.dir, "../../..");
const files = generate({ root });
const json = (path: string) => JSON.parse(String(files.get(path)));

test("adapters share skills but use native harness schemas", () => {
  for (const target of ["claude", "codex", "gemini", "opencode", "local", "agy"]) {
    expect(files.has(`${target}/skills/bun-rust-first/SKILL.md`)).toBe(true);
    expect(files.get(`${target}/skills/bun-rust-first/SKILL.md`)).toBe(
      files.get("local/skills/bun-rust-first/SKILL.md"),
    );
  }
  expect(json("gemini/hooks/hooks.json").hooks.BeforeTool[0].hooks[0].timeout).toBe(10000);
  expect(json("gemini/hooks/hooks.json").hooks.PreToolUse).toBeUndefined();
  expect(json("opencode/opencode.json").mcp).toEqual({});
  expect(files.has("opencode/hooks/hooks.json")).toBe(false);
  expect(files.has("local/hooks/hooks.json")).toBe(false);
  expect(String(files.get("opencode/plugins/bun.ts"))).toContain('"../hooks/rewrite.ts"');
  expect([...files.keys()].some(path => path.startsWith("codex/hooks/"))).toBe(false);
  expect(json("codex/.codex-plugin/plugin.json").hooks).toBeUndefined();
});

test("OpenCode leaves commands unchanged without legacy rewriting", async () => {
  const hooks = await BunPlugin({ directory: root });
  const output = { args: { command: "npm install", description: "install dependencies" } };
  await hooks["tool.execute.before"]({ tool: "bash" }, output);
  expect(output.args).toEqual({ command: "npm install", description: "install dependencies" });
  const other = { args: { command: "npm install" } };
  await hooks["tool.execute.before"]({ tool: "read" }, other);
  expect(other.args.command).toBe("npm install");
});

test("install and uninstall preserve OpenCode model and other MCP servers", () => {
  using home = tempDir("bun-adapters", {
    ".config/opencode/opencode.json": JSON.stringify({
      model: "local/current-model",
      provider: { private: { options: { baseURL: "http://localhost:1234/v1" } } },
      mcp: { other: { type: "local", command: ["other"] } },
    }),
  });
  const path = join(String(home), ".config/opencode/opencode.json");
  const initial = JSON.parse(readFileSync(path, "utf8"));
  install(files, { home: String(home), targets: ["gemini", "opencode", "local"], quiet: true });
  const merged = JSON.parse(readFileSync(path, "utf8"));
  expect(merged.model).toBe(initial.model);
  expect(merged.provider).toEqual(initial.provider);
  expect(merged.mcp.other).toEqual(initial.mcp.other);
  expect(merged.mcp.bun).toBeUndefined();
  expect(existsSync(join(String(home), ".gemini/extensions/bun/GEMINI.md"))).toBe(true);
  expect(existsSync(join(String(home), ".gemini/config/plugins/bun"))).toBe(false);
  const skill = join(String(home), ".config/opencode/skills/bun-rust-first/SKILL.md");
  writeFileSync(skill, "owner edit");
  uninstall({ home: String(home), quiet: true });
  expect(readFileSync(skill, "utf8")).toBe("owner edit");
  const removed = JSON.parse(readFileSync(path, "utf8"));
  expect(removed.mcp).toEqual(initial.mcp);
  expect(removed.provider).toEqual(initial.provider);
  expect(existsSync(join(String(home), ".config/opencode/plugins/bun.ts"))).toBe(false);
});

test("OpenCode preserves a user-owned Bun MCP server", () => {
  using home = tempDir("bun-adapter-collision", {
    ".config/opencode/opencode.json": '{"mcp":{"bun":{"type":"local","command":["custom"]}}}',
  });
  const path = join(String(home), ".config/opencode/opencode.json");
  install(files, { home: String(home), targets: ["opencode"], quiet: true });
  expect(JSON.parse(readFileSync(path, "utf8")).mcp.bun).toEqual({ type: "local", command: ["custom"] });
  uninstall({ home: String(home), quiet: true });
  expect(JSON.parse(readFileSync(path, "utf8")).mcp.bun).toEqual({ type: "local", command: ["custom"] });
});

test("Antigravity installation uses native schema and absolute hooks, separate from Gemini", () => {
  using home = tempDir("bun-agy-adapter", {});
  install(files, { home: String(home), targets: ["agy"], quiet: true });
  const pluginRoot = join(String(home), ".gemini/config/plugins/bun");
  const manifest = JSON.parse(readFileSync(join(pluginRoot, "plugin.json"), "utf8"));
  expect(Object.keys(manifest).sort()).toEqual(["description", "name"]);
  const hooks = JSON.parse(readFileSync(join(pluginRoot, "hooks.json"), "utf8"));
  expect(hooks["bun-session"].SessionStart[0].command).toContain(String(home).replaceAll("\\", "/"));
  expect(existsSync(join(pluginRoot, "gemini-extension.json"))).toBe(false);
  expect(existsSync(join(String(home), ".gemini/extensions/bun"))).toBe(false);
  uninstall({ home: String(home), quiet: true });
  expect(existsSync(pluginRoot)).toBe(false);
});

test("shared updates remove obsolete OpenCode payloads and retain installed target records", () => {
  using home = tempDir("bun-adapter-update", {});
  install(files, { home: String(home), targets: ["opencode"], quiet: true });
  const obsolete = "opencode/skills/bun-rust-first/references/current-bun.md";
  const next = new Map(files);
  next.delete(obsolete);
  install(next, { home: String(home), targets: ["local"], quiet: true });
  expect(existsSync(join(String(home), ".config/opencode/skills/bun-rust-first/references/current-bun.md"))).toBe(
    false,
  );
  const record = JSON.parse(readFileSync(join(String(home), ".bun/agent-plugin/install.json"), "utf8"));
  expect(record.targets).toEqual(["opencode", "local"]);
  uninstall({ home: String(home), quiet: true });
});

test("modified OpenCode loader prevents removal of the shared root it depends on", () => {
  using home = tempDir("bun-adapter-modified", {});
  install(files, { home: String(home), targets: ["opencode"], quiet: true });
  const plugin = join(String(home), ".config/opencode/plugins/bun.ts");
  writeFileSync(plugin, readFileSync(plugin, "utf8") + "// owner modification\n");
  expect(() => uninstall({ home: String(home), quiet: true })).toThrow("Modified OpenCode adapter preserved");
  expect(existsSync(join(String(home), ".bun/agent-plugin/opencode/plugins/bun.ts"))).toBe(true);
});

test("Gemini hook returns native argument override without Claude permission fields", async () => {
  const proc = Bun.spawn(
    [process.execPath, join(root, "packages/bun-agent-plugin/src/hooks/pre-tool-use.ts"), "gemini"],
    {
      env: { ...process.env, BUN_AGENT_PLUGIN_REWRITE: "1" },
      stdin: new Blob([
        JSON.stringify({ tool_name: "run_shell_command", tool_input: { command: "npm install" }, cwd: root }),
      ]),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const response = JSON.parse(await new Response(proc.stdout).text());
  expect(response.hookSpecificOutput.tool_input.command).toBe("bun install");
  expect(response.hookSpecificOutput.permissionDecision).toBeUndefined();
  expect(await proc.exited).toBe(0);
});
