import { dns } from "bun";

export interface SourceProbe {
  url: string;
  host: string;
  port: number;
  addresses: string[];
  dnsMs: number;
  tcpMs: number;
  tlsMs?: number;
  status?: number;
  acceptRanges: boolean;
  contentType?: string;
  contentLength?: number;
  ok: boolean;
  error?: string;
}

const TIMEOUT_MS = 10_000;

function withDeadline<T>(promise: Promise<T>, label: string, ms = TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** Opens a TCP (optionally TLS) connection and reports the time to open and to complete the handshake. */
export async function connectTiming(
  hostname: string,
  port: number,
  tls: boolean,
): Promise<{ tcpMs: number; tlsMs?: number }> {
  const started = performance.now();
  const opened = await withDeadline(
    new Promise<number>((resolve, reject) => {
      Bun.connect({
        hostname,
        port,
        tls: tls ? { serverName: hostname } : undefined,
        socket: {
          open(socket) {
            const at = performance.now();
            if (!tls) {
              socket.end();
              resolve(at);
            }
          },
          handshake(socket, success, error) {
            if (!success) return reject(error ?? new Error("TLS handshake failed"));
            socket.end();
            resolve(performance.now());
          },
          data() {},
          error(_socket, error) {
            reject(error);
          },
          close() {},
          connectError(_socket, error) {
            reject(error);
          },
        },
      }).catch(reject);
    }),
    `connect ${hostname}:${port}`,
  );
  const tcpMs = Math.round(opened - started);
  return tls ? { tcpMs, tlsMs: Math.round(performance.now() - opened) } : { tcpMs };
}

/** Probes a media URL before download: DNS, TCP/TLS timing, then one ranged GET to read range support and size. */
export async function probeSource(input: string): Promise<SourceProbe> {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new TypeError("probeSource accepts http(s) URLs only");
  const tls = url.protocol === "https:";
  const port = Number(url.port || (tls ? 443 : 80));
  const base: SourceProbe = {
    url: url.href,
    host: url.hostname,
    port,
    addresses: [],
    dnsMs: 0,
    tcpMs: 0,
    acceptRanges: false,
    ok: false,
  };
  try {
    const dnsStarted = performance.now();
    const records = await withDeadline(dns.lookup(url.hostname, { backend: "system" }), `dns ${url.hostname}`);
    base.dnsMs = Math.round(performance.now() - dnsStarted);
    base.addresses = [...new Set(records.map(record => record.address))];
    const timing = await connectTiming(url.hostname, port, tls);
    base.tcpMs = timing.tcpMs;
    if (timing.tlsMs !== undefined) base.tlsMs = timing.tlsMs;
    const response = await withDeadline(
      fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, redirect: "follow" }),
      `GET ${url.hostname}`,
    );
    await response.body?.cancel();
    base.status = response.status;
    base.acceptRanges = response.status === 206 || response.headers.get("accept-ranges") === "bytes";
    base.contentType = response.headers.get("content-type") ?? undefined;
    const total = response.headers.get("content-range")?.split("/")[1];
    const length = total && total !== "*" ? Number(total) : Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > 0) base.contentLength = length;
    base.ok = (response.status >= 200 && response.status < 300) || response.status === 206;
  } catch (error) {
    base.error = error instanceof Error ? error.message : String(error);
  }
  return base;
}

/** Probes several sources concurrently, bounded by `concurrency`. */
export async function probeSources(urls: string[], concurrency = 4): Promise<SourceProbe[]> {
  const results: SourceProbe[] = new Array(urls.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (next < urls.length) {
      const index = next++;
      results[index] = await probeSource(urls[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}
