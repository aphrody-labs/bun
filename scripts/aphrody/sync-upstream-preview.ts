import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

export type UpstreamPreviewOptions = {
  root: string;
  ref: string;
  owned?: readonly string[];
  rewrite?: (path: string, text: string) => string;
  expectedHead?: string;
  expectedRef?: string;
  timeoutMs?: number;
  maxBuffer?: number;
};

export type UpstreamPreview = {
  head: string;
  upstream: string;
  base: string | null;
  behind: number;
  tree: string;
  conflicts: string[];
  renameResolved: string[];
  kept: string[];
  changed: string[];
  added: string[];
  deleted: string[];
  dirty: string[];
  collisions: string[];
};

type GitResult = { code: number; out: Buffer; err: Buffer };

/** Computes Git objects only; never reads into or updates the checkout's index. */
export async function previewUpstream(options: UpstreamPreviewOptions): Promise<UpstreamPreview> {
  const { root, ref } = options;
  const timeout = options.timeoutMs ?? 30_000;
  const limit = options.maxBuffer ?? 64 * 1024 * 1024;
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || !Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("preview timeoutMs and maxBuffer must be positive integers");
  }
  const git = async (args: string[], input?: string | Buffer, index?: string): Promise<GitResult> => {
    const proc = Bun.spawn({
      cmd: ["git", "--literal-pathspecs", ...args],
      cwd: root,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_INDEX_FILE: index },
      stdin: input === undefined ? "ignore" : new Blob([typeof input === "string" ? input : new Uint8Array(input)]),
      stdout: "pipe",
      stderr: "pipe",
      timeout,
    });
    const collect = async (stream: ReadableStream<Uint8Array>) => {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) throw new Error(`git ${args[0]} exceeds preview maxBuffer (${limit} bytes)`);
          chunks.push(value);
        }
        return Buffer.concat(chunks, size);
      } finally {
        reader.releaseLock();
      }
    };
    try {
      const [out, err, code] = await Promise.all([collect(proc.stdout), collect(proc.stderr), proc.exited]);
      if (proc.signalCode)
        throw new Error(`git ${args[0]} terminated (${proc.signalCode}); preview timeout ${timeout}ms`);
      return { code, out, err };
    } catch (error) {
      proc.kill();
      await proc.exited;
      throw error;
    }
  };
  const ok = async (args: string[], input?: string | Buffer, index?: string) => {
    const result = await git(args, input, index);
    if (result.code !== 0) throw new Error(`git ${args[0]} failed (${result.code}): ${result.err.toString().trim()}`);
    return result.out;
  };
  const oid = async (name: string) => (await ok(["rev-parse", "--verify", `${name}^{commit}`])).toString().trim();
  const [head, upstream, gitDir] = await Promise.all([
    oid("HEAD"),
    oid(ref),
    ok(["rev-parse", "--path-format=absolute", "--git-dir"]).then(bytes => bytes.toString().trim()),
  ]);
  if (options.expectedHead && options.expectedHead !== head) throw new Error("HEAD changed before upstream preview");
  if (options.expectedRef && options.expectedRef !== upstream)
    throw new Error(`${ref} changed before upstream preview`);
  const scratch = await mkdtemp(join(gitDir, "aphrody-sync-preview-"));
  try {
    const index = join(scratch, "index");
    const [behindBytes, basesBytes, merge] = await Promise.all([
      ok(["rev-list", "--count", `${head}..${upstream}`]),
      ok(["merge-base", "--all", head, upstream]),
      git(["merge-tree", "--write-tree", "--name-only", "-z", head, upstream]),
    ]);
    if (merge.code !== 0 && merge.code !== 1) {
      throw new Error(`git merge-tree failed (${merge.code}): ${merge.err.toString().trim()}`);
    }
    const sections = merge.out.toString().split("\0");
    let tree = sections.shift()?.trim() ?? "";
    if (!/^[a-f0-9]{40,64}$/.test(tree)) throw new Error("git merge-tree returned no valid tree object");
    const originalConflicts: string[] = [];
    for (const path of sections) {
      if (!path) break;
      originalConflicts.push(path);
    }
    const bases = basesBytes.toString().trim().split("\n").filter(Boolean);
    const base = bases.length === 1 ? bases[0] : null;
    const conflicts: string[] = [];
    const renameResolved: string[] = [];
    const kept: string[] = [];
    await ok(["read-tree", tree], undefined, index);
    const entry = async (commit: string, path: string) => {
      const line = (await ok(["ls-tree", "-z", commit, "--", path])).toString().split("\0")[0];
      const found = /^(\d+) blob ([a-f0-9]+)\t([\s\S]+)$/.exec(line);
      return found && found[3] === path ? { mode: found[1], hash: found[2] } : null;
    };
    const put = async (path: string, value: { mode: string; hash: string } | null) => {
      await ok(["update-index", "--force-remove", "--", path], undefined, index);
      if (value) await ok(["update-index", "--add", "--cacheinfo", value.mode, value.hash, path], undefined, index);
    };
    for (const path of originalConflicts) {
      const ours = await entry(head, path);
      if (options.owned?.includes(path)) {
        await put(path, ours);
        kept.push(path);
        continue;
      }
      if (!options.rewrite || !base || !ours || !["100644", "100755"].includes(ours.mode)) {
        conflicts.push(path);
        continue;
      }
      const [before, theirs] = await Promise.all([entry(base, path), entry(upstream, path)]);
      if (!before || !theirs || ours.mode !== theirs.mode || before.mode !== ours.mode) {
        conflicts.push(path);
        continue;
      }
      const [ourBytes, baseBytes, theirBytes] = await Promise.all(
        [ours.hash, before.hash, theirs.hash].map(hash => ok(["cat-file", "blob", hash])),
      );
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let texts: string[];
      try {
        if ([ourBytes, baseBytes, theirBytes].some(bytes => bytes.includes(0))) throw new Error("binary blob");
        texts = [ourBytes, baseBytes, theirBytes].map(bytes => decoder.decode(bytes));
      } catch {
        conflicts.push(path);
        continue;
      }
      const files = ["ours", "base", "theirs"].map(name => join(scratch, name));
      await Promise.all([
        Bun.write(files[0], texts[0]),
        Bun.write(files[1], options.rewrite(path, texts[1])),
        Bun.write(files[2], options.rewrite(path, texts[2])),
      ]);
      const merged = await git(["merge-file", "-p", "--", ...files]);
      if (merged.code !== 0) {
        conflicts.push(path);
        continue;
      }
      const hash = (await ok(["hash-object", "-w", "--stdin"], merged.out)).toString().trim();
      await put(path, { mode: ours.mode, hash });
      renameResolved.push(path);
    }
    tree = (await ok(["write-tree"], undefined, index)).toString().trim();
    const [changes, status] = await Promise.all([
      ok(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", "-z", head, tree]),
      ok(["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    ]);
    const changed: string[] = [];
    const added: string[] = [];
    const deleted: string[] = [];
    const fields = changes.toString().split("\0");
    for (let i = 0; fields[i]; i += 2) {
      const path = fields[i + 1];
      if (path === undefined) throw new Error("incomplete Git diff-tree record");
      changed.push(path);
      if (fields[i] === "A") added.push(path);
      if (fields[i] === "D") deleted.push(path);
    }
    const dirty = new Set<string>();
    const dirtyFields = status.toString().split("\0");
    for (let i = 0; dirtyFields[i]; i++) {
      const record = dirtyFields[i];
      dirty.add(record.slice(3));
      if (/[RC]/.test(record.slice(0, 2))) {
        const oldPath = dirtyFields[++i];
        if (oldPath === undefined) throw new Error("incomplete Git status rename record");
        dirty.add(oldPath);
      }
    }
    const collides = (path: string) =>
      [...dirty].some(
        local => local === path || local.startsWith(`${path}/`) || path.startsWith(`${local.replace(/\/$/, "")}/`),
      );
    const collisions = changed.filter(collides);
    const [currentHead, currentUpstream] = await Promise.all([oid("HEAD"), oid(ref)]);
    if (head !== currentHead || upstream !== currentUpstream)
      throw new Error("HEAD or upstream ref changed during preview");
    return {
      head,
      upstream,
      base,
      behind: Number(behindBytes.toString().trim()),
      tree,
      conflicts,
      renameResolved,
      kept,
      changed,
      added,
      deleted,
      dirty: [...dirty].sort(),
      collisions,
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
