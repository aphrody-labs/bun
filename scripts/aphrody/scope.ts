// The fork publishes its npm packages under the @aphrody scope. This file is
// the single source of truth for that rename: `rewrite()` maps upstream text to
// the fork's names and is idempotent, so the upstream sync can apply it to both
// sides of a three-way merge and the rename never conflicts.
//
//   bun scripts/aphrody/scope.ts --check   list files that still use upstream names (exit 1 if any)
//   bun scripts/aphrody/scope.ts --write   rewrite them in place

import { join } from "node:path";
import { existsSync } from "node:fs";

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
  JSON.parse(text); // Reject invalid input before considering edits.
  const edits: { start: number; end: number; value: string }[] = [];
  let depth = 0;
  let dependenciesDepth: number | undefined;
  const skipSpace = (offset: number) => {
    while (/\s/.test(text[offset] ?? "") && offset < text.length) offset++;
    return offset;
  };
  const stringEnd = (start: number) => {
    let offset = start + 1;
    while (offset < text.length) {
      if (text[offset] === "\\") offset += 2;
      else if (text[offset++] === '"') return offset;
    }
    throw new Error("Unterminated manifest string");
  };
  for (let offset = 0; offset < text.length; offset++) {
    const character = text[offset];
    if (character === "{" || character === "[") {
      depth++;
      continue;
    }
    if (character === "}" || character === "]") {
      depth--;
      if (dependenciesDepth !== undefined && depth < dependenciesDepth) dependenciesDepth = undefined;
      continue;
    }
    if (character !== '"') continue;
    const end = stringEnd(offset);
    const key = JSON.parse(text.slice(offset, end)) as string;
    const colon = skipSpace(end);
    if (text[colon] === ":") {
      const valueStart = skipSpace(colon + 1);
      if (depth === 1 && DEP_FIELDS.includes(key) && text[valueStart] === "{") dependenciesDepth = 2;
      if (text[valueStart] === '"') {
        const valueEnd = stringEnd(valueStart);
        const value = JSON.parse(text.slice(valueStart, valueEnd)) as string;
        if (depth === 1 && key === "name" && scopedName(value) !== value) {
          edits.push({
            start: valueStart,
            end: valueEnd,
            value: JSON.stringify(scopedName(value)),
          });
        } else if (depth === dependenciesDepth && LOCAL_SPEC.test(value) && scopedName(key) !== key) {
          edits.push({ start: offset, end, value: JSON.stringify(scopedName(key)) });
        }
      }
    }
    offset = end - 1;
  }
  let out = text;
  for (const edit of edits.reverse()) out = out.slice(0, edit.start) + edit.value + out.slice(edit.end);
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

// Apply the managed file selection before searching contents, so archives,
// datasets and native artifacts never enter the scan.
export function candidates(root: string): string[] {
  const pattern = ["@types/bun", ...RENAMED].map(escape).join("|");
  const inventory = Bun.spawnSync(["git", "--literal-pathspecs", "ls-files", "--cached", "-z", "--", "packages"], {
    cwd: root,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 2_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (inventory.exitCode === 0) {
    // Collapse wholly untracked directories: Git need not inspect native build/cache trees.
    const untracked = Bun.spawnSync(
      [
        "git",
        "--literal-pathspecs",
        "ls-files",
        "--others",
        "--directory",
        "--exclude-standard",
        "--exclude=**/node_modules/",
        "--exclude=**/target/",
        "--exclude=**/.pytest_cache/",
        "--exclude=**/__pycache__/",
        "--exclude=**/.venv/",
        "-z",
        "--",
        "packages",
      ],
      {
        cwd: root,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 2_000,
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    if (untracked.exitCode !== 0) {
      throw new Error(
        `git untracked inventory failed with exit code ${untracked.exitCode}: ${untracked.stderr.toString()}`,
      );
    }
    const extra = untracked.stdout.toString().split("\0").filter(Boolean);
    const directories = extra.filter(file => file.endsWith("/") && !file.includes("/node_modules/"));
    if (directories.length) {
      const discovered = Bun.spawnSync(
        [
          "rg",
          "--files",
          "--null",
          "--no-messages",
          "--threads",
          "2",
          "--glob",
          "*.{js,jsx,ts,tsx,cjs,cjsx,cts,ctsx,mjs,mjsx,mts,mtsx,md,mdx,svelte,html}",
          "--glob",
          "package.json",
          "--glob",
          "bunfig.toml",
          "--glob",
          "!**/node_modules/**",
          "--",
          ...directories,
        ],
        {
          cwd: root,
          stdout: "pipe",
          stderr: "pipe",
          timeout: 2_000,
          maxBuffer: 32 * 1024 * 1024,
        },
      );
      if (discovered.exitCode !== 0 && discovered.exitCode !== 1) {
        throw new Error(
          `rg untracked inventory failed with exit code ${discovered.exitCode}: ${discovered.stderr.toString()}`,
        );
      }
      extra.push(...discovered.stdout.toString().split("\0"));
    }
    // Git searches tracked working files without passing thousands of filenames through argv.
    const trackedMatches = Bun.spawnSync(
      [
        "git",
        "grep",
        "--files-with-matches",
        "--null",
        "--threads=2",
        "-E",
        "-e",
        pattern,
        "--",
        ...[
          "js",
          "jsx",
          "ts",
          "tsx",
          "cjs",
          "cjsx",
          "cts",
          "ctsx",
          "mjs",
          "mjsx",
          "mts",
          "mtsx",
          "md",
          "mdx",
          "svelte",
          "html",
        ].map(extension => `:(glob)packages/**/*.${extension}`),
        ":(glob)packages/**/package.json",
        ":(glob)packages/**/bunfig.toml",
        ":(exclude,glob)packages/**/node_modules/**",
      ],
      {
        cwd: root,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10_000,
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    if (trackedMatches.exitCode !== 0 && trackedMatches.exitCode !== 1) {
      throw new Error(
        `git content selection failed with exit code ${trackedMatches.exitCode}: ${trackedMatches.stderr.toString()}`,
      );
    }
    const files = [...new Set(extra.filter(isManaged))].filter(file => existsSync(join(root, file))).sort();
    const found = new Set(trackedMatches.stdout.toString().split("\0").filter(isManaged));
    const scan = (batch: string[]) => {
      if (!batch.length) return;
      const result = Bun.spawnSync(
        ["rg", "--files-with-matches", "--null", "--no-messages", "--threads", "2", "-e", pattern, "--", ...batch],
        {
          cwd: root,
          stdout: "pipe",
          stderr: "pipe",
          timeout: 2_000,
          maxBuffer: 32 * 1024 * 1024,
        },
      );
      if (result.exitCode !== 0 && result.exitCode !== 1) {
        throw new Error(`rg failed with exit code ${result.exitCode}: ${result.stderr.toString()}`);
      }
      for (const file of result.stdout.toString().split("\0").filter(Boolean)) {
        found.add(file.replaceAll("\\", "/"));
      }
    };
    // Bound argv below Windows' command-line ceiling, including quoting overhead.
    let batch: string[] = [];
    let size = 0;
    for (const file of files) {
      const length = file.length + (file.match(/["\\]/g)?.length ?? 0) + 3;
      if (size + length > 28_000) {
        scan(batch);
        batch = [];
        size = 0;
      }
      batch.push(file);
      size += length;
    }
    scan(batch);
    return [...found].sort();
  }
  if (!inventory.stderr.toString().includes("not a git repository")) {
    throw new Error(`git ls-files failed with exit code ${inventory.exitCode}: ${inventory.stderr.toString()}`);
  }
  // Standalone fixtures have no Git inventory. Apply managed globs before reading contents.
  const proc = Bun.spawnSync(
    [
      "rg",
      "--files-with-matches",
      "--null",
      "--no-messages",
      "--threads",
      "2",
      "--glob",
      "*.{js,jsx,ts,tsx,cjs,cjsx,cts,ctsx,mjs,mjsx,mts,mtsx,md,mdx,svelte,html}",
      "--glob",
      "package.json",
      "--glob",
      "bunfig.toml",
      "--glob",
      "!**/node_modules/**",
      "-e",
      pattern,
      "packages",
    ],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 2_000,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (proc.exitCode !== 0 && proc.exitCode !== 1) {
    throw new Error(`rg failed with exit code ${proc.exitCode}: ${proc.stderr.toString()}`);
  }
  return proc.stdout
    .toString()
    .split("\0")
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
  if (!root || root.startsWith("--")) throw new Error("--root requires a directory");
  const changed = await apply(root, write);
  for (const f of changed) console.log(`${write ? "rewrote" : "unscoped"} ${f}`);
  if (!write && changed.length) {
    console.error(`${changed.length} file(s) still use upstream package names; run with --write`);
    process.exit(1);
  }
}
