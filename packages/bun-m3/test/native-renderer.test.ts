// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createNativeM3Renderer } from "../src/native-renderer";

test("native CSS adapter uses only fixed private owner with no request authentication", async () => {
  const render = createNativeM3Renderer({
    endpoint: "http://m3-renderer:3000",
    fetch: async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("http://m3-renderer:3000");
      expect(url.pathname).toBe("/api/m3/css");
      expect(url.searchParams.get("seed")).toBe("#abc");
      expect(init?.headers).toBeUndefined();
      expect(init?.credentials).toBe("omit");
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(":root{--native:#abc}", { headers: { "content-type": "text/css; charset=utf-8" } });
    },
  });
  expect(await render({ sheet: "scheme", seed: "#abc", dark: false })).toBe(":root{--native:#abc}");
  expect(() => createNativeM3Renderer({ endpoint: "https://external.test" as "http://m3-renderer:3000" })).toThrow(
    "internal",
  );
});

test("native CSS adapter rejects upstream failures, wrong MIME, invalid encoding and oversized streams", async () => {
  for (const response of [
    new Response("unavailable", { status: 503 }),
    new Response("<html>not CSS</html>", { headers: { "content-type": "text/html" } }),
    new Response("small", { headers: { "content-type": "text/css", "content-length": "2097153" } }),
    new Response(new Uint8Array([255]), { headers: { "content-type": "text/css" } }),
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(2097153));
          controller.close();
        },
      }),
      { headers: { "content-type": "text/css" } },
    ),
  ]) {
    const render = createNativeM3Renderer({
      endpoint: "http://m3-renderer:3000",
      fetch: async () => response,
    });
    await expect(render({ sheet: "scheme" })).rejects.toThrow();
  }
});
