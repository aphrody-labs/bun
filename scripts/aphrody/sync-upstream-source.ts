import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export const UPSTREAM_SOURCE_URL = "https://github.com/oven-sh/bun.git";

export type UpstreamSourceOptions = {
  root: string;
  checkout?: string;
  remote?: string;
  dryRun?: boolean;
  timeoutMs?: number;
};

export type UpstreamSourceResult = {
  status: "ready" | "dry-run";
  checkout: string;
  ref: string;
  commit: string | null;
  created: boolean;
  updated: boolean;
};

type GitResult = { code: number; out: string; err: string };

async function git(cwd: string, args: string[], timeoutMs: number): Promise<GitResult> {
  const child = Bun.spawn(["git", ...args], {
    cwd,
    env: { ...Bun.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  const [code, out, err] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, out: out.trim(), err: err.trim() };
}

async function gitOk(cwd: string, args: string[], timeoutMs: number): Promise<string> {
  const result = await git(cwd, args, timeoutMs);
  if (result.code !== 0) throw new Error(`upstream source git ${args[0]} failed (${result.code}): ${result.err}`);
  return result.out;
}

function contained(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith("../") && !path.startsWith("..\\"));
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return false;
    throw error;
  }
}

/** Resolve existing parents too, so a junction cannot put the source inside the fork. */
async function canonical(path: string): Promise<string> {
  if (await exists(path)) return realpath(path);
  const parent = dirname(path);
  if (parent === path) throw new Error("upstream source path has no existing parent");
  return resolve(await canonical(parent), relative(parent, path));
}

export function isCanonicalUpstreamOrigin(origin: string): boolean {
  return /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)oven-sh\/bun(?:\.git)?\/?$/i.test(
    origin,
  );
}

async function verifySource(checkout: string, timeoutMs: number): Promise<string> {
  if (!(await stat(checkout)).isDirectory()) throw new Error("upstream source path is not a directory");
  const top = await gitOk(checkout, ["rev-parse", "--show-toplevel"], timeoutMs);
  if (relative(await realpath(top), checkout) !== "") throw new Error("upstream source must be a repository root");
  const origin = await gitOk(checkout, ["remote", "get-url", "origin"], timeoutMs);
  if (!isCanonicalUpstreamOrigin(origin)) throw new Error("upstream source origin must be oven-sh/bun on GitHub");
  const branch = await gitOk(checkout, ["symbolic-ref", "--quiet", "--short", "HEAD"], timeoutMs);
  if (branch !== "main") throw new Error("upstream source must be on branch main");
  if (await gitOk(checkout, ["status", "--porcelain", "--untracked-files=all"], timeoutMs)) {
    throw new Error("upstream source has local changes; refusing to update it");
  }
  return gitOk(checkout, ["rev-parse", "--verify", "HEAD"], timeoutMs);
}

/** Reuse one upstream checkout; fetch its verified main into the fork without changing remote URLs. */
export async function prepareUpstreamSource(options: UpstreamSourceOptions): Promise<UpstreamSourceResult> {
  const root = await realpath(resolve(options.root));
  const requested = options.checkout ?? Bun.env.APHRODY_BUN_UPSTREAM_CHECKOUT ?? join(dirname(root), "bun-upstream");
  const checkout = await canonical(resolve(root, requested));
  if (contained(root, checkout) || contained(checkout, root)) {
    throw new Error("upstream source and fork checkout paths must not overlap");
  }
  const remote = options.remote ?? "upstream";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remote)) throw new Error("invalid upstream remote name");
  const timeoutMs = options.timeoutMs ?? 600_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("upstream source timeout must be positive");
  const present = await exists(checkout);
  let commit = present ? await verifySource(checkout, timeoutMs) : null;
  const ref = `refs/remotes/${remote}/main`;
  if (options.dryRun) return { status: "dry-run", checkout, ref, commit, created: false, updated: false };

  // The caller owns the fork's remotes. Never replace their configured URL with a local clone path.
  await gitOk(root, ["remote", "get-url", remote], timeoutMs);
  if (!present) {
    await gitOk(
      dirname(checkout),
      ["clone", "--single-branch", "--branch", "main", UPSTREAM_SOURCE_URL, checkout],
      timeoutMs,
    );
    commit = await verifySource(checkout, timeoutMs);
  }
  const previous = commit;
  await gitOk(checkout, ["fetch", "--no-tags", "origin", "refs/heads/main:refs/remotes/origin/main"], timeoutMs);
  const ancestor = await git(checkout, ["merge-base", "--is-ancestor", "HEAD", "refs/remotes/origin/main"], timeoutMs);
  if (ancestor.code === 1)
    throw new Error("upstream source has local commits or divergent history; fast-forward refused");
  if (ancestor.code !== 0) throw new Error(`upstream source ancestry check failed (${ancestor.code})`);
  await gitOk(checkout, ["merge", "--ff-only", "--no-edit", "refs/remotes/origin/main"], timeoutMs);
  commit = await verifySource(checkout, timeoutMs);
  await gitOk(root, ["fetch", "--no-tags", "--no-write-fetch-head", checkout, `refs/heads/main:${ref}`], timeoutMs);
  const imported = await gitOk(root, ["rev-parse", "--verify", ref], timeoutMs);
  if (imported !== commit) throw new Error("fork upstream reference differs from verified source main");
  return { status: "ready", checkout, ref, commit, created: !present, updated: commit !== previous };
}
