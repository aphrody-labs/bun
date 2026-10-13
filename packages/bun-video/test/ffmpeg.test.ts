import { describe, expect, test } from "bun:test";
import { FFmpeg, ffmpegABI, ffmpegLibraryPath } from "../src/ffmpeg";
import { openVideoPipeline } from "../src/pipeline";
import { materializeVideoSource, resolveVideoSource } from "../src/source";

test("source normalization preserves paths and byte view boundaries", () => {
  expect(resolveVideoSource("clips/example.mp4")).toEqual({ kind: "file", path: "clips/example.mp4" });
  expect(resolveVideoSource("C:\\clips\\example.mp4")).toEqual({ kind: "file", path: "C:\\clips\\example.mp4" });
  const path = process.platform === "win32" ? "C:\\clips\\space name.mp4" : "/clips/space name.mp4";
  expect(resolveVideoSource(Bun.pathToFileURL(path))).toEqual({ kind: "file", path });
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const source = resolveVideoSource(new DataView(bytes.buffer, 1, 2));
  expect(source.kind).toBe("bytes");
  if (source.kind !== "bytes" || !(source.data instanceof Uint8Array)) throw new Error("Expected byte view");
  expect([...source.data]).toEqual([2, 3]);
  expect(source.data.buffer).toBe(bytes.buffer);
  expect(() => resolveVideoSource("javascript:alert(1)")).toThrow("Unsupported video source protocol");
});

test("FFmpeg requires an absolute native library directory", () => {
  expect(() => ffmpegLibraryPath("avcodec", "relative")).toThrow("must be absolute");
});

test("response ingestion retains binary data and honors cancellation", async () => {
  const source = await materializeVideoSource(new Response(new Uint8Array([1, 2, 3])));
  expect(source.kind).toBe("bytes");
  if (source.kind !== "bytes" || !(source.data instanceof Uint8Array)) throw new Error("Expected byte view");
  expect([...source.data]).toEqual([1, 2, 3]);
  const controller = new AbortController();
  controller.abort(new Error("cancelled media ingestion"));
  await expect(materializeVideoSource(new Blob([new Uint8Array([1])]), controller.signal)).rejects.toThrow(
    "cancelled media ingestion",
  );
});

describe.skipIf(!process.env.BUN_VIDEO_MEDIA_DIR)("native FFmpeg ownership", () => {
  test("pipeline opens a native WAV source and closes its demuxer", async () => {
    const bytes = new Uint8Array(46);
    const view = new DataView(bytes.buffer);
    const text = (offset: number, value: string) => bytes.set(new TextEncoder().encode(value), offset);
    text(0, "RIFF");
    view.setUint32(4, 38, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 16000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, 2, true);
    for (const source of [
      `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`,
      bytes,
      new Blob([bytes]),
      new Response(bytes),
    ]) {
      using pipeline = await openVideoPipeline({
        source,
        mediaDirectory: process.env.BUN_VIDEO_MEDIA_DIR,
        webgpu: false,
      });
      using packet = pipeline.ffmpeg.allocatePacket();
      expect(pipeline.ffmpeg.readPacket(pipeline.input, packet)).toBe(true);
      expect(pipeline.ffmpeg.readPacket(pipeline.input, packet)).toBe(false);
      pipeline.close();
      expect(() => pipeline.input.pointer).toThrow("FFmpeg input is closed");
    }
  });

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
