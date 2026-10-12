// SPDX-License-Identifier: Apache-2.0
import { lstat, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { GooglePublicSearchPage, GooglePublicSearchRequest } from "../../bun-google/src/search.ts";

export type PublicGoogleSearch = (
  request: GooglePublicSearchRequest,
  signal?: AbortSignal,
) => Promise<GooglePublicSearchPage>;
export interface M3SiteOptions {
  staticRoot: string;
  search?: PublicGoogleSearch;
  searchConcurrency?: number;
  /** Public catalog routes supplied by their existing owner; no provider credential access. */
  publicCatalog?: (request: Request) => Promise<Response | undefined>;
}

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};
const headers = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store" };
function json(value: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { ...headers, ...extra } });
}
function badPath(path: string) {
  return (
    /[%\\:\x00-\x1f\x7f]/.test(path) ||
    path.split("/").some(segment => segment === "." || segment === ".." || segment.startsWith("."))
  );
}

class UnsafeStaticPath extends Error {}

export async function createM3Site(options: M3SiteOptions) {
  if (!options.staticRoot || !isAbsolute(options.staticRoot))
    throw TypeError("An explicit absolute canonical app-ui root is required");
  const root = await realpath(resolve(options.staticRoot));
  const capacity = options.searchConcurrency ?? 4;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4)
    throw TypeError("Search concurrency must be between 1 and 4");
  async function asset(path: string): Promise<string | undefined> {
    if (!path || badPath(path)) return undefined;
    const parts = path.split("/");
    if (parts.some(part => !part)) return undefined;
    let cursor = root;
    try {
      for (const [index, part] of parts.entries()) {
        cursor = join(cursor, part);
        const stat = await lstat(cursor);
        if (stat.isSymbolicLink()) throw new UnsafeStaticPath();
        if (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()) return undefined;
      }
      const actual = await realpath(cursor),
        local = relative(root, actual);
      if (!local || isAbsolute(local) || local === ".." || local.startsWith(".." + sep)) throw new UnsafeStaticPath();
      return actual;
    } catch (error) {
      if (error instanceof UnsafeStaticPath) throw error;
      return undefined;
    }
  }
  if (!(await asset("index.html"))) throw Error("Canonical app-ui index.html is missing or unsafe");
  let active = 0;
  async function publicSearch(request: Request): Promise<Response> {
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405, { allow: "GET" });
    const params = new URL(request.url).searchParams,
      allowed = new Set(["query", "vertical", "hl", "safe", "start"]);
    const query = params.get("query")?.trim() ?? "",
      hl = params.get("hl") ?? "en",
      start = params.get("start") ?? "0";
    if (
      [...params.keys()].some(key => !allowed.has(key) || params.getAll(key).length !== 1) ||
      !query ||
      new TextEncoder().encode(query).byteLength > 1024 ||
      /[\x00-\x1f\x7f]/.test(query) ||
      (params.get("vertical") ?? "web") !== "web" ||
      (params.get("safe") ?? "active") !== "active" ||
      !/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(hl) ||
      !/^\d{1,2}$/.test(start) ||
      Number(start) > 90
    )
      return json({ error: "invalid public search request" }, 400);
    if (!options.search) return json({ error: "Search is temporarily unavailable" }, 502);
    if (active >= capacity) return json({ error: "Search is busy" }, 429, { "retry-after": "1" });
    const deadline = new AbortController(),
      timer = setTimeout(() => deadline.abort(new DOMException("Search timed out", "TimeoutError")), 20000);
    const signal = AbortSignal.any([request.signal, deadline.signal]);
    active++;
    let removeAbort = () => {};
    try {
      const aborted = new Promise<never>((_, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        removeAbort = () => signal.removeEventListener("abort", abort);
      });
      const pending = Promise.resolve().then(() => {
        signal.throwIfAborted();
        return options.search!({ query, hl, start: Number(start), vertical: "web", safe: "active", num: 10 }, signal);
      });
      pending.then(
        () => {
          active--;
        },
        () => {
          active--;
        },
      );
      signal.throwIfAborted();
      const result = await Promise.race([pending, aborted]);
      if (
        result.authenticated !== false ||
        result.query !== query ||
        !Array.isArray(result.organic) ||
        result.organic.length > 10
      )
        throw Error("Invalid anonymous owner response");
      for (const hit of result.organic) {
        const url = new URL(hit.url);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          typeof hit.title !== "string" ||
          typeof hit.snippet !== "string"
        )
          throw Error("Invalid public result");
      }
      const projected = {
        query: result.query,
        organic: result.organic.map(hit => ({ title: hit.title, url: hit.url, snippet: hit.snippet })),
        authenticated: false,
        ...(typeof result.correctedQuery === "string" ? { correctedQuery: result.correctedQuery } : {}),
      };
      if (new TextEncoder().encode(JSON.stringify(projected)).byteLength > 1024 * 1024)
        throw Error("Public search output exceeds limit");
      return json(projected);
    } catch {
      return signal.aborted
        ? json({ error: "Search timed out" }, 504)
        : json({ error: "Search is temporarily unavailable" }, 502);
    } finally {
      clearTimeout(timer);
      removeAbort();
    }
  }
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url),
      path = url.pathname;
    if (path === "/api/search") return publicSearch(request);
    if (!["GET", "HEAD"].includes(request.method))
      return json({ error: "method not allowed" }, 405, { allow: "GET, HEAD" });
    if (path === "/health" || path === "/healthz") return new Response(null, { status: 204, headers });
    if (path === "/api/capabilities") {
      const response = json({
        runtime: "bun",
        ui: "canonical-m3-app-ui",
        search: { provider: "google", anonymous: true, configured: !!options.search, safe: "active" },
        privilegedGoogle: { available: false, requiresAuthentication: true },
        chromium: { embedded: false },
        engines: { parityQualified: false },
      });
      return request.method === "HEAD"
        ? new Response(null, { status: response.status, headers: response.headers })
        : response;
    }
    if (
      ["api", "rpc", "events", "notifications"].some(
        segment => path === "/" + segment || path.startsWith("/" + segment + "/"),
      )
    )
      return (await options.publicCatalog?.(request)) ?? new Response(null, { status: 404, headers });
    const local = path.slice(1);
    if (badPath(local)) return new Response(null, { status: 404, headers });
    let file: string | undefined;
    try {
      file = await asset(local || "index.html");
      if (
        !file &&
        !local.includes(".") &&
        (!request.headers.get("accept") || request.headers.get("accept")!.includes("text/html"))
      )
        file = await asset("index.html");
    } catch {
      return new Response(null, { status: 404, headers });
    }
    if (!file) return new Response(null, { status: 404, headers });
    const body = Bun.file(file),
      info = await stat(file);
    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        ...headers,
        "cache-control": "no-cache",
        "content-type": types[extname(file).toLowerCase()] ?? "application/octet-stream",
        "content-length": String(info.size),
      },
    });
  };
}

export async function serveM3Site(options: M3SiteOptions & { hostname: string; port: number }) {
  if (!options.hostname || !Number.isInteger(options.port) || options.port < 0 || options.port > 65535)
    throw TypeError("Explicit hostname and valid port required");
  return Bun.serve({ hostname: options.hostname, port: options.port, fetch: await createM3Site(options) });
}
