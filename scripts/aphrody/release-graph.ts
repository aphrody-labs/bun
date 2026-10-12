import { BunPython } from "bun:graph";
import { indexCodebase } from "bun:graph-index";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, posix } from "node:path";
import { createHash } from "node:crypto";
import { GitTree } from "./site/collect.ts";
import { writeGraphDocs } from "./graph-docs.ts";

const textExtensions = new Set(
  "rs c h cc cpp hpp cxx hxx m mm js jsx ts tsx mts cts mjs cjs py pyi zig md mdx json jsonc toml yaml yml txt html css scss sh ps1 bat cmd xml svg cmake s asm inc def lock bzl gyp gypi proto rc".split(
    " ",
  ),
);

export function decodeSourceText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function sourceDomain(path: string): string {
  const parts = path.split("/");
  return parts.length === 1
    ? "root"
    : parts.slice(0, parts[0] === "src" || parts[0] === "packages" || parts[0] === "vendor" ? 2 : 1).join("/");
}

export function sourceReadable(path: string): boolean {
  if (
    /(^|\/)(?:cookies|credentials|secrets|sessions|models|weights|node_modules|\.env(?:\.|$))|\.(?:pem|key|pfx|p12)$/i.test(
      path,
    )
  )
    return false;
  return (
    textExtensions.has(extname(path).slice(1).toLowerCase()) ||
    /(^|\/)(?:LICENSE(?:\.[\w.-]+)?|NOTICE|Makefile|Dockerfile|CMakeLists\.txt)$/.test(path)
  );
}

export function resolvedImport(path: string, specifier: string, available: Set<string>): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = posix.normalize(posix.join(posix.dirname(path), specifier));
  return (
    [base, ...[".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"].map(suffix => base + suffix)].find(candidate =>
      available.has(candidate),
    ) ?? null
  );
}

export async function buildReleaseGraph(tree: GitTree, snapshot: string, out: string) {
  const dbPath = join(out, "monorepo.sqlite");
  using registry = new BunPython(dbPath);
  const db = registry.db;
  db.exec(`CREATE TABLE release_files(path TEXT PRIMARY KEY, blob TEXT NOT NULL, domain TEXT NOT NULL, sha256 TEXT, content TEXT) STRICT;
    CREATE TABLE release_domains(name TEXT PRIMARY KEY, files INTEGER NOT NULL) STRICT;
    CREATE TABLE release_links(source TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(source,target,kind)) STRICT;
    CREATE INDEX release_files_domain ON release_files(domain);`);
  const insert = db.prepare("INSERT INTO release_files VALUES(?,?,?,?,?)");
  const paths = [...tree.files.keys()].sort();
  let readable = 0;
  let excludedInvalidUtf8Files = 0;
  for (let start = 0; start < paths.length; start += 128) {
    const batch = paths.slice(start, start + 128);
    const blobs = tree.readBytes(batch.filter(sourceReadable));
    db.transaction(() => {
      for (const path of batch) {
        const bytes = blobs.get(path);
        const content = bytes === undefined ? null : decodeSourceText(bytes);
        const sha256 = bytes === undefined ? null : createHash("sha256").update(bytes).digest("hex");
        if (bytes !== undefined && content === null) excludedInvalidUtf8Files++;
        if (bytes !== undefined && content !== null) {
          const destination = join(snapshot, path);
          mkdirSync(dirname(destination), { recursive: true });
          writeFileSync(destination, bytes);
        }
        insert.run(path, tree.files.get(path)!, sourceDomain(path), sha256, content);
        if (content !== null) readable++;
      }
    })();
    await Bun.sleep(0);
  }
  db.exec("INSERT INTO release_domains SELECT domain,count(*) FROM release_files GROUP BY domain");
  const available = new Set(paths);
  const link = db.prepare("INSERT OR IGNORE INTO release_links VALUES(?,?,?)");
  for (const { path, content } of db
    .query<{ path: string; content: string }, []>("SELECT path,content FROM release_files WHERE content IS NOT NULL")
    .iterate()) {
    if (/\.[cm]?[jt]sx?$/.test(path)) {
      for (const match of content.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()?["'](\.{1,2}\/[^"'\n]+)["']/g)) {
        const target = resolvedImport(path, match[1]!, available);
        if (target) link.run(path, target, "relative-reference");
      }
    }
  }
  const native = await indexCodebase(registry, snapshot, {
    profile: "bun",
    revision: tree.sha,
    concurrency: 1,
    artifactDirectory: join(out, "snapshots"),
    maxFiles: 500000,
  });
  const documents: { domain: string; directory: string }[] = [];
  for (const domain of native.domains) {
    const document = await writeGraphDocs(registry, {
      workspace: snapshot,
      repositoryId: domain.repository,
      snapshotId: domain.snapshot,
      domain: domain.domain,
      source: domain.source,
      profile: "bun",
      out: join(out, "graph-docs"),
      maxRows: 1000,
      maxBytes: 16 * 1024 * 1024,
    });
    documents.push({
      domain: domain.domain,
      directory: document.out.slice(out.length + 1).replaceAll("\\", "/"),
    });
  }
  const domains = db.query<{ name: string; files: number }, []>("SELECT * FROM release_domains ORDER BY name").all();
  const links = db
    .query<{ source: string; target: string; references_count: number }, []>(
      "SELECT a.domain AS source,b.domain AS target,count(*) AS references_count FROM release_links l JOIN release_files a ON a.path=l.source JOIN release_files b ON b.path=l.target WHERE a.domain<>b.domain GROUP BY a.domain,b.domain ORDER BY a.domain,b.domain",
    )
    .all();
  const evidence = {
    source: tree.sha,
    files: paths.length,
    readableFiles: readable,
    metadataOnlyFiles: paths.length - readable,
    excludedInvalidUtf8Files,
    domains,
    links,
    native,
    documents,
    coverage:
      "All tracked blobs catalogued; allowed blobs hashed without decoding. Strict UTF-8 text, including original BOMs, stored in SQLite and copied byte-for-byte to the native snapshot; invalid UTF-8 excluded from text extraction. Native symbol extraction covers src and packages with explicit parser limits; cross-domain links are resolved relative references, not inferred runtime calls.",
  };
  writeFileSync(join(out, "graph.json"), JSON.stringify(evidence, null, 2) + "\n");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  return evidence;
}
