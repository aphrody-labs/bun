// Entry script for `bun wasm`, `bun build --target=wasm` and Aphrody templates.
// Native quality and migration commands dispatch directly to their Rust owners.
const fs = require("node:fs");
const path = require("node:path");

const COMMANDS = ["wasm", "build", "create", "c"];

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
    outdir: { type: "string", short: "o" },
    "out-dir": { type: "string" },
    package: { type: "string", short: "p" },
    artifact: { type: "string" },
    cargo: { type: "string" },
    target: { type: "string" },
    wasi: { type: "string" },
    triple: { type: "string" },
    dev: { type: "boolean" },
    release: { type: "boolean" },
    profile: { type: "string" },
    "opt-level": { type: "string" },
    "no-opt": { type: "boolean" },
    name: { type: "string" },
    features: { type: "strings" },
    "no-default-features": { type: "boolean" },
    locked: { type: "boolean" },
    "no-typescript": { type: "boolean" },
    "no-pack": { type: "boolean" },
    "max-bytes": { type: "string" },
    help: { type: "boolean", short: "h" },
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
      output: { type: "string", short: "o" },
      level: { type: "string", short: "O" },
      debug: { type: "boolean", short: "g" },
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
    name: { type: "string" },
    templates: { type: "string" },
    aphrody: { type: "string" },
    "yolo-path": { type: "string" },
    list: { type: "boolean" },
    help: { type: "boolean", short: "h" },
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
