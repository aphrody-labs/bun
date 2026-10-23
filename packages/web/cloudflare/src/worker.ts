import { bucketFor } from "./buckets.ts";
import type { IngestParams } from "./ingest.ts";
import { createNeonHTTPClient } from "@aphrody/bun-sql/neon/http";
import { createAphrodyHandler, log, type AphrodyPlatform, type FileStore } from "./core.ts";
import { siteRag } from "./site-rag.ts";

export { Ingest } from "./ingest.ts";
export { Room } from "./room.ts";

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

function r2Files(env: Env): FileStore {
  const bucketName = "aphrody-assets" as const;
  const bucket = () => bucketFor(env, bucketName);
  return {
    async list(prefix, cursor) {
      const listing = await bucket().list({
        ...(prefix === null ? {} : { prefix }),
        ...(cursor === null ? {} : { cursor }),
        limit: 100,
      });
      return {
        objects: listing.objects.map(o => ({ key: o.key, size: o.size, etag: o.etag, uploaded: o.uploaded })),
        cursor: listing.truncated ? listing.cursor : null,
      };
    },
    async get(request, key) {
      const object = await bucket().get(key, { range: request.headers, onlyIf: request.headers });
      if (!object) return null;
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      headers.set("Cache-Control", headers.get("Cache-Control") ?? "public, max-age=300");
      if (!("body" in object)) return new Response(null, { status: 304, headers });
      if (object.range && "offset" in object.range) {
        const { offset = 0, length = object.size - offset } = object.range;
        headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
        return new Response(request.method === "HEAD" ? null : object.body, { status: 206, headers });
      }
      return new Response(request.method === "HEAD" ? null : object.body, { headers });
    },
    async put(key, body, contentType) {
      const object = await bucket().put(key, body, { httpMetadata: { contentType } });
      await env.JOBS.send({ bucket: bucketName, key } satisfies IngestParams);
      return { key: object.key, size: object.size, etag: object.etag };
    },
    async delete(key) {
      await bucket().delete(key);
      await env.DB.prepare("DELETE FROM files WHERE bucket = ? AND key = ?").bind(bucketName, key).run();
    },
    async recent() {
      const { results } = await env.DB.prepare(
        "SELECT bucket, key, size, etag, content_type, uploaded_at FROM files ORDER BY uploaded_at DESC LIMIT 50",
      ).all();
      return results;
    },
  };
}

/** Range-aware read of a published Bun Video file; the versioned prefix makes every file immutable. */
async function videoFile(env: Env, request: Request, path: string): Promise<Response | null> {
  const object = await env.VIDEO.get(`${env.VIDEO_PREFIX}/${path}`, {
    range: request.headers,
    onlyIf: request.headers,
  });
  if (!object) return null;
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  if (object.range && "offset" in object.range) {
    const { offset = 0, length = object.size - offset } = object.range;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(request.method === "HEAD" ? null : object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

function platform(env: Env, ctx: ExecutionContext): AphrodyPlatform {
  const site = () =>
    env.NEON_DATABASE_URL
      ? createNeonHTTPClient({ connectionString: env.NEON_DATABASE_URL, expectedDatabase: "bun_site" })
      : null;
  return {
    appSecret: env.APP_SECRET,
    version: { id: env.VERSION.id, tag: env.VERSION.tag },
    clientIP: r => r.headers.get("CF-Connecting-IP") ?? "local",
    writeLimiter: env.WRITE_LIMITER,
    ragLimiter: env.RAG_LIMITER,
    cache: {
      get: key => env.CACHE.get(key, "json"),
      put: (key, value, ttl) => env.CACHE.put(key, value, { expirationTtl: ttl }),
    },
    files: r2Files(env),
    video: (request, path) => videoFile(env, request, path),
    site,
    rag: () => siteRag(env),
    async bunSearch(q, k, kind) {
      const embedded = (await env.AI.run(env.EMBEDDING_MODEL as keyof AiModels, { text: [q] } as never)) as unknown as {
        data: number[][];
      };
      const found = await env.BUN_NATIVE.query(embedded.data[0]!, {
        topK: k,
        returnMetadata: "all",
        ...(kind ? { filter: { kind } } : {}),
      });
      return {
        query: q,
        results: found.matches.map(m => ({ score: Number(m.score.toFixed(4)), ...(m.metadata as BunExample) })),
      };
    },
    async ai(prompt) {
      const stream = await env.AI.run(env.AI_MODEL as keyof AiModels, { prompt, stream: true } as never, {
        gateway: { id: env.AI_GATEWAY },
      });
      return stream as ReadableStream;
    },
    rooms: {
      history: (name, limit) => env.ROOMS.getByName(name).history(limit),
      post: (name, body) => env.ROOMS.getByName(name).post(body),
      socket: (r, name) => env.ROOMS.getByName(name).fetch(r),
    },
    yolo: env,
    defer: promise => ctx.waitUntil(promise),
  };
}

export default {
  fetch(request, env, ctx) {
    return createAphrodyHandler(platform(env, ctx))(request);
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await env.INGEST.create({ params: message.body });
        message.ack();
      } catch (e) {
        log("error", "ingest enqueue failed", { error: e instanceof Error ? e.message : String(e) });
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
