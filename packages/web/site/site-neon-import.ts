import { Database } from "bun:sqlite";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { parseFrontmatter } from "./mdx";
import { publicSourcePath, validatePublicSiteSnapshot, type PublicSiteSnapshot } from "./public-site-snapshot";

const sha256 = (body: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(body).digest("hex");
async function hashFile(path: string) {
  const hasher = new Bun.CryptoHasher("sha256");
  const file = await open(path, "r");
  try {
    const buffer = new Uint8Array(1024 * 1024);
    while (true) {
      const { bytesRead } = await file.read(buffer);
      if (!bytesRead) break;
      hasher.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await file.close();
  }
  return hasher.digest("hex");
}
export async function readPublicSiteSnapshot(directory: string, manifestSHA256: string): Promise<PublicSiteSnapshot> {
  if (!isAbsolute(directory) || !/^[a-f0-9]{64}$/.test(manifestSHA256))
    throw new TypeError("Explicit public release directory and manifest SHA256 required");
  const root = await realpath(directory);
  async function member(name: string, hash: string, limit: number) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new TypeError("Public artifact hash is required");
    const path = join(root, name),
      info = await lstat(path),
      canonical = await realpath(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      relative(root, canonical).startsWith("..") ||
      info.size > limit ||
      (await hashFile(path)) !== hash
    )
      throw new Error("Public source artifact differs from its manifest");
    return path;
  }
  const manifest = await Bun.file(await member("manifest.json", manifestSHA256, 16 * 1024 * 1024)).json();
  if (
    manifest.schema !== 1 ||
    manifest.releaseRepository !== "aphrody-labs/bun" ||
    !/^[a-f0-9]{40}$/.test(manifest.source)
  )
    throw new Error("Public site importer requires the Bun release manifest");
  const databasePath = await member("monorepo.sqlite", manifest.artifacts["monorepo.sqlite"], 4 * 1024 * 1024 * 1024);
  const db = new Database(databasePath, { readonly: true });
  try {
    const documents: PublicSiteSnapshot["documents"] = [];
    for (const row of db
      .query<{ path: string; content: string; sha256: string }, []>(
        "SELECT path,content,sha256 FROM release_files WHERE content IS NOT NULL AND path LIKE 'docs/%' AND (path LIKE '%.md' OR path LIKE '%.mdx') ORDER BY path LIMIT 10001",
      )
      .iterate()) {
      if (!publicSourcePath(row.path)) continue;
      if (sha256(row.content) !== row.sha256 || Buffer.byteLength(row.content) > 3 * 1024 * 1024)
        throw new Error("Public documentation hash or byte budget differs");
      const parsed = parseFrontmatter(row.content),
        bytes = new TextEncoder().encode(parsed.body);
      const chunks: PublicSiteSnapshot["documents"][number]["chunks"] = [];
      for (let start = 0; start < bytes.length;) {
        let end = Math.min(start + 12000, bytes.length);
        while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
        const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start, end));
        chunks.push({ ordinal: chunks.length, body, sha256: sha256(body) });
        start = end;
      }
      documents.push({
        path: row.path,
        title: String(parsed.data.title ?? parsed.data.sidebarTitle ?? row.path),
        description: String(parsed.data.description ?? ""),
        sha256: row.sha256,
        chunks,
      });
    }
    const domains = db
      .query<{ name: string; files: number }, []>("SELECT name,files FROM release_domains ORDER BY name LIMIT 10001")
      .all()
      .filter(row => publicSourcePath(row.name));
    const domainNames = new Set(domains.map(row => row.name));
    const links = db
      .query<PublicSiteSnapshot["links"][number], []>(
        `SELECT a.domain AS source,b.domain AS target,count(*) AS references_count FROM release_links l
     JOIN release_files a ON a.path=l.source JOIN release_files b ON b.path=l.target
     WHERE a.domain<>b.domain GROUP BY a.domain,b.domain ORDER BY a.domain,b.domain LIMIT 100001`,
      )
      .all()
      .filter(row => domainNames.has(row.source) && domainNames.has(row.target));
    const releases = await Bun.file(
      await member("releases.json", manifest.artifacts["releases.json"], 16 * 1024 * 1024),
    ).json();
    const snapshot: PublicSiteSnapshot = {
      schema: 1,
      profile: "bun",
      repository: "aphrody-labs/bun",
      source: manifest.source,
      sourceDate: manifest.generatedAt,
      manifestSHA256,
      documents,
      domains,
      links,
      releases: releases.map((row: PublicSiteSnapshot["releases"][number]) => ({
        tag: row.tag,
        name: row.name,
        url: row.url,
        publishedAt: row.publishedAt,
        prerelease: row.prerelease,
        assets: row.assets.map(asset => ({ name: asset.name, url: asset.url, size: asset.size })),
      })),
    };
    validatePublicSiteSnapshot(snapshot);
    if ((await hashFile(databasePath)) !== manifest.artifacts["monorepo.sqlite"])
      throw new Error("Public SQLite changed during its read");
    return snapshot;
  } finally {
    db.close(true);
  }
}

type PublisherSQL = {
  unsafe<T = unknown>(text: string, parameters?: readonly unknown[]): PromiseLike<T>;
  begin<T>(callback: (sql: PublisherSQL) => Promise<T>): Promise<T>;
};
export async function publishPublicSiteSnapshot(sql: PublisherSQL, snapshot: PublicSiteSnapshot) {
  validatePublicSiteSnapshot(snapshot);
  for (const doc of snapshot.documents)
    for (const chunk of doc.chunks)
      if (sha256(chunk.body) !== chunk.sha256) throw new Error("Public documentation chunk hash differs");
  const id = sha256(JSON.stringify(snapshot));
  const chunks = snapshot.documents.flatMap(doc => doc.chunks.map(chunk => ({ path: doc.path, ...chunk })));
  const counts = {
    documents: snapshot.documents.length,
    chunks: chunks.length,
    domains: snapshot.domains.length,
    links: snapshot.links.length,
    releases: snapshot.releases.length,
  };
  await sql.begin(async tx => {
    await tx.unsafe("SELECT pg_advisory_xact_lock(hashtext('aphrody_site:bun'))");
    const current = await tx.unsafe<{ source_date: string; id: string }[]>(
      "SELECT s.source_date,s.id FROM aphrody_site.current_snapshots c JOIN aphrody_site.snapshots s ON s.id=c.snapshot_id WHERE c.profile='bun' FOR UPDATE OF c",
    );
    if (current[0] && Date.parse(String(current[0].source_date)) > Date.parse(snapshot.sourceDate))
      throw new Error("Public site refuses a source older than its current snapshot");
    await tx.unsafe(
      `INSERT INTO aphrody_site.snapshots(id,profile,repository,source_sha,source_date,manifest_sha256,counts)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (id) DO NOTHING`,
      [
        id,
        snapshot.profile,
        snapshot.repository,
        snapshot.source,
        snapshot.sourceDate,
        snapshot.manifestSHA256,
        JSON.stringify(counts),
      ],
    );
    async function batch(table: string, columns: string, declaration: string, records: unknown[]) {
      for (let start = 0; start < records.length; start += 200)
        await tx.unsafe(
          `INSERT INTO aphrody_site.${table} SELECT $1,${columns} FROM jsonb_to_recordset($2::jsonb) AS row(${declaration}) ON CONFLICT DO NOTHING`,
          [id, JSON.stringify(records.slice(start, start + 200))],
        );
    }
    await batch(
      "documents",
      "path,title,description,sha256",
      "path text,title text,description text,sha256 text",
      snapshot.documents.map(({ path, title, description, sha256 }) => ({ path, title, description, sha256 })),
    );
    await batch(
      "doc_chunks(snapshot_id,path,ordinal,body,sha256)",
      "path,ordinal,body,sha256",
      "path text,ordinal integer,body text,sha256 text",
      chunks,
    );
    await batch("graph_domains", "name,files", "name text,files integer", snapshot.domains);
    await batch(
      "graph_links",
      "source,target,references_count",
      "source text,target text,references_count integer",
      snapshot.links,
    );
    await batch(
      "release_facts",
      "tag,facts",
      "tag text,facts jsonb",
      snapshot.releases.map(facts => ({ tag: facts.tag, facts })),
    );
    await tx.unsafe(
      "INSERT INTO aphrody_site.current_snapshots(profile,snapshot_id) VALUES ('bun',$1) ON CONFLICT (profile) DO UPDATE SET snapshot_id=EXCLUDED.snapshot_id",
      [id],
    );
    await tx.unsafe("DELETE FROM aphrody_site.snapshots WHERE profile='bun' AND id<>$1", [id]);
  });
  return { id, source: snapshot.source, counts };
}
