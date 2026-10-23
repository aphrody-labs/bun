// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startWebOS, type WebOSServer } from "../server";

const fixture = join(import.meta.dir, "../../../packages/bun-video/hyperframes/player/tests/perf/fixtures/10-video-grid/sample.mp4");
const nativeVideo = (Bun as unknown as { Video?: { available: boolean } }).Video;

let dataDir: string;
let server: WebOSServer;
let base: string;
const get = (path: string, init?: RequestInit) => fetch(base + path, init);

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "bun-webos-video-"));
  const mediaRoot = join(dataDir, "Videos");
  await mkdir(join(dataDir, "dist", "workers"), { recursive: true });
  await mkdir(mediaRoot, { recursive: true });
  await copyFile(fixture, join(mediaRoot, "Mon Film.mp4"));
  await Bun.write(join(mediaRoot, "Mon Film.vtt"), "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nSalut\n");
  server = await startWebOS({ port: 0, hostname: "127.0.0.1", dataDir, distDir: join(dataDir, "dist"), mediaRoot, development: false });
  base = server.url.href.replace(/\/$/, "");
});

afterAll(async () => {
  await server?.stop(true);
  await rm(dataDir, { recursive: true, force: true });
});

describe("client-routed pages", () => {
  test.each(["/", "/os", "/video", "/video/watch?v=x", "/tools", "/tools/watch", "/m3"])("%s answers with the HTML shell", async path => {
    const response = await get(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('<div id="root">');
  });

  test("unknown paths still fall through to the public site handler", async () => {
    expect((await get("/definitely-not-a-page")).status).toBe(404);
  });
});

describe.skipIf(!nativeVideo?.available)("video API", () => {
  test("lists library files as works with metadata, a poster and a caption sidecar", async () => {
    const response = await get("/api/video/works");
    expect(response.status).toBe(200);
    const { works } = (await response.json()) as {
      works: { id: string; title: string; engine: string; width: number; durationFrames: number; video: string; poster: string; captions?: string }[];
    };
    expect(works).toHaveLength(1);
    const work = works[0]!;
    expect(work).toMatchObject({ id: "mon-film", title: "Mon Film", engine: "native", width: 480 });
    expect(work.durationFrames).toBeGreaterThan(200);
    expect(work.video).toBe("/media/Mon%20Film.mp4");
    expect(work.captions).toBe("/media/Mon%20Film.vtt");
    const poster = await get(work.poster);
    expect(poster.headers.get("content-type")).toBe("image/jpeg");
    expect((await get(work.video)).status).toBe(200);
  });

  test("runs watch on library media through the mounted handler", async () => {
    const response = await get("/api/video/watch?src=Mon%20Film.mp4&detail=efficient&frames=3&width=96");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { frames: { dataUrl: string }[]; transcript: { text: string }[] };
    expect(body.frames.length).toBeGreaterThan(0);
    expect(body.transcript).toEqual([{ start: 1, end: 2, text: "Salut" }]);
  });

  test("refuses media paths outside the library and cross-site callers", async () => {
    expect((await get("/api/video/metadata?src=..%2F..%2Fsecret.mp4")).status).toBe(400);
    const cross = await get("/api/video/watch?src=Mon%20Film.mp4", { headers: { "sec-fetch-site": "cross-site" } });
    expect(cross.status).toBe(403);
  });

  test("serves the capabilities of the video handler", async () => {
    const response = await get("/api/capabilities");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { apiFamilies: { id: string }[] };
    expect(body.apiFamilies.map(family => family.id)).toEqual(expect.arrayContaining(["watch", "remotion", "hyperframes", "media"]));
  });
});

describe("published showcase", () => {
  test("replaces the library listing and stays inside its directory", async () => {
    const showcaseRoot = join(dataDir, "showcase");
    await mkdir(join(showcaseRoot, "videos"), { recursive: true });
    await Bun.write(
      join(showcaseRoot, "showcase.json"),
      JSON.stringify({
        schema: "bun-video/showcase/v1",
        works: [
          { id: "orbital", title: "Orbital", engine: "remotion", video: "videos/orbital.mp4", poster: "videos/orbital.jpg", features: ["spring"], durationFrames: 96, fps: { num: 24, den: 1 }, width: 960, height: 540, evidence: [] },
          { id: "evil", title: "Evil", video: "../outside.mp4", durationFrames: 1, evidence: [] },
        ],
      }),
    );
    await Bun.write(join(showcaseRoot, "videos", "orbital.mp4"), "not really a video");
    const other = await startWebOS({ port: 0, hostname: "127.0.0.1", dataDir: join(dataDir, "second"), distDir: join(dataDir, "dist"), showcaseRoot, development: false });
    try {
      const origin = other.url.href.replace(/\/$/, "");
      const { works } = (await (await fetch(`${origin}/api/video/works`)).json()) as { works: { id: string; video: string; engine: string; poster?: string }[] };
      expect(works.map(work => work.id)).toEqual(["orbital"]);
      expect(works[0]).toMatchObject({ engine: "remotion", video: "/showcase/videos/orbital.mp4", poster: "/showcase/videos/orbital.jpg" });
      expect(await (await fetch(`${origin}/showcase/videos/orbital.mp4`)).text()).toBe("not really a video");
      expect((await fetch(`${origin}/showcase/..%2F..%2Fserver.ts`)).status).toBe(400);
    } finally {
      await other.stop(true);
    }
  });
});

describe.skipIf(!nativeVideo?.available)("public deployment (hostAccess: false)", () => {
  let publicServer: WebOSServer;
  let origin: string;
  beforeAll(async () => {
    publicServer = await startWebOS({
      port: 0,
      hostname: "127.0.0.1",
      dataDir: join(dataDir, "public"),
      distDir: join(dataDir, "dist"),
      mediaRoot: join(dataDir, "Videos"),
      hostAccess: false,
      development: false,
    });
    origin = publicServer.url.href.replace(/\/$/, "");
  });
  afterAll(async () => {
    await publicServer?.stop(true);
  });

  test("publishes the catalogue, posters and playback with byte ranges", async () => {
    const { works } = (await (await fetch(`${origin}/api/video/works`)).json()) as { works: { video: string; poster: string }[] };
    expect(works).toHaveLength(1);
    const poster = await fetch(origin + works[0]!.poster);
    expect([poster.status, poster.headers.get("content-type")]).toEqual([200, "image/jpeg"]);
    const full = await fetch(origin + works[0]!.video);
    expect(full.status).toBe(200);
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    const size = Number(full.headers.get("content-length"));
    const part = await fetch(origin + works[0]!.video, { headers: { range: "bytes=10-19" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 10-19/${size}`);
    expect((await part.arrayBuffer()).byteLength).toBe(10);
    const tail = await fetch(origin + works[0]!.video, { headers: { range: "bytes=-5" } });
    expect([tail.status, (await tail.arrayBuffer()).byteLength]).toEqual([206, 5]);
    expect((await fetch(origin + works[0]!.video, { headers: { range: `bytes=${size + 10}-` } })).status).toBe(416);
  });

  test("keeps media paths inside the library and limits what is served", async () => {
    expect((await fetch(`${origin}/media/..%2F..%2Fserver.ts`)).status).toBe(400);
    expect((await fetch(`${origin}/media/Mon%20Film.exe`)).status).toBe(400);
    expect((await fetch(`${origin}/api/video/frame?src=..%2Fx.mp4`)).status).toBe(400);
    expect((await fetch(`${origin}/api/video/frame?src=Mon%20Film.mp4&t=-1`)).status).toBe(400);
  });

  test("refuses everything that fetches URLs, decodes on demand or touches the host", async () => {
    for (const path of ["/api/video/watch?src=Mon%20Film.mp4", "/api/video/extract?src=https%3A%2F%2Fexample.com%2Fa", "/api/video/metadata?src=Mon%20Film.mp4", "/api/video/library", "/api/probe?url=https%3A%2F%2Fexample.com", "/api/discover?seed=https%3A%2F%2Fexample.com", "/api/compositions", "/api/webgpu/probe", "/api/webos/system"])
      expect([path, (await fetch(origin + path)).status]).toEqual([path, 403]);
  });

  test("lists the modules from the snapshot when the bun-video sources are absent", async () => {
    const previous = process.env.BUN_VIDEO_ROOT;
    process.env.BUN_VIDEO_ROOT = join(dataDir, "no-such-checkout");
    const bare = await startWebOS({ port: 0, hostname: "127.0.0.1", dataDir: join(dataDir, "bare"), distDir: join(dataDir, "dist"), hostAccess: false, development: false });
    try {
      const body = (await (await fetch(`${bare.url.href}api/capabilities`)).json()) as { source: string; apiFamilies: { id: string }[] };
      expect(body.source).toBe("snapshot");
      expect(body.apiFamilies.length).toBeGreaterThan(60);
      expect(body.apiFamilies.map(family => family.id)).toEqual(expect.arrayContaining(["watch", "remotion", "hyperframes", "media"]));
      expect((await fetch(`${bare.url.href}api/video/works`)).status).toBe(200);
    } finally {
      await bare.stop(true);
      if (previous === undefined) delete process.env.BUN_VIDEO_ROOT;
      else process.env.BUN_VIDEO_ROOT = previous;
    }
  });
});
