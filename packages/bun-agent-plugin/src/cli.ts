// bun-agent-plugin: the Bun fork as a plugin for Claude Code, Codex and Antigravity/Gemini CLI.
//
//   install [claude|codex|agy]... [--home DIR] [--dry-run] [--update] [--quiet] [--json]
//   uninstall [claude|codex|agy]... [--home DIR] [--dry-run]
//   generate [--out DIR] [--check]       write the three plugins (default: <package>/dist)
//   pack --out FILE                      the archive `bun agent-plugin` embeds
//   inputs                               the files generate reads (one per line)
//   memory --from DIR                    import memory fiches (bun-*.md), sanitized, into <package>/memory
//   doctor                               is the bun on PATH the fork, and what is installed
//
// Common options: --root DIR (the Bun checkout; default: the one this package is in), --skills DIR (more skills,
// repeatable), --from DIR (install an already generated tree, e.g. the one `bun agent-plugin` extracts).

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pack } from "./archive.ts";
import { generate, inputFiles, type Files } from "./generate.ts";
import { isFork } from "./hooks/common.ts";
import { ALL_TARGETS, install, uninstall, type Target } from "./install.ts";
import { forbiddenIn, sanitizeText } from "./sanitize.ts";

const pkg = resolve(import.meta.dir, "..");

type Args = {
  command: string;
  targets: Target[];
  root?: string;
  from?: string;
  out?: string;
  home?: string;
  skills: string[];
  dryRun: boolean;
  check: boolean;
  update: boolean;
  quiet: boolean;
  json: boolean;
};

function parse(argv: string[]): Args {
  const a: Args = {
    command: "",
    targets: [],
    skills: [],
    dryRun: false,
    check: false,
    update: false,
    quiet: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (arg.includes("=")) return arg.slice(arg.indexOf("=") + 1);
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    const flag = arg.split("=")[0];
    if (flag === "--root") a.root = resolve(value());
    else if (flag === "--from") a.from = resolve(value());
    else if (flag === "--out") a.out = resolve(value());
    else if (flag === "--home") a.home = resolve(value());
    else if (flag === "--skills") a.skills.push(resolve(value()));
    else if (arg === "--dry-run" || arg === "-n") a.dryRun = true;
    else if (arg === "--check") a.check = true;
    else if (arg === "--update") a.update = true;
    else if (arg === "--quiet" || arg === "-q") a.quiet = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "--help" || arg === "-h") a.command = "help";
    else if (!a.command) a.command = arg;
    else if (arg === "all") a.targets.push(...ALL_TARGETS);
    else if ((ALL_TARGETS as string[]).includes(arg)) a.targets.push(arg as Target);
    else throw new Error(`unknown argument ${arg} (--help)`);
  }
  a.targets = [...new Set(a.targets)];
  return a;
}

function checkoutOf(a: Args): string {
  const root = a.root ?? resolve(pkg, "..", "..");
  if (!existsSync(join(root, "scripts", "build.ts")) || !existsSync(join(root, "docs", "project", "agent-plugin.mdx")))
    throw new Error(
      `${root} is not a checkout of aphrody-labs/bun (--root, or install from the executable: bun agent-plugin install)`,
    );
  return root;
}

function readTree(dir: string, base = dir, out: Files = new Map()): Files {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) readTree(p, base, out);
    else out.set(relative(base, p).replace(/\\/g, "/"), new Uint8Array(readFileSync(p)));
  }
  return out;
}

/** The generated plugins: from --from, else generated from the checkout. */
function plugins(a: Args): Files {
  if (a.from) return readTree(a.from);
  return generate({ root: checkoutOf(a), pkg, skillDirs: a.skills });
}

/** The package itself (installer sources), as carried in the archive next to the plugins. */
function packageFiles(): Files {
  const out: Files = new Map();
  for (const rel of ["package.json", "README.md"])
    if (existsSync(join(pkg, rel))) out.set(rel, readFileSync(join(pkg, rel), "utf8"));
  for (const dir of ["bin", "src"]) for (const [rel, v] of readTree(join(pkg, dir))) out.set(`${dir}/${rel}`, v);
  return out;
}

function equal(a: string | Uint8Array, b: string | Uint8Array): boolean {
  const enc = new TextEncoder();
  const x = typeof a === "string" ? enc.encode(a) : a;
  const y = typeof b === "string" ? enc.encode(b) : b;
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

function importMemory(from: string, quiet: boolean) {
  const names = readdirSync(from)
    .filter(f => /^bun-[\w.-]+\.md$/.test(f))
    .sort();
  const shipped = new Set(names.map(f => f.slice(0, -3)));
  const dir = join(pkg, "memory");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const f of names) {
    const clean = sanitizeText(readFileSync(join(from, f), "utf8"), { shipped: n => shipped.has(n) }).trimEnd() + "\n";
    const bad = forbiddenIn(clean);
    if (bad) throw new Error(`${f}: ${bad}`);
    writeFileSync(join(dir, f), clean);
  }
  if (!quiet) console.log(`${names.length} fiches -> ${dir}`);
}

const HELP = readFileSync(import.meta.path, "utf8")
  .split("\n\n")[0]
  .replace(/^\/\/ ?/gm, "");

export async function main(argv: string[]) {
  const a = parse(argv);
  switch (a.command) {
    case "generate": {
      const files = plugins(a);
      const out = a.out ?? join(pkg, "dist");
      if (a.check) {
        const existing = existsSync(out) ? readTree(out) : new Map();
        const stale = [...files].filter(([k, v]) => !existing.has(k) || !equal(existing.get(k)!, v)).map(([k]) => k);
        const extra = [...existing.keys()].filter(k => !files.has(k));
        if (stale.length || extra.length) {
          console.error(`${out} is stale: ${[...stale, ...extra].slice(0, 10).join(", ")}`);
          process.exit(1);
        }
        if (!a.quiet) console.log(`${out}: up to date (${files.size} files)`);
        return;
      }
      rmSync(out, { recursive: true, force: true });
      for (const [rel, content] of files) {
        mkdirSync(dirname(join(out, rel)), { recursive: true });
        writeFileSync(join(out, rel), content);
      }
      if (!a.quiet) console.log(`${files.size} files -> ${out}`);
      return;
    }
    case "pack": {
      if (!a.out) throw new Error("pack needs --out FILE");
      const files: Files = new Map();
      for (const [k, v] of plugins(a)) files.set(`plugin/${k}`, v);
      for (const [k, v] of packageFiles()) files.set(`package/${k}`, v);
      const bytes = pack(files);
      mkdirSync(dirname(a.out), { recursive: true });
      // Unchanged output keeps its mtime, so the build does not relink for nothing.
      if (!existsSync(a.out) || !equal(new Uint8Array(readFileSync(a.out)), bytes)) writeFileSync(a.out, bytes);
      if (!a.quiet) console.log(`${files.size} files, ${bytes.length} bytes -> ${a.out}`);
      return;
    }
    case "inputs":
      for (const f of inputFiles(checkoutOf(a), pkg)) console.log(f);
      return;
    case "install":
    case "uninstall": {
      const options = {
        home: a.home,
        targets: a.targets.length ? a.targets : undefined,
        dryRun: a.dryRun,
        quiet: a.quiet || a.json,
        update: a.update,
      };
      const report = a.command === "install" ? install(plugins(a), options) : uninstall(options);
      if (a.json) console.log(JSON.stringify(report, null, 2));
      else if (!a.quiet && report.skipped) console.log(`bun agent plugin ${report.version}: ${report.skipped}`);
      else if (!a.quiet)
        console.log(
          `${a.command === "install" ? "installed" : "uninstalled"}: ${report.targets.join(", ") || "(no agent found)"} (${report.root})`,
        );
      return;
    }
    case "memory": {
      if (!a.from) throw new Error("memory needs --from DIR");
      importMemory(a.from, a.quiet);
      return;
    }
    case "doctor": {
      const root = join(
        a.home ? join(a.home, ".bun") : process.env.BUN_INSTALL || join(homedir(), ".bun"),
        "agent-plugin",
      );
      let installed: any;
      try {
        installed = JSON.parse(readFileSync(join(root, "install.json"), "utf8"));
      } catch {}
      const report = {
        bun: process.execPath,
        version: Bun.version_with_sha,
        fork: isFork(),
        installed: installed ?? null,
        current: installed ? installed.bunVersion === Bun.version : false,
      };
      if (a.json) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(
          `bun: ${report.bun} ${report.version}${report.fork ? " (aphrody-labs/bun fork)" : " (NOT the fork: bun upgrade, or scripts/aphrody/install.sh|ps1)"}`,
        );
        console.log(
          installed
            ? `plugin: ${installed.version} for ${installed.targets.join(", ")}${report.current ? "" : " (made for another bun: bun agent-plugin install --update)"}`
            : "plugin: not installed (bun agent-plugin install)",
        );
      }
      if (!report.fork) process.exitCode = 1;
      return;
    }
    case "":
    case "help":
      console.log(HELP);
      return;
    default:
      throw new Error(`unknown command ${a.command} (--help)`);
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`bun-agent-plugin: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
