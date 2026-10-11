// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { prepareCapturedDash } from "./dash-lab";

test("captured SegmentBase media URLs become opaque loopback routes", () => {
  const mpd =
    '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet><Representation bandwidth="100"><BaseURL>https://cdn.example/video.mp4?token=secret&amp;v=1</BaseURL><SegmentBase indexRange="10-20"/></Representation></AdaptationSet></Period></MPD>';
  const prepared = prepareCapturedDash(
    mpd,
    "https://cdn.example/a.mpd",
    "http://127.0.0.1:1234/lab/id/",
  );
  expect(prepared.manifest).toContain("http://127.0.0.1:1234/lab/id/media/0");
  expect(prepared.manifest).not.toContain("token=secret");
  expect(prepared.resources).toEqual(["https://cdn.example/video.mp4?token=secret&v=1"]);
  expect(prepared.summary.encrypted).toBe(false);
});

test("unsupported external resources and segment templates fail closed", () => {
  const base =
    '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><BaseURL>https://cdn.example/video.mp4</BaseURL>';
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
