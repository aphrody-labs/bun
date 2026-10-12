// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { requestJson } from "../integrations/packages/interop/native/src/http.ts";

test("migrated HTTP transport preserves methods and headers and refuses redirects", async () => {
  let received: { method: string; header: string | null; body: string } | undefined;
  using server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/redirect")
        return new Response(null, { status: 302, headers: { location: "/target" } });
      received = {
        method: request.method,
        header: request.headers.get("x-migration-fixture"),
        body: await request.text(),
      };
      return Response.json({ received: true });
    },
  });
  const result = await requestJson(
    server.url,
    { method: "POST", headers: { "x-migration-fixture": "fixture" }, body: "payload" },
    { timeoutMs: 2_000 },
  );
  expect(result.value).toEqual({ received: true });
  expect(received).toEqual({ method: "POST", header: "fixture", body: "payload" });
  await expect(requestJson(new URL("/redirect", server.url), {}, { timeoutMs: 2_000 })).rejects.toMatchObject({
    stage: "request",
    timedOut: false,
  });
});
