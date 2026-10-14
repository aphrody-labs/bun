#!/usr/bin/env bun

export {};

type Result = { host: string; repo: string; ok: boolean; detail: string };

const apply = process.argv.includes("--apply");
const commitTracked = process.argv.includes("--commit-tracked");
const mergeWorktrees = process.argv.includes("--merge-worktrees");
const hosts = (process.env.APHRODY_WORKTREE_FLEET_HOSTS ?? "local,vps,dbfr")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

const run = async (args: string[], cwd?: string) => {
  const proc = Bun.spawn(args, {
    ...(cwd ? { cwd } : {}),
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout: stdout.trim(), stderr: stderr.trim() };
};

const git = (repo: string, ...args: string[]) => run(["git", "-C", repo, ...args]);

async function localRepos(): Promise<string[]> {
  const roots = (process.env.APHRODY_REPO_ROOTS ?? "C:/src;C:/bun").split(";").filter(Boolean);
  const repos = new Set<string>();
  for (const root of roots) {
    if ((await git(root, "rev-parse", "--show-toplevel")).code === 0) repos.add(root);
    const glob = new Bun.Glob("*/.git/HEAD");
    for await (const marker of glob.scan({ cwd: root, absolute: true })) {
      repos.add(marker.replace(/[\\/]\.git[\\/]HEAD$/, ""));
    }
  }
  return [...repos].sort();
}

async function defaultBranch(repo: string): Promise<string> {
  const upstream = await git(repo, "rev-parse", "--abbrev-ref", "@{upstream}");
  if (upstream.code === 0 && upstream.stdout.includes("/")) return upstream.stdout.replace(/^[^/]+\//, "");
  const remote = await git(repo, "remote", "get-url", "origin");
  const match = remote.stdout.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/);
  if (match) {
    const api = await run(["gh", "api", `repos/${match[1]}`, "--jq", ".default_branch"]);
    if (api.code === 0 && api.stdout) return api.stdout;
  }
  const symbolic = await git(repo, "symbolic-ref", "--short", "refs/remotes/origin/HEAD");
  if (symbolic.code === 0) return symbolic.stdout.replace(/^origin\//, "");
  for (const candidate of ["main", "os", "master"]) {
    if ((await git(repo, "show-ref", "--verify", `refs/heads/${candidate}`)).code === 0) return candidate;
  }
  return (await git(repo, "branch", "--show-current")).stdout;
}

async function reconcileLocal(repo: string): Promise<Result> {
  const base = await defaultBranch(repo);
  const current = (await git(repo, "branch", "--show-current")).stdout;
  const status = (await git(repo, "status", "--porcelain")).stdout;
  if (!apply)
    return {
      host: "local",
      repo,
      ok: true,
      detail: `${current || "detached"} -> ${base}; ${status ? "dirty" : "clean"}`,
    };

  await git(repo, "fetch", "--all", "--prune");
  if (commitTracked && (await git(repo, "diff", "--quiet")).code !== 0) {
    await git(repo, "add", "-u");
    const staged = await git(repo, "diff", "--cached", "--quiet");
    if (staged.code !== 0)
      await git(
        repo,
        "-c",
        "user.name=aphrody-dev",
        "-c",
        "user.email=contact@aphrody.com",
        "commit",
        "-m",
        "chore: checkpoint fleet workspace",
      );
  }
  if (current === base && !(await git(repo, "status", "--porcelain")).stdout) {
    await git(repo, "pull", "--rebase", "origin", base);
  }
  if (mergeWorktrees) {
    const list = await git(repo, "worktree", "list", "--porcelain");
    let path = "";
    for (const line of list.stdout.split("\n")) {
      if (line.startsWith("worktree ")) path = line.slice(9);
      if (path && line.startsWith("branch refs/heads/") && line.slice(18) !== base) {
        const clean = !(await git(path, "status", "--porcelain")).stdout;
        if (clean) await run(["git-wt", "-y", "-C", path, "merge", base]);
        path = "";
      }
    }
  }
  await git(repo, "worktree", "prune");
  const origin = await git(repo, "remote", "get-url", "origin");
  if (current && origin.code === 0) {
    const pulled = await git(repo, "pull", "--rebase", "origin", current);
    if (pulled.code !== 0) return { host: "local", repo, ok: false, detail: pulled.stderr };
    const pushed = await git(repo, "push", "origin", current);
    if (pushed.code !== 0) return { host: "local", repo, ok: false, detail: pushed.stderr };
  }
  return { host: "local", repo, ok: true, detail: `${current || "detached"} -> ${base}` };
}

const remoteProgram = String.raw`
set -u
apply="$1"; commit_tracked="$2"; merge_worktrees="$3"
for root in "$HOME/src" "$HOME/apps"; do
  test -d "$root" || continue
  for repo in "$root"/*; do
    test -d "$repo/.git" || continue
    current=$(git -C "$repo" branch --show-current)
    upstream=$(git -C "$repo" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || true)
    base=$(printf '%s' "$upstream" | sed 's#^[^/]*/##')
    origin=$(git -C "$repo" remote get-url origin 2>/dev/null || true)
    slug=$(printf '%s' "$origin" | sed -nE 's#.*github.com[:/]([^/]+/[^/.]+)(\.git)?$#\1#p')
    if test -z "$base" && test -n "$slug" && command -v gh >/dev/null 2>&1; then base=$(gh api "repos/$slug" --jq .default_branch 2>/dev/null || true); fi
    test -n "$base" || base=$(git -C "$repo" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)
    test -n "$base" || base="$current"
    if test "$apply" != 1; then printf '%s|%s|%s\n' "$repo" "$current" "$base"; continue; fi
    git -C "$repo" fetch --all --prune || { printf '%s|ERROR|fetch failed\n' "$repo"; continue; }
    if test "$commit_tracked" = 1 && ! git -C "$repo" diff --quiet; then
      git -C "$repo" add -u
      git -C "$repo" diff --cached --quiet || git -C "$repo" -c user.name=aphrody-dev -c user.email=contact@aphrody.com commit -m 'chore: checkpoint fleet workspace'
    fi
    if test "$merge_worktrees" = 1 && command -v git-wt >/dev/null 2>&1; then
      git -C "$repo" worktree list --porcelain | awk '/^worktree /{p=substr($0,10)} /^branch refs\/heads\//{b=substr($0,19); print p "|" b}' | while IFS='|' read -r path branch; do
        test "$branch" = "$base" && continue
        test -z "$(git -C "$path" status --porcelain)" && git-wt -y -C "$path" merge "$base" || true
      done
    fi
    git -C "$repo" worktree prune
    if test -n "$current" && test -n "$origin"; then
      git -C "$repo" pull --rebase origin "$current" || { printf '%s|ERROR|rebase failed\n' "$repo"; continue; }
      git -C "$repo" push origin "$current" || { printf '%s|ERROR|push failed\n' "$repo"; continue; }
    fi
    printf '%s|%s|%s\n' "$repo" "$current" "$base"
  done
done
`;

async function remote(host: string): Promise<Result[]> {
  const args = [
    "ssh",
    "-o",
    "ConnectTimeout=15",
    "-o",
    "BatchMode=yes",
    host,
    "bash",
    "-s",
    "--",
    apply ? "1" : "0",
    commitTracked ? "1" : "0",
    mergeWorktrees ? "1" : "0",
  ];
  const proc = Bun.spawn(args, { stdin: new Blob([remoteProgram]), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) return [{ host, repo: "*", ok: false, detail: stderr.trim() }];
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(line => {
      const [repo = "*", current = "", base = ""] = line.split("|");
      return current === "ERROR"
        ? { host, repo, ok: false, detail: base }
        : { host, repo, ok: true, detail: `${current || "detached"} -> ${base}` };
    });
}

const tasks = hosts.map(async host =>
  host === "local" ? Promise.all((await localRepos()).map(reconcileLocal)) : remote(host),
);
const results = (await Promise.all(tasks)).flat();
console.log(JSON.stringify({ mode: apply ? "apply" : "plan", results }, null, 2));
if (results.some(result => !result.ok)) process.exit(1);
