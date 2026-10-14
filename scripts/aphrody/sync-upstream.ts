// Merge upstream oven-sh/bun into the fork and keep the @aphrody rename.
//
//   bun scripts/aphrody/sync-upstream.ts [--push] [--dry-run] [--keep-conflicts]
//       [--root <dir>] [--upstream-checkout <sibling>] [--remote upstream] [--ref upstream/main]
//       [--branch main] [--no-fetch] [--no-index]
//
// Conflicts are first retried as a rename-aware three-way merge: the merge
// base and the upstream side are passed through scope.ts `rewrite()` before
// `git merge-file`, so lines that differ only by the package rename merge
// cleanly and only real divergences remain. The files this repository owns
// (OWNED) keep their local version. Anything still conflicting stops the sync
// (exit 2) with the merge aborted, unless --keep-conflicts.

import { join } from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { isManaged, rewrite } from "./scope.ts";
import { previewUpstream } from "./sync-upstream-preview.ts";
import { prepareUpstreamSource } from "./sync-upstream-source.ts";

type Options = {
  root: string;
  remote: string;
  ref: string;
  branch: string;
  fetch: boolean;
  push: boolean;
  dryRun: boolean;
  keepConflicts: boolean;
  index: boolean;
  upstreamCheckout?: string;
};

// Files whose content is this component's, not upstream's: on a conflict the local version is kept.
export const OWNED: readonly string[] = [
  "README.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "docs/installation.mdx",
];

export type SyncResult =
  | { status: "up-to-date"; behind: 0 }
  | {
      status: "merged";
      behind: number;
      commit: string;
      renameResolved: string[];
      kept: string[];
      pushed: boolean;
    }
  | { status: "dry-run"; behind: number; conflicts: string[]; added: string[]; deleted: string[]; collisions: string[] }
  | { status: "collisions"; behind: number; collisions: string[] }
  | { status: "conflicts"; behind: number; conflicts: string[] };

function parseArgs(argv: string[]): Options {
  const value = (flag: string, fallback: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const remote = value("--remote", "upstream");
  return {
    root: value("--root", join(import.meta.dir, "..", "..")),
    remote,
    ref: value("--ref", `${remote}/main`),
    branch: value("--branch", "main"),
    fetch: !argv.includes("--no-fetch"),
    push: argv.includes("--push"),
    dryRun: argv.includes("--dry-run"),
    keepConflicts: argv.includes("--keep-conflicts"),
    index: !argv.includes("--no-index"),
    upstreamCheckout: argv.includes("--upstream-checkout") ? value("--upstream-checkout", "") : undefined,
  };
}

function git(root: string, args: string[], input?: string) {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd: root,
    stdin: input === undefined ? "ignore" : Buffer.from(input),
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

function gitOk(root: string, args: string[]): string {
  const r = git(root, args);
  if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed (exit ${r.code}): ${r.err.trim()}`);
  return r.out.trim();
}

async function gitAsyncOk(root: string, args: string[]): Promise<string> {
  await using proc = Bun.spawn(["git", ...args], {
    cwd: root,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 600_000,
  });
  const [out, err, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  if (code !== 0) throw new Error(`git ${args[0]} failed (exit ${code}): ${err.trim()}`);
  return out.trim();
}

// Stage blob of a conflicted path, or null when that side deleted it.
function stage(root: string, n: 1 | 2 | 3, path: string): string | null {
  const r = git(root, ["show", `:${n}:${path}`]);
  return r.code === 0 ? r.out : null;
}

async function keepOurs(root: string, path: string): Promise<boolean> {
  if (!OWNED.includes(path)) return false;
  const ours = stage(root, 2, path);
  if (ours === null) return false;
  await Bun.write(join(root, path), ours);
  gitOk(root, ["add", "--", path]);
  return true;
}

async function resolveWithRename(root: string, path: string): Promise<boolean> {
  const base = stage(root, 1, path);
  const ours = stage(root, 2, path);
  const theirs = stage(root, 3, path);
  if (base === null || ours === null || theirs === null) return false;
  // A linked worktree has a .git file, and each worktree has its own Git
  // directory. Never write into the checkout or share merge scratch files.
  const scratchRoot = gitOk(root, ["rev-parse", "--path-format=absolute", "--git-path", "aphrody-sync"]);
  await mkdir(scratchRoot, { recursive: true });
  const tmp = await mkdtemp(join(scratchRoot, "merge-"));
  try {
    const files = { ours: join(tmp, "ours"), base: join(tmp, "base"), theirs: join(tmp, "theirs") };
    await Bun.write(files.ours, ours);
    await Bun.write(files.base, rewrite(path, base));
    await Bun.write(files.theirs, rewrite(path, theirs));
    const merged = Bun.spawnSync(["git", "merge-file", "-p", files.ours, files.base, files.theirs], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (merged.exitCode !== 0) return false;
    await Bun.write(join(root, path), merged.stdout);
    gitOk(root, ["add", "--", path]);
    return true;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

export async function sync(opts: Options): Promise<SyncResult> {
  const { root } = opts;
  const current = gitOk(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (current !== opts.branch) throw new Error(`on branch "${current}", expected "${opts.branch}"`);
  if (opts.fetch) {
    if (opts.remote === "upstream" || opts.upstreamCheckout) {
      await prepareUpstreamSource({ root, checkout: opts.upstreamCheckout, remote: opts.remote, dryRun: opts.dryRun });
    } else if (!opts.dryRun) {
      await gitAsyncOk(root, ["fetch", "--quiet", opts.remote]);
    }
  }

  const preview = await previewUpstream({ root, ref: opts.ref, owned: OWNED, rewrite });
  const { behind } = preview;
  if (behind === 0) return { status: "up-to-date", behind: 0 };
  if (opts.dryRun) {
    return {
      status: "dry-run",
      behind,
      conflicts: preview.conflicts,
      added: preview.added,
      deleted: preview.deleted,
      collisions: preview.collisions,
    };
  }
  if (preview.conflicts.length && !opts.keepConflicts) {
    return { status: "conflicts", behind, conflicts: preview.conflicts };
  }
  if (preview.collisions.length) return { status: "collisions", behind, collisions: preview.collisions };
  if (gitOk(root, ["diff", "--cached", "--name-only"])) {
    throw new Error("shared index contains staged work; upstream merge leaves it unchanged");
  }
  if (
    gitOk(root, ["rev-parse", "HEAD"]) !== preview.head ||
    gitOk(root, ["rev-parse", opts.ref]) !== preview.upstream
  ) {
    throw new Error("HEAD or upstream changed after preview; retry synchronization");
  }

  const upstreamHead = gitOk(root, ["rev-parse", "--short", opts.ref]);
  const merge = git(root, ["merge", "--no-ff", "--no-commit", opts.ref]);
  const conflicted = gitOk(root, ["diff", "--name-only", "--diff-filter=U"]).split("\n").filter(Boolean);
  if (merge.code !== 0 && conflicted.length === 0) {
    git(root, ["merge", "--abort"]);
    throw new Error(`git merge ${opts.ref} failed: ${merge.err.trim() || merge.out.trim()}`);
  }

  const renameResolved: string[] = [];
  const kept: string[] = [];
  const conflicts: string[] = [];
  for (const path of conflicted) {
    if (await keepOurs(root, path)) kept.push(path);
    else if (await resolveWithRename(root, path)) renameResolved.push(path);
    else conflicts.push(path);
  }

  if (conflicts.length) {
    if (!(conflicts.length && opts.keepConflicts)) git(root, ["merge", "--abort"]);
    return { status: "conflicts", behind, conflicts };
  }

  // Upstream may have added new references to the renamed packages.
  const rescoped: string[] = [];
  const mergedPaths = gitOk(root, ["diff", "--cached", "--name-only", "-z"]).split("\0").filter(Boolean);
  for (const path of mergedPaths.filter(isManaged)) {
    const file = Bun.file(join(root, path));
    if (!(await file.exists())) continue;
    const content = await file.text();
    const scoped = rewrite(path, content);
    if (scoped === content) continue;
    if (rewrite(path, scoped) !== scoped) throw new Error(`scope rewrite is not idempotent for: ${path}`);
    await Bun.write(file, scoped);
    gitOk(root, ["add", "--", path]);
    rescoped.push(path);
  }

  const lines = [`Merge ${opts.ref} (${upstreamHead}) into ${opts.branch}`, ""];
  lines.push(`${behind} upstream commit(s).`);
  if (renameResolved.length) lines.push(`Rename-aware resolution: ${renameResolved.join(", ")}.`);
  if (kept.length) lines.push(`Kept the local version: ${kept.join(", ")}.`);
  if (rescoped.length) lines.push(`Re-scoped to @aphrody: ${rescoped.join(", ")}.`);
  const commit = git(root, ["commit", "--quiet", "-F", "-"], lines.join("\n") + "\n");
  if (commit.code !== 0) throw new Error(`git commit failed: ${commit.err.trim()}`);
  const head = gitOk(root, ["rev-parse", "--short", "HEAD"]);

  let pushed = false;
  if (opts.push) {
    await qualifyMerge(root, mergedPaths);
    await gitAsyncOk(root, ["fetch", "--quiet", "origin", opts.branch]);
    gitOk(root, ["merge-base", "--is-ancestor", `origin/${opts.branch}`, "HEAD"]);
    await gitAsyncOk(root, ["push", "--quiet", "origin", opts.branch]);
    pushed = true;
  }
  if (opts.index) await refreshIndex(root);
  return { status: "merged", behind, commit: head, renameResolved, kept, pushed };
}

async function qualifyMerge(root: string, paths: string[]) {
  const native = paths.some(
    path =>
      path.startsWith("src/") || path.startsWith("scripts/build/") || path === "Cargo.toml" || path === "Cargo.lock",
  );
  const tests = [
    "test/internal/aphrody-upstream-sync.test.ts",
    ...paths.filter(path => path.startsWith("test/") && /\.test\.[cm]?[jt]sx?$/.test(path)),
  ];
  if (paths.some(path => path.startsWith("packages/bun-types/")))
    tests.push("test/integration/bun-types/bun-types.test.ts");
  const command = native
    ? [process.execPath, "bd", "-j1", "--", "test", "--max-concurrency=2", ...new Set(tests)]
    : [process.execPath, "test", "--max-concurrency=2", ...new Set(tests)];
  // The build owns its repository lock and has no timeout.
  await using child = Bun.spawn(command, {
    cwd: root,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
    windowsHide: true,
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`upstream qualification failed (${code}); merge remains local and was not pushed`);
}

// Refresh the scoped graph in Aphrody Home after committing.
async function refreshIndex(root: string) {
  if (!Bun.which("aphrody")) return;
  await using proc = Bun.spawn(
    [
      "aphrody",
      "graph",
      "--profile",
      "bun",
      "--source",
      "graph:bun:scripts:aphrody",
      "build",
      join(root, "scripts", "aphrody"),
    ],
    {
      cwd: root,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      timeout: 120_000,
    },
  );
  await proc.exited;
}

if (import.meta.main) {
  const opts = parseArgs(process.argv.slice(2));
  try {
    const result = await sync(opts);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "conflicts") {
      console.error(
        `${result.conflicts.length} file(s) conflict beyond the @aphrody rename; ` +
          (opts.keepConflicts ? "the merge is left in progress." : "the checkout is unchanged."),
      );
      process.exit(2);
    }
    if (result.status === "collisions") process.exit(3);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    process.exit(1);
  }
}
