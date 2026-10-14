import { parseArgs } from "node:util";

export type ProductionVerificationOptions = {
  origin?: string;
  expectedSource: string;
  expectedSnapshot: string;
  editorialRoutes: readonly string[];
  timeoutMilliseconds?: number;
  dnsTimeoutMilliseconds?: number;
};
const MAXIMUM_BODY = 1024 * 1024;
const sourcePattern = /^[a-f0-9]{40}$/;
const snapshotPattern = /^[a-f0-9]{64}$/;
const identity = (value: unknown, pattern: RegExp): string | null =>
  typeof value === "string" && pattern.test(value) ? value : null;
const sha = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
type RouteObservation = {
  path: string;
  status: number;
  bytes: number;
  ok: boolean;
  issue?: string;
  sha256?: string;
  value?: Record<string, any>;
};

/** DNS has no AbortSignal API: a bounded native Bun process owns and cancels only this lookup. */
async function nativeDns(hostname: string, timeout: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const environment = Object.fromEntries(
    ["SystemRoot", "WINDIR", "TEMP", "TMP"].filter(name => process.env[name]).map(name => [name, process.env[name]!]),
  );
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      'try{const host=(await Bun.stdin.text()).trim();const records=await Bun.dns.lookup(host,{backend:"system"});console.log(JSON.stringify({count:records.length,families:[...new Set(records.map(r=>r.family))]}))}catch{process.exitCode=1}',
    ],
    { stdin: new TextEncoder().encode(hostname), stdout: "pipe", stderr: "ignore", env: environment },
  );
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeout);
  const abort = () => child.kill();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    signal?.throwIfAborted();
    if (timedOut) return { status: "timeout" as const, backend: "system" as const, count: 0 };
    if (code || output.length > 4096) return { status: "unavailable" as const, backend: "system" as const, count: 0 };
    const records = JSON.parse(output);
    if (!Number.isSafeInteger(records.count) || records.count < 1)
      return { status: "unavailable" as const, backend: "system" as const, count: 0 };
    return { status: "resolved" as const, backend: "system" as const, count: records.count };
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", abort);
    if (child.exitCode === null) child.kill();
  }
}

async function route(origin: URL, path: string, timeout: number, caller?: AbortSignal): Promise<RouteObservation> {
  const signal = AbortSignal.any([...(caller ? [caller] : []), AbortSignal.timeout(timeout)]);
  let status = 0,
    bytes = 0;
  try {
    const response = await fetch(new URL(path, origin), {
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal,
      headers: { Accept: path.includes(".json") || path === "/api/site/snapshot" ? "application/json" : "text/html" },
    });
    status = response.status;
    if (status !== 200) {
      await response.body?.cancel();
      return { path, status, bytes, ok: false, issue: "http-status" };
    }
    const declared = Number(response.headers.get("content-length"));
    if (declared > MAXIMUM_BODY) {
      await response.body?.cancel();
      return { path, status, bytes, ok: false, issue: "body-limit" };
    }
    const parts: Uint8Array[] = [],
      reader = response.body?.getReader();
    if (!reader) return { path, status, bytes, ok: false, issue: "empty-body" };
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.length;
        if (bytes > MAXIMUM_BODY) throw Error("body-limit");
        parts.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.length;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body),
      hash = sha(body);
    const json = path.includes(".json") || path === "/api/site/snapshot";
    if (json) {
      if (!response.headers.get("content-type")?.startsWith("application/json"))
        return { path, status, bytes, sha256: hash, ok: false, issue: "content-type" };
      const value = JSON.parse(text);
      if (value === null || typeof value !== "object" || Array.isArray(value))
        return { path, status, bytes, sha256: hash, ok: false, issue: "metadata-shape" };
      return { path, status, bytes, sha256: hash, ok: true, value };
    }
    if (!response.headers.get("content-type")?.startsWith("text/html"))
      return { path, status, bytes, sha256: hash, ok: false, issue: "content-type" };
    let canonical = "";
    new HTMLRewriter()
      .on('link[rel="canonical"]', {
        element(element) {
          canonical = element.getAttribute("href") ?? "";
        },
      })
      .transform(text);
    const expected = new URL(path, origin).href.replace(/\/$/, ""),
      actual = canonical.replace(/\/$/, "");
    if (!text.includes("<html") || actual !== expected)
      return { path, status, bytes, sha256: hash, ok: false, issue: "html-route-mismatch" };
    return { path, status, bytes, sha256: hash, ok: true };
  } catch (error) {
    caller?.throwIfAborted();
    return {
      path,
      status,
      bytes,
      ok: false,
      issue:
        error instanceof Error && error.message === "body-limit"
          ? "body-limit"
          : signal.aborted
            ? "timeout"
            : "network-or-invalid-response",
    };
  }
}

/** GET-only native network evidence; no response text, cookies, tokens or raw headers enter the report. */
export async function verifyProduction(options: ProductionVerificationOptions, signal?: AbortSignal) {
  const origin = new URL(options.origin ?? "https://aphrody.app");
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname))) ||
    !sourcePattern.test(options.expectedSource) ||
    !snapshotPattern.test(options.expectedSnapshot)
  )
    throw TypeError("Invalid production verification scope");
  if (
    options.editorialRoutes.length > 4 ||
    new Set(options.editorialRoutes).size !== options.editorialRoutes.length ||
    options.editorialRoutes.some(path => !/^\/(guides|blog)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path))
  )
    throw TypeError("Invalid production editorial routes");
  const timeout = options.timeoutMilliseconds ?? 10000,
    dnsTimeout = options.dnsTimeoutMilliseconds ?? 5000;
  if (![timeout, dnsTimeout].every(value => Number.isInteger(value) && value >= 1 && value <= 30000))
    throw TypeError("Invalid production verification deadline");
  signal?.throwIfAborted();
  const paths = [
    "/publish.json",
    "/api/site/snapshot",
    "/site.json",
    "/editorial-provenance.json",
    "/",
    "/guides",
    "/blog",
    "/docs/runtime/yolo",
    "/docs/pm/global-store",
    ...options.editorialRoutes,
  ];
  const results: Awaited<ReturnType<typeof route>>[] = [];
  let next = 0;
  const [dns] = await Promise.all([
    nativeDns(origin.hostname, dnsTimeout, signal),
    Promise.all(
      Array.from({ length: 3 }, async () => {
        while (next < paths.length) {
          const index = next++;
          results[index] = await route(origin, paths[index]!, timeout, signal);
        }
      }),
    ),
  ]);
  signal?.throwIfAborted();
  const values = new Map(
    results.filter(result => result.ok && "value" in result).map(result => [result.path, result.value]),
  );
  const publish = values.get("/publish.json"),
    database = values.get("/api/site/snapshot"),
    site = values.get("/site.json"),
    editorial = values.get("/editorial-provenance.json");
  const observed = {
    publishSource: identity(publish?.commit, sourcePattern),
    databaseSource: identity(database?.source, sourcePattern),
    databaseSnapshot: identity(database?.id, snapshotPattern),
    siteSource: identity(site?.commit, sourcePattern),
    editorialSource: identity(editorial?.source, sourcePattern),
    editorialSnapshot: identity(editorial?.snapshot, snapshotPattern),
  };
  const issues: string[] = [];
  if (dns.status !== "resolved") issues.push("dns-unavailable");
  if (
    [observed.publishSource, observed.databaseSource, observed.siteSource, observed.editorialSource].some(
      source => source !== options.expectedSource,
    )
  )
    issues.push("source-mismatch");
  if ([observed.databaseSnapshot, observed.editorialSnapshot].some(snapshot => snapshot !== options.expectedSnapshot))
    issues.push("snapshot-mismatch");
  if (
    site?.editorial?.source !== options.expectedSource ||
    site?.editorial?.snapshot !== options.expectedSnapshot ||
    editorial?.validator !== "bun:yolo" ||
    site?.editorial?.validator !== "bun:yolo"
  )
    issues.push("editorial-evidence-mismatch");
  if (database?.profile !== "bun" || database?.repository !== "aphrody-labs/bun")
    issues.push("database-scope-mismatch");
  for (const path of options.editorialRoutes)
    if (
      !Array.isArray(editorial?.pages) ||
      !editorial.pages.some((page: { path?: string } | null) => page?.path === path)
    )
      issues.push("editorial-route-not-in-manifest");
  const routes = results.map(({ path, status, bytes, ok, issue, ...result }) => ({
    path,
    status,
    bytes,
    ok,
    ...(issue ? { issue } : {}),
    ...(result.sha256 ? { sha256: result.sha256 } : {}),
  }));
  return {
    schema: 1,
    checkedAt: new Date().toISOString(),
    origin: origin.origin,
    expectedSource: options.expectedSource,
    expectedSnapshot: options.expectedSnapshot,
    qualified: issues.length === 0 && routes.every(result => result.ok),
    dns,
    observed,
    routes,
    issues: [...new Set(issues)],
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    strict: true,
    options: {
      origin: { type: "string" },
      source: { type: "string" },
      snapshot: { type: "string" },
      "editorial-route": { type: "string", multiple: true },
      out: { type: "string" },
    },
  });
  const report = await verifyProduction({
    ...(values.origin ? { origin: values.origin } : {}),
    expectedSource: values.source ?? "",
    expectedSnapshot: values.snapshot ?? "",
    editorialRoutes: values["editorial-route"] ?? [],
  });
  if (values.out) await Bun.write(values.out, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  if (!report.qualified) process.exitCode = 1;
}
