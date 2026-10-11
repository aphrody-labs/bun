// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { attachVideoHlsPlayback, getHlsBrowserAssetPath } from "../src/hls";

test("HLS package serves its pinned decoder and rejects server playback", async () => {
  const path = getHlsBrowserAssetPath();
  expect(path.replaceAll("\\", "/")).toEndWith("/hls.min.js");
  expect(await Bun.file(path).exists()).toBe(true);
  await expect(
    attachVideoHlsPlayback({} as HTMLVideoElement, { src: "https://media.example.test/a.m3u8" }),
  ).rejects.toThrow("browser video element");
});
