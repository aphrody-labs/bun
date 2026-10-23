// Bun Video on the site: the works of the Bun Video showcase build (packages/bun-video/scripts/build-showcase.ts) as
// players with the measurements recorded when each one was rendered. The media files are served by the aphrody-app
// Worker from the aphrody-video bucket under /video/media/ (same origin, so the site's CSP needs no exception).
import { escapeHtml } from "./mdx.ts";

export const VIDEO_MEDIA = "/video/media";
const PLATFORM: Record<string, string> = { win32: "Windows", linux: "Linux", darwin: "macOS" };

type Asset = { file: string; bytes: number; sha256: string; mime: string };
export type Showcase = {
  schema: number;
  generatedAt: string;
  sourceRevision: string;
  runtime: { version: string; revision: string; platform: string };
  works: {
    id: string;
    title: string;
    description: string;
    durationFrames: number;
    fps: { num: number; den: number };
    width: number;
    height: number;
    sourceRef?: string;
    evidence: string[];
    poster: string;
    video?: string;
    captions?: string;
  }[];
  evidence: { id: string; status: string; assets: Asset[] }[];
};

export type VideoWork = {
  id: string;
  title: string;
  description: string;
  poster: string;
  video: string;
  captions?: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  bytes: number;
  sha256: string;
  source?: string;
};

/**
 * The distinct works of a showcase: only works whose render evidence passed and lists the video file (the poster is
 * a still and need not be listed), and one work per video file, since two works with the same SHA-256 are the same
 * render under two names.
 */
export function videoWorks(showcase: Showcase): VideoWork[] {
  const evidence = new Map(showcase.evidence.map(entry => [entry.id, entry]));
  const seen = new Set<string>();
  const works: VideoWork[] = [];
  for (const work of showcase.works) {
    if (!work.video) continue;
    const passed = work.evidence.map(id => evidence.get(id)).filter(entry => entry?.status === "passed");
    const assets = passed.flatMap(entry => entry!.assets);
    const video = assets.find(asset => asset.file === work.video);
    if (!video || seen.has(video.sha256)) continue;
    seen.add(video.sha256);
    works.push({
      id: work.id,
      title: work.title,
      description: work.description,
      poster: work.poster,
      video: work.video,
      ...(work.captions ? { captions: work.captions } : {}),
      width: work.width,
      height: work.height,
      fps: work.fps.num / work.fps.den,
      frames: work.durationFrames,
      bytes: video.bytes,
      sha256: video.sha256,
      ...(work.sourceRef ? { source: work.sourceRef } : {}),
    });
  }
  return works;
}

const media = (file: string) => `${VIDEO_MEDIA}/${file.split("/").map(encodeURIComponent).join("/")}`;
const kib = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString("en-US")} KiB`;
const rate = (fps: number) => (Number.isInteger(fps) ? String(fps) : fps.toFixed(3));

/** One work: its player (poster, MP4, captions) and what was measured when it was rendered. */
export function videoFigure(work: VideoWork, repo: string, commit: string, lazy = true): string {
  const seconds = work.frames / work.fps;
  const source = work.source
    ? ` · <a href="https://github.com/${escapeHtml(repo)}/blob/${escapeHtml(commit)}/${escapeHtml(work.source)}">source</a>`
    : "";
  return `<figure class="video-work" id="${escapeHtml(work.id)}">
<video controls playsinline preload="${lazy ? "none" : "metadata"}" width="${work.width}" height="${work.height}" poster="${escapeHtml(media(work.poster))}"><source src="${escapeHtml(media(work.video))}" type="video/mp4">${work.captions ? `<track kind="captions" src="${escapeHtml(media(work.captions))}" default>` : ""}</video>
<figcaption><h3>${escapeHtml(work.title)}</h3><p>${escapeHtml(work.description)}</p>
<p class="muted">${work.frames} frames at ${rate(work.fps)} fps (${seconds.toFixed(1)} s) · ${work.width}×${work.height} · H.264 MP4, ${kib(work.bytes)}${source}</p></figcaption>
</figure>`;
}

/** The /video page: how the works were made, then every distinct work. */
export function renderVideoPage(showcase: Showcase, works: VideoWork[], repo: string): string {
  const commit = showcase.sourceRevision;
  return `<h1>Bun Video</h1>
<p class="lead">Every video on this page was rendered by Bun Video, the media toolkit of this runtime.</p>
<p>The first clips present the runtime with its own programs: each one types a program from the docs and plays, line by line, the output the runtime printed when it ran that program, on the platform named in the captions.</p>
<p>Each composition runs in Chromium and is captured one frame at a time. FilmCraft, the pure-Rust media stack built into the runtime, encodes the frames to H.264 and writes the MP4, without FFmpeg. The posters are WebP stills made with <code>Bun.Image</code>. Under each video are the measurements recorded when it was rendered: frame count, frame rate, size and the bytes of the file the player streams.</p>
<p class="muted">Rendered from <a href="https://github.com/${escapeHtml(repo)}/tree/${escapeHtml(commit)}"><code>${escapeHtml(commit.slice(0, 12))}</code></a> with Bun ${escapeHtml(showcase.runtime.version)} on ${escapeHtml(PLATFORM[showcase.runtime.platform] ?? showcase.runtime.platform)}, ${escapeHtml(showcase.generatedAt.slice(0, 10))}. Build script: <a href="https://github.com/${escapeHtml(repo)}/blob/${escapeHtml(commit)}/packages/bun-video/scripts/build-showcase.ts"><code>packages/bun-video/scripts/build-showcase.ts</code></a>.</p>
<h2 id="read">Read these files with Bun.Video</h2>
<pre tabindex="0"><code class="language-typescript">const video = new Bun.Video(await fetch("https://bun.aphrody.com${escapeHtml(media(works[0]!.video))}").then(r => r.bytes()));
const { width, height, duration, codec } = await video.metadata();
await video.frame(1).resize(480, 270).webp().write("frame.webp");</code></pre>
<h2 id="works">Works</h2>
<div class="video-grid">
${works.map(work => videoFigure(work, repo, commit)).join("\n")}
</div>`;
}

export const VIDEO_CSS = `.video-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr));gap:1.5rem;margin:1rem 0 2rem}.video-work{margin:0;background:var(--sc-low);border:1px solid var(--outline-v);border-radius:var(--radius);overflow:hidden}.video-work video{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#000}.video-work figcaption{padding:.75rem 1rem 1rem}.video-work h3{margin:0 0 .25rem;font-size:1.05rem}.video-work p{margin:.25rem 0}.home-video{max-width:48rem;margin:1rem 0}.doc-video{display:block;width:100%;height:auto;border-radius:var(--radius)}`;
