import { BunPython } from "bun:graph";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import type { Database } from "bun:sqlite";
import { delimiter, dirname, extname, join, posix } from "node:path";
import { createHash } from "node:crypto";
import { GitTree } from "../../packages/web/site/collect.ts";
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
  // Key material and env files are never readable. Names that usually hold secrets or large data are skipped too,
  // except under docs/, where pages such as docs/runtime/cookies.mdx and secrets.mdx document public APIs.
  if (/(^|\/)(?:node_modules|\.env(?:\.|$))|\.(?:pem|key|pfx|p12)$/i.test(path)) return false;
  if (!path.startsWith("docs/") && /(^|\/)(?:cookies|credentials|secrets|sessions|models|weights)/i.test(path))
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

/** Exported Git blobs have their own identity; an ancestor checkout does not own them. */
export async function indexDetachedRelease(registry: BunPython, snapshot: string, revision: string, out: string) {
  const directory = realpathSync(snapshot);
  if (existsSync(join(directory, ".git"))) throw new Error("Release snapshot must be a detached Git export");
  if (process.env.GIT_DIR || process.env.GIT_WORK_TREE)
    throw new Error("Explicit Git environment cannot index a release export");
  const parent = dirname(directory);
  const gitParent = (parent.startsWith("\\\\?\\") ? parent.slice(4) : parent).replaceAll("\\", "/");
  if (registry.path === ":memory:") throw new Error("Release graph requires a persisted registry");
  // Set Git discovery before the process starts; native subprocesses inherit this environment.
  await using child = Bun.spawn({
    cmd: [process.execPath, join(import.meta.dir, "release-graph-index.ts"), registry.path, directory, revision, out],
    env: {
      ...process.env,
      GIT_CEILING_DIRECTORIES: [gitParent, process.env.GIT_CEILING_DIRECTORIES].filter(Boolean).join(delimiter),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, error, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  if (code !== 0) throw new Error("Detached release graph failed: " + error.slice(-4096));
  const result = JSON.parse(output) as import("bun:graph-index").IndexResult;
  if (result.revision !== revision || result.profile !== "bun") throw new Error("Detached graph identity differs");
  return result;
}

export async function verifyReleaseCatalog(db: Database, tree: GitTree, snapshot: string) {
  const paths = [...tree.files.keys()].sort();
  const count = db.query<{ count: number }, []>("SELECT count(*) AS count FROM release_files").get()!.count;
  if (count !== paths.length) throw new Error("Incomplete release catalog cannot resume");
  const row = db.query<{ blob: string; domain: string; sha256: string | null; content: string | null }, [string]>(
    "SELECT blob,domain,sha256,content FROM release_files WHERE path=?",
  );
  let readable = 0;
  let excludedInvalidUtf8Files = 0;
  const restoredBoms: { path: string; bytes: Uint8Array }[] = [];
  for (let start = 0; start < paths.length; start += 128) {
    const batch = paths.slice(start, start + 128);
    const blobs = tree.readBytes(batch.filter(sourceReadable));
    for (const path of batch) {
      const actual = row.get(path);
      const bytes = blobs.get(path);
      const content = bytes === undefined ? null : decodeSourceText(bytes);
      const hash = bytes === undefined ? null : createHash("sha256").update(bytes).digest("hex");
      if (
        !actual ||
        actual.blob !== tree.files.get(path) ||
        actual.domain !== sourceDomain(path) ||
        actual.sha256 !== hash ||
        (actual.content !== content && !(content?.startsWith("\uFEFF") && actual.content === content.slice(1)))
      )
        throw new Error("Release catalog differs from immutable Git source: " + path);
      if (actual.content !== content) restoredBoms.push({ path, bytes: bytes! });
      if (bytes !== undefined && content === null) excludedInvalidUtf8Files++;
      if (content !== null) {
        const destination = join(snapshot, path);
        if (
          lstatSync(destination).isSymbolicLink() ||
          createHash("sha256").update(readFileSync(destination)).digest("hex") !== hash
        )
          throw new Error("Detached source differs from immutable Git source: " + path);
        readable++;
      }
    }
    await Bun.sleep(0);
  }
  for (const file of new Bun.Glob("**/*").scanSync({ cwd: snapshot, onlyFiles: true, dot: true })) {
    const path = file.replaceAll("\\", "/");
    if (!tree.has(path) || lstatSync(join(snapshot, file)).isSymbolicLink())
      throw new Error("Unexpected file in detached release export: " + path);
  }
  // Older Bun SQLite bindings consumed UTF-16 BOMs. Restore only verified Git bytes via UTF-8.
  const repair = db.prepare("UPDATE release_files SET content=CAST(? AS TEXT) WHERE path=?");
  db.transaction(() => {
    for (const { path, bytes } of restoredBoms) repair.run(bytes, path);
  })();
  return { readable, excludedInvalidUtf8Files };
}

export function writeRelativeReferences(db: Database, available: Set<string>) {
  const select = db.query<{ path: string; content: string }, [string]>(
    "SELECT path,content FROM release_files WHERE content IS NOT NULL AND path>? ORDER BY path LIMIT 128",
  );
  const link = db.prepare("INSERT OR IGNORE INTO release_links VALUES(?,?,?)");
  let after = "";
  for (;;) {
    // Close the read cursor before committing writes so WAL checkpoints can advance.
    const rows = select.all(after);
    if (!rows.length) break;
    db.transaction(() => {
      for (const { path, content } of rows) {
        if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
        for (const match of content.matchAll(
          /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()?["'](\.{1,2}\/[^"'\n]+)["']/g,
        )) {
          const target = resolvedImport(path, match[1]!, available);
          if (target) link.run(path, target, "relative-reference");
        }
      }
    })();
    after = rows.at(-1)!.path;
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }
}

export async function buildReleaseGraph(tree: GitTree, snapshot: string, out: string, resume = false) {
  const dbPath = join(out, "monorepo.sqlite");
  using registry = new BunPython(dbPath);
  const db = registry.db;
  const hasCatalog = db
    .query<{ present: number }, []>(
      "SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='release_files'",
    )
    .get();
  if (hasCatalog && !resume) throw new Error("Existing catalog requires explicit verified resume");
  if (!hasCatalog)
    db.exec(`CREATE TABLE release_files(path TEXT PRIMARY KEY, blob TEXT NOT NULL, domain TEXT NOT NULL, sha256 TEXT, content TEXT) STRICT;
    CREATE TABLE release_domains(name TEXT PRIMARY KEY, files INTEGER NOT NULL) STRICT;
    CREATE TABLE release_links(source TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(source,target,kind)) STRICT;
    CREATE INDEX release_files_domain ON release_files(domain);`);
  const insert = db.prepare("INSERT INTO release_files VALUES(?,?,?,?,CAST(? AS TEXT))");
  const paths = [...tree.files.keys()].sort();
  let readable = 0;
  let excludedInvalidUtf8Files = 0;
  const progress = (stage: string, files: number) => {
    if (process.env.BUN_DEBUG_RELEASE_GRAPH === "1")
      console.error(
        JSON.stringify({ stage, files, total: paths.length, source: tree.sha, memory: process.memoryUsage() }),
      );
  };
  if (hasCatalog) {
    ({ readable, excludedInvalidUtf8Files } = await verifyReleaseCatalog(db, tree, snapshot));
    db.transaction(() => db.exec("DELETE FROM release_domains; DELETE FROM release_links"))();
  } else {
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
          insert.run(path, tree.files.get(path)!, sourceDomain(path), sha256, content === null ? null : bytes!);
          if (content !== null) readable++;
        }
      })();
      if (start % 1024 === 0) progress("catalog", Math.min(start + batch.length, paths.length));
      await Bun.sleep(0);
    }
  }
  db.exec("INSERT INTO release_domains SELECT domain,count(*) FROM release_files GROUP BY domain");
  const available = new Set(paths);
  writeRelativeReferences(db, available);
  progress("native-index", paths.length);
  const native = await indexDetachedRelease(registry, snapshot, tree.sha, out);
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
