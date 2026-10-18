import { integers, mp4 } from "./fixture";
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { rmSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { tempDir } from "harness";

const root = String(tempDir("bun-video-native-", {}));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function rgbaPng(secondAlpha = 255) {
  const chunk = (type: string, data: Uint8Array) => {
    const payload = Buffer.concat([Buffer.from(type), data]);
    return Buffer.concat([integers(data.length), payload, integers(Bun.hash.crc32(payload))]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(new Uint8Array([0, 255, 0, 0, 255, 0, 0, 255, secondAlpha]))),
    chunk("IEND", new Uint8Array()),
  ]);
}

test("Image.rgba publishes transformed owned pixels and remains safe through GC", async () => {
  const png = rgbaPng();
  for (let index = 0; index < 24; index++) {
    const image = new Bun.Image(png).rotate(90).flip();
    const pending = image.rgba();
    Bun.gc(true);
    const result = await pending;
    expect({
      width: result.width,
      height: result.height,
      channels: result.channels,
      iccProfile: result.iccProfile,
    }).toEqual({ width: 1, height: 2, channels: 4, iccProfile: null });
    expect([...result.data]).toEqual([0, 0, 255, 255, 255, 0, 0, 255]);
    expect([image.width, image.height]).toEqual([1, 2]);
    Bun.gc(true);
    expect([...result.data]).toEqual([0, 0, 255, 255, 255, 0, 0, 255]);
  }
  const input = Uint8Array.from(png);
  const image = new Bun.Image(input);
  structuredClone(input.buffer, { transfer: [input.buffer] });
  await expect(image.rgba()).rejects.toMatchObject({ code: "ERR_INVALID_STATE" });
  expect([...(await new Bun.Image(rgbaPng(128)).rgba()).data]).toEqual([255, 0, 0, 255, 0, 0, 255, 128]);
});

test("Image.extract crops before rotate/resize and rejects invalid rectangles", async () => {
  const png = rgbaPng();
  const image = new Bun.Image(png)
    .extract({ left: 1, top: 0, width: 1, height: 1 })
    .rotate(90)
    .resize(2, 1, { filter: "nearest" });
  const result = await image.rgba();
  expect({ width: result.width, height: result.height, data: [...result.data] }).toEqual({
    width: 2,
    height: 1,
    data: [0, 0, 255, 255, 0, 0, 255, 255],
  });
  await expect(new Bun.Image(png).extract({ left: 2, top: 0, width: 1, height: 1 }).rgba()).rejects.toMatchObject({
    code: "ERR_IMAGE_INVALID_TRANSFORM",
    message: "Image.extract rectangle (2, 0, 1, 1) exceeds decoded image bounds 2x1",
  });
  await expect(
    new Bun.Image(png).extract({ left: 0xffffffff, top: 0, width: 1, height: 1 }).rgba(),
  ).rejects.toMatchObject({ code: "ERR_IMAGE_INVALID_TRANSFORM" });
  for (const rectangle of [
    { left: 0, top: 0, width: 0, height: 1 },
    { left: -1, top: 0, width: 1, height: 1 },
    { left: 0, top: 0, width: 1.5, height: 1 },
    { left: 0, top: Infinity, width: 1, height: 1 },
  ])
    expect(() => new Bun.Image(png).extract(rectangle)).toThrow("supported integer range");
  const encoded = await new Bun.Image(png).extract({ left: 0, top: 0, width: 1, height: 1 }).png().bytes();
  expect([...(await new Bun.Image(encoded).rgba()).data]).toEqual([255, 0, 0, 255]);
});

test("Video validates fluent Image operations and bounded native jobs before reading", () => {
  const video = new Bun.Video(new Uint8Array([1, 2, 3]));
  expect(video.frame(0).resize(2, 1).rotate(90).flip().flop().modulate({ brightness: 1 }).png()).toBe(video);
  for (const time of [-1, NaN, Infinity, -Infinity])
    expect(() => video.frame(time)).toThrow("frame time must be finite");
  expect(() => video.frames({ start: 0, end: 65 })).toThrow("at most maxFrames");
  expect(() => video.frames({ start: 1, end: 0 })).toThrow("start < end");
  expect(() => video.audio({ duration: 31 })).toThrow("duration");
  expect(() => video.gif({ duration: 6 })).toThrow("duration");
  expect(() => video.gif({ duration: 1, fps: 1.5 })).toThrow("fps");
  expect(() => video.remux("\0")).toThrow("without NUL");
  expect(() => video.hls("\0")).toThrow("without NUL");
  expect(() => video.hls(5 as any)).toThrow("directory path");
  expect(() => video.hls("out", 5 as any)).toThrow("options must be an object");
  for (const segmentSeconds of [0.4, 61, NaN, Infinity])
    expect(() => video.hls("out", { segmentSeconds })).toThrow("segmentSeconds");
  expect(Bun.Video.decoder).toBe("filmcraft");
});

test.skipIf(Bun.Video.available)("missing native provider rejects before reading a path", async () => {
  const video = new Bun.Video("not-read-without-video-provider");
  await expect(video.metadata()).rejects.toMatchObject({ code: "ERR_VIDEO_PROVIDER_UNAVAILABLE" });
  await expect(video.bytes()).rejects.toMatchObject({ code: "ERR_VIDEO_PROVIDER_UNAVAILABLE" });
});

describe.skipIf(!Bun.Video.available)("FilmCraft MP4 owner", () => {
  test("pending metadata keeps its captured source alive after Video collection", async () => {
    const bytes = mp4();
    for (let batch = 0; batch < 64; batch++) {
      const pending = Array.from({ length: 32 }, () => {
        const input = Uint8Array.from(bytes);
        const promise = new Bun.Video(input).metadata();
        structuredClone(input.buffer, { transfer: [input.buffer] });
        return promise;
      });
      Bun.gc(true);
      const results = await Promise.all(pending);
      expect(
        results.every(result => result.frameCount === 3 && result.width === 64 && result.fileBytes === bytes.length),
      ).toBe(true);
    }
  });

  test("metadata reports exact sample timing from immutable snapshots and file ranges", async () => {
    const bytes = mp4();
    const path = join(root, "source.mp4");
    writeFileSync(path, bytes);
    const mutable = Uint8Array.from(bytes);
    const pending = new Bun.Video(mutable).metadata();
    mutable.fill(0);
    const metadata = await pending;
    expect(metadata).toMatchObject({
      width: 64,
      height: 48,
      frameCount: 3,
      fpsNumerator: 24000,
      fpsDenominator: 1001,
      audioStreams: [],
      fileBytes: bytes.length,
    });
    expect(metadata.duration).toBeCloseTo(3003 / 24000, 8);
    expect(await new Bun.Video(path).metadata()).toEqual(metadata);
  });

  test("remux preserves sample bytes and refuses overwriting", async () => {
    const bytes = mp4();
    const output = join(root, "remux.mp4");
    const video = new Bun.Video(bytes);
    expect(await video.remux(output)).toBe((await Bun.file(output).bytes()).length);
    expect(await new Bun.Video(output).metadata()).toMatchObject({
      width: 64,
      height: 48,
      frameCount: 3,
      fpsNumerator: 24000,
      fpsDenominator: 1001,
    });
    const written = await Bun.file(output).bytes();
    for (const number of [1, 2, 3]) expect(Buffer.from(written).includes(Buffer.alloc(16, number))).toBe(true);
    await expect(video.remux(output)).rejects.toMatchObject({ code: "ERR_VIDEO_PROVIDER" });
    expect(await Bun.file(output).bytes()).toEqual(written);
  });

  test("malformed containers reject with a recoverable provider error", async () => {
    const video = new Bun.Video(new Uint8Array([1, 2, 3]));
    await expect(video.metadata()).rejects.toMatchObject({ code: "ERR_VIDEO_PROVIDER" });
    await expect(video.frame(0).bytes()).rejects.toMatchObject({ code: "ERR_VIDEO_PROVIDER" });
  });

  test("rational-FPS batch bounds survive floating-point rounding", async () => {
    const step = 1001 / 24000;
    const start = 192 * step;
    const end = 256 * step;
    expect(Math.ceil((end - start) / step)).toBe(65);
    // This source is shorter than the requested window: validation must reach the provider.
    const pending = new Bun.Video(mp4()).frames({ start, end, step, maxFrames: 64 });
    await expect(pending).rejects.toMatchObject({ code: "ERR_VIDEO_PROVIDER" });
  });
});

// External decoder vector is selected explicitly; normal CI stays hermetic.
describe.skipIf(!Bun.Video.available || !process.env.BUN_VIDEO_FILMCRAFT_TEST_VIDEO)("authorized H264 source", () => {
  function source(step: string) {
    console.info(`FilmCraft external vector: ${step}`);
    return new Bun.Video(process.env.BUN_VIDEO_FILMCRAFT_TEST_VIDEO!);
  }

  test("metadata probes the regular source without loading its bytes", async () => {
    const metadata = await source("metadata").metadata();
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.frameCount).toBeGreaterThan(1);
    expect(metadata.fileBytes).toBeGreaterThan(0);
  }, 30_000);

  test("frame transforms reuse the native Image pipeline", async () => {
    const video = source("frame PNG");
    const png = await video.frame(1).resize(32, 24).rotate(90).flip().png().bytes();
    expect(await new Bun.Image(png).metadata()).toMatchObject({ width: 32, height: 24, format: "png" });
  }, 30_000);

  test("rgba publishes the transformed frame pixels", async () => {
    const video = source("frame RGBA").frame(1).resize(32, 24).rotate(90).flip();
    const raw = await video.rgba();
    expect({ width: raw.width, height: raw.height, channels: raw.channels, bytes: raw.data.byteLength }).toEqual({
      width: 32,
      height: 24,
      channels: 4,
      bytes: 24 * 32 * 4,
    });
  }, 30_000);

  test("placeholder encodes a real selected frame", async () => {
    const placeholder = await source("placeholder").frame(1).placeholder();
    expect(placeholder.startsWith("data:image/png;base64,")).toBe(true);
    const image = new Bun.Image(Buffer.from(placeholder.split(",", 2)[1]!, "base64"));
    expect((await image.metadata()).width).toBeGreaterThan(0);
  }, 30_000);

  test("sequence shares one native decoder session", async () => {
    const video = source("sequence");
    const metadata = await video.metadata();
    const frames = await video.frames({ start: 1, end: 1.1, step: 0.05, maxFrames: 3 });
    expect(frames).toHaveLength(2);
    expect(frames[1]!.time).toBeGreaterThanOrEqual(frames[0]!.time);
    expect(await new Bun.Image(frames[0]!.bytes).metadata()).toMatchObject({
      width: metadata.width,
      height: metadata.height,
    });
  }, 30_000);

  test("audio exports bounded PCM16 WAV at the requested rate", async () => {
    const video = source("audio WAV");
    const metadata = await video.metadata();
    expect(metadata.audioStreams.length).toBeGreaterThan(0);
    const wav = await video.audio({ start: 1, duration: 0.1, sampleRate: 16000 });
    expect(Buffer.from(wav.subarray(0, 4)).toString()).toBe("RIFF");
    expect(Buffer.from(wav.subarray(8, 12)).toString()).toBe("WAVE");
    const waveHeader = Buffer.from(wav);
    expect(waveHeader.readUInt16LE(20)).toBe(1);
    expect(waveHeader.readUInt16LE(22)).toBe(metadata.audioStreams[0]!.channels);
    expect(waveHeader.readUInt32LE(24)).toBe(16000);
    expect(waveHeader.readUInt16LE(34)).toBe(16);
    expect(wav.byteLength).toBe(44 + 1600 * metadata.audioStreams[0]!.channels * 2);
  }, 30_000);

  test("gif exports a bounded animated-image container", async () => {
    const gif = await source("GIF").gif({ start: 1, duration: 0.1, fps: 10, width: 32 });
    expect(Buffer.from(gif.subarray(0, 6)).toString()).toBe("GIF89a");
    expect(Buffer.from(gif).readUInt16LE(6)).toBe(32);
    expect(gif[gif.length - 1]).toBe(0x3b);
  }, 30_000);
});
