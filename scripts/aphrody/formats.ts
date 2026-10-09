import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { scheduler } from "node:timers/promises";
import { parseArgs } from "node:util";
import { BunPython, registryPath } from "./pyjs-store.ts";
import { git } from "./pyjs-index.ts";
import type { EngineGraph, GraphEdge, GraphNode } from "./engine-graph.ts";

export type Component = "bun" | "uv" | "cpython" | "jsc";
export type Boundary = "core" | "stdlib" | "internal" | "delegated" | "container-only" | "recognition-only";
export type Operation = "read" | "write" | "parse" | "import" | "execute" | "compress" | "decompress" | "serialize" | "deserialize" | "extract" | "build" | "install" | "recognize" | "copy";
type Reference = { path: string; marker: string };
export type Capability = {
  component: Component; format: string; extensions: string[]; boundary: Boundary; operations: Operation[];
  api: string; limits: string; references: Reference[];
};
export type Evidence = Reference & { component: Component; absolute: string; sha256: string; line: number; excerpt: string };
export type ComponentInfo = { root: string; version: string; revision: string; revisionRoot?: string; sourceOnly: true };
export type Catalogue = {
  components: Record<Component, ComponentInfo>; capabilities: Capability[]; evidence: Evidence[];
  scope: string; graph: EngineGraph;
};

const reference = (path: string, marker: string): Reference => ({ path, marker });
const loader = reference("src/ast/loader.rs", "pub enum Loader");
const fileTypes = reference("docs/runtime/file-types.mdx", "Built-in loaders");
const archive = reference("src/runtime/api/Archive.rs", "read_support_format_tar");
const uvExtensions = reference("crates/uv-distribution-filename/src/extension.rs", "pub enum LegacySourceDistExtension");
const uvExtraction = reference("crates/uv-extract/src/stream.rs", "Err(Error::UnsupportedCompression)");
const pythonImport = reference("Lib/importlib/_bootstrap_external.py", "SOURCE_SUFFIXES = ['.py']");
const standardLibrary = (module: string, marker: string) => reference(`Doc/library/${module}.rst`, marker);

function capability(component: Component, format: string, extensions: string[], boundary: Boundary, operations: Operation[], api: string, limits: string, ...references: Reference[]): Capability {
  return { component, format, extensions, boundary, operations, api, limits, references };
}

export const capabilities: Capability[] = [
  capability("bun", "javascript", ["js", "mjs", "cjs", "pyjs"], "core", ["parse", "import", "execute", "build"], "JS/JSX loaders", "Bun supplies filesystem and module resolution to JSC; .pyjs aliases JavaScript, not Python syntax.", loader, fileTypes, reference("src/ast/loader.rs", 'b"pyjs" => Loader::Js')),
  capability("bun", "typescript", ["ts", "mts", "cts", "pyts"], "core", ["parse", "import", "execute", "build"], "TS loader", "Types are stripped; loading does not type-check. .pyts aliases TypeScript.", loader, fileTypes, reference("src/ast/loader.rs", 'b"pyts" => Loader::Ts')),
  capability("bun", "jsx", ["jsx"], "core", ["parse", "import", "execute", "build"], "JSX loader", "JSX becomes JavaScript before execution.", loader, fileTypes),
  capability("bun", "tsx", ["tsx", "pytsx"], "core", ["parse", "import", "execute", "build"], "TSX loader", "JSX and type syntax are transformed before execution; .pytsx aliases TSX.", loader, fileTypes, reference("src/ast/loader.rs", 'b"pytsx" => Loader::Tsx')),
  capability("bun", "json", ["json"], "core", ["read", "write", "parse", "import", "serialize", "deserialize"], "JSON / JSON loader / BunFile.json", "ECMAScript JSON value restrictions apply.", fileTypes),
  capability("bun", "jsonc", ["jsonc"], "core", ["parse", "import"], "JSONC loader", "Comments and trailing commas are accepted by this loader, not by JSON.parse.", loader, fileTypes),
  capability("bun", "json5", ["json5"], "core", ["parse", "import"], "JSON5 loader / Bun.JSON5", "Source declaration does not prove the installed binary has this fork API.", reference("docs/runtime/json5.mdx", "JSON5"), loader),
  capability("bun", "toml", ["toml"], "core", ["parse", "import", "serialize"], "Bun.TOML.parse/stringify", "Fork source documents TOML 1.1; runtime qualification is separate.", reference("docs/runtime/toml.mdx", "Bun.TOML.stringify"), loader),
  capability("bun", "yaml", ["yaml", "yml"], "core", ["parse", "import"], "Bun.YAML.parse / YAML loader", "YAML 1.2 parser; cyclic aliases cannot be imported as modules.", reference("docs/runtime/yaml.mdx", "YAML 1.2"), loader),
  capability("bun", "xml", ["xml"], "core", ["parse", "import", "serialize"], "Bun.XML / XML loader", "XML 1.0 non-validating parser; source fork API needs changed-binary qualification.", reference("docs/runtime/xml.mdx", "non-validating processor"), loader),
  capability("bun", "markdown", ["md", "markdown"], "core", ["parse", "import", "serialize"], "Bun.markdown / Markdown loader", "Produces rendered HTML, not a lossless Markdown serializer.", reference("docs/runtime/markdown.mdx", "GitHub Flavored Markdown"), fileTypes),
  capability("bun", "text", ["txt", "text"], "core", ["read", "write", "import"], "Text loader / BunFile.text / Bun.write", "Decoded text is not a parser for arbitrary document formats.", fileTypes),
  capability("bun", "asset-bytes", ["*"], "core", ["read", "write", "copy"], "BunFile.bytes / file loader", "An unknown extension is copied/referenced; images and fonts are not decoded by the file loader.", reference("docs/runtime/file-types.mdx", "Default for all unrecognized file types")),
  capability("bun", "base64", [], "core", ["serialize", "import"], "base64 loader", "An explicitly selected loader encodes asset bytes as a string; it is not an image decoder.", reference("src/ast/loader.rs", 'b"base64" => Loader::Base64')),
  capability("bun", "data-url", [], "core", ["serialize", "import"], "dataurl loader", "An explicitly selected loader embeds bytes as a data URL; it does not parse the embedded format.", reference("src/ast/loader.rs", 'b"dataurl" => Loader::Dataurl')),
  capability("bun", "html", ["html"], "core", ["parse", "import", "build"], "HTML loader", "Build/dev-server entry point; HTML is not executed as a JavaScript program.", loader, fileTypes),
  capability("bun", "css", ["css"], "core", ["parse", "import", "build"], "CSS loader", "Browser style semantics require a host renderer.", loader, fileTypes),
  capability("bun", "shell", ["sh"], "core", ["parse", "execute"], "Bun Shell CLI loader", "CLI only; this loader is not available to runtime imports or Bun.build.", reference("docs/runtime/file-types.mdx", "only supported when starting Bun itself"), loader),
  capability("bun", "native-addon", ["node"], "core", ["import"], "N-API loader", "Target ABI must match; the bundler copies the addon as a file.", fileTypes, loader),
  capability("bun", "sqlite", ["sqlite", "db"], "core", ["read", "write", "import", "serialize", "deserialize"], "bun:sqlite / sqlite loader", "Import requires type:sqlite and Bun target; filename alone does not select the loader.", reference("docs/runtime/sqlite.mdx", "serialize"), fileTypes),
  capability("bun", "wasm", ["wasm"], "core", ["read", "execute", "copy"], "Wasm loader / WebAssembly", "Bundler copies the asset; a host creates the WebAssembly module/instance.", loader, reference("docs/runtime/file-types.mdx", "wasm")),
  capability("bun", "tar", ["tar"], "core", ["read", "write", "extract", "build"], "Bun.Archive", "Reader enables tar/GNU tar only, not every format compiled into libarchive.", archive),
  capability("bun", "tar-gzip", ["tar.gz", "tgz"], "core", ["read", "write", "extract", "compress", "decompress"], "Bun.Archive", "Windows extraction skips symlinks.", reference("docs/runtime/archive.mdx", "Windows, Bun always skips symbolic links"), archive),
  capability("bun", "zip", ["zip"], "core", ["read", "write", "extract", "build"], "Bun.Archive format:zip", "ZIP entries are independently deflated; ZIP format is explicit when creating.", reference("docs/runtime/archive.mdx", 'format: "zip"'), archive),
  capability("bun", "gzip", ["gz"], "core", ["compress", "decompress"], "Bun.gzipSync/gunzipSync", "Byte codec, not an archive/member parser.", reference("packages/bun-types/bun.d.ts", "function gzipSync")),
  capability("bun", "deflate", ["deflate", "zlib"], "core", ["compress", "decompress"], "Bun.deflateSync/inflateSync / node:zlib", "Container/wrapper choice depends on the API.", reference("packages/bun-types/bun.d.ts", "function deflateSync")),
  capability("bun", "zstd", ["zst"], "core", ["compress", "decompress"], "Bun.zstdCompressSync/zstdDecompressSync", "Does not imply Bun.Archive supports tar.zst.", reference("packages/bun-types/bun.d.ts", "function zstdCompressSync")),
  capability("bun", "brotli", ["br"], "core", ["compress", "decompress"], "node:zlib Brotli", "Byte codec; not a tar/ZIP reader.", reference("src/js/node/zlib.ts", "const NativeBrotli")),
  capability("bun", "structured-clone-binary", [], "core", ["serialize", "deserialize"], "bun:jsc.serialize/deserialize", "WebKit/Safari serialization; node:v8 naming does not establish V8 wire compatibility.", reference("packages/bun-types/jsc.d.ts", "serialization format from WebKit/Safari")),
  capability("uv", "python-source", ["py", "pyw"], "delegated", ["execute"], "uv run", "UV manages environment and launches Python; UV is not the Python parser or VM.", reference("docs/concepts/projects/run.md", "uv run example.py")),
  capability("uv", "toml", ["toml"], "core", ["read", "parse"], "pyproject.toml / uv.toml configuration", "Configuration schemas, not a general TOML import into JavaScript.", reference("docs/concepts/configuration-files.md", "pyproject.toml")),
  capability("uv", "uv-lock", ["lock"], "core", ["read", "write", "parse", "serialize"], "uv.lock", "UV-specific TOML schema/version; not interchangeable with Bun.lock.", reference("crates/uv-lock/src/lock/mod.rs", "pub fn from_toml")),
  capability("uv", "requirements", ["txt", "in"], "core", ["read", "write", "parse", "serialize", "install"], "requirements.txt / requirements.in", "Dependency requirement syntax, not generic text interpretation.", reference("crates/uv-requirements-txt/src/lib.rs", "Requirements"), reference("docs/concepts/projects/export.md", "requirements.txt")),
  capability("uv", "pylock", ["toml"], "core", ["read", "write", "parse", "serialize", "install"], "pylock.toml PEP 751", "Dedicated Python lock schema.", reference("crates/uv-cli/src/lib.rs", "pylock.toml")),
  capability("uv", "cyclonedx", ["json"], "core", ["write", "serialize"], "uv export --format cyclonedx1.5", "SBOM export; does not establish arbitrary CycloneDX import.", reference("docs/concepts/projects/export.md", "cyclonedx1.5")),
  capability("uv", "json", ["json"], "core", ["write", "serialize"], "uv pip list --format json", "Report output; no general JSON file import is claimed.", reference("crates/uv-pip-commands/src/list.rs", "ListFormat::Json")),
  capability("uv", "csv", ["csv"], "internal", ["read", "write", "parse", "serialize"], "Wheel RECORD CSV", "Wheel metadata only; not a public general CSV CLI.", reference("crates/uv-install-wheel/src/wheel.rs", "csv::ReaderBuilder"), reference("crates/uv-install-wheel/src/wheel.rs", "csv::WriterBuilder")),
  capability("uv", "wheel", ["whl"], "core", ["recognize", "read", "extract", "install", "build"], "UV installer / native uv_build backend", "Native wheel creation requires uv_build; other PEP 517 backends may invoke Python.", uvExtensions, reference("crates/uv-build-backend/src/wheel.rs", "ZipFileWriter")),
  capability("uv", "tar", ["tar"], "core", ["read", "extract"], "uv-extract streaming archive", "Source-distribution extraction, not a general tar CLI.", uvExtraction),
  capability("uv", "tar-gzip", ["tar.gz", "tgz"], "core", ["read", "extract", "decompress", "build"], "uv-extract / uv_build source distribution", "Native source-dist builder applies Python packaging rules.", uvExtraction, reference("crates/uv-build-backend/src/source_dist.rs", "tar")),
  capability("uv", "tar-zstd", ["tar.zst"], "core", ["read", "extract", "decompress"], "uv-extract streaming archive", "Specific streaming tar.zst decoder; not a generic zstd CLI.", reference("crates/uv-extract/src/stream.rs", "async fn untar_zst")),
  capability("uv", "zip", ["zip"], "core", ["read", "extract"], "uv-extract", "Distribution/member validation applies.", uvExtraction),
  capability("uv", "tar-bzip2", ["tar.bz2", "tbz"], "recognition-only", ["recognize"], "SourceDistExtension", "Recognized filename, but pinned streaming archive() returns UnsupportedCompression.", uvExtensions, uvExtraction),
  capability("uv", "tar-xz", ["tar.xz", "txz"], "recognition-only", ["recognize"], "SourceDistExtension", "Recognized filename, but pinned streaming archive() returns UnsupportedCompression.", uvExtensions, uvExtraction),
  capability("uv", "tar-lzip", ["tar.lz", "tlz"], "recognition-only", ["recognize"], "SourceDistExtension", "Recognized filename, but pinned streaming archive() returns UnsupportedCompression.", uvExtensions, uvExtraction),
  capability("uv", "tar-lzma", ["tar.lzma"], "recognition-only", ["recognize"], "SourceDistExtension", "Recognized filename, but pinned streaming archive() returns UnsupportedCompression.", uvExtensions, uvExtraction),
  capability("uv", "messagepack", ["msgpack"], "internal", ["read", "write"], "UV cache metadata", "Private cache format; no stable arbitrary MessagePack CLI is claimed.", reference("crates/uv-cache/src/lib.rs", "metadata.msgpack")),
  capability("cpython", "python-source", ["py", "pyw"], "core", ["parse", "import", "execute"], "CPython compiler/interpreter", "The source grammar belongs to the pinned Python version.", pythonImport),
  capability("cpython", "python-bytecode", ["pyc"], "core", ["read", "write", "import", "execute"], "importlib / marshal", "Magic/version and code-object compatibility constrain interchange.", reference("Lib/importlib/_bootstrap_external.py", "BYTECODE_SUFFIXES = ['.pyc']"), standardLibrary("marshal", "not compatible between Python versions")),
  capability("cpython", "native-python-extension", ["pyd", "so"], "core", ["import"], "CPython extension loader", "Platform/ABI-specific; .dll is not an arbitrary Python import.", reference("Lib/importlib/_bootstrap_external.py", "EXTENSION_SUFFIXES")),
  capability("cpython", "text", ["txt", "text"], "core", ["read", "write"], "open / codecs", "Generic byte/text I/O does not establish document-format parsing.", standardLibrary("codecs", "encoding")),
  capability("cpython", "json", ["json"], "stdlib", ["read", "write", "parse", "serialize", "deserialize"], "json", "Standard-library API; not automatic .json module import.", standardLibrary("json", "JSON")),
  capability("cpython", "toml", ["toml"], "stdlib", ["read", "parse"], "tomllib", "TOML 1.0.0 read only; no standard TOML writer in 3.13.", standardLibrary("tomllib", "does not")),
  capability("cpython", "csv", ["csv"], "stdlib", ["read", "write", "parse", "serialize"], "csv / _csv accelerator", "Dialect configuration determines parsing; not module import.", standardLibrary("csv", "reader")),
  capability("cpython", "xml", ["xml"], "stdlib", ["read", "write", "parse", "serialize"], "xml.etree.ElementTree / Expat", "Standard-library XML APIs; not native Python syntax.", standardLibrary("xml.etree.elementtree", "XML")),
  capability("cpython", "html", ["html"], "stdlib", ["parse"], "html.parser", "Parser only; no browser DOM renderer or HTML execution.", standardLibrary("html.parser", "HTML")),
  capability("cpython", "ini", ["ini", "cfg"], "stdlib", ["read", "write", "parse", "serialize"], "configparser", "INI/configuration dialect, not a general .cfg file grammar.", standardLibrary("configparser", "configuration")),
  capability("cpython", "plist", ["plist"], "stdlib", ["read", "write", "parse", "serialize", "deserialize"], "plistlib", "XML and binary property-list variants.", standardLibrary("plistlib", "binary")),
  capability("cpython", "pickle", ["pickle", "pkl"], "stdlib", ["read", "write", "serialize", "deserialize"], "pickle / _pickle", "Python object protocol; decoding can invoke object reconstruction.", standardLibrary("pickle", "protocol")),
  capability("cpython", "marshal", [], "stdlib", ["read", "write", "serialize", "deserialize"], "marshal", "Version-dependent internal code-object format, distinct from pickle.", standardLibrary("marshal", "not compatible between Python versions")),
  capability("cpython", "sqlite", ["sqlite", "db"], "stdlib", ["read", "write", "serialize", "deserialize"], "sqlite3 / _sqlite3", "Optional native extension; serialize APIs depend on linked SQLite capabilities.", standardLibrary("sqlite3", "serialize")),
  capability("cpython", "zip", ["zip"], "stdlib", ["read", "write", "extract", "compress", "decompress"], "zipfile", "ZIP64 supported; multipart ZIP unsupported; encrypted ZIP creation unsupported.", standardLibrary("zipfile", "multipart ZIP")),
  capability("cpython", "python-zipapp", ["pyz", "pyzw"], "stdlib", ["build", "import", "execute"], "zipapp / zipimport", "Requires a Python executable and __main__.py; ZIP itself is not executable syntax.", standardLibrary("zipapp", "__main__.py"), standardLibrary("zipimport", "ZIP")),
  capability("cpython", "tar", ["tar"], "stdlib", ["read", "write", "extract", "build"], "tarfile", "USTAR/GNU/PAX; sparse tar variants are read-only.", standardLibrary("tarfile", "sparse")),
  capability("cpython", "tar-gzip", ["tar.gz", "tgz"], "stdlib", ["read", "write", "extract", "compress", "decompress"], "tarfile + gzip", "Requires corresponding compression modules.", standardLibrary("tarfile", "gzip, bz2 and lzma")),
  capability("cpython", "tar-bzip2", ["tar.bz2", "tbz"], "stdlib", ["read", "write", "extract", "compress", "decompress"], "tarfile + bz2", "Requires the bz2 native extension.", standardLibrary("tarfile", "gzip, bz2 and lzma")),
  capability("cpython", "tar-xz", ["tar.xz", "txz"], "stdlib", ["read", "write", "extract", "compress", "decompress"], "tarfile + lzma", "Requires the lzma native extension.", standardLibrary("tarfile", "gzip, bz2 and lzma")),
  capability("cpython", "gzip", ["gz"], "stdlib", ["compress", "decompress", "read", "write"], "gzip + zlib", "Compressed byte/file stream; not tar member handling.", standardLibrary("gzip", "gzip")),
  capability("cpython", "deflate", ["deflate", "zlib"], "stdlib", ["compress", "decompress"], "zlib", "Wrapper/raw-deflate behavior is configured with wbits.", standardLibrary("zlib", "wbits")),
  capability("cpython", "bzip2", ["bz2"], "stdlib", ["compress", "decompress", "read", "write"], "bz2", "Optional native compression extension.", standardLibrary("bz2", "compression")),
  capability("cpython", "xz", ["xz", "lzma"], "stdlib", ["compress", "decompress", "read", "write"], "lzma", "XZ/LZMA byte formats, not the distinct lzip container.", standardLibrary("lzma", "compression")),
  capability("cpython", "base64", [], "stdlib", ["serialize", "deserialize"], "base64", "Encoding transforms bytes; it does not interpret the encoded file format.", standardLibrary("base64", "Base64")),
  capability("jsc", "javascript", ["js", "mjs"], "core", ["parse", "execute", "import"], "JavaScriptCore parser/module loader", "Engine consumes source; filename resolution and filesystem access belong to the host. No native TS/JSX parser.", reference("runtime/JSModuleLoader.cpp", "ScriptFetchParameters::Type::JavaScript")),
  capability("jsc", "json", ["json"], "core", ["parse", "serialize", "deserialize"], "JSON.parse/stringify", "In-memory JSON values; no standalone JSON filesystem loader is inferred.", reference("runtime/JSONObject.cpp", "JSON.stringify cannot serialize cyclic structures")),
  capability("jsc", "wasm", ["wasm"], "core", ["parse", "execute"], "WebAssembly / Wasm parser", "Requires ENABLE(WEBASSEMBLY); host supplies bytes and imports.", reference("wasm/WasmStreamingParser.cpp", "ENABLE(WEBASSEMBLY)")),
];

export async function pool<T, R>(items: T[], workers: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isSafeInteger(workers) || workers < 1 || workers > 32) throw new Error("Format workers must be an integer between 1 and 32");
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]!, index);
      await scheduler.yield();
    }
  }));
  return results;
}

function evidenceId(component: Component, reference: Reference) { return `${component}:${reference.path}:${reference.marker}`; }

export async function sourceEvidence(specs: Capability[], roots: Record<Component, string>, workers = 4): Promise<Evidence[]> {
  const references = new Map<string, Reference & { component: Component }>();
  for (const spec of specs) for (const item of spec.references) references.set(evidenceId(spec.component, item), { ...item, component: spec.component });
  const files = new Map<string, Promise<{ text: string; sha256: string }>>();
  return pool([...references.values()], workers, async item => {
    const absolute = resolve(roots[item.component], item.path);
    const scoped = relative(roots[item.component], absolute);
    if (isAbsolute(scoped) || scoped === ".." || scoped.startsWith("../") || scoped.startsWith("..\\")) throw new Error(`Format evidence escapes source root: ${item.path}`);
    let file = files.get(absolute);
    if (!file) {
      file = Bun.file(absolute).bytes().then(bytes => ({ text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") }));
      files.set(absolute, file);
    }
    const { text, sha256 } = await file;
    const offset = text.indexOf(item.marker);
    if (offset < 0) throw new Error(`Format evidence ${absolute} does not contain ${JSON.stringify(item.marker)}`);
    const line = text.slice(0, offset).split("\n").length;
    return { ...item, absolute, sha256, line, excerpt: text.split("\n")[line - 1]!.trim() };
  });
}

export function formatGraph(info: Record<Component, ComponentInfo>, specs: Capability[], evidence: Evidence[]): EngineGraph {
  const nodes = new Map<string, GraphNode>();
  const links: GraphEdge[] = [];
  const indexed = new Map(evidence.map(item => [evidenceId(item.component, item), item]));
  for (const component of Object.keys(info) as Component[]) nodes.set(`component:${component}`, { id: `component:${component}`, label: component, kind: "component", ...info[component], provenance: "SOURCE_VERIFIED" });
  for (const spec of specs) {
    const id = `capability:${spec.component}:${spec.format}`;
    if (nodes.has(id)) throw new Error(`Duplicate format capability ${id}`);
    if (spec.references.length === 0) throw new Error(`Missing verified evidence for ${id}: no source references`);
    const format = `format:${spec.format}`;
    const previous = nodes.get(format);
    const extensions = [...new Set([...(previous?.extensions as string[] | undefined ?? []), ...spec.extensions])];
    nodes.set(format, { id: format, label: spec.format, kind: "file-format", extensions, provenance: "SOURCE_VERIFIED" });
    nodes.set(id, { id, label: spec.api, kind: "format-capability", ...spec, qualification: "source-only", version: info[spec.component].version, provenance: "SOURCE_VERIFIED" });
    links.push({ source: `component:${spec.component}`, target: id, relation: "exposes", confidence: "EXTRACTED", confidence_score: 1 });
    links.push({ source: id, target: format, relation: "recognition-only" === spec.boundary ? "recognizes-filename" : "handles-format", confidence: "EXTRACTED", confidence_score: 1 });
    if (spec.boundary === "delegated") links.push({ source: id, target: "component:cpython", relation: "delegates-to", confidence: "EXTRACTED", confidence_score: 1 });
    for (const operation of spec.operations) {
      const target = `operation:${operation}`;
      nodes.set(target, { id: target, label: operation, kind: "operation", provenance: "EXTRACTED" });
      links.push({ source: id, target, relation: "supports-operation", confidence: "EXTRACTED", confidence_score: 1 });
    }
    for (const item of spec.references) {
      const proof = indexed.get(evidenceId(spec.component, item));
      if (!proof) throw new Error(`Missing verified evidence for ${id}: ${item.path}`);
      const source = `source:${evidenceId(spec.component, item)}`;
      nodes.set(source, { id: source, label: proof.path, kind: "source-evidence", source_file: proof.absolute, source_location: `L${proof.line}`, ...proof, provenance: "EXTRACTED" });
      links.push({ source: id, target: source, relation: "supported-by-source", confidence: "EXTRACTED", confidence_score: 1 });
    }
  }
  return { producer: "native source-backed format catalogue", directed: true, multigraph: true, built_at_commit: info.bun.revision,
    graph: { components: info, scope: "Curated shipped capabilities and observed source boundaries; missing cells are not claims of universal absence.", sourceOnly: true }, nodes: [...nodes.values()], links };
}

export function comparison(specs: Capability[]) {
  const formats = [...new Set(specs.map(spec => spec.format))].sort();
  return formats.map(format => ({ format, ...Object.fromEntries((['bun', 'uv', 'cpython', 'jsc'] as const).map(component => {
    const spec = specs.find(item => item.format === format && item.component === component);
    return [component, spec ? { boundary: spec.boundary, operations: spec.operations, api: spec.api, limits: spec.limits } : null];
  })) }));
}

export function markdown(specs: Capability[]) {
  const cell = (component: Component, format: string) => {
    const spec = specs.find(item => item.format === format && item.component === component);
    return spec ? `${spec.boundary}: ${spec.operations.join(', ')}` : "—";
  };
  return ["| Format | Bun | UV | CPython | JSC |", "|---|---|---|---|---|", ...[...new Set(specs.map(spec => spec.format))].sort().map(format =>
    `| ${format} | ${cell('bun', format)} | ${cell('uv', format)} | ${cell('cpython', format)} | ${cell('jsc', format)} |`),
    "", "Source-qualified capabilities; native execution gates are separate. stdlib means a shipped Python library, delegated means another interpreter executes, recognition-only means a filename parser. — means no capability indexed here.", ""].join("\n");
}

async function main() {
  const { values } = parseArgs({ args: process.argv.slice(2), strict: true, options: {
    db: { type: "string", default: registryPath }, "bun-root": { type: "string", default: resolve(import.meta.dir, "../..") }, "uv-root": { type: "string" },
    "cpython-root": { type: "string" }, "jsc-root": { type: "string" }, workers: { type: "string", default: "4" }, out: { type: "string" }, markdown: { type: "boolean", default: false }, "defer-import": { type: "boolean", default: false },
  } });
  using registry = new BunPython(values.db);
  const configured = (component: Component, option: string | undefined, fallback?: string) => {
    const row = registry.db.query<{ root: string }, [string]>("SELECT root FROM repositories WHERE id=?").get(`source:${component}`);
    const path = option ?? fallback ?? row?.root;
    if (!path) throw new Error(`Format catalogue requires --${component}-root or an indexed source:${component}`);
    return resolve(path);
  };
  const bun = configured("bun", values["bun-root"]);
  const roots = { bun, uv: configured("uv", values["uv-root"], resolve(bun, "vendor/uv")), cpython: configured("cpython", values["cpython-root"]), jsc: configured("jsc", values["jsc-root"]) };
  const manifest = await Bun.file(resolve(bun, "package.json")).json() as { version: string };
  const uvPackage = Bun.TOML.parse(await Bun.file(resolve(roots.uv, "crates/uv/Cargo.toml")).text()) as { package: { version: string } };
  const pythonVersion = /#define PY_VERSION\s+"([^"]+)"/.exec(await Bun.file(resolve(roots.cpython, "Include/patchlevel.h")).text())?.[1];
  if (!pythonVersion) throw new Error("CPython patchlevel.h does not declare PY_VERSION");
  const revisions = await pool(Object.entries(roots), Number(values.workers), async ([component, root]) => ({ component, revision: await git(root, "rev-parse", "HEAD"), revisionRoot: await git(root, "rev-parse", "--show-toplevel") }));
  const revision = Object.fromEntries(revisions.map(item => [item.component, item.revision])) as Record<Component, string>;
  const revisionRoot = Object.fromEntries(revisions.map(item => [item.component, item.revisionRoot])) as Record<Component, string>;
  const components: Record<Component, ComponentInfo> = {
    bun: { root: bun, version: manifest.version, revision: revision.bun, revisionRoot: revisionRoot.bun, sourceOnly: true },
    uv: { root: roots.uv, version: uvPackage.package.version, revision: revision.uv, revisionRoot: revisionRoot.uv, sourceOnly: true },
    cpython: { root: roots.cpython, version: pythonVersion, revision: revision.cpython, revisionRoot: revisionRoot.cpython, sourceOnly: true },
    jsc: { root: roots.jsc, version: revision.jsc, revision: revision.jsc, revisionRoot: revisionRoot.jsc, sourceOnly: true },
  };
  const command = [process.execPath, ...process.argv.slice(1)];
  const run = registry.startRun("format-catalogue", command, bun, { components, runtime: { bun: Bun.version, revision: Bun.revision }, qualification: "source-only" });
  let finished = false;
  try {
    const evidence = await sourceEvidence(capabilities, roots, Number(values.workers));
    const graph = formatGraph(components, capabilities, evidence);
    const catalogue: Catalogue = { components, capabilities, evidence, scope: String(graph.graph.scope), graph };
    const output = resolve(values.out ?? resolve(bun, "tmp/bun-python/formats.json"));
    await mkdir(dirname(output), { recursive: true });
    await Bun.write(output, JSON.stringify({ ...catalogue, comparison: comparison(capabilities) }));
    const sha256 = await registry.artifact(output, "format-catalogue", run, { sourceOnly: true });
    const repository = registry.repository("formats", "source", bun, revision.bun, { components, sourceOnly: true });
    const indexed = values["defer-import"] ? { deferred: true } : await registry.importGraph(repository, graph, sha256);
    if (values.markdown) {
      const path = output.replace(/\.json$/, "") + ".md";
      await Bun.write(path, markdown(capabilities));
      await registry.artifact(path, "format-comparison", run);
    }
    const result = { output, formats: new Set(capabilities.map(item => item.format)).size, capabilities: capabilities.length, evidence: evidence.length, ...indexed };
    registry.event("format-catalogue", { ...result, components, sourceOnly: true }, run);
    registry.finishRun(run, 0, JSON.stringify(result));
    finished = true;
    console.log(JSON.stringify(result));
  } catch (error) {
    if (!finished) registry.finishRun(run, 1, "", String(error));
    throw error;
  }
}

if (import.meta.main) await main();
