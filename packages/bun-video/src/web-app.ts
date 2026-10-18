// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createCrunchyrollShortcutsHandler } from "./apps/crunchyroll-shortcuts";
import { createCrunchyrollApi, type CrunchyrollApiOptions } from "./crunchyroll-api";
import { createDashLab } from "./apps/dash-live";

export interface VideoWebAppOptions {
  /** Directory that local media paths must stay inside. */
  readonly mediaRoot: string;
  /** Bearer token and upstream client for private Crunchyroll metadata routes. */
  readonly crunchyroll?: CrunchyrollApiOptions;
  /** Public origin used to rewrite lab URLs; defaults to the origin of the first lab request. */
  readonly publicOrigin?: string;
  /** Captured or authorized live DASH source for the mounted lab under /labs/dash/. */
  readonly dashLab?: { readonly inputPath: string; readonly mode?: "capture" | "live" };
}

export interface VideoWebApp {
  readonly fetch: (request: Request) => Promise<Response>;
}

const MEDIA_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm"]);

const labs = [
  { id: "dash", title: "DASH lab", command: "bun bd run ./packages/bun-video/src/apps/dash-live.ts" },
  { id: "hls", title: "HLS lab", command: "bun bd run ./packages/bun-video/src/apps/hls-live.ts" },
  { id: "crunchyroll-shortcuts", title: "Raccourcis Crunchyroll", command: "/pwa/ et /extension/ (intégrés)" },
] as const;

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });

/** Resolves a caller-supplied media path, refusing anything outside the configured root. */
export function resolveMediaPath(root: string, input: string | null): string | undefined {
  if (!input || input.length > 1024 || input.includes("\0")) return undefined;
  const base = resolve(root);
  const target = resolve(base, input);
  const rel = relative(base, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes("..")) return undefined;
  return target;
}

async function loaded(load: () => Promise<unknown>): Promise<boolean> {
  try {
    await load();
    return true;
  } catch {
    return false;
  }
}

/** Bundles the studio client once, lazily, from its TSX entry. */
let studioBundle: Promise<string> | undefined;
function studioScript(): Promise<string> {
  studioBundle ??= (async () => {
    const build = await Bun.build({
      entrypoints: [resolve(import.meta.dir, "apps/web-studio.tsx")],
      target: "browser",
      format: "esm",
      minify: true,
      define: { "process.env.NODE_ENV": '"production"' },
    });
    if (!build.success) throw new Error("Studio bundle failed");
    return await build.outputs[0]!.text();
  })();
  return studioBundle;
}

const page = (title: string, body: string) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font:15px system-ui,sans-serif;margin:2rem;max-width:960px;color:#111}code{background:#f2f2f2;padding:.1rem .3rem}li{margin:.4rem 0}</style>
</head><body>${body}</body></html>`;

/** One Bun.serve-compatible app: media, studio, Crunchyroll, shortcuts, labs and composition status. */
export function createVideoWebApp(options: VideoWebAppOptions): VideoWebApp {
  const crunchyroll = createCrunchyrollApi(options.crunchyroll ?? {});
  const shortcuts = createCrunchyrollShortcutsHandler();
  let dashLab: ReturnType<typeof createDashLab> | undefined;

  const routes = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/labs/dash/")) {
      if (!options.dashLab) return json({ error: "lab_not_configured" }, 404);
      if (!dashLab) {
        dashLab = createDashLab({
          ...options.dashLab,
          origin: options.publicOrigin ?? url.origin,
          prefix: "/labs/dash/",
        });
        dashLab.catch(() => (dashLab = undefined));
      }
      const lab = await dashLab;
      return lab.fetch(request);
    }

    if (path.startsWith("/api/crunchyroll")) {
      const forwarded = new URL(request.url);
      forwarded.pathname = path.slice("/api/crunchyroll".length) || "/";
      return crunchyroll(new Request(forwarded, request));
    }

    if (path.startsWith("/pwa/") || path.startsWith("/extension/") || path === "/health") return shortcuts(request);

    if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method_not_allowed" }, 405);

    if (path === "/api/health")
      return json({
        status: "ok",
        video: { available: Bun.Video.available, decoder: Bun.Video.decoder, backend: Bun.Video.backend },
        labs: labs.map(({ id, title }) => ({ id, title })),
      });

    if (path === "/api/video/library") {
      const entries = await readdir(resolve(options.mediaRoot), { withFileTypes: true }).catch(() => []);
      const assets = entries
        .filter(entry => entry.isFile() && MEDIA_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase()))
        .map(entry => ({
          id: entry.name,
          title: entry.name,
          src: `/media/${encodeURIComponent(entry.name)}`,
        }));
      return json({ assets });
    }

    if (path.startsWith("/media/")) {
      const file = resolveMediaPath(options.mediaRoot, decodeURIComponent(path.slice("/media/".length)));
      if (!file) return json({ error: "invalid_media_path" }, 400);
      const blob = Bun.file(file);
      if (!(await blob.exists())) return json({ error: "not_found" }, 404);
      return new Response(request.method === "HEAD" ? null : blob, { headers: { "cache-control": "no-store" } });
    }

    if (path === "/api/video/metadata") {
      const file = resolveMediaPath(options.mediaRoot, url.searchParams.get("src"));
      if (!file) return json({ error: "invalid_media_path" }, 400);
      if (!Bun.Video.available) return json({ error: "video_provider_unavailable" }, 503);
      try {
        return json(await new Bun.Video(file).metadata());
      } catch {
        return json({ error: "media_unreadable" }, 422);
      }
    }

    if (path === "/api/video/frame") {
      const file = resolveMediaPath(options.mediaRoot, url.searchParams.get("src"));
      const seconds = Number(url.searchParams.get("t") ?? "0");
      if (!file) return json({ error: "invalid_media_path" }, 400);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) return json({ error: "invalid_time" }, 400);
      if (!Bun.Video.available) return json({ error: "video_provider_unavailable" }, 503);
      try {
        const bytes = await new Bun.Video(file).frame(seconds).resize(640).jpeg({ quality: 85 }).bytes();
        return new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } });
      } catch {
        return json({ error: "frame_unavailable" }, 422);
      }
    }

    if (path === "/api/compositions") {
      const [remotion, hyperframes] = await Promise.all([
        loaded(() => import("./render-runtime").then(m => m.loadRemotionCore())),
        loaded(() => import("./render-runtime").then(m => m.loadHyperframesCore())),
      ]);
      return json({ remotion: { loaded: remotion }, hyperframes: { loaded: hyperframes } });
    }

    if (path === "/studio/app.js") {
      try {
        return new Response(await studioScript(), { headers: { "content-type": "text/javascript; charset=utf-8" } });
      } catch {
        return json({ error: "studio_unavailable" }, 500);
      }
    }

    if (path === "/studio/" || path === "/studio")
      return new Response(
        page(
          "Studio vidéo",
          `<div id="root"></div><script type="module" src="/studio/app.js"></script>`,
        ),
        { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
      );

    if (path === "/") {
      const items = labs.map(l => `<li>${l.title} : <code>${l.command}</code></li>`).join("");
      return new Response(
        page(
          "Bun Video",
          `<h1>Bun Video</h1>
<h2>Studio</h2><ul><li><a href="/studio/">/studio/</a> : lecteur et bibliothèque</li></ul>
<h2>Serveur vidéo</h2>
<ul>
<li><a href="/api/health">/api/health</a> : état du fournisseur natif</li>
<li><a href="/api/video/library">/api/video/library</a> ; <code>/api/video/metadata?src=</code> ; <code>/api/video/frame?src=&amp;t=</code></li>
</ul>
<h2>Crunchyroll</h2>
<ul><li><a href="/api/crunchyroll/health">/api/crunchyroll/health</a> ; <code>/api/crunchyroll/v1/watch?url=</code></li>
<li><a href="/pwa/">/pwa/</a> ; <code>/extension/</code></li></ul>
<h2>Labs</h2><ul>${items}</ul>
<h2>Remotion et HyperFrames</h2>
<ul><li><a href="/api/compositions">/api/compositions</a> : chargement des runtimes de composition</li></ul>`,
        ),
        { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
      );
    }

    return json({ error: "not_found" }, 404);
  };

  return { fetch: routes };
}

