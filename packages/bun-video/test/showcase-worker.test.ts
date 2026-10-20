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
