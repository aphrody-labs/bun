#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import type { BunPython } from "bun:graph";
import type { IndexResult } from "bun:graph-index";
import { exportForkCapabilities } from "./fork-capabilities";
import { writeGraphDocs } from "./graph-docs";

export const DOMAINS = ["packages/bun-google", "packages/bun-chromium", "src/browser"];
export const SURFACE_FILES = [
  "src/js/bun/google.ts",
  "src/js/bun/chromium.ts",
  "src/js/bun/obscura.ts",
  "src/js/internal/chrome-manifests.ts",
  "src/resolve_builtins/HardcodedModule.rs",
  "packages/bun-types/google.d.ts",
  "packages/bun-types/chromium.d.ts",
  "packages/bun-types/chrome.d.ts",
  "packages/bun-types/obscura.d.ts",
  "scripts/aphrody/browser.ts",
  "scripts/aphrody/chromium.ts",
  "scripts/aphrody/gn.ts",
  "scripts/aphrody/vendor-gn.ts",
  "scripts/aphrody/google-chromium-graph.ts",
  "package.json",
  "vendor/gn/.bun-vendor.json",
  "docs/chromium/gn.md",
  "docs/aphrody/browser-owners.md",
];
export const SCOPE = { source: "graph:bun:capabilities:google-chromium", profile: "bun" } as const;
export const SURFACE_DOMAIN = "capabilities/google-chromium";
const hash = (value: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
const nativeFormat = /\.(?:rs|[cm]?[jt]sx?|mdx?)$/;
const rootDefault = resolve(import.meta.dir, "../..");

export function plan(root: string, out: string) {
  root = resolve(root);
  out = resolve(out);
  for (const surface of ["src", "packages", "vendor", "scripts", "docs"]) {
    const distance = relative(join(root, surface), out);
    if (!isAbsolute(distance) && distance !== ".." && !distance.startsWith(`..${sep}`))
      throw new Error("Graph output must stay outside source, vendor, scripts and docs trees");
  }
  return {
    root,
    out,
    domains: [...DOMAINS],
    surfaceFiles: [...SURFACE_FILES],
    excluded: ["vendor/chromium/src full source", "vendor/gn implementation", "protected stores", "engine compilation"],
    owners: ["bun:graph-index", "bun:graph-native", "bun:graph", "fork-capabilities.ts", "graph-docs.ts"],
    concurrency: 1,
  };
}

export async function indexSurface(
  registry: BunPython,
  root: string,
  revision: string,
  producerSHA256: string,
  out: string,
  paths: string[] = SURFACE_FILES,
) {
  const { executeGraph } = await import("bun:graph-native");
  const canonical = await realpath(root);
  const files: { path: string; content: string }[] = [];
  const facts: { path: string; sha256: string; bytes: number; native: boolean }[] = [];
  const missing: string[] = [];
  for (const path of paths) {
    if (
      isAbsolute(path) ||
      path
        .split(/[\\/]/)
        .some(part => part === ".." || [".coord", ".git", "secrets", "cookies", "sessions"].includes(part))
    )
      throw new Error(`Invalid explicit source path: ${path}`);
    const absolute = resolve(canonical, path);
    const before = await lstat(absolute).catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!before) {
      missing.push(path);
      continue;
    }
    if (!before.isFile() || before.isSymbolicLink() || before.size > 2 * 1024 * 1024)
      throw new Error(`Explicit source is not a bounded regular file: ${path}`);
    const distance = relative(canonical, await realpath(absolute));
    if (isAbsolute(distance) || distance.startsWith(`..${sep}`) || distance === "..")
      throw new Error(`Explicit source escapes checkout: ${path}`);
    const bytes = await Bun.file(absolute).bytes();
    const after = await lstat(absolute);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs)
      throw new Error(`Source changed while reading: ${path}`);
    const native = nativeFormat.test(path);
    facts.push({ path, sha256: hash(bytes), bytes: bytes.length, native });
    if (native) files.push({ path, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) });
  }
  if (!files.length) throw new Error("No explicit native source files found");
  const response = await executeGraph({
    op: "build",
    scope: SCOPE,
    root: canonical,
    built_at_commit: revision,
    files,
    limits: {
      max_files: 64,
      max_file_bytes: 2 * 1024 * 1024,
      max_source_bytes: 16 * 1024 * 1024,
      max_nodes: 100000,
      max_edges: 200000,
      max_ast_depth: 256,
      max_output_bytes: 32 * 1024 * 1024,
    },
  });
  const failed = new Set(response.result.parse_errors.map(error => error.path));
  const coverage = {
    files: facts.length,
    nativeFiles: facts.filter(file => file.native && !failed.has(file.path)).length,
    unresolvedFiles: facts.filter(file => !file.native || failed.has(file.path)).length,
    metadataOnlyFiles: 0,
    parseErrors: response.result.parse_errors.length,
    calls: response.result.stats.calls,
    unresolvedCalls: response.result.stats.unresolved,
    missing,
    sourceBytes: facts.reduce((total, file) => total + file.bytes, 0),
    resolutionScope: "explicit-capability-files",
  };
  const fileNodes = facts.map(file => ({
    id: `file:${file.path}`,
    label: file.path,
    file_type: "file",
    source_file: file.path,
    sha256: file.sha256,
    bytes: file.bytes,
    hashKind: "content-sha256",
    provenance: file.native && !failed.has(file.path) ? "EXTRACTED" : "UNRESOLVED",
    unresolvedReason: !file.native ? "unsupported-native-format" : failed.has(file.path) ? "native-parse-error" : null,
  }));
  const graph = {
    ...response.result.graph,
    producer: "bun native google-chromium capability graph",
    graph: {
      scope: SCOPE,
      domain: SURFACE_DOMAIN,
      coverage,
      producerSHA256,
      inputSHA256: hash(JSON.stringify(facts)),
      sourceConsistency: "per-file-observation",
      sourceIdentity: "immutable-file-sha256",
      parseErrors: response.result.parse_errors,
    },
    nodes: [...response.result.graph.nodes.map(node => ({ ...node })), ...fileNodes],
    links: response.result.graph.links.map(link => ({ ...link })),
  };
  const text = JSON.stringify(graph);
  const sha256 = hash(text);
  const repository = registry.repository("bun/google-chromium-capabilities", "source", canonical, revision, {
    domain: SURFACE_DOMAIN,
    source: SCOPE.source,
    profile: SCOPE.profile,
  });
  const counts = await registry.importGraph(repository, graph, sha256);
  await mkdir(out, { recursive: true });
  const artifact = join(out, `capability-graph.${sha256}.json`);
  await Bun.write(artifact, text);
  await registry.artifact(artifact, "google-chromium-native-graph", null, {
    repository,
    scope: SCOPE,
  });
  return {
    domain: SURFACE_DOMAIN,
    source: SCOPE.source,
    repository,
    snapshot: `${repository}:graph:${sha256}`,
    sha256,
    coverage,
    nodes: counts.nodes,
    edges: counts.edges,
    artifact,
  };
}

export async function index(root: string, out: string) {
  const selected = plan(root, out);
  const catalog = await exportForkCapabilities(selected.root);
  const expected = ["bun:google", "bun:chromium", "bun:obscura"];
  const modules = catalog.modules.filter(module => expected.includes(module.name));
  if (modules.length !== expected.length)
    throw new Error("Builtin capability catalog lacks a required browser/Google owner");
  const [{ BunPython }, { indexCodebase }] = await Promise.all([import("bun:graph"), import("bun:graph-index")]);
  await mkdir(selected.out, { recursive: true });
  using registry = new BunPython(join(selected.out, "registry.sqlite"));
  const indexed: IndexResult = await indexCodebase(registry, selected.root, {
    profile: "bun",
    revision: catalog.source.revision,
    domains: selected.domains,
    concurrency: 1,
    artifactDirectory: join(selected.out, "snapshots"),
    maxFiles: 10000,
    maxReadBytes: 16 * 1024 * 1024,
    maxFileBytes: 16 * 1024 * 1024,
  });
  const surface = await indexSurface(
    registry,
    selected.root,
    indexed.revision,
    indexed.producerSHA256,
    join(selected.out, "snapshots"),
  );
  const evidence = {
    schema: "bun-google-chromium-graph/1",
    plan: selected,
    source: catalog.source,
    producer: { version: Bun.version, revision: Bun.revision, sha256: indexed.producerSHA256 },
    catalog: {
      modules,
      packages: catalog.packages.filter(pkg => /google|web|chromium|obscura/.test(pkg.name)),
      sha256: hash(JSON.stringify(catalog)),
    },
    domains: [...indexed.domains, surface],
    qualification: {
      fileCoverageIsNotAstCoverage: true,
      completeVendorChromium: false,
      buildsOrBrowserSessionsExecuted: false,
      sourceConsistency: "per-file-observation",
    },
  };
  await Bun.write(join(selected.out, "evidence.json"), JSON.stringify(evidence, null, 2));
  return evidence;
}

export async function exportDocs(out: string) {
  const evidence = await Bun.file(join(out, "evidence.json")).json();
  if (evidence.schema !== "bun-google-chromium-graph/1") throw new Error("Unknown graph evidence schema");
  const { BunPython } = await import("bun:graph");
  using registry = new BunPython(join(out, "registry.sqlite"));
  const docs: Awaited<ReturnType<typeof writeGraphDocs>>[] = [];
  for (const domain of evidence.domains)
    docs.push(
      await writeGraphDocs(registry, {
        workspace: evidence.plan.root,
        repositoryId: domain.repository,
        snapshotId: domain.snapshot,
        domain: domain.domain,
        source: domain.source,
        profile: "bun",
        out: join(out, "docs"),
        maxRows: 10000,
        maxBytes: 64 * 1024 * 1024,
      }),
    );
  const result = docs.map(doc => ({
    out: doc.out,
    manifestPath: doc.manifestPath,
    scope: doc.manifest.scope,
  }));
  await Bun.write(join(out, "exports.json"), JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      root: { type: "string", default: rootDefault },
      out: { type: "string" },
      help: { type: "boolean" },
    },
  });
  const command = values.help ? "help" : (positionals[0] ?? "help");
  const root = resolve(values.root);
  const out = resolve(values.out ?? join(root, "tmp/google-chromium-graph"));
  if (command === "help")
    console.log(
      "Usage: bun scripts/aphrody/google-chromium-graph.ts plan|index|export [--root checkout] [--out local-staging]\nNative graph owners only; explicit Google/web/browser domains and capability files; vendor Chromium is excluded.",
    );
  else if (command === "plan") console.log(JSON.stringify(plan(root, out), null, 2));
  else if (command === "index") console.log(JSON.stringify(await index(root, out), null, 2));
  else if (command === "export") console.log(JSON.stringify(await exportDocs(out), null, 2));
  else throw new Error(`Unknown command: ${command}`);
}
