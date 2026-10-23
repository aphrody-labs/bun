// SPDX-License-Identifier: Apache-2.0
/**
 * Brand assets served from the origin root (favicon, icons, manifest, social card, robots.txt). Each file is imported
 * with `type: "file"` so that `bun build --compile` embeds it: a compiled executable has no public/ directory on disk.
 */
import { isAbsolute, join } from "node:path";
import appleTouchIcon from "../../public/apple-touch-icon.png" with { type: "file" };
import faviconIco from "../../public/favicon.ico" with { type: "file" };
import favicon16 from "../../public/favicon-16.png" with { type: "file" };
import favicon32 from "../../public/favicon-32.png" with { type: "file" };
import faviconSvg from "../../public/favicon.svg" with { type: "file" };
import icon192 from "../../public/icons/icon-192.png" with { type: "file" };
import icon512 from "../../public/icons/icon-512.png" with { type: "file" };
import logoSvg from "../../public/logo.svg" with { type: "file" };
import manifest from "../../public/manifest.webmanifest" with { type: "file" };
import maskable512 from "../../public/icons/maskable-512.png" with { type: "file" };
import og from "../../public/og.png" with { type: "file" };
import robots from "../../public/robots.txt" with { type: "file" };

/**
 * Source runs and compiled executables import an absolute path; `bun build --target bun` emits one relative to the
 * bundle (dist/), which Bun.file would resolve against the working directory.
 */
const place = (file: string) => (isAbsolute(file) ? file : join(import.meta.dir, file));

interface Asset {
  file: string;
  type: string;
  /** Seconds. Icons rarely change; the manifest and robots.txt are revalidated sooner. */
  maxAge: number;
}

export const ASSETS: Readonly<Record<string, Asset>> = {
  "/favicon.ico": { file: faviconIco, type: "image/x-icon", maxAge: 86400 },
  "/favicon.svg": { file: faviconSvg, type: "image/svg+xml", maxAge: 86400 },
  "/favicon-16.png": { file: favicon16, type: "image/png", maxAge: 86400 },
  "/favicon-32.png": { file: favicon32, type: "image/png", maxAge: 86400 },
  "/apple-touch-icon.png": { file: appleTouchIcon, type: "image/png", maxAge: 86400 },
  "/apple-touch-icon-precomposed.png": { file: appleTouchIcon, type: "image/png", maxAge: 86400 },
  "/logo.svg": { file: logoSvg, type: "image/svg+xml", maxAge: 86400 },
  "/icons/icon-192.png": { file: icon192, type: "image/png", maxAge: 86400 },
  "/icons/icon-512.png": { file: icon512, type: "image/png", maxAge: 86400 },
  "/icons/maskable-512.png": { file: maskable512, type: "image/png", maxAge: 86400 },
  "/og.png": { file: og, type: "image/png", maxAge: 3600 },
  "/manifest.webmanifest": { file: manifest, type: "application/manifest+json", maxAge: 3600 },
  "/robots.txt": { file: robots, type: "text/plain; charset=utf-8", maxAge: 3600 },
};

/** Bun.serve routes for every asset; GET and HEAD only. */
export function assetRoutes(): Record<string, (request: Request) => Response> {
  return Object.fromEntries(
    Object.entries(ASSETS).map(([path, asset]) => [
      path,
      (request: Request) => {
        if (request.method !== "GET" && request.method !== "HEAD")
          return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
        const file = Bun.file(place(asset.file));
        return new Response(request.method === "HEAD" ? null : file, {
          headers: {
            "content-type": asset.type,
            "content-length": String(file.size),
            "cache-control": `public, max-age=${asset.maxAge}`,
            "x-content-type-options": "nosniff",
          },
        });
      },
    ]),
  );
}
