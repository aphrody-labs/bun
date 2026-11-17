// Persistent, tiered cache of the mirror.
//   SQLite   always on: page index, crawl journal (resume), key-value cache, full-text search
//   disk     always on: content-addressed blobs, zstd-compressed
//   S3 / R2  optional: the same blobs, shared between machines
//   Postgres optional: the page index, so another machine resumes the same crawl
//   Redis    optional: hot key-value cache and the crawl lock
// A tier that is not configured is absent, never emulated: `tiers()` says which ones are live.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256 } from "./config.ts";

export type PageState = "pending" | "done" | "failed" | "gone";
export interface Page {
  url: string;
  kind: "page" | "asset";
  state: PageState;
  status: number | null;
  etag: string | null;
  last_modified: string | null;
  content_type: string | null;
  hash: string | null;
  bytes: number | null;
  fetched_at: number | null;
  attempts: number;
  error: string | null;
}

export interface StoreOptions {
  dir: string;
  env?: Record<string, string | undefined>;
  /** An S3 client to use instead of the one MIRROR_S3_BUCKET would configure. */
  s3?: Bun.S3Client;
}

const PAGE_COLUMNS = ["url", "kind", "state", "status", "etag", "last_modified", "content_type", "hash", "bytes", "fetched_at", "attempts", "error"] as const;

export class Store {
  readonly dir: string;
  readonly db: Database;
  readonly s3: Bun.S3Client | null;
  readonly pg: Bun.SQL | null;
  readonly redis: Bun.RedisClient | null;
  private readonly prefix: string;

  private constructor(opts: StoreOptions) {
    const env = opts.env ?? Bun.env;
    this.dir = opts.dir;
    mkdirSync(join(this.dir, "blobs"), { recursive: true });
    this.db = new Database(join(this.dir, "mirror.sqlite"), { create: true, strict: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA synchronous = NORMAL");
    this.db.run(`CREATE TABLE IF NOT EXISTS pages (
      url TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'page', state TEXT NOT NULL DEFAULT 'pending', status INTEGER,
      etag TEXT, last_modified TEXT, content_type TEXT, hash TEXT, bytes INTEGER, fetched_at INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0, error TEXT) WITHOUT ROWID`);
    this.db.run("CREATE INDEX IF NOT EXISTS pages_state ON pages (state, kind)");
    this.db.run("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER) WITHOUT ROWID");
    this.db.run("CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, finished_at INTEGER, manifest TEXT, pages INTEGER, bytes INTEGER)");
    this.db.run("CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(url UNINDEXED, title, body, tokenize = 'porter unicode61')");
    this.prefix = env.MIRROR_PREFIX ?? "bun-mirror";
    this.s3 = opts.s3 ?? (env.MIRROR_S3_BUCKET ? new Bun.S3Client({ bucket: env.MIRROR_S3_BUCKET }) : null);
    this.pg = env.MIRROR_POSTGRES_URL ? new Bun.SQL(env.MIRROR_POSTGRES_URL) : null;
    this.redis = env.MIRROR_REDIS_URL ? new Bun.RedisClient(env.MIRROR_REDIS_URL) : null;
  }

  static async open(opts: StoreOptions): Promise<Store> {
    const store = new Store(opts);
    if (store.pg) {
      await store.pg`CREATE TABLE IF NOT EXISTS mirror_pages (
        url TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL, status INTEGER, etag TEXT, last_modified TEXT,
        content_type TEXT, hash TEXT, bytes BIGINT, fetched_at BIGINT, attempts INTEGER NOT NULL DEFAULT 0, error TEXT)`;
    }
    return store;
  }

  tiers(): string[] {
    return ["sqlite", "disk", ...(this.s3 ? ["s3"] : []), ...(this.pg ? ["postgres"] : []), ...(this.redis ? ["redis"] : [])];
  }

  // --- blobs -------------------------------------------------------------------------------------
  private blobPath(hash: string): string {
    return join(this.dir, "blobs", hash.slice(0, 2), hash.slice(2, 4), `${hash}.zst`);
  }
  private blobKey(hash: string): string {
    return `${this.prefix}/blobs/${hash.slice(0, 2)}/${hash}.zst`;
  }

  /** Stores `bytes` under its sha256 and returns it. Writing the same content twice is a no-op. */
  async putBlob(bytes: Uint8Array, hash = sha256(bytes)): Promise<string> {
    const path = this.blobPath(hash);
    const local = Bun.file(path);
    let packed: Uint8Array | null = null;
    if (!(await local.exists())) {
      packed = Bun.zstdCompressSync(bytes, { level: 6 });
      mkdirSync(dirname(path), { recursive: true });
      await Bun.write(path, packed);
    }
    if (this.s3) {
      const remote = this.s3.file(this.blobKey(hash));
      if (!(await remote.exists())) await remote.write(packed ?? (await local.bytes()), { type: "application/zstd" });
    }
    return hash;
  }

  /** Reads a blob from disk, then from S3 (and keeps what S3 returned on disk). */
  async getBlob(hash: string): Promise<Uint8Array | null> {
    const path = this.blobPath(hash);
    const local = Bun.file(path);
    let packed: Uint8Array | null = (await local.exists()) ? await local.bytes() : null;
    if (!packed && this.s3) {
      const remote = this.s3.file(this.blobKey(hash));
      if (await remote.exists()) {
        packed = await remote.bytes();
        mkdirSync(dirname(path), { recursive: true });
        await Bun.write(path, packed);
      }
    }
    if (!packed) return null;
    const bytes = Bun.zstdDecompressSync(packed);
    if (sha256(bytes) !== hash) throw new Error(`blob ${hash} is corrupt`);
    return bytes;
  }

  // --- pages -------------------------------------------------------------------------------------
  /** Registers URLs; known ones keep their state. Returns how many were new. */
  enqueue(urls: Iterable<string>, kind: Page["kind"] = "page"): number {
    const insert = this.db.query("INSERT INTO pages (url, kind) VALUES (?, ?) ON CONFLICT (url) DO NOTHING");
    let added = 0;
    this.db.transaction(() => {
      for (const url of urls) added += insert.run(url, kind).changes;
    })();
    return added;
  }

  page(url: string): Page | null {
    return this.db.query<Page, [string]>("SELECT * FROM pages WHERE url = ?").get(url);
  }

  /**
   * URLs to fetch now: never fetched, failed (with attempts left, or last tried over an hour ago),
   * or fetched more than `maxAgeMs` ago.
   */
  due(maxAgeMs: number, retries: number, limit = -1, now = Date.now()): Page[] {
    return this.db
      .query<Page, [number, number, number, number]>(
        `SELECT * FROM pages WHERE state = 'pending' OR (state = 'failed' AND (attempts < ?1 OR fetched_at < ?4))
         OR (state = 'done' AND fetched_at < ?2) ORDER BY url LIMIT ?3`,
      )
      .all(retries, now - maxAgeMs, limit, now - 3600_000);
  }

  save(page: Page): void {
    this.db
      .query(
        `INSERT INTO pages (${PAGE_COLUMNS.join(", ")}) VALUES (${PAGE_COLUMNS.map((c) => `$${c}`).join(", ")})
         ON CONFLICT (url) DO UPDATE SET ${PAGE_COLUMNS.slice(1).map((c) => `${c} = excluded.${c}`).join(", ")}`,
      )
      .run(page as unknown as Record<string, string | number | null>);
  }

  counts(): Record<string, number> {
    const rows = this.db.query<{ k: string; n: number }, []>("SELECT kind || ':' || state AS k, count(*) AS n FROM pages GROUP BY 1 ORDER BY 1").all();
    return Object.fromEntries(rows.map((r) => [r.k, r.n]));
  }

  /** The reproducible identity of a crawl: every stored URL with the hash of its content, sorted. */
  manifest(): { hash: string; pages: number; bytes: number; text: string } {
    const rows = this.db.query<{ url: string; hash: string; bytes: number }, []>("SELECT url, hash, bytes FROM pages WHERE state = 'done' AND hash IS NOT NULL ORDER BY url").all();
    const text = rows.map((r) => `${r.hash}  ${r.url}\n`).join("");
    return { hash: sha256(text), pages: rows.length, bytes: rows.reduce((n, r) => n + r.bytes, 0), text };
  }

  // --- Postgres: the shared index ----------------------------------------------------------------
  /** Copies local page rows to Postgres. A no-op without the tier. */
  async pushIndex(batch = 500): Promise<number> {
    if (!this.pg) return 0;
    const rows = this.db.query<Page, []>("SELECT * FROM pages WHERE state != 'pending' ORDER BY url").all();
    for (let i = 0; i < rows.length; i += batch) {
      const chunk = rows.slice(i, i + batch);
      await this.pg`INSERT INTO mirror_pages ${this.pg(chunk)} ON CONFLICT (url) DO UPDATE SET
        kind = excluded.kind, state = excluded.state, status = excluded.status, etag = excluded.etag, last_modified = excluded.last_modified,
        content_type = excluded.content_type, hash = excluded.hash, bytes = excluded.bytes, fetched_at = excluded.fetched_at,
        attempts = excluded.attempts, error = excluded.error
        WHERE mirror_pages.fetched_at IS NULL OR excluded.fetched_at >= mirror_pages.fetched_at`;
    }
    return rows.length;
  }

  /** Brings rows another machine fetched more recently into the local index (resume). */
  async pullIndex(): Promise<number> {
    if (!this.pg) return 0;
    const rows = (await this.pg`SELECT * FROM mirror_pages`) as Page[];
    let taken = 0;
    this.db.transaction(() => {
      for (const row of rows) {
        const mine = this.page(row.url);
        const theirs = Number(row.fetched_at ?? 0);
        if (mine && (mine.fetched_at ?? 0) >= theirs) continue;
        this.save({ ...row, bytes: row.bytes === null ? null : Number(row.bytes), fetched_at: row.fetched_at === null ? null : theirs });
        taken++;
      }
    })();
    return taken;
  }

  // --- key-value: Redis in front of SQLite -------------------------------------------------------
  private rkey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get(key: string, now = Date.now()): Promise<string | null> {
    if (this.redis) {
      const hot = await this.redis.get(this.rkey(key));
      if (hot !== null) return hot;
    }
    const row = this.db.query<{ value: string; expires_at: number | null }, [string]>("SELECT value, expires_at FROM kv WHERE key = ?").get(key);
    if (!row || (row.expires_at !== null && row.expires_at <= now)) return null;
    if (this.redis) await this.setRedis(key, row.value, row.expires_at === null ? null : Math.ceil((row.expires_at - now) / 1000));
    return row.value;
  }

  async set(key: string, value: string, ttlSeconds: number | null = null, now = Date.now()): Promise<void> {
    this.db.query("INSERT INTO kv (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at").run(key, value, ttlSeconds === null ? null : now + ttlSeconds * 1000);
    if (this.redis) await this.setRedis(key, value, ttlSeconds);
  }

  private async setRedis(key: string, value: string, ttlSeconds: number | null): Promise<void> {
    if (ttlSeconds === null) await this.redis!.set(this.rkey(key), value);
    else if (ttlSeconds > 0) await this.redis!.send("SET", [this.rkey(key), value, "EX", String(ttlSeconds)]);
  }

  /**
   * One crawler at a time across machines. With Redis the lock is shared (SET NX EX); without it the
   * lock lives in SQLite and covers the processes that share this store directory.
   */
  async lock(name: string, ttlSeconds: number, now = Date.now()): Promise<(() => Promise<void>) | null> {
    const token = Bun.randomUUIDv7();
    const key = `lock:${name}`;
    if (this.redis) {
      const got = await this.redis.send("SET", [this.rkey(key), token, "NX", "EX", String(ttlSeconds)]);
      if (got !== "OK") return null;
      return async () => {
        if ((await this.redis!.get(this.rkey(key))) === token) await this.redis!.del(this.rkey(key));
      };
    }
    const taken = this.db.query("INSERT INTO kv (key, value, expires_at) VALUES (?1, ?2, ?3) ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at WHERE kv.expires_at <= ?4").run(key, token, now + ttlSeconds * 1000, now);
    if (!taken.changes) return null;
    return async () => {
      this.db.query("DELETE FROM kv WHERE key = ? AND value = ?").run(key, token);
    };
  }

  // --- search ------------------------------------------------------------------------------------
  index(url: string, title: string, body: string): void {
    this.db.query("DELETE FROM search WHERE url = ?").run(url);
    this.db.query("INSERT INTO search (url, title, body) VALUES (?, ?, ?)").run(url, title, body);
  }

  search(query: string, limit = 20): { url: string; title: string; snippet: string }[] {
    const terms = query.match(/[\p{L}\p{N}_]+/gu);
    if (!terms) return [];
    const match = terms.map((t) => `"${t}"*`).join(" ");
    return this.db
      .query<{ url: string; title: string; snippet: string }, [string, number]>(
        "SELECT url, title, snippet(search, 2, '<mark>', '</mark>', ' … ', 16) AS snippet FROM search WHERE search MATCH ? ORDER BY bm25(search, 0, 8, 1) LIMIT ?",
      )
      .all(match, limit);
  }

  private closed = false;
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
    this.redis?.close();
    await this.pg?.close();
  }
}
