import { Database } from "bun:sqlite";
import { RedisClient } from "bun";
import { mkdir, readFile, writeFile, readdir, lstat, realpath, rm } from "node:fs/promises";
import path from "node:path";

const dbPath = "C:/SSH/omar/server/var/index/omar.sqlite";
const redisConfigPath = "C:/Users/omara/.aphrody/private/omar-redis/client.json";
const artifactRoot = "C:/SSH/omar/server/var/cache-warm";
const allowlist = [
  "ntfs_volumes", "ntfs_entries", "ntfs_entry_edges", "ntfs_paths", "ntfs_journal_state",
  "pe_artifacts", "pe_import_edges", "pe_ntfs_coverage", "omar_resources",
  "nodes", "edges", "repositories", "graph_snapshots",
] as const;
const chunkRows = 5_000;
const publishConcurrency = 8;
const ttlSeconds = 3_600;
const maxRedisBytes = 512 * 1024 * 1024;
const prefix = "omar:metadata";
const reusableForMs = 15 * 60 * 1_000;

type Row = Record<string, unknown>;
type TableStats = { rows: number; chunks: number; compressedBytes: number };

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/redis:\/\/[^\s"']+/gi, "redis://[redacted]").slice(0, 500);
}

export async function latestReusableManifest(): Promise<Record<string, unknown> | null> {
  try {
    const latest = JSON.parse(await readFile(path.join(artifactRoot, "latest.json"), "utf8")) as Record<string, unknown>;
    if (latest.complete !== true || latest.publish !== "complete" || typeof latest.generation !== "string") return null;
    const publishedAt = Date.parse(String(latest.publishedAt ?? ""));
    if (!Number.isFinite(publishedAt) || Date.now() - publishedAt > reusableForMs) return null;
    const config = JSON.parse(await readFile(redisConfigPath, "utf8")) as { url?: string };
    if (!config.url) return null;
    const client = new RedisClient(config.url);
    try {
      const value = await client.get(`${prefix}:manifest`);
      if (typeof value !== "string") return null;
      const remote = JSON.parse(value) as Record<string, unknown>;
      return remote.generation === latest.generation && remote.complete === true && remote.publish === "complete"
        ? latest
        : null;
    } finally { client.close(); }
  } catch { return null; }
}

function asJsonRow(row: Row): string {
  return JSON.stringify(row, (_key, value) => typeof value === "bigint" ? value.toString() : value);
}

export async function warmCache(): Promise<Record<string, unknown>> {
  const generationId = new Bun.CryptoHasher("sha256").update(`${Date.now()}-${Math.random()}-${performance.now()}`).digest("hex").slice(0, 24);
  const generation = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${generationId}`;
  const generationDir = path.join(artifactRoot, generation);
  await mkdir(generationDir, { recursive: true });
  const checkpointDb = new Database(dbPath, { strict: true });
  checkpointDb.exec("PRAGMA busy_timeout=30000;");
  const checkpoint = checkpointDb.query<{ busy: number; log: number; checkpointed: number }, []>("PRAGMA wal_checkpoint(PASSIVE)").get();
  checkpointDb.close();
  const db = new Database(dbPath, { readonly: true, strict: true });
  let redis: RedisClient | undefined;
  let snapshotOpened = false;
  const manifest: Record<string, unknown> = {
    generation, startedAt: new Date().toISOString(), ttlSeconds,
    database: dbPath, databaseSnapshot: "sqlite read transaction; rowid keyset pages",
    databaseCheckpoint: checkpoint, tables: {},
  };
  try {
    db.exec("PRAGMA busy_timeout=30000; PRAGMA query_only=ON;");
    db.exec("BEGIN;");
    snapshotOpened = true;
    const available = new Set(db.query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    ).all().map(x => x.name));
    const selected = allowlist.filter(name => available.has(name));
    const tableStats: Record<string, TableStats> = {};
    let compressedTotal = 0;
    for (const table of selected) {
      const quoted = `"${table}"`;
      const schema = db.query<{ sql: string | null }, []>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
      ).get(table)?.sql ?? "";
      if (/WITHOUT\s+ROWID/i.test(schema)) throw new Error(`allowlisted table lacks rowid: ${table}`);
      const maxRowid = Number(db.query<{ n: number }, []>(`SELECT COALESCE(MAX(rowid),0) AS n FROM ${quoted}`).get()?.n ?? 0);
      let last = 0;
      let rows = 0;
      let chunks = 0;
      let compressedBytes = 0;
      const stmt = db.query<Row, [number, number, number]>(
        `SELECT rowid AS __cache_rowid, * FROM ${quoted} WHERE rowid>? AND rowid<=? ORDER BY rowid LIMIT ?`,
      );
      while (last < maxRowid) {
        const batch = stmt.all(last, maxRowid, chunkRows);
        if (!batch.length) break;
        last = Number(batch[batch.length - 1].__cache_rowid);
        const packed = Bun.gzipSync(Buffer.from(batch.map(asJsonRow).join("\n"), "utf8"), { level: 6 });
        const chunkPath = path.join(generationDir, `${table}-${String(chunks).padStart(6, "0")}.jsonl.gz`);
        await writeFile(chunkPath, packed, { flag: "wx" });
        rows += batch.length;
        chunks++;
        compressedBytes += packed.byteLength;
        compressedTotal += packed.byteLength;
      }
      tableStats[table] = { rows, chunks, compressedBytes };
    }
    const missingTables = allowlist.filter(name => !available.has(name));
    const journalState = available.has("ntfs_journal_state")
      ? db.query<Row, []>("SELECT volume_id, journal_id, next_usn, updated_at, status FROM ntfs_journal_state ORDER BY volume_id").all()
      : [];
    db.exec("COMMIT;");
    snapshotOpened = false;
    manifest.tables = tableStats;
    manifest.missingTables = missingTables;
    manifest.totalRows = Object.values(tableStats).reduce((sum, x) => sum + x.rows, 0);
    manifest.totalChunks = Object.values(tableStats).reduce((sum, x) => sum + x.chunks, 0);
    manifest.compressedBytes = compressedTotal;
    manifest.complete = missingTables.length === 0;
    manifest.snapshotFinishedAt = new Date().toISOString();
    manifest.journalCheckpoint = journalState;

    const config = JSON.parse(await readFile(redisConfigPath, "utf8")) as { url?: string };
    if (!config.url) throw new Error("private Redis client config has no URL");
    redis = new RedisClient(config.url);
    const infoBefore = String(await redis.send("INFO", ["all"]));
    const statsBefore = parseRedisInfo(infoBefore);
    manifest.redisBefore = { usedMemory: statsBefore.usedMemory, maxMemory: statsBefore.maxMemory, evictedKeys: statsBefore.evictedKeys };
    if (statsBefore.maxMemory !== maxRedisBytes) throw new Error(`Redis maxmemory is ${statsBefore.maxMemory}, expected ${maxRedisBytes}`);
    // Redis stores base64 strings; 45% reserves that expansion plus object/key overhead.
    const projected = statsBefore.usedMemory + Math.ceil(compressedTotal * 1.5);
    if (projected > statsBefore.maxMemory) {
      manifest.complete = false;
      manifest.publish = "aborted: compressed snapshot plus overhead exceeds Redis maxmemory";
      manifest.projectedRedisBytes = projected;
      await writeFile(path.join(generationDir, "manifest.json"), JSON.stringify(manifest, null, 2));
      return manifest;
    }

    const writes: Array<{ key: string; file: string }> = [];
    for (const table of selected) {
      const { chunks } = tableStats[table];
      for (let i = 0; i < chunks; i++) writes.push({
        key: `${prefix}:${generation}:${table}:${i}`,
        file: path.join(generationDir, `${table}-${String(i).padStart(6, "0")}.jsonl.gz`),
      });
    }
    for (let i = 0; i < writes.length; i += publishConcurrency) {
      const group = writes.slice(i, i + publishConcurrency);
      await Promise.all(group.map(async item => {
        const value = (await readFile(item.file)).toString("base64");
        await redis!.send("SET", [item.key, value, "EX", String(ttlSeconds)]);
      }));
    }

    // Confirm every staged key exists and has a live TTL before making the manifest visible.
    let missingPublished = 0;
    for (let i = 0; i < writes.length; i += publishConcurrency) {
      const group = writes.slice(i, i + publishConcurrency);
      const exists = await Promise.all(group.map(item => redis!.send("EXISTS", [item.key])));
      missingPublished += exists.filter(value => Number(value) !== 1).length;
    }
    if (missingPublished) throw new Error(`Redis verification found ${missingPublished} missing chunks`);

    // Read back and decompress one chunk per table before making the manifest visible.
    const verified: Record<string, number> = {};
    for (const table of selected) {
      if (tableStats[table].chunks === 0) { verified[table] = 0; continue; }
      const key = `${prefix}:${generation}:${table}:0`;
      const encoded = await redis.get(key);
      if (typeof encoded !== "string") throw new Error(`Redis verification missing chunk for ${table}`);
      const decoded = new TextDecoder().decode(Bun.gunzipSync(Buffer.from(encoded, "base64")));
      verified[table] = decoded ? decoded.split("\n").length : 0;
    }
    manifest.verifiedFirstChunkRows = verified;
    manifest.publish = "complete";
    manifest.publishedAt = new Date().toISOString();
    const infoAfter = String(await redis.send("INFO", ["all"]));
    const statsAfter = parseRedisInfo(infoAfter);
    manifest.redisAfter = { usedMemory: statsAfter.usedMemory, maxMemory: statsAfter.maxMemory, evictedKeys: statsAfter.evictedKeys };
    if (statsAfter.evictedKeys !== statsBefore.evictedKeys) {
      manifest.complete = false;
      manifest.publish = "incomplete: Redis evicted keys during publication";
    }
    const manifestJson = JSON.stringify(manifest);
    await redis.send("SET", [`${prefix}:manifest`, manifestJson, "EX", String(ttlSeconds)]);
    const localManifest = JSON.stringify(manifest, null, 2);
    await writeFile(path.join(generationDir, "manifest.json"), localManifest, { flag: "wx" });
    await writeFile(path.join(artifactRoot, "latest.json"), localManifest);
    await pruneOldGenerations(generationDir);
    return manifest;
  } finally {
    if (snapshotOpened) {
      try { db.exec("ROLLBACK;"); } catch { /* preserve original failure */ }
    }
    db.close();
    redis?.close();
  }
}

async function pruneOldGenerations(currentDir: string): Promise<void> {
  const root = path.resolve(artifactRoot);
  const current = path.resolve(currentDir);
  if (!current.startsWith(`${root}${path.sep}`)) throw new Error("generation directory escaped artifact root");
  const entries = await readdir(root, { withFileTypes: true });
  const generations: Array<{ path: string; name: string; mtime: number }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === path.basename(currentDir)) continue;
    const target = path.resolve(root, entry.name);
    if (!target.startsWith(`${root}${path.sep}`)) continue;
    const info = await lstat(target);
    if (!info.isDirectory() || info.isSymbolicLink()) continue;
    try {
      const resolved = await realpath(target);
      if (!resolved.startsWith(`${root}${path.sep}`)) continue;
      const manifestFile = Bun.file(path.join(target, "manifest.json"));
      if (!(await manifestFile.exists())) continue;
      const oldManifest = await manifestFile.json() as { complete?: boolean; publish?: string };
      if (oldManifest.complete !== true || oldManifest.publish !== "complete") continue;
      generations.push({ path: target, name: entry.name, mtime: info.mtimeMs });
    } catch { /* skip changed or inaccessible entries */ }
  }
  generations.sort((a, b) => b.mtime - a.mtime);
  for (const old of generations.slice(1)) {
    const target = path.resolve(old.path);
    if (!target.startsWith(`${root}${path.sep}`) || target === current) continue;
    await rm(target, { recursive: true, force: false });
  }
}

function parseRedisInfo(info: string): { usedMemory: number; maxMemory: number; evictedKeys: number } {
  const get = (key: string) => Number(info.match(new RegExp(`^${key}:(\\d+)`, "m"))?.[1] ?? 0);
  return { usedMemory: get("used_memory"), maxMemory: get("maxmemory"), evictedKeys: get("evicted_keys") };
}

if (import.meta.main) {
  try {
    const result = await warmCache();
    console.log(JSON.stringify({
      generation: result.generation, complete: result.complete,
      totalRows: result.totalRows, totalChunks: result.totalChunks,
      compressedBytes: result.compressedBytes, missingTables: result.missingTables,
      publish: result.publish, redisBefore: result.redisBefore, redisAfter: result.redisAfter,
    }));
    if (result.complete !== true) process.exitCode = 2;
  } catch (error) {
    console.error(JSON.stringify({ error: safeError(error) }));
    process.exitCode = 1;
  }
}
