#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { mkdir, rename, rm, watch } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { scheduler } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const inputs = [
  "package.json",
  "packages/buv/buv.json",
  "packages/buv/vendor.json",
  "packages/bun-types/python.d.ts",
  "packages/bun-types/graph.d.ts",
  "packages/bun-types/graph-native.d.ts",
  "packages/bun-types/graph-index.d.ts",
  "packages/bun-types/graphx.d.ts",
  "src/js/bun/python.ts",
  "src/js/bun/py.ts",
  "src/js/bun/graph.ts",
  "src/js/bun/graph-native.ts",
  "src/js/bun/graph-index.ts",
  "src/js/bun/graphx.ts",
  "src/runtime/cli/uv_command.rs",
  "src/runtime/cli/python_compile.rs",
  "packages/buv/crates/buv-runtime/py/compile.py",
  "packages/bun-python-native/wasm/build.ts",
  "packages/buv/PLAN.md",
  "scripts/aphrody/graph-docs.ts",
  "scripts/aphrody/graph-index.ts",
  "docs/runtime/graph.mdx",
  ".claude/skills/bun-graph/SKILL.md",
  "vendor/uv/Cargo.toml",
];
type Source = { path: string; sha256: string; bytes: number; declarations?: string[] };
export interface DocsOptions {
  workspace: string;
  database?: string;
  out?: string;
  repository?: string;
  snapshot?: string;
  domain?: string;
  source?: string;
  profile?: string;
  limit?: number;
  signal?: AbortSignal;
}

export function declarations(source: string): string[] {
  return source
    .split(/\r?\n/)
    .filter(line =>
      /^\s*(?:export (?:class|function|const|interface)|static (?:open|async)\(|(?:run|exec|eval|evalJSON|call|close|version)(?:<[^>]*>)?\()/u.test(
        line,
      ),
    )
    .slice(0, 128);
}

function escape(value: unknown): string {
  return Bun.escapeHTML(String(value)).replaceAll("|", "\\|").replaceAll("`", "\\`").replaceAll(/\r?\n/g, " ");
}

async function atomic(path: string, content: string): Promise<boolean> {
  const file = Bun.file(path);
  if ((await file.exists()) && (await file.text()) === content) return false;
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await Bun.write(temporary, content);
    await rename(temporary, path);
    return true;
  } finally {
    await rm(temporary, { force: true });
  }
}

async function modules(workspace: string) {
  let graph: any;
  let tools: any;
  let backend = "native-builtin";
  try {
    graph = require("buv:graph");
    tools = require("buv:graphx");
  } catch {
    backend = "workspace-source";
    graph = await import(pathToFileURL(join(workspace, "scripts/aphrody/pyjs-store.ts")).href);
    tools = await import(pathToFileURL(join(workspace, "scripts/aphrody/graphx.ts")).href);
  }
  return { graph, tools, backend };
}

export async function updateDocs(options: DocsOptions) {
  const workspace = resolve(options.workspace);
  const signal = options.signal;
  signal?.throwIfAborted();
  const packageFile = Bun.file(join(workspace, "package.json"));
  if (!(await packageFile.exists()))
    throw new Error("provide the selected Buv workspace with --workspace or BUV_WORKSPACE");
  const packageIdentity = await packageFile.json();
  if (packageIdentity.name !== "bun" && packageIdentity.name !== "buv")
    throw new Error("workspace is not the selected Bun/Buv repository");
  const out = resolve(options.out ?? join(import.meta.dir, "../generated"));
  if (out === workspace || out === resolve(options.database ?? join(workspace, "bun_python.sqlite")))
    throw new Error("documentation output cannot replace the workspace or database");
  const { graph, tools, backend } = await modules(workspace);
  const registry = new graph.BunPython(resolve(options.database ?? join(workspace, "bun_python.sqlite")));
  try {
    const sources: Source[] = [];
    const missingSources: string[] = [];
    for (const path of inputs) {
      signal?.throwIfAborted();
      const file = Bun.file(join(workspace, path));
      if (!(await file.exists())) {
        missingSources.push(path);
        continue;
      }
      if (file.size > 2 * 1024 * 1024) throw new RangeError(`source exceeds documentation budget: ${path}`);
      const bytes = await file.arrayBuffer();
      sources.push({
        path,
        sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
        bytes: bytes.byteLength,
        ...(path.endsWith(".d.ts")
          ? { declarations: declarations(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }
          : {}),
      });
      await scheduler.yield();
    }
    const sourceTypes = sources.find(source => source.path === "packages/bun-types/python.d.ts");
    const scoped = [options.repository, options.snapshot, options.domain, options.source, options.profile];
    if (scoped.some(value => value !== undefined) && scoped.some(value => value === undefined))
      throw new Error("graph evidence requires repository, snapshot, domain, source and profile together");
    let graphEvidence: any = null;
    let evidence = "Graph evidence requires an explicit repository, snapshot, domain, source and profile.";
    if (scoped.every(value => value !== undefined)) {
      const { writeGraphDocs } = await import(pathToFileURL(join(workspace, "scripts/aphrody/graph-docs.ts")).href);
      const exported = await writeGraphDocs(registry, {
        workspace,
        out: join(out, "graph"),
        repositoryId: options.repository!,
        snapshotId: options.snapshot!,
        domain: options.domain!,
        source: options.source!,
        profile: options.profile!,
        maxRows: options.limit ?? 64,
        signal,
      });
      const document = Bun.file(exported.markdownPath);
      if (document.size > 8 * 1024 * 1024) throw new RangeError("graph evidence exceeds the PyJS documentation budget");
      evidence = await document.text();
      graphEvidence = {
        scope: exported.manifest.scope,
        snapshot: exported.manifest.snapshot,
        producer: exported.manifest.producer,
        coverage: exported.manifest.coverage,
        missing: exported.manifest.missing,
        manifest: exported.manifestPath,
      };
    }
    const metadata = {
      schema: "buv-pyjs-docs/1",
      runtime: { bun: Bun.version, revision: Bun.revision, webkit: process.versions.webkit ?? null },
      workspaceVersion: packageIdentity.version ?? null,
      graphBackend: backend,
      graphEvidence,
      sources,
      missingSources,
      coverage: {
        graphProducerCoverage: "retained per snapshot; unresolved references remain explicit",
        pythonBackend: "native ty/ruff configured separately; no installation implied",
      },
      references: [
        "https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/",
        "https://github.com/microsoft/typescript-go",
        "https://docs.astral.sh/ty/editors/",
        "https://developers.openai.com/plugins/build/plugins",
      ],
    };
    const document = [
      "# PyJS native API and evidence",
      "",
      `Workspace version: ${escape(metadata.workspaceVersion)}. Executing Bun: ${escape(Bun.version)} (${escape(Bun.revision)}). Graph backend: ${escape(backend)}.`,
      "",
      "## Python in PyJS",
      "",
      "`.pyjs`, `.pyts`, and `.pytsx` use the native JavaScript, TypeScript and TSX loaders. Python execution is explicit through the shared host API.",
      "",
      "```ts",
      'import { Python } from "bun:python";',
      "",
      "await using py = await Python.async();",
      "await py.exec`",
      "values = [20, 22]",
      "`;",
      'console.log(await py.evalJSON<number>("sum(values)"));',
      "```",
      "",
      "The synchronous `Python.open()` host supports ``py.run(String.raw`...`)``; `Python.async()` queues calls on a worker in the same process. Tagged exec accepts a single literal without interpolation. The examples describe the declared API; executable and extension compatibility remain native integration gates.",
      "",
      "## Current declaration excerpts",
      "",
      "```text",
      ...(sourceTypes?.declarations ?? ["// Python declarations are absent from the selected workspace."]),
      "```",
      "",
      "## Source hashes",
      "",
      "| Source | Bytes | SHA-256 |",
      "| --- | ---: | --- |",
      ...sources.map(source => `| ${escape(source.path)} | ${source.bytes} | ${source.sha256} |`),
      ...(missingSources.length
        ? ["", `Declared inputs absent from this checkout: ${missingSources.map(path => escape(path)).join(", ")}.`]
        : []),
      "",
      evidence,
    ].join("\n");
    const encoded = tools.encodeJSON(metadata, 256 * 1024) + "\n";
    signal?.throwIfAborted();
    const changed = await atomic(join(out, "pyjs.md"), document);
    const metadataChanged = await atomic(join(out, "pyjs.json"), encoded);
    const htmlChanged = await atomic(join(out, "pyjs.html"), tools.html(document, "PyJS native API and evidence"));
    if (changed || metadataChanged || htmlChanged) {
      await Promise.all([
        registry.artifact(join(out, "pyjs.md"), "pyjs-docs", null, {
          sourceHashes: sources.map(source => ({ path: source.path, sha256: source.sha256 })),
        }),
        registry.artifact(join(out, "pyjs.json"), "pyjs-docs-metadata"),
      ]);
    }
    return {
      changed: changed || metadataChanged || htmlChanged,
      out,
      sources: sources.length,
      missingSources,
      backend,
    };
  } finally {
    registry[Symbol.dispose]();
  }
}

export async function watchDocs(options: DocsOptions): Promise<void> {
  const signal = options.signal;
  const directories = new Map<string, Set<string>>();
  for (const path of [
    ...inputs,
    relative(options.workspace, options.database ?? join(options.workspace, "bun_python.sqlite")),
    relative(options.workspace, options.database ?? join(options.workspace, "bun_python.sqlite")) + "-wal",
  ]) {
    const full = resolve(options.workspace, path);
    const parent = dirname(full);
    const names = directories.get(parent) ?? new Set<string>();
    names.add(full.slice(parent.length + 1));
    directories.set(parent, names);
  }
  await updateDocs(options);
  let dirty = false;
  let active: Promise<void> | undefined;
  const refresh = async () => {
    dirty = true;
    if (active) return active;
    active = (async () => {
      while (dirty && !signal?.aborted) {
        dirty = false;
        await updateDocs(options);
      }
    })().finally(() => {
      active = undefined;
    });
    return active;
  };
  await Promise.all(
    [...directories].map(async ([parent, names]) => {
      if (!(await Bun.file(join(parent, [...names][0]!)).exists())) {
        // Optional native source inputs may not exist in this checkout.
        const { stat } = await import("node:fs/promises");
        if (
          !(await stat(parent).then(
            value => value.isDirectory(),
            () => false,
          ))
        )
          return;
      }
      try {
        for await (const event of watch(parent, { signal }))
          if (event.filename && names.has(String(event.filename))) await refresh();
      } catch (error) {
        if (!signal?.aborted) throw error;
      }
    }),
  );
  await active;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const at = args.indexOf(flag);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const local = Bun.file(resolve(import.meta.dir, "../workspace.json"));
  const installed = (await local.exists()) ? await local.json() : {};
  const workspace =
    value("--workspace") ?? process.env["BUV_WORKSPACE"] ?? installed.workspace ?? resolve(import.meta.dir, "../../..");
  const control = new AbortController();
  process.once("SIGINT", () => control.abort());
  process.once("SIGTERM", () => control.abort());
  const options = {
    workspace: resolve(workspace),
    out: value("--out"),
    database: value("--db"),
    repository: value("--repository"),
    snapshot: value("--snapshot"),
    domain: value("--domain"),
    source: value("--source"),
    profile: value("--profile"),
    signal: control.signal,
  };
  if (args.includes("--watch")) await watchDocs(options);
  else console.log(JSON.stringify(await updateDocs(options)));
}
