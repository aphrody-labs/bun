import { existsSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
const root = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !existsSync(root)) throw new Error("Usage: serve-preview.ts <preview-dir>");
const overlay = process.argv[3] ? resolve(process.argv[3]) : null;
if (overlay && !existsSync(overlay)) throw new Error("Fusion overlay directory is missing");
const port = Number(process.argv[4] ?? 8799);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid preview port");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (path.includes("\\") || path.includes("\0")) return new Response(null, { status: 400 });
    let file = resolve(root, "." + path);
    if (file !== root && !file.startsWith(root + sep)) return new Response(null, { status: 404 });
    if (existsSync(file) && statSync(file).isDirectory()) file = resolve(file, "index.html");
    if (overlay) {
      let candidate = resolve(overlay, "." + path);
      if (candidate !== overlay && !candidate.startsWith(overlay + sep)) return new Response(null, { status: 404 });
      if (existsSync(candidate) && statSync(candidate).isDirectory()) candidate = resolve(candidate, "index.html");
      if (existsSync(candidate)) file = candidate;
    }
    if (!existsSync(file)) return new Response(null, { status: 404 });
    return new Response(request.method === "HEAD" ? null : Bun.file(file), {
      headers: {
        "cache-control": "no-store",
        "x-bun-mirror": "staging",
        "content-security-policy":
          "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.aphrody.com; font-src 'self' https://cdn.aphrody.com; img-src 'self' https: data:; media-src 'self' https:; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self' https://api.github.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
    });
  },
});
console.log(`Mirror preview listening on ${server.url}`);
