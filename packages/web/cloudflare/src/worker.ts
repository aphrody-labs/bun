import { bucketFor, buckets, isBucket } from "./buckets.ts";
import type { IngestParams } from "./ingest.ts";
import { createNeonHTTPClient } from "@aphrody/bun-plugin-neon/http";
import { publicSiteAPI } from "../../site/site-api.ts";

export { Ingest } from "./ingest.ts";
export { Room } from "./room.ts";

const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);
const error = (status: number, message: string) => json({ error: message }, { status });

function log(level: "info" | "error", message: string, fields: Record<string, unknown> = {}) {
  (level === "error" ? console.error : console.log)(JSON.stringify({ message, ...fields }));
}

/** Constant-time bearer check: both sides are hashed so timingSafeEqual sees equal lengths. */
async function authorized(request: Request, env: Env): Promise<boolean> {
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ") || !env.APP_SECRET) return false;
  const encoder = new TextEncoder();
  const [given, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(header.slice(7))),
    crypto.subtle.digest("SHA-256", encoder.encode(env.APP_SECRET)),
  ]);
  return crypto.subtle.timingSafeEqual(given, expected);
}

async function guardWrite(request: Request, env: Env): Promise<Response | null> {
  if (!(await authorized(request, env))) return error(401, "unauthorized");
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const { success } = await env.WRITE_LIMITER.limit({ key: ip });
  return success ? null : error(429, "rate limited");
}

async function files(request: Request, env: Env, bucketName: string, key: string): Promise<Response> {
  if (!isBucket(bucketName)) return error(404, `unknown bucket, expected one of ${buckets.join(", ")}`);
  const bucket = bucketFor(env, bucketName);

  if (!key) {
    if (request.method !== "GET") return error(405, "method not allowed");
    const url = new URL(request.url);
    const listing = await bucket.list({
      prefix: url.searchParams.get("prefix") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: 100,
    });
    return json({
      objects: listing.objects.map(o => ({
        key: o.key,
        size: o.size,
        etag: o.etag,
        uploaded: o.uploaded,
      })),
      cursor: listing.truncated ? listing.cursor : null,
    });
  }

  switch (request.method) {
    case "GET":
    case "HEAD": {
      const object = await bucket.get(key, { range: request.headers, onlyIf: request.headers });
      if (!object) return error(404, "not found");
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      headers.set("Cache-Control", headers.get("Cache-Control") ?? "public, max-age=300");
      if (!("body" in object)) return new Response(null, { status: 304, headers });
      if (object.range && "offset" in object.range) {
        const { offset = 0, length = object.size - offset } = object.range;
        headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
        return new Response(request.method === "HEAD" ? null : object.body, {
          status: 206,
          headers,
        });
      }
      return new Response(request.method === "HEAD" ? null : object.body, { headers });
    }
    case "PUT": {
      const denied = await guardWrite(request, env);
      if (denied) return denied;
      if (!request.body) return error(400, "empty body");
      const object = await bucket.put(key, request.body, {
        httpMetadata: {
          contentType: request.headers.get("Content-Type") ?? "application/octet-stream",
        },
      });
      await env.JOBS.send({ bucket: bucketName, key } satisfies IngestParams);
      log("info", "object stored", { bucket: bucketName, key, size: object.size });
      return json({ key: object.key, size: object.size, etag: object.etag }, { status: 201 });
    }
    case "DELETE": {
      const denied = await guardWrite(request, env);
      if (denied) return denied;
      await bucket.delete(key);
      await env.DB.prepare("DELETE FROM files WHERE bucket = ? AND key = ?").bind(bucketName, key).run();
      return new Response(null, { status: 204 });
    }
    default:
      return error(405, "method not allowed");
  }
}

type BunExample = {
  id: string;
  kind: string;
  api: string;
  instruction: string;
  code: string;
  lang: string;
  source: string;
  version: string;
};

/**
 * /api/bun/search?q=&k=&kind=: the bun-native dataset entries (scripts/aphrody/dataset) nearest to the query,
 * embedded with the model publish.ts used. Results are cached in KV for an hour per query.
 */
async function bunSearch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return error(400, "missing q");
  if (q.length > 500) return error(400, "q is longer than 500 characters");
  const k = Math.min(20, Math.max(1, Number(url.searchParams.get("k")) || 5));
  const kind = url.searchParams.get("kind") ?? "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${kind}\0${k}\0${q}`));
  const key = `bun-search:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}`;
  const cached = await env.CACHE.get(key, "json");
  if (cached) return json(cached, { headers: { "X-Cache": "HIT" } });
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const { success } = await env.WRITE_LIMITER.limit({ key: `search:${ip}` });
  if (!success) return error(429, "rate limited");
  const embedded = (await env.AI.run(
    env.EMBEDDING_MODEL as keyof AiModels,
    {
      text: [q],
    } as never,
  )) as unknown as { data: number[][] };
  const found = await env.BUN_NATIVE.query(embedded.data[0]!, {
    topK: k,
    returnMetadata: "all",
    filter: kind ? { kind } : undefined,
  });
  const body = {
    query: q,
    results: found.matches.map(m => ({ score: Number(m.score.toFixed(4)), ...(m.metadata as BunExample) })),
  };
  ctx.waitUntil(env.CACHE.put(key, JSON.stringify(body), { expirationTtl: 3600 }));
  return json(body, { headers: { "X-Cache": "MISS" } });
}

async function api(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").slice(2).map(decodeURIComponent);
  const [section, name = "", ...rest] = parts;

  switch (section) {
    case "site": {
      const connectionString = (env as Env & { NEON_DATABASE_URL?: string }).NEON_DATABASE_URL;
      if (!connectionString) return error(503, "public site database unavailable");
      const sql = createNeonHTTPClient({ connectionString, expectedDatabase: "bun_site" });
      return publicSiteAPI(request, sql);
    }
    case "health":
      return json({ ok: true, version: env.VERSION.id, tag: env.VERSION.tag, buckets });

    case "files":
      return files(request, env, name, rest.join("/"));

    case "bun":
      if (name !== "search" || request.method !== "GET") return error(404, "not found");
      return bunSearch(request, env, ctx);

    case "index": {
      const cached = await env.CACHE.get("index:recent", "json");
      if (cached) return json(cached, { headers: { "X-Cache": "HIT" } });
      const { results } = await env.DB.prepare(
        "SELECT bucket, key, size, etag, content_type, uploaded_at FROM files ORDER BY uploaded_at DESC LIMIT 50",
      ).all();
      ctx.waitUntil(env.CACHE.put("index:recent", JSON.stringify(results), { expirationTtl: 60 }));
      return json(results, { headers: { "X-Cache": "MISS" } });
    }

    case "rooms": {
      if (!/^[\w-]{1,64}$/.test(name)) return error(400, "invalid room name");
      const room = env.ROOMS.getByName(name);
      if (rest[0] === "ws") return room.fetch(request);
      if (request.method === "POST") {
        const denied = await guardWrite(request, env);
        if (denied) return denied;
        const { body } = await request.json<{ body?: string }>();
        if (!body) return error(400, "missing body");
        return json(await room.post(body), { status: 201 });
      }
      return json(await room.history(Number(url.searchParams.get("limit") ?? 50)));
    }

    case "ai": {
      if (request.method !== "POST") return error(405, "method not allowed");
      const denied = await guardWrite(request, env);
      if (denied) return denied;
      const { prompt } = await request.json<{ prompt?: string }>();
      if (!prompt) return error(400, "missing prompt");
      const stream = await env.AI.run(env.AI_MODEL as keyof AiModels, { prompt, stream: true } as never, {
        gateway: { id: env.AI_GATEWAY },
      });
      return new Response(stream as ReadableStream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    default:
      return error(404, "not found");
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await api(request, env, ctx);
    } catch (e) {
      log("error", "request failed", {
        path: new URL(request.url).pathname,
        error: e instanceof Error ? e.message : String(e),
      });
      return error(500, "internal error");
    }
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await env.INGEST.create({ params: message.body });
        message.ack();
      } catch (e) {
        log("error", "ingest enqueue failed", {
          error: e instanceof Error ? e.message : String(e),
        });
        message.retry({ delaySeconds: 30 });
      }
    }
  },

  async scheduled(controller, env) {
    const cutoff = Date.now() - 365 * 24 * 3600 * 1000;
    const { meta } = await env.DB.prepare("DELETE FROM files WHERE uploaded_at < ?").bind(cutoff).run();
    log("info", "scheduled cleanup", { cron: controller.cron, deleted: meta.changes });
  },
} satisfies ExportedHandler<Env, IngestParams>;
