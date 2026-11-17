// The mirror gate, end to end, with nothing but the running `bun`: a local origin stands in for the
// site, so the run is hermetic and repeatable. Run it with the installed Bun, before any build:
//   bun test ./tools/mirror
// Optional tiers are exercised when their environment variable is set (MIRROR_S3_BUCKET,
// MIRROR_POSTGRES_URL, MIRROR_REDIS_URL); MIRROR_LIVE=1 adds a bounded crawl of the real origin.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, sha256, type Config } from "./config.ts";
import { crawl } from "./crawl.ts";
import { checkDoc, compare, coverage, declaredNames, docPath } from "./docs.ts";
import { runGate, summarize } from "./gate.ts";
import { companionUrls, rewriteHtml, scanHtml, scanScript } from "./html.ts";
import { inspectInstallation } from "./install.ts";
import { normalizeUrl, parseSitemap, readSitemap } from "./sitemap.ts";
import { serve as serveS3 } from "../../test/packages/s3-server/index.ts";
import { build, outputPath, publish, serve } from "./site.ts";
import { Store } from "./store.ts";

const scratch = mkdtempSync(join(tmpdir(), "bun-mirror-"));
const opened: Store[] = [];
const open = async (name: string, env: Record<string, string | undefined> = {}): Promise<Store> => {
  const store = await Store.open({ dir: dir(name), env });
  opened.push(store);
  return store;
};
const dir = (name: string): string => (mkdirSync(join(scratch, name), { recursive: true }), join(scratch, name));

// --- a small origin: sitemap index, one gzip sitemap, ETags, a flaky page, a missing page -----------
const hits = new Map<string, number>();
const page = (title: string, body: string): string => `<!doctype html><html><head><title>${title}</title><link rel="canonical" href="ORIGIN/canon"><link rel="stylesheet" href="/assets/site.css"><script type="module" src="/assets/app-k3j2h1g0.js"></script><script src="https://www.googletagmanager.com/gtag/js?id=X"></script><script>var inline = "not text";</script></head><body><main><h1>${title}</h1><p>${body}</p><a href="ORIGIN/docs/runtime/sql">absolute</a> <a href="/docs/guides">relative</a> <a href="https://example.com/out">external</a><img src="ORIGIN/assets/logo.svg" srcset="ORIGIN/assets/logo.svg 1x, /assets/logo@2x.png 2x"></main></body></html>`;
const files: Record<string, { type: string; body: string | Uint8Array }> = {
  "/": { type: "text/html; charset=utf-8", body: page("Home", "Bun is a fast runtime") },
  "/docs/runtime/sql": { type: "text/html; charset=utf-8", body: page("SQL", "Postgres MySQL and SQLite clients") },
  "/docs/guides": { type: "text/html; charset=utf-8", body: page("Guides", "Recipes for workers and streams") },
  "/blog/release": { type: "text/html; charset=utf-8", body: page("Release", "Changelog of the redis client") },
  "/flaky": { type: "text/html; charset=utf-8", body: page("Flaky", "Eventually answers") },
  "/assets/site.css": { type: "text/css", body: "body{color:#111}" },
  "/assets/app-k3j2h1g0.js": { type: "text/javascript", body: 'import{a}from"./chunk-9x8y7z6w.js";const lazy=()=>import("./page-docs-q1w2e3r4.js");export{a,lazy};' },
  "/assets/chunk-9x8y7z6w.js": { type: "text/javascript", body: "export const a=1;" },
  "/assets/page-docs-q1w2e3r4.js": { type: "text/javascript", body: "export default 2;" },
  "/docs/guides.props.json": { type: "application/json", body: '{"title":"Guides"}' },
  "/assets/logo.svg": { type: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg'/>" },
  "/assets/logo@2x.png": { type: "image/png", body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) },
};
let origin: Bun.Server<undefined>;
let cfg: Config;

beforeAll(async () => {
  origin = Bun.serve({
    port: 0,
    fetch(req) {
      const { pathname } = new URL(req.url);
      const base = origin.url.origin;
      hits.set(pathname, (hits.get(pathname) ?? 0) + 1);
      if (pathname === "/sitemap.xml") return new Response(`<sitemapindex><sitemap><loc>${base}/sitemap-a.xml</loc></sitemap><sitemap><loc>${base}/sitemap-b.xml.gz</loc></sitemap></sitemapindex>`);
      if (pathname === "/sitemap-a.xml") return new Response(`<urlset><url><loc>${base}/</loc></url><url><loc>${base}/docs/runtime/sql/</loc></url><url><loc>${base}/docs/guides#top</loc></url><url><loc>https://elsewhere.example/x</loc></url></urlset>`);
      if (pathname === "/sitemap-b.xml.gz") return new Response(Bun.gzipSync(`<urlset><url><loc>${base}/blog/release?a=1&amp;b=2</loc></url><url><loc>${base}/flaky</loc></url><url><loc>${base}/gone</loc></url></urlset>`), { headers: { "content-type": "application/gzip" } });
      if (pathname === "/flaky" && hits.get(pathname)! < 3) return new Response("try again", { status: 503, headers: { "retry-after": "0" } });
      const file = files[pathname];
      if (!file) return new Response("no such page", { status: 404 });
      const body = typeof file.body === "string" ? file.body.replaceAll("ORIGIN", base) : file.body;
      const etag = `"${sha256(body).slice(0, 16)}"`;
      if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
      return new Response(body, { headers: { "content-type": file.type, etag } });
    },
  });
  cfg = await loadConfig({ MIRROR_ORIGIN: origin.url.origin, MIRROR_CONCURRENCY: "3", MIRROR_DIR: dir("unused") });
  cfg.crawl.delay_ms = 0;
  cfg.site.passthrough = false;
});

afterAll(async () => {
  await origin.stop(true);
  // A test that failed may have left its store open; SQLite files cannot be removed while open on Windows.
  for (const store of opened) await store.close().catch(() => {});
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe("sitemap", () => {
  test("parses a urlset and an index, and normalizes URLs", () => {
    expect(parseSitemap("<urlset><url><loc> https://a/b?x=1&amp;y=2 </loc></url></urlset>")).toEqual({ index: false, locs: ["https://a/b?x=1&y=2"] });
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://a/s.xml</loc></sitemap></sitemapindex>").index).toBe(true);
    expect(normalizeUrl("https://a/b/#frag")).toBe("https://a/b");
    expect(normalizeUrl("https://a/")).toBe("https://a/");
  });

  test("follows the index, reads gzip, keeps same-origin URLs sorted, and caches the list", async () => {
    const store = await open("sitemap");
    const base = origin.url.origin;
    const urls = await readSitemap(cfg, store);
    expect(urls).toEqual([`${base}/`, `${base}/blog/release?a=1&b=2`, `${base}/docs/guides`, `${base}/docs/runtime/sql`, `${base}/flaky`, `${base}/gone`]);
    const before = hits.get("/sitemap.xml");
    expect(await readSitemap(cfg, store)).toEqual(urls);
    expect(hits.get("/sitemap.xml")).toBe(before);
    await store.close();
  });
});

describe("store", () => {
  test("blobs are content-addressed, compressed and verified", async () => {
    const store = await open("blobs");
    const bytes = new TextEncoder().encode("hello ".repeat(1000));
    const hash = await store.putBlob(bytes);
    expect(hash).toBe(sha256(bytes));
    expect(await store.putBlob(bytes)).toBe(hash);
    expect(await store.getBlob(hash)).toEqual(bytes);
    expect(await store.getBlob("0".repeat(64))).toBeNull();
    const [packed] = [...new Bun.Glob("blobs/**/*.zst").scanSync({ cwd: store.dir })];
    expect(Bun.file(join(store.dir, packed!)).size).toBeLessThan(bytes.byteLength / 10);
    await Bun.write(join(store.dir, packed!), Bun.zstdCompressSync("tampered"));
    expect(store.getBlob(hash)).rejects.toThrow("corrupt");
    await store.close();
  });

  test("key-value entries expire, and the lock admits one holder", async () => {
    const store = await open("kv");
    expect(store.tiers()).toEqual(["sqlite", "disk"]);
    await store.set("k", "v", 10, 1_000);
    expect(await store.get("k", 5_000)).toBe("v");
    expect(await store.get("k", 11_001)).toBeNull();
    const release = await store.lock("crawl", 60, 1_000);
    expect(release).toBeFunction();
    expect(await store.lock("crawl", 60, 2_000)).toBeNull();
    expect(await store.lock("crawl", 60, 62_000)).toBeFunction(); // an expired lock is taken over
    await release!();
    await store.close();
  });

  test("the queue resumes: pending, stale and failed pages are due; fresh ones are not", async () => {
    const store = await open("queue");
    expect(store.enqueue(["https://o/a", "https://o/b", "https://o/c", "https://o/a"])).toBe(3);
    const row = { kind: "page" as const, status: 200, etag: null, last_modified: null, content_type: "text/html", hash: "h", bytes: 1, error: null };
    store.save({ ...row, url: "https://o/a", state: "done", fetched_at: 1_000_000, attempts: 0 });
    store.save({ ...row, url: "https://o/b", state: "failed", fetched_at: 1_000_000, attempts: 3, status: 500, hash: null });
    const due = (now: number): string[] => store.due(60_000, 3, -1, now).map((p) => p.url);
    expect(due(1_010_000)).toEqual(["https://o/c"]);
    expect(due(1_070_000)).toEqual(["https://o/a", "https://o/c"]);
    expect(due(1_000_000 + 3600_001)).toEqual(["https://o/a", "https://o/b", "https://o/c"]);
    expect(store.counts()).toEqual({ "page:done": 1, "page:failed": 1, "page:pending": 1 });
    await store.close();
  });
});

describe("html", () => {
  test("scan finds title, text and same-origin assets; rewrite makes the page host-independent", async () => {
    const base = origin.url.origin;
    const html = new TextEncoder().encode((files["/"]!.body as string).replaceAll("ORIGIN", base));
    const scan = await scanHtml(html, `${base}/`, cfg);
    expect(scan.title).toBe("Home");
    expect(scan.text).toBe("Home Bun is a fast runtime absolute relative external");
    expect(scan.assets).toEqual([`${base}/assets/app-k3j2h1g0.js`, `${base}/assets/logo.svg`, `${base}/assets/logo@2x.png`, `${base}/assets/site.css`]);
    // A bundle names its dynamic imports; a page brings files no link names.
    expect(scanScript(new TextEncoder().encode(files["/assets/app-k3j2h1g0.js"]!.body as string), `${base}/assets/app-k3j2h1g0.js`, cfg)).toEqual([`${base}/assets/chunk-9x8y7z6w.js`, `${base}/assets/page-docs-q1w2e3r4.js`]);
    expect(companionUrls(`${base}/docs/guides/`, cfg)).toEqual([`${base}/docs/guides.props.json`]);
    expect(companionUrls(`${base}/`, cfg)).toEqual([`${base}/index.props.json`]);
    expect(scan.links).toEqual([`${base}/canon`, `${base}/docs/guides`, `${base}/docs/runtime/sql`]);

    const out = new TextDecoder().decode(await rewriteHtml(html, `${base}/`, cfg));
    expect(out).not.toContain("googletagmanager");
    expect(out).toContain('<a href="/docs/runtime/sql">absolute</a>');
    expect(out).toContain('<a href="/docs/guides">relative</a>');
    expect(out).toContain('<a href="https://example.com/out">external</a>');
    expect(out).toContain('src="/assets/logo.svg" srcset="/assets/logo.svg 1x, /assets/logo@2x.png 2x"');
    expect(out).toContain(`<link rel="canonical" href="${base}/">`);

    const hosted = new TextDecoder().decode(await rewriteHtml(html, `${base}/`, { ...cfg, site: { host: "mirror.test", passthrough: false } }));
    expect(hosted).toContain('<a href="https://mirror.test/docs/runtime/sql">absolute</a>');
    expect(hosted).toContain('<link rel="canonical" href="https://mirror.test/">');
  });
});

describe("crawl", () => {
  let manifest = "";

  test("workers fetch the sitemap and its assets, retry a flaky page, and record a missing one", async () => {
    const store = await open("crawl");
    hits.delete("/flaky");
    const report = await crawl(cfg, store, { now: () => 1_000_000 });
    expect(report).toMatchObject({ sitemap: 6, fetched: 12, unchanged: 0, failed: 5, assets: 11 });
    expect(store.counts()).toEqual({ "asset:done": 7, "asset:gone": 4, "page:done": 5, "page:gone": 1 });
    expect(hits.get("/flaky")).toBe(3);
    expect(store.page(`${origin.url.origin}/gone`)).toMatchObject({ state: "gone", status: 404 });
    expect(store.search("redis")[0]).toMatchObject({ title: "Release" });
    expect(store.search("postgres sqlite").map((h) => new URL(h.url).pathname)).toEqual(["/docs/runtime/sql"]);
    manifest = report.manifest;
    expect(manifest).toBe(store.manifest().hash);
    expect(store.manifest().pages).toBe(12);

    // A day later every page is revalidated and none has changed: 304s only, same manifest.
    const again = await crawl(cfg, store, { now: () => 1_000_000 + 25 * 3600_000 });
    expect(again).toMatchObject({ fetched: 0, unchanged: 12, failed: 0, manifest });
    await store.close();
  });

  test("an interrupted crawl resumes to the same manifest", async () => {
    const store = await open("resume");
    const first = await crawl(cfg, store, { limit: 3, now: () => 1_000_000 });
    expect(first.fetched + first.failed).toBe(3);
    expect(first.manifest).not.toBe(manifest);
    const second = await crawl(cfg, store, { now: () => 1_000_001 });
    expect(second.fetched + second.failed).toBe(14);
    expect(second.manifest).toBe(manifest);
    await store.close();
  });

  test("a revalidating run completes a mirror crawled before a discovery rule existed", async () => {
    const store = await open("late-rule");
    hits.delete("/flaky");
    await crawl({ ...cfg, crawl: { ...cfg.crawl, companions: [] } }, store, { now: () => 1_000_000 });
    expect(store.counts()).toMatchObject({ "asset:done": 6 });
    const later = await crawl(cfg, store, { now: () => 1_000_000 + 25 * 3600_000 });
    expect(later.assets).toBe(5);
    expect(store.counts()).toMatchObject({ "asset:done": 7, "asset:gone": 4 });
    expect(store.manifest().pages).toBe(12);
    await store.close();
  });

  test("a second crawler is refused while the lock is held", async () => {
    const store = await open("locked");
    const release = await store.lock("crawl", 60);
    expect(crawl(cfg, store)).rejects.toThrow("lock");
    await release!();
    await store.close();
  });
});

describe("site", () => {
  test("serves the mirror from the store with ETags and search, and builds a reproducible tree", async () => {
    const store = await open("site");
    await crawl(cfg, store, { now: () => 1_000_000 });
    const server = serve(cfg, store);
    try {
      const home = await fetch(new URL("/", server.url));
      expect(home.headers.get("content-type")).toContain("text/html");
      const html = await home.text();
      expect(html).toContain('<a href="/docs/runtime/sql">absolute</a>');
      expect(html).not.toContain("googletagmanager");
      const etag = home.headers.get("etag")!;
      expect((await fetch(new URL("/", server.url), { headers: { "if-none-match": etag } })).status).toBe(304);
      expect(await (await fetch(new URL("/assets/site.css", server.url))).text()).toBe("body{color:#111}");
      expect(await (await fetch(new URL("/blog/release?a=1&b=2", server.url))).text()).toContain("Changelog of the redis client");
      expect((await fetch(new URL("/gone", server.url))).status).toBe(404);
      expect((await fetch(new URL("/never-crawled", server.url))).status).toBe(404);
      expect((await fetch(new URL("/", server.url), { method: "POST" })).status).toBe(405);
      expect(await (await fetch(new URL("/api/search?q=workers", server.url))).json()).toEqual([{ url: "/docs/guides", title: "Guides", snippet: expect.stringContaining("<mark>workers</mark>") }]);
      expect(await (await fetch(new URL("/api/status", server.url))).json()).toMatchObject({ tiers: ["sqlite", "disk"], pages: { "page:done": 5 }, manifest: store.manifest().hash });

      // Read-through: a path the crawl never saw is fetched from the origin once, then served from the store.
      const through = serve({ ...cfg, site: { host: "", passthrough: true } }, store);
      files["/late"] = { type: "text/html", body: page("Late", "Added after the crawl") };
      expect(await (await fetch(new URL("/late", through.url))).text()).toContain("Added after the crawl");
      const seen = hits.get("/late");
      expect((await fetch(new URL("/late", through.url))).status).toBe(200);
      expect(hits.get("/late")).toBe(seen);
      expect(store.search("crawl")[0]).toMatchObject({ title: "Late" });
      await through.stop(true);
      delete files["/late"];
    } finally {
      await server.stop(true);
    }

    expect(outputPath("https://o/docs/a", true)).toBe("docs/a/index.html");
    expect(outputPath("https://o/", true)).toBe("index.html");
    expect(outputPath("https://o/assets/a.css", false)).toBe("assets/a.css");
    const one = await build(cfg, store, dir("out-1"));
    const two = await build(cfg, store, dir("out-2"));
    expect(one).toEqual(two);
    expect(one.files).toBe(13);
    expect(await Bun.file(join(scratch, "out-1", "docs", "runtime", "sql", "index.html")).text()).toContain("<h1>SQL</h1>");
    expect(await Bun.file(join(scratch, "out-1", "manifest.txt")).text()).toBe(store.manifest().text);
    await store.close();
  });
});

describe("installation", () => {
  test("describes the Bun that is running and the repository's lockfile", async () => {
    const install = await inspectInstallation(cfg.repo);
    expect(install.version).toBe(Bun.version);
    expect(install.revision).toBe(Bun.revision);
    expect(install.binary.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(install.binary.bytes).toBeGreaterThan(1_000_000);
    expect(install.execPath).toBe(process.execPath);
    expect(install.lockfile).not.toBeNull();
    expect(install.lockfile!.packages).toBeGreaterThan(0);
    expect(install.lockfile!.missingWorkspaces).toEqual([]);
    expect([-1, 0, 1, null]).toContain(install.versusLatest);
  });
});

describe("docs and types against upstream", () => {
  const git = (cwd: string, ...args: string[]): string => {
    const r = Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], { cwd, env: { ...Bun.env, GIT_CONFIG_GLOBAL: "", GIT_CONFIG_NOSYSTEM: "1" } });
    if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
    return r.stdout.toString().trim();
  };

  test("declaration names, doc paths and link checks", () => {
    expect(declaredNames(`declare module "bun" {\n  function serve(): void;\n  export interface Server {}\n  const version: string;\n}\ndeclare var Bun: typeof import("bun");\n`)).toEqual(["bun:Server", "bun:serve", "bun:version", "bun:Bun", "module:bun"].sort());
    expect(docPath("docs/runtime/sql.mdx")).toBe("/runtime/sql");
    expect(docPath("docs/index.mdx")).toBe("/");
    expect(docPath("docs/guides/index.mdx")).toBe("/guides");
    const exists = (p: string): boolean => ["/runtime/sql", "/guides"].includes(p);
    const text = '---\ntitle: "Ok"\n---\n[a](/docs/runtime/sql) [b](/runtime/nope#x) [c](../guides) [img](/images/a.png) [site](/careers) [old](/docs/api/sql)\n```\n[skipped](/in/code)\n```\n';
    const sections = new Set(["runtime", "guides"]);
    expect(checkDoc("docs/runtime/page.mdx", text, exists, "/docs", sections)).toEqual([{ path: "docs/runtime/page.mdx", line: 4, kind: "link", detail: "/runtime/nope" }]);
    expect(checkDoc("docs/runtime/page.mdx", text, exists, "/docs").map((i) => i.detail)).toEqual(["/runtime/nope", "/careers", "/docs/api/sql"]);
    expect(checkDoc("docs/a.mdx", "---\ndescription: x\n---\n", exists, "/docs")).toEqual([{ path: "docs/a.mdx", line: 1, kind: "title", detail: "frontmatter has no title" }]);
    expect(checkDoc("docs/a.mdx", "---\ntitle: [unclosed\n---\n", exists, "/docs")[0]).toMatchObject({ kind: "frontmatter" });
  });

  test("classifies every file, finds the fork's own broken links and its missing declarations", async () => {
    const repo = dir("repo");
    const write = (path: string, text: string): Promise<number> => Bun.write(join(repo, path), text);
    git(repo, "init", "-q", "-b", "main");
    await write("README.md", "# upstream\n");
    await write("docs/index.mdx", "---\ntitle: Home\n---\n[sql](/docs/runtime/sql)\n");
    await write("docs/runtime/sql.mdx", "---\ntitle: SQL\n---\ntext\n");
    await write("docs/old.mdx", "---\ntitle: Old\n---\n[dead](/docs/runtime/nowhere)\n");
    await write("docs/removed.mdx", "---\ntitle: Removed\n---\n");
    await write("packages/bun-types/bun.d.ts", 'declare module "bun" {\n  function serve(): void;\n  function sql(): void;\n}\n');
    await write("src/code.ts", "export {};\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "upstream");
    git(repo, "update-ref", "refs/remotes/upstream/main", "HEAD");
    // The fork: one page changed (with a broken link), one added, one deleted, one declaration dropped, one added.
    await write("docs/runtime/sql.mdx", "---\ntitle: SQL\n---\ntext\n[broken](/docs/runtime/missing)\n");
    await write("docs/fork.mdx", "---\ntitle: Fork\n---\n[home](/docs)\n");
    rmSync(join(repo, "docs", "removed.mdx"));
    await write("packages/bun-types/bun.d.ts", 'declare module "bun" {\n  function serve(): void;\n  function mirror(): void;\n}\n');

    const local = { ...cfg, repo };
    const result = await compare(local);
    expect(result.upstream?.sha).toBe(git(repo, "rev-parse", "HEAD"));
    expect(result.files).toEqual({ total: 6, same: 3, changed: 2, forkOnly: 1, upstreamOnly: 1 });
    expect(result.diffs).toEqual([
      { path: "docs/fork.mdx", status: "fork-only", added: 5, removed: 0 },
      { path: "docs/removed.mdx", status: "upstream-only", added: 0, removed: 3 },
      { path: "docs/runtime/sql.mdx", status: "changed", added: 1, removed: 0 },
      { path: "packages/bun-types/bun.d.ts", status: "changed", added: 1, removed: 1 },
    ]);
    expect(result.issues.map((i) => `${i.path}:${i.line}:${i.detail}`)).toEqual(["docs/old.mdx:4:/docs/runtime/nowhere", "docs/runtime/sql.mdx:5:/docs/runtime/missing"]);
    expect(result.forkIssues.map((i) => i.path)).toEqual(["docs/runtime/sql.mdx"]);
    expect(result.types).toEqual({ fork: 3, upstream: 3, forkOnly: ["bun:mirror"], missing: ["bun:sql"] });
    expect(result.pages).toEqual(["/", "/fork", "/old", "/runtime/sql"]);
    expect((await compare(local)).inputs).toBe(result.inputs);
    expect(coverage(result.pages, ["https://o/docs", "https://o/docs/runtime/sql", "https://o/docs/removed", "https://o/blog/x"], local)).toEqual({ published: 3, missingInFork: ["/removed"], unpublished: ["/fork", "/old"] });

    // The gate turns those findings into problems, and answers from the cache when nothing moved.
    const store = await open("gate");
    const report = await runGate(local, store);
    expect(report.cached).toBe(false);
    expect(report.problems).toEqual(["1 upstream declaration(s) missing from the fork's types: bun:sql", "docs/runtime/sql.mdx:5: link: /docs/runtime/missing"]);
    expect(summarize(report)).toContain("FAIL: 2 problem(s)");
    expect((await runGate(local, store)).cached).toBe(true);
    await write("docs/runtime/sql.mdx", "---\ntitle: SQL\n---\ntext\n");
    await write("packages/bun-types/bun.d.ts", 'declare module "bun" {\n  function serve(): void;\n  function sql(): void;\n  function mirror(): void;\n}\n');
    const fixed = await runGate(local, store);
    expect(fixed).toMatchObject({ cached: false, problems: [] });
    expect(summarize(fixed)).toEndWith("PASS");
    await store.close();
  });

  test("this fork passes its own gate", async () => {
    const real = await loadConfig({ MIRROR_DIR: dir("real") });
    const store = await Store.open({ dir: real.store.dir, env: {} });
    opened.push(store);
    const report = await runGate(real, store);
    console.log(summarize(report));
    expect(report.comparison.files.total).toBeGreaterThan(1000);
    expect(report.problems).toEqual([]);
    await store.close();
  }, 120_000);
});

// --- optional tiers: real services, named by the environment ----------------------------------------
describe("S3 tier", () => {
  // The S3 server of Bun's own test suite: Bun.serve, in memory, SigV4 verified. MIRROR_S3_BUCKET
  // points the same test at a real bucket (S3 or R2) instead.
  test("a blob written by one machine is read by another, and a built site is published", async () => {
    await using s3 = Bun.env.MIRROR_S3_BUCKET ? null : serveS3({ buckets: ["mirror"] });
    const client = (): Bun.S3Client => (s3 ? new Bun.S3Client(s3.clientOptions("mirror")) : new Bun.S3Client({ bucket: Bun.env.MIRROR_S3_BUCKET }));
    const env = { MIRROR_PREFIX: `test-${Bun.randomUUIDv7()}` };
    const a = await Store.open({ dir: dir("s3-a"), env, s3: client() });
    const b = await Store.open({ dir: dir("s3-b"), env, s3: client() });
    opened.push(a, b);
    expect(a.tiers()).toEqual(["sqlite", "disk", "s3"]);
    const bytes = new TextEncoder().encode(`shared ${Bun.randomUUIDv7()}`);
    const hash = await a.putBlob(bytes);
    expect(await b.getBlob(hash)).toEqual(bytes);
    const key = `${env.MIRROR_PREFIX}/blobs/${hash.slice(0, 2)}/${hash}.zst`;
    await a.s3!.file(key).delete();
    expect(await a.s3!.file(key).exists()).toBe(false);
    expect(await b.getBlob(hash)).toEqual(bytes); // kept on b's disk after the first read

    await crawl(cfg, a, { now: () => 1_000_000 });
    const out = dir("s3-out");
    const built = await build(cfg, a, out);
    const prefix = `${env.MIRROR_PREFIX}/site`;
    expect(await publish(a, out, prefix)).toBe(built.files + 1); // the pages and manifest.txt
    expect(await a.s3!.file(`${prefix}/docs/runtime/sql/index.html`).text()).toContain("<h1>SQL</h1>");
    expect(await a.s3!.file(`${prefix}/manifest.txt`).text()).toBe(a.manifest().text);
    for (const rel of new Bun.Glob("**/*").scanSync({ cwd: out, onlyFiles: true })) await a.s3!.file(`${prefix}/${rel.replaceAll("\\", "/")}`).delete();
  });
});

describe.skipIf(!Bun.env.MIRROR_POSTGRES_URL)("Postgres tier", () => {
  test("a crawl started on one machine is resumed on another", async () => {
    const env = { MIRROR_POSTGRES_URL: Bun.env.MIRROR_POSTGRES_URL };
    const a = await open("pg-a", env);
    await a.pg!`TRUNCATE mirror_pages`;
    const first = await crawl(cfg, a, { limit: 3, now: () => 1_000_000 });
    expect(first.fetched + first.failed).toBe(3);
    const b = await open("pg-b", env);
    expect(await b.pullIndex()).toBe(3);
    expect(Object.values(b.counts()).reduce((n, c) => n + c, 0)).toBe(3);
    await a.pg!`TRUNCATE mirror_pages`;
    await a.close();
    await b.close();
  });
});

describe.skipIf(!Bun.env.MIRROR_REDIS_URL)("Redis tier", () => {
  test("hot keys and the crawl lock are shared", async () => {
    const env = { MIRROR_REDIS_URL: Bun.env.MIRROR_REDIS_URL, MIRROR_PREFIX: `test-${Bun.randomUUIDv7()}` };
    const a = await open("redis-a", env);
    const b = await open("redis-b", env);
    await a.set("k", "v", 60);
    expect(await b.get("k")).toBe("v"); // b's SQLite has never seen it
    const release = await a.lock("crawl", 60);
    expect(await b.lock("crawl", 60)).toBeNull();
    await release!();
    const taken = await b.lock("crawl", 60);
    expect(taken).toBeFunction();
    await taken!();
    await a.redis!.del(`${env.MIRROR_PREFIX}:k`);
    await a.close();
    await b.close();
  });
});

describe.skipIf(!Bun.env.MIRROR_LIVE)("live origin", () => {
  test("the real sitemap is read and a bounded crawl stores pages", async () => {
    const real = await loadConfig({ MIRROR_DIR: dir("live") });
    const store = await Store.open({ dir: real.store.dir, env: {} });
    opened.push(store);
    const urls = await readSitemap(real, store);
    expect(urls.length).toBeGreaterThan(1000);
    const report = await crawl(real, store, { limit: 20, assets: false });
    expect(report.fetched).toBeGreaterThan(15);
    expect(store.search("bun").length).toBeGreaterThan(0);
    await store.close();
  }, 180_000);
});
