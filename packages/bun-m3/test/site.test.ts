import { expect, test } from "bun:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { tempDir } from "harness";
import { createM3Site, serveM3Site } from "../src/site.ts";

test("canonical static root serves MIME, HEAD and document routes without API/asset fallback", async () => {
  using directory = tempDir("m3-site", {
    "index.html": "<title>Canonical M3</title>",
    "app.js": "canonical();",
    "fonts/test.woff2": "font",
  });
  const handler = await createM3Site({ staticRoot: String(directory) });
  const get = (path: string, options?: RequestInit) => handler(new Request("http://localhost" + path, options));
  const page = await get("/");
  expect(await page.text()).toContain("Canonical M3");
  expect(page.headers.get("cache-control")).toBe("no-cache");
  const script = await get("/app.js");
  expect(script.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  expect(await script.text()).toBe("canonical();");
  const head = await get("/fonts/test.woff2", { method: "HEAD" });
  expect(head.headers.get("content-type")).toBe("font/woff2");
  expect(head.headers.get("content-length")).toBe("4");
  expect(await head.text()).toBe("");
  expect(await (await get("/studio/google", { headers: { accept: "text/html" } })).text()).toContain("Canonical M3");
  for (const path of [
    "/api/missing",
    "/rpc",
    "/rpc/private",
    "/events",
    "/missing.js",
    "/%2e%2e/private.txt",
    "/.env",
    "/C:secret",
    "/bad%00path",
  ])
    expect((await get(path)).status).toBe(404);
  expect((await get("/health")).status).toBe(204);
  const capabilities = (await (await get("/api/capabilities")).json()) as {
    search: { configured: boolean };
    privilegedGoogle: { requiresAuthentication: boolean };
    chromium: { embedded: boolean };
  };
  expect(capabilities.search.configured).toBe(false);
  expect(capabilities.privilegedGoogle.requiresAuthentication).toBe(true);
  expect(capabilities.chromium.embedded).toBe(false);
});

test("inner symlink and directory escapes never become public static files", async () => {
  using directory = tempDir("m3-symlink", { "index.html": "canonical" });
  using outside = tempDir("m3-private", { "private.txt": "not public" });
  await symlink(
    String(outside),
    join(String(directory), "redirect"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const handler = await createM3Site({ staticRoot: String(directory) });
  const response = await handler(new Request("http://localhost/redirect/private.txt"));
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain("not public");
});

test("search preserves anonymous Rust route bounds and projects only public fields", async () => {
  using directory = tempDir("m3-search", { "index.html": "canonical" });
  let calls = 0;
  const handler = await createM3Site({
    staticRoot: String(directory),
    search: async request => {
      calls++;
      expect(request).toEqual({ query: "Bun M3", hl: "fr", start: 10, vertical: "web", safe: "active", num: 10 });
      return {
        query: request.query,
        authenticated: false,
        organic: [{ title: "Result", url: "https://example.test", snippet: "Public" }],
        secret: "redact",
      } as any;
    },
  });
  const good = await handler(new Request("http://localhost/api/search?query=Bun%20M3&hl=fr&start=10"));
  expect(good.status).toBe(200);
  expect(good.headers.get("cache-control")).toBe("no-store");
  expect(await good.text()).not.toContain("redact");
  for (const query of [
    "query=a&num=20",
    "query=a&query=b",
    "query=a&start=91",
    "query=a&cookie_path=x",
    "query=a&safe=off",
    "query=a&domain=example.com",
    "query=" + encodeURIComponent("a".repeat(1025)),
  ])
    expect((await handler(new Request("http://localhost/api/search?" + query))).status).toBe(400);
  expect(calls).toBe(1);
});

test("busy search and failing providers produce honest errors without losing capacity", async () => {
  using directory = tempDir("m3-capacity", { "index.html": "canonical" });
  const started = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  const handler = await createM3Site({
    staticRoot: String(directory),
    searchConcurrency: 1,
    search: async () => {
      started.resolve();
      await release.promise;
      throw Error("provider secret");
    },
  });
  const first = handler(new Request("http://localhost/api/search?query=Bun"));
  await started.promise;
  expect((await handler(new Request("http://localhost/api/search?query=Bun"))).status).toBe(429);
  release.resolve();
  const failure = await first;
  expect(failure.status).toBe(502);
  expect(await failure.text()).not.toContain("provider secret");
  expect((await handler(new Request("http://localhost/api/search?query=Bun"))).status).toBe(502);
});

test("real Bun listener serves canonical files on an assigned local port", async () => {
  using directory = tempDir("m3-listener", { "index.html": "canonical listener" });
  const server = await serveM3Site({ staticRoot: String(directory), hostname: "127.0.0.1", port: 0 });
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(await response.text()).toBe("canonical listener");
    expect(response.status).toBe(200);
  } finally {
    server.stop(true);
  }
});

test("client cancellation retains capacity until the owner actually settles", async () => {
  using directory = tempDir("m3-cancel", { "index.html": "canonical" });
  const started = Promise.withResolvers<void>();
  const owner = Promise.withResolvers<{ query: string; authenticated: false; organic: [] }>();
  const handler = await createM3Site({
    staticRoot: String(directory),
    searchConcurrency: 1,
    search: () => {
      started.resolve();
      return owner.promise;
    },
  });
  const controller = new AbortController();
  const request = () => new Request("http://localhost/api/search?query=Bun");
  const first = handler(new Request(request(), { signal: controller.signal }));
  await started.promise;
  controller.abort();
  expect((await first).status).toBe(504);
  expect((await handler(request())).status).toBe(429);
  owner.resolve({ query: "Bun", authenticated: false, organic: [] });
  const until = performance.now() + 1000;
  let recovered: Response;
  do {
    recovered = await handler(request());
  } while (recovered.status === 429 && performance.now() < until);
  expect(recovered.status).toBe(200);
});
