import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { join, resolve } from "node:path";
import { mp4 } from "../../js/bun/video/fixture";

const sourceMode = process.env.BUN_VIDEO_CLI_SOURCE === "1";
const source = resolve(import.meta.dir, "../../../src/js/eval/video.ts");
const available = typeof Bun.Video === "function" && Bun.Video.available;

async function run(args: string[], cwd: string) {
  await using child = Bun.spawn({
    cmd: [bunExe(), ...(sourceMode ? [source, "video"] : ["video"]), ...args],
    cwd,
    env: { ...bunEnv, npm_lifecycle_event: undefined },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  return { stdout, stderr, exitCode };
}

test("bun video help lists native operations and the optional compiled extension", async () => {
  using directory = tempDir("video-cli-help", {});
  for (const args of [[], ["--help"], ["frame", "--help"]]) {
    const result = await run(args, String(directory));
    expect(result.stderr).toBe("");
    for (const name of ["info", "metadata", "frame", "frames", "audio", "gif", "remux", "hls"])
      expect(result.stdout).toContain(`  ${name} `);
    expect(result.stdout).toContain("Existing output files are refused");
    expect(result.stdout).toContain("qualified adjacent bun-video");
    expect(result.exitCode).toBe(0);
  }
});

test("bun video info reports actual provider availability and runtime identity", async () => {
  using directory = tempDir("video-cli-info", {});
  const result = await run(["info", "--json"], String(directory));
  expect(result.stderr).toBe("");
  const info = JSON.parse(result.stdout);
  expect(info.version).toBe(Bun.version);
  expect(info.revision).toBe(Bun.revision);
  expect(info.platform).toBe(process.platform);
  expect(info.arch).toBe(process.arch);
  expect(info.available).toBe(available);
  expect(info.decoder).toBe(typeof Bun.Video === "function" ? "filmcraft" : null);
  expect(result.exitCode).toBe(0);
});

test("bun video rejects unknown operations, options and missing path arguments", async () => {
  using directory = tempDir("video-cli-usage", {});
  for (const [args, message] of [
    [["unknown"], "Unknown video command unknown"],
    [["metadata", "--missing"], "Unknown video option --missing"],
    [["metadata"], "metadata requires 1 path argument"],
  ] as const) {
    const result = await run([...args], String(directory));
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(message);
    expect(result.exitCode).toBe(1);
  }
});

test.skipIf(available)("bun video reports absent native provider before reading a path", async () => {
  using directory = tempDir("video-cli-unavailable", {});
  const result = await run(["metadata", "missing.mp4"], String(directory));
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("does not include the native Bun.Video provider");
  expect(result.exitCode).toBe(1);
});

describe.skipIf(!available)("bun video native MP4 owner", () => {
  test("metadata preserves exact rational timing and remux keeps encoded samples", async () => {
    using directory = tempDir("video-cli-mp4", { "input.mp4": mp4() });
    const root = String(directory);
    const metadata = await run(["metadata", "input.mp4", "--json"], root);
    expect(metadata.stderr).toBe("");
    expect(JSON.parse(metadata.stdout)).toMatchObject({
      width: 64,
      height: 48,
      frameCount: 3,
      fpsNumerator: 24000,
      fpsDenominator: 1001,
    });
    expect(metadata.exitCode).toBe(0);
    const remux = await run(["remux", "input.mp4", "output.mp4", "--json"], root);
    expect(remux.stderr).toBe("");
    const receipt = JSON.parse(remux.stdout);
    expect(receipt.output).toBe(join(root, "output.mp4"));
    expect(receipt.bytes).toBeGreaterThan(0);
    expect(remux.exitCode).toBe(0);
    expect(await new Bun.Video(join(root, "output.mp4")).metadata()).toMatchObject({ width: 64, frameCount: 3 });
  });

  test("output collisions preserve existing files and source bytes", async () => {
    using directory = tempDir("video-cli-overwrite", { "input.mp4": mp4(), "output.png": "existing output" });
    const root = String(directory);
    const frame = await run(["frame", "input.mp4", "output.png"], root);
    expect(frame.stdout).toBe("");
    expect(frame.stderr).toContain("EEXIST");
    expect(frame.exitCode).toBe(1);
    expect(await Bun.file(join(root, "output.png")).text()).toBe("existing output");
    const remux = await run(["remux", "input.mp4", "input.mp4"], root);
    expect(remux.stderr).toContain("Video output must differ from its input");
    expect(remux.exitCode).toBe(1);
    expect(await Bun.file(join(root, "input.mp4")).bytes()).toEqual(mp4());
  });

  test("invalid batch/audio/GIF bounds fail before reading or creating outputs", async () => {
    using directory = tempDir("video-cli-bounds", {});
    const root = String(directory);
    for (const [args, message, output] of [
      [["frames", "missing.mp4", "frames", "--end", "65"], "at most 64 frames", "frames"],
      [["audio", "missing.mp4", "audio.wav", "--duration", "31"], "Audio requires", "audio.wav"],
      [["gif", "missing.mp4", "output.gif", "--duration", "6"], "GIF requires", "output.gif"],
      [["hls", "missing.mp4", "hls-out", "--segment-seconds", "61"], "--segment-seconds must be within", "hls-out"],
      [["frame", "missing.mp4", "output.png", "--time", "NaN"], "finite non-negative", "output.png"],
      [["frame", "missing.mp4", "output.png", "--format=png=extra"], "Unsupported frame output format", "output.png"],
    ] as const) {
      const result = await run([...args], root);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(message);
      expect(result.exitCode).toBe(1);
      expect(await Bun.file(join(root, output)).exists()).toBe(false);
    }
  });
});
