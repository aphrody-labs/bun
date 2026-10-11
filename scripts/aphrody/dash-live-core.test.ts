// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createDashLiveTransport, validateDashLiveConfig } from "./dash-live-core";

const mpd =
  '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet><Representation><BaseURL>video.mp4?token=private-marker&amp;part=1</BaseURL><SegmentBase indexRange="4-7"><Initialization range="0-3"/></SegmentBase></Representation></AdaptationSet></Period></MPD>';
function config(origin: string) {
  return validateDashLiveConfig({
    src: `${origin}/manifest.mpd`,
    allowedOrigins: [origin],
    headersByOrigin: { [origin]: { Authorization: "private-marker" } },
  });
}

test("live media config requires explicit origins and header scope, and rejects protection configuration", () => {
  const base = {
    src: "https://media.example.test/manifest.mpd",
    allowedOrigins: ["https://media.example.test"],
  };
  expect(validateDashLiveConfig(base).headersByOrigin).toEqual({});
  for (const invalid of [
    { src: "http://media.example.test/manifest.mpd", allowedOrigins: ["http://media.example.test"] },
    { ...base, src: "https://outside.example.test/m.mpd" },
    { ...base, allowedOrigins: ["https://media.example.test/path"] },
    { ...base, headersByOrigin: { "https://outside.example.test": { Cookie: "private-marker" } } },
    {
      ...base,
      headersByOrigin: { "https://media.example.test": { Host: "outside.example.test" } },
    },
    {
      ...base,
      protectionData: {
        "com.widevine.alpha": { serverURL: "https://outside.example.test/license" },
      },
    },
    { ...base, protectionData: {} },
  ])
    expect(() => validateDashLiveConfig(invalid)).toThrow();
});

test("Bun fetches MPD, rewrites private BaseURLs to opaque tokens and proxies captured-style byte ranges", async () => {
  const seen: {
    url: URL;
    authorization: string | null;
    range: string | null;
    cookie: string | null;
  }[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      seen.push({
        url,
        authorization: request.headers.get("authorization"),
        range: request.headers.get("range"),
        cookie: request.headers.get("cookie"),
      });
      if (url.pathname === "/manifest.mpd")
        return new Response(mpd, { headers: { "Content-Type": "application/dash+xml" } });
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Range": "bytes 0-3/8",
          "Set-Cookie": "private-marker",
        },
      });
    },
  });
  try {
    const transport = createDashLiveTransport(config(server.url.origin));
    const source = await transport.fetchSource();
    expect(source.text).toBe(mpd);
    const local = await transport.rewriteDashManifest(
      source.text,
      source.baseURL,
      (token) => `http://localhost/live/${token}`,
    );
    expect(local).not.toContain("private-marker");
    const token = /http:\/\/localhost\/live\/([\da-f-]+)/.exec(local)![1]!;
    const response = await transport.fetchResource(
      token,
      new Request("http://localhost/live", {
        headers: { Range: "bytes=0-3", Cookie: "browser-secret" },
      }),
    );
    expect(response.status).toBe(206);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(seen[1]?.url.searchParams.get("part")).toBe("1");
    expect(seen[1]?.authorization).toBe("private-marker");
    expect(seen[1]?.range).toBe("bytes=0-3");
    expect(seen[1]?.cookie).toBeNull();
    const head = await transport.fetchResource(
      token,
      new Request("http://localhost/live", { method: "HEAD" }),
    );
    expect(head.status).toBe(206);
    expect(await head.text()).toBe("");
  } finally {
    server.stop(true);
  }
});

test("POST requests and license resource registration are refused before fetching", async () => {
  let calls = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      calls++;
      return new Response("media", { headers: { "Content-Type": "video/mp4" } });
    },
  });
  try {
    const origin = server.url.origin;
    const transport = createDashLiveTransport(config(origin));
    await expect(
      transport.proxy(
        `${origin}/video.mp4`,
        new Request("http://localhost/live", { method: "POST", body: "opaque-data" }),
      ),
    ).rejects.toThrow("method is not authorized");
    expect(() => transport.resourceToken(`${origin}/license`)).toThrow("media resources only");
    expect(calls).toBe(0);
  } finally {
    server.stop(true);
  }
});

test("origin credentials never follow cross-origin media requests or redirects", async () => {
  let secondAuthorization: string | null | undefined;
  let redirectTargetCalls = 0;
  const second = Bun.serve({
    port: 0,
    fetch(request) {
      secondAuthorization = request.headers.get("authorization");
      redirectTargetCalls++;
      return new Response("bytes", { headers: { "Content-Type": "video/mp4" } });
    },
  });
  const first = Bun.serve({
    port: 0,
    fetch() {
      return Response.redirect(`${second.url.origin}/redirect-target`, 302);
    },
  });
  try {
    const transport = createDashLiveTransport(
      validateDashLiveConfig({
        src: `${first.url.origin}/m.mpd`,
        allowedOrigins: [first.url.origin, second.url.origin],
        headersByOrigin: { [first.url.origin]: { Authorization: "private-marker" } },
      }),
    );
    const response = await transport.fetchResource(
      transport.resourceToken(`${second.url.origin}/video.mp4`),
    );
    expect(await response.text()).toBe("bytes");
    expect(secondAuthorization).toBeNull();
    await expect(transport.fetchSource()).rejects.toThrow("redirects are not authorized");
    expect(redirectTargetCalls).toBe(1);
    expect(() => transport.resourceToken("https://outside.example.test/video.mp4")).toThrow(
      "not authorized",
    );
  } finally {
    first.stop(true);
    second.stop(true);
  }
});

test("timeouts and size bounds fail without exposing remote URLs or response bodies", async () => {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname === "/hang") return new Promise<Response>(() => {});
      return new Response("private-marker".repeat(20), {
        headers: { "Content-Type": "application/dash+xml" },
      });
    },
  });
  try {
    const transport = createDashLiveTransport(config(server.url.origin), { maxManifestBytes: 16 });
    await expect(transport.fetchSource()).rejects.toThrow("valid bounded MPD");
    const timeout = createDashLiveTransport(
      { ...config(server.url.origin), src: `${server.url.origin}/hang?token=private-marker` },
      { timeoutMs: 25 },
    );
    await expect(timeout.fetchSource()).rejects.toThrow("Live DASH request timed out.");
  } finally {
    server.stop(true);
  }
});

test("unsupported MPD references and methods fail before remote resources are contacted", async () => {
  const transport = createDashLiveTransport(config("https://media.example.test"));
  for (const tag of [
    '<SegmentTemplate media="segment-$Number$.m4s"/>',
    "<Location>https://outside.example.test/m.mpd</Location>",
    '<UTCTiming schemeIdUri="test" value="https://outside.example.test/time"/>',
  ]) {
    const xml = mpd.replace("<SegmentBase", `${tag}<SegmentBase`);
    await expect(
      transport.rewriteDashManifest(
        xml,
        "https://media.example.test/m.mpd",
        (token) => `http://localhost/live/${token}`,
      ),
    ).rejects.toThrow("only SegmentBase");
  }
  await expect(transport.fetchResource("unknown")).rejects.toThrow(
    "Unknown live DASH resource token",
  );
  await expect(
    transport.fetchResource(
      transport.sourceToken,
      new Request("http://localhost/live", { method: "POST", body: "data" }),
    ),
  ).rejects.toThrow("method is not authorized");
});
