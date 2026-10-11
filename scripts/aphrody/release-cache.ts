import { RedisClient } from "bun";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function cacheKey(source: string, surface: string, path: string): string {
  if (!/^[a-f0-9]{40}$/.test(source)) throw new Error("Cache requires an immutable Git SHA");
  return `bun:release:${source}:${surface}:${encodeURIComponent(path)}`;
}

export async function warmCache(out: string, url: string) {
  const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
  const redis = new RedisClient(url, { connectionTimeout: 10000, autoReconnect: false });
  using db = new Database(join(out, "monorepo.sqlite"), { readonly: true });
  let entries = 0;
  let bytes = 0;
  const put = async (surface: string, path: string, value: string) => {
    await redis.send("SET", [cacheKey(manifest.source, surface, path), value, "EX", "604800"]);
    entries++;
    bytes += Buffer.byteLength(value);
  };
  try {
    await redis.connect();
    for (const row of db
      .query<
        { path: string; content: string },
        []
      >("SELECT path,content FROM release_files WHERE content IS NOT NULL ORDER BY path")
      .iterate()) {
      await put("source", row.path, row.content);
    }
    for (const path of Object.keys(manifest.artifacts).sort()) {
      if (!/\.(?:html|md|mdx|json|css|js|txt)$/.test(path)) continue;
      const value = readFileSync(join(out, path), "utf8");
      if (Buffer.byteLength(value) > 16 * 1024 * 1024) continue;
      await put("artifact", path, value);
    }
    await put("manifest", "manifest.json", JSON.stringify(manifest));
    return { source: manifest.source, entries, bytes, ttlSeconds: 604800 };
  } finally {
    redis.close();
  }
}

if (import.meta.main) {
  const out = process.argv[2];
  const url = process.env.BUN_RELEASE_REDIS_URL;
  if (!out || !url)
    throw new Error(
      "Usage: BUN_RELEASE_REDIS_URL=<protected connection URL> bun scripts/aphrody/release-cache.ts <artifact-directory>",
    );
  console.log(JSON.stringify(await warmCache(resolve(out), url)));
}
