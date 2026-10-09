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
