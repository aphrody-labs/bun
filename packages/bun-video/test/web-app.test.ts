import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createVideoWebApp, resolveMediaPath } from "../src/web-app";

const root = resolve("var", "media-test-root");
const app = createVideoWebApp({ mediaRoot: root, crunchyroll: { apiToken: "test-token" } });

describe("resolveMediaPath", () => {
  test("keeps paths inside the media root", () => {
    expect(resolveMediaPath(root, "clips/a.mp4")).toBe(resolve(root, "clips/a.mp4"));
  });

  test("rejects traversal, absolute escapes, NUL bytes and empty input", () => {
    expect(resolveMediaPath(root, "../secret.mp4")).toBeUndefined();
    expect(resolveMediaPath(root, "clips/../../secret.mp4")).toBeUndefined();
    expect(resolveMediaPath(root, resolve("/", "etc", "passwd"))).toBeUndefined();
    expect(resolveMediaPath(root, "a\0b.mp4")).toBeUndefined();
    expect(resolveMediaPath(root, null)).toBeUndefined();
    expect(resolveMediaPath(root, "")).toBeUndefined();
  });
});

describe("createVideoWebApp", () => {
  test("serves the unified app shell and its bundles", async () => {
    const response = await app.fetch(new Request("http://localhost/"));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("/app/app.js");
    expect(html).toContain("/app/app.css");
    const script = await app.fetch(new Request("http://localhost/app/app.js"));
    expect(script.status).toBe(200);
    expect((await script.text()).length).toBeGreaterThan(1000);
    const css = await app.fetch(new Request("http://localhost/app/app.css"));
    expect(css.headers.get("content-type")).toContain("text/css");
  });

  test("reports the native video provider state", async () => {
    const body = await (await app.fetch(new Request("http://localhost/api/health"))).json();
    expect(body.status).toBe("ok");
    expect(body.video.available).toBe(Bun.Video.available);
    expect(body.labs.map((lab: { id: string }) => lab.id)).toContain("dash");
  });

  test("rejects metadata requests that escape the media root", async () => {
    const response = await app.fetch(new Request("http://localhost/api/video/metadata?src=../x.mp4"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_media_path" });
  });

  test("validates frame time before touching media", async () => {
    const response = await app.fetch(new Request("http://localhost/api/video/frame?src=a.mp4&t=-1"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_time" });
  });

  test("mounts the Crunchyroll API under /api/crunchyroll", async () => {
    const health = await (await app.fetch(new Request("http://localhost/api/crunchyroll/health"))).json();
    expect(health).toMatchObject({ status: "ok", privateApiConfigured: true });
    const watch = await app.fetch(
      new Request("http://localhost/api/crunchyroll/v1/watch?url=https://www.crunchyroll.com/fr/watch/GY8VM8MWY/x"),
    );
    expect(watch.status).toBe(200);
  });

  test("refuses non-GET methods and unknown paths", async () => {
    expect((await app.fetch(new Request("http://localhost/", { method: "POST" }))).status).toBe(405);
    expect((await app.fetch(new Request("http://localhost/nope"))).status).toBe(404);
  });
});

describe("mounted labs", () => {
  test("dash lab is refused when no capture is configured", async () => {
    const response = await app.fetch(new Request("http://localhost/labs/dash/"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "lab_not_configured" });
  });
});

describe("mounted HLS lab", () => {
  test("HLS lab is refused when not configured", async () => {
    const response = await app.fetch(new Request("http://localhost/labs/hls/"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "lab_not_configured" });
  });
});

describe("mounted data site and clients", () => {
  test("data API is absent when the data site is not configured", async () => {
    const response = await app.fetch(new Request("http://localhost/api/overview"));
    expect(response.status).toBe(404);
  });

  test("data site and studio clients bundle as browser scripts", async () => {
    const site = await app.fetch(new Request("http://localhost/site/app.js"));
    expect(site.status).toBe(200);
    expect(site.headers.get("content-type")).toContain("javascript");
    expect((await site.text()).length).toBeGreaterThan(1000);
    const studio = await app.fetch(new Request("http://localhost/studio/app.js"));
    expect(studio.status).toBe(200);
  });
});

describe("mounted episode studio", () => {
  test("episode studio redirects to its trailing-slash root and is absent when unconfigured", async () => {
    const redirect = await app.fetch(new Request("http://localhost/episode"));
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe("http://localhost/episode/");
    const missing = await app.fetch(new Request("http://localhost/episode/"));
    expect(missing.status).toBe(404);
  });
});
