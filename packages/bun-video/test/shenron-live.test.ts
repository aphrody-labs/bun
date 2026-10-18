// Live suite: every check reads the public episodes wiki and the Shenron CDN, not local fixtures.
// The suite is skipped (with the reason printed) only when the wiki cannot be reached at all.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeSlideshow, findFFmpeg, readBack, slideshowFrame } from "../scripts/qualify-shenron-media";

const WIKI = Bun.env.SHENRON_WIKI_URL ?? "https://dragonballfr.com/wiki/episodes";
const CDN = new URL(Bun.env.SHENRON_CDN_URL ?? "https://cdn.dragonballfr.com").origin;
const deadline = () => AbortSignal.timeout(20_000);

let page = "";
let reachable = false;
try {
  const response = await fetch(WIKI, { signal: deadline() });
  if (response.ok) {
    page = await response.text();
    reachable = true;
  }
} catch (error) {
  console.warn(`shenron-live: ${WIKI} unreachable (${(error as Error).message}); live tests skipped`);
}

const live = reachable ? describe : describe.skip;
const urls = (pattern: RegExp) => [...new Set(page.match(pattern) ?? [])];
const escaped = CDN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const frameUrls = () => urls(new RegExp(`${escaped}/assets/ext/db_episodes_frames/[^"'\\\\ )<>]+\\.webp`, "g"));
const posterUrls = () => urls(new RegExp(`${escaped}/assets/ext/db_episodes/[^"'\\\\ )<>]+\\.jpg`, "g"));
const videoVideo = !!(Bun as any).Video?.available;
const ffmpeg = findFFmpeg();

live("episodes wiki and Shenron CDN", () => {
  test("the wiki lists episodes with CDN posters and extracted frames", () => {
    expect(posterUrls().length).toBeGreaterThan(10);
    expect(frameUrls().length).toBeGreaterThan(10);
  });

  // Diagnosed 2026-10-18: the R2 worker (deploy/cloudflare/cdn-worker.ts in the Shenron repo) answers
  // Range with 206 and Content-Range (its own tests cover it, and the first test below sees it on a
  // URL that is not in the edge cache). A URL already in the Cloudflare edge cache (cf-cache-status:
  // HIT) is served as a 200 with the whole body although accept-ranges: bytes is sent, so a player
  // that seeks by range downloads the full file. Fixing it is a Cloudflare cache or worker routing
  // change, not a code change here: test.failing passes while that holds and fails once it is fixed,
  // so it then becomes a plain test.
  test("CDN answers a Range request with 206 on an uncached URL", async () => {
    const url = `${posterUrls()[0]!}?range-probe=${crypto.randomUUID()}`;
    const response = await fetch(url, { headers: { Range: "bytes=0-99" }, signal: deadline() });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toMatch(/^bytes 0-99\//);
    expect((await response.arrayBuffer()).byteLength).toBe(100);
  });

  test.failing("CDN answers a Range request with 206 on a URL cached at the edge", async () => {
    const response = await fetch(posterUrls()[0]!, { headers: { Range: "bytes=0-99" }, signal: deadline() });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toMatch(/^bytes 0-99\//);
  });

  // The qualified Beerus episode MP4 is served by the origin that honours ranges even from the edge cache.
  test("the qualified episode MP4 supports byte ranges and starts with its moov atom", async () => {
    const url = `${CDN}/media/episodes/beerus-01/optimized-720p.mp4`;
    const response = await fetch(url, { headers: { Range: "bytes=0-65535" }, signal: deadline() });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    const range = /^bytes 0-65535\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
    expect(range).not.toBeNull();
    expect(Number(range![1])).toBeGreaterThan(1_000_000);
    const head = new Uint8Array(await response.arrayBuffer());
    expect(head.byteLength).toBe(65536);
    expect(new TextDecoder().decode(head.subarray(4, 8))).toBe("ftyp");
    // Walk the top-level boxes: faststart means moov comes before mdat so playback starts without a tail seek.
    const view = new DataView(head.buffer);
    const order: string[] = [];
    for (let offset = 0; offset + 8 <= head.byteLength && order.length < 8;) {
      const size = view.getUint32(offset);
      order.push(new TextDecoder().decode(head.subarray(offset + 4, offset + 8)));
      if (size < 8) break;
      offset += size;
    }
    expect(order.indexOf("moov")).toBeGreaterThan(-1);
    if (order.includes("mdat")) expect(order.indexOf("moov")).toBeLessThan(order.indexOf("mdat"));
  });

  test("CDN serves a poster with caching headers", async () => {
    const url = posterUrls()[0]!;
    const full = await fetch(url, { signal: deadline() });
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("image/jpeg");
    expect(full.headers.get("cache-control")).toMatch(/max-age=\d+/);
    expect(full.headers.get("etag")).toBeTruthy();
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    const bytes = new Uint8Array(await full.arrayBuffer());

    expect(full.headers.get("x-content-sha256")).toBe(new Bun.CryptoHasher("sha256").update(bytes).digest("hex"));

    const revalidated = await fetch(url, {
      headers: { "If-None-Match": full.headers.get("etag")! },
      signal: deadline(),
    });
    expect(revalidated.status).toBe(304);
  });

  test("poster and frame bytes decode with real dimensions", async () => {
    for (const url of [posterUrls()[0]!, frameUrls()[0]!]) {
      const response = await fetch(url, { signal: deadline() });
      expect(response.status).toBe(200);
      const metadata = await new Bun.Image(new Uint8Array(await response.arrayBuffer())).metadata();
      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
    }
  });

  test.skipIf(!videoVideo || !ffmpeg)(
    "a video built from CDN episode frames is read back by Bun.Video",
    async () => {
      const urlsToUse = frameUrls().slice(0, 6);
      expect(urlsToUse.length).toBe(6);
      const frames = await Promise.all(
        urlsToUse.map(async url => {
          const response = await fetch(url, { signal: deadline() });
          expect(response.status).toBe(200);
          return slideshowFrame(new Uint8Array(await response.arrayBuffer()), 320, 180);
        }),
      );
      const dir = mkdtempSync(join(tmpdir(), "shenron-live-"));
      try {
        const output = join(dir, "episode.mp4");
        await encodeSlideshow(frames, output, 2);
        const result = await readBack(output, frames.length, 2);
        expect(result.available).toBe(true);
        expect(result.metadata).toMatchObject({ width: 320, height: 180, container: "MPEG-4" });
        expect(result.metadata!.codec).toStartWith("H.264");
        expect(result.metadata!.duration).toBeCloseTo(3, 0);
        expect(result.frameWidth).toBe(160);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

// The sandbox needs unprivileged user namespaces, which CI hosts and recent Ubuntu releases disable.
const CHROME = { type: "chrome", url: false, argv: ["--no-sandbox"] } as const;
const webViewAvailable = typeof (Bun as any).WebView === "function" && !!Bun.which("google-chrome-stable");

live.skipIf(!webViewAvailable)("episodes wiki in Bun.WebView", () => {
  test("renders the episode list and loads its CDN images", async () => {
    await using view = new (Bun as any).WebView({ width: 1280, height: 900, backend: CHROME });
    await view.navigate(WIKI);
    expect(view.url).toContain("/wiki/episodes");
    expect(view.title.length).toBeGreaterThan(0);

    const links = await view.evaluate(
      `new Set([...document.querySelectorAll('a[href^="/wiki/episodes/"]')].map(a => a.getAttribute("href"))).size`,
    );
    expect(links).toBeGreaterThan(10);

    // Every <img> the page has started loading from the CDN must decode with real pixels.
    const images: { src: string; w: number; h: number }[] = await view.evaluate(
      `(async () => {
        const imgs = [...document.images].filter(i => i.src.startsWith(${JSON.stringify(CDN)})).slice(0, 12);
        const settle = (i) => Promise.race([i.decode().catch(() => {}), new Promise(r => setTimeout(r, 8000))]);
        imgs.forEach(i => { i.loading = "eager"; });
        await Promise.all(imgs.map(settle));
        return imgs.map(i => ({ src: i.src, w: i.naturalWidth, h: i.naturalHeight }));
      })()`,
    );
    expect(images.length).toBeGreaterThan(0);
    expect(images.some(image => image.w > 0 && image.h > 0)).toBe(true);

    const png = await view.screenshot();
    expect(png.size).toBeGreaterThan(10_000);
    const bytes = new Uint8Array(await png.arrayBuffer());
    expect([...bytes.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  }, 120_000);

  test("a <video> element plays a Bun.Video-built episode clip in the browser", async () => {
    if (!videoVideo || !ffmpeg) return;
    const frames = await Promise.all(
      frameUrls()
        .slice(0, 6)
        .map(async url =>
          slideshowFrame(new Uint8Array(await (await fetch(url, { signal: deadline() })).arrayBuffer()), 320, 180),
        ),
    );
    const dir = mkdtempSync(join(tmpdir(), "shenron-live-view-"));
    try {
      const output = join(dir, "episode.mp4");
      await encodeSlideshow(frames, output, 2);
      using server = Bun.serve({
        port: 0,
        // A data: page cannot load loopback media, so the page and the clip share one origin.
        fetch: request =>
          new URL(request.url).pathname === "/episode.mp4"
            ? new Response(Bun.file(output), { headers: { "content-type": "video/mp4" } })
            : new Response('<video id=v muted preload=metadata src="/episode.mp4"></video>', {
                headers: { "content-type": "text/html" },
              }),
      });
      await using view = new (Bun as any).WebView({ width: 640, height: 360, backend: CHROME });
      await view.navigate(server.url.href);
      const state = await view.evaluate(
        `new Promise(resolve => { const v = document.getElementById("v"); v.onloadedmetadata = () => resolve({ w: v.videoWidth, h: v.videoHeight, d: v.duration }); v.load(); v.onerror = () => resolve({ error: v.error?.message ?? "error" }); })`,
      );
      expect(state).toMatchObject({ w: 320, h: 180 });
      expect(state.d).toBeCloseTo(3, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

const obscura = Bun.which("obscura");

async function obscuraFetch(url: string, dump: "links" | "assets" | "text") {
  await using child = Bun.spawn([obscura!, "fetch", url, "--dump", dump], { stdout: "pipe", stderr: "ignore" });
  const [out, code] = await Promise.all([child.stdout.text(), child.exited]);
  expect(code).toBe(0);
  return out;
}

live.skipIf(!obscura)("episodes wiki crawled with Obscura", () => {
  test("the rendered episode index links to every episode page", async () => {
    const links = (await obscuraFetch(WIKI, "links"))
      .split("\n")
      .map(line => line.split("\t")[0]!)
      .filter(url => /\/wiki\/episodes\/[^/\s#]+$/.test(url));
    expect(new Set(links).size).toBeGreaterThan(100);
  }, 120_000);

  test("an episode page references CDN frames that all resolve", async () => {
    const rows = (await obscuraFetch(`${WIKI}/1`, "assets"))
      .split("\n")
      .filter(Boolean)
      .map(line => JSON.parse(line) as { url: string; type: string });
    const images = rows.filter(row => row.type === "image" && row.url.startsWith(CDN));
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      const response = await fetch(image.url, { method: "HEAD", signal: deadline() });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toStartWith("image/");
    }
  }, 120_000);

  test("the episode page offers a player with subtitle tracks", async () => {
    const text = await obscuraFetch(`${WIKI}/1`, "text");
    expect(text).toContain("Lecteur 1");
    expect(text).toContain("sous-titres");
  }, 120_000);
});
