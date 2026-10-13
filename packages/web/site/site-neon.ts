export interface SiteQuery {
  query<T extends Record<string, unknown>>(text: string, parameters?: readonly unknown[]): Promise<T[]>;
}
export type SiteSnapshotInfo = {
  id: string;
  profile: "bun";
  repository: "aphrody-labs/bun";
  source: string;
  sourceDate: string;
  importedAt: string;
  counts: Record<string, number>;
};
export type SiteDocumentHit = {
  path: string;
  title: string;
  description: string;
  sha256: string;
  score: number;
  url: string;
  chunks: { ordinal: number; body: string; sha256: string }[];
};
export async function getPublicSiteSnapshot(sql: SiteQuery, id?: string): Promise<SiteSnapshotInfo | null> {
  if (id !== undefined && !/^[a-f0-9]{64}$/.test(id)) throw new TypeError("Invalid public snapshot identifier");
  const rows = await sql.query<SiteSnapshotInfo & Record<string, unknown>>(
    `SELECT s.id,s.profile,s.repository,s.source_sha AS source,s.source_date::text AS "sourceDate",s.imported_at::text AS "importedAt",s.counts
     FROM aphrody_site.snapshots s WHERE s.profile='bun' AND s.id=COALESCE($1,(SELECT snapshot_id FROM aphrody_site.current_snapshots WHERE profile='bun'))`,
    [id ?? null],
  );
  return rows[0] ?? null;
}
export async function searchPublicSiteDocs(
  sql: SiteQuery,
  options: { query: string; limit?: number; snapshotId?: string },
) {
  const query = options.query.trim(),
    limit = options.limit ?? 8;
  if (!query || query.length > 500 || !Number.isInteger(limit) || limit < 1 || limit > 8)
    throw new TypeError("Invalid public documentation query");
  const snapshot = await getPublicSiteSnapshot(sql, options.snapshotId);
  if (!snapshot) return { snapshot, documents: [] as SiteDocumentHit[] };
  const rows = await sql.query<
    {
      path: string;
      title: string;
      description: string;
      sha256: string;
      score: number;
      chunks: SiteDocumentHit["chunks"];
    } & Record<string, unknown>
  >(
    `WITH ranked AS (
       SELECT c.path,c.ordinal,c.body,c.sha256,ts_rank_cd(c.search,websearch_to_tsquery('simple',$2)) AS score,
         row_number() OVER (PARTITION BY c.path ORDER BY ts_rank_cd(c.search,websearch_to_tsquery('simple',$2)) DESC,c.ordinal) AS position
       FROM aphrody_site.doc_chunks c WHERE c.snapshot_id=$1 AND c.search @@ websearch_to_tsquery('simple',$2)
     ), hits AS (SELECT path,max(score) AS score,jsonb_agg(jsonb_build_object('ordinal',ordinal,'body',body,'sha256',sha256) ORDER BY score DESC,ordinal) AS chunks
       FROM ranked WHERE position<=2 GROUP BY path)
     SELECT d.path,d.title,d.description,d.sha256,h.score,h.chunks FROM hits h JOIN aphrody_site.documents d ON d.snapshot_id=$1 AND d.path=h.path
     ORDER BY h.score DESC,d.path LIMIT $3`,
    [snapshot.id, query, limit],
  );
  return {
    snapshot,
    documents: rows.map(row => ({
      ...row,
      url: `https://github.com/${snapshot.repository}/blob/${snapshot.source}/${row.path}`,
    })) as SiteDocumentHit[],
  };
}
export async function getPublicSiteDocument(sql: SiteQuery, path: string, snapshotId?: string) {
  if (!/^docs\/[A-Za-z0-9_./-]+\.mdx?$/.test(path) || path.split("/").some(part => part.startsWith(".")))
    throw new TypeError("Invalid public documentation path");
  const snapshot = await getPublicSiteSnapshot(sql, snapshotId);
  if (!snapshot) return { snapshot, document: null };
  const rows = await sql.query<SiteDocumentHit & Record<string, unknown>>(
    `SELECT d.path,d.title,d.description,d.sha256,0 AS score,COALESCE(jsonb_agg(jsonb_build_object('ordinal',c.ordinal,'body',c.body,'sha256',c.sha256) ORDER BY c.ordinal),'[]') AS chunks
     FROM aphrody_site.documents d LEFT JOIN aphrody_site.doc_chunks c ON c.snapshot_id=d.snapshot_id AND c.path=d.path
     WHERE d.snapshot_id=$1 AND d.path=$2 GROUP BY d.snapshot_id,d.path`,
    [snapshot.id, path],
  );
  const row = rows[0];
  return {
    snapshot,
    document: row
      ? { ...row, url: `https://github.com/${snapshot.repository}/blob/${snapshot.source}/${row.path}` }
      : null,
  };
}
export async function getPublicSiteGraph(
  sql: SiteQuery,
  options: { domain?: string; limit?: number; snapshotId?: string } = {},
) {
  const limit = options.limit ?? 100;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (options.domain !== undefined && !/^(?:src|packages|docs|scripts)(?:\/[\w.-]+)*$/.test(options.domain))
  )
    throw new TypeError("Invalid public graph query");
  const snapshot = await getPublicSiteSnapshot(sql, options.snapshotId);
  if (!snapshot) return { snapshot, domains: [], links: [] };
  const domains = await sql.query(
    `SELECT name,files FROM aphrody_site.graph_domains WHERE snapshot_id=$1 AND ($2::text IS NULL OR name=$2) ORDER BY name LIMIT $3`,
    [snapshot.id, options.domain ?? null, limit],
  );
  const links = await sql.query(
    `SELECT source,target,references_count FROM aphrody_site.graph_links WHERE snapshot_id=$1 AND ($2::text IS NULL OR source=$2 OR target=$2) ORDER BY references_count DESC,source,target LIMIT $3`,
    [snapshot.id, options.domain ?? null, limit],
  );
  return { snapshot, domains, links };
}
export async function getPublicSiteReleases(sql: SiteQuery, snapshotId?: string) {
  const snapshot = await getPublicSiteSnapshot(sql, snapshotId);
  return {
    snapshot,
    releases: snapshot
      ? await sql.query("SELECT facts FROM aphrody_site.release_facts WHERE snapshot_id=$1 ORDER BY tag LIMIT 100", [
          snapshot.id,
        ])
      : [],
  };
}
