import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assignSplits,
  exportGraphSnapshot,
  exportPublicSources,
  inventory,
  parseTree,
  sourceGroup,
  type PublicSource,
  type SourceFile,
} from "./source.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const temp = () => {
  const path = mkdtempSync(join(tmpdir(), "bun-public-dataset-"));
  roots.push(path);
  return path;
};
const hash = (input: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(input).digest("hex");
async function git(root: string, args: string[]) {
  const child = Bun.spawn(["git", "-C", root, "-c", "core.hooksPath=", "-c", "commit.gpgsign=false", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exit !== 0) throw new Error("Fixture Git command failed (" + exit + "): " + stderr);
  return stdout.trim();
}
async function fixture() {
  const base = temp(),
    root = join(base, "source"),
    out = join(base, "protected-output");
  mkdirSync(root);
  await git(root, ["init", "-q"]);
  await git(root, ["config", "core.autocrlf", "false"]);
  await Bun.write(join(root, "README.md"), "Public Bun fixture\n");
  await Bun.write(join(root, "packages/owner/index.ts"), "export const value = 'é🙂';\n");
  await Bun.write(join(root, "test/fixture.bin"), new Uint8Array([0, 1, 254, 255]));
  await Bun.write(join(root, "LICENSE"), "Fixture license\n");
  await git(root, ["add", "."]);
  await git(root, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "public fixture",
  ]);
  const revision = await git(root, ["rev-parse", "HEAD"]);
  const source: PublicSource = { repository: "oven-sh/bun", root, revision };
  return { base, root, out, source };
}
async function rows(out: string, shards: { path: string }[]) {
  const result: Record<string, any>[] = [];
  for (const shard of shards)
    for (const row of (await Bun.file(join(out, shard.path)).text()).trim().split("\n"))
      if (row) result.push(JSON.parse(row));
  return result;
}
test("Git inventory accepts NUL-delimited whitespace names and retains the gitlink gap", () => {
  const source: PublicSource = { repository: "oven-sh/bun", root: ".", revision: "a".repeat(40) };
  const raw = new TextEncoder().encode(
    "100644 blob " +
      "b".repeat(40) +
      " 2\tfile with space\nline.ts\0" +
      "160000 commit " +
      "c".repeat(40) +
      " -\tpackages/foreign\0",
  );
  const files = parseTree(raw, source);
  expect(files.map(f => [f.path, f.bytes, f.encoding])).toEqual([
    ["file with space\nline.ts", 2, "binary"],
    ["packages/foreign", 0, "gitlink"],
  ]);
  expect(files[1]!.sha256).toBeNull();
  expect(() =>
    parseTree(new TextEncoder().encode("100644 blob " + "a".repeat(40) + " 1\t../secret\0"), source),
  ).toThrow("Unsafe");
  expect(sourceGroup("src/runtime/nginx/mod.rs")).toBe("src/runtime/nginx");
  expect(sourceGroup("packages/bun-agent-plugin/src/native.ts")).toBe("packages/bun-agent-plugin");
});
test("identical fileSHA joins whole owners before holdout assignment, including cross-repository copies", () => {
  const make = (group: string, sha256: string): SourceFile => ({
    repository: "oven-sh/bun",
    revision: "a".repeat(40),
    path: group + "/a.ts",
    mode: "100644",
    gitBlob: "a".repeat(40),
    bytes: 1,
    group,
    sha256,
    encoding: "utf8",
  });
  const files = [
    make("packages/a", hash("shared")),
    make("packages/b", hash("shared")),
    make("packages/b", hash("unique")),
    { ...make("packages/a", hash("unique-a")), repository: "aphrody-labs/bun" as const },
  ];
  const result = assignSplits(files);
  expect(result.independentGroups).toBe(1);
  expect(new Set(files.map(f => f.split)).size).toBe(1);
  expect(result.heldOutAvailable).toBe(false);
});
test("complete source export reads the pinned Git blobs and preserves every binary byte", async () => {
  const { root, out, source } = await fixture();
  await Bun.write(join(root, "README.md"), "DIRTY LOCAL PRIVATE VALUE SHOULD NEVER APPEAR");
  await Bun.write(join(root, "untracked-cookie.json"), "private");
  const manifest = await exportPublicSources({ sources: [source], out, shardBytes: 4096 });
  expect(manifest.files).toBe(4);
  expect(manifest.blobs).toBe(4);
  expect(manifest.sourceBlobsComplete).toBe(true);
  expect(manifest.graphComplete).toBe(false);
  expect(manifest.trained).toBe(false);
  expect(manifest.licenses).toEqual([
    { repository: "oven-sh/bun", path: "LICENSE", sha256: hash("Fixture license\n") },
  ]);
  const data = await rows(
    out,
    manifest.shards.filter(s => s.path.startsWith("source-")),
  );
  const readme = data.find(r => r.owners.some((o: any) => o.path === "README.md"))!;
  expect(Buffer.from(readme.data, "base64").toString()).toBe("Public Bun fixture\n");
  const binary = data.find(r => r.owners.some((o: any) => o.path === "test/fixture.bin"))!;
  expect(Buffer.from(binary.data, "base64")).toEqual(Buffer.from([0, 1, 254, 255]));
  expect(binary.sourceEncoding).toBe("binary");
  expect(data.some(r => r.owners.some((o: any) => o.path === "untracked-cookie.json"))).toBe(false);
  for (const shard of manifest.shards) {
    const bytes = await Bun.file(join(out, shard.path)).bytes();
    expect(bytes.length).toBe(shard.bytes);
    expect(hash(bytes)).toBe(shard.sha256);
    expect(shard.bytes).toBeLessThanOrEqual(4096);
  }
  await expect(exportPublicSources({ sources: [source], out })).rejects.toThrow("Immutable dataset");
});
test("exports are deterministic and hold public source boundaries", async () => {
  const { base, root, source } = await fixture();
  const a = await exportPublicSources({ sources: [source], out: join(base, "a") });
  const b = await exportPublicSources({ sources: [source], out: join(base, "b") });
  expect(a).toEqual(b);
  await expect(exportPublicSources({ sources: [source], out: join(root, "dataset") })).rejects.toThrow(
    "protected store",
  );
  await expect(inventory({ ...source, revision: "main" })).rejects.toThrow("immutable");
  await expect(inventory({ ...source, repository: "private/repo" as PublicSource["repository"] })).rejects.toThrow(
    "public Bun",
  );
});
test("already aborted export never publishes a manifest", async () => {
  const { source, out } = await fixture();
  await expect(
    exportPublicSources({ sources: [source], out, signal: AbortSignal.abort(new Error("cancelled")) }),
  ).rejects.toThrow("cancelled");
  expect(await Bun.file(join(out, "source-manifest.json")).exists()).toBe(false);
});
async function graphFixture() {
  const base = temp(),
    artifact = join(base, "snapshot.json"),
    out = join(base, "graph");
  const content = '{"nodes":[],"fixture":"published native owner"}\n';
  await Bun.write(artifact, content);
  const digest = hash(content),
    revision = "d".repeat(40);
  const scope = {
    repositoryId: "public-bun",
    snapshotId: "immutable",
    domain: "src/runtime",
    source: "graph:bun:dataset:fixture",
    profile: "bun" as const,
    revision,
  };
  const db = new Database(":memory:");
  db.exec(
    "CREATE TABLE repositories(id TEXT,metadata TEXT); CREATE TABLE graph_snapshots(repository_id TEXT,id TEXT,sha256 TEXT,metadata TEXT,revision TEXT); CREATE TABLE nodes(id TEXT,repository_id TEXT,kind TEXT,label TEXT,file TEXT,line INTEGER,provenance TEXT,metadata TEXT); CREATE TABLE edges(id TEXT,repository_id TEXT,source TEXT,target TEXT,kind TEXT,provenance TEXT,confidence REAL,metadata TEXT)",
  );
  db.query("INSERT INTO repositories VALUES(?,?)").run(scope.repositoryId, JSON.stringify(scope));
  const ns = scope.repositoryId + ":graph:" + digest + ":";
  db.query("INSERT INTO graph_snapshots VALUES(?,?,?,?,?)").run(
    scope.repositoryId,
    scope.snapshotId,
    digest,
    JSON.stringify({
      namespace: ns,
      graph: {
        domain: scope.domain,
        scope: { source: scope.source, profile: scope.profile },
        coverage: { files: 11, unresolvedFiles: 1 },
        producerSHA256: "e".repeat(64),
      },
    }),
    revision,
  );
  for (let i = 0; i < 11; i++)
    db.query("INSERT INTO nodes VALUES(?,?,?,?,?,?,?,?)").run(
      ns + String(i).padStart(3, "0"),
      scope.repositoryId,
      i === 0 ? "file" : "function",
      i === 1 ? "x".repeat(5000) : "value",
      "src/runtime/a.ts",
      i,
      i === 0 ? "UNRESOLVED" : "EXTRACTED",
      "{}",
    );
  db.query("INSERT INTO nodes VALUES(?,?,?,?,?,?,?,?)").run(
    "private-row",
    "other-private-owner",
    "file",
    "DO NOT EXPORT",
    "cookies/private",
    0,
    "EXTRACTED",
    "{}",
  );
  db.query("INSERT INTO edges VALUES(?,?,?,?,?,?,?,?)").run(
    ns + "edge:0",
    scope.repositoryId,
    ns + "000",
    ns + "001",
    "calls",
    "UNRESOLVED",
    0,
    "{}",
  );
  return { db, scope, artifact, out };
}
test("graph export keyset pagination retains full labels, gaps and exact snapshot scope", async () => {
  const { db, scope, artifact, out } = await graphFixture();
  try {
    const receipt = await exportGraphSnapshot(db, scope, artifact, out, 2);
    expect(receipt.counts).toEqual({ nodes: 11, edges: 1, unresolved: 2, filesMissingHashes: 1 });
    expect(receipt.rowsComplete).toBe(true);
    expect(receipt.astComplete).toBe(false);
    expect(receipt.trained).toBe(false);
    const data = await rows(out, receipt.shards);
    expect(data.length).toBe(12);
    expect(data.some(r => r.row.label === "DO NOT EXPORT")).toBe(false);
    expect(data.find(r => r.row.label?.length === 5000)?.row.label.length).toBe(5000);
  } finally {
    db.close();
  }
});
test("graph snapshot foreign profile/revision/artifact is rejected before row export", async () => {
  const { db, scope, artifact, out } = await graphFixture();
  try {
    await expect(exportGraphSnapshot(db, { ...scope, profile: "private" as "bun" }, artifact, out)).rejects.toThrow(
      "explicit public",
    );
    await expect(exportGraphSnapshot(db, { ...scope, revision: "f".repeat(40) }, artifact, out)).rejects.toThrow(
      "foreign revision",
    );
    await Bun.write(artifact, "modified");
    await expect(exportGraphSnapshot(db, scope, artifact, out)).rejects.toThrow("checksum");
  } finally {
    db.close();
  }
});

test("fixed chunk boundaries are deterministic for a large UTF-8 Git blob", async () => {
  const { base, root, source } = await fixture();
  const raw = new TextEncoder().encode("a".repeat(65535) + "é🙂" + "z".repeat(1024));
  await Bun.write(join(root, "packages/owner/large.txt"), raw);
  await git(root, ["add", "."]);
  await git(root, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "large blob",
  ]);
  const revision = await git(root, ["rev-parse", "HEAD"]),
    pinned = { ...source, revision };
  const a = await exportPublicSources({ sources: [pinned], out: join(base, "large-a"), shardBytes: 262144 });
  const b = await exportPublicSources({ sources: [pinned], out: join(base, "large-b"), shardBytes: 262144 });
  expect(a).toEqual(b);
  const records = (
    await rows(
      join(base, "large-a"),
      a.shards.filter(s => s.path.startsWith("source-")),
    )
  ).filter(r => r.owners.some((o: any) => o.path === "packages/owner/large.txt"));
  expect(records.map(r => r.offset)).toEqual([0, 65536]);
  expect(Buffer.concat(records.map(r => Buffer.from(r.data, "base64")))).toEqual(Buffer.from(raw));
});
