// Static site: embedded in the compiled binary (assets.gen.ts) or read from APHRODY_ASSETS_DIR.
import { existsSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";

export type AssetSource = { get(path: string): Blob | undefined };

export function diskAssets(dir: string): AssetSource {
  const root = normalize(dir);
  return {
    get(path) {
      const full = normalize(join(root, path));
      if (full !== root && !full.startsWith(root + sep)) return undefined;
      return existsSync(full) && statSync(full).isFile() ? Bun.file(full) : undefined;
    },
  };
}

export function mapAssets(files: Record<string, string>): AssetSource {
  return { get: path => (path in files ? Bun.file(files[path]!) : undefined) };
}

const long = "public, max-age=3600";

/** Mirrors the Worker's assets config: drop-trailing-slash HTML handling, 404.html for misses. */
export function serveStatic(assets: AssetSource, request: Request): Response {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  let path: string;
  try {
    path = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (path.includes("\0") || path.split("/").includes("..")) return new Response("bad request", { status: 400 });
  const trimmed = path.replace(/\/+$/, "") || "/";
  const rel = trimmed.replace(/^\/+/, "");
  const candidates = trimmed === "/" ? ["index.html"] : [rel, `${rel}.html`, `${rel}/index.html`];
  for (const candidate of candidates) {
    const blob = assets.get(candidate);
    if (!blob) continue;
    if (path !== "/" && path.endsWith("/")) return new Response(null, { status: 308, headers: { Location: trimmed } });
    return respond(assets, request, candidate, blob, 200);
  }
  const notFound = assets.get("404.html");
  return notFound ? respond(assets, request, "404.html", notFound, 404) : new Response("not found", { status: 404 });
}

function respond(assets: AssetSource, request: Request, name: string, blob: Blob, status: number): Response {
  const headers = new Headers({
    "Content-Type": blob.type || "application/octet-stream",
    "Cache-Control": /\.(html|json)$/.test(name) || status === 404 ? "no-cache" : long,
    "X-Content-Type-Options": "nosniff",
  });
  let body: Blob = blob;
  if (/\bgzip\b/.test(request.headers.get("Accept-Encoding") ?? "")) {
    const gz = assets.get(`${name}.gz`);
    if (gz) {
      body = gz;
      headers.set("Content-Encoding", "gzip");
      headers.append("Vary", "Accept-Encoding");
    }
  }
  headers.set("Content-Length", String(body.size));
  return new Response(request.method === "HEAD" ? null : body, { status, headers });
}
