// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createCrunchyrollApi, type CrunchyrollApiOptions } from "./crunchyroll-api";

export interface VideoWebAppOptions {
  /** Directory that local media paths must stay inside. */
  readonly mediaRoot: string;
  /** Bearer token for private Crunchyroll metadata routes. */
  readonly crunchyroll?: CrunchyrollApiOptions;
}

export interface VideoWebApp {
  readonly fetch: (request: Request) => Promise<Response>;
}

const labs = [
  { id: "dash", title: "DASH lab", command: "bun bd run ./scripts/aphrody/dash-lab.ts --check" },
  { id: "hls", title: "HLS lab", command: "bun bd run ./packages/bun-video/src/apps/hls-live.ts" },
  { id: "crunchyroll-shortcuts", title: "Raccourcis Crunchyroll", command: "bun bd run ./scripts/aphrody/crunchyroll-shortcuts.ts" },
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

const page = (title: string, body: string) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font:15px system-ui,sans-serif;margin:2rem;max-width:960px;color:#111}code{background:#f2f2f2;padding:.1rem .3rem}li{margin:.4rem 0}</style>
</head><body>${body}</body></html>`;

/** One Bun.serve-compatible app: media API, Crunchyroll metadata, labs, Remotion and HyperFrames status. */
export function createVideoWebApp(options: VideoWebAppOptions): VideoWebApp {
  const crunchyroll = createCrunchyrollApi(options.crunchyroll ?? {});

  const routes = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/crunchyroll")) {
      const forwarded = new URL(request.url);
      forwarded.pathname = path.slice("/api/crunchyroll".length) || "/";
      return crunchyroll(new Request(forwarded, request));
    }

    if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method_not_allowed" }, 405);

    if (path === "/api/health")
      return json({
        status: "ok",
        video: { available: Bun.Video.available, decoder: Bun.Video.decoder, backend: Bun.Video.backend },
        labs: labs.map(({ id, title }) => ({ id, title })),
      });

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

    if (path === "/") {
      const items = labs.map(l => `<li>${l.title} : <code>${l.command}</code></li>`).join("");
      return new Response(
        page(
          "Bun Video",
          `<h1>Bun Video</h1>
<h2>Serveur vidéo</h2>
<ul>
<li><a href="/api/health">/api/health</a> : état du fournisseur natif</li>
<li><code>/api/video/metadata?src=</code> et <code>/api/video/frame?src=&amp;t=</code> (chemins relatifs à la racine média)</li>
</ul>
<h2>Crunchyroll</h2>
<ul><li><a href="/api/crunchyroll/health">/api/crunchyroll/health</a> ; <code>/api/crunchyroll/v1/watch?url=</code></li></ul>
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
