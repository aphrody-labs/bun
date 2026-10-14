// SPDX-License-Identifier: Apache-2.0
// Public immutable Git blobs and published native graph rows. Extraction remains with bun:graph-native.
import { chmodSync, closeSync, mkdirSync, openSync, realpathSync, renameSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { Database } from "bun:sqlite";
import graphJSON from "../graphx.ts";

export type Split = "train" | "validation" | "test";
export interface PublicSource {
  repository: "oven-sh/bun" | "aphrody-labs/bun";
  root: string;
  revision: string;
}
export interface SourceFile {
  repository: PublicSource["repository"];
  revision: string;
  path: string;
  mode: string;
  gitBlob: string;
  bytes: number;
  group: string;
  sha256: string | null;
  encoding: "utf8" | "binary" | "gitlink";
  split?: Split;
}
export interface Shard {
  path: string;
  sha256: string;
  bytes: number;
  rows: number;
}
const sha = (data: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(data).digest("hex");
function integer(value: number, name: string, max: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new RangeError("Invalid " + name);
  return value;
}
function within(root: string, path: string) {
  const suffix = relative(root, path);
  return !suffix.startsWith("..") && !isAbsolute(suffix);
}
function safePath(path: string) {
  if (
    !path ||
    path.includes("\\") ||
    path.includes("\0") ||
    isAbsolute(path) ||
    path.split("/").some(p => !p || p === "." || p === "..")
  )
    throw new Error("Unsafe public source path");
  return path;
}
export function sourceGroup(path: string) {
  safePath(path);
  const parts = path.split("/");
  if (["src", "packages", "crates", "vendor", "plugins"].includes(parts[0]!) && parts.length > 1)
    return parts.slice(0, parts[0] === "src" && parts[1] === "runtime" && parts.length > 2 ? 3 : 2).join("/");
  if ([".agents", ".claude", ".Codex"].includes(parts[0]!) && parts[1] === "skills") return parts.slice(0, 3).join("/");
  return parts.length > 1 ? parts[0]! : "root";
}
export function parseTree(raw: Uint8Array, source: PublicSource): SourceFile[] {
  const files: SourceFile[] = [];
  for (const record of new TextDecoder("utf-8", { fatal: true }).decode(raw).split("\0")) {
    if (!record) continue;
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]{40})\s+(\d+|-)\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error("Malformed Git source inventory");
    const [, mode, type, gitBlob, size, path] = match;
    if (!path || !mode || !gitBlob || (type === "commit") !== (mode === "160000"))
      throw new Error("Malformed Git source mode");
    const bytes = type === "commit" ? 0 : Number(size);
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Invalid Git source size");
    files.push({
      repository: source.repository,
      revision: source.revision,
      path: safePath(path),
      mode,
      gitBlob,
      bytes,
      group: sourceGroup(path),
      sha256: null,
      encoding: type === "commit" ? "gitlink" : "binary",
    });
  }
  return files;
}
async function bounded(stream: ReadableStream<Uint8Array>, maximum: number) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > maximum) throw new RangeError("Git metadata exceeds byte limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function inventory(source: PublicSource, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!["oven-sh/bun", "aphrody-labs/bun"].includes(source.repository) || !/^[a-f0-9]{40}$/.test(source.revision))
    throw new Error("Training requires an immutable public Bun repository revision");
  const child = Bun.spawn(["git", "-C", source.root, "ls-tree", "-r", "-l", "-z", source.revision], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60000,
    ...(signal ? { signal } : {}),
  });
  try {
    const [raw, errors, exit] = await Promise.all([
      bounded(child.stdout, 128 * 1024 * 1024),
      bounded(child.stderr, 16384),
      child.exited,
    ]);
    if (exit !== 0) throw new Error("Public Git inventory failed: " + new TextDecoder().decode(errors));
    const files = parseTree(raw, source);
    if (!files.length || files.length > 500000)
      throw new Error("Public source inventory is empty or exceeds file limit");
    return files;
  } finally {
    if (child.exitCode === null) child.kill();
  }
}
class Bytes {
  private pending: Uint8Array = new Uint8Array(0);
  private offset = 0;
  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}
  async take(maximum: number): Promise<Uint8Array> {
    if (this.offset === this.pending.length) {
      const next = await this.reader.read();
      if (next.done) throw new Error("Git object stream ended early");
      this.pending = next.value;
      this.offset = 0;
    }
    const end = Math.min(this.pending.length, this.offset + maximum);
    const chunk = this.pending.subarray(this.offset, end);
    this.offset = end;
    return chunk;
  }
  async exact(size: number) {
    const result = new Uint8Array(size);
    let offset = 0;
    while (offset < size) {
      const chunk = await this.take(size - offset);
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
  async line() {
    const bytes: number[] = [];
    while (bytes.length < 200) {
      const chunk = await this.take(1);
      if (chunk[0] === 10) return String.fromCharCode(...bytes);
      bytes.push(chunk[0]!);
    }
    throw new Error("Invalid Git object header");
  }
}
class Blobs {
  private readonly child: Bun.Subprocess<"pipe", "pipe", "ignore">;
  private readonly bytes: Bytes;
  constructor(root: string, signal?: AbortSignal) {
    this.child = Bun.spawn(["git", "-C", root, "cat-file", "--batch"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
      timeout: 900000,
      ...(signal ? { signal } : {}),
    });
    this.bytes = new Bytes(this.child.stdout.getReader());
  }
  async *read(file: SourceFile) {
    this.child.stdin.write(file.gitBlob + "\n");
    await this.child.stdin.flush();
    if ((await this.bytes.line()) !== file.gitBlob + " blob " + file.bytes)
      throw new Error("Git object differs from pinned inventory");
    let left = file.bytes;
    while (left) {
      const chunk = await this.bytes.exact(Math.min(left, 65536));
      left -= chunk.length;
      yield chunk;
    }
    if ((await this.bytes.take(1))[0] !== 10) throw new Error("Invalid Git object terminator");
  }
  async close() {
    await this.child.stdin.end();
    if ((await this.child.exited) !== 0) throw new Error("Git object reader failed");
  }
  kill() {
    if (this.child.exitCode === null) this.child.kill();
  }
}
/** Identical file content joins owner groups before splitting, including tiny duplicated fixtures. */
export function assignSplits(files: SourceFile[]) {
  const parents = new Map<string, string>(),
    content = new Map<string, string>();
  const find = (group: string): string => {
    const parent = parents.get(group);
    if (!parent) {
      parents.set(group, group);
      return group;
    }
    if (parent === group) return group;
    const result = find(parent);
    parents.set(group, result);
    return result;
  };
  for (const file of files) {
    if (!file.sha256) continue;
    const other = content.get(file.sha256);
    if (other) {
      const a = find(other),
        b = find(file.group);
      if (a !== b) parents.set(a < b ? b : a, a < b ? a : b);
    } else content.set(file.sha256, file.group);
    find(file.group);
  }
  const counts: Record<Split, number> = { train: 0, validation: 0, test: 0 };
  for (const file of files) {
    if (!file.sha256) continue;
    const slot = parseInt(sha(find(file.group)).slice(0, 8), 16) % 10;
    file.split = slot === 0 ? "test" : slot === 1 ? "validation" : "train";
    counts[file.split]++;
  }
  return {
    counts,
    independentGroups: new Set([...parents.keys()].map(find)).size,
    heldOutAvailable: counts.validation > 0 && counts.test > 0,
    grouping: "owner-components-joined-by-identical-file-sha256",
  };
}
class JSONL {
  readonly shards: Shard[] = [];
  private writer: ReturnType<Bun.BunFile["writer"]> | undefined;
  private hasher = new Bun.CryptoHasher("sha256");
  private bytes = 0;
  private rows = 0;
  private pending = 0;
  private path = "";
  constructor(
    private readonly out: string,
    private readonly stem: string,
    private readonly maximum: number,
  ) {}
  async row(value: unknown) {
    const text = graphJSON.encodeJSON(value, Math.min(this.maximum, 4 * 1024 * 1024)) + "\n",
      size = Buffer.byteLength(text);
    if (size > this.maximum) throw new RangeError("Dataset row exceeds shard size");
    if (this.writer && this.bytes + size > this.maximum) await this.finish();
    if (!this.writer) {
      this.path = this.stem + "-" + String(this.shards.length).padStart(5, "0") + ".jsonl";
      const path = join(this.out, this.path);
      if ((await Bun.file(path).exists()) || (await Bun.file(path + ".incomplete").exists()))
        throw new Error("Dataset shard already exists");
      const fd = openSync(path + ".incomplete", "wx", 0o600);
      closeSync(fd);
      this.writer = Bun.file(path + ".incomplete").writer();
    }
    this.writer.write(text);
    this.hasher.update(text);
    this.bytes += size;
    this.pending += size;
    this.rows++;
    if (this.pending >= 262144) {
      await this.writer.flush();
      this.pending = 0;
    }
  }
  async finish() {
    if (!this.writer) return;
    await this.writer.end();
    const path = join(this.out, this.path);
    chmodSync(path + ".incomplete", 0o600);
    renameSync(path + ".incomplete", path);
    this.shards.push({ path: this.path, sha256: this.hasher.digest("hex"), bytes: this.bytes, rows: this.rows });
    this.writer = undefined;
    this.hasher = new Bun.CryptoHasher("sha256");
    this.bytes = this.rows = this.pending = 0;
  }
}
function protectedOutput(out: string, roots: string[]) {
  if (roots.some(root => within(realpathSync(root), resolve(out))))
    throw new Error("Complete datasets belong in a protected store outside source checkouts");
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const actual = realpathSync(out);
  if (roots.some(root => within(realpathSync(root), actual)))
    throw new Error("Complete datasets belong in a protected store outside source checkouts");
  chmodSync(actual, 0o700);
  return actual;
}
export async function exportPublicSources(options: {
  sources: PublicSource[];
  out: string;
  shardBytes?: number;
  signal?: AbortSignal;
}) {
  if (!options.sources.length || options.sources.length > 2) throw new Error("Select the public Bun owners explicitly");
  if (new Set(options.sources.map(s => s.repository)).size !== options.sources.length)
    throw new Error("Duplicate public source owner");
  const maximum = integer(options.shardBytes ?? 32 * 1024 * 1024, "shard bytes", 64 * 1024 * 1024);
  const files: SourceFile[] = [];
  for (const source of options.sources) files.push(...(await inventory(source, options.signal)));
  const out = protectedOutput(
    resolve(options.out),
    options.sources.map(s => s.root),
  );
  if (await Bun.file(join(out, "source-manifest.json")).exists())
    throw new Error("Immutable dataset manifest already exists");
  const blobs = new Map<string, { file: SourceFile; source: PublicSource; owners: SourceFile[] }>();
  for (const source of options.sources)
    for (const file of files.filter(f => f.repository === source.repository && f.revision === source.revision)) {
      if (file.encoding === "gitlink") continue;
      const existing = blobs.get(file.gitBlob);
      if (existing) existing.owners.push(file);
      else blobs.set(file.gitBlob, { file, source, owners: [file] });
    }
  for (const source of options.sources) {
    const reader = new Blobs(source.root, options.signal);
    try {
      for (const item of blobs.values()) {
        if (item.source !== source) continue;
        options.signal?.throwIfAborted();
        const hasher = new Bun.CryptoHasher("sha256"),
          gitHasher = new Bun.CryptoHasher("sha1").update("blob " + item.file.bytes + "\0");
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let text = true;
        for await (const chunk of reader.read(item.file)) {
          hasher.update(chunk);
          gitHasher.update(chunk);
          if (text)
            try {
              if (decoder.decode(chunk, { stream: true }).includes("\0")) text = false;
            } catch {
              text = false;
            }
        }
        if (text)
          try {
            decoder.decode();
          } catch {
            text = false;
          }
        if (gitHasher.digest("hex") !== item.file.gitBlob) throw new Error("Public Git blob content identity failed");
        const digest = hasher.digest("hex");
        for (const owner of item.owners) {
          owner.sha256 = digest;
          owner.encoding = text ? "utf8" : "binary";
        }
      }
      await reader.close();
    } finally {
      reader.kill();
    }
  }
  const splits = assignSplits(files),
    inventories = new JSONL(out, "files", maximum);
  for (const file of files) await inventories.row(file);
  await inventories.finish();
  const contents = new JSONL(out, "source", maximum);
  let sourceBytes = 0;
  for (const source of options.sources) {
    const reader = new Blobs(source.root, options.signal);
    try {
      for (const item of blobs.values()) {
        if (item.source !== source) continue;
        options.signal?.throwIfAborted();
        let offset = 0;
        const hasher = new Bun.CryptoHasher("sha256");
        const emit = async (chunk: Uint8Array) => {
          await contents.row({
            kind: "public-source",
            sha256: item.file.sha256,
            gitBlob: item.file.gitBlob,
            bytes: item.file.bytes,
            offset,
            encoding: "base64",
            sourceEncoding: item.file.encoding,
            split: item.file.split,
            evaluation: /\.(png|jpg|jpeg|webp|gif|mp4|webm|wav)$/i.test(item.file.path)
              ? "public-bun-multimodal"
              : "code-agent",
            owners: item.owners.map(f => ({
              repository: f.repository,
              revision: f.revision,
              path: f.path,
              mode: f.mode,
              group: f.group,
            })),
            data: Buffer.from(chunk).toString("base64"),
          });
          offset += chunk.length;
          hasher.update(chunk);
        };
        if (!item.file.bytes) await emit(new Uint8Array(0));
        for await (const chunk of reader.read(item.file)) await emit(chunk);
        if (offset !== item.file.bytes || hasher.digest("hex") !== item.file.sha256)
          throw new Error("Public source changed during export");
        sourceBytes += offset;
      }
      await reader.close();
    } finally {
      reader.kill();
    }
  }
  await contents.finish();
  const gitlinks = files.filter(f => f.encoding === "gitlink");
  const manifest = {
    schema: "bun.public-source-dataset/1",
    sources: options.sources.map(({ repository, revision }) => ({ repository, revision })),
    files: files.length,
    blobs: files.length - gitlinks.length,
    uniqueBlobs: blobs.size,
    uniqueSourceBytes: sourceBytes,
    sourceBlobsComplete: true,
    gitlinksComplete: gitlinks.length === 0,
    gitlinks: gitlinks.map(({ path, gitBlob, repository, revision }) => ({
      repository,
      revision,
      path,
      revisionOfSubmodule: gitBlob,
      reason: "outside-authorized-Bun-source-owners",
    })),
    graphComplete: false,
    trained: false,
    splits,
    shards: [...inventories.shards, ...contents.shards],
    licenses: files
      .filter(f => /(^|\/)(LICENSE[^/]*|COPYING[^/]*|NOTICE[^/]*)$/i.test(f.path))
      .map(({ repository, path, sha256 }) => ({ repository, path, sha256 })),
    sourcePolicy:
      "immutable-public-Git-blobs-only; no working-tree, private store, session, cookie or conversation input",
  };
  const target = join(out, "source-manifest.json");
  await Bun.write(target + ".incomplete", JSON.stringify(manifest, null, 2) + "\n");
  chmodSync(target + ".incomplete", 0o600);
  renameSync(target + ".incomplete", target);
  return manifest;
}
export interface SnapshotScope {
  repositoryId: string;
  snapshotId: string;
  domain: string;
  source: string;
  profile: "bun";
  revision: string;
}
/** Keyset pagination of the owner's immutable namespace, never a global/private registry dump. */
export async function exportGraphSnapshot(
  db: Database,
  scope: SnapshotScope,
  artifact: string,
  out: string,
  pageSize = 256,
) {
  integer(pageSize, "graph page size", 10000);
  if (
    !scope.repositoryId ||
    !scope.snapshotId ||
    !scope.domain ||
    !scope.source.startsWith("graph:bun:") ||
    scope.profile !== "bun" ||
    !/^[a-f0-9]{40}$/.test(scope.revision)
  )
    throw new Error("Select an explicit public Bun graph scope");
  const repository = db
    .query<{ metadata: string }, [string]>("SELECT metadata FROM repositories WHERE id=?")
    .get(scope.repositoryId);
  const snapshot = db
    .query<{ sha256: string; metadata: string; revision: string }, [string, string]>(
      "SELECT sha256,metadata,revision FROM graph_snapshots WHERE repository_id=? AND id=?",
    )
    .get(scope.repositoryId, scope.snapshotId);
  if (!repository || !snapshot || snapshot.revision !== scope.revision || !/^[a-f0-9]{64}$/.test(snapshot.sha256))
    throw new Error("Public graph snapshot is missing or has foreign revision");
  const repo = graphJSON.decodeJSON(repository.metadata) as { domain?: string; profile?: string; source?: string };
  const stored = graphJSON.decodeJSON(snapshot.metadata) as {
    namespace?: string;
    graph?: {
      domain?: string;
      scope?: { source?: string; profile?: string };
      coverage?: unknown;
      producerSHA256?: string;
    };
  };
  if (
    repo.domain !== scope.domain ||
    repo.source !== scope.source ||
    repo.profile !== scope.profile ||
    stored.graph?.domain !== scope.domain ||
    stored.graph.scope?.source !== scope.source ||
    stored.graph.scope.profile !== scope.profile
  )
    throw new Error("Public graph snapshot scope mismatch");
  const namespace = stored.namespace;
  if (namespace !== scope.repositoryId + ":graph:" + snapshot.sha256 + ":")
    throw new Error("Invalid public graph snapshot namespace");
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(artifact).stream()) hasher.update(chunk);
  if (hasher.digest("hex") !== snapshot.sha256) throw new Error("Published graph artifact checksum mismatch");
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const rows = new JSONL(out, "graph-" + sha(scope.snapshotId).slice(0, 16), 32 * 1024 * 1024);
  const end = namespace.slice(0, -1) + ";",
    counts = { nodes: 0, edges: 0, unresolved: 0, filesMissingHashes: 0 };
  for (const table of ["nodes", "edges"] as const) {
    let after = "";
    const query = db.query<Record<string, string | number | null>, [string, string, string, string, number]>(
      "SELECT * FROM " + table + " WHERE repository_id=? AND id>=? AND id<? AND id>? ORDER BY id LIMIT ?",
    );
    const expected = db
      .query<{ count: number }, [string, string, string]>(
        "SELECT count(*) AS count FROM " + table + " WHERE repository_id=? AND id>=? AND id<?",
      )
      .get(scope.repositoryId, namespace, end)!.count;
    while (true) {
      const page = query.all(scope.repositoryId, namespace, end, after, pageSize);
      if (!page.length) break;
      for (const row of page) {
        if (typeof row.id !== "string" || row.id <= after) throw new Error("Invalid graph pagination identity");
        after = row.id;
        counts[table]++;
        if (row.provenance === "UNRESOLVED") counts.unresolved++;
        if (table === "nodes" && row.kind === "file") {
          const metadata = graphJSON.decodeJSON(String(row.metadata)) as { sha256?: string };
          if (!metadata.sha256 || !/^[a-f0-9]{64}$/.test(metadata.sha256)) counts.filesMissingHashes++;
        }
        await rows.row({ kind: "graph-" + table, scope, snapshotSHA256: snapshot.sha256, row });
      }
    }
    if (counts[table] !== expected) throw new Error("Published graph changed during export");
  }
  await rows.finish();
  return {
    scope,
    snapshotSHA256: snapshot.sha256,
    producerSHA256: stored.graph.producerSHA256 ?? null,
    coverage: stored.graph.coverage ?? null,
    counts,
    rowsComplete: true,
    astComplete: false,
    trained: false,
    shards: rows.shards,
  };
}
