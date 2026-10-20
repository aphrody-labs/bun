import { expect, test } from "bun:test";
import { serveShowcase } from "../showcase/worker.js";

test("showcase maps the root into its versioned R2 namespace and streams bytes", async () => {
  const keys: string[] = [];
  const options: unknown[] = [];
  const response = await serveShowcase(new Request("https://video.aphrody.com/"), {
    SHOWCASE_PREFIX: "showcase/test-v1",
    SHOWCASE: {
      async head() {
        return null;
      },
      async get(key: string, requestOptions: unknown) {
        keys.push(key);
        options.push(requestOptions);
        return {
          size: 3,
          range: { offset: 0, length: 3 },
          httpEtag: '"abc"',
          body: new Blob([new Uint8Array([0, 255, 42])]).stream(),
          writeHttpMetadata(headers: Headers) {
            headers.set("Content-Type", "image/png");
          },
        };
      },
    },
  });
  expect(keys).toEqual(["showcase/test-v1/index.html"]);
  expect(options).toEqual([{ onlyIf: new Headers() }]);
  expect(response.status).toBe(200);
  expect([...(await response.bytes())]).toEqual([0, 255, 42]);
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Content-Length")).toBe("3");
  expect(response.headers.get("Content-Range")).toBeNull();
});

test("YouTube search uses the official API, safe search, attribution and no-store", async () => {
  let requested: URL | undefined;
  const response = await serveShowcase(new Request("https://video.aphrody.com/api/youtube/search?q=  bun+video%20"), {
    SHOWCASE_PREFIX: "showcase/test-v1",
    YOUTUBE_API_KEY: "test-secret",
    SHOWCASE: { async head() { return null; }, async get() { throw new Error("R2 must not be read"); } },
  }, async input => {
    requested = new URL(String(input));
    return Response.json({ items: [{ id: { videoId: "abcdefghijk" }, snippet: {
      title: "Bun Video", description: "Demo", channelTitle: "Aphrody", publishedAt: "2026-10-20T00:00:00Z",
      thumbnails: { medium: { url: "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg" } },
    } }] });
  } as never);
  expect(requested?.origin + requested?.pathname).toBe("https://www.googleapis.com/youtube/v3/search");
  expect(requested?.searchParams.get("safeSearch")).toBe("strict");
  expect(requested?.searchParams.get("type")).toBe("video");
  expect(requested?.searchParams.get("maxResults")).toBe("12");
  expect(requested?.searchParams.get("q")).toBe("bun video");
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ source: "YouTube", videos: [{ id: "abcdefghijk", title: "Bun Video" }] });
});

test("YouTube search validates query, hides missing credentials and rejects unsafe IDs", async () => {
  const env = { SHOWCASE_PREFIX: "showcase/test-v1", YOUTUBE_API_KEY: "test", SHOWCASE: { async head() { return null; }, async get() { return null; } } };
  expect((await serveShowcase(new Request("https://video.aphrody.com/api/youtube/search?q=x"), env)).status).toBe(400);
  expect((await serveShowcase(new Request("https://video.aphrody.com/api/youtube/search?q=valid"), { ...env, YOUTUBE_API_KEY: undefined })).status).toBe(503);
  const bad = await serveShowcase(new Request("https://video.aphrody.com/api/youtube/search?q=valid"), env, async () => Response.json({ items: [{ id: { videoId: "not-valid" }, snippet: { title: "bad" } }] }) as never);
  expect((await bad.json()).videos).toEqual([]);
});

test("YouTube search respects its per-IP upstream quota guard", async () => {
  const response = await serveShowcase(new Request("https://video.aphrody.com/api/youtube/search?q=valid", {
    headers: { "CF-Connecting-IP": "203.0.113.8" },
  }), {
    SHOWCASE_PREFIX: "showcase/test-v1",
    YOUTUBE_API_KEY: "test",
    YOUTUBE_SEARCH_LIMITER: { async limit({ key }) { expect(key).toBe("203.0.113.8"); return { success: false }; } },
    SHOWCASE: { async head() { return null; }, async get() { throw new Error("R2 must not be read"); } },
  }, async () => { throw new Error("Google must not be called when rate limited"); });
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
});

test("video product routes serve the same app shell for client-side navigation", async () => {
  const keys: string[] = [];
  const env = {
    SHOWCASE_PREFIX: "showcase/test-v1",
    SHOWCASE: {
      async head() {
        return null;
      },
      async get(key: string) {
        keys.push(key);
        return {
          size: 4,
          httpEtag: '"app"',
          body: new Blob(["app!"]).stream(),
          writeHttpMetadata(headers: Headers) {
            headers.set("Content-Type", "text/html");
          },
        };
      },
    },
  };
  for (const path of ["/shorts", "/watch?v=remotion-orbital", "/studio", "/about", "/playlist/saved"]) {
    const response = await serveShowcase(new Request(`https://video.aphrody.com${path}`), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html");
  }
  expect(keys).toEqual(Array(5).fill("showcase/test-v1/index.html"));
});

test("showcase serves HEAD and byte ranges without buffering the object", async () => {
  const object = {
    size: 100,
    httpEtag: '"abc"',
    writeHttpMetadata(headers: Headers) {
      headers.set("Content-Type", "audio/wav");
    },
  };
  const env = {
    SHOWCASE_PREFIX: "showcase/test-v1",
    SHOWCASE: {
      async head() {
        return object;
      },
      async get(_key: string, options: { range?: Headers }) {
        expect(options.range).toBeInstanceOf(Headers);
        return { ...object, range: { offset: 10, length: 3 }, body: new Blob(["abc"]).stream() };
      },
    },
  };
  const head = await serveShowcase(new Request("https://video.aphrody.com/native/audio.wav", { method: "HEAD" }), env);
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  expect(head.headers.get("Content-Length")).toBe("100");
  const range = await serveShowcase(
    new Request("https://video.aphrody.com/native/audio.wav", { headers: { Range: "bytes=10-12" } }),
    env,
  );
  expect(range.status).toBe(206);
  expect(range.headers.get("Content-Range")).toBe("bytes 10-12/100");
  expect(await range.text()).toBe("abc");
});

test("showcase rejects writes and hidden paths before touching R2", async () => {
  const env = {
    SHOWCASE_PREFIX: "showcase/test-v1",
    SHOWCASE: {
      async head() {
        return null;
      },
      async get() {
        throw new Error("R2 should not be read");
      },
    },
  };
  expect((await serveShowcase(new Request("https://video.aphrody.com/.env"), env)).status).toBe(404);
  expect((await serveShowcase(new Request("https://video.aphrody.com/%5cprivate"), env)).status).toBe(404);
  expect((await serveShowcase(new Request("https://video.aphrody.com/%zz"), env)).status).toBe(400);
  const write = await serveShowcase(new Request("https://video.aphrody.com/", { method: "POST" }), env);
  expect(write.status).toBe(405);
  expect(write.headers.get("Allow")).toBe("GET, HEAD");
});

test("showcase handles absent and unchanged objects and forces source downloads", async () => {
  const absent = {
    SHOWCASE_PREFIX: "showcase/test-v1",
    SHOWCASE: {
      async head() {
        return null;
      },
      async get() {
        return null;
      },
    },
  };
  expect((await serveShowcase(new Request("https://video.aphrody.com/absent"), absent)).status).toBe(404);
  const unchanged = {
    SHOWCASE_PREFIX: "showcase/test-v1",
    SHOWCASE: {
      async head() {
        return null;
      },
      async get() {
        return { size: 0, httpEtag: '"abc"', writeHttpMetadata() {} };
      },
    },
  };
  expect(
    (
      await serveShowcase(
        new Request("https://video.aphrody.com/app.js", { headers: { "If-None-Match": '"abc"' } }),
        unchanged,
      )
    ).status,
  ).toBe(304);
  const source = {
    SHOWCASE_PREFIX: "showcase/test-v1",
    SHOWCASE: {
      async head() {
        return null;
      },
      async get() {
        return { size: 4, httpEtag: '"abc"', body: new Blob(["code"]).stream(), writeHttpMetadata() {} };
      },
    },
  };
  const response = await serveShowcase(new Request("https://video.aphrody.com/sources/artwork.tsx"), source);
  expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
  expect(response.headers.get("Content-Disposition")).toBe("attachment");
});
