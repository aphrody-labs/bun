import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "harness";

// Bun.Video decodes WebM, Matroska and AVI through FilmCraft's container owners. The fixtures are
// generated with the system ffmpeg at runtime, so a machine without it skips (loudly) instead of
// shipping binary blobs in the repository.
const ffmpeg = Bun.which("ffmpeg");
const ready = Boolean(Bun.Video.available) && Boolean(ffmpeg);
if (!ready) {
  console.warn(
    `SKIPPED video-containers: Bun.Video.available=${Boolean(Bun.Video.available)} ffmpeg=${ffmpeg ?? "not found"}; WebM/MKV/AVI decode is NOT covered by this run`,
  );
}

const WIDTH = 64;
const HEIGHT = 48;
const FPS = 10;
const SECONDS = 1;

const root = String(tempDir("bun-video-containers-", {}));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const fixtures = {
  "vp8.webm": ["-c:v", "libvpx", "-b:v", "200k", "-an"],
  "vp9.webm": ["-c:v", "libvpx-vp9", "-b:v", "200k", "-an"],
  "h264.mkv": ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-an"],
  "mjpeg.avi": ["-c:v", "mjpeg", "-pix_fmt", "yuvj420p", "-q:v", "5", "-an"],
} as const;
type Name = keyof typeof fixtures;
const available = new Set<Name>();

beforeAll(async () => {
  if (!ready) return;
  for (const [name, codec] of Object.entries(fixtures) as [Name, readonly string[]][]) {
    await using proc = Bun.spawn({
      cmd: [
        ffmpeg!,
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc=size=${WIDTH}x${HEIGHT}:rate=${FPS}:duration=${SECONDS}`,
        ...codec,
        join(root, name),
      ],
      stdout: "ignore",
      stderr: "pipe",
    });
    const [stderr, code] = await Promise.all([proc.stderr.text(), proc.exited]);
    if (code === 0) available.add(name);
    else console.warn(`SKIPPED ${name}: this ffmpeg cannot encode the fixture (${stderr.trim().split("\n")[0]})`);
  }
});

describe.skipIf(!ready)("Bun.Video generic containers", () => {
  for (const name of Object.keys(fixtures) as Name[]) {
    describe(name, () => {
      const path = () => join(root, name);
      const usable = () => available.has(name);

      test("metadata reports the real geometry, rate and frame count", async () => {
        if (!usable()) return;
        const metadata = await new Bun.Video(path()).metadata();
        expect(metadata).toMatchObject({ width: WIDTH, height: HEIGHT, audioStreams: [] });
        expect(metadata.fpsNumerator / metadata.fpsDenominator).toBeCloseTo(FPS, 1);
        expect(metadata.frameCount).toBeGreaterThanOrEqual(FPS * SECONDS - 1);
        expect(metadata.frameCount).toBeLessThanOrEqual(FPS * SECONDS + 1);
        expect(metadata.duration).toBeGreaterThan(0.8);
        expect(metadata.duration).toBeLessThan(1.3);
        expect(metadata.fileBytes).toBe((await Bun.file(path()).bytes()).length);
      });

      test("a decoded frame carries real, time-varying pixels", async () => {
        if (!usable()) return;
        // testsrc draws a running counter, so frames at different times must differ.
        const early = await new Bun.Video(path()).frame(0).rgba();
        const late = await new Bun.Video(path()).frame(0.7).rgba();
        expect({ width: early.width, height: early.height, channels: early.channels }).toEqual({
          width: WIDTH,
          height: HEIGHT,
          channels: 4,
        });
        expect(early.data.byteLength).toBe(WIDTH * HEIGHT * 4);
        expect(early.data.some(byte => byte !== 0)).toBe(true);
        expect(Buffer.compare(Buffer.from(early.data), Buffer.from(late.data))).not.toBe(0);
      });

      test("frame transforms reuse the Image pipeline from bytes and from a path", async () => {
        if (!usable()) return;
        const bytes = await Bun.file(path()).bytes();
        for (const source of [path(), bytes]) {
          const png = await new Bun.Video(source).frame(0.3).resize(32, 24).rotate(90).png().bytes();
          expect(await new Bun.Image(png).metadata()).toMatchObject({ width: 24, height: 32, format: "png" });
        }
      });

      test("frames returns an ordered bounded batch", async () => {
        if (!usable()) return;
        const frames = await new Bun.Video(path()).frames({ start: 0, end: 0.5, step: 0.1, maxFrames: 8 });
        expect(frames.length).toBeGreaterThanOrEqual(4);
        expect(frames.length).toBeLessThanOrEqual(6);
        for (let index = 1; index < frames.length; index++)
          expect(frames[index]!.time).toBeGreaterThanOrEqual(frames[index - 1]!.time);
        expect(await new Bun.Image(frames[0]!.bytes).metadata()).toMatchObject({ width: WIDTH, height: HEIGHT });
      });

      test("a time past the end and a truncated container reject with a provider error", async () => {
        if (!usable()) return;
        await expect(new Bun.Video(path()).frame(60).bytes()).rejects.toMatchObject({ code: "ERR_VIDEO_PROVIDER" });
        const bytes = await Bun.file(path()).bytes();
        await expect(new Bun.Video(bytes.subarray(0, 16)).metadata()).rejects.toMatchObject({
          code: "ERR_VIDEO_PROVIDER",
        });
      });

      // The library remuxer reads MP4, QuickTime, Matroska and WebM; AVI is decodable but not remuxable.
      const remuxable = name !== "mjpeg.avi";

      test("remux copies the packets into Matroska, or refuses without leaving output", async () => {
        if (!usable()) return;
        const output = join(root, `${name}.copy.mkv`);
        if (!remuxable) {
          await expect(new Bun.Video(path()).remux(output)).rejects.toMatchObject({ code: "ERR_VIDEO_PROVIDER" });
          expect(await Bun.file(output).exists()).toBe(false);
          return;
        }
        const written = await new Bun.Video(path()).remux(output);
        expect(written).toBe((await Bun.file(output).bytes()).length);
        const before = await new Bun.Video(path()).metadata();
        const after = await new Bun.Video(output).metadata();
        expect({ w: after.width, h: after.height, frames: after.frameCount }).toEqual({
          w: before.width,
          h: before.height,
          frames: before.frameCount,
        });
        await expect(new Bun.Video(path()).remux(output)).rejects.toMatchObject({ code: "ERR_VIDEO_PROVIDER" });
      });

      test("hls cuts a playable CMAF ladder into a new directory, or refuses without leaving it", async () => {
        if (!usable()) return;
        const directory = join(root, `${name}.hls`);
        if (!remuxable || name === "vp8.webm") {
          // AVI cannot be demuxed by the library; VP8 has no ISO base media mapping.
          await expect(new Bun.Video(path()).hls(directory, { segmentSeconds: 0.5 })).rejects.toMatchObject({
            code: "ERR_VIDEO_PROVIDER",
          });
          expect(await Bun.file(join(directory, "playlist.m3u8")).exists()).toBe(false);
          return;
        }
        const segments = await new Bun.Video(path()).hls(directory, { segmentSeconds: 0.5 });
        expect(segments).toBeGreaterThanOrEqual(1);
        const playlist = await Bun.file(join(directory, "playlist.m3u8")).text();
        expect(playlist.startsWith("#EXTM3U")).toBe(true);
        expect(playlist).toContain('#EXT-X-MAP:URI="init.mp4"');
        expect(playlist.match(/#EXTINF:/g)).toHaveLength(segments);
        const init = await Bun.file(join(directory, "init.mp4")).bytes();
        expect(new TextDecoder().decode(init.subarray(4, 8))).toBe("ftyp");
        for (let index = 0; index < segments; index++) {
          const segment = await Bun.file(join(directory, `segment-${String(index).padStart(5, "0")}.m4s`)).bytes();
          expect(segment.length).toBeGreaterThan(8);
          expect(new TextDecoder().decode(segment.subarray(4, 8))).toMatch(/^(moof|styp)$/);
        }
        await expect(new Bun.Video(path()).hls(directory)).rejects.toMatchObject({ code: "ERR_VIDEO_PROVIDER" });
      });
    });
  }
});
