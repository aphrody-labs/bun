// The fork publishes its npm packages under the @aphrody scope. This file is
// the single source of truth for that rename: `rewrite()` maps upstream text to
// the fork's names and is idempotent, so the upstream sync can apply it to both
// sides of a three-way merge and the rename never conflicts.
//
//   bun scripts/aphrody/scope.ts --check   list files that still use upstream names (exit 1 if any)
//   bun scripts/aphrody/scope.ts --write   rewrite them in place

import { join } from "node:path";

export const SCOPE = "@aphrody";

// Upstream package name → `${SCOPE}/${name}`. Only packages/** is managed: the
// runtime (`bun init`, `bun check`), the docs site and the test fixtures keep
// talking about the real npm packages.
export const RENAMED: readonly string[] = [
  "bun-types",
  "bun-inspector-protocol",
  "bun-debug-adapter-protocol",
  "bun-plugin-svelte",
  "bun-plugin-yaml",
  "bun-mdx-rs",
  "web-inspector-bun",
];

const MANIFEST = /(?:^|\/)package\.json$/;
const CODE = /\.[cm]?[jt]sx?$/;
const PROSE = /\.(?:mdx?|svelte|html)$|(?:^|\/)bunfig\.toml$/;
const LOCAL_SPEC = /^(?:workspace|file|link):/;
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const PLATFORM_SUFFIX = "-(?:darwin|linux|win32|freebsd|android)-";

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scopedName(name: string): string {
  if (RENAMED.includes(name)) return `${SCOPE}/${name}`;
  if (new RegExp(`^bun-mdx-rs${PLATFORM_SUFFIX}`).test(name)) return `${SCOPE}/${name}`;
  return name;
}

// In code only exact string literals are package names (`"bun-types"`,
// `"bun-types/x"`); paths like "../bun-types" and file names like
// "bun-mdx-rs.linux-x64-gnu.node" are not.
const CODE_RULES = RENAMED.map(name => ({
  re: new RegExp(`(["'])${escape(name)}(?=["'/]|${PLATFORM_SUFFIX})`, "g"),
  to: `$1${SCOPE}/${name}`,
}));

// In prose, a bare word that is not part of a path, URL, file name or longer
// identifier.
const PROSE_RULES = [
  { re: /(?<![\w@/.-])@types\/bun(?![\w/-])/g, to: `${SCOPE}/bun-types` },
  ...RENAMED.map(name => ({
    re: new RegExp(`(?<![\\w@/.-])${escape(name)}(?!\\w|\\.\\w)`, "g"),
    to: `${SCOPE}/${name}`,
  })),
];

export function isManaged(path: string): boolean {
  const p = path.replaceAll("\\", "/");
  if (!p.startsWith("packages/") || p.includes("/node_modules/")) return false;
  return MANIFEST.test(p) || CODE.test(p) || PROSE.test(p);
}

// A manifest keeps registry dependencies on the real npm packages; only its
// own name and dependencies resolved from this checkout follow the rename.
// Lockfiles are left to `bun install`.
function rewriteManifest(text: string): string {
  const pkg = JSON.parse(text);
  let out = text;
  const rename = (key: string, value: string) => {
    out = out.replace(`${JSON.stringify(key)}: ${JSON.stringify(value)}`, () => {
      return `${JSON.stringify(key === "name" ? key : scopedName(key))}: ${JSON.stringify(key === "name" ? scopedName(value) : value)}`;
    });
  };
  if (typeof pkg.name === "string" && scopedName(pkg.name) !== pkg.name) rename("name", pkg.name);
  for (const field of DEP_FIELDS) {
    for (const [dep, spec] of Object.entries(pkg[field] ?? {})) {
      if (typeof spec === "string" && LOCAL_SPEC.test(spec) && scopedName(dep) !== dep) rename(dep, spec);
    }
  }
  return out;
}

export function rewrite(path: string, text: string): string {
  if (!isManaged(path)) return text;
  const p = path.replaceAll("\\", "/");
  if (MANIFEST.test(p)) return rewriteManifest(text);
  if (CODE.test(p)) return CODE_RULES.reduce((t, { re, to }) => t.replace(re, to), text);
  // Lines that mention "upstream" describe the upstream names on purpose.
  return text
    .split("\n")
    .map(line => (/upstream/i.test(line) ? line : PROSE_RULES.reduce((l, { re, to }) => l.replace(re, to), line)))
    .join("\n");
}

// ripgrep lists candidates: it honours .gitignore and only returns files that
// mention one of the names, so JS never reads the whole tree.
export function candidates(root: string): string[] {
  const pattern = ["@types/bun", ...RENAMED].map(escape).join("|");
  const proc = Bun.spawnSync(["rg", "--files-with-matches", "--no-messages", "-e", pattern, "packages"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0 && proc.exitCode !== 1) {
    throw new Error(`rg failed with exit code ${proc.exitCode}: ${proc.stderr.toString()}`);
  }
  return proc.stdout
    .toString()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(f => f.replaceAll("\\", "/"))
    .filter(isManaged)
    .sort();
}

export async function apply(root: string, write: boolean): Promise<string[]> {
  const changed: string[] = [];
  for (const file of candidates(root)) {
    const abs = join(root, file);
    const before = await Bun.file(abs).text();
    const after = rewrite(file, before);
    if (after === before) continue;
    changed.push(file);
    if (write) await Bun.write(abs, after);
  }
  return changed;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const rootIdx = args.indexOf("--root");
  const root = rootIdx >= 0 ? args[rootIdx + 1] : join(import.meta.dir, "..", "..");
  const changed = await apply(root, write);
  for (const f of changed) console.log(`${write ? "rewrote" : "unscoped"} ${f}`);
  if (!write && changed.length) {
    console.error(`${changed.length} file(s) still use upstream package names; run with --write`);
    process.exit(1);
  }
}
