import { expect, test } from "bun:test";
import { BunPython } from "bun:graph";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import { graphIndexerProvenance, indexCodebase } from "./graph-index";

test("the source frontend keeps a real Rust type/import collision unresolved across chunks", async () => {
  using directory = tempDir("graph-index-source-collision", {
    "src/runtime/a.rs": "pub struct Reader { pub file: File }",
    "src/runtime/b.rs": "use std::fs::File;\npub fn helper(){}",
  });
  const root = String(directory);
  using registry = new BunPython(join(root, "graph.sqlite"));
  const result = await indexCodebase(registry, root, {
    profile: "bun",
    revision: "a".repeat(40),
    concurrency: 1,
    filesPerChunk: 1,
    maxFiles: 10,
    artifactDirectory: join(root, "snapshots"),
  });
  expect(result.domains[0]!.coverage.symbolIdCollisions).toBe(1);
  const node = registry.db
    .query<{ provenance: string; metadata: string }, []>(
      "SELECT provenance,metadata FROM nodes WHERE id LIKE '%:symbol:file'",
    )
    .get()!;
  expect(node.provenance).toBe("UNRESOLVED");
  const evidence = JSON.parse(node.metadata);
  expect(evidence.unresolvedReason).toBe("native-symbol-id-collision");
  expect(evidence.conflicts).toContainEqual({
    source_file: null,
    source_location: null,
    file_type: "concept",
    label: "file",
  });
});

test("frontend and backend receipts keep separate source and executable identities", async () => {
  const receipt = await graphIndexerProvenance();
  expect(receipt.frontend.sourceRevision).toMatch(/^[a-f0-9]{40}$/);
  expect(receipt.frontend.sha256).toBe(
    new Bun.CryptoHasher("sha256")
      .update(await Bun.file(join(import.meta.dir, "../../src/js/bun/graph-index.ts")).bytes())
      .digest("hex"),
  );
  expect(receipt.nativeBackend.revision).toBe(Bun.revision);
  expect(receipt.nativeBackend.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(receipt.changedBinaryQualified).toBe(false);
});

async function fixtureGit(root: string, args: string[]) {
  const child = Bun.spawn(["git", "-C", root, "-c", "core.hooksPath=", "-c", "commit.gpgsign=false", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  const [out, error, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exit !== 0) throw new Error("Git fixture failed (" + exit + "): " + error);
  return out.trim();
}
async function pinnedFixture() {
  const directory = tempDir("graph-pinned-git", {
    "src/runtime/source.ts": "export function owned(){return 42}",
    "vendor/source/native.c": "int owned_c(void){return 42;}",
    "docs/public.md": "# Public Bun source",
    ".claude/skills/public/SKILL.md": "---\nname: public\n---\n# Bun skill",
  });
  const root = String(directory);
  await fixtureGit(root, ["init", "-q"]);
  await fixtureGit(root, ["config", "core.autocrlf", "false"]);
  await fixtureGit(root, ["add", "."]);
  await fixtureGit(root, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "pinned public fixture",
  ]);
  const revision = await fixtureGit(root, ["rev-parse", "HEAD"]);
  return { directory, root, revision };
}
test("pinned Git ignores dirty and advanced HEAD, covers all tracked domains and retains partial parser coverage", async () => {
  const fixture = await pinnedFixture();
  using _directory = fixture.directory;
  await Bun.write(join(fixture.root, "src/runtime/source.ts"), "export const privateWorkingValue = 999");
  await Bun.write(join(fixture.root, "untracked/private-cookie.json"), "fixture-do-not-read");
  await fixtureGit(fixture.root, ["add", "."]);
  await fixtureGit(fixture.root, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "advanced HEAD",
  ]);
  const { createGitIndexInput } = await import("./dataset/source.ts");
  await using git = await createGitIndexInput({
    repository: "aphrody-labs/bun",
    root: fixture.root,
    revision: fixture.revision,
  });
  using registry = new BunPython(":memory:");
  const result = await indexCodebase(registry, fixture.root, {
    profile: "bun",
    input: git.input,
    revision: fixture.revision,
    concurrency: 1,
    artifactDirectory: join(fixture.root, "snapshots"),
    maxFiles: 20,
  });
  expect(result.revision).toBe(fixture.revision);
  expect(result.dirty).toBeNull();
  expect(result.input).toMatchObject({ kind: "git", files: 4, selectedFiles: 4, fileCoverageComplete: true });
  expect(result.domains.map(d => d.domain)).toEqual([".claude/skills", "docs", "src/runtime", "vendor/source"]);
  expect(result.domains.reduce((n, d) => n + d.coverage.files, 0)).toBe(4);
  expect(result.domains.reduce((n, d) => n + d.coverage.unresolvedFiles, 0)).toBeGreaterThanOrEqual(1);
  const rows = registry.db.query<{ metadata: string }, []>("SELECT metadata FROM nodes WHERE kind='file'").all();
  expect(rows.length).toBe(4);
  const files = rows.map(r => JSON.parse(r.metadata));
  const source = files.find(f => f.gitPath === "src/runtime/source.ts");
  expect(source.sha256).toBe(new Bun.CryptoHasher("sha256").update("export function owned(){return 42}").digest("hex"));
  expect(source.gitBlob).toMatch(/^[a-f0-9]{40}$/);
  expect(files.some(f => f.gitPath.includes("private-cookie"))).toBe(false);
  const native = files.find(f => f.gitPath === "vendor/source/native.c");
  expect(native.provenance).toBe("UNRESOLVED");
  expect(native.unresolvedReason).toBe("unsupported-native-format");
  expect(files.find(f => f.gitPath === ".claude/skills/public/SKILL.md").hashKind).toBe("content-sha256");
});
test("Git callback bytes must match the pinned Git object before publishing a snapshot", async () => {
  const fixture = await pinnedFixture();
  using _directory = fixture.directory;
  const { createGitIndexInput } = await import("./dataset/source.ts");
  await using git = await createGitIndexInput({
    repository: "oven-sh/bun",
    root: fixture.root,
    revision: fixture.revision,
  });
  git.input.readFile = async () => new TextEncoder().encode("forged");
  using registry = new BunPython(":memory:");
  await expect(
    indexCodebase(registry, fixture.root, {
      profile: "bun",
      input: git.input,
      concurrency: 1,
      artifactDirectory: join(fixture.root, "snapshots"),
    }),
  ).rejects.toThrow("identity changed");
  expect(registry.db.query<{ count: number }, []>("SELECT count(*) AS count FROM graph_snapshots").get()!.count).toBe(
    0,
  );
});
test("Git duplicate paths and foreign revisions fail closed; explicit filters disclose incomplete file coverage", async () => {
  const fixture = await pinnedFixture();
  using _directory = fixture.directory;
  const { createGitIndexInput } = await import("./dataset/source.ts");
  await using git = await createGitIndexInput({
    repository: "oven-sh/bun",
    root: fixture.root,
    revision: fixture.revision,
  });
  using registry = new BunPython(":memory:");
  await expect(
    indexCodebase(registry, fixture.root, {
      profile: "bun",
      input: git.input,
      revision: "f".repeat(40),
      artifactDirectory: join(fixture.root, "snapshots"),
    }),
  ).rejects.toThrow("revision differs");
  const filtered = await indexCodebase(registry, fixture.root, {
    profile: "bun",
    input: git.input,
    surfaces: ["src"],
    concurrency: 1,
    artifactDirectory: join(fixture.root, "snapshots"),
  });
  expect(filtered.input).toMatchObject({ files: 4, selectedFiles: 1, fileCoverageComplete: false });
  expect(filtered.domains[0]!.coverage.files).toBe(1);
  const descriptor = {
    path: "src/a.ts",
    mode: "100644" as const,
    bytes: 0,
    gitBlob: new Bun.CryptoHasher("sha1").update("blob 0\0").digest("hex"),
  };
  const input = {
    kind: "git" as const,
    repository: "oven-sh/bun" as const,
    revision: fixture.revision,
    files: (async function* () {
      yield descriptor;
      yield descriptor;
    })(),
    readFile: async () => new Uint8Array(0),
  };
  await expect(
    indexCodebase(registry, fixture.root, {
      profile: "bun",
      input,
      artifactDirectory: join(fixture.root, "snapshots"),
    }),
  ).rejects.toThrow("repeats a path");
});
