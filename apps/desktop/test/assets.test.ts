// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startWebOS, type WebOSServer } from "../server";
import { ASSETS } from "../src/server/assets";

let dataDir: string;
let server: WebOSServer;
let base: string;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "bun-webos-assets-"));
  server = await startWebOS({ port: 0, hostname: "127.0.0.1", dataDir, development: false });
  base = server.url.href.replace(/\/$/, "");
});
afterAll(async () => {
  await server?.stop(true);
  await rm(dataDir, { recursive: true, force: true });
});

const PNG = [0x89, 0x50, 0x4e, 0x47];
const bytes = async (path: string) => new Uint8Array(await (await fetch(base + path)).arrayBuffer());

describe("brand assets", () => {
  test.each(Object.keys(ASSETS))("%s is served with its type and a cache policy", async path => {
    const response = await fetch(base + path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(ASSETS[path]!.type);
    expect(response.headers.get("cache-control")).toContain("max-age=");
    expect(Number(response.headers.get("content-length"))).toBeGreaterThan(50);
  });

  test("PNG icons are real PNGs of the declared size", async () => {
    for (const [path, size] of [
      ["/favicon-16.png", 16],
      ["/favicon-32.png", 32],
      ["/apple-touch-icon.png", 180],
      ["/icons/icon-192.png", 192],
      ["/icons/icon-512.png", 512],
      ["/icons/maskable-512.png", 512],
    ] as const) {
      const data = await bytes(path);
      expect(Array.from(data.slice(0, 4))).toEqual(PNG);
      const view = new DataView(data.buffer, data.byteOffset);
      expect([view.getUint32(16), view.getUint32(20)]).toEqual([size, size]);
    }
    const card = await bytes("/og.png");
    expect([new DataView(card.buffer, card.byteOffset).getUint32(16), new DataView(card.buffer, card.byteOffset).getUint32(20)]).toEqual([1200, 630]);
  });

  test("favicon.ico holds PNG images at 16, 32 and 48", async () => {
    const data = await bytes("/favicon.ico");
    const view = new DataView(data.buffer, data.byteOffset);
    expect([view.getUint16(0, true), view.getUint16(2, true)]).toEqual([0, 1]);
    const count = view.getUint16(4, true);
    expect(count).toBe(3);
    const sizes: number[] = [];
    for (let index = 0; index < count; index++) {
      const entry = 6 + index * 16;
      sizes.push(view.getUint8(entry));
      const length = view.getUint32(entry + 8, true);
      const offset = view.getUint32(entry + 12, true);
      expect(Array.from(data.slice(offset, offset + 4))).toEqual(PNG);
      expect(offset + length).toBeLessThanOrEqual(data.byteLength);
    }
    expect(sizes).toEqual([16, 32, 48]);
  });

  test("the manifest points only at assets this server serves", async () => {
    const manifest = (await (await fetch(`${base}/manifest.webmanifest`)).json()) as {
      name: string;
      lang: string;
      start_url: string;
      icons: { src: string; sizes: string; purpose?: string }[];
      shortcuts: { url: string; icons: { src: string }[] }[];
    };
    expect(manifest).toMatchObject({ lang: "fr", start_url: "/" });
    expect(manifest.icons.some(icon => icon.purpose === "maskable" && icon.sizes === "512x512")).toBe(true);
    for (const target of [...manifest.icons.map(icon => icon.src), ...manifest.shortcuts.flatMap(shortcut => shortcut.icons.map(icon => icon.src))])
      expect(Object.keys(ASSETS)).toContain(target);
    for (const shortcut of manifest.shortcuts) expect((await fetch(base + shortcut.url)).status).toBe(200);
  });

  test("HEAD returns headers without a body and other methods are refused", async () => {
    const head = await fetch(`${base}/favicon.svg`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect((await head.arrayBuffer()).byteLength).toBe(0);
    expect(Number(head.headers.get("content-length"))).toBeGreaterThan(50);
    const post = await fetch(`${base}/favicon.svg`, { method: "POST" });
    expect([404, 405]).toContain(post.status);
  });

  test("the page head links the favicon, manifest and social card through the bundler", async () => {
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain("<title>Aphrody</title>");
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('property="og:image"');
    // The bundler hashes these files, so the page links their served names.
    for (const pattern of [/rel="icon"[^>]*href="[^"]*favicon[^"]*.svg"/, /rel="icon"[^>]*href="[^"]*favicon[^"]*.ico"/, /rel="manifest"[^>]*href="[^"]*manifest[^"]*.webmanifest"/]) {
      const match = pattern.exec(html);
      expect(match).not.toBeNull();
      const href = /href="([^"]+)"/.exec(match![0])![1]!;
      expect((await fetch(new URL(href, base + "/"))).status).toBe(200);
    }
  });
});
