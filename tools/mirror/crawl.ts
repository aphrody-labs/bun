// Crawl driver. The main thread owns the store; a pool of Workers does the network and the hashing.
// Every result is committed to SQLite as it arrives, so an interrupted crawl resumes where it stopped,
// and a second run only revalidates (ETag / Last-Modified) what is older than `max_age_hours`.
import type { Config } from "./config.ts";
import type { FetchJob, FetchResult } from "./crawl.worker.ts";
import { companionUrls, scanHtml, scanScript } from "./html.ts";
import { readSitemap } from "./sitemap.ts";
import type { Page, Store } from "./store.ts";

export interface CrawlOptions {
  /** Stop after this many fetches (pages and assets). */
  limit?: number;
  /** Only sitemap URLs whose path matches this glob. */
  match?: string;
  /** Also fetch the same-origin assets pages reference. Default true. */
  assets?: boolean;
  onProgress?: (done: number, total: number, page: Page) => void;
  now?: () => number;
}
export interface CrawlReport {
  sitemap: number;
  fetched: number;
  unchanged: number;
  failed: number;
  assets: number;
  bytes: number;
  manifest: string;
  ms: number;
}

const isHtml = (contentType: string | null): boolean => !!contentType && /text\/html|application\/xhtml/i.test(contentType);

export async function crawl(cfg: Config, store: Store, opts: CrawlOptions = {}): Promise<CrawlReport> {
  const now = opts.now ?? Date.now;
  const started = Bun.nanoseconds();
  const release = await store.lock("crawl", 6 * 3600, now());
  if (!release) throw new Error("another crawl holds the lock");
  const report: CrawlReport = { sitemap: 0, fetched: 0, unchanged: 0, failed: 0, assets: 0, bytes: 0, manifest: "", ms: 0 };
  const workers: Worker[] = [];
  try {
    await store.pullIndex();
    let urls = await readSitemap(cfg, store);
    if (opts.match) {
      const glob = new Bun.Glob(opts.match);
      urls = urls.filter((u) => glob.match(new URL(u).pathname));
    }
    report.sitemap = urls.length;
    store.enqueue(urls, "page");

    const wanted = new Set(urls);
    const maxAge = cfg.crawl.max_age_hours * 3600_000;
    const inFlight = new Map<number, Page>();
    const idle: Worker[] = [];
    let queue: Page[] = [];
    let nextId = 0;
    let budget = opts.limit ?? Infinity;
    let total = 0;
    let settle!: () => void;
    let fail!: (err: unknown) => void;
    const finished = new Promise<void>((res, rej) => ((settle = res), (fail = rej)));

    const refill = (): void => {
      // With `match`, pages outside the selection wait for another run; assets always go.
      queue = store.due(maxAge, cfg.crawl.retries, -1, now()).filter((p) => !inFlightUrls.has(p.url) && (p.kind === "asset" ? opts.assets !== false : wanted.has(p.url)));
      total = report.fetched + report.unchanged + report.failed + queue.length + inFlight.size;
    };
    const inFlightUrls = new Set<string>();

    const pump = (): void => {
      while (idle.length && budget > 0) {
        if (!queue.length) refill();
        const page = queue.shift();
        if (!page) break;
        budget--;
        const id = nextId++;
        inFlight.set(id, page);
        inFlightUrls.add(page.url);
        const job: FetchJob = { id, url: page.url, etag: page.etag, lastModified: page.last_modified, userAgent: cfg.origin.user_agent, timeoutMs: cfg.crawl.timeout_ms, retries: cfg.crawl.retries, delayMs: cfg.crawl.delay_ms };
        idle.pop()!.postMessage(job);
      }
      if (inFlight.size === 0) settle();
    };

    // What a page or script brings along; also run on a revalidated (304) copy, so a run completes a mirror
    // crawled before a discovery rule existed.
    const discover = async (page: Page, bytes: Uint8Array, contentType: string | null | undefined): Promise<void> => {
      if (page.kind === "page" && isHtml(contentType)) {
        const scan = await scanHtml(bytes, page.url, cfg);
        store.index(page.url, scan.title, scan.text);
        if (opts.assets !== false) report.assets += store.enqueue([...scan.assets, ...companionUrls(page.url, cfg)], "asset");
      } else if (page.kind === "asset" && opts.assets !== false && /\.m?js$/.test(new URL(page.url).pathname)) {
        report.assets += store.enqueue(scanScript(bytes, page.url, cfg), "asset");
      }
    };

    const commit = async (r: FetchResult): Promise<void> => {
      const page = inFlight.get(r.id)!;
      const next: Page = { ...page, status: r.status, attempts: page.attempts + r.attempts, fetched_at: now(), error: r.error };
      if (r.notModified) {
        next.state = "done";
        report.unchanged++;
        const kept = page.hash ? await store.getBlob(page.hash) : null;
        if (kept) await discover(page, kept, page.content_type);
      } else if (r.body && r.hash) {
        const bytes = new Uint8Array(r.body);
        await store.putBlob(bytes, r.hash);
        Object.assign(next, { state: "done", hash: r.hash, bytes: bytes.byteLength, etag: r.etag, last_modified: r.lastModified, content_type: r.contentType, attempts: 0 });
        report.fetched++;
        report.bytes += bytes.byteLength;
        await discover(page, bytes, r.contentType);
      } else {
        // 404 and 410 will not come back; everything else is retried by a later run.
        next.state = r.status === 404 || r.status === 410 ? "gone" : "failed";
        report.failed++;
      }
      store.save(next);
      inFlight.delete(r.id);
      inFlightUrls.delete(page.url);
      opts.onProgress?.(report.fetched + report.unchanged + report.failed, total, next);
    };

    for (let i = 0; i < Math.max(1, cfg.crawl.concurrency); i++) {
      const worker = new Worker(new URL("./crawl.worker.ts", import.meta.url).href);
      worker.onmessage = (event: MessageEvent<FetchResult>) => {
        commit(event.data).then(() => (idle.push(worker), pump()), fail);
      };
      worker.onerror = (event) => fail(new Error(`crawl worker: ${event.message}`));
      workers.push(worker);
      idle.push(worker);
    }
    refill();
    pump();
    await finished;

    const manifest = store.manifest();
    report.manifest = manifest.hash;
    store.db.query("INSERT OR REPLACE INTO runs (id, started_at, finished_at, manifest, pages, bytes) VALUES (?, ?, ?, ?, ?, ?)").run(Bun.randomUUIDv7(), now(), now(), manifest.hash, manifest.pages, manifest.bytes);
    await store.set("manifest", manifest.hash);
    await store.pushIndex();
  } finally {
    for (const worker of workers) worker.terminate();
    await release();
  }
  report.ms = Math.round((Bun.nanoseconds() - started) / 1e6);
  return report;
}
