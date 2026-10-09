import { expect, test } from "bun:test";
import { tempDir } from "harness";
import { join } from "node:path";
import {
  capabilities,
  comparison,
  formatGraph,
  markdown,
  pool,
  sourceEvidence,
  type Capability,
  type ComponentInfo,
} from "../../scripts/aphrody/formats.ts";

test("format catalogue separates interpreters, byte codecs and filename recognition", () => {
  expect(capabilities.find(item => item.component === "uv" && item.format === "python-source")).toMatchObject({
    boundary: "delegated",
    operations: ["execute"],
  });
  expect(capabilities.find(item => item.component === "uv" && item.format === "tar-xz")).toMatchObject({
    boundary: "recognition-only",
    operations: ["recognize"],
  });
  expect(capabilities.find(item => item.component === "cpython" && item.format === "toml")?.operations).toEqual([
    "read",
    "parse",
  ]);
  expect(capabilities.find(item => item.component === "bun" && item.format === "zstd")?.operations).toEqual([
    "compress",
    "decompress",
  ]);
  expect(capabilities.find(item => item.component === "bun" && item.format === "asset-bytes")?.operations).toEqual([
    "read",
    "write",
    "copy",
  ]);
  expect(capabilities.some(item => item.component === "jsc" && item.format === "typescript")).toBe(false);
});

test.concurrent("format evidence includes source hashes and rejects missing anchors", async () => {
  using directory = tempDir("format-evidence", { "src/codec.rs": "// source\npub fn decode() {}\n" });
  const roots = { bun: String(directory), uv: String(directory), cpython: String(directory), jsc: String(directory) };
  const spec: Capability = {
    component: "bun",
    format: "fixture",
    extensions: [],
    boundary: "core",
    operations: ["parse"],
    api: "decode",
    limits: "fixture",
    references: [{ path: "src/codec.rs", marker: "pub fn decode" }],
  };
  const evidence = await sourceEvidence([spec], roots, 2);
  expect(evidence).toHaveLength(1);
  expect(evidence[0]).toMatchObject({
    component: "bun",
    line: 2,
    excerpt: "pub fn decode() {}",
    absolute: join(String(directory), "src/codec.rs"),
  });
  expect(evidence[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
  await expect(
    sourceEvidence([{ ...spec, references: [{ path: "src/codec.rs", marker: "absent" }] }], roots),
  ).rejects.toThrow('does not contain "absent"');
  await expect(
    sourceEvidence([{ ...spec, references: [{ path: "../outside.rs", marker: "decode" }] }], roots),
  ).rejects.toThrow("escapes source root");
});

test("format graphs require verified evidence for every capability", () => {
  const info: ComponentInfo = { root: "/source", version: "1", revision: "revision", sourceOnly: true };
  const components = { bun: info, uv: info, cpython: info, jsc: info };
  const spec: Capability = {
    component: "uv",
    format: "python-source",
    extensions: ["py"],
    boundary: "delegated",
    operations: ["execute"],
    api: "uv run",
    limits: "Python executes",
    references: [{ path: "run.rs", marker: "run" }],
  };
  expect(() => formatGraph(components, [spec], [])).toThrow("Missing verified evidence");
  expect(() => formatGraph(components, [{ ...spec, references: [] }], [])).toThrow("no source references");
  const evidence = [
    {
      ...spec.references[0]!,
      component: "uv" as const,
      absolute: "/source/run.rs",
      sha256: "hash",
      line: 4,
      excerpt: "run",
    },
  ];
  const graph = formatGraph(components, [spec], evidence);
  expect(graph.links.find(edge => edge.relation === "delegates-to")).toMatchObject({
    source: "capability:uv:python-source",
    target: "component:cpython",
  });
  expect(graph.nodes.find(node => node.kind === "source-evidence")).toMatchObject({
    source_location: "L4",
    sha256: "hash",
  });
  expect(() => formatGraph(components, [spec, spec], evidence)).toThrow("Duplicate format capability");
});

test.concurrent("asynchronous source workers stay bounded and retain input order", async () => {
  let active = 0;
  let maximum = 0;
  const results = await pool(
    Array.from({ length: 12 }, (_, index) => index),
    3,
    async index => {
      maximum = Math.max(maximum, ++active);
      await Promise.resolve();
      active--;
      return index * 2;
    },
  );
  expect(maximum).toBe(3);
  expect(results).toEqual(Array.from({ length: 12 }, (_, index) => index * 2));
  await expect(pool([1], 0, async item => item)).rejects.toThrow("between 1 and 32");
});

test("format comparisons preserve capability boundaries and mark uncovered cells", () => {
  const rows = comparison(capabilities);
  expect(rows.find(row => row.format === "toml")).toMatchObject({
    cpython: { boundary: "stdlib", operations: ["read", "parse"] },
  });
  expect(rows.find(row => row.format === "typescript")).toMatchObject({ cpython: null, jsc: null });
  const table = markdown(capabilities);
  expect(table).toContain("| Format | Bun | UV | CPython | JSC |");
  expect(table).toContain("recognition-only: recognize");
  expect(table).toContain("no capability indexed");
});

test("native source index preserves domain snapshots, file hashes and unresolved coverage", async () => {
  const { BunPython } = await import("bun:graph");
  const { indexCodebase } = await import("bun:graph-index");
  const rust = "pub fn café() -> i32 { 42 }\npub fn run() -> i32 { café() }\n";
  using directory = tempDir("native-source-index", {
    "src/runtime/lib.rs": rust,
    "src/runtime/ΣΟΣ.rs": "pub fn unique() -> i32 { 7 }\n",
    "src/runtime/unsupported.py": "print(42)\n",
    "src/runtime/protected.pem": "protected fixture\n",
    "src/runtime/opaque.sqlite": "not a source file\n",
    "src/build/owner.ts": "export function build() { return 42; }\n",
    "packages/fixture/build/index.ts": "export function answer() { return 42; }\n",
  });
  using registry = new BunPython(join(String(directory), "registry.sqlite"));
  const options = { profile: "bun" as const, revision: "fixture-revision", concurrency: 2 };
  const first = await indexCodebase(registry, String(directory), options);
  expect(first.domains.map(domain => domain.domain)).toEqual(["packages/fixture", "src/build", "src/runtime"]);
  const runtime = first.domains.find(domain => domain.domain === "src/runtime")!;
  expect(runtime).toMatchObject({
    repository: "source:bun/src/runtime",
    source: "graph:bun:src:runtime",
    cached: false,
    coverage: { files: 5, nativeFiles: 2, unresolvedFiles: 3, metadataOnlyFiles: 2, calls: 1 },
  });
  const snapshot = registry.getSnapshot(runtime.repository, runtime.snapshot)!;
  const metadata = JSON.parse(snapshot.metadata);
  expect(metadata.graph).toMatchObject({
    scope: { profile: "bun", source: "graph:bun:src:runtime" },
    domain: "src/runtime",
    sourceIdentity: "immutable-file-sha256",
    coverage: { resolutionScope: "domain-chunk" },
  });
  expect(metadata.graph.producerSHA256).toMatch(/^[0-9a-f]{64}$/);
  expect(
    JSON.parse(
      registry.db
        .query<{ metadata: string }, [string]>("SELECT metadata FROM repositories WHERE id=?")
        .get(runtime.repository)!.metadata,
    ),
  ).toMatchObject({
    domain: "src/runtime",
    profile: "bun",
    source: "graph:bun:src:runtime",
    surface: "src",
  });
  const rows = registry.db
    .query<{ file: string; provenance: string; metadata: string }, [string, string]>(
      "SELECT file,provenance,metadata FROM nodes WHERE repository_id=? AND id GLOB ? AND kind='file' ORDER BY file",
    )
    .all(runtime.repository, `${runtime.snapshot}:*`);
  expect(rows).toHaveLength(5);
  expect(
    registry.db
      .query<{ count: number }, [string, string]>(
        "SELECT COUNT(*) AS count FROM nodes WHERE repository_id=? AND file=? AND kind='file'",
      )
      .get(runtime.repository, "ΣΟΣ.rs")!.count,
  ).toBe(1);
  const file = rows.find(row => row.file === "lib.rs")!;
  const expected = new Bun.CryptoHasher("sha256").update(rust).digest("hex");
  expect(JSON.parse(file.metadata)).toMatchObject({
    kind: "file",
    source_file: "lib.rs",
    sha256: expected,
    bytes: new TextEncoder().encode(rust).length,
  });
  for (const path of ["protected.pem", "opaque.sqlite"])
    expect(JSON.parse(rows.find(row => row.file === path)!.metadata)).toMatchObject({
      sha256: null,
      hashKind: "metadata-only",
      provenance: "UNRESOLVED",
    });
  expect(JSON.parse(rows.find(row => row.file === "unsupported.py")!.metadata)).toMatchObject({
    provenance: "UNRESOLVED",
    unresolvedReason: "unsupported-native-format",
  });
  const again = await indexCodebase(registry, String(directory), options);
  expect(again.domains.every(domain => domain.cached)).toBe(true);
  expect(again.domains.map(domain => domain.snapshot)).toEqual(first.domains.map(domain => domain.snapshot));
  await Bun.write(join(String(directory), "src/runtime/lib.rs"), rust.replace("42", "43"));
  const changed = await indexCodebase(registry, String(directory), { ...options, domains: ["src/runtime"] });
  expect(changed.domains[0]!.cached).toBe(false);
  expect(changed.domains[0]!.snapshot).not.toBe(runtime.snapshot);
  expect(
    registry.db
      .query<{ metadata: string }, [string]>("SELECT metadata FROM nodes WHERE id=?")
      .get(`${runtime.snapshot}:file:lib.rs`)!.metadata,
  ).toBe(file.metadata);
  expect(registry.snapshots(runtime.repository)).toHaveLength(2);
});

test("native source index retains depth-limited and invalid UTF-8 files without dropping valid neighbours", async () => {
  const { BunPython } = await import("bun:graph");
  const { indexCodebase } = await import("bun:graph-index");
  using directory = tempDir("native-source-index-limits", {
    "src/fixture/valid.ts": "export function answer() { return 42; }\n",
    "src/fixture/deep.ts": `export const deep = ${"(".repeat(40)}42${")".repeat(40)};\n`,
  });
  await Bun.write(join(String(directory), "src/fixture/invalid.ts"), new Uint8Array([0xff, 0xfe]));
  using registry = new BunPython(":memory:");
  const result = await indexCodebase(registry, String(directory), {
    profile: "bun",
    revision: "fixture",
    concurrency: 1,
    maxAstDepth: 16,
  });
  expect(result.domains[0]!.coverage).toMatchObject({ files: 3, nativeFiles: 1, unresolvedFiles: 2, parseErrors: 2 });
  const rows = registry.db
    .query<{ file: string; metadata: string }, []>("SELECT file,metadata FROM nodes WHERE kind='file' ORDER BY file")
    .all();
  expect(JSON.parse(rows.find(row => row.file === "deep.ts")!.metadata)).toMatchObject({
    provenance: "UNRESOLVED",
    unresolvedReason: "native-depth-limit",
  });
  expect(JSON.parse(rows.find(row => row.file === "invalid.ts")!.metadata)).toMatchObject({
    provenance: "UNRESOLVED",
    unresolvedReason: "invalid-utf8-metadata-only",
    sha256: null,
  });
});

test("native source index rejects ambiguous scope, excessive workers and pre-aborted work", async () => {
  const { BunPython } = await import("bun:graph");
  const { indexCodebase } = await import("bun:graph-index");
  using directory = tempDir("native-source-index-errors", { "src/fixture/index.ts": "export const value = 42;\n" });
  using registry = new BunPython(":memory:");
  const root = String(directory);
  await expect(indexCodebase(registry, "relative", { profile: "bun", revision: "fixture" })).rejects.toThrow(
    "absolute",
  );
  await expect(indexCodebase(registry, root, { profile: "bun", revision: "fixture", concurrency: 5 })).rejects.toThrow(
    "concurrency",
  );
  await expect(
    indexCodebase(registry, root, { profile: "bun", revision: "fixture", domains: ["src/missing"] }),
  ).rejects.toThrow("Unknown or empty");
  await expect(
    indexCodebase(registry, root, { profile: "bun", revision: "fixture", artifactDirectory: join(root, "src/graphs") }),
  ).rejects.toThrow("inside indexed");
  const reason = new Error("index cancelled by fixture");
  await expect(
    indexCodebase(registry, root, { profile: "bun", revision: "fixture", signal: AbortSignal.abort(reason) }),
  ).rejects.toBe(reason);
  expect(registry.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM graph_snapshots").get()!.count).toBe(
    0,
  );
});
