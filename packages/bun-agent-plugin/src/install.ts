// Installs the generated plugins for Claude Code, Codex and Antigravity/Gemini CLI.
//
// Everything lands in one directory, $BUN_INSTALL/agent-plugin (~/.bun/agent-plugin), which is also the
// marketplace Claude Code and Codex read. The agents' own files are only merged into: entries added to
// ~/.claude/settings.json, a delimited block in ~/.codex/config.toml and ~/.codex/AGENTS.md, a plugin directory
// under ~/.gemini. Other plugins and settings are left as they are; `uninstall` takes back exactly what was added.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { MARKETPLACE, PLUGIN } from "./spec.ts";

export type Target = "claude" | "codex" | "agy";
export const ALL_TARGETS: Target[] = ["claude", "codex", "agy"];

export type InstallOptions = {
  /** Home directory to install into (default: the user's). Set, it also keeps the agents' CLIs out of it. */
  home?: string;
  targets?: Target[];
  dryRun?: boolean;
  quiet?: boolean;
  /** Only when the installed copy differs, and only for the targets installed before. */
  update?: boolean;
};

export type InstallReport = { root: string; version: string; targets: Target[]; actions: string[]; skipped?: string };

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
  };
}

function str(v: string | Uint8Array | undefined): string {
  return v === undefined ? "" : typeof v === "string" ? v : new TextDecoder().decode(v);
}

/** Replaces (or appends, or with `body` undefined removes) the delimited block of a text file. */
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
  spawnSync(cmd[0], cmd.slice(1), { stdio: "ignore", shell: process.platform === "win32" });
}

function detected(home: string, real: boolean): Target[] {
  const p = paths(home, real);
  const out: Target[] = [];
  if (existsSync(dirname(p.claudeSettings)) || (real && which("claude"))) out.push("claude");
  if (existsSync(p.codexHome) || (real && which("codex"))) out.push("codex");
  if (existsSync(p.gemini) || (real && (which("agy") || which("gemini")))) out.push("agy");
  return out;
}

export function install(files: Map<string, string | Uint8Array>, options: InstallOptions = {}): InstallReport {
  const home = options.home ?? homedir();
  const real = options.home === undefined;
  const p = paths(home, real);
  const meta = JSON.parse(str(files.get("claude/meta.json")));
  const previous = readJson(join(p.root, "install.json"));
  const actions: string[] = [];
  let targets = options.targets ?? (options.update && previous.targets ? previous.targets : detected(home, real));
  const record = (targets: Target[]) =>
    JSON.stringify(
      { version: meta.version, bunVersion: meta.bunVersion, hash: meta.hash, bun: bunRevision(), targets },
      null,
      2,
    ) + "\n";
  if (options.update && !previous.hash) {
    return { root: p.root, version: meta.version, targets: [], actions, skipped: "not installed" };
  }
  if (options.update && previous.hash === meta.hash) {
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
    for (const d of ["claude", "codex", "agy", ".claude-plugin", ".agents"])
      rmSync(join(p.root, d), { recursive: true, force: true });
    for (const [rel, content] of files) write(join(p.root, rel), content);
  }

  // 2. Claude Code: a directory marketplace and the plugin enabled, in the user settings.
  if (targets.includes("claude")) {
    const settings = readJson(p.claudeSettings);
    settings.extraKnownMarketplaces ??= {};
    settings.extraKnownMarketplaces[MARKETPLACE] = { source: { source: "directory", path: p.root } };
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
    if (!outside.includes(`[marketplaces.${MARKETPLACE}]`))
      lines.push(`[marketplaces.${MARKETPLACE}]`, `source_type = "local"`, `source = ${JSON.stringify(p.root)}`, "");
    if (!outside.includes(`[plugins."${PLUGIN_ID}"]`)) lines.push(`[plugins."${PLUGIN_ID}"]`, "enabled = true");
    actions.push(`merge ${configPath}: marketplaces.${MARKETPLACE}, plugins."${PLUGIN_ID}"`);
    write(configPath, upsertBlock(config, lines.join("\n"), toml));
    const agentsPath = join(p.codexHome, "AGENTS.md");
    const agents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
    actions.push(`merge ${agentsPath}: Bun fork rules`);
    write(agentsPath, upsertBlock(agents, str(files.get("codex/AGENTS.md")), markdown));
    if (real && which("codex")) run(["codex", "plugin", "add", PLUGIN_ID], actions, options.dryRun);
  }

  // 4. Antigravity reads plugins from ~/.gemini/config/plugins; Gemini CLI extensions from ~/.gemini/extensions.
  if (targets.includes("agy")) {
    const dirs = [join(p.gemini, "config", "plugins", PLUGIN)];
    if (existsSync(join(p.gemini, "extensions")) || (real && which("gemini")))
      dirs.push(join(p.gemini, "extensions", PLUGIN));
    for (const dir of dirs) {
      actions.push(`copy ${join(p.root, "agy")} -> ${dir}`);
      if (options.dryRun) continue;
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dirname(dir), { recursive: true });
      cpSync(join(p.root, "agy"), dir, { recursive: true });
    }
  }

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
    if (real && which("codex")) run(["codex", "plugin", "remove", PLUGIN_ID], actions, options.dryRun);
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
    for (const dir of [join(p.gemini, "config", "plugins", PLUGIN), join(p.gemini, "extensions", PLUGIN)]) {
      if (!existsSync(dir)) continue;
      actions.push(`remove ${dir}`);
      if (!options.dryRun) rmSync(dir, { recursive: true, force: true });
    }
  }
  if (
    targets.length === ALL_TARGETS.length ||
    ALL_TARGETS.every(t => targets.includes(t) || !previous.targets?.includes(t))
  ) {
    actions.push(`remove ${p.root}`);
    if (!options.dryRun) rmSync(p.root, { recursive: true, force: true });
  }
  if (!options.quiet) for (const a of actions) console.log(a);
  return { root: p.root, version: previous.version ?? "", targets, actions };
}
