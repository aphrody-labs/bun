// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { prepareCapturedDash, startDashLab } from "./dash-lab";
import { tempDir } from "../../test/harness";

test("live dashboard fetches a private MPD and media ranges without exposing headers or permitting POST", async () => {
  const seen: string[] = [];
  const upstream = Bun.serve({
    port: 0,
    fetch(request) {
      seen.push(request.method);
      expect(request.headers.get("authorization")).toBe("fixture-only-marker");
      if (new URL(request.url).pathname === "/manifest.mpd")
        return new Response(
          `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet><Representation><BaseURL>${upstream.url.origin}/media.mp4?token=private-fixture</BaseURL><SegmentBase indexRange="4-7"/></Representation></AdaptationSet></Period></MPD>`,
          { headers: { "Content-Type": "application/dash+xml" } },
        );
      expect(request.headers.get("Range")).toBe("bytes=0-3");
      return new Response(new Uint8Array([0, 1, 2, 3]), {
        status: 206,
        headers: { "Content-Type": "video/mp4", "Content-Range": "bytes 0-3/8" },
      });
    },
  });
  using dir = tempDir("live-dash-lab", {
    "config.json": JSON.stringify({
      src: `${upstream.url.origin}/manifest.mpd`,
      allowedOrigins: [upstream.url.origin],
      headersByOrigin: { [upstream.url.origin]: { Authorization: "fixture-only-marker" } },
    }),
  });
  let lab: Awaited<ReturnType<typeof startDashLab>> | undefined;
  try {
    lab = await startDashLab(`${dir}/config.json`, "live");
    const summary = await (await fetch(`${lab.url}summary`)).json();
    expect(summary.capturedOnly).toBe(false);
    expect(summary.liveManifestConfigured).toBe(true);
    expect(summary.playbackValidated).toBe(false);
    const xml = await (await fetch(`${lab.url}manifest.mpd`)).text();
    expect(xml).not.toContain("private-fixture");
    expect(xml).not.toContain("fixture-only-marker");
    const media = /<BaseURL>([^<]+)<\/BaseURL>/.exec(xml)![1]!;
    const response = await fetch(media, {
      headers: { Range: "bytes=0-3", Cookie: "must-not-forward" },
    });
    expect(response.status).toBe(206);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 1, 2, 3]);
    expect((await fetch(media, { method: "POST", body: "not-a-license" })).status).toBe(405);
    expect((await fetch(`${lab.url}live/00000000-0000-0000-0000-000000000000`)).status).toBe(502);
    expect(seen).toEqual(["GET", "GET"]);
  } finally {
    lab?.server.stop(true);
    upstream.stop(true);
  }
});

test("captured SegmentBase media URLs become opaque loopback routes", () => {
  const mpd =
    '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet><Representation bandwidth="100"><BaseURL>https://cdn.example/video.mp4?token=secret&amp;v=1</BaseURL><SegmentBase indexRange="10-20"/></Representation></AdaptationSet></Period></MPD>';
  const prepared = prepareCapturedDash(mpd, "https://cdn.example/a.mpd", "http://127.0.0.1:1234/lab/id/");
  expect(prepared.manifest).toContain("http://127.0.0.1:1234/lab/id/media/0");
  expect(prepared.manifest).not.toContain("token=secret");
  expect(prepared.resources).toEqual(["https://cdn.example/video.mp4?token=secret&v=1"]);
  expect(prepared.summary.encrypted).toBe(false);
});

test("unsupported external resources and segment templates fail closed", () => {
  const base = '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><BaseURL>https://cdn.example/video.mp4</BaseURL>';
  expect(() =>
    prepareCapturedDash(
      base + '<SegmentTemplate media="secret-$Number$.m4s"/></MPD>',
      "https://cdn.example/a.mpd",
      "http://127.0.0.1:1234/lab/id/",
    ),
  ).toThrow("BaseURL/SegmentBase");
  expect(() =>
    prepareCapturedDash(
      base + '<Extra href="https://secret.example/token"/></MPD>',
      "https://cdn.example/a.mpd",
      "http://127.0.0.1:1234/lab/id/",
    ),
  ).toThrow("external resource");
});
