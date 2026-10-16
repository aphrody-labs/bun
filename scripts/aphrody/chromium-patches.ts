#!/usr/bin/env bun
// Downstream Chromium changes kept as Brave-style per-file patches plus an
// overlay of owned new directories. Ported from Brave's updatePatches/gitPatcher
// and CEF's patch_updater (already-applied detection, 3-way conflict output).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
export const PATCH_DIR = join(ROOT, "patches", "chromium");
export const OVERLAY_MANIFEST = "overlay.json";
/** Upstream Chromium commit the patches apply to (also bun chromium's sync pin). */
export const PATCH_BASE = "e20c553087353010f4b71143841c189447ac1628";

export interface Overlay {
  schema: 1;
  base: string;
  repository: string;
  revision: string;
  trees: Record<string, string>;
}

export interface PatchOptions {
  command: "help" | "refresh" | "check" | "apply" | "reset" | "status";
  source: string;
  base: string;
  to?: string;
  expect?: string;
  patches: string;
  json: boolean;
}

const HELP = `Usage: bun chromium patch <command> [--source dir] [--base sha] [--to rev] [--expect rev] [--json]
  refresh  Rewrite patches/chromium from base..to (or base..worktree): one patch per modified file,
           owned new directories recorded in overlay.json; stale patches are removed
  check    Apply every patch to a temporary index of base (worktree untouched); report conflicts
           and, with --expect, verify the patched files equal that revision
  apply    Reset changed targets to base, apply changed patches (3-way on conflict), materialize overlay
  reset    Restore every patched path to base and remove overlay directories
  status   Show patch and overlay counts and the recorded apply state`;

export function parsePatchArguments(args: string[], root = ROOT): PatchOptions {
  const options: PatchOptions = {
    command: "help",
    source: join(root, "vendor", "chromium", "src"),
    base: PATCH_BASE,
    patches: join(root, "patches", "chromium"),
    json: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (["refresh", "check", "apply", "reset", "status", "help"].includes(arg) && options.command === "help")
      options.command = arg as PatchOptions["command"];
    else if (arg === "--json") options.json = true;
    else if (["--source", "--base", "--to", "--expect", "--patches"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      if (arg !== "--source" && arg !== "--patches" && !/^[\w./^~-]+$/.test(value))
        throw new Error(`${arg} must be a Git revision`);
      if (arg === "--source") options.source = resolve(value);
      else if (arg === "--patches") options.patches = resolve(value);
      else if (arg === "--base") options.base = value;
      else if (arg === "--to") options.to = value;
      else options.expect = value;
    } else if (arg === "--help" || arg === "-h") options.command = "help";
    else throw new Error(`Unknown patch argument: ${arg}`);
  }
  return options;
}

/** Brave's naming: flatten the path so additions never renumber other patches. */
export function patchName(path: string) {
  return `${path.replaceAll("/", "-")}.patch`;
}

/** Split a multi-file `git diff` into per-file sections keyed by repository path. */
export function splitDiff(diff: string): Map<string, string> {
  const files = new Map<string, string>();
  const starts = [...diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)];
  for (let i = 0; i < starts.length; i++) {
    const match = starts[i]!;
    const body = diff.slice(match.index, starts[i + 1]?.index ?? diff.length);
    const path = match[1] === match[2] ? match[1]! : match[2]!;
    if (files.has(path)) throw new Error(`Duplicate diff section for ${path}`);
    files.set(path, body);
  }
  return files;
}

export function patchTarget(patch: string) {
  const match = /^diff --git a\/(.+?) b\/(.+)$/m.exec(patch);
  if (!match) throw new Error("Patch has no diff --git header");
  return match[2]!;
}

function gitEnv(extra: Record<string, string> = {}) {
  return {
    ...process.env,
    GIT_ATTR_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null", // Git for Windows maps this name to NUL
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    ...extra,
  };
}

export function git(
  cwd: string,
  args: string[],
  options: { input?: string; env?: Record<string, string>; allowFail?: boolean } = {},
) {
  const proc = Bun.spawnSync(["git", "-c", "core.longpaths=true", "-c", "core.autocrlf=false", ...args], {
    cwd,
    env: gitEnv(options.env),
    stdin: options.input === undefined ? "ignore" : Buffer.from(options.input),
    stdout: "pipe",
    stderr: "pipe",
  });
  const result = { exitCode: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
  if (result.exitCode !== 0 && !options.allowFail)
    throw new Error(`git ${args.slice(0, 3).join(" ")} failed (${result.exitCode}): ${result.stderr.trim()}`);
  return result;
}

const DIFF_ARGS = [
  "-c",
  "diff.algorithm=histogram",
  "diff",
  "--no-ext-diff",
  "--no-color",
  "--no-renames",
  "--full-index",
  "--src-prefix=a/",
  "--dst-prefix=b/",
];

export function readOverlay(dir: string): Overlay | undefined {
  const file = join(dir, OVERLAY_MANIFEST);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Overlay) : undefined;
}

export function listPatches(dir: string) {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter(name => name.endsWith(".patch"))
        .sort()
    : [];
}

/** Top-level owned directories: the shortest added directory not present in base. */
function overlayRoots(source: string, base: string, added: string[]) {
  const roots = new Set<string>();
  const known = new Map<string, boolean>();
  const exists = (dir: string) => {
    if (!known.has(dir))
      known.set(dir, git(source, ["cat-file", "-e", `${base}:${dir}`], { allowFail: true }).exitCode === 0);
    return known.get(dir)!;
  };
  for (const path of added) {
    const parts = path.split("/");
    let root: string | undefined;
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = parts.slice(0, depth).join("/");
      if (!exists(dir)) {
        root = dir;
        break;
      }
    }
    if (!root) throw new Error(`New file ${path} is inside an upstream directory; carry it as an owned directory`);
    roots.add(root);
  }
  return [...roots].sort();
}

export function refresh(options: PatchOptions) {
  const range = options.to ? [options.base, options.to] : [options.base];
  const status = git(options.source, ["diff", "--no-renames", "--name-status", "-z", ...range]).stdout.split("\0");
  const modified: string[] = [];
  const added: string[] = [];
  for (let i = 0; i + 1 < status.length; i += 2) {
    const kind = status[i]!;
    const path = status[i + 1]!;
    if (kind === "A") added.push(path);
    else modified.push(path);
  }
  const previous = readOverlay(options.patches);
  let roots: string[];
  if (options.to) roots = overlayRoots(options.source, options.base, added);
  else {
    // Worktree refresh keeps the recorded overlay; untracked files are not diffed.
    roots = Object.keys(previous?.trees ?? {});
    const stray = added.filter(path => !roots.some(root => path.startsWith(`${root}/`)));
    if (stray.length) throw new Error(`New files outside overlay directories: ${stray.slice(0, 5).join(", ")}`);
  }
  const sections = modified.length
    ? splitDiff(git(options.source, [...DIFF_ARGS, ...range, "--", ...modified]).stdout)
    : new Map();
  mkdirSync(options.patches, { recursive: true });
  const written = new Set<string>();
  for (const [path, body] of sections) {
    const name = patchName(path);
    if (written.has(name)) throw new Error(`Patch name collision for ${path}`);
    written.add(name);
    const file = join(options.patches, name);
    if (!existsSync(file) || readFileSync(file, "utf8") !== body) writeFileSync(file, body);
  }
  const stale = listPatches(options.patches).filter(name => !written.has(name));
  for (const name of stale) unlinkSync(join(options.patches, name));
  if (options.to) {
    const revision = git(options.source, ["rev-parse", `${options.to}^{commit}`]).stdout.trim();
    const trees = Object.fromEntries(
      roots.map(root => [root, git(options.source, ["rev-parse", `${revision}:${root}`]).stdout.trim()]),
    );
    const overlay: Overlay = {
      schema: 1,
      base: options.base,
      repository: previous?.repository ?? "https://github.com/aphrody-labs/chromium",
      revision,
      trees,
    };
    writeFileSync(join(options.patches, OVERLAY_MANIFEST), `${JSON.stringify(overlay, null, 2)}\n`);
  }
  return { patches: written.size, removed: stale.length, overlay: roots };
}

/** Apply all patches to a throwaway index of base; never touches the worktree. */
export function check(options: PatchOptions) {
  const index = join(tmpdir(), `aphrody-chromium-patch-${process.pid}.index`);
  const env = { GIT_INDEX_FILE: index };
  const names = listPatches(options.patches);
  const conflicts: { patch: string; error: string }[] = [];
  const targets: string[] = [];
  try {
    git(options.source, ["read-tree", options.base], { env });
    for (const name of names) {
      const body = readFileSync(join(options.patches, name), "utf8");
      targets.push(patchTarget(body));
      const result = git(options.source, ["apply", "--cached", "--whitespace=nowarn", "-"], {
        input: body,
        env,
        allowFail: true,
      });
      if (result.exitCode !== 0) conflicts.push({ patch: name, error: result.stderr.trim().split("\n")[0]! });
    }
    let mismatched: string[] = [];
    if (options.expect && !conflicts.length) {
      mismatched = git(options.source, ["diff-index", "--cached", "--name-only", options.expect, "--", ...targets], {
        env,
      })
        .stdout.split("\n")
        .filter(Boolean);
      // Overlay directories are compared by tree id, without materializing blobs.
      for (const [root, tree] of Object.entries(readOverlay(options.patches)?.trees ?? {}))
        if (git(options.source, ["rev-parse", `${options.expect}:${root}`], { allowFail: true }).stdout.trim() !== tree)
          mismatched.push(`${root}/`);
    }
    return { base: options.base, patches: names.length, conflicts, expect: options.expect, mismatched };
  } finally {
    rmSync(index, { force: true });
  }
}

interface State {
  base: string;
  overlay?: string | undefined;
  patches: Record<string, { patch: string; file: string }>;
}

function stateFile(options: PatchOptions) {
  return join(options.source, ".git", "aphrody-patches.json");
}

function hash(bytes: string | Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

function fileHash(source: string, path: string) {
  const file = join(source, path);
  return existsSync(file) ? hash(readFileSync(file)) : "absent";
}

function restore(source: string, base: string, paths: string[]) {
  if (!paths.length) return;
  const present = paths.filter(
    path => git(source, ["cat-file", "-e", `${base}:${path}`], { allowFail: true }).exitCode === 0,
  );
  for (let i = 0; i < present.length; i += 200) git(source, ["checkout", base, "--", ...present.slice(i, i + 200)]);
  for (const path of paths.filter(path => !present.includes(path))) rmSync(join(source, path), { force: true });
}

export function apply(options: PatchOptions) {
  const previous: State = existsSync(stateFile(options))
    ? JSON.parse(readFileSync(stateFile(options), "utf8"))
    : { base: options.base, patches: {} };
  const state: State = {
    base: options.base,
    overlay: previous.base === options.base ? previous.overlay : undefined,
    patches: {},
  };
  const names = listPatches(options.patches);
  const failed: { patch: string; error: string }[] = [];
  let applied = 0;
  const stale = Object.keys(previous.patches).filter(name => !names.includes(name));
  restore(
    options.source,
    options.base,
    stale.map(name => previous.patches[name]!.file.split("\0")[0]!),
  );
  for (const name of names) {
    const body = readFileSync(join(options.patches, name), "utf8");
    const target = patchTarget(body);
    const patchHash = hash(body);
    const prior = previous.patches[name];
    if (
      previous.base === options.base &&
      prior?.patch === patchHash &&
      prior.file.endsWith(`\0${fileHash(options.source, target)}`)
    ) {
      state.patches[name] = prior;
      continue;
    }
    restore(options.source, options.base, [target]);
    let result = git(options.source, ["apply", "--whitespace=nowarn", "-"], { input: body, allowFail: true });
    if (result.exitCode !== 0) {
      // Leave conflict markers for manual resolution, as CEF's patch_updater does.
      result = git(options.source, ["apply", "--3way", "--whitespace=nowarn", "-"], { input: body, allowFail: true });
      failed.push({ patch: name, error: result.stderr.trim().split("\n").slice(-1)[0] ?? "conflict" });
      continue;
    }
    applied++;
    state.patches[name] = { patch: patchHash, file: `${target}\0${fileHash(options.source, target)}` };
  }
  const overlay = readOverlay(options.patches);
  let overlayApplied = false;
  if (overlay && state.overlay !== overlay.revision) {
    if (overlay.base !== options.base) throw new Error(`overlay.json targets base ${overlay.base}`);
    if (git(options.source, ["cat-file", "-e", `${overlay.revision}^{commit}`], { allowFail: true }).exitCode !== 0)
      git(options.source, [
        "fetch",
        "--quiet",
        "--depth=1",
        "--filter=blob:none",
        overlay.repository,
        overlay.revision,
      ]);
    for (const [root, tree] of Object.entries(overlay.trees)) {
      if (git(options.source, ["rev-parse", `${overlay.revision}:${root}`]).stdout.trim() !== tree)
        throw new Error(`Overlay ${root} does not match its recorded tree`);
      rmSync(join(options.source, root), { recursive: true, force: true });
      git(options.source, ["checkout", overlay.revision, "--", root]);
      git(options.source, ["reset", "--quiet", "--", root]);
    }
    state.overlay = overlay.revision;
    overlayApplied = true;
  }
  writeFileSync(stateFile(options), `${JSON.stringify(state, null, 1)}\n`);
  return {
    base: options.base,
    patches: names.length,
    applied,
    unchanged: names.length - applied - failed.length,
    failed,
    stale: stale.length,
    overlayApplied,
  };
}

export function reset(options: PatchOptions) {
  const names = listPatches(options.patches);
  const paths = names.map(name => patchTarget(readFileSync(join(options.patches, name), "utf8")));
  restore(options.source, options.base, paths);
  const roots = Object.keys(readOverlay(options.patches)?.trees ?? {});
  for (const root of roots) rmSync(join(options.source, root), { recursive: true, force: true });
  rmSync(stateFile(options), { force: true });
  return { restored: paths.length, removedOverlay: roots };
}

export function status(options: PatchOptions) {
  const overlay = readOverlay(options.patches);
  const recorded = existsSync(stateFile(options))
    ? (JSON.parse(readFileSync(stateFile(options), "utf8")) as State)
    : undefined;
  return {
    base: options.base,
    patches: listPatches(options.patches).length,
    overlay: overlay && { revision: overlay.revision, directories: Object.keys(overlay.trees) },
    source: existsSync(join(options.source, ".git")) ? options.source : null,
    applied: recorded && {
      base: recorded.base,
      patches: Object.keys(recorded.patches).length,
      overlay: recorded.overlay ?? null,
    },
  };
}

export function main(args = process.argv.slice(2)) {
  const options = parsePatchArguments(args);
  if (options.command === "help") return void console.log(HELP);
  if (options.command !== "status" && !existsSync(join(options.source, ".git")))
    throw new Error(`No Chromium Git checkout at ${options.source}; run bun chromium setup or pass --source`);
  const result =
    options.command === "refresh"
      ? refresh(options)
      : options.command === "check"
        ? check(options)
        : options.command === "apply"
          ? apply(options)
          : options.command === "reset"
            ? reset(options)
            : status(options);
  console.log(JSON.stringify(result, null, 2));
  const failures =
    "conflicts" in result
      ? result.conflicts.length + result.mismatched.length
      : "failed" in result
        ? result.failed.length
        : 0;
  if (failures) process.exitCode = 1;
}

if (import.meta.main)
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
