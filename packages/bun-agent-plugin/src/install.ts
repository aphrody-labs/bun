// Installs the generated plugins for Claude Code, Codex and Antigravity/Gemini CLI.
//
// Everything lands in one directory, $BUN_INSTALL/agent-plugin (~/.bun/agent-plugin), which is also the
// marketplace Claude Code and Codex read. The agents' own files are only merged into: entries added to
// ~/.claude/settings.json, a delimited block in ~/.codex/config.toml and ~/.codex/AGENTS.md, a plugin directory
// under ~/.gemini. Other plugins and settings are left as they are; `uninstall` takes back exactly what was added.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { isAphrodyBun } from "./hooks/common.ts";
import { MARKETPLACE, PLUGIN, TARGETS, type Target } from "./spec.ts";

export type { Target } from "./spec.ts";
export const ALL_TARGETS: Target[] = [...TARGETS];

export type InstallOptions = {
  /** Home directory to install into (default: the user's). Set, it also keeps the agents' CLIs out of it. */
  home?: string;
  targets?: Target[];
  dryRun?: boolean;
  quiet?: boolean;
  /** Only when the installed copy differs, and only for the targets installed before. */
  update?: boolean;
};

export type InstallReport = {
  root: string;
  version: string;
  targets: Target[];
  actions: string[];
  skipped?: string;
};

const PLUGIN_ID = `${PLUGIN}@${MARKETPLACE}`;
const BEGIN = ">>> bun-agent-plugin (managed by `bun agent-plugin install`; `bun agent-plugin uninstall` removes it)";
const END = "<<< bun-agent-plugin";

function paths(home: string, real: boolean) {
  const env = (k: string) => (real ? process.env[k] || undefined : undefined);
  return {
    root: join(env("BUN_INSTALL") ?? join(home, ".bun"), "agent-plugin"),
    claudeSettings: join(env("CLAUDE_CONFIG_DIR") ?? join(home, ".claude"), "settings.json"),
    codexHome: env("CODEX_HOME") ?? join(home, ".codex"),
    gemini: join(home, ".gemini"),
    opencode: env("OPENCODE_CONFIG_DIR") ?? join(env("XDG_CONFIG_HOME") ?? join(home, ".config"), "opencode"),
  };
}

function str(v: string | Uint8Array | undefined): string {
  return v === undefined ? "" : typeof v === "string" ? v : new TextDecoder().decode(v);
}

/** Only remove or replace installed skill trees that still equal our managed source. */
function sameTree(left: string, right: string): boolean {
  if (!existsSync(left) || !existsSync(right)) return false;
  const a = readdirSync(left, { withFileTypes: true });
  const b = readdirSync(right, { withFileTypes: true });
  if (a.length !== b.length) return false;
  return a.every(entry => {
    const peer = b.find(x => x.name === entry.name);
    if (!peer || entry.isSymbolicLink() || peer.isSymbolicLink() || entry.isDirectory() !== peer.isDirectory())
      return false;
    return entry.isDirectory()
      ? sameTree(join(left, entry.name), join(right, entry.name))
      : readFileSync(join(left, entry.name)).equals(readFileSync(join(right, entry.name)));
  });
}

/** Replaces (or appends, or with `body` undefined removes) the delimited block of a text file. */
/** Whether TOML declares the table `[parent.key]`, the key bare, single- or double-quoted (Codex rewrites quotes). */
export function hasTable(toml: string, parent: string, key: string): boolean {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*\\[${parent}\\.(?:${k}|"${k}"|'${k}')\\]\\s*$`, "m").test(toml);
}

export function upsertBlock(text: string, body: string | undefined, comment: (s: string) => string): string {
  const begin = comment(BEGIN);
  const end = comment(END);
  const block =
    body === undefined
      ? ""
      : `${begin}
${body.trimEnd()}
${end}
`;
  const i = text.indexOf(begin);
  if (i === -1) {
    if (body === undefined) return text;
    return (text.trim() ? text.replace(/\n*$/, "\n\n") : "") + block;
  }
  const j = text.indexOf(end, i);
  const before = text.slice(0, i);
  const after = j === -1 ? "" : text.slice(j + end.length).replace(/^\r?\n/, "");
  if (body !== undefined) return before + block + after;
  const rest = before.replace(/\n*$/, "\n") + after;
  return rest.trim() ? rest : "";
}

const toml = (s: string) => `# ${s}`;
const markdown = (s: string) => `<!-- ${s} -->`;

function readJson(path: string): Record<string, any> {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function bunRevision(): string {
  return typeof Bun !== "undefined" ? Bun.version_with_sha : "";
}

function which(cmd: string): boolean {
  return typeof Bun !== "undefined" ? Bun.which(cmd) !== null : false;
}

function run(cmd: string[], actions: string[], dryRun: boolean | undefined) {
  actions.push(`$ ${cmd.join(" ")}`);
  if (dryRun) return;
  const result = spawnSync(cmd[0], cmd.slice(1), {
    stdio: "ignore",
    shell: process.platform === "win32",
    windowsHide: true,
    timeout: 15000,
  });
  if (result.error || result.status !== 0)
    throw new Error(`${cmd[0]} registration failed: ${result.error?.message ?? result.status}`);
}

function detected(home: string, real: boolean): Target[] {
  const p = paths(home, real);
  const out: Target[] = [];
  if (existsSync(dirname(p.claudeSettings)) || (real && which("claude"))) out.push("claude");
  if (existsSync(p.codexHome) || (real && which("codex"))) out.push("codex");
  if (existsSync(join(p.gemini, "config")) || (real && which("agy"))) out.push("agy");
  if (existsSync(p.gemini) || (real && which("gemini"))) out.push("gemini");
  if (existsSync(p.opencode) || (real && which("opencode"))) out.push("opencode");
  return out;
}

// Prefer a `bun` link resolving to this executable: a versioned file name (bun-1.4.4) is
// read as argv0 and breaks subcommands such as `bun mcp`, and links survive upgrades.
export function stableExecutable(execPath: string = process.execPath): string {
  const ext = process.platform === "win32" ? ".exe" : "";
  let target: string;
  try {
    target = realpathSync(execPath);
  } catch {
    return execPath;
  }
  const candidates = [join(dirname(execPath), `bun${ext}`), Bun.which("bun") ?? ""];
  if (process.env.BUN_INSTALL) candidates.push(join(process.env.BUN_INSTALL, "bin", `bun${ext}`));
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (realpathSync(candidate) === target) return candidate;
    } catch {}
  }
  return execPath;
}

export function install(files: Map<string, string | Uint8Array>, options: InstallOptions = {}): InstallReport {
  const home = options.home ?? homedir();
  const real = options.home === undefined;
  const p = paths(home, real);
  const meta = JSON.parse(str(files.get("meta.json") ?? files.get("claude/meta.json")));
  const previous = readJson(join(p.root, "install.json"));
  const oldOpenCodeMcp = readJson(join(p.root, "opencode", "opencode.json")).mcp?.bun;
  const executable = typeof Bun !== "undefined" && isAphrodyBun() ? stableExecutable() : undefined;
  if (executable) {
    files = new Map(files);
    for (const path of [
      "claude/.mcp.json",
      "codex/.mcp.json",
      "agy/mcp_config.json",
      "gemini/gemini-extension.json",
      "local/mcp.json",
    ]) {
      if (!files.has(path)) continue;
      const config = JSON.parse(str(files.get(path)));
      if (config.mcpServers?.bun) config.mcpServers.bun.command = executable;
      files.set(path, JSON.stringify(config, null, 2) + "\n");
    }
    if (files.has("opencode/opencode.json")) {
      const config = JSON.parse(str(files.get("opencode/opencode.json")));
      if (config.mcp?.bun?.command) config.mcp.bun.command[0] = executable;
      files.set("opencode/opencode.json", JSON.stringify(config, null, 2) + "\n");
    }
    const config = files.get("codex/config.toml");
    if (config)
      files.set(
        "codex/config.toml",
        str(config).replace(/^command = "bun"$/m, `command = ${JSON.stringify(executable)}`),
      );
  }
  // Antigravity does not document a plugin-root variable; resolve hook paths at installation.
  if (files.has("agy/hooks.json")) {
    files = new Map(files);
    const config = JSON.parse(str(files.get("agy/hooks.json")));
    for (const group of Object.values(config) as Record<string, any>[]) {
      for (const handlers of Object.values(group) as any[][]) {
        for (const entry of handlers) {
          for (const handler of entry.hooks ?? [entry]) {
            handler.command = handler.command.replace(/hooks\/([\w-]+)\.ts/, (_: string, name: string) =>
              JSON.stringify(join(p.root, "agy", "hooks", `${name}.ts`).replaceAll("\\", "/")),
            );
          }
        }
      }
    }
    files.set("agy/hooks.json", JSON.stringify(config, null, 2) + "\n");
  }
  const actions: string[] = [];
  let targets = options.targets ?? (options.update && previous.targets ? previous.targets : detected(home, real));
  // One shared generated snapshot: refresh every previously installed adapter together.
  targets = [...new Set([...(previous.targets ?? []), ...targets])];
  const previousSkills: string[] = existsSync(join(p.root, "skills.json"))
    ? JSON.parse(readFileSync(join(p.root, "skills.json"), "utf8"))
    : [];
  if (targets.includes("agy")) {
    const dir = join(p.gemini, "config", "plugins", PLUGIN);
    if (existsSync(dir) && !sameTree(dir, join(p.root, "agy")))
      throw new Error(`Existing or modified Antigravity plugin owner: ${dir}`);
  }
  if (targets.includes("gemini")) {
    const dir = join(p.gemini, "extensions", PLUGIN);
    if (existsSync(dir) && !sameTree(dir, join(p.root, "gemini")) && !sameTree(dir, join(p.root, "agy")))
      throw new Error(`Existing Gemini extension owner: ${dir}`);
  }
  if (targets.includes("opencode")) {
    const path = real && process.env.OPENCODE_CONFIG ? process.env.OPENCODE_CONFIG : join(p.opencode, "opencode.json");
    if (!existsSync(path) && existsSync(join(p.opencode, "opencode.jsonc")))
      throw new Error(
        "OpenCode JSONC config exists: choose an explicit JSON config with OPENCODE_CONFIG; no configuration overwritten",
      );
    const config = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
    if (config.instructions !== undefined && !Array.isArray(config.instructions))
      throw new Error(`Invalid OpenCode instructions at ${path}`);
    const plugin = join(p.opencode, "plugins", "bun.ts");
    const expected = `export { BunPlugin } from ${JSON.stringify(join(p.root, "opencode", "plugins", "bun.ts").replaceAll("\\", "/"))};\n`;
    if (existsSync(plugin) && readFileSync(plugin, "utf8") !== expected)
      throw new Error(`Existing OpenCode plugin owner: ${plugin}`);
    for (const name of new Set([...previousSkills, ...JSON.parse(str(files.get("skills.json")))])) {
      const dir = join(p.opencode, "skills", name);
      if (existsSync(dir) && !sameTree(dir, join(p.root, "opencode", "skills", name)))
        throw new Error(`Existing skill owner: ${dir}`);
    }
  }
  const record = (targets: Target[]) =>
    JSON.stringify(
      {
        version: meta.version,
        bunVersion: meta.bunVersion,
        hash: meta.hash,
        bun: bunRevision(),
        executable,
        targets: [...new Set([...(previous.targets ?? []), ...targets])],
      },
      null,
      2,
    ) + "\n";
  if (options.update && !previous.hash) {
    return { root: p.root, version: meta.version, targets: [], actions, skipped: "not installed" };
  }
  if (
    options.update &&
    previous.hash === meta.hash &&
    previous.executable === executable &&
    targets.every(t => previous.targets?.includes(t))
  ) {
    if (!options.dryRun && previous.bun !== bunRevision()) writeFileSync(join(p.root, "install.json"), record(targets));
    return { root: p.root, version: meta.version, targets, actions, skipped: "up to date" };
  }
  const write = (path: string, content: string | Uint8Array) => {
    if (options.dryRun) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };

  // 1. The plugin directory, which is the marketplace of Claude Code and Codex.
  actions.push(`write ${p.root} (${files.size} files)`);
  if (!options.dryRun) {
    if (targets.includes("opencode")) {
      for (const name of previousSkills) {
        const dir = join(p.opencode, "skills", name);
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      }
    }
    for (const d of [...ALL_TARGETS, ".claude-plugin", ".agents"])
      rmSync(join(p.root, d), { recursive: true, force: true });
    for (const [rel, content] of files) write(join(p.root, rel), content);
  }

  // 2. Claude Code: a directory marketplace and the plugin enabled, in the user settings.
  if (targets.includes("claude")) {
    const settings = readJson(p.claudeSettings);
    settings.extraKnownMarketplaces ??= {};
    settings.extraKnownMarketplaces[MARKETPLACE] = {
      source: { source: "directory", path: p.root },
    };
    settings.enabledPlugins ??= {};
    settings.enabledPlugins[PLUGIN_ID] = true;
    actions.push(`merge ${p.claudeSettings}: extraKnownMarketplaces.${MARKETPLACE}, enabledPlugins.${PLUGIN_ID}`);
    write(p.claudeSettings, JSON.stringify(settings, null, 2) + "\n");
    if (real && which("claude")) {
      run(["claude", "plugin", "marketplace", "add", p.root], actions, options.dryRun);
      run(["claude", "plugin", "marketplace", "update", MARKETPLACE], actions, options.dryRun);
      run(["claude", "plugin", "install", PLUGIN_ID], actions, options.dryRun);
      run(["claude", "plugin", "update", PLUGIN_ID], actions, options.dryRun);
    }
  }

  // 3. Codex: the local marketplace and the plugin in config.toml, the rules in AGENTS.md.
  if (targets.includes("codex")) {
    const configPath = join(p.codexHome, "config.toml");
    const config = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
    const outside = upsertBlock(config, undefined, toml);
    const lines: string[] = [];
    if (!hasTable(outside, "marketplaces", MARKETPLACE))
      lines.push(`[marketplaces.${MARKETPLACE}]`, `source_type = "local"`, `source = ${JSON.stringify(p.root)}`, "");
    if (!hasTable(outside, "plugins", PLUGIN_ID)) lines.push(`[plugins."${PLUGIN_ID}"]`, "enabled = true");
    actions.push(`merge ${configPath}: marketplaces.${MARKETPLACE}, plugins."${PLUGIN_ID}"`);
    write(configPath, upsertBlock(config, lines.join("\n"), toml));
    const agentsPath = join(p.codexHome, "AGENTS.md");
    const agents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
    actions.push(`merge ${agentsPath}: Aphrody runtime rules`);
    write(agentsPath, upsertBlock(agents, str(files.get("codex/AGENTS.md")), markdown));
    // The config is the registration contract; clients vary in install/add CLI verbs.
    if (real && which("codex")) run(["codex", "plugin", "list", "--json"], actions, options.dryRun);
  }

  // 4. Antigravity is distinct from Gemini CLI.
  if (targets.includes("agy")) {
    const dirs = [join(p.gemini, "config", "plugins", PLUGIN)];
    for (const dir of dirs) {
      actions.push(`copy ${join(p.root, "agy")} -> ${dir}`);
      if (options.dryRun) continue;
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dirname(dir), { recursive: true });
      cpSync(join(p.root, "agy"), dir, { recursive: true });
    }
    if (real && which("agy")) run(["agy", "plugin", "install", join(p.root, "agy")], actions, options.dryRun);
  }

  if (targets.includes("gemini")) {
    const dir = join(p.gemini, "extensions", PLUGIN);
    actions.push(`link Gemini extension ${join(p.root, "gemini")}`);
    if (real && which("gemini")) run(["gemini", "extensions", "link", join(p.root, "gemini")], actions, options.dryRun);
    else if (!options.dryRun) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dirname(dir), { recursive: true });
      cpSync(join(p.root, "gemini"), dir, { recursive: true });
    }
  }
  if (targets.includes("opencode")) {
    const path = real && process.env.OPENCODE_CONFIG ? process.env.OPENCODE_CONFIG : join(p.opencode, "opencode.json");
    // Never replace a JSONC config or an existing server/provider definition silently.
    const config = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
    config.$schema ??= "https://opencode.ai/config.json";
    if (oldOpenCodeMcp && JSON.stringify(config.mcp?.bun) === JSON.stringify(oldOpenCodeMcp)) delete config.mcp.bun;
    config.instructions ??= [];
    const rules = join(p.root, "opencode", "AGENTS.md");
    if (!config.instructions.includes(rules)) config.instructions.push(rules);
    actions.push(`merge ${path}: instructions; install native OpenCode adapter`);
    write(path, JSON.stringify(config, null, 2) + "\n");
    // Plugin imports the shared engine from the generated root, without duplicating it.
    write(
      join(p.opencode, "plugins", "bun.ts"),
      `export { BunPlugin } from ${JSON.stringify(join(p.root, "opencode", "plugins", "bun.ts").replaceAll("\\", "/"))};\n`,
    );
    const skillsRoot = join(p.opencode, "skills");
    if (!options.dryRun) {
      mkdirSync(skillsRoot, { recursive: true });
      for (const name of JSON.parse(str(files.get("skills.json")))) {
        const dir = join(skillsRoot, name);
        cpSync(join(p.root, "opencode", "skills", name), dir, { recursive: true });
      }
    }
  }
  if (targets.includes("local"))
    actions.push(`portable MCP/skills bundle: ${join(p.root, "local")}; provider settings unchanged`);

  write(join(p.root, "install.json"), record(targets));
  if (!options.quiet) for (const a of actions) console.log(a);
  return { root: p.root, version: meta.version, targets, actions };
}

export function uninstall(options: InstallOptions = {}): InstallReport {
  const home = options.home ?? homedir();
  const real = options.home === undefined;
  const p = paths(home, real);
  const previous = readJson(join(p.root, "install.json"));
  const targets: Target[] = options.targets ?? previous.targets ?? ALL_TARGETS;
  const actions: string[] = [];
  // Refuse partial destructive uninstall when a user-edited adapter still depends on the shared root.
  for (const [target, dir, source] of [
    ["agy", join(p.gemini, "config", "plugins", PLUGIN), "agy"],
    ["agy", join(p.gemini, "antigravity-cli", "plugins", PLUGIN), "agy"],
    ["gemini", join(p.gemini, "extensions", PLUGIN), "gemini"],
  ] as const) {
    if (targets.includes(target) && existsSync(dir) && !sameTree(dir, join(p.root, source)))
      throw new Error(`Modified or unrelated adapter preserved: ${dir}`);
  }
  if (targets.includes("opencode") && previous.targets?.includes("opencode")) {
    const plugin = join(p.opencode, "plugins", "bun.ts");
    const expected = `export { BunPlugin } from ${JSON.stringify(join(p.root, "opencode", "plugins", "bun.ts").replaceAll("\\", "/"))};\n`;
    if (existsSync(plugin) && readFileSync(plugin, "utf8") !== expected)
      throw new Error(`Modified OpenCode adapter preserved with its shared root: ${plugin}`);
  }
  const write = (path: string, content: string) => !options.dryRun && writeFileSync(path, content);
  if (targets.includes("claude")) {
    if (real && which("claude")) {
      run(["claude", "plugin", "uninstall", PLUGIN_ID], actions, options.dryRun);
      run(["claude", "plugin", "marketplace", "remove", MARKETPLACE], actions, options.dryRun);
    }
    if (existsSync(p.claudeSettings)) {
      const settings = readJson(p.claudeSettings);
      delete settings.extraKnownMarketplaces?.[MARKETPLACE];
      delete settings.enabledPlugins?.[PLUGIN_ID];
      for (const key of ["extraKnownMarketplaces", "enabledPlugins"])
        if (settings[key] && !Object.keys(settings[key]).length) delete settings[key];
      actions.push(`unmerge ${p.claudeSettings}`);
      write(p.claudeSettings, JSON.stringify(settings, null, 2) + "\n");
    }
  }
  if (targets.includes("codex")) {
    for (const [file, comment] of [
      ["config.toml", toml],
      ["AGENTS.md", markdown],
    ] as const) {
      const path = join(p.codexHome, file);
      if (!existsSync(path)) continue;
      actions.push(`unmerge ${path}`);
      write(path, upsertBlock(readFileSync(path, "utf8"), undefined, comment));
    }
  }
  if (targets.includes("agy")) {
    if (real && which("agy")) run(["agy", "plugin", "uninstall", PLUGIN], actions, options.dryRun);
    for (const dir of [
      join(p.gemini, "config", "plugins", PLUGIN),
      join(p.gemini, "antigravity-cli", "plugins", PLUGIN),
    ]) {
      if (!existsSync(dir)) continue;
      actions.push(`remove ${dir}`);
      if (!options.dryRun) rmSync(dir, { recursive: true, force: true });
    }
  }
  if (targets.includes("gemini")) {
    if (real && which("gemini")) run(["gemini", "extensions", "uninstall", PLUGIN], actions, options.dryRun);
    else {
      const dir = join(p.gemini, "extensions", PLUGIN);
      actions.push(`remove ${dir}`);
      if (!options.dryRun) rmSync(dir, { recursive: true, force: true });
    }
  }
  if (targets.includes("opencode") && previous.targets?.includes("opencode")) {
    const path = real && process.env.OPENCODE_CONFIG ? process.env.OPENCODE_CONFIG : join(p.opencode, "opencode.json");
    if (existsSync(path)) {
      const config = JSON.parse(readFileSync(path, "utf8"));
      const owned = readJson(join(p.root, "opencode", "opencode.json")).mcp?.bun;
      if (owned && JSON.stringify(config.mcp?.bun) === JSON.stringify(owned)) delete config.mcp.bun;
      const rules = join(p.root, "opencode", "AGENTS.md");
      if (Array.isArray(config.instructions))
        config.instructions = config.instructions.filter((s: string) => s !== rules);
      actions.push(`unmerge ${path}: owned Bun integration`);
      write(path, JSON.stringify(config, null, 2) + "\n");
    }
    if (!options.dryRun) {
      const plugin = join(p.opencode, "plugins", "bun.ts");
      const expected = `export { BunPlugin } from ${JSON.stringify(join(p.root, "opencode", "plugins", "bun.ts").replaceAll("\\", "/"))};\n`;
      if (existsSync(plugin) && readFileSync(plugin, "utf8") === expected) rmSync(plugin);
      for (const name of readJson(join(p.root, "skills.json")) as unknown as string[]) {
        const dir = join(p.opencode, "skills", name);
        if (existsSync(dir) && sameTree(dir, join(p.root, "opencode", "skills", name)))
          rmSync(dir, { recursive: true, force: true });
      }
    }
  }
  if (
    targets.length === ALL_TARGETS.length ||
    ALL_TARGETS.every(t => targets.includes(t) || !previous.targets?.includes(t))
  ) {
    actions.push(`remove ${p.root}`);
    if (!options.dryRun) rmSync(p.root, { recursive: true, force: true });
  } else if (!options.dryRun) {
    writeFileSync(
      join(p.root, "install.json"),
      JSON.stringify({ ...previous, targets: previous.targets.filter((t: Target) => !targets.includes(t)) }, null, 2) +
        "\n",
    );
  }
  if (!options.quiet) for (const a of actions) console.log(a);
  return { root: p.root, version: previous.version ?? "", targets, actions };
}
