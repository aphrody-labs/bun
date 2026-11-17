// Sitemap reader: a urlset or a sitemap index (followed), plain or gzip. Returns sorted, unique,
// same-origin URLs, so two reads of the same sitemap give the same list.
import type { Config } from "./config.ts";
import type { Store } from "./store.ts";

const LOC = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
const unescapeXml = (s: string): string => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export function parseSitemap(xml: string): { index: boolean; locs: string[] } {
  const locs = [...xml.matchAll(LOC)].map((m) => unescapeXml(m[1]!));
  return { index: /<sitemapindex[\s>]/.test(xml), locs };
}

async function fetchText(url: string, cfg: Config): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": cfg.origin.user_agent }, signal: AbortSignal.timeout(cfg.crawl.timeout_ms) });
  if (!res.ok) throw new Error(`sitemap ${url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // fetch already decodes Content-Encoding; a .gz file served as-is still starts with the gzip magic.
  const plain = bytes[0] === 0x1f && bytes[1] === 0x8b ? Bun.gunzipSync(bytes) : bytes;
  return new TextDecoder().decode(plain);
}

/** Reads the origin's sitemap. The list is cached in the store for `ttlSeconds`. */
export async function readSitemap(cfg: Config, store: Store, ttlSeconds = 3600): Promise<string[]> {
  const root = new URL(cfg.origin.sitemap, cfg.origin.url).href;
  const cached = await store.get(`sitemap:${root}`);
  if (cached) return Bun.JSONL.parse(cached) as string[];
  const origin = new URL(cfg.origin.url).origin;
  const seen = new Set<string>();
  const urls = new Set<string>();
  const queue = [root];
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const { index, locs } = parseSitemap(await fetchText(next, cfg));
    for (const loc of locs) {
      if (index) queue.push(loc);
      else if (new URL(loc).origin === origin) urls.add(normalizeUrl(loc));
    }
  }
  const list = [...urls].sort();
  await store.set(`sitemap:${root}`, list.map((u) => JSON.stringify(u)).join("\n"), ttlSeconds);
  return list;
}

/** One spelling per page: no fragment, no trailing slash except the root. */
export function normalizeUrl(href: string): string {
  const url = new URL(href);
  url.hash = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  return url.href;
}
