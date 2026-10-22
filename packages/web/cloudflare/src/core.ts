// One fetch handler for bun.aphrody.app: the Cloudflare Worker (worker.ts) and the self-hosted binary
// (packages/web/server) both build an AphrodyPlatform and call createAphrodyHandler.
import { timingSafeEqual } from "node:crypto";
import { publicSiteAPI } from "../../site/site-api.ts";
import type { SiteQuery } from "../../site/site-neon.ts";
import type { RagOptions } from "../../site/rag.ts";
import { yoloAPI } from "./yolo-api.ts";

export const buckets = ["aphrody-assets"] as const;
export const isBucket = (name: string): name is (typeof buckets)[number] =>
  (buckets as readonly string[]).includes(name);

export type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
export type FileStore = {
  list(
    prefix: string | null,
    cursor: string | null,
  ): Promise<{ objects: { key: string; size: number; etag: string; uploaded: unknown }[]; cursor: string | null }>;
  /** Full HTTP response (ranges, conditionals) or null when the key is missing. */
  get(request: Request, key: string): Promise<Response | null>;
  put(key: string, body: ReadableStream, contentType: string): Promise<{ key: string; size: number; etag: string }>;
  delete(key: string): Promise<void>;
  recent(): Promise<unknown[]>;
};
export type AphrodyPlatform = {
  appSecret: string | undefined;
  version: { id: string; tag?: string };
  clientIP(request: Request): string;
  writeLimiter: Limiter;
  ragLimiter: Limiter;
  cache: {
    get(key: string): Promise<unknown | null>;
    put(key: string, value: string, ttlSeconds: number): Promise<void>;
  };
  files: FileStore;
  /** Postgres-flavoured public site database (Neon); null when unconfigured. */
  site(): SiteQuery | null;
  rag(): Pick<RagOptions, "client" | "generate">;
  bunSearch: ((q: string, k: number, kind: string) => Promise<unknown>) | null;
  ai: ((prompt: string) => Promise<BodyInit>) | null;
  rooms: {
    history(name: string, limit: number): Promise<unknown>;
    post(name: string, body: string): Promise<unknown>;
    socket: ((request: Request, name: string) => Promise<Response>) | null;
  };
  yolo: Parameters<typeof yoloAPI>[1];
  defer(promise: Promise<unknown>): void;
};

const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);
const error = (status: number, message: string) => json({ error: message }, { status });

export function log(level: "info" | "error", message: string, fields: Record<string, unknown> = {}) {
  (level === "error" ? console.error : console.log)(JSON.stringify({ message, ...fields }));
}

/** Constant-time bearer check: both sides are hashed so timingSafeEqual sees equal lengths. */
export async function authorized(request: Request, secret: string | undefined): Promise<boolean> {
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ") || !secret) return false;
  const encoder = new TextEncoder();
  const [given, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(header.slice(7))),
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ]);
  return timingSafeEqual(new Uint8Array(given), new Uint8Array(expected));
}

export function createAphrodyHandler(p: AphrodyPlatform) {
  async function guardWrite(request: Request): Promise<Response | null> {
    if (!(await authorized(request, p.appSecret))) return error(401, "unauthorized");
    const { success } = await p.writeLimiter.limit({ key: p.clientIP(request) });
    return success ? null : error(429, "rate limited");
  }

  async function files(request: Request, bucketName: string, key: string): Promise<Response> {
    if (!isBucket(bucketName)) return error(404, `unknown bucket, expected one of ${buckets.join(", ")}`);
    if (!key) {
      if (request.method !== "GET") return error(405, "method not allowed");
      const url = new URL(request.url);
      return json(await p.files.list(url.searchParams.get("prefix"), url.searchParams.get("cursor")));
    }
    switch (request.method) {
      case "GET":
      case "HEAD":
        return (await p.files.get(request, key)) ?? error(404, "not found");
      case "PUT": {
        const denied = await guardWrite(request);
        if (denied) return denied;
        if (!request.body) return error(400, "empty body");
        const object = await p.files.put(
          key,
          request.body,
          request.headers.get("Content-Type") ?? "application/octet-stream",
        );
        log("info", "object stored", { bucket: bucketName, key, size: object.size });
        return json(object, { status: 201 });
      }
      case "DELETE": {
        const denied = await guardWrite(request);
        if (denied) return denied;
        await p.files.delete(key);
        return new Response(null, { status: 204 });
      }
      default:
        return error(405, "method not allowed");
    }
  }

  async function bunSearch(request: Request): Promise<Response> {
    if (!p.bunSearch) return error(501, "bun search is not configured on this host");
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (!q) return error(400, "missing q");
    if (q.length > 500) return error(400, "q is longer than 500 characters");
    const k = Math.min(20, Math.max(1, Number(url.searchParams.get("k")) || 5));
    const kind = url.searchParams.get("kind") ?? "";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${kind}\0${k}\0${q}`));
    const key = `bun-search:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}`;
    const cached = await p.cache.get(key);
    if (cached) return json(cached, { headers: { "X-Cache": "HIT" } });
    const { success } = await p.writeLimiter.limit({ key: `search:${p.clientIP(request)}` });
    if (!success) return error(429, "rate limited");
    const body = await p.bunSearch(q, k, kind);
    p.defer(p.cache.put(key, JSON.stringify(body), 3600));
    return json(body, { headers: { "X-Cache": "MISS" } });
  }

  async function api(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").slice(2).map(decodeURIComponent);
    const [section, name = "", ...rest] = parts;

    switch (section) {
      case "site": {
        const sql = p.site();
        if (!sql) return error(503, "public site database unavailable");
        if (url.pathname === "/api/site/rag" && request.method === "GET") {
          const { success } = await p.ragLimiter.limit({ key: p.clientIP(request) });
          if (!success) return error(429, "rate limited");
        }
        return publicSiteAPI(request, sql, request.method === "GET" ? { rag: p.rag() } : {});
      }
      case "health":
        return json({ ok: true, version: p.version.id, tag: p.version.tag, buckets });
      case "files":
        return files(request, name, rest.join("/"));
      case "bun":
        if (name !== "search" || request.method !== "GET") return error(404, "not found");
        return bunSearch(request);
      case "index": {
        const cached = await p.cache.get("index:recent");
        if (cached) return json(cached, { headers: { "X-Cache": "HIT" } });
        const results = await p.files.recent();
        p.defer(p.cache.put("index:recent", JSON.stringify(results), 60));
        return json(results, { headers: { "X-Cache": "MISS" } });
      }
      case "rooms": {
        if (!/^[\w-]{1,64}$/.test(name)) return error(400, "invalid room name");
        if (rest[0] === "ws")
          return p.rooms.socket
            ? p.rooms.socket(request, name)
            : error(501, "websocket rooms are not available on this host");
        if (request.method === "POST") {
          const denied = await guardWrite(request);
          if (denied) return denied;
          const { body } = (await request.json()) as { body?: string };
          if (!body) return error(400, "missing body");
          return json(await p.rooms.post(name, body), { status: 201 });
        }
        return json(await p.rooms.history(name, Number(url.searchParams.get("limit") ?? 50)));
      }
      case "ai": {
        if (request.method !== "POST") return error(405, "method not allowed");
        const denied = await guardWrite(request);
        if (denied) return denied;
        if (!p.ai) return error(501, "ai is not configured on this host");
        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt) return error(400, "missing prompt");
        return new Response(await p.ai(prompt), { headers: { "Content-Type": "text/event-stream" } });
      }
      default:
        return error(404, "not found");
    }
  }

  return async function fetch(request: Request): Promise<Response> {
    try {
      const decision = await yoloAPI(request, p.yolo, {
        authorized: (req, secret) => authorized(req, secret),
        async siteRead(query) {
          const sql = p.site();
          return sql ? publicSiteAPI(query, sql) : error(503, "public site database unavailable");
        },
      });
      if (decision) return decision;
      return await api(request);
    } catch (e) {
      log("error", "request failed", {
        path: new URL(request.url).pathname,
        error: e instanceof Error ? e.message : String(e),
      });
      return error(500, "internal error");
    }
  };
}
