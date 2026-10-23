import { expect, test } from "bun:test";
import { renderVideoPage, videoWorks, type Showcase } from "./video.ts";

const asset = (file: string, sha256: string, bytes = 1000) => ({ file, sha256, bytes, mime: "" });
const work = (id: string, evidence: string) => ({
  id,
  title: id,
  description: `${id} description`,
  durationFrames: 96,
  fps: { num: 24, den: 1 },
  width: 960,
  height: 540,
  evidence: [evidence],
  poster: `posters/${id}.webp`,
  video: `videos/${id}.mp4`,
});
const showcase: Showcase = {
  schema: 1,
  generatedAt: "2026-10-22T14:00:00.000Z",
  sourceRevision: "aa617be74196".padEnd(40, "0"),
  runtime: { version: "1.4.5", revision: "1d019cb1", platform: "linux" },
  works: [
    work("first", "e1"),
    work("copy", "e2"),
    work("unproven", "e3"),
    work("second", "e4"),
    work("video-only", "e5"),
  ],
  evidence: [
    {
      id: "e1",
      status: "passed",
      assets: [asset("posters/first.webp", "p1"), asset("videos/first.mp4", "same", 598211)],
    },
    // The same render published under a second name.
    {
      id: "e2",
      status: "passed",
      assets: [asset("posters/copy.webp", "p2"), asset("videos/copy.mp4", "same", 598211)],
    },
    { id: "e3", status: "failed", assets: [asset("posters/unproven.webp", "p3"), asset("videos/unproven.mp4", "u")] },
    { id: "e4", status: "passed", assets: [asset("posters/second.webp", "p4"), asset("videos/second.mp4", "other")] },
    // Evidence that attests the video only, as the M3 renders do.
    { id: "e5", status: "passed", assets: [asset("videos/video-only.mp4", "third")] },
  ],
};

test("one work per rendered file, only with passed evidence", () => {
  const works = videoWorks(showcase);
  expect(works.map(w => w.id)).toEqual(["first", "second", "video-only"]);
  expect(works[0]).toMatchObject({ frames: 96, fps: 24, width: 960, height: 540, bytes: 598211, sha256: "same" });
});

test("the page plays the files through /video/media and shows the measurements", () => {
  const html = renderVideoPage(showcase, videoWorks(showcase), "aphrody-labs/bun");
  expect(html).toContain('<source src="/video/media/videos/first.mp4" type="video/mp4">');
  expect(html).toContain('poster="/video/media/posters/first.webp"');
  expect(html).toContain("96 frames at 24 fps (4.0 s) · 960×540 · H.264 MP4, 584 KiB");
  expect(html).not.toContain("videos/copy.mp4");
  expect(html).not.toContain("videos/unproven.mp4");
});
