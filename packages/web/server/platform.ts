// Self-hosted AphrodyPlatform: SQLite (bun:sqlite) + local disk instead of D1, R2, KV and Durable Objects.
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createNeonHTTPClient } from "@aphrody/bun-plugin-neon/http";
import type { AphrodyPlatform, FileStore, Limiter } from "../cloudflare/src/core.ts";
import { siteRag } from "../cloudflare/src/site-rag.ts";
import manifest from "../package.json";
import type { AphrodyConfig } from "./config.ts";

/** Fixed-window limiter, per process. */
export function memoryLimiter(limit: number, periodSeconds: number): Limiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    async limit({ key }) {
      const now = Date.now();
      if (windows.size > 10_000)
        for (const [k, w] of windows) if (now - w.start > periodSeconds * 1000) windows.delete(k);
      const w = windows.get(key);
      if (!w || now - w.start >= periodSeconds * 1000) {
        windows.set(key, { start: now, count: 1 });
        return { success: true };
      }
      return { success: ++w.count <= limit };
    },
  };
}

const sha256 = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");

function sqliteFiles(db: Database, dir: string): FileStore {
  const blob = (key: string) => join(dir, sha256(key));
  const bucket = "aphrody-assets";
  return {
    async list(prefix, cursor) {
      const rows = db
        .query<{ key: string; size: number; etag: string; uploaded_at: number }, [string, string, string, string]>(
          `SELECT key, size, etag, uploaded_at FROM files
           WHERE bucket = ? AND substr(key, 1, length(?)) = ? AND key > ? ORDER BY key LIMIT 101`,
        )
        .all(bucket, prefix ?? "", prefix ?? "", cursor ?? "");
      const page = rows.slice(0, 100);
      return {
        objects: page.map(r => ({
          key: r.key,
          size: r.size,
          etag: r.etag,
          uploaded: new Date(r.uploaded_at).toISOString(),
        })),
        cursor: rows.length > 100 ? page[99]!.key : null,
      };
    },
    async get(request, key) {
      const row = db
        .query<{ size: number; etag: string; content_type: string | null }, [string, string]>(
          "SELECT size, etag, content_type FROM files WHERE bucket = ? AND key = ?",
        )
        .get(bucket, key);
      if (!row) return null;
      const file = Bun.file(blob(key));
      if (!(await file.exists())) return null;
      const headers = new Headers({
        "Content-Type": row.content_type ?? "application/octet-stream",
        ETag: `"${row.etag}"`,
        "Cache-Control": "public, max-age=300",
        "Accept-Ranges": "bytes",
      });
      if (
        request.headers
          .get("If-None-Match")
          ?.split(",")
          .some(t => t.trim().replace(/^W\//, "") === `"${row.etag}"`)
      )
        return new Response(null, { status: 304, headers });
      const head = request.method === "HEAD";
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("Range") ?? "");
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, row.size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), row.size - 1) : row.size - 1;
        if (start > end || start >= row.size) {
          headers.set("Content-Range", `bytes */${row.size}`);
          return new Response(null, { status: 416, headers });
        }
        headers.set("Content-Range", `bytes ${start}-${end}/${row.size}`);
        return new Response(head ? null : file.slice(start, end + 1), { status: 206, headers });
      }
      headers.set("Content-Length", String(row.size));
      return new Response(head ? null : file, { headers });
    },
    async put(key, body, contentType) {
      const path = blob(key);
      const size = await Bun.write(path, new Response(body));
      const hasher = new Bun.CryptoHasher("sha256");
      for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
      const etag = hasher.digest("hex");
      db.query(
        `INSERT INTO files (bucket, key, size, etag, content_type, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (bucket, key) DO UPDATE SET size = excluded.size, etag = excluded.etag,
           content_type = excluded.content_type, uploaded_at = excluded.uploaded_at`,
      ).run(bucket, key, size, etag, contentType, Date.now());
      return { key, size, etag };
    },
    async delete(key) {
      rmSync(blob(key), { force: true });
      db.query("DELETE FROM files WHERE bucket = ? AND key = ?").run(bucket, key);
    },
    async recent() {
      return db
        .query(
          "SELECT bucket, key, size, etag, content_type, uploaded_at FROM files ORDER BY uploaded_at DESC LIMIT 50",
        )
        .all();
    },
  };
}

/** OpenAI-compatible chat endpoint exposed with the small subset of env.AI that the shared code uses. */
function localAI(config: AphrodyConfig) {
  if (!config.AI_BASE_URL) return null;
  const base = config.AI_BASE_URL.replace(/\/+$/, "");
  const call = (body: unknown) =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.AI_API_KEY ? { authorization: `Bearer ${config.AI_API_KEY}` } : {}),
      },
      body: JSON.stringify(body),
    });
  return {
    async run(model: string, input: { messages?: unknown; max_tokens?: number; temperature?: number }) {
      const response = await call({ model, ...input, stream: false });
      if (!response.ok) throw new Error(`AI backend answered ${response.status}`);
      return response.json();
    },
    async stream(prompt: string) {
      const response = await call({
        model: config.AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        stream: true,
      });
      if (!response.ok || !response.body) throw new Error(`AI backend answered ${response.status}`);
      return response.body;
    },
  };
}

export function createPlatform(config: AphrodyConfig): AphrodyPlatform & { close(): void } {
  mkdirSync(join(config.APHRODY_DATA_DIR, "files"), { recursive: true });
  const db = new Database(join(config.APHRODY_DATA_DIR, "aphrody.db"), { create: true });
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS files (bucket TEXT NOT NULL, key TEXT NOT NULL, size INTEGER NOT NULL, etag TEXT NOT NULL,
      content_type TEXT, uploaded_at INTEGER NOT NULL, PRIMARY KEY (bucket, key));
    CREATE INDEX IF NOT EXISTS files_uploaded_at ON files (uploaded_at);
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_room ON messages (room, id);`);
  const filesDir = join(config.APHRODY_DATA_DIR, "files");
  const files = sqliteFiles(db, filesDir);
  const ai = localAI(config);
  const upstream = config.BUN_SEARCH_UPSTREAM.replace(/\/+$/, "");

  // Same retention as the Worker's cron: files older than a year.
  const cleanup = () => {
    const stale = db
      .query<{ key: string }, [number]>("SELECT key FROM files WHERE uploaded_at < ?")
      .all(Date.now() - 365 * 86400_000);
    for (const { key } of stale) void files.delete(key);
    db.query("DELETE FROM kv WHERE expires_at < ?").run(Date.now());
  };
  cleanup();
  const timer = setInterval(cleanup, 6 * 3600_000);
  timer.unref();

  const yolo = {
    YOLO_ENABLED: config.YOLO_ENABLED,
    YOLO_QUOTA_QUALIFIED: config.YOLO_QUOTA_QUALIFIED,
    YOLO_ORIGIN_URL: config.YOLO_ORIGIN_URL,
    YOLO_NATIVE_SOURCE: config.YOLO_NATIVE_SOURCE,
    YOLO_MODEL: config.YOLO_MODEL,
    YOLO_API_TOKEN: config.YOLO_API_TOKEN,
    YOLO_ORIGIN_TOKEN: config.YOLO_ORIGIN_TOKEN,
    YOLO_LIMITER: memoryLimiter(6, 60),
    AI: {
      async run() {
        throw new Error("Cloudflare Workers AI is not available in the self-hosted binary");
      },
    },
  } as unknown as AphrodyPlatform["yolo"];

  return {
    appSecret: config.APP_SECRET || undefined,
    version: { id: manifest.version, tag: config.APHRODY_VERSION_TAG },
    clientIP: r =>
      r.headers.get("CF-Connecting-IP") ?? r.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? "local",
    writeLimiter: memoryLimiter(60, 60),
    ragLimiter: memoryLimiter(6, 60),
    cache: {
      async get(key) {
        const row = db
          .query<{ value: string }, [string, number]>("SELECT value FROM kv WHERE key = ? AND expires_at > ?")
          .get(key, Date.now());
        return row ? JSON.parse(row.value) : null;
      },
      async put(key, value, ttl) {
        db.query("INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)").run(
          key,
          value,
          Date.now() + ttl * 1000,
        );
      },
    },
    files,
    site: () =>
      config.NEON_DATABASE_URL
        ? createNeonHTTPClient({ connectionString: config.NEON_DATABASE_URL, expectedDatabase: "bun_site" })
        : null,
    rag: () =>
      siteRag({
        TYPESAFE_API_KEY: config.TYPESAFE_API_KEY,
        AI: (ai ?? {
          run: async () => {
            throw new Error("AI_BASE_URL is not configured");
          },
        }) as never,
        AI_MODEL: config.AI_MODEL,
        AI_GATEWAY: "",
      } as never),
    bunSearch: upstream
      ? async (q, k, kind) => {
          const url = new URL(`${upstream}/api/bun/search`);
          url.search = new URLSearchParams({ q, k: String(k), ...(kind ? { kind } : {}) }).toString();
          const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
          if (!response.ok) throw new Error(`search upstream answered ${response.status}`);
          return response.json();
        }
      : null,
    ai: ai ? prompt => ai.stream(prompt) : null,
    rooms: {
      async history(room, limit) {
        return db
          .query<{ id: number; body: string; at: number }, [string, number]>(
            "SELECT id, body, at FROM messages WHERE room = ? ORDER BY id DESC LIMIT ?",
          )
          .all(room, Math.min(Number.isFinite(limit) ? limit : 50, 200))
          .reverse();
      },
      async post(room, body) {
        return db
          .query<{ id: number; body: string; at: number }, [string, string, number]>(
            "INSERT INTO messages (room, body, at) VALUES (?, ?, ?) RETURNING id, body, at",
          )
          .get(room, body.slice(0, 2000), Date.now());
      },
      socket: null,
    },
    yolo,
    defer: promise => void promise.catch(() => {}),
    close() {
      clearInterval(timer);
      db.close();
    },
  };
}
