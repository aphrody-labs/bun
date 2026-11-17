// Crawl worker: one conditional GET per message, with retries. It hashes the body off the main
// thread and transfers the bytes back; it never touches the store.
declare var self: Worker;

export interface FetchJob {
  id: number;
  url: string;
  etag: string | null;
  lastModified: string | null;
  userAgent: string;
  timeoutMs: number;
  retries: number;
  delayMs: number;
}
export interface FetchResult {
  id: number;
  url: string;
  status: number;
  notModified: boolean;
  etag: string | null;
  lastModified: string | null;
  contentType: string | null;
  hash: string | null;
  body: ArrayBuffer | null;
  attempts: number;
  error: string | null;
}

async function run(job: FetchJob): Promise<FetchResult> {
  const out: FetchResult = { id: job.id, url: job.url, status: 0, notModified: false, etag: null, lastModified: null, contentType: null, hash: null, body: null, attempts: 0, error: null };
  const headers: Record<string, string> = { "user-agent": job.userAgent, accept: "*/*" };
  if (job.etag) headers["if-none-match"] = job.etag;
  if (job.lastModified) headers["if-modified-since"] = job.lastModified;
  for (let attempt = 1; attempt <= job.retries; attempt++) {
    out.attempts = attempt;
    try {
      const res = await fetch(job.url, { headers, redirect: "follow", signal: AbortSignal.timeout(job.timeoutMs) });
      out.status = res.status;
      if (res.status === 304) {
        out.notModified = true;
        out.error = null;
        return out;
      }
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || 500 * 2 ** attempt;
        out.error = `HTTP ${res.status}`;
        await res.body?.cancel();
        if (attempt < job.retries) await Bun.sleep(Math.min(wait, 30_000));
        continue;
      }
      const body = await res.arrayBuffer();
      out.etag = res.headers.get("etag");
      out.lastModified = res.headers.get("last-modified");
      out.contentType = res.headers.get("content-type");
      if (res.ok) {
        out.hash = new Bun.CryptoHasher("sha256").update(body).digest("hex");
        out.body = body;
        out.error = null;
      } else {
        out.error = `HTTP ${res.status}`;
      }
      return out;
    } catch (err) {
      out.error = err instanceof Error ? err.message : String(err);
      if (attempt < job.retries) await Bun.sleep(500 * 2 ** attempt);
    }
  }
  return out;
}

self.onmessage = async (event: MessageEvent<FetchJob>) => {
  const result = await run(event.data);
  if (event.data.delayMs > 0) await Bun.sleep(event.data.delayMs);
  if (result.body) postMessage(result, [result.body]);
  else postMessage(result);
};
