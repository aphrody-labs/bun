import { expect, test } from "bun:test";
import { bunEnv, tempDir } from "harness";
import { join, resolve } from "node:path";
import { jsonLines, memoryReferences, mergeGraphs, nativeCallGraph, nativeCommand, nativeLanguageConfig, pythonCommand, readGraphFile, writeGraph, type CallMatch, type EngineGraph } from "../../scripts/aphrody/engine-graph.ts";

function call(file: string, callee: string, offset: number, line: number): CallMatch {
  const range = { byteOffset: { start: offset, end: offset + callee.length + 2 }, start: { line, column: 0 }, end: { line, column: callee.length + 2 } };
  return { file, range, metaVariables: { single: { CALLEE: { text: callee, range } } } };
}

test("native call graphs retain all call sites and distinguish unresolved targets", () => {
  const root = resolve("source-root");
  const graph = nativeCallGraph(root, "c", [call(join(root, "arena.c"), "_PyArena_New", 0, 0), call(join(root, "arena.c"), "_PyArena_New", 100, 3)]);
  expect(graph.nodes.filter(node => node.kind === "native-call").map(node => ({ label: node.label, line: node.source_location }))).toEqual([
    { label: "_PyArena_New", line: "L1" }, { label: "_PyArena_New", line: "L4" },
  ]);
  expect(graph.nodes.filter(node => node.kind === "native-callable")).toEqual([
    { id: "c:reference:_PyArena_New", label: "_PyArena_New", kind: "native-callable", language: "c", provenance: "UNRESOLVED" },
  ]);
  expect(graph.links.filter(edge => edge.relation === "references-callee").map(edge => edge.resolution)).toEqual(["UNRESOLVED", "UNRESOLVED"]);
  expect(graph.graph.calls).toBe(2);
  expect(() => nativeCallGraph(root, "c", [call(resolve(root, "../escape.c"), "malloc", 0, 0)])).toThrow("outside the selected source root");
});

test("graph merge preserves file evidence and rejects mixed source revisions", () => {
  const base: EngineGraph = { producer: "outline", built_at_commit: "first", directed: true, multigraph: true, graph: { declarations: 1 },
    nodes: [{ id: "file:arena.c", label: "arena.c", source_file: "arena.c", sha256: "verified" }], links: [] };
  const extra = nativeCallGraph(resolve("source-root"), "c", [call("arena.c", "_PyArena_New", 0, 0)]);
  extra.built_at_commit = "first";
  const merged = mergeGraphs(base, extra);
  expect(merged.nodes.find(node => node.id === "file:arena.c")?.sha256).toBe("verified");
  expect(merged.nodes.map(node => node.id)).toHaveLength(3);
  expect(merged.links).toHaveLength(2);
  extra.built_at_commit = "second";
  expect(() => mergeGraphs(base, extra)).toThrow("Cannot merge source graphs from first and second");
});

test("native UV adapters require an explicit runner and preserve argv boundaries", () => {
  const args = pythonCommand("bun-uv", "C:/bun build/bun.exe", "C:/python dir/python.exe", "C:/source root", "C:/graph files.json");
  expect(args.slice(0, 12)).toEqual(["C:/bun build/bun.exe", "uv", "--no-config", "run", "--offline", "--no-project", "--no-python-downloads", "--python", "C:/python dir/python.exe", "--", "python", "-I"]);
  expect(args.slice(-2)).toEqual(["C:/source root", "C:/graph files.json"]);
  expect(pythonCommand("uv", "uv.exe", "python.exe", "source", "files.json").slice(0, 3)).toEqual(["uv.exe", "--no-config", "run"]);
});

test("memory reference views retain syntax provenance instead of asserting ownership", () => {
  const graph = nativeCallGraph(resolve("source-root"), "cpp", [call("heap.cpp", "IsoSubspace::allocate", 0, 0), call("heap.cpp", "Py_DECREF", 100, 1)]);
  const references = memoryReferences(graph);
  expect(references.tracing!.map(node => node.provenance)).toEqual(["EXTRACTED", "UNRESOLVED"]);
  expect(references.referenceCounting!.map(node => node.label)).toEqual(["Py_DECREF", "Py_DECREF"]);
  expect(references.arena).toEqual([]);
});

const python = process.env.BUN_PYTHON_GRAPH_PYTHON;
const uv = process.env.BUN_PYTHON_GRAPH_UV;
test.concurrent("native graph output streams UTF-8 JSON across file chunks", async () => {
  const records = [{ file: "arène.py", label: "x".repeat(130_000) + "🐍" }, { file: "heap.cpp", label: "a\nb" }];
  using directory = tempDir("jsc-json-stream", { "stdout.jsonl": records.map(record => JSON.stringify(record)).join("\n") });
  const parsed = [];
  for await (const record of jsonLines(join(String(directory), "stdout.jsonl"))) parsed.push(record);
  expect(parsed).toEqual(records);
});

test.concurrent("graph writes retain exact nodes and edges across asynchronous batches", async () => {
  using directory = tempDir("jsc-graph-write", {});
  const path = join(String(directory), "graph.json");
  const graph = nativeCallGraph(String(directory), "cpp", Array.from({ length: 1200 }, (_, index) => call("heap.cpp", `allocate${index}`, index * 100, index)));
  await writeGraph(path, graph);
  expect(await readGraphFile(path)).toEqual(graph);
});

test.concurrent("streaming graph reader retains escaped syntax and rejects malformed framing", async () => {
  const graph: EngineGraph = { producer: "fixture", directed: true, multigraph: true, graph: { example: '\\"[]{}\n🐍' },
    nodes: [{ id: "source", label: 'quoted \\"name"' }, { id: "target", label: "arène" }], links: [{ source: "source", target: "target" }] };
  using directory = tempDir("jsc-stream-graph", {
    "compact.json": JSON.stringify(graph),
    "pretty.json": JSON.stringify(graph, null, 2),
    "duplicate.json": '{"nodes":[],"nodes":[],"links":[]}',
    "trailing.json": '{"nodes":[],"links":[],}',
    "invalid-row.json": '{"nodes":[42],"links":[]}',
    "incomplete.json": '{"nodes":[],"links":[',
  });
  expect(await readGraphFile(join(String(directory), "compact.json"))).toEqual(graph);
  expect(await readGraphFile(join(String(directory), "pretty.json"))).toEqual(graph);
  for (const name of ["duplicate.json", "trailing.json", "invalid-row.json", "incomplete.json"]) {
    await expect(readGraphFile(join(String(directory), name))).rejects.toThrow("Invalid graph JSON framing");
  }
});

test.concurrent.skipIf(!Bun.which("ast-grep"))("native JSC graph parses C++ inline calls in .h files", async () => {
  using directory = tempDir("jsc-native-headers", {
    "region.h": "class Region { public: void* take() { return allocate(1); } };\n",
    "sgconfig.yml": nativeLanguageConfig("cpp"),
  });
  await using child = Bun.spawn({ cmd: nativeCommand("cpp", join(String(directory), "sgconfig.yml"), 1, String(directory), "compact"), env: bunEnv, stdout: "pipe", stderr: "pipe" });
  const [stdout, , code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  const graph = nativeCallGraph(String(directory), "cpp", JSON.parse(stdout) as CallMatch[]);
  expect(graph.nodes.filter(node => node.kind === "native-call").map(node => [node.label, node.source_file])).toEqual([["allocate", "region.h"]]);
  expect(code).toBe(0);
});

test.concurrent.skipIf(!python || !uv)("CPython AST via offline UV captures nested calls and syntax failures", async () => {
  using directory = tempDir("jsc-cpython-ast", {
    "Lib/pkg/__init__.py": "",
    "Lib/pkg/module.py": 'import pkg\nfrom . import other\n\n@register(lambda: print("decorator"))\ndef f():\n    g()\n    return factory().run()\n\nclass C(Base()):\n    async def method(self):\n        await f()\n',
    "invalid.py": "def broken(:\n",
    "files.json": JSON.stringify(["Lib/pkg/__init__.py", "Lib/pkg/module.py", "invalid.py"]),
  });
  await using child = Bun.spawn({ cmd: pythonCommand("uv", uv!, python!, String(directory), join(String(directory), "files.json")), env: bunEnv, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  const graph = JSON.parse(stdout) as EngineGraph;
  expect(graph.graph.coverage).toMatchObject({ files: 3, parsed: 2, definitions: 3, calls: 7, imports: 2 });
  expect((graph.graph.coverage as { syntaxErrors: { file: string }[] }).syntaxErrors.map(error => error.file)).toEqual(["invalid.py"]);
  expect(graph.nodes.filter(node => node.kind === "python-call").map(node => node.label)).toEqual(["register", "print", "g", "factory().run", "factory", "Base", "f"]);
  expect(new Set(graph.nodes.map(node => node.id)).size).toBe(graph.nodes.length);
  expect(graph.nodes.filter(node => node.kind === "python-callable").every(node => node.provenance === "UNRESOLVED")).toBe(true);
  expect(graph.nodes.find(node => node.id === "file:Lib/pkg/module.py")?.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(stderr).toBe("");
  expect(code).toBe(0);
});

test.concurrent("graph documentation pins historical input hashes and isolates domain evidence", async () => {
  const { BunPython } = await import("../../scripts/aphrody/pyjs-store.ts");
  const { writeGraphDocs } = await import("../../scripts/aphrody/graph-docs.ts");
  using directory = tempDir("graph-documentation-history", {});
  using registry = new BunPython(":memory:");
  const domain = "src/runtime",
    source = "graph:bun:src:runtime",
    profile = "bun";
  const scope = { source, profile };
  const digest = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
  const oldHash = digest("old café source");
  const repo = registry.repository("bun/" + domain, "source", "/fixture", null, {
    domain,
    source,
    profile,
    surface: "src",
  });
  const old = {
    producer: "fixture producer",
    graph: {
      scope,
      domain,
      producerSHA256: digest("fixture executable"),
      hashKind: "runtime-executable",
      coverage: { indexedFiles: 2, parsedFiles: 1, unsupportedFiles: 1, errors: [] },
    },
    nodes: [
      {
        id: "file:src/été.rs",
        kind: "file",
        label: "src/été.rs",
        source_file: "src/été.rs",
        sha256: oldHash,
        bytes: 17,
        hashKind: "content",
        provenance: "EXTRACTED",
      },
      {
        id: "file:z.bin",
        kind: "file",
        label: "z.bin",
        source_file: "z.bin",
        sha256: null,
        bytes: 42,
        hashKind: "metadata-only",
        provenance: "UNRESOLVED",
      },
      { id: "fn:café", label: "<script>{owned}</script>", source_file: "src/été.rs", provenance: "EXTRACTED" },
    ],
    links: [{ source: "fn:café", target: "file:src/été.rs", relation: "defined-in", confidence: "EXTRACTED" }],
  };
  const oldGraphHash = digest(JSON.stringify(old));
  await registry.importGraph(repo, old, oldGraphHash);
  const snapshotId = registry.getSnapshot(repo)!.id;
  await registry.importGraph(
    repo,
    {
      ...old,
      nodes: [
        { id: "file:src/été.rs", kind: "file", label: "new", source_file: "src/été.rs", sha256: digest("new source") },
      ],
      links: [],
    },
    digest("new graph"),
  );
  registry.db
    .query("INSERT INTO files VALUES(?,?,?,?,?,?,?)")
    .run("current", repo, "src/été.rs", digest("mutable current"), "rust", 19, "{}");
  const foreign = registry.repository("bun/packages/foreign", "source", "/foreign", null, {
    domain: "packages/foreign",
    source: "graph:bun:packages:foreign",
    profile: "dbfr",
  });
  await registry.importGraph(
    foreign,
    { nodes: [{ id: "foreign", label: "FOREIGN_DOMAIN_ONLY" }], links: [] },
    digest("foreign"),
  );
  const options = {
    workspace: resolve(import.meta.dir, "../.."),
    out: String(directory),
    repositoryId: repo,
    snapshotId,
    domain,
    source,
    profile,
    maxRows: 1,
  };
  const exported = await writeGraphDocs(registry, options);
  expect(exported.manifest.snapshot.sha256).toBe(oldGraphHash);
  expect(exported.manifest.counts).toMatchObject({ files: 2, nodes: 3, edges: 1, unresolved: 1, missingHashes: 1 });
  expect(exported.manifest.truncated).toEqual({ inputs: true, nodes: true, edges: false });
  expect((await Bun.file(join(exported.out, "inputs.json")).json())[0]).toMatchObject({
    path: "src/été.rs",
    sha256: oldHash,
  });
  expect(await Bun.file(exported.markdownPath).text()).not.toContain("FOREIGN_DOMAIN_ONLY");
  expect(exported.manifest.producer.indexedHashKind).toBe("runtime-executable");
  const repeated = await writeGraphDocs(registry, options);
  expect(repeated.unchanged).toBe(true);
  expect(repeated.out).toBe(exported.out);
  await Bun.write(join(exported.out, "inputs.json"), "[]");
  await expect(writeGraphDocs(registry, options)).rejects.toThrow("artifact differs");
});

test.concurrent("graph documentation escapes MDX and rejects cross-profile exports and aborted ownership", async () => {
  const { BunPython } = await import("../../scripts/aphrody/pyjs-store.ts");
  const { writeGraphDocs } = await import("../../scripts/aphrody/graph-docs.ts");
  using directory = tempDir("graph-documentation-scope", {});
  using registry = new BunPython(":memory:");
  const domain = "packages/buv",
    source = "graph:bun:packages:buv",
    profile = "bun";
  const repo = registry.repository("bun/" + domain, "source", "/fixture", null, {
    domain,
    source,
    profile,
    surface: "package",
  });
  await registry.importGraph(
    repo,
    {
      graph: {
        scope: { source, profile },
        domain,
        coverage: { indexedFiles: 0, parsedFiles: 0, unsupportedFiles: 0, errors: [] },
      },
      nodes: [{ id: "symbol", label: "<script>{owned}</script>" }],
      links: [],
    },
    "a".repeat(64),
  );
  const options = {
    workspace: resolve(import.meta.dir, "../.."),
    out: String(directory),
    repositoryId: repo,
    snapshotId: registry.getSnapshot(repo)!.id,
    domain,
    source,
    profile,
  };
  const exported = await writeGraphDocs(registry, options);
  expect(await Bun.file(join(exported.out, "graph.mdx")).text()).toContain("\\{owned\\}");
  expect(await Bun.file(join(exported.out, "graph.html")).text()).not.toContain("<script>");
  expect(exported.manifest.missing.some(item => item.kind === "indexed-producer-sha256")).toBe(true);
  await expect(writeGraphDocs(registry, { ...options, profile: "dbfr" })).rejects.toThrow("does not match");
  await expect(writeGraphDocs(registry, { ...options, maxRows: Infinity })).rejects.toThrow("row limit");
  const controller = new AbortController(),
    reason = new Error("export cancelled by owner");
  controller.abort(reason);
  await expect(writeGraphDocs(registry, { ...options, signal: controller.signal })).rejects.toBe(reason);
});
