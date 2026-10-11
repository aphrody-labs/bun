import { Database } from "bun:sqlite";
import { RedisClient } from "bun";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { absolutePath, positiveInteger, within } from "./common";

export interface MetadataRedis {
  send(command: string, args: string[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  close(): void;
}
export interface MetadataCacheOptions {
  dbPath: string;
  artifactRoot: string;
  redisUrl: string;
  tables: string[];
  namespace: string;
  chunkRows?: number;
  ttlSeconds?: number;
  publishConcurrency?: number;
  maxCompressedBytes?: number;
  maxRowBytes?: number;
  maxRows?: number;
  maxChunks?: number;
  maxRedisBytes?: number;
  createRedis?: (url: string) => MetadataRedis;
}

interface CacheChunk {
  table: string;
  key: string;
  file: string;
  rows: number;
  sha256: string;
  bytes: number;
}
function redisStats(value: unknown) {
  const text = String(value);
  const field = (name: string): number => {
    const match = new RegExp(`^${name}:(\\d+)\\r?$`, "m").exec(text);
    if (!match || !Number.isSafeInteger(Number(match[1])))
      throw new Error(`Redis INFO missing ${name}`);
    return Number(match[1]);
  };
  return {
    usedMemory: field("used_memory"),
    maxMemory: field("maxmemory"),
    evictedKeys: field("evicted_keys"),
  };
}

/** Publishes explicit SQLite metadata tables using a consistent read snapshot and a verified generation manifest. */
export async function publishMetadataCache(options: MetadataCacheOptions) {
  absolutePath("dbPath", options.dbPath);
  absolutePath("artifactRoot", options.artifactRoot);
  if (!options.redisUrl) throw new TypeError("redisUrl is required");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/.test(options.namespace))
    throw new TypeError("Invalid cache namespace");
  if (
    !options.tables.length ||
    options.tables.length > 256 ||
    new Set(options.tables).size !== options.tables.length ||
    options.tables.some((table) => !/^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/.test(table))
  )
    throw new TypeError("tables must be a nonempty unique list of plain SQLite table names");
  const chunkRows = positiveInteger("chunkRows", options.chunkRows ?? 5_000, 100_000);
  const ttlSeconds = positiveInteger("ttlSeconds", options.ttlSeconds ?? 3_600, 31_536_000);
  const concurrency = positiveInteger("publishConcurrency", options.publishConcurrency ?? 8, 64);
  const maxBytes = positiveInteger("maxCompressedBytes", options.maxCompressedBytes ?? 128 << 20);
  const maxRowBytes = positiveInteger("maxRowBytes", options.maxRowBytes ?? 4 << 20);
  const maxRows = positiveInteger("maxRows", options.maxRows ?? 5_000_000);
  const maxChunks = positiveInteger("maxChunks", options.maxChunks ?? 10_000, 100_000);
  const redisBudget = positiveInteger("maxRedisBytes", options.maxRedisBytes ?? 512 << 20);
  await mkdir(options.artifactRoot, { recursive: true });
  const root = await realpath(options.artifactRoot);
  const generation = crypto.randomUUID();
  const generationDir = join(root, generation);
  await mkdir(generationDir, { recursive: false });
  if (!within(root, await realpath(generationDir)))
    throw new Error("Cache generation escaped artifactRoot");
  using db = new Database(options.dbPath, { readonly: true, strict: true, safeIntegers: true });
  let redis: MetadataRedis | undefined;
  let snapshot = false;
  let totalRows = 0;
  let compressedBytes = 0;
  const chunks: CacheChunk[] = [];
  try {
    db.exec("PRAGMA busy_timeout=30000; PRAGMA query_only=ON; BEGIN;");
    snapshot = true;
    for (const table of options.tables) {
      const schema = db
        .query<{ sql: string }, [string]>(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
        )
        .get(table);
      if (!schema) throw new Error(`Metadata table missing: ${table}`);
      if (/WITHOUT\s+ROWID/i.test(schema.sql))
        throw new Error(`Metadata table has no rowid: ${table}`);
      const columns = db.query<{ name: string }, []>(`PRAGMA table_info("${table}")`).all();
      if (
        columns.some((column) =>
          ["rowid", "_rowid_", "oid", "__cache_rowid"].includes(column.name.toLowerCase()),
        )
      )
        throw new Error(`Metadata table shadows rowid: ${table}`);
      const statement = db.query<Record<string, unknown>, [bigint, number]>(
        `SELECT rowid AS __cache_rowid,* FROM "${table}" WHERE rowid>=? ORDER BY rowid LIMIT ?`,
      );
      let last = -(1n << 63n);
      for (;;) {
        const rows = statement.all(last, chunkRows);
        if (!rows.length) break;
        const finalRowid = BigInt(rows.at(-1)!.__cache_rowid as bigint);
        last = finalRowid + 1n;
        totalRows += rows.length;
        if (totalRows > maxRows) throw new RangeError("Metadata cache exceeds maxRows");
        const lines = rows.map((row) => {
          const { __cache_rowid: _rowid, ...fields } = row;
          const line = JSON.stringify(fields, (_key, value) =>
            typeof value === "bigint" ? String(value) : value,
          );
          if (Buffer.byteLength(line) > maxRowBytes)
            throw new RangeError("Metadata row exceeds maxRowBytes");
          return line;
        });
        const bytes = Bun.gzipSync(Buffer.from(lines.join("\n")), { level: 6 });
        if (chunks.length >= maxChunks) throw new RangeError("Metadata cache exceeds maxChunks");
        compressedBytes += bytes.length;
        if (compressedBytes > maxBytes)
          throw new RangeError("Metadata cache exceeds maxCompressedBytes");
        const file = join(generationDir, `${table}-${chunks.length}.jsonl.gz`);
        await Bun.write(file, bytes);
        chunks.push({
          table,
          file,
          key: `${options.namespace}:${generation}:${chunks.length}`,
          rows: rows.length,
          sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
          bytes: bytes.length,
        });
        if (finalRowid === (1n << 63n) - 1n) break;
      }
    }
    db.exec("COMMIT;");
    snapshot = false;
    redis = options.createRedis
      ? options.createRedis(options.redisUrl)
      : new RedisClient(options.redisUrl, { autoReconnect: false });
    const before = redisStats(await redis.send("INFO", ["all"]));
    const capacity = before.maxMemory ? Math.min(before.maxMemory, redisBudget) : redisBudget;
    if (before.usedMemory + Math.ceil(compressedBytes * 1.5) + chunks.length * 512 > capacity)
      throw new RangeError("Metadata generation exceeds Redis memory budget");
    for (let index = 0; index < chunks.length; index += concurrency) {
      await Promise.all(
        chunks.slice(index, index + concurrency).map(async (chunk) => {
          const bytes = await Bun.file(chunk.file).bytes();
          await redis!.send("SET", [
            chunk.key,
            Buffer.from(bytes).toString("base64"),
            "EX",
            String(ttlSeconds),
          ]);
        }),
      );
    }
    let verifiedTtl = ttlSeconds;
    for (let index = 0; index < chunks.length; index += concurrency) {
      await Promise.all(
        chunks.slice(index, index + concurrency).map(async (chunk) => {
          const [value, ttl] = await Promise.all([
            redis!.get(chunk.key),
            redis!.send("TTL", [chunk.key]),
          ]);
          if (value === null || Number(ttl) <= 0)
            throw new Error("Metadata chunk missing or expired");
          verifiedTtl = Math.min(verifiedTtl, Number(ttl));
          const bytes = Buffer.from(value, "base64");
          if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== chunk.sha256)
            throw new Error("Metadata chunk readback differs from snapshot");
          const decoded = new TextDecoder().decode(Bun.gunzipSync(bytes));
          if (decoded.split("\n").length !== chunk.rows)
            throw new Error("Metadata chunk row count differs from snapshot");
        }),
      );
    }
    const after = redisStats(await redis.send("INFO", ["all"]));
    if (after.evictedKeys !== before.evictedKeys)
      throw new Error("Redis evicted keys during metadata publication");
    const manifestTtl = chunks.length ? verifiedTtl - 1 : ttlSeconds;
    if (manifestTtl < 1)
      throw new Error("Metadata chunks expire before a manifest can be published");
    const manifest = {
      generation,
      namespace: options.namespace,
      complete: true,
      publishedAt: new Date().toISOString(),
      ttlSeconds: manifestTtl,
      totalRows,
      compressedBytes,
      tables: [...options.tables],
      chunks: chunks.map(({ file: _file, ...chunk }) => chunk),
    };
    const manifestJson = JSON.stringify(manifest);
    const manifestKey = `${options.namespace}:manifest`;
    const publish = `for i=2,#KEYS do
      if redis.call('TTL',KEYS[i]) <= tonumber(ARGV[2]) then
        return redis.error_reply('Metadata chunk expires before manifest')
      end
    end
    return redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[2])`;
    await redis.send("EVAL", [
      publish,
      String(chunks.length + 1),
      manifestKey,
      ...chunks.map((chunk) => chunk.key),
      manifestJson,
      String(manifestTtl),
    ]);
    if ((await redis.get(manifestKey)) !== manifestJson)
      throw new Error("Metadata manifest readback failed");
    await Bun.write(join(generationDir, "manifest.json"), manifestJson);
    return manifest;
  } catch (error) {
    throw new Error(
      (error instanceof Error ? error.message : String(error)).replace(
        /rediss?:\/\/[^\s"']+/gi,
        "redis://[redacted]",
      ),
    );
  } finally {
    try {
      if (snapshot) db.exec("ROLLBACK;");
    } finally {
      redis?.close();
    }
  }
}
