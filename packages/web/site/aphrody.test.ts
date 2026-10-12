// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { tempDir } from "../../../test/harness";
import { createPublicSite } from "./aphrody";
import { searchPage } from "./search-page";
import { publicPwaResponse } from "./pwa";

test("public PWA exposes its actual icons and restricts worker methods", async () => {
  const manifest = publicPwaResponse(new Request("https://aphrody.com/manifest.webmanifest"))!;
  expect(manifest.headers.get("content-type")).toBe("application/manifest+json");
  const parsed = (await manifest.json()) as { icons: { sizes: string }[] };
  expect(parsed.icons.map(icon => icon.sizes)).toEqual(["192x192", "512x512"]);
  const worker = publicPwaResponse(new Request("https://aphrody.com/service-worker.js"))!;
  expect(worker.headers.get("service-worker-allowed")).toBe("/");
  expect(await worker.text()).toContain("url.pathname.startsWith('/auth/')");
  expect(publicPwaResponse(new Request("https://aphrody.com/service-worker.js", { method: "POST" }))!.status).toBe(405);
  expect(
    await publicPwaResponse(new Request("https://aphrody.com/manifest.webmanifest", { method: "HEAD" }))!.text(),
  ).toBe("");
  expect(publicPwaResponse(new Request("https://aphrody.com/api/mail"))).toBeNull();
});

test("public site preserves catalog security headers and injects the canonical theme", async () => {
  using root = tempDir("public-bun-m3", {
    "index.html": "<!doctype html><html><head><title>Aphrody</title></head><body></body></html>",
    "theme.css": "article { color: CanvasText; }",
  });
  const handler = await createPublicSite({
    staticRoot: String(root),
    themeFile: `${root}/theme.css`,
    googleOwner: "missing-public-search-owner-fixture",
    catalog: () =>
      new Response("<html><head></head><body>M3</body></html>", {
        headers: {
          "content-type": "text/html",
          "content-security-policy": "script-src 'self'",
          etag: '"old"',
        },
      }),
  });
  const response = await handler(new Request("https://aphrody.com/"));
  expect(await response.text()).toContain('href="/_app-ui/google-public-theme.css"');
  expect(response.headers.get("content-security-policy")).toBe("script-src 'self'");
  expect(response.headers.get("etag")).toBeNull();
  const css = await handler(new Request("https://aphrody.com/_app-ui/google-public-theme.css"));
  expect(await css.text()).toBe("article { color: CanvasText; }");
  expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8");
  const head = await handler(new Request("https://aphrody.com/_app-ui/google-public-theme.css", { method: "HEAD" }));
  expect(await head.text()).toBe("");
  const health = await handler(new Request("https://aphrody.com/health"));
  expect(health.status).toBe(204);
  const denied = await handler(new Request("https://aphrody.com/api/search?query=test&cookies=operator"));
  expect(denied.status).toBe(400);
});

test("public site serves source-pinned catalogs, real slugs and terminal shell", async () => {
  using root = tempDir("public-bun-catalog", {
    "index.html": "<html><head></head><body>canonical UI shell</body></html>",
    "theme.css": "body{}",
    "docs.json": JSON.stringify([{ id: "native", title: "Native", category: "Runtime" }]),
    "templates.json": JSON.stringify([{ id: "web", name: "Web" }]),
    "assets.json": "[]",
  });
  const pinned = async (name: string) => ({
    path: `${root}/${name}`,
    sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(`${root}/${name}`).bytes()).digest("hex"),
  });
  const handler = await createPublicSite({
    staticRoot: String(root),
    themeFile: `${root}/theme.css`,
    googleOwner: "missing-public-search-owner-fixture",
    catalog: request =>
      new Response(
        new URL(request.url).pathname === "/chat" ? "<html><head></head><body>shell</body></html>" : "absent",
        {
          status: new URL(request.url).pathname === "/chat" ? 200 : 404,
          headers: { "content-type": "text/html" },
        },
      ),
    snapshots: {
      docsFile: await pinned("docs.json"),
      templatesFile: await pinned("templates.json"),
      assetsFile: await pinned("assets.json"),
    },
  });
  expect(await (await handler(new Request("https://aphrody.com/api/docs?category=missing"))).json()).toEqual([]);
  expect(await (await handler(new Request("https://aphrody.com/api/templates"))).json()).toEqual([
    { id: "web", name: "Web" },
  ]);
  expect((await handler(new Request("https://aphrody.com/templates/web"))).status).toBe(200);
  expect((await handler(new Request("https://aphrody.com/templates/nonexistent"))).status).toBe(404);
  expect((await handler(new Request("https://aphrody.com/terminal"))).status).toBe(200);
  expect((await handler(new Request("https://aphrody.com/api/m3/css?sheet=scheme"))).status).toBe(503);
});

test("Chrome search provider query uses the real API and escapes public results", async () => {
  let requested = "";
  const response = await searchPage(new Request("https://aphrody.com/?q=%3Cscript%3E"), async request => {
    requested = request.url;
    return Response.json({
      organic: [
        {
          title: "<b>Title</b>",
          url: "https://example.test/",
          snippet: '"<script>payload</script>',
        },
      ],
    });
  });
  expect(new URL(requested).searchParams.get("query")).toBe("<script>");
  expect(response?.status).toBe(200);
  const html = await response!.text();
  expect(html).toContain("&lt;b&gt;Title&lt;/b&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain('action="/" method="get"');
  const failed = await searchPage(new Request("https://aphrody.com/?q=bun"), async () =>
    Response.json({ error: "unavailable" }, { status: 502 }),
  );
  expect(failed?.status).toBe(502);
  expect(await failed!.text()).toContain("momentanément indisponible");
  const duplicate = await searchPage(new Request("https://aphrody.com/?q=a&q=b"), async () => {
    throw new Error("Owner must not run");
  });
  expect(duplicate?.status).toBe(400);
});
