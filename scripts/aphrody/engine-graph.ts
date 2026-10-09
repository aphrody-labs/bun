import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { scheduler } from "node:timers/promises";
import { parseArgs } from "node:util";
import { git } from "./pyjs-index.ts";
import { BunPython, registryPath } from "./pyjs-store.ts";
import { pythonGraphProgram } from "./engine-py.ts";

export type GraphNode = Record<string, unknown> & { id: string };
export type GraphEdge = Record<string, unknown> & { source: string; target: string };
export type SourceGraph = Record<string, unknown> & { nodes: GraphNode[]; links: GraphEdge[] };
export type EngineGraph = SourceGraph & {
  producer: string;
  built_at_commit?: string;
  directed: boolean;
  multigraph: boolean;
  graph: Record<string, unknown>;
  nodes: GraphNode[];
  links: GraphEdge[];
};

type MatchRange = {
  byteOffset: { start: number; end: number };
  start: { line: number; column: number };
  end: { line: number; column: number };
};
export type CallMatch = {
  file: string;
  range: MatchRange;
  metaVariables: { single: { CALLEE: { text: string; range: MatchRange } } };
};

export function nativeLanguageConfig(language: "c" | "cpp") {
  const globs = language === "cpp" ? ["*.h", "*.c", "*.inc"] : ["*.h", "*.inc"];
  return `ruleDirs: []\nlanguageGlobs:\n  ${language}: ${JSON.stringify(globs)}\n`;
}

export function nativeCommand(language: "c" | "cpp", config: string, threads: number, root: string, format: "compact" | "stream" = "stream") {
  return ["ast-grep", "run", "--config", config, "--lang", language, "--pattern", "$CALLEE($$$ARGS);", "--selector", "call_expression", `--json=${format}`, "--threads", String(threads),
    "--no-ignore", "hidden", "--no-ignore", "vcs", "--inspect", "summary", root];
}

export function pythonCommand(runner: "bun-uv" | "uv", executable: string, python: string, root: string, manifest: string) {
  return [executable, ...(runner === "bun-uv" ? ["uv"] : []), "--no-config", "run", "--offline", "--no-project", "--no-python-downloads", "--python", python,
    "--", "python", "-I", "-c", pythonGraphProgram, root, manifest];
}

export function mergeGraphs(base: EngineGraph, extra: EngineGraph): EngineGraph {
  if (base.built_at_commit && extra.built_at_commit && base.built_at_commit !== extra.built_at_commit) {
    throw new Error(`Cannot merge source graphs from ${base.built_at_commit} and ${extra.built_at_commit}`);
  }
  const nodes = new Map(base.nodes.map(node => [node.id, node]));
  for (const node of extra.nodes) nodes.set(node.id, { ...nodes.get(node.id), ...node });
  return {
    producer: `${base.producer}; ${extra.producer}`,
    built_at_commit: extra.built_at_commit ?? base.built_at_commit,
    directed: true,
    multigraph: true,
    graph: { sources: [base.graph, extra.graph] },
    nodes: [...nodes.values()],
    links: [...base.links, ...extra.links],
  };
}

export function memoryReferences(graph: EngineGraph) {
  const patterns = {
    arena: /(?:\bArena\b|PyArena|_arena\b|ArenaAllocator|BumpArena)/,
    allocator: /(?:\b(?:malloc|calloc|realloc|free)\b|PyMem_|PyObject_(?:Malloc|Calloc|Realloc|Free)|Allocator|allocateCell)/,
    tracing: /(?:MarkedSpace|MarkedBlock|IsoSubspace|SlotVisitor|WriteBarrier|visitChildren|\bgc\b)/,
    referenceCounting: /(?:Py_(?:X?INCREF|X?DECREF)|\b(?:incref|decref|deref)\b)/,
  };
  return Object.fromEntries(Object.entries(patterns).map(([kind, pattern]) => [kind, graph.nodes.filter(node => pattern.test(String(node.label ?? ""))).map(node => ({
    id: node.id, label: node.label, source_file: node.source_file, source_location: node.source_location, kind: node.kind, provenance: node.provenance,
  }))]));
}

function coverageSummary(metadata: Record<string, unknown>): Record<string, unknown> {
  const result = { ...metadata };
  if (Array.isArray(metadata.sources)) result.sources = metadata.sources.map(source => coverageSummary(source as Record<string, unknown>));
  if (metadata.memoryReferences && typeof metadata.memoryReferences === "object") {
    result.memoryReferences = Object.fromEntries(Object.entries(metadata.memoryReferences).map(([kind, nodes]) => [kind, Array.isArray(nodes) ? nodes.length : nodes]));
  }
  return result;
}

export class NativeCalls {
  readonly nodes = new Map<string, GraphNode>();
  readonly links: GraphEdge[] = [];
  calls = 0;

  constructor(readonly root: string, readonly language: string) {}

  add(match: CallMatch) {
    const { root, language, nodes, links } = this;
    const file = relative(root, resolve(root, match.file)).replaceAll("\\", "/");
    if (isAbsolute(file) || file === ".." || file.startsWith("../")) throw new Error(`AST result is outside the selected source root: ${match.file}`);
    const fileId = `file:${file}`;
    const callee = match.metaVariables.single.CALLEE.text;
    const call = `${file}:native-call:${match.range.byteOffset.start}:${match.range.byteOffset.end}`;
    const reference = `${language}:reference:${callee}`;
    nodes.set(fileId, { id: fileId, label: file, kind: "source-file", source_file: file, language, provenance: "EXTRACTED" });
    nodes.set(call, { id: call, label: callee, kind: "native-call", source_file: file, source_location: `L${match.range.start.line + 1}`,
      range: match.range, language, provenance: "EXTRACTED" });
    nodes.set(reference, { id: reference, label: callee, kind: "native-callable", language, provenance: "UNRESOLVED" });
    links.push({ source: fileId, target: call, relation: "contains", confidence: "EXTRACTED", confidence_score: 1 });
    links.push({ source: call, target: reference, relation: "references-callee", confidence: "EXTRACTED", confidence_score: 1, resolution: "UNRESOLVED",
      source_file: file, source_location: `L${match.range.start.line + 1}` });
    this.calls++;
  }

  graph(): EngineGraph {
    return { producer: "ast-grep native call expressions", directed: true, multigraph: true,
      graph: { language: this.language, filesWithCalls: [...this.nodes.values()].filter(node => node.kind === "source-file").length, calls: this.calls,
        extraction: "syntactic call expressions; overloads, preprocessor expansion and dynamic dispatch are not resolved" }, nodes: [...this.nodes.values()], links: this.links };
  }
}

export function nativeCallGraph(root: string, language: string, matches: Iterable<CallMatch>) {
  const collector = new NativeCalls(root, language);
  for (const match of matches) collector.add(match);
  return collector.graph();
}

async function* textChunks(path: string) {
  const reader = Bun.file(path).stream().getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        const tail = decoder.decode();
        if (tail) yield tail;
        break;
      }
      yield decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export async function* jsonLines(path: string): AsyncGenerator<unknown> {
  let pending = "";
  for await (const chunk of textChunks(path)) {
      pending += chunk;
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        if (line.trim()) yield JSON.parse(line);
      }
  }
  if (pending.trim()) yield JSON.parse(pending);
}

export async function readGraphFile(path: string): Promise<SourceGraph> {
  const graph: Record<string, unknown> = Object.create(null);
  const keys = new Set<string>();
  type State = "root" | "key" | "key-string" | "colon" | "value-start" | "value" | "array-start" | "array-after" | "after" | "done";
  let state: State = "root";
  let key = "";
  let token = "";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let container = false;
  let array: unknown[] | null = null;
  let mayEnd = true;
  const fail = () => { throw new SyntaxError(`Invalid graph JSON framing in ${path}`); };
  const finish = () => {
    const value: unknown = JSON.parse(token);
    if (array) {
      if (!value || typeof value !== "object" || Array.isArray(value)) fail();
      const row = value as Record<string, unknown>;
      if (key === "nodes" ? typeof row.id !== "string" : typeof row.source !== "string" || typeof row.target !== "string") fail();
      array.push(value);
      state = "array-after";
    } else {
      graph[key] = value;
      state = "after";
    }
    token = "";
  };
  const begin = (character: string) => {
    if (character === "," || character === ":" || character === "}" || character === "]") fail();
    token = character;
    quoted = character === '"';
    escaped = false;
    container = character === "{" || character === "[";
    depth = container ? 1 : 0;
    state = "value";
  };
  for await (const chunk of textChunks(path)) {
    for (let index = 0; index < chunk.length; index++) {
      const character = chunk[index]!;
      const whitespace = character === " " || character === "\n" || character === "\r" || character === "\t";
      if (state !== "value" && state !== "key-string" && whitespace) continue;
      switch (state) {
        case "root":
          if (character !== "{") fail();
          state = "key";
          break;
        case "key":
          if (character === "}" && mayEnd) { state = "done"; break; }
          if (character !== '"') fail();
          token = character;
          escaped = false;
          state = "key-string";
          break;
        case "key-string":
          token += character;
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === '"') {
            key = JSON.parse(token) as string;
            if (keys.has(key)) fail();
            keys.add(key);
            token = "";
            state = "colon";
          }
          break;
        case "colon":
          if (character !== ":") fail();
          state = "value-start";
          break;
        case "value-start":
          if (key === "nodes" || key === "links") {
            if (character !== "[") fail();
            array = [];
            graph[key] = array;
            mayEnd = true;
            state = "array-start";
          } else begin(character);
          break;
        case "array-start":
          if (character === "]" && mayEnd) { array = null; state = "after"; break; }
          if (character !== "{") fail();
          begin(character);
          break;
        case "value":
          if (!quoted && depth === 0 && (whitespace || character === "," || character === "}" || character === "]")) {
            finish();
            index--;
            break;
          }
          token += character;
          if (quoted) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === '"') quoted = false;
          } else if (character === '"') quoted = true;
          else if (character === "{" || character === "[") depth++;
          else if (character === "}" || character === "]") depth--;
          if (!quoted && depth === 0 && (container || token.startsWith('"'))) finish();
          break;
        case "array-after":
          if (character === ",") { mayEnd = false; state = "array-start"; }
          else if (character === "]") { array = null; state = "after"; }
          else fail();
          break;
        case "after":
          if (character === ",") { mayEnd = false; state = "key"; }
          else if (character === "}") state = "done";
          else fail();
          break;
        case "done":
          fail();
      }
    }
    await scheduler.yield();
  }
  if (state !== "done" || !Array.isArray(graph.nodes) || !Array.isArray(graph.links)) fail();
  return graph as SourceGraph;
}

export async function writeGraph(path: string, graph: EngineGraph) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const writer = Bun.file(temporary).writer();
  let ended = false;
  try {
    const { nodes, links, ...metadata } = graph;
    writer.write(JSON.stringify(metadata).slice(0, -1));
    for (const [name, rows] of [["nodes", nodes], ["links", links]] as const) {
      writer.write(`,${JSON.stringify(name)}:[`);
      for (let index = 0; index < rows.length; index++) {
        writer.write(`${index ? "," : ""}${JSON.stringify(rows[index])}`);
        if ((index + 1) % 1000 === 0) {
          await writer.flush();
          await scheduler.yield();
        }
      }
      writer.write("]");
    }
    writer.write("}\n");
    await writer.end();
    ended = true;
    await rename(temporary, path);
  } catch (error) {
    if (!ended) await Promise.resolve(writer.end()).catch(() => {});
    await rm(temporary, { force: true });
    throw error;
  }
}

async function recorded(registry: BunPython, kind: string, command: string[], cwd: string) {
  const run = registry.startRun(kind, command, cwd);
  const stdoutPath = resolve(import.meta.dir, "../../tmp/bun-python", `${kind}-${run}.stdout`);
  await mkdir(dirname(stdoutPath), { recursive: true });
  let completed = false;
  try {
    await using child = Bun.spawn({ cmd: command, cwd, stdout: Bun.file(stdoutPath), stderr: "pipe", stdin: "ignore" });
    const [stderr, code] = await Promise.all([child.stderr.text(), child.exited]);
    const sha256 = await registry.artifact(stdoutPath, "process-stdout", run, { kind });
    registry.finishRun(run, code, JSON.stringify({ stdoutPath, sha256, bytes: Bun.file(stdoutPath).size }), stderr);
    completed = true;
    if (code !== 0) throw new Error(`${command[0]} exited ${code}: ${stderr}`);
    return { stdoutPath, stderr, run };
  } catch (error) {
    if (!completed) registry.finishRun(run, 1, "", String(error));
    throw error;
  }
}

async function main() {
  const { values, positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, strict: true,
    options: { root: { type: "string" }, name: { type: "string" }, db: { type: "string", default: registryPath }, out: { type: "string" },
      outline: { type: "string" }, python: { type: "string" }, runner: { type: "string", default: "bun-uv" }, executable: { type: "string" },
      language: { type: "string" }, threads: { type: "string", default: "4" }, "defer-import": { type: "boolean", default: false } } });
  const mode = positionals[0];
  if (!values.root || !values.name || !["python", "native"].includes(mode ?? "")) {
    throw new Error("Usage: engine-graph.ts <python|native> --root <checkout> --name <repository> [--outline <graph>] [--python <interpreter>] [--language c|cpp]");
  }
  const root = resolve(values.root);
  const output = resolve(values.out ?? resolve(import.meta.dir, "../../tmp/bun-python", `graph-${values.name}-${mode}.json`));
  await mkdir(dirname(output), { recursive: true });
  const revision = await git(root, "rev-parse", "HEAD");
  using registry = new BunPython(values.db);
  const repository = registry.repository(values.name, "source", root, revision);
  let graph: EngineGraph;
  let run: string;
  if (mode === "python") {
    const runner = values.runner ?? "bun-uv";
    if (!values.python || !["bun-uv", "uv"].includes(runner)) throw new Error("Python extraction requires --python <qualified interpreter> and --runner bun-uv|uv");
    const paths = (await git(root, "ls-files", "-z", "--", "*.py")).split("\0").filter(Boolean);
    const manifest = `${output}.files.json`;
    await Bun.write(manifest, JSON.stringify(paths));
    const executable = values.executable ?? (runner === "bun-uv" ? process.execPath : Bun.which("uv"));
    if (!executable) throw new Error("Native UV executable is unavailable; provide --executable");
    const result = await recorded(registry, "python-ast-graph", pythonCommand(runner as "bun-uv" | "uv", executable, values.python, root, manifest), root);
    graph = await readGraphFile(result.stdoutPath) as EngineGraph;
    graph.graph.runner = runner;
    graph.graph.uvExecutable = executable;
    graph.graph.qualifiedPython = resolve(values.python);
    run = result.run;
  } else {
    if (!values.language || !["c", "cpp"].includes(values.language)) throw new Error("Native extraction requires --language c|cpp");
    const threads = Number(values.threads);
    if (!Number.isSafeInteger(threads) || threads < 1 || threads > 32) throw new Error("AST threads must be an integer between 1 and 32");
    const language = values.language as "c" | "cpp";
    const config = `${output}.ast-grep.yml`;
    await Bun.write(config, nativeLanguageConfig(language));
    const command = nativeCommand(language, config, threads, root);
    const result = await recorded(registry, "native-call-graph", command, root);
    const collector = new NativeCalls(root, values.language);
    for await (const match of jsonLines(result.stdoutPath)) collector.add(match as CallMatch);
    graph = collector.graph();
    graph.graph.parserInspection = result.stderr;
    graph.graph.languageConfig = nativeLanguageConfig(language);
    run = result.run;
  }
  graph.built_at_commit = revision;
  if (values.outline) {
    const base = await readGraphFile(resolve(values.outline)) as EngineGraph;
    if (base.built_at_commit !== revision) throw new Error(`Outline revision ${base.built_at_commit} differs from selected checkout ${revision}`);
    graph = mergeGraphs(base, graph);
  }
  const files = graph.nodes.filter(node => typeof node.source_file === "string" && String(node.id).startsWith("file:"));
  for (let offset = 0; offset < files.length; offset += 32) {
    await Promise.all(files.slice(offset, offset + 32).map(async node => {
      const path = resolve(root, node.source_file as string);
      const bytes = await Bun.file(path).bytes();
      node.sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
      node.bytes = bytes.length;
    }));
  }
  const finishedRevision = await git(root, "rev-parse", "HEAD");
  if (finishedRevision !== revision) throw new Error(`Source revision changed while extracting ${revision} to ${finishedRevision}`);
  graph.graph.memoryReferences = memoryReferences(graph);
  graph.graph.unresolvedReferences = graph.nodes.filter(node => node.provenance === "UNRESOLVED").length;
  await writeGraph(output, graph);
  const sha256 = await registry.artifact(output, "engine-source-graph", run, { root, revision, mode });
  const result = values["defer-import"] ? { nodes: graph.nodes.length, edges: graph.links.length, deferred: true } : await registry.importGraph(repository, graph, sha256);
  registry.event("engine-graph-coverage", { repository, revision, mode, sha256, output, coverage: graph.graph, ...result }, run);
  console.log(JSON.stringify({ output, revision, sha256, ...result, coverage: coverageSummary(graph.graph) }));
}

if (import.meta.main) await main();
