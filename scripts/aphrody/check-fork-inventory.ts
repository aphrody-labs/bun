#!/usr/bin/env bun
/**
 * Consistency check of the plugin and module factory.
 *
 * `docs/project/fork-inventory.json` is the source of truth for everything the fork keeps beside upstream Bun:
 * plugins (`plugins/*` submodules built as `bun-<name>`), package submodules, crates moved to Bun OS and the
 * directories that stay. This script checks that the other lists that name the same things agree with it:
 *
 *   - `.gitmodules` (path, url, `update = none`) and the gitlink revision against `submoduleRevision`;
 *   - the plugin lists: `PLUGINS` in `src/runtime/cli/plugin_command.rs`, `plugins` in `scripts/build/plugins.ts`,
 *     the `for plugin in` loop of `aphrody-main-runtime.yml` and the docs that name every plugin;
 *   - coverage: every top-level directory of `packages/`, `plugins/`, `crates/` and `src/` is a component's path
 *     (or an upstream-owned one), and every `pending`/`stays` path exists while `moved` ones are gone;
 *   - CI runs on the official Bun canary: a `./.github/actions/setup-bun` step that needs the fork runtime
 *     (`aphrody-v*` tag, `expected-*` pins) says `runtime: fork`, and no workflow or doc other than the listed
 *     fork-binary ones uses a subcommand only the fork has (`bun n2b`, `bun mcp`, ...) unless the line says `legacy`.
 *
 * Known drift is not hidden: a component lists it in `knownDrift` (files that still disagree) and it is reported
 * as a warning; drift that is not listed is an error, and a `knownDrift` entry that no longer applies is an error.
 *
 * Adding a plugin or module: add its inventory component first (`forkMount`, `destinationRepo`,
 * `submoduleRevision`, `plugin: { cli, cargoPackage }` for a plugin), run this script, and fix every line it names.
 *
 *   bun scripts/aphrody/check-fork-inventory.ts [--root <dir>] [--json]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface Component {
  component: string;
  path: string[];
  kind: string;
  migrationState: string;
  destinationRepo?: string | null;
  forkMount?: string | null;
  forkMountUpdate?: string | null;
  submoduleRevision?: string | null;
  plugin?: { cli: string; cargoPackage: string | null };
  knownDrift?: string[];
}

export interface Inventory {
  schema: number;
  components: Component[];
  ci?: { forkBinaryWorkflows?: string[] };
}

export interface Report {
  errors: string[];
  warnings: string[];
}

export const MIGRATION_STATES = ["moved", "moved-pr-open", "pending", "stays", "dead-removed"];
/** Subcommands of `bun` that upstream Bun (canary) does not have. A step using one needs the fork binary. */
export const FORK_ONLY_COMMANDS = [
  "n2b",
  "mcp",
  "graph",
  "msvc",
  "winmd",
  "plugin",
  "agent-plugin",
  "dotnet",
  "uv",
  "vpn",
  "ssh",
  "docker",
  "just",
  "build-essential",
];
const COVERAGE_ROOTS = ["packages", "plugins", "crates", "src"];
const PLUGIN_DOCS = ["docs/project/add-ons.mdx", ".claude/skills/bun-add-ons/SKILL.md", "docs/runtime/bun-plugin.mdx"];

interface Submodule {
  path: string;
  url?: string;
  update?: string;
}

function read(root: string, rel: string): string | undefined {
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    return undefined;
  }
}

export function parseGitmodules(text: string): Submodule[] {
  const out: Submodule[] = [];
  let cur: Submodule | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\[submodule /.test(line)) {
      cur = { path: "" };
      out.push(cur);
    } else if (cur) {
      const m = /^(\w+)\s*=\s*(.*)$/.exec(line);
      if (m) (cur as unknown as Record<string, string>)[m[1]] = m[2];
    }
  }
  return out.filter(s => s.path);
}

function git(root: string, args: string[]): string | undefined {
  try {
    const r = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "ignore" });
    return r.exitCode === 0 ? r.stdout.toString() : undefined;
  } catch {
    return undefined;
  }
}

function topLevelDirs(root: string, base: string): string[] {
  const tracked = git(root, ["ls-tree", "-d", "--name-only", "HEAD", `${base}/`]);
  if (tracked !== undefined) return tracked.split(/\r?\n/).filter(Boolean);
  const dir = join(root, base);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== "node_modules" && e.name !== "target" && !e.name.startsWith("."))
    .map(e => `${base}/${e.name}`);
}

/** Directory `dir` is covered by a component path equal to it or above it. */
function covers(paths: string[], dir: string): boolean {
  return paths.some(p => dir === p || dir.startsWith(p.replace(/\/$/, "") + "/"));
}

/** Names after `for plugin in a b c; do` and every `bun-{a,b}-` brace group of a workflow. */
function workflowPluginLists(text: string): string[][] {
  const lists: string[][] = [];
  for (const m of text.matchAll(/for plugin in ([^;\n]+);/g)) lists.push(m[1].trim().split(/\s+/));
  for (const m of text.matchAll(/bun-\{([^}]+)\}-linux-x64/g)) lists.push(m[1].split(","));
  return lists;
}

/** Resolve `${{ env.NAME }}` against the workflow's own `NAME: "value"` lines. */
function resolveEnv(text: string, value: string): string {
  const m = /^\$\{\{\s*env\.(\w+)\s*\}\}$/.exec(value.trim());
  if (!m) return value.trim().replace(/^["']|["']$/g, "");
  const def = new RegExp(`^\\s*${m[1]}:\\s*["']?([^"'\\n#]+?)["']?\\s*(?:#.*)?$`, "m").exec(text);
  return def ? def[1].trim() : value.trim();
}

/** `with:` blocks of every `uses: ./.github/actions/setup-bun` step. */
export function setupBunSteps(text: string): { line: number; inputs: Record<string, string> }[] {
  const lines = text.split(/\r?\n/);
  const steps: { line: number; inputs: Record<string, string> }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:-\s+)?uses:\s*\.\/\.github\/actions\/setup-bun\s*$/.exec(lines[i]);
    if (!m) continue;
    const inputs: Record<string, string> = {};
    // The step's keys are indented like `uses` (after a `- `, two more than the dash).
    const indent = m[1].length + (lines[i].includes("- uses") ? 2 : 0);
    let inWith = false;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === "" || l.trim().startsWith("#")) continue;
      const ind = l.length - l.trimStart().length;
      if (ind < indent || (ind === indent && /^\s*-\s/.test(l))) break;
      if (ind === indent) {
        inWith = /^\s*with:\s*$/.test(l);
        continue;
      }
      if (inWith) {
        const kv = /^\s*([\w-]+):\s*(.*?)\s*$/.exec(l);
        if (kv) inputs[kv[1]] = kv[2].replace(/\s+#.*$/, "");
      }
    }
    // Steps written with `uses:` first and `with:` before it are not used here; keys before `uses` are not read.
    steps.push({ line: i + 1, inputs });
  }
  return steps;
}

function listFiles(root: string, rel: string, ext: RegExp): string[] {
  const dir = join(root, rel);
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) out.push(...listFiles(root, r, ext));
    else if (ext.test(e.name)) out.push(r);
  }
  return out;
}

export function checkForkInventory(root: string): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = read(root, "docs/project/fork-inventory.json");
  if (raw === undefined) return { errors: ["docs/project/fork-inventory.json is missing"], warnings };
  let inv: Inventory;
  try {
    inv = JSON.parse(raw);
  } catch (e) {
    return { errors: [`docs/project/fork-inventory.json is not JSON: ${(e as Error).message}`], warnings };
  }

  // ---- schema -------------------------------------------------------------------------------------------------
  const names = new Set<string>();
  for (const c of inv.components) {
    const who = `inventory component ${JSON.stringify(c.component)}`;
    if (typeof c.component !== "string" || !c.component) errors.push("inventory component without a name");
    if (names.has(c.component)) errors.push(`${who} is listed twice`);
    names.add(c.component);
    if (!Array.isArray(c.path) || c.path.length === 0 || c.path.some(p => typeof p !== "string"))
      errors.push(`${who}: path must be a non-empty array of strings`);
    if (!MIGRATION_STATES.includes(c.migrationState))
      errors.push(`${who}: migrationState ${JSON.stringify(c.migrationState)} is not one of ${MIGRATION_STATES.join(", ")}`);
    if (!c.kind) errors.push(`${who}: kind is missing`);
  }

  // Drift a component admits to, per file; used and checked below.
  const knownDrift = new Map<string, Set<string>>(); // `${component}` -> files
  const usedDrift = new Set<string>();
  for (const c of inv.components) if (c.knownDrift?.length) knownDrift.set(c.component, new Set(c.knownDrift));
  const drift = (component: string, file: string, message: string) => {
    if (knownDrift.get(component)?.has(file)) {
      usedDrift.add(`${component}\0${file}`);
      warnings.push(`${message} (known drift of ${component}: ${file})`);
    } else errors.push(message);
  };

  // ---- .gitmodules and gitlinks ----------------------------------------------------------------------------------
  const modulesText = read(root, ".gitmodules");
  const modules = modulesText === undefined ? [] : parseGitmodules(modulesText);
  const byPath = new Map(modules.map(m => [m.path, m]));
  const mounts = inv.components.filter(c => c.forkMount);
  for (const c of mounts) {
    const m = byPath.get(c.forkMount!);
    if (!m) {
      errors.push(`${c.component}: forkMount ${c.forkMount} has no .gitmodules entry`);
      continue;
    }
    const want = (c.destinationRepo ?? "").replace(/\.git$/, "");
    if (!want || m.url?.replace(/\.git$/, "") !== want)
      errors.push(`${c.component}: .gitmodules url ${m.url} differs from destinationRepo ${c.destinationRepo}`);
    const updateNone = m.update === "none";
    if (updateNone !== (c.forkMountUpdate === "none"))
      drift(c.component, ".gitmodules(update)", `${c.component}: .gitmodules update=${m.update ?? "unset"} but forkMountUpdate=${c.forkMountUpdate ?? "null"}`);
    if (c.submoduleRevision) {
      const ls = git(root, ["ls-files", "-s", "--", c.forkMount!]);
      const sha = ls && /^160000 ([0-9a-f]{40}) /.exec(ls)?.[1];
      if (ls !== undefined && !sha) errors.push(`${c.component}: ${c.forkMount} is not a gitlink in the index`);
      else if (sha && sha !== c.submoduleRevision)
        errors.push(`${c.component}: gitlink ${c.forkMount} is ${sha} but submoduleRevision is ${c.submoduleRevision}`);
    } else errors.push(`${c.component}: forkMount without submoduleRevision`);
  }
  const mounted = new Set(mounts.map(c => c.forkMount));
  for (const m of modules) {
    if (!mounted.has(m.path)) errors.push(`.gitmodules ${m.path} has no inventory component with that forkMount`);
  }

  // ---- plugin lists --------------------------------------------------------------------------------------------------
  const plugins = inv.components.filter(c => c.kind === "plugin");
  const cli = new Map<string, Component>();
  for (const c of plugins) {
    if (!c.plugin?.cli) {
      errors.push(`${c.component}: kind plugin needs plugin.cli (and plugin.cargoPackage)`);
      continue;
    }
    cli.set(c.plugin.cli, c);
    if (c.forkMount !== `plugins/${c.plugin.cli}`) errors.push(`${c.component}: forkMount must be plugins/${c.plugin.cli}`);
  }
  const compare = (file: string, found: Iterable<string> | undefined, label: string) => {
    if (found === undefined) {
      errors.push(`${file}: cannot read ${label}`);
      return;
    }
    const set = new Set(found);
    for (const [name, c] of cli) if (!set.has(name)) drift(c.component, file, `${file}: ${label} lacks plugin ${name}`);
    for (const name of set) if (!cli.has(name)) errors.push(`${file}: ${label} names ${name}, which is not an inventory plugin`);
  };
  const rs = read(root, "src/runtime/cli/plugin_command.rs");
  const rsList = rs && /const PLUGINS: &\[&str\] = &\[([^\]]*)\]/.exec(rs)?.[1];
  compare("src/runtime/cli/plugin_command.rs", rsList ? [...rsList.matchAll(/"([^"]+)"/g)].map(m => m[1]) : undefined, "PLUGINS");
  const ts = read(root, "scripts/build/plugins.ts");
  const tsEntries = ts ? [...ts.matchAll(/name:\s*"([^"]+)",\s*package:\s*"([^"]+)"/g)] : undefined;
  compare("scripts/build/plugins.ts", tsEntries?.map(m => m[1]), "plugins");
  for (const m of tsEntries ?? []) {
    const c = cli.get(m[1]);
    if (c && c.plugin?.cargoPackage !== m[2]) errors.push(`scripts/build/plugins.ts: plugin ${m[1]} builds ${m[2]}, inventory says ${c.plugin?.cargoPackage}`);
  }
  const wf = read(root, ".github/workflows/aphrody-main-runtime.yml");
  if (wf === undefined) errors.push(".github/workflows/aphrody-main-runtime.yml is missing");
  else {
    const lists = workflowPluginLists(wf);
    if (lists.length === 0) errors.push("aphrody-main-runtime.yml: no plugin loop or asset list found");
    lists.forEach((l, i) => compare(".github/workflows/aphrody-main-runtime.yml", l, `plugin list #${i + 1}`));
  }
  for (const doc of PLUGIN_DOCS) {
    const text = read(root, doc);
    if (text === undefined) {
      errors.push(`${doc} is missing`);
      continue;
    }
    for (const [name, c] of cli) if (!new RegExp("`(?:bun )?" + name + "`|bun-" + name + "\\b|plugins/" + name + "\\b").test(text)) drift(c.component, doc, `${doc} does not mention plugin ${name}`);
  }
  for (const [component, files] of knownDrift)
    for (const f of files) if (!usedDrift.has(`${component}\0${f}`)) errors.push(`${component}: knownDrift ${f} no longer applies, remove it`);

  // ---- paths and coverage ------------------------------------------------------------------------------------------
  const allPaths = inv.components.flatMap(c => [...c.path, ...(c.forkMount ? [c.forkMount] : [])]);
  for (const c of inv.components) {
    for (const p of c.path) {
      const exists = existsSync(join(root, p));
      // A local, gitignored checkout (curl-upstream) is a legitimate absentee.
      const ignored = !exists && git(root, ["check-ignore", "-q", "--", `${p}/`]) !== undefined;
      if ((c.migrationState === "pending" || c.migrationState === "stays") && !exists && !ignored)
        errors.push(`${c.component}: ${c.migrationState} path ${p} does not exist`);
      if ((c.migrationState === "dead-removed" || c.migrationState === "moved-pr-open" || c.migrationState === "moved") && exists && !c.forkMount) {
        const listing = (() => {
          try {
            return readdirSync(join(root, p)).length;
          } catch {
            return 1;
          }
        })();
        if (listing > 0) warnings.push(`${c.component}: ${c.migrationState} path ${p} still exists`);
      }
    }
  }
  for (const base of COVERAGE_ROOTS) {
    for (const dir of topLevelDirs(root, base)) {
      if (!covers(allPaths, dir)) errors.push(`${dir} is not covered by any inventory component (classify it: upstream-owned, stays, pending or dead-removed)`);
    }
  }

  // ---- CI runtime ------------------------------------------------------------------------------------------------------
  const forkBinary = new Set(inv.ci?.forkBinaryWorkflows ?? []);
  const commandRe = new RegExp(`(?:^|[\\s"'\`(;&|])bun\\s+(${FORK_ONLY_COMMANDS.join("|")})(?=[\\s"'\`);&|]|$)`);
  const ciFiles = [...listFiles(root, ".github/workflows", /\.ya?ml$/), ...listFiles(root, ".github/actions", /\.ya?ml$/)];
  for (const f of ciFiles) {
    const text = read(root, f) ?? "";
    for (const step of setupBunSteps(text)) {
      const version = resolveEnv(text, step.inputs["bun-version"] ?? "");
      const needsFork = version.startsWith("aphrody-v") || Object.keys(step.inputs).some(k => k.startsWith("expected-"));
      const runtime = step.inputs["runtime"] ?? "official";
      if (needsFork && runtime !== "fork")
        errors.push(`${f}:${step.line}: setup-bun asks for the fork runtime (${version || "expected-* pin"}) without \`runtime: fork\``);
      if (!needsFork && runtime === "fork") warnings.push(`${f}:${step.line}: \`runtime: fork\` with bun-version ${version || "(default)"}`);
    }
    if (forkBinary.has(f.replace(".github/workflows/", ""))) continue;
    text.split(/\r?\n/).forEach((line, i) => {
      const m = commandRe.exec(line);
      if (m && !/\blegacy\b/i.test(line)) errors.push(`${f}:${i + 1}: \`bun ${m[1]}\` exists only in the fork binary (add the workflow to ci.forkBinaryWorkflows or mark the line legacy)`);
    });
  }
  const docFiles = ["package.json", "justfile", ...listFiles(root, "scripts/build", /\.md$/)];
  for (const f of docFiles) {
    (read(root, f) ?? "").split(/\r?\n/).forEach((line, i) => {
      const m = commandRe.exec(line);
      if (m && !/\blegacy\b/i.test(line) && !/\bwhen the running bun\b/i.test(line))
        errors.push(`${f}:${i + 1}: \`bun ${m[1]}\` exists only in the fork binary (mark the line legacy or use an upstream command)`);
    });
  }
  return { errors, warnings };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--root");
  const root = resolve(at >= 0 ? args[at + 1] : join(import.meta.dir, "..", ".."));
  const report = checkForkInventory(root);
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    for (const w of report.warnings) console.log(`warning: ${w}`);
    for (const e of report.errors) console.log(`error: ${e}`);
    console.log(`fork inventory: ${report.errors.length} errors, ${report.warnings.length} warnings`);
  }
  process.exit(report.errors.length ? 1 : 0);
}
