// Merge upstream oven-sh/bun into the fork and keep the @aphrody rename.
//
//   bun scripts/aphrody/sync-upstream.ts [--push] [--dry-run] [--keep-conflicts]
//       [--root <dir>] [--remote upstream] [--ref upstream/main] [--branch main] [--no-fetch] [--no-index]
//
// Conflicts are first retried as a rename-aware three-way merge: the merge
// base and the upstream side are passed through scope.ts `rewrite()` before
// `git merge-file`, so lines that differ only by the package rename merge
// cleanly and only real divergences remain. Anything still conflicting stops
// the sync (exit 2) with the merge aborted, unless --keep-conflicts.

import { join } from "node:path";
import { apply, rewrite } from "./scope.ts";

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
};

export type SyncResult =
  | { status: "up-to-date"; behind: 0 }
  | { status: "merged"; behind: number; commit: string; renameResolved: string[]; pushed: boolean }
  | { status: "dry-run"; behind: number; conflicts: string[] }
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

// Stage blob of a conflicted path, or null when that side deleted it.
function stage(root: string, n: 1 | 2 | 3, path: string): string | null {
  const r = git(root, ["show", `:${n}:${path}`]);
  return r.code === 0 ? r.out : null;
}

async function resolveWithRename(root: string, path: string): Promise<boolean> {
  const base = stage(root, 1, path);
  const ours = stage(root, 2, path);
  const theirs = stage(root, 3, path);
  if (base === null || ours === null || theirs === null) return false;
  const tmp = join(root, ".git", "aphrody-sync");
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
}

export async function sync(opts: Options): Promise<SyncResult> {
  const { root } = opts;
  if (gitOk(root, ["status", "--porcelain", "--untracked-files=no"]) !== "") {
    throw new Error("working tree has uncommitted changes to tracked files; commit or stash them first");
  }
  const current = gitOk(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (current !== opts.branch) throw new Error(`on branch "${current}", expected "${opts.branch}"`);
  if (opts.fetch) gitOk(root, ["fetch", "--quiet", opts.remote]);

  const behind = Number(gitOk(root, ["rev-list", "--count", `HEAD..${opts.ref}`]));
  if (behind === 0) return { status: "up-to-date", behind: 0 };

  const upstreamHead = gitOk(root, ["rev-parse", "--short", opts.ref]);
  const merge = git(root, ["merge", "--no-ff", "--no-commit", opts.ref]);
  const conflicted = gitOk(root, ["diff", "--name-only", "--diff-filter=U"]).split("\n").filter(Boolean);
  if (merge.code !== 0 && conflicted.length === 0) {
    git(root, ["merge", "--abort"]);
    throw new Error(`git merge ${opts.ref} failed: ${merge.err.trim() || merge.out.trim()}`);
  }

  const renameResolved: string[] = [];
  const conflicts: string[] = [];
  for (const path of conflicted) {
    if (await resolveWithRename(root, path)) renameResolved.push(path);
    else conflicts.push(path);
  }

  if (opts.dryRun || conflicts.length) {
    if (!(conflicts.length && opts.keepConflicts)) git(root, ["merge", "--abort"]);
    return opts.dryRun && !conflicts.length
      ? { status: "dry-run", behind, conflicts }
      : { status: "conflicts", behind, conflicts };
  }

  // Upstream may have added new references to the renamed packages.
  const rescoped = await apply(root, true);
  if (rescoped.length) gitOk(root, ["add", "--", ...rescoped]);
  const leftover = await apply(root, false);
  if (leftover.length) {
    git(root, ["merge", "--abort"]);
    throw new Error(`scope rewrite is not idempotent for: ${leftover.join(", ")}`);
  }

  const lines = [`Merge ${opts.ref} (${upstreamHead}) into ${opts.branch}`, ""];
  lines.push(`${behind} upstream commit(s).`);
  if (renameResolved.length) lines.push(`Rename-aware resolution: ${renameResolved.join(", ")}.`);
  if (rescoped.length) lines.push(`Re-scoped to @aphrody: ${rescoped.join(", ")}.`);
  const commit = git(root, ["commit", "--quiet", "-F", "-"], lines.join("\n") + "\n");
  if (commit.code !== 0) throw new Error(`git commit failed: ${commit.err.trim()}`);
  const head = gitOk(root, ["rev-parse", "--short", "HEAD"]);

  let pushed = false;
  if (opts.push) {
    gitOk(root, ["push", "--quiet", "origin", opts.branch]);
    pushed = true;
  }
  if (opts.index) refreshIndex(root, head);
  return { status: "merged", behind, commit: head, renameResolved, pushed };
}

// Keep the aphrody code graph and memory in step with the merged tree. Both
// are optional tooling: a missing or failing `aphrody` never fails the sync.
function refreshIndex(root: string, head: string) {
  if (!Bun.which("aphrody")) return;
  const run = (args: string[], input?: string) =>
    Bun.spawnSync(["aphrody", ...args], {
      cwd: root,
      stdin: input === undefined ? "ignore" : Buffer.from(input),
      stdout: "ignore",
      stderr: "ignore",
    }).exitCode === 0;
  const graph = run(["graph", "--source", "graph:bun", "build", root]);
  const note = `Upstream sync merged at ${head} on ${new Date().toISOString()}; graph:bun rebuilt: ${graph}.`;
  run(
    [
      "memory",
      "write",
      "--agent-id",
      "bun",
      "--id",
      "bun-upstream-sync-last",
      "--tag",
      "bun",
      "--tag",
      "sync",
      "--content",
      "-",
    ],
    note,
  );
}

if (import.meta.main) {
  const opts = parseArgs(process.argv.slice(2));
  try {
    const result = await sync(opts);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "conflicts") {
      console.error(
        `${result.conflicts.length} file(s) conflict beyond the @aphrody rename; ` +
          (opts.keepConflicts ? "the merge is left in progress." : "the merge was aborted."),
      );
      process.exit(2);
    }
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    process.exit(1);
  }
}
