import { expect, test } from "bun:test";
import { tempDir } from "harness";
import { join } from "node:path";
import { capabilities, comparison, formatGraph, markdown, pool, sourceEvidence, type Capability, type ComponentInfo } from "../../scripts/aphrody/formats.ts";

test("format catalogue separates interpreters, byte codecs and filename recognition", () => {
  expect(capabilities.find(item => item.component === "uv" && item.format === "python-source")).toMatchObject({ boundary: "delegated", operations: ["execute"] });
  expect(capabilities.find(item => item.component === "uv" && item.format === "tar-xz")).toMatchObject({ boundary: "recognition-only", operations: ["recognize"] });
  expect(capabilities.find(item => item.component === "cpython" && item.format === "toml")?.operations).toEqual(["read", "parse"]);
  expect(capabilities.find(item => item.component === "bun" && item.format === "zstd")?.operations).toEqual(["compress", "decompress"]);
  expect(capabilities.find(item => item.component === "bun" && item.format === "asset-bytes")?.operations).toEqual(["read", "write", "copy"]);
  expect(capabilities.some(item => item.component === "jsc" && item.format === "typescript")).toBe(false);
});

test.concurrent("format evidence includes source hashes and rejects missing anchors", async () => {
  using directory = tempDir("format-evidence", { "src/codec.rs": "// source\npub fn decode() {}\n" });
  const roots = { bun: String(directory), uv: String(directory), cpython: String(directory), jsc: String(directory) };
  const spec: Capability = { component: "bun", format: "fixture", extensions: [], boundary: "core", operations: ["parse"], api: "decode", limits: "fixture", references: [{ path: "src/codec.rs", marker: "pub fn decode" }] };
  const evidence = await sourceEvidence([spec], roots, 2);
  expect(evidence).toHaveLength(1);
  expect(evidence[0]).toMatchObject({ component: "bun", line: 2, excerpt: "pub fn decode() {}", absolute: join(String(directory), "src/codec.rs") });
  expect(evidence[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
  await expect(sourceEvidence([{ ...spec, references: [{ path: "src/codec.rs", marker: "absent" }] }], roots)).rejects.toThrow('does not contain "absent"');
  await expect(sourceEvidence([{ ...spec, references: [{ path: "../outside.rs", marker: "decode" }] }], roots)).rejects.toThrow("escapes source root");
});

test("format graphs require verified evidence for every capability", () => {
  const info: ComponentInfo = { root: "/source", version: "1", revision: "revision", sourceOnly: true };
  const components = { bun: info, uv: info, cpython: info, jsc: info };
  const spec: Capability = { component: "uv", format: "python-source", extensions: ["py"], boundary: "delegated", operations: ["execute"], api: "uv run", limits: "Python executes", references: [{ path: "run.rs", marker: "run" }] };
  expect(() => formatGraph(components, [spec], [])).toThrow("Missing verified evidence");
  expect(() => formatGraph(components, [{ ...spec, references: [] }], [])).toThrow("no source references");
  const evidence = [{ ...spec.references[0]!, component: "uv" as const, absolute: "/source/run.rs", sha256: "hash", line: 4, excerpt: "run" }];
  const graph = formatGraph(components, [spec], evidence);
  expect(graph.links.find(edge => edge.relation === "delegates-to")).toMatchObject({ source: "capability:uv:python-source", target: "component:cpython" });
  expect(graph.nodes.find(node => node.kind === "source-evidence")).toMatchObject({ source_location: "L4", sha256: "hash" });
  expect(() => formatGraph(components, [spec, spec], evidence)).toThrow("Duplicate format capability");
});

test.concurrent("asynchronous source workers stay bounded and retain input order", async () => {
  let active = 0;
  let maximum = 0;
  const results = await pool(Array.from({ length: 12 }, (_, index) => index), 3, async index => {
    maximum = Math.max(maximum, ++active);
    await Promise.resolve();
    active--;
    return index * 2;
  });
  expect(maximum).toBe(3);
  expect(results).toEqual(Array.from({ length: 12 }, (_, index) => index * 2));
  await expect(pool([1], 0, async item => item)).rejects.toThrow("between 1 and 32");
});

test("format comparisons preserve capability boundaries and mark uncovered cells", () => {
  const rows = comparison(capabilities);
  expect(rows.find(row => row.format === "toml")).toMatchObject({ cpython: { boundary: "stdlib", operations: ["read", "parse"] } });
  expect(rows.find(row => row.format === "typescript")).toMatchObject({ cpython: null, jsc: null });
  const table = markdown(capabilities);
  expect(table).toContain("| Format | Bun | UV | CPython | JSC |");
  expect(table).toContain("recognition-only: recognize");
  expect(table).toContain("no capability indexed");
});
