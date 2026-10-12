import { Database } from "bun:sqlite";
import { prepareDatabase, positiveInteger } from "./common";

export interface IndexedResource {
  id: string;
  kind: string;
  name: string;
  canonicalPath?: string;
  metadata?: Record<string, unknown>;
}

/** Stores caller-selected resource metadata; never discovers services, profiles or personal repositories. */
export async function persistResources(dbPath: string, resources: IndexedResource[], maxResources = 10_000) {
  positiveInteger("maxResources", maxResources);
  if (resources.length > maxResources) throw new RangeError("Resources exceed maxResources");
  const ids = new Set<string>();
  const rows = resources.map(resource => {
    if (
      ![resource.id, resource.kind, resource.name].every(
        value => typeof value === "string" && value.length > 0 && value.length <= 1_024,
      )
    )
      throw new TypeError("Resource id, kind and name must be nonempty bounded strings");
    if (ids.has(resource.id)) throw new TypeError("Resource ids must be unique");
    ids.add(resource.id);
    const metadata = JSON.stringify(resource.metadata ?? {}, (_key, value) =>
      typeof value === "bigint" ? String(value) : value,
    );
    if (Buffer.byteLength(metadata) > 1 << 20) throw new RangeError("Resource metadata exceeds 1 MiB");
    return { ...resource, metadata };
  });
  await prepareDatabase(dbPath);
  using db = new Database(dbPath, { create: true, strict: true });
  db.exec(`PRAGMA busy_timeout=30000;
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,canonical_path TEXT,
      metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),updated_at TEXT NOT NULL
    ) STRICT`);
  const put = db.query(`INSERT INTO resources VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    kind=excluded.kind,name=excluded.name,canonical_path=excluded.canonical_path,
    metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`);
  const at = new Date().toISOString();
  db.transaction(() => {
    for (const row of rows) put.run(row.id, row.kind, row.name, row.canonicalPath ?? null, row.metadata, at);
  }).immediate();
  return { resources: rows.length, updatedAt: at };
}
