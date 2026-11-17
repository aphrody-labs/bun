// The mirror itself, two ways from the same store:
//   serve  a Bun.serve instance answering from the store (pages rewritten on the way out), with a
//          search API and, when enabled, a read-through to the origin for paths not crawled yet
//   build  a static tree, byte-identical for the same manifest, ready for any static host or bucket
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Config } from "./config.ts";
import { sha256 } from "./config.ts";
import { rewriteHtml, scanHtml } from "./html.ts";
import { normalizeUrl } from "./sitemap.ts";
import type { Page, Store } from "./store.ts";

const isHtml = (page: Pick<Page, "content_type">): boolean => /text\/html|application\/xhtml/i.test(page.content_type ?? "");

async function body(cfg: Config, store: Store, page: Page): Promise<Uint8Array | null> {
  const bytes = page.hash ? await store.getBlob(page.hash) : null;
  if (!bytes) return null;
  return isHtml(page) ? rewriteHtml(bytes, page.url, cfg) : bytes;
}

/** Fetches a path the crawl has not seen, stores it like the crawler would, and returns its row. */
async function readThrough(cfg: Config, store: Store, url: string): Promise<Page | null> {
  const res = await fetch(url, { headers: { "user-agent": cfg.origin.user_agent }, signal: AbortSignal.timeout(cfg.crawl.timeout_ms) });
  if (!res.ok) {
    await res.body?.cancel();
    return null;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const hash = await store.putBlob(bytes);
  const page: Page = { url, kind: "asset", state: "done", status: res.status, etag: res.headers.get("etag"), last_modified: res.headers.get("last-modified"), content_type: res.headers.get("content-type"), hash, bytes: bytes.byteLength, fetched_at: Date.now(), attempts: 0, error: null };
  if (isHtml(page)) {
    page.kind = "page";
    const scan = await scanHtml(bytes, url, cfg);
    store.index(url, scan.title, scan.text);
  }
  store.save(page);
  return page;
}

export function serve(cfg: Config, store: Store, opts: { port?: number; hostname?: string } = {}): Bun.Server<undefined> {
  const origin = new URL(cfg.origin.url).origin;
  const local = (url: string): string => new URL(url).pathname + new URL(url).search;
  return Bun.serve({
    port: opts.port ?? 0,
    hostname: opts.hostname,
    routes: {
      "/api/search": (req) => {
        const q = new URL(req.url).searchParams.get("q") ?? "";
        return Response.json(store.search(q).map((hit) => ({ ...hit, url: local(hit.url) })));
      },
      "/api/status": () => Response.json({ origin, tiers: store.tiers(), pages: store.counts(), manifest: store.manifest().hash, bun: Bun.version }),
      "/api/manifest": () => new Response(store.manifest().text, { headers: { "content-type": "text/plain; charset=utf-8" } }),
    },
    async fetch(req) {
      if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
      const { pathname, search } = new URL(req.url);
      const url = normalizeUrl(origin + pathname + search);
      let page = store.page(url) ?? (search ? store.page(normalizeUrl(origin + pathname)) : null);
      if ((!page || page.state !== "done") && cfg.site.passthrough && page?.state !== "gone") page = await readThrough(cfg, store, url).catch(() => null);
      if (!page || page.state !== "done" || !page.hash) return new Response("not found", { status: 404 });
      // The rewritten page depends on the stored bytes and on the host it is rewritten for.
      const etag = `"${sha256(`${page.hash}:${cfg.site.host}`).slice(0, 32)}"`;
      const headers = { etag, "content-type": page.content_type ?? "application/octet-stream", "cache-control": isHtml(page) ? "public, max-age=300" : "public, max-age=86400" };
      if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
      const bytes = await body(cfg, store, page);
      if (!bytes) return new Response("not found", { status: 404 });
      return new Response(req.method === "HEAD" ? null : bytes, { headers });
    },
  });
}

/** File of a URL in the static tree: pages become <path>/index.html, files keep their name. */
export function outputPath(url: string, html: boolean): string {
  const { pathname } = new URL(url);
  const clean = decodeURIComponent(pathname).replace(/^\/+/, "").replace(/\/+$/, "");
  if (html && !/\.html?$/i.test(clean)) return clean ? `${clean}/index.html` : "index.html";
  return clean || "index.html";
}

export async function build(cfg: Config, store: Store, outDir: string): Promise<{ files: number; bytes: number; manifest: string; tree: string }> {
  const pages = store.db.query<Page, []>("SELECT * FROM pages WHERE state = 'done' AND hash IS NOT NULL ORDER BY url").all();
  const written = new Map<string, string>();
  let total = 0;
  for (const page of pages) {
    const rel = outputPath(page.url, isHtml(page));
    if (rel.split("/").includes("..") || written.has(rel)) continue;
    const bytes = await body(cfg, store, page);
    if (!bytes) continue;
    const path = join(outDir, rel);
    mkdirSync(dirname(path), { recursive: true });
    await Bun.write(path, bytes);
    written.set(rel, sha256(bytes));
    total += bytes.byteLength;
  }
  const manifest = store.manifest();
  await Bun.write(join(outDir, "manifest.txt"), manifest.text);
  const tree = sha256([...written].sort(([a], [b]) => (a < b ? -1 : 1)).map(([rel, hash]) => `${hash}  ${rel}\n`).join(""));
  return { files: written.size, bytes: total, manifest: manifest.hash, tree };
}

/** Uploads a built tree to the S3 tier under `<prefix>/site/`. Returns the number of objects written. */
export async function publish(store: Store, outDir: string, prefix = "site"): Promise<number> {
  if (!store.s3) throw new Error("no S3 tier: set MIRROR_S3_BUCKET");
  let count = 0;
  for await (const rel of new Bun.Glob("**/*").scan({ cwd: outDir, onlyFiles: true })) {
    const file = Bun.file(join(outDir, rel));
    await store.s3.file(`${prefix}/${rel.replaceAll("\\", "/")}`).write(file, { type: file.type });
    count++;
  }
  return count;
}
