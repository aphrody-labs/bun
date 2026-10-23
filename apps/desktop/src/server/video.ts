// SPDX-License-Identifier: Apache-2.0
/**
 * Video surface of the unified app: the bun-video web handler (library, metadata, frames, watch, probes and
 * capabilities) mounted under /api/video and /media, one list of works for the player pages, and the published
 * showcase directory served under /showcase. Everything here reads local files, so the caller guards it.
 */
import { mkdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import apiFamilies from "./api-families.json";

export interface VideoWork {
  id: string;
  title: string;
  description: string;
  engine: "remotion" | "hyperframes" | "filmcraft" | "native";
  features: string[];
  durationFrames: number;
  fps: { num: number; den: number };
  width: number;
  height: number;
  video: string;
  poster?: string;
  captions?: string;
  chapter?: string;
  evidence: string[];
}

export interface VideoApiOptions {
  /** The WebOS home: media lives in <root>/Videos unless `mediaRoot` is given. */
  root: string;
  mediaRoot?: string;
  /** Output directory of packages/bun-video/scripts/build-showcase.ts (contains showcase.json). */
  showcaseRoot?: string;
}

export interface VideoApi {
  readonly mediaRoot: string;
  works(): Promise<VideoWork[]>;
  /** Handles /api/video/*, /media/* and /api/capabilities with the bun-video web handler. */
  handle(request: Request): Promise<Response>;
  /** Serves a file of the showcase directory for /showcase/<path>. */
  showcase(request: Request): Promise<Response>;
  /** Serves /media/<name> from the library with byte ranges; only video files and .vtt captions. */
  media(request: Request): Promise<Response>;
  /** A 640-pixel JPEG of one frame of a library file, decoded natively. */
  frame(request: Request): Promise<Response>;
  /** The module inventory: live from bun-video when its sources are present, else the committed snapshot. */
  capabilities(request: Request): Promise<Response>;
}

const MEDIA = new Set([".mp4", ".m4v", ".mov", ".mkv", ".webm"]);
const ENGINES = new Set(["remotion", "hyperframes", "filmcraft", "native"]);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** A path inside the showcase directory, or undefined when it would escape it. */
function inside(directory: string, path: string): string | undefined {
  if (!path || path.includes("\0")) return undefined;
  const target = resolve(directory, path);
  const rel = relative(directory, target);
  return rel && !rel.startsWith("..") && !rel.startsWith("/") && !/^[a-zA-Z]:/.test(rel) ? target : undefined;
}

interface NativeVideo {
  metadata(): Promise<{ width: number; height: number; duration: number | null; fpsNumerator: number; fpsDenominator: number }>;
}

/**
 * The bun-video source tree: $BUN_VIDEO_ROOT, else packages/bun-video found by walking up from this file. It is
 * loaded through a computed specifier, so `bun build` does not bundle Remotion, HyperFrames and the other owners
 * behind its capability registry; a deployment without a checkout answers 503 for these routes instead.
 */
function findVideoRoot(): string | undefined {
  const fromEnv = process.env.BUN_VIDEO_ROOT;
  if (fromEnv) return resolve(fromEnv);
  for (let directory = import.meta.dir; ; directory = dirname(directory)) {
    const candidate = join(directory, "packages", "bun-video");
    if (existsSync(join(candidate, "src", "web-app.ts"))) return candidate;
    if (dirname(directory) === directory) return undefined;
  }
}

type CreateVideoWebApp = (options: { mediaRoot: string }) => { fetch: (request: Request) => Promise<Response> };

async function loadVideoWebApp(): Promise<CreateVideoWebApp> {
  const root = findVideoRoot();
  if (!root) throw new Error("bun-video sources not found; set BUN_VIDEO_ROOT");
  const specifier = pathToFileURL(join(root, "src", "web-app.ts")).href;
  return ((await import(specifier)) as { createVideoWebApp: CreateVideoWebApp }).createVideoWebApp;
}

export function createVideoApi(options: VideoApiOptions): VideoApi {
  const mediaRoot = resolve(options.mediaRoot ?? join(options.root, "Videos"));
  mkdirSync(mediaRoot, { recursive: true });
  const showcaseRoot = options.showcaseRoot ? resolve(options.showcaseRoot) : undefined;
  let handler: Promise<(request: Request) => Promise<Response>> | undefined;
  const web = () =>
    (handler ??= loadVideoWebApp().then(create => create({ mediaRoot }).fetch));

  async function fromShowcase(): Promise<VideoWork[] | undefined> {
    if (!showcaseRoot) return undefined;
    const file = Bun.file(join(showcaseRoot, "showcase.json"));
    if (!(await file.exists())) return undefined;
    const manifest = (await file.json()) as {
      schema?: string;
      works?: (Partial<VideoWork> & { id: string; video: string })[];
    };
    if (manifest.schema !== "bun-video/showcase/v1" || !Array.isArray(manifest.works)) return undefined;
    const url = (path: string | undefined) => (path && inside(showcaseRoot, path) ? `/showcase/${path}` : undefined);
    return manifest.works.flatMap(work => {
      const video = url(work.video);
      if (!video || typeof work.id !== "string") return [];
      return [
        {
          id: work.id,
          title: work.title ?? work.id,
          description: work.description ?? "",
          engine: ENGINES.has(String(work.engine)) ? (work.engine as VideoWork["engine"]) : "native",
          features: work.features ?? [],
          durationFrames: work.durationFrames ?? 1,
          fps: work.fps ?? { num: 24, den: 1 },
          width: work.width ?? 1280,
          height: work.height ?? 720,
          video,
          poster: url(work.poster) ?? url((work as { preview?: string }).preview),
          captions: url(work.captions),
          chapter: work.chapter,
          evidence: work.evidence ?? [],
        },
      ];
    });
  }

  async function fromLibrary(): Promise<VideoWork[]> {
    const entries = await readdir(mediaRoot, { withFileTypes: true }).catch(() => []);
    const names = entries
      .filter(entry => entry.isFile() && MEDIA.has(extname(entry.name).toLowerCase()))
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b));
    const Video = (Bun as unknown as { Video?: { available: boolean; new (path: string): NativeVideo } }).Video;
    const works: VideoWork[] = [];
    for (const name of names) {
      const stem = name.slice(0, name.length - extname(name).length);
      let meta: Awaited<ReturnType<NativeVideo["metadata"]>> | undefined;
      if (Video?.available) meta = await new Video(join(mediaRoot, name)).metadata().catch(() => undefined);
      const fps = meta && meta.fpsDenominator ? { num: meta.fpsNumerator, den: meta.fpsDenominator } : { num: 24, den: 1 };
      const seconds = meta?.duration ?? 0;
      const sidecar = (await Bun.file(join(mediaRoot, `${stem}.vtt`)).exists()) ? `/media/${encodeURIComponent(`${stem}.vtt`)}` : undefined;
      works.push({
        id: stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "video",
        title: stem.replace(/[-_]+/g, " "),
        description: `Fichier de la bibliothèque : ${name}`,
        engine: "native",
        features: ["bibliothèque"],
        durationFrames: Math.max(1, Math.round(seconds * (fps.num / fps.den))),
        fps,
        width: meta?.width ?? 0,
        height: meta?.height ?? 0,
        video: `/media/${encodeURIComponent(name)}`,
        poster: `/api/video/frame?src=${encodeURIComponent(name)}&t=${Math.min(1, Math.max(0, seconds / 2))}`,
        captions: sidecar,
        chapter: "Bibliothèque",
        evidence: [],
      });
    }
    return works;
  }

  return {
    mediaRoot,
    async works() {
      return (await fromShowcase()) ?? (await fromLibrary());
    },
    async handle(request) {
      try {
        return await (await web())(request);
      } catch (error) {
        handler = undefined;
        return json({ error: "video_backend_unavailable", detail: error instanceof Error ? error.message : "" }, 503);
      }
    },
    async showcase(request) {
      if (!showcaseRoot) return json({ error: "showcase_unavailable" }, 404);
      const path = decodeURIComponent(new URL(request.url).pathname.slice("/showcase/".length));
      const target = inside(showcaseRoot, path);
      if (!target) return json({ error: "invalid_showcase_path" }, 400);
      return serveFile(request, Bun.file(target));
    },
    async media(request) {
      let name: string;
      try {
        name = decodeURIComponent(new URL(request.url).pathname.slice("/media/".length));
      } catch {
        return json({ error: "invalid_media_path" }, 400);
      }
      const target = inside(mediaRoot, name);
      if (!target || !(MEDIA.has(extname(target).toLowerCase()) || extname(target).toLowerCase() === ".vtt"))
        return json({ error: "invalid_media_path" }, 400);
      return serveFile(request, Bun.file(target));
    },
    async frame(request) {
      const params = new URL(request.url).searchParams;
      const target = inside(mediaRoot, params.get("src") ?? "");
      const seconds = Number(params.get("t") ?? "0");
      if (!target || !MEDIA.has(extname(target).toLowerCase())) return json({ error: "invalid_media_path" }, 400);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) return json({ error: "invalid_time" }, 400);
      const Video = (Bun as unknown as { Video?: NativeFrameVideo }).Video;
      if (!Video?.available) return json({ error: "video_provider_unavailable" }, 503);
      try {
        const bytes = await new Video(target).frame(seconds).resize(640).jpeg({ quality: 85 }).bytes();
        return new Response(Uint8Array.from(bytes), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=300" } });
      } catch {
        return json({ error: "frame_unavailable" }, 422);
      }
    },
    async capabilities(request) {
      const live = await this.handle(request);
      if (live.status !== 503) return live;
      return json({ ...apiFamilies, source: "snapshot" });
    },
  };
}

interface NativeFrameVideo {
  readonly available: boolean;
  new (path: string): {
    frame(seconds: number): { resize(width: number): { jpeg(options: { quality: number }): { bytes(): Promise<Uint8Array> } } };
  };
}

/** A whole file, or the byte range the browser asked for: video seeking and resuming depend on 206 answers. */
async function serveFile(request: Request, file: ReturnType<typeof Bun.file>): Promise<Response> {
  if (!(await file.exists())) return json({ error: "not_found" }, 404);
  const size = file.size;
  const headers: Record<string, string> = {
    "content-type": file.type || "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=300",
    "x-content-type-options": "nosniff",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
    return new Response(request.method === "HEAD" ? null : file.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(request.method === "HEAD" ? null : file, { headers: { ...headers, "content-length": String(size) } });
}
