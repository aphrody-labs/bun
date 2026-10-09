// Entry script for `bun lint`, `bun fmt`, `bun n2b`, `bun migrate`, `bun wasm` and
// `bun build --target=wasm` (src/runtime/cli/toolchain_command.rs boots it like `bun -e`).
//
// oxlint and oxfmt are not linked into Bun (+20 MB, more than the fork's size budget): the project's
// own copy is used when it has one, else the pinned version through `bun x`, which caches it.
// n2b (Node.js to Bun rules) is @aphrody/bun-plugin-n2b the same way. Rust to wasm is `bun:wasm`.
const fs = require("node:fs");
const path = require("node:path");

// The Oxc release of packages/bun-oxc (PLAN-ALPINE-BUN.md, section L): oxlint and oxfmt ship in the
// same weekly release as the oxc_* crates. bunfig.toml `[lint] version` / `[fmt] version` override them.
const OXLINT_VERSION = "1.87.0";
const OXFMT_VERSION = "0.72.0";
const N2B_PACKAGE = "@aphrody/bun-plugin-n2b";
const N2B_VERSION = "0.7.0";

const LINT_EXTENSIONS = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;
const FMT_EXTENSIONS =
  /\.(?:[cm]?[jt]sx?|json5?|jsonc|md|mdx|css|scss|less|ya?ml|toml|html|vue|graphql|gql|hbs|handlebars)$/;

const COMMANDS = ["lint", "fmt", "n2b", "migrate", "wasm", "build", "create", "c"];

type FlagSpec = Record<string, { type: "boolean" | "string" | "strings"; short?: string }>;
type Parsed = { flags: Record<string, any>; rest: string[]; positionals: string[] };

const colors = Bun.enableANSIColors && process.stdout.isTTY;
const paint = (code: string, text: string) => (colors ? `\x1b[${code}m${text}\x1b[0m` : text);

class UsageError extends Error {}

// Known flags are taken out; everything else, in order, is for the tool behind the command.
function parseFlags(args: string[], spec: FlagSpec): Parsed {
  const flags: Record<string, any> = {};
  const rest: string[] = [];
  const positionals: string[] = [];
  const short = new Map(
    Object.entries(spec)
      .filter(([, v]) => v.short)
      .map(([k, v]) => [v.short!, k]),
  );
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      rest.push(...args.slice(i + 1));
      break;
    }
    let name: string | undefined;
    let value: string | undefined;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      value = eq === -1 ? undefined : arg.slice(eq + 1);
    } else if (arg.startsWith("-") && arg.length === 2 && short.has(arg[1])) {
      name = short.get(arg[1]);
    }
    const kind = name !== undefined ? spec[name] : undefined;
    if (!kind) {
      if (!arg.startsWith("-")) positionals.push(arg);
      rest.push(arg);
      continue;
    }
    if (kind.type === "boolean") {
      flags[name!] = value === undefined ? true : value !== "false";
      continue;
    }
    if (value === undefined) {
      value = args[++i];
      if (value === undefined) throw new UsageError(`--${name} needs a value`);
    }
    if (kind.type === "strings") (flags[name!] ??= []).push(value);
    else flags[name!] = value;
  }
  return { flags, rest, positionals };
}

function bunfig(cwd: string): Record<string, any> {
  try {
    return Bun.TOML.parse(fs.readFileSync(path.join(cwd, "bunfig.toml"), "utf8")) as Record<string, any>;
  } catch (error: any) {
    if (error?.code === "ENOENT") return {};
    throw new UsageError(`bunfig.toml: ${error?.message ?? error}`);
  }
}

function strings(value: unknown, key: string): string[] {
  if (value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every(v => typeof v === "string")) return value;
  throw new UsageError(`bunfig.toml: ${key} must be a string or an array of strings`);
}

// The bin of `pkg` in the project, run with this Bun, else `bun x pkg@version`. `envName` overrides both.
function toolCommand(envName: string, pkg: string, bin: string, version: string, cwd: string): string[] {
  const override = process.env[envName];
  if (override) return /\.[cm]?[jt]s$/.test(override) ? [process.execPath, override] : [override];
  try {
    const manifest = Bun.resolveSync(`${pkg}/package.json`, path.join(cwd, "noop.js"));
    const json = JSON.parse(fs.readFileSync(manifest, "utf8"));
    const rel = typeof json.bin === "string" ? json.bin : json.bin?.[bin];
    if (rel) return [process.execPath, path.join(path.dirname(manifest), rel)];
  } catch {}
  return [process.execPath, "x", "--bun", `${pkg}@${version}`];
}

async function spawn(cmd: string[], cwd: string, capture: boolean) {
  const proc = Bun.spawn({
    cmd,
    cwd,
    env: process.env,
    stdin: "inherit",
    stdout: capture ? "pipe" : "inherit",
    stderr: "inherit",
  });
  const [stdout, exitCode] = await Promise.all([capture ? proc.stdout.text() : "", proc.exited]);
  return { stdout, exitCode };
}

async function git(args: string[], cwd: string): Promise<string[]> {
  const proc = Bun.spawn({ cmd: ["git", ...args], cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  if (exitCode !== 0) throw new UsageError(`git ${args.join(" ")}: ${stderr.trim()}`);
  return stdout
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

// Files changed in `<ref>...HEAD`, staged, unstaged and untracked, relative to `cwd`.
async function changedSince(ref: string, cwd: string, pattern: RegExp): Promise<string[]> {
  const lists = await Promise.all([
    git(["diff", "--relative", "--name-only", "--diff-filter=ACMR", `${ref}...HEAD`], cwd),
    git(["diff", "--relative", "--name-only", "--diff-filter=ACMR"], cwd),
    git(["diff", "--relative", "--name-only", "--diff-filter=ACMR", "--cached"], cwd),
    git(["ls-files", "--others", "--exclude-standard"], cwd),
  ]);
  const files = new Set<string>();
  for (const file of lists.flat()) if (pattern.test(file) && fs.existsSync(path.join(cwd, file))) files.add(file);
  return [...files].sort();
}

// Directories of the workspace packages of `cwd`, all of them or those whose name or path matches a filter.
function workspaces(cwd: string, filters: string[]): string[] {
  let manifest: any;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  } catch {
    throw new UsageError("--workspaces and --filter need a package.json with workspaces");
  }
  const patterns: string[] = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : (manifest.workspaces?.packages ?? []);
  const excluded = patterns.filter(p => p.startsWith("!")).map(p => new Bun.Glob(p.slice(1)));
  const dirs = new Set<string>();
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) continue;
    for (const file of new Bun.Glob(`${pattern.replace(/\/$/, "")}/package.json`).scanSync({ cwd, onlyFiles: true })) {
      const dir = path.dirname(file).replaceAll("\\", "/");
      if (dir.split("/").includes("node_modules") || excluded.some(g => g.match(dir))) continue;
      if (filters.length) {
        let name = "";
        try {
          name = JSON.parse(fs.readFileSync(path.join(cwd, file), "utf8")).name ?? "";
        } catch {}
        const globs = filters.map(f => new Bun.Glob(f));
        if (!globs.some(g => g.match(name) || g.match(dir) || g.match(`./${dir}`))) continue;
      }
      dirs.add(dir);
    }
  }
  if (!dirs.size) throw new UsageError(filters.length ? `No workspace matches ${filters.join(", ")}` : "No workspaces");
  return [...dirs].sort();
}

// ─── bun lint ────────────────────────────────────────────────────────────────

const LINT_HELP = `Usage: bun lint [flags] [...paths]
  Lint JavaScript and TypeScript with oxlint and the Node.js-to-Bun rules of n2b.

Flags:
      --fix                Apply safe fixes (oxlint --fix, n2b --fix)
  -f, --format=<name>      default, json, sarif, github, stylish, unix, checkstyle, junit, gitlab
      --since=<ref>        Only files changed since a git ref, plus staged, unstaged and untracked files
      --workspaces         Lint every workspace package
      --filter=<pattern>   Lint the workspace packages whose name or path matches
  -c, --config=<path>      oxlint configuration (default: .oxlintrc.json, found by oxlint)
      --no-n2b             Skip the n2b rules
      --n2b-only           Only the n2b rules
      --deny-warnings      Exit with 1 on warnings
  -h, --help               Print this help

Every other flag is passed to oxlint (for example -D correctness -A no-console, --type-aware).

bunfig.toml:
  [lint]
  config = ".oxlintrc.json"   paths = ["src"]   ignore = ["dist/**"]   n2b = true
  args = ["--deny-warnings"]  version = "${OXLINT_VERSION}"

Full documentation is available at https://bun.com/docs/runtime/lint
`;

type Diagnostic = {
  message: string;
  code: string;
  severity: "error" | "warning" | "advice";
  causes: string[];
  url?: string;
  help?: string;
  filename: string;
  labels: { span: { offset: number; length: number; line: number; column: number } }[];
  related: unknown[];
};

async function n2bFindings(roots: string[], cwd: string, opts: { fix: boolean; since?: string }) {
  const command = toolCommand("BUN_N2B", N2B_PACKAGE, "bun-plugin-n2b", N2B_VERSION, cwd);
  const diagnostics: Diagnostic[] = [];
  let exitCode = 0;
  for (const root of roots) {
    const args = [...command, "--report=json", "--agent"];
    if (opts.fix) args.push("--fix");
    const { since } = opts;
    if (since) args.push("--since", since);
    args.push(root);
    const result = await spawn(args, cwd, true);
    let report: any;
    try {
      report = JSON.parse(result.stdout);
    } catch {
      process.stderr.write(`n2b ${root}: exit ${result.exitCode}, no JSON report\n`);
      exitCode = result.exitCode || 2;
      continue;
    }
    for (const file of report.files ?? []) {
      const filename = path.relative(cwd, path.resolve(report.root ?? path.resolve(cwd, root), file.path)) || file.path;
      for (const f of file.findings ?? []) {
        if (opts.fix && f.autofix && file.changed) continue;
        diagnostics.push({
          message: f.message,
          code: `n2b(${f.rule_id})`,
          severity: f.severity === "error" ? "error" : f.severity === "warn" ? "warning" : "advice",
          causes: [],
          url: f.docs_url || undefined,
          help:
            f.replacement !== undefined ? `Use \`${f.replacement}\`${f.autofix ? " (bun lint --fix)" : ""}` : undefined,
          filename: filename.replaceAll("\\", "/"),
          labels: [
            {
              span: {
                offset: f.start_byte,
                length: Math.max(0, f.end_byte - f.start_byte),
                line: f.line,
                column: f.col,
              },
            },
          ],
          related: [],
        });
      }
    }
  }
  return { diagnostics, exitCode };
}

function printDiagnostics(diagnostics: Diagnostic[]) {
  const shown = diagnostics.filter(d => d.severity !== "advice");
  for (const d of shown) {
    const { line, column } = d.labels[0].span;
    const sev = d.severity === "error" ? paint("31", "error") : paint("33", "warning");
    process.stdout.write(
      `${paint("1", `${d.filename}:${line}:${column}`)} ${sev} ${paint("2", d.code)} ${d.message}\n`,
    );
    const { help, url } = d;
    if (help) process.stdout.write(`  ${paint("36", "help")}: ${help}\n`);
    if (url) process.stdout.write(`  ${paint("2", url)}\n`);
  }
  const errors = shown.filter(d => d.severity === "error").length;
  const warnings = shown.length - errors;
  if (shown.length) process.stdout.write(`\nn2b: ${errors} error(s), ${warnings} warning(s)\n`);
}

function sarifRun(diagnostics: Diagnostic[]) {
  const rules = [...new Set(diagnostics.map(d => d.code))].map(id => ({
    id,
    helpUri: diagnostics.find(d => d.code === id)?.url,
  }));
  return {
    tool: {
      driver: {
        name: "n2b",
        informationUri: "https://github.com/aphrody-labs/bun/tree/main/packages/bun-n2b",
        version: N2B_VERSION,
        rules,
      },
    },
    results: diagnostics.map(d => ({
      ruleId: d.code,
      level: d.severity === "error" ? "error" : d.severity === "warning" ? "warning" : "note",
      message: { text: d.help ? `${d.message}\n${d.help}` : d.message },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: d.filename },
            region: { startLine: d.labels[0].span.line, startColumn: d.labels[0].span.column },
          },
        },
      ],
    })),
  };
}

async function lint(args: string[], cwd: string): Promise<number> {
  const { flags, rest, positionals } = parseFlags(args, {
    "fix": { type: "boolean" },
    "format": { type: "string", short: "f" },
    "since": { type: "string" },
    "workspaces": { type: "boolean" },
    "filter": { type: "strings", short: "F" },
    "config": { type: "string", short: "c" },
    "n2b": { type: "boolean" },
    "no-n2b": { type: "boolean" },
    "n2b-only": { type: "boolean" },
    "deny-warnings": { type: "boolean" },
    "help": { type: "boolean", short: "h" },
  });
  if (flags.help) {
    process.stdout.write(LINT_HELP);
    return 0;
  }
  const config = bunfig(cwd).lint ?? {};
  const format: string = flags.format ?? config.format ?? "default";
  const denyWarnings = flags["deny-warnings"] ?? config["deny-warnings"] ?? false;
  const withN2b = flags["no-n2b"] ? false : (flags.n2b ?? config.n2b ?? true);
  const withOxlint = !flags["n2b-only"];

  let paths = positionals.length ? [] : strings(config.paths, "lint.paths");
  const toolArgs = [...strings(config.args, "lint.args"), ...rest];
  const { filter, since } = flags;
  if (flags.workspaces || filter) paths = workspaces(cwd, filter ?? []);
  let files: string[] | undefined;
  if (since) {
    const scope = [...paths, ...positionals].map(p => path.resolve(cwd, p));
    files = (await changedSince(since, cwd, LINT_EXTENSIONS)).filter(
      f => !scope.length || scope.some(s => path.resolve(cwd, f).startsWith(s)),
    );
    if (!files.length) {
      if (format === "default") process.stdout.write(`No changed files since ${since}\n`);
      else if (format === "json") process.stdout.write(`{"diagnostics":[]}\n`);
      return 0;
    }
  }

  let oxlintCode = 0;
  let oxlintOut = "";
  const capture = format === "json" || format === "sarif";
  if (withOxlint) {
    const cmd = [...toolCommand("BUN_OXLINT", "oxlint", "oxlint", config.version ?? OXLINT_VERSION, cwd)];
    const configPath = flags.config ?? config.config;
    if (configPath) cmd.push("--config", configPath);
    for (const pattern of strings(config.ignore, "lint.ignore")) cmd.push("--ignore-pattern", pattern);
    if (flags.fix) cmd.push("--fix");
    if (denyWarnings) cmd.push("--deny-warnings");
    if (format !== "default") cmd.push(`--format=${format}`);
    cmd.push(...toolArgs);
    if (files) cmd.push(...files.filter(f => !toolArgs.includes(f)));
    else cmd.push(...paths);
    const result = await spawn(cmd, cwd, capture);
    oxlintCode = result.exitCode;
    oxlintOut = result.stdout;
  }

  let n2b = { diagnostics: [] as Diagnostic[], exitCode: 0 };
  if (withN2b) {
    const roots = files
      ? ["."]
      : [...paths, ...positionals].filter(p => {
          try {
            return fs.statSync(path.resolve(cwd, p)).isDirectory();
          } catch {
            return false;
          }
        });
    n2b = await n2bFindings(roots.length ? roots : ["."], cwd, { fix: !!flags.fix, since: flags.since });
    if (files) {
      const wanted = new Set(files.map(f => f.replaceAll("\\", "/")));
      n2b.diagnostics = n2b.diagnostics.filter(d => wanted.has(d.filename));
    }
  }

  if (format === "json") {
    let out: any;
    try {
      out = withOxlint ? JSON.parse(oxlintOut) : { diagnostics: [] };
    } catch {
      out = { diagnostics: [], oxlint: oxlintOut };
    }
    const { diagnostics } = out;
    if (Array.isArray(diagnostics)) diagnostics.push(...n2b.diagnostics);
    else out.n2b = n2b.diagnostics;
    process.stdout.write(JSON.stringify(out) + "\n");
  } else if (format === "sarif") {
    let out: any;
    try {
      out = withOxlint ? JSON.parse(oxlintOut) : undefined;
    } catch {}
    out ??= { version: "2.1.0", $schema: "https://json.schemastore.org/sarif-2.1.0.json", runs: [] };
    if (withN2b) (out.runs ??= []).push(sarifRun(n2b.diagnostics));
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } else if (withN2b) {
    printDiagnostics(n2b.diagnostics);
  }

  const n2bFailed =
    n2b.exitCode !== 0 ||
    n2b.diagnostics.some(d => d.severity === "error" || (denyWarnings && d.severity === "warning"));
  return oxlintCode || (n2bFailed ? n2b.exitCode || 1 : 0);
}

// ─── bun fmt ─────────────────────────────────────────────────────────────────

const FMT_HELP = `Usage: bun fmt [flags] [...paths or globs]
  Format JavaScript, TypeScript, JSON, CSS, Markdown, YAML, TOML and more with oxfmt.

Flags:
      --check              Do not write; exit with 1 if a file is not formatted
      --list-different     Print the files that are not formatted
      --since=<ref>        Only files changed since a git ref, plus staged, unstaged and untracked files
      --workspaces         Format every workspace package
      --filter=<pattern>   Format the workspace packages whose name or path matches
  -c, --config=<path>      oxfmt configuration (default: .oxfmtrc.json, found by oxfmt)
  -h, --help               Print this help

Every other flag is passed to oxfmt. A path starting with ! excludes files.

bunfig.toml:
  [fmt]
  config = ".oxfmtrc.json"   paths = ["src", "test"]   ignore = ["dist/**"]   version = "${OXFMT_VERSION}"

Full documentation is available at https://bun.com/docs/runtime/fmt
`;

async function fmt(args: string[], cwd: string): Promise<number> {
  const { flags, rest, positionals } = parseFlags(args, {
    "since": { type: "string" },
    "workspaces": { type: "boolean" },
    "filter": { type: "strings", short: "F" },
    "config": { type: "string", short: "c" },
    "help": { type: "boolean", short: "h" },
  });
  if (flags.help) {
    process.stdout.write(FMT_HELP);
    return 0;
  }
  const config = bunfig(cwd).fmt ?? {};
  let paths = positionals.length ? [] : strings(config.paths, "fmt.paths");
  const { filter, since } = flags;
  if (flags.workspaces || filter) paths = workspaces(cwd, filter ?? []);
  const cmd = toolCommand("BUN_OXFMT", "oxfmt", "oxfmt", config.version ?? OXFMT_VERSION, cwd);
  const configPath = flags.config ?? config.config;
  if (configPath) cmd.push("--config", configPath);
  cmd.push(...strings(config.args, "fmt.args"), ...rest);
  if (since) {
    const scope = [...paths, ...positionals].map(p => path.resolve(cwd, p));
    const files = (await changedSince(since, cwd, FMT_EXTENSIONS)).filter(
      f => !scope.length || scope.some(s => path.resolve(cwd, f).startsWith(s)),
    );
    if (!files.length) {
      process.stdout.write(`No changed files since ${since}\n`);
      return 0;
    }
    cmd.push("--no-error-on-unmatched-pattern", ...files.filter(f => !rest.includes(f)));
  } else {
    cmd.push(...paths);
  }
  for (const pattern of strings(config.ignore, "fmt.ignore")) cmd.push(`!${pattern}`);
  return (await spawn(cmd, cwd, false)).exitCode;
}

// ─── bun n2b / bun migrate ───────────────────────────────────────────────────

const MIGRATE_HELP = `Usage: bun migrate [--dry-run] [path]
  Migrate a Node.js project to Bun: apply every n2b fix, convert pnpm workspaces, catalogs and
  overrides to package.json, remove other lockfiles and run bun install.

Flags:
      --dry-run   Print the migration plan and change nothing
  -h, --help      Print this help

Same as \`bun n2b migrate\`. \`bun n2b --help\` lists every n2b command.
`;

async function n2b(args: string[], cwd: string): Promise<number> {
  const command = toolCommand("BUN_N2B", N2B_PACKAGE, "bun-plugin-n2b", N2B_VERSION, cwd);
  // `bun n2b migrate` is the `--migrate` mode of the scan; scan, fix, report and rules are n2b verbs.
  const at = args.findIndex(a => !a.startsWith("-"));
  if (at !== -1 && args[at] === "migrate") args = [...args.slice(0, at), "--migrate", ...args.slice(at + 1)];
  return (await spawn([...command, ...args], cwd, false)).exitCode;
}

async function migrate(args: string[], cwd: string): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(MIGRATE_HELP);
    return 0;
  }
  return n2b(["--migrate", ...args], cwd);
}

// ─── bun wasm / bun build --target=wasm ──────────────────────────────────────

const WASM_HELP = `Usage: bun wasm <command> [flags]
  Build Rust crates into WebAssembly ES modules (a wasm-pack replacement).

Commands:
  build [crate]          cargo build for wasm32, wasm-bindgen, wasm-opt, package with .js and .d.ts
  opt <in.wasm>          Run wasm-opt (-Oz by default) on a module

Flags of build:
  -o, --outdir=<dir>     Output package (default: <crate>/pkg)
  -p, --package=<name>   A package of the Cargo workspace, like cargo build -p
      --artifact=<file>  Package a .wasm cargo already built, without running cargo
      --cargo=<cmd>      Run <cmd> instead of cargo (a wrapper script, cross); quote words with spaces
      --target=<t>       wasm-bindgen target: web (default), bundler, nodejs, deno, no-modules
      --wasi=<p1|p2>     wasm32-wasip1 (node:wasi loader) or wasm32-wasip2 (component, jco transpile)
      --triple=<triple>  Any Rust target triple
      --dev              Debug profile, no wasm-opt
      --profile=<name>   Cargo profile (default: release)
      --opt-level=<O>    wasm-opt level: Oz (default), Os, O0 to O4
      --no-opt           Skip wasm-opt
      --name=<name>      Base name of the generated files
      --features=<a,b>   Cargo features
      --no-default-features
      --locked           cargo --locked
      --no-typescript    No .d.ts
      --no-pack          No package.json
      --max-bytes=<n>    Fail when the .wasm is larger
  -- <cargo args>        Passed to cargo build

Same as \`bun build --target=wasm [crate] --outdir <dir>\`. In code: import { build, plugin } from "bun:wasm".

Full documentation is available at https://bun.com/docs/bundler/wasm
`;

async function wasmBuild(args: string[], cwd: string): Promise<number> {
  const { flags, rest, positionals } = parseFlags(args, {
    "outdir": { type: "string", short: "o" },
    "out-dir": { type: "string" },
    "package": { type: "string", short: "p" },
    "artifact": { type: "string" },
    "cargo": { type: "string" },
    "target": { type: "string" },
    "wasi": { type: "string" },
    "triple": { type: "string" },
    "dev": { type: "boolean" },
    "release": { type: "boolean" },
    "profile": { type: "string" },
    "opt-level": { type: "string" },
    "no-opt": { type: "boolean" },
    "name": { type: "string" },
    "features": { type: "strings" },
    "no-default-features": { type: "boolean" },
    "locked": { type: "boolean" },
    "no-typescript": { type: "boolean" },
    "no-pack": { type: "boolean" },
    "max-bytes": { type: "string" },
    "help": { type: "boolean", short: "h" },
  });
  if (flags.help) {
    process.stdout.write(WASM_HELP);
    return 0;
  }
  const dashes = args.indexOf("--");
  const cargoArgs = dashes === -1 ? [] : args.slice(dashes + 1);
  const unknown = rest.slice(0, rest.length - cargoArgs.length).find(a => a.startsWith("-"));
  if (unknown) throw new UsageError(`Unknown flag ${unknown} (cargo flags go after --)`);
  if (positionals.length > 1) throw new UsageError(`Expected one crate, got ${positionals.join(", ")}`);
  const target = flags.target === "wasm" ? undefined : flags.target;
  // Quotes keep spaces and are not escapes, so Windows paths pass unchanged.
  const cargo: string[] | undefined =
    flags.cargo === undefined
      ? undefined
      : [...flags.cargo.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)]
          .map(m => m[1] ?? m[2] ?? m[3])
          .map((word, i) => (i === 0 && /[\\/]/.test(word) ? path.resolve(cwd, word) : word));
  if (cargo?.length === 0) throw new UsageError("--cargo needs a command");
  const { build } = require(WASM_MODULE);
  const result = await build({
    crate: path.resolve(cwd, positionals[0] ?? "."),
    package: flags.package,
    artifact: flags.artifact ? path.resolve(cwd, flags.artifact) : undefined,
    cargo,
    outdir: (flags.outdir ?? flags["out-dir"]) ? path.resolve(cwd, flags.outdir ?? flags["out-dir"]) : undefined,
    target,
    wasi: flags.wasi,
    triple: flags.triple,
    profile: flags.dev ? "dev" : flags.profile,
    optimize: flags["no-opt"] ? false : flags["opt-level"]?.replace(/^-/, ""),
    name: flags.name,
    features: flags.features?.flatMap((f: string) => f.split(",")),
    noDefaultFeatures: flags["no-default-features"],
    locked: flags.locked,
    typescript: !flags["no-typescript"],
    packageJson: !flags["no-pack"],
    maxBytes: flags["max-bytes"] ? Number(flags["max-bytes"]) : undefined,
    cargoArgs,
  });
  const rel = (p: string) => path.relative(cwd, p) || ".";
  process.stdout.write(`${paint("32", "built")} ${rel(result.js)} + ${rel(result.wasm)} (${result.bytes} bytes)\n`);
  return 0;
}

// Not a string literal, so the codegen bundler leaves the builtin module to the runtime.
const WASM_MODULE = ["bun", "wasm"].join(":");

async function wasm(args: string[], cwd: string): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === "build") return wasmBuild(rest, cwd);
  if (sub === "opt") {
    const { flags, positionals } = parseFlags(rest, {
      "output": { type: "string", short: "o" },
      "level": { type: "string", short: "O" },
      "debug": { type: "boolean", short: "g" },
    });
    if (positionals.length !== 1) throw new UsageError("Usage: bun wasm opt <in.wasm> [-o out.wasm] [--level Oz]");
    const { optimize } = require(WASM_MODULE);
    const input = path.resolve(cwd, positionals[0]);
    const { before, after } = await optimize(input, {
      output: flags.output ? path.resolve(cwd, flags.output) : undefined,
      level: flags.level?.replace(/^-?O?/, "O"),
      debug: flags.debug,
    });
    process.stdout.write(`${before} -> ${after} bytes\n`);
    return 0;
  }
  process.stdout.write(WASM_HELP);
  return sub === undefined || sub === "--help" || sub === "-h" || sub === "help" ? 0 : 1;
}

// ─── bun create aphrody/<template> ───────────────────────────────────────────

const CREATE_HELP = `Usage: bun create aphrody/<template>[+<template>...] [dir] [flags]
  Create a project from the Aphrody stack templates: a Bun server (always), plus web or react,
  desktop (Tauri 3), hono or elysia. Layers are applied in order; a later file replaces an earlier one.

Examples:
  bun create aphrody/web my-app
  bun create aphrody/react+desktop my-app

Flags:
      --name=<name>        Package name (default: the directory name)
      --templates=<dir>    Directory with stack.toml (default: found as described below)
      --aphrody=<dir>      Aphrody checkout the project links to (default: the one holding the templates)
      --list               List the templates
  -h, --help               Print this help

The templates are m3/templates of an Aphrody checkout: --templates, $BUN_CREATE_APHRODY_DIR,
$YOLO_HOME/m3/templates, the checkout containing the working directory, then
$BUN_CREATE_DIR/aphrody and ~/.bun-create/aphrody.

Full documentation is available at https://bun.com/docs/runtime/templating/create
`;

const TEMPLATE_TEXT =
  /\.(?:json|ts|tsx|js|toml|md|html|css|rs|yml|yaml|txt|sh|service)$|(?:^|\/)(?:gitignore|\.gitignore|Dockerfile)$/;

function findAphrodyTemplates(cwd: string, given?: string): string {
  const candidates: string[] = [];
  if (given) candidates.push(path.resolve(cwd, given));
  const { BUN_CREATE_APHRODY_DIR, YOLO_HOME, BUN_CREATE_DIR } = process.env;
  if (BUN_CREATE_APHRODY_DIR) candidates.push(BUN_CREATE_APHRODY_DIR);
  if (YOLO_HOME) candidates.push(path.join(YOLO_HOME, "m3", "templates"));
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    candidates.push(path.join(dir, "m3", "templates"));
    if (path.dirname(dir) === dir) break;
  }
  if (BUN_CREATE_DIR) candidates.push(path.join(BUN_CREATE_DIR, "aphrody"));
  candidates.push(path.join(require("node:os").homedir(), ".bun-create", "aphrody"));
  const found = (given ? candidates.slice(0, 1) : candidates).find(dir => fs.existsSync(path.join(dir, "stack.toml")));
  if (found) return found;
  if (given) throw new UsageError(`No stack.toml in ${given}`);
  throw new UsageError(
    "The Aphrody templates were not found. Pass --templates <aphrody>/m3/templates, set YOLO_HOME, or run from an Aphrody checkout.",
  );
}

function walkFiles(dir: string, base = dir, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(abs, base, out);
    else out.push(path.relative(base, abs).replaceAll("\\", "/"));
  }
  return out;
}

function toIdent(name: string): string {
  const ident = name
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return /^[a-z_]/.test(ident) ? ident : `app_${ident}`;
}

async function create(args: string[], cwd: string): Promise<number> {
  const { flags, rest, positionals } = parseFlags(args, {
    "name": { type: "string" },
    "templates": { type: "string" },
    "aphrody": { type: "string" },
    "yolo-path": { type: "string" },
    "list": { type: "boolean" },
    "help": { type: "boolean", short: "h" },
  });
  if (flags.help) {
    process.stdout.write(CREATE_HELP);
    return 0;
  }
  const unknown = rest.find(a => a.startsWith("-"));
  if (unknown) throw new UsageError(`Unknown flag ${unknown}`);
  const [spec, dirArg, ...extra] = positionals;
  if (extra.length) throw new UsageError(`Unexpected ${extra.join(" ")}`);
  const templatesDir = findAphrodyTemplates(cwd, flags.templates);
  const stack = Bun.TOML.parse(fs.readFileSync(path.join(templatesDir, "stack.toml"), "utf8")) as any;
  const templates: Record<string, any> = stack.template ?? {};

  const { list } = flags;
  if (list || !spec?.startsWith("aphrody/")) {
    if (!list) process.stdout.write(CREATE_HELP + "\n");
    process.stdout.write(`${stack.meta?.name ?? "aphrody"} (${templatesDir})\n`);
    for (const [id, t] of Object.entries(templates))
      process.stdout.write(`  ${id.padEnd(8)} ${t.required ? "(always) " : "         "}${t.description ?? ""}\n`);
    return flags.list ? 0 : 1;
  }

  const requested = spec.slice("aphrody/".length).split(/[+,]/).filter(Boolean);
  const required = Object.entries(templates)
    .filter(([, t]) => t.required)
    .map(([id]) => id);
  const names = [...new Set([...required, ...requested])];
  for (const name of names)
    if (!templates[name])
      throw new UsageError(`Unknown template "${name}" (available: ${Object.keys(templates).join(", ")})`);
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const group = templates[name].exclusive;
    if (group) groups.set(group, [...(groups.get(group) ?? []), name]);
  }
  for (const [group, members] of groups)
    if (members.length > 1) throw new UsageError(`Choose one ${group} template: ${members.join(" or ")}`);

  // stack.toml paths are relative to the Aphrody checkout (m3/templates/<name>).
  const checkout = path.resolve(templatesDir, "..", "..");
  const templateDir = (t: any) => {
    const fromCheckout = path.resolve(checkout, t.path);
    return fs.existsSync(fromCheckout) ? fromCheckout : path.join(templatesDir, path.basename(t.path));
  };
  const aphrody = path.resolve(cwd, flags.aphrody ?? flags["yolo-path"] ?? process.env.YOLO_HOME ?? checkout);
  const target = path.resolve(cwd, dirArg ?? requested.at(-1) ?? "aphrody-app");
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0)
    throw new UsageError(`${path.relative(cwd, target) || "."} exists and is not empty`);
  const name = flags.name ?? path.basename(target);
  const substitutions: [string, string][] = [
    ["__NAME__", name],
    ["__IDENT__", toIdent(name)],
    ["__YOLO__", aphrody.replaceAll("\\", "/")],
  ];

  const written = new Map<string, string | Uint8Array>();
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  for (const id of names) {
    const dir = templateDir(templates[id]);
    for (const rel of walkFiles(dir)) {
      const dest = rel
        .split("/")
        .map(part => (part === "gitignore" ? ".gitignore" : part))
        .join("/");
      const bytes = fs.readFileSync(path.join(dir, rel));
      if (TEMPLATE_TEXT.test(rel)) {
        let text = bytes.toString("utf8");
        for (const [token, value] of substitutions) text = text.split(token).join(value);
        written.set(dest, text);
      } else written.set(dest, new Uint8Array(bytes));
    }
    Object.assign(dependencies, templates[id].dependencies ?? {});
    Object.assign(devDependencies, templates[id].dev_dependencies ?? {});
  }
  if (written.has("package.json") && (Object.keys(dependencies).length || Object.keys(devDependencies).length)) {
    const pkg = JSON.parse(written.get("package.json") as string);
    pkg.dependencies = { ...pkg.dependencies, ...dependencies };
    pkg.devDependencies = { ...pkg.devDependencies, ...devDependencies };
    written.set("package.json", JSON.stringify(pkg, null, 2) + "\n");
  }
  for (const [rel, content] of written) {
    const dest = path.join(target, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
  const shown = path.relative(cwd, target) || ".";
  process.stdout.write(
    `${paint("32", "Created")} ${shown} (${written.size} files: ${names.join(", ")})\n\n  cd ${shown}\n  bun install\n  bun run dev\n`,
  );
  return 0;
}

// ─── dispatch ────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const argv = process.argv.slice(1);
  const at = argv.findIndex(a => COMMANDS.includes(a));
  if (at === -1) throw new UsageError(`Expected one of ${COMMANDS.join(", ")}`);
  const command = argv[at];
  const args = argv.slice(at + 1);
  const cwd = process.cwd();
  switch (command) {
    case "lint":
      return lint(args, cwd);
    case "fmt":
      return fmt(args, cwd);
    case "n2b":
      return n2b(args, cwd);
    case "migrate":
      return migrate(args, cwd);
    case "wasm":
      return wasm(args, cwd);
    case "build":
      return wasmBuild(args, cwd);
    case "create":
    case "c":
      return create(args, cwd);
  }
  return 1;
}

main().then(
  code => process.exit(code),
  error => {
    if (error instanceof UsageError) {
      process.stderr.write(`${paint("31", "error")}: ${error.message}\n`);
      process.exit(1);
    }
    process.stderr.write(`${paint("31", "error")}: ${error?.message ?? error}\n`);
    process.exit(1);
  },
);
