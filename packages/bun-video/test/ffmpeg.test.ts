import { describe, expect, test } from "bun:test";
import { FFmpeg, ffmpegABI, ffmpegLibraryPath } from "../src/ffmpeg";

test("FFmpeg requires an absolute native library directory", () => {
  expect(() => ffmpegLibraryPath("avcodec", "relative")).toThrow("must be absolute");
});

describe.skipIf(!process.env.BUN_VIDEO_MEDIA_DIR)("native FFmpeg ownership", () => {
  test("loads every declared symbol and owns frames and packets until disposal", () => {
    const ffmpeg = FFmpeg.open(process.env.BUN_VIDEO_MEDIA_DIR);
    try {
      for (const component of Object.keys(ffmpegABI) as Array<keyof typeof ffmpegABI>) {
        for (const name of Object.keys(ffmpegABI[component])) {
          expect(typeof (ffmpeg.libraries[component].symbols as Record<string, unknown>)[name]).toBe("function");
        }
      }
      const frame = ffmpeg.allocateFrame();
      const packet = ffmpeg.allocatePacket();
      expect(frame.pointer).toBeGreaterThan(0);
      expect(packet.pointer).toBeGreaterThan(0);
      frame.unref();
      packet.unref();
      ffmpeg.close();
      expect(() => frame.pointer).toThrow("frame is closed");
      expect(() => packet.pointer).toThrow("packet is closed");
      expect(() => ffmpeg.libraries).toThrow("FFmpeg is closed");
      frame.close();
      packet.close();
      ffmpeg.close();
    } finally {
      ffmpeg.close();
    }
  });
});
