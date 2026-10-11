import { Database } from "bun:sqlite";
import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { absolutePath, positiveInteger, prepareDatabase, within } from "./common";

export interface PeImport {
  module: string;
  delay?: boolean;
  functions?: string[];
}
export interface PeMetadata {
  imports?: PeImport[];
  sections?: Array<{ name: string; rawOffset: number; rawSize: number }>;
}
export interface PeArtifact {
  path: string;
  relativePath: string;
  bytes: number;
  sha256: string;
  metadata: PeMetadata;
}
export interface PeScanOptions {
  root: string;
  maxFiles?: number;
  maxFileBytes?: number;
  maxReadBytes?: number;
  maxDirectories?: number;
  maxEntries?: number;
  signal?: AbortSignal;
  parse?: (bytes: Uint8Array, path: string) => PeMetadata;
}
export interface PeScanResult {
  root: string;
  artifacts: PeArtifact[];
  errors: Array<{ path: string; message: string }>;
  skippedLinks: number;
  bytesRead: number;
  complete: boolean;
}

/** Reads only PE candidates under an explicit root; symlinks and escapes are excluded. */
export async function scanPe(options: PeScanOptions): Promise<PeScanResult> {
  const maxFiles = positiveInteger("maxFiles", options.maxFiles ?? 10_000);
  const maxFileBytes = positiveInteger("maxFileBytes", options.maxFileBytes ?? 64 << 20);
  const maxReadBytes = positiveInteger("maxReadBytes", options.maxReadBytes ?? 512 << 20);
  const maxDirectories = positiveInteger("maxDirectories", options.maxDirectories ?? 10_000);
  const maxEntries = positiveInteger("maxEntries", options.maxEntries ?? 100_000);
  const root = await realpath(absolutePath("root", options.root));
  const parse = options.parse ?? (await import("bun:windows")).default.pe.parse;
  const result: PeScanResult = {
    root,
    artifacts: [],
    errors: [],
    skippedLinks: 0,
    bytesRead: 0,
    complete: true,
  };
  const directories = [root];
  const visited = new Set<string>();
  let candidates = 0;
  let entriesSeen = 0;
  while (directories.length) {
    options.signal?.throwIfAborted();
    const directory = directories.pop()!;
    const info = await lstat(directory);
    if (info.isSymbolicLink()) {
      result.skippedLinks++;
      continue;
    }
    const canonical = await realpath(directory);
    if (!within(root, canonical) || visited.has(canonical)) {
      result.skippedLinks++;
      continue;
    }
    visited.add(canonical);
    if (visited.size > maxDirectories) throw new RangeError("PE scan exceeds maxDirectories");
    let entries;
    try {
      entries = await readdir(canonical, { withFileTypes: true });
    } catch (error) {
      result.errors.push({ path: canonical, message: String(error) });
      result.complete = false;
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (++entriesSeen > maxEntries) throw new RangeError("PE scan exceeds maxEntries");
      options.signal?.throwIfAborted();
      const candidate = join(canonical, entry.name);
      if (entry.isSymbolicLink()) {
        result.skippedLinks++;
        continue;
      }
      if (entry.isDirectory()) {
        directories.push(candidate);
        continue;
      }
      if (!entry.isFile() || ![".exe", ".dll"].includes(extname(entry.name).toLowerCase()))
        continue;
      if (++candidates > maxFiles) throw new RangeError("PE scan exceeds maxFiles");
      try {
        const stat = await lstat(candidate);
        if (stat.isSymbolicLink()) {
          result.skippedLinks++;
          continue;
        }
        const path = await realpath(candidate);
        if (!within(root, path)) {
          result.skippedLinks++;
          continue;
        }
        if (stat.size > maxFileBytes || result.bytesRead + stat.size > maxReadBytes)
          throw new RangeError("PE candidate exceeds read budget");
        const bytes = await Bun.file(path).bytes();
        if (bytes.length > maxFileBytes || result.bytesRead + bytes.length > maxReadBytes)
          throw new RangeError("PE candidate changed beyond read budget");
        result.bytesRead += bytes.length;
        const metadata = parse(bytes, path);
        if (!metadata) throw new Error("Candidate is not a valid PE image");
        result.artifacts.push({
          path,
          relativePath: relative(root, path).replaceAll("\\", "/"),
          bytes: bytes.length,
          sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
          metadata,
        });
      } catch (error) {
        result.errors.push({ path: candidate, message: String(error) });
        result.complete = false;
      }
    }
  }
  result.artifacts.sort((a, b) => a.path.localeCompare(b.path));
  return result;
}

export interface PeImportEdge {
  source: string;
  ordinal: number;
  module: string;
  delay: boolean;
  symbols: string[];
  candidates: string[];
  resolved: string | null;
  status: "resolved" | "ambiguous" | "missing" | "apiset-unmapped";
}

/** Resolves only against indexed artifacts, keeping ambiguous and missing imports explicit. */
export function resolvePeImports(
  artifacts: PeArtifact[],
  apiSets: ReadonlyMap<string, readonly string[]> = new Map(),
): PeImportEdge[] {
  const normalizedSets = new Map(
    [...apiSets].map(([key, hosts]) => [key.toLowerCase().replace(/\.dll$/i, ""), hosts]),
  );
  const modules = new Map<string, string[]>();
  for (const artifact of artifacts) {
    const key = basename(artifact.path.replaceAll("\\", "/")).toLowerCase();
    const rows = modules.get(key) ?? [];
    rows.push(artifact.path);
    modules.set(key, rows);
  }
  const edges: PeImportEdge[] = [];
  for (const artifact of artifacts) {
    for (const [ordinal, item] of (artifact.metadata.imports ?? []).entries()) {
      const module = item.module.toLowerCase();
      const isApiSet = /^(api-ms-win-|ext-ms-)/.test(module);
      const hosts = isApiSet ? normalizedSets.get(module.replace(/\.dll$/i, "")) : [module];
      const candidates = [
        ...new Set(
          (hosts ?? []).flatMap(
            (host) =>
              modules.get(
                /\.dll$/i.test(host) ? host.toLowerCase() : `${host.toLowerCase()}.dll`,
              ) ?? [],
          ),
        ),
      ];
      edges.push({
        source: artifact.path,
        ordinal,
        module,
        delay: item.delay ?? false,
        symbols: item.functions ?? [],
        candidates,
        resolved: candidates.length === 1 ? candidates[0]! : null,
        status: !hosts
          ? "apiset-unmapped"
          : candidates.length === 1
            ? "resolved"
            : candidates.length > 1
              ? "ambiguous"
              : "missing",
      });
    }
  }
  return edges;
}

export async function parseApiSetFile(
  path: string,
  maxBytes = 64 << 20,
): Promise<Map<string, string[]>> {
  absolutePath("apiSetPath", path);
  positiveInteger("maxBytes", maxBytes);
  if (Bun.file(path).size > maxBytes) throw new RangeError("API set schema exceeds maxBytes");
  const bytes = await Bun.file(path).bytes();
  if (bytes.length > maxBytes) throw new RangeError("API set schema exceeds maxBytes");
  const { default: windows } = await import("bun:windows");
  const metadata = windows.pe.parse(bytes, path);
  const section = metadata?.sections.find((item: { name: string }) => item.name === ".apiset");
  if (
    !section ||
    section.rawOffset < 0 ||
    section.rawSize < 0 ||
    section.rawOffset + section.rawSize > bytes.length
  )
    throw new Error("API set schema has no valid .apiset section");
  return windows.pe.parseApiSetSchema(
    bytes.subarray(section.rawOffset, section.rawOffset + section.rawSize),
  );
}

/** A complete scan replaces its root atomically; incomplete scans require explicit opt-in and do not prune. */
export async function persistPe(options: {
  dbPath: string;
  scan: PeScanResult;
  apiSets?: ReadonlyMap<string, readonly string[]>;
  allowIncomplete?: boolean;
}) {
  if (!options.scan.complete && !options.allowIncomplete)
    throw new Error("PE scan is incomplete; database was not changed");
  await prepareDatabase(options.dbPath);
  using db = new Database(options.dbPath, { create: true, strict: true });
  db.exec(`PRAGMA busy_timeout=30000;
    CREATE TABLE IF NOT EXISTS pe_artifacts (
      root TEXT NOT NULL,path TEXT NOT NULL,relative_path TEXT NOT NULL,bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,metadata_json TEXT NOT NULL,PRIMARY KEY(root,path)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS pe_import_edges (
      root TEXT NOT NULL,source_path TEXT NOT NULL,ordinal INTEGER NOT NULL,module TEXT NOT NULL,
      resolved_path TEXT,status TEXT NOT NULL,metadata_json TEXT NOT NULL,PRIMARY KEY(root,source_path,ordinal)
    ) STRICT;`);
  const edges = resolvePeImports(options.scan.artifacts, options.apiSets);
  const artifact = db.query(`INSERT INTO pe_artifacts VALUES(?,?,?,?,?,?) ON CONFLICT(root,path)
    DO UPDATE SET relative_path=excluded.relative_path,bytes=excluded.bytes,sha256=excluded.sha256,metadata_json=excluded.metadata_json`);
  const edge = db.query("INSERT INTO pe_import_edges VALUES(?,?,?,?,?,?,?)");
  db.transaction(() => {
    if (options.scan.complete) {
      db.query("DELETE FROM pe_artifacts WHERE root=?").run(options.scan.root);
      db.query("DELETE FROM pe_import_edges WHERE root=?").run(options.scan.root);
    } else {
      for (const row of options.scan.artifacts)
        db.query("DELETE FROM pe_import_edges WHERE root=? AND source_path=?").run(
          options.scan.root,
          row.path,
        );
    }
    for (const row of options.scan.artifacts)
      artifact.run(
        options.scan.root,
        row.path,
        row.relativePath,
        row.bytes,
        row.sha256,
        JSON.stringify(row.metadata, (_key, value) =>
          typeof value === "bigint" ? String(value) : value,
        ),
      );
    for (const row of edges)
      edge.run(
        options.scan.root,
        row.source,
        row.ordinal,
        row.module,
        row.resolved,
        row.status,
        JSON.stringify(row),
      );
  }).immediate();
  return {
    artifacts: options.scan.artifacts.length,
    edges: edges.length,
    resolved: edges.filter((row) => row.status === "resolved").length,
    complete: options.scan.complete,
  };
}

export interface FileAliases {
  fileId: string;
  record: number;
  declaredLinks: number;
  paths: string[];
}

/** Reads Win32 identity and hardlink names without transferring file contents. */
export async function readFileAliases(path: string): Promise<FileAliases> {
  absolutePath("path", path);
  const { dlopen, ptr } = await import("bun:ffi");
  const library = dlopen("kernel32.dll", {
    CreateFileW: { args: ["ptr", "u32", "u32", "ptr", "u32", "u32", "ptr"], returns: "i64" },
    GetFileInformationByHandle: { args: ["i64", "ptr"], returns: "i32" },
    CloseHandle: { args: ["i64"], returns: "i32" },
    FindFirstFileNameW: { args: ["ptr", "u32", "ptr", "ptr"], returns: "i64" },
    FindNextFileNameW: { args: ["i64", "ptr", "ptr"], returns: "i32" },
    FindClose: { args: ["i64"], returns: "i32" },
    GetLastError: { args: [], returns: "u32" },
  });
  const symbols = library.symbols;
  const wide = Buffer.from(`${path}\0`, "utf16le");
  let handle: number | bigint = -1;
  let cursor: number | bigint = -1;
  const invalid = (value: number | bigint) => value === -1 || value === -1n;
  try {
    handle = symbols.CreateFileW(ptr(wide), 0x80, 7, null, 3, 0x02000000, null);
    if (invalid(handle)) throw new Error(`CreateFileW failed: ${symbols.GetLastError()}`);
    const info = Buffer.alloc(52);
    if (!symbols.GetFileInformationByHandle(handle, ptr(info)))
      throw new Error(`GetFileInformationByHandle failed: ${symbols.GetLastError()}`);
    const serial = info.readUInt32LE(28);
    const declaredLinks = info.readUInt32LE(40);
    const index = (BigInt(info.readUInt32LE(44)) << 32n) | BigInt(info.readUInt32LE(48));
    let capacity = 32_768;
    let names = Buffer.alloc(capacity * 2);
    const length = Buffer.alloc(4);
    while (invalid(cursor)) {
      length.writeUInt32LE(capacity);
      cursor = symbols.FindFirstFileNameW(ptr(wide), 0, ptr(length), ptr(names));
      if (!invalid(cursor)) break;
      if (symbols.GetLastError() !== 234 || capacity >= 1_048_576)
        throw new Error(`FindFirstFileNameW failed: ${symbols.GetLastError()}`);
      capacity = Math.min(1_048_576, Math.max(capacity * 2, length.readUInt32LE(0)));
      names = Buffer.alloc(capacity * 2);
    }
    const paths: string[] = [];
    const root = /^[a-z]:/i.exec(path)?.[0];
    if (!root) throw new Error("Hardlink enumeration requires a drive-qualified path");
    for (;;) {
      const name = names
        .subarray(0, Math.min(length.readUInt32LE(0), capacity) * 2)
        .toString("utf16le")
        .replace(/\0+$/, "");
      paths.push(`${root}${name.startsWith("\\") ? "" : "\\"}${name}`);
      if (paths.length > 1_000_000) throw new RangeError("Hardlink count exceeds safety bound");
      for (;;) {
        length.writeUInt32LE(capacity);
        if (symbols.FindNextFileNameW(cursor, ptr(length), ptr(names))) break;
        const code = symbols.GetLastError();
        if (code === 38)
          return {
            fileId: `${serial.toString(16)}:${index.toString(16)}`,
            record: Number(index & ((1n << 48n) - 1n)),
            declaredLinks,
            paths,
          };
        if (code !== 234 || capacity >= 1_048_576)
          throw new Error(`FindNextFileNameW failed: ${code}`);
        capacity = Math.min(1_048_576, Math.max(capacity * 2, length.readUInt32LE(0)));
        names = Buffer.alloc(capacity * 2);
      }
    }
  } finally {
    try {
      if (!invalid(cursor)) symbols.FindClose(cursor);
    } finally {
      try {
        if (!invalid(handle)) symbols.CloseHandle(handle);
      } finally {
        library.close();
      }
    }
  }
}

export async function indexFileAliases(options: {
  dbPath: string;
  paths: string[];
  maxFiles?: number;
  readAliases?: (path: string) => Promise<FileAliases>;
}) {
  const maxFiles = positiveInteger("maxFiles", options.maxFiles ?? 10_000);
  if (options.paths.length > maxFiles) throw new RangeError("Alias candidates exceed maxFiles");
  await prepareDatabase(options.dbPath);
  using db = new Database(options.dbPath, { create: true, strict: true });
  db.exec(`CREATE TABLE IF NOT EXISTS ntfs_paths (
    file_id TEXT NOT NULL,path TEXT NOT NULL,record INTEGER NOT NULL,declared_links INTEGER NOT NULL,
    PRIMARY KEY(file_id,path)
  ) STRICT`);
  const seen = new Set<string>();
  let completeFiles = 0;
  const incomplete: string[] = [];
  const errors: Array<{ path: string; message: string }> = [];
  for (const path of options.paths) {
    try {
      const result = await (options.readAliases ?? readFileAliases)(path);
      if (seen.has(result.fileId)) continue;
      seen.add(result.fileId);
      const paths = [...new Set(result.paths)];
      if (paths.length !== result.declaredLinks) {
        incomplete.push(path);
        continue;
      }
      db.transaction(() => {
        db.query("DELETE FROM ntfs_paths WHERE file_id=?").run(result.fileId);
        const put = db.query("INSERT INTO ntfs_paths VALUES(?,?,?,?)");
        for (const name of paths) put.run(result.fileId, name, result.record, result.declaredLinks);
      }).immediate();
      completeFiles++;
    } catch (error) {
      errors.push({ path, message: String(error) });
    }
  }
  return {
    completeFiles,
    incomplete,
    errors,
    complete: incomplete.length === 0 && errors.length === 0,
  };
}
