import { RedisClient } from "bun";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { artifactCachePath, cacheKey, CHUNK_BYTES } from "./release-cache.ts";

export function createReleaseHandler(out: string, db: Database, redis?: Pick<RedisClient, "get" | "send">) {
  const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
  const cached = async (surface: string, key: string, load: () => Promise<string>) => {
    const name = cacheKey(manifest.source, surface, key);
    const hit = await redis?.get(name).catch(() => null);
    if (hit !== null && hit !== undefined) return hit;
    const value = await load();
    if (Buffer.byteLength(value) <= 16 * 1024 * 1024)
      await redis?.send("SET", [name, value, "EX", "604800"]).catch(() => null);
    return value;
  };
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", { status: 405 });
    const url = new URL(request.url);
    if (url.pathname === "/graph/api/status")
      return Response.json({ source: manifest.source, version: manifest.version });
    if (url.pathname === "/graph/api/search") {
      const q = (url.searchParams.get("q") ?? "").slice(0, 128);
      if (!q.trim()) return Response.json([]);
      const value = await cached("search", q, async () =>
        JSON.stringify(
          db.query("SELECT path,domain,sha256 FROM release_files WHERE instr(path,?)>0 ORDER BY path LIMIT 100").all(q),
        ),
      );
      return new Response(value, { headers: { "content-type": "application/json" } });
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad path", { status: 400 });
    }
    if (pathname.includes("..") || pathname.includes("\\") || pathname.includes("\0"))
      return new Response("Bad path", { status: 400 });
    const plugin = pathname.startsWith("/plugin/");
    const candidates = plugin
      ? [pathname.slice(1)]
      : [
          `site${pathname}${pathname.endsWith("/") ? "index.html" : ""}`,
          `site${pathname}.html`,
          `site${pathname}/index.html`,
        ];
    const path = candidates.find(candidate => candidate in manifest.artifacts);
    if (!path) return new Response("Not found", { status: 404 });
    const file = Bun.file(join(out, path));
    const key = artifactCachePath(path, manifest.artifacts[path]);
    if (!/\.(?:html|md|mdx|json|css|js|txt|svg)$/.test(path))
      return new Response(request.method === "HEAD" ? null : file, { headers: { "content-type": file.type } });
    if (file.size > 16 * 1024 * 1024) {
      let offset = 0;
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (offset >= file.size) {
            controller.close();
            return;
          }
          const chunk = await cached("artifact-chunk", `${key}:${offset / CHUNK_BYTES}`, async () =>
            Buffer.from(await file.slice(offset, offset + CHUNK_BYTES).bytes()).toString("base64"),
          );
          controller.enqueue(Buffer.from(chunk, "base64"));
          offset += CHUNK_BYTES;
        },
      });
      return new Response(request.method === "HEAD" ? null : body, {
        headers: { "content-type": file.type, "content-length": String(file.size), "x-bun-source": manifest.source },
      });
    }
    const value = await cached("artifact", key, () => file.text());
    return new Response(request.method === "HEAD" ? null : value, {
      headers: { "content-type": file.type, "x-bun-source": manifest.source },
    });
  };
}

if (import.meta.main) {
  if (!process.argv[2]) throw new Error("Usage: bun scripts/aphrody/release-server.ts <artifact-directory>");
  const out = resolve(process.argv[2]);
  const db = new Database(join(out, "monorepo.sqlite"), { readonly: true });
  const redis = process.env.BUN_RELEASE_REDIS_URL
    ? new RedisClient(process.env.BUN_RELEASE_REDIS_URL, { autoReconnect: false, connectionTimeout: 3000 })
    : undefined;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: Number(process.env.BUN_RELEASE_PORT ?? 8798),
    fetch: createReleaseHandler(out, db, redis),
  });
  console.log(`Release surfaces listening on ${server.url}`);
}
