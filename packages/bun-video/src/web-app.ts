// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createCrunchyrollShortcutsHandler } from "./apps/crunchyroll-shortcuts";
import { createCrunchyrollApi, type CrunchyrollApiOptions } from "./crunchyroll-api";
import { createDashLab } from "./apps/dash-live";
import { prepareHlsLab } from "./apps/hls-live";

export interface VideoWebAppOptions {
  /** Directory that local media paths must stay inside. */
  readonly mediaRoot: string;
  /** Bearer token and upstream client for private Crunchyroll metadata routes. */
  readonly crunchyroll?: CrunchyrollApiOptions;
  /** Public origin used to rewrite lab URLs; defaults to the origin of the first lab request. */
  readonly publicOrigin?: string;
  /** Captured or authorized live DASH source for the mounted lab under /labs/dash/. */
  readonly dashLab?: { readonly inputPath: string; readonly mode?: "capture" | "live" };
  /** Enables the HLS lab, prepared from the protected local inputs when first requested. */
  readonly hlsLab?: boolean;
  /** Mounts the video data site API under /api/ and its client under /site/. */
  readonly dataSite?: { readonly privateRoot?: string; readonly dbPath?: string };
  /** Mounts the episode workbench under /episode/ for this episode directory. */
  readonly episodeStudio?: { readonly episodeDir: string; readonly chromiumExecutable?: string };
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

/** Bundles a browser client once, lazily, from its TSX entry. */
const bundles = new Map<string, Promise<string>>();
function clientScript(entry: string): Promise<string> {
  let bundle = bundles.get(entry);
  if (!bundle) {
    bundle = (async () => {
      const build = await Bun.build({
        entrypoints: [resolve(import.meta.dir, "apps", entry)],
        target: "browser",
        format: "esm",
        minify: true,
        define: { "process.env.NODE_ENV": '"production"' },
      });
      if (!build.success) throw new Error(`${entry} bundle failed`);
      return await build.outputs[0]!.text();
    })();
    bundles.set(entry, bundle);
  }
  return bundle;
}

const shellDocument = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bun Video</title><link rel="stylesheet" href="/app/app.css"></head><body><div id="root"></div><script type="module" src="/app/app.js"></script></body></html>`;

const DATA_API = /^\/api\/(overview|query|import|export|exports\/|publish|jobs)(\/|$)/;

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
  let hlsLab: ReturnType<typeof prepareHlsLab> | undefined;
  let hls: Awaited<ReturnType<typeof prepareHlsLab>> | undefined;
  let dataSite: Promise<{ handle: (request: Request) => Promise<Response> }> | undefined;
  let episode: Promise<{ fetch: (request: Request) => Promise<Response> }> | undefined;

  const routes = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname;

    if (hls && path.startsWith(hls.prefix)) return hls.handle(request);

    if (path === "/labs/hls/" || path === "/labs/hls") {
      if (!options.hlsLab) return json({ error: "lab_not_configured" }, 404);
      hlsLab ??= prepareHlsLab(["--mounted"]).catch(() => {
        hlsLab = undefined;
        return undefined;
      });
      const prepared = await hlsLab;
      if (!prepared) return json({ error: "lab_unavailable" }, 503);
      hls = prepared;
      return Response.redirect(new URL(`${prepared.prefix}/`, url.origin), 302);
    }

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

    if (path === "/episode") return Response.redirect(new URL("/episode/", url.origin), 301);

    if (path.startsWith("/episode/") && options.episodeStudio) {
      episode ??= import("./apps/episode-studio/server")
        .then(m => m.createEpisodeServer({ ...options.episodeStudio!, listen: false }))
        .catch(error => {
          episode = undefined;
          throw error;
        });
      const mounted = new Request(new URL(path.slice("/episode".length) + url.search, url.origin), request);
      return (await episode).fetch(mounted);
    }

    if (path.startsWith("/api/crunchyroll")) {
      const forwarded = new URL(request.url);
      forwarded.pathname = path.slice("/api/crunchyroll".length) || "/";
      return crunchyroll(new Request(forwarded, request));
    }

    if (path.startsWith("/pwa/") || path.startsWith("/extension/") || path === "/health") return shortcuts(request);

    if (DATA_API.test(path) && options.dataSite) {
      dataSite ??= import("./video-data-site")
        .then(m => m.createVideoDataSite({ ...options.dataSite, listen: false }))
        .catch(error => {
          dataSite = undefined;
          throw error;
        });
      return (await dataSite).handle(request);
    }

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

    if (path === "/api/video/extract") {
      const source = url.searchParams.get("src");
      if (!source || source.length > 2048) return json({ error: "invalid_source" }, 400);
      const parsed = URL.canParse(source) ? new URL(source) : undefined;
      if (!parsed || !["http:", "https:"].includes(parsed.protocol)) return json({ error: "invalid_source" }, 400);
      try {
        const { extractYtDlp } = await import("./ytdlp");
        return json(await extractYtDlp(parsed.href));
      } catch {
        return json({ error: "extraction_failed" }, 422);
      }
    }

    if (path === "/api/compositions") {
      const [remotion, hyperframes] = await Promise.all([
        loaded(() => import("./render-runtime").then(m => m.loadRemotionCore())),
        loaded(() => import("./render-runtime").then(m => m.loadHyperframesCore())),
      ]);
      return json({ remotion: { loaded: remotion }, hyperframes: { loaded: hyperframes } });
    }

    if (path === "/site/" || path === "/site")
      return new Response(
        page("Données vidéo", `<div id="root"></div><script type="module" src="/site/app.js"></script>`),
        { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
      );

    if (path === "/site/app.js") {
      try {
        return new Response(await clientScript("video-data-site-client.tsx"), {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        });
      } catch {
        return json({ error: "site_unavailable" }, 500);
      }
    }

    if (path === "/studio/app.js") {
      try {
        return new Response(await clientScript("web-studio.tsx"), {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        });
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

    if (path === "/app/app.js") {
      try {
        return new Response(await clientScript("web-app.tsx"), {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        });
      } catch {
        return json({ error: "app_unavailable" }, 500);
      }
    }

    if (path === "/app/app.css")
      return new Response(Bun.file(resolve(import.meta.dir, "apps/web-app.css")), {
        headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" },
      });

    if (path === "/") return new Response(shellDocument, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

    return json({ error: "not_found" }, 404);
  };

  return { fetch: routes };
}

