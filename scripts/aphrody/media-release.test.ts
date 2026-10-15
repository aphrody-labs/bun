import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import runtimeManifest from "../../package.json";
import {
  assertMediaRuntimeIdentity,
  assertMediaStableVersion,
  assertPublicMediaPath,
  archiveMediaReleaseFiles,
  mediaReleaseTarget,
  isolatedMediaEnvironment,
  planMediaRelease,
  verifyMediaSDKArchive,
} from "./media-release";

test("media runtime identity rejects canaries, foreign targets and changed source", () => {
  const source = "a".repeat(40);
  const version = runtimeManifest.version;
  const identity = { version, revision: source, platform: "win32", arch: "x64" };
  assertMediaRuntimeIdentity(identity, source);
  for (const changed of [
    { version: `${version}-canary.1` },
    { version: "0.0.0" },
    { revision: "b".repeat(40) },
    { platform: "linux" },
    { arch: "arm64" },
  ])
    expect(() => assertMediaRuntimeIdentity({ ...identity, ...changed }, source)).toThrow("exact source revision");
  expect(() => assertMediaRuntimeIdentity(identity, "main")).toThrow("exact source revision");
  assertMediaStableVersion(`${version}\n`);
  expect(() => assertMediaStableVersion(`${version}-canary.1\n`)).toThrow(`stable ${version}`);
  expect(() => assertMediaStableVersion("0.0.0\n")).toThrow(`stable ${version}`);
  const prior = { ...identity, version: "1.4.4" };
  assertMediaRuntimeIdentity(prior, source, "windows-x64", "1.4.4");
  expect(() => assertMediaRuntimeIdentity(identity, source, "windows-x64", "0.0.0")).toThrow("exact source revision");
  expect(() => assertMediaRuntimeIdentity(identity, source, "windows-x64", `${version}-canary.1`)).toThrow(
    "exact source revision",
  );
});

test("release inventory rejects protected stores and escaping archive names", () => {
  for (const member of ["bun.exe", "sdk/bun-video.tgz", "licenses/packages/bun-video/LICENSE"])
    assertPublicMediaPath(member);
  for (const member of [
    "../bun.exe",
    "C:/bun.exe",
    "sdk\\private.json",
    "cookies/token.json",
    "a/.env.local",
    "sdk/capture.har",
    "sdk/db.sqlite",
    "sdk/weights.gguf",
    "sdk/node_modules/module.js",
    "sdk/session.key",
  ])
    expect(() => assertPublicMediaPath(member)).toThrow("Unsafe or protected");
});

test("isolated gate environment never inherits provider credentials or repository paths", () => {
  using directory = tempDir("media-release-isolation", {});
  const root = String(directory);
  const env = isolatedMediaEnvironment(root, join(root, "scratch"));
  expect(Object.keys(env).sort()).toEqual(
    [
      "APPDATA",
      "BUN_VIDEO_FFMPEG",
      "BUN_VIDEO_FFPROBE",
      "BUN_VIDEO_MEDIA_DIR",
      "COMSPEC",
      "HOME",
      "LOCALAPPDATA",
      "PATH",
      "SystemRoot",
      "TEMP",
      "TMP",
      "USERPROFILE",
      "WINDIR",
    ].sort(),
  );
  expect(env.PATH!.split(";")).toEqual([
    root,
    join(root, "lib/media/ffmpeg/windows-x64/bin"),
    join(root, "lib/media/mpv/windows-x64/bin"),
    join(process.env.SystemRoot ?? "C:\\Windows", "System32"),
  ]);
  expect(env.HOME).toBe(join(root, "scratch"));
  expect(() => isolatedMediaEnvironment("relative", root)).toThrow("absolute");
});

test("media matrix accounts for all eight full runtime platforms and missing native owners", async () => {
  using directory = tempDir("media-release-plan", {});
  const plan = await planMediaRelease({ source: "a".repeat(40), sourceRoot: String(directory) });
  expect(plan.requestedTargets).toEqual([
    "linux-x64",
    "linux-aarch64",
    "linux-x64-musl",
    "linux-aarch64-musl",
    "darwin-aarch64",
    "darwin-x64",
    "windows-x64",
    "windows-aarch64",
  ]);
  expect(plan.complete).toBe(false);
  expect(plan.platforms).toHaveLength(8);
  for (const platform of plan.platforms) {
    expect(platform.asset).toBe(`${platform.triplet}.zip`);
    expect(platform.triplet.endsWith("-full")).toBe(true);
    expect(platform.ready).toBe(false);
    expect(platform.missing).toContain("Exact-source nativeQualification artifact");
    expect(platform.runtimeFactory?.target.flavor).toBe("full");
    expect(platform.runtimeFactory?.target.target).toBe(platform.target);
    expect(platform.runtimeFactory?.command).toContain("--canary=off");
  }
  expect(plan.platforms.every(platform => platform.assemblyImplemented)).toBe(true);
  await expect(planMediaRelease({ source: "main", sourceRoot: String(directory) })).rejects.toThrow("exact source");
  await expect(
    planMediaRelease({ source: "a".repeat(40), sourceRoot: String(directory), platforms: { wasm: {} } }),
  ).rejects.toThrow("Unknown media release target");
});

test("native platform receipt must bind both runtime and compiled application artifacts", async () => {
  using directory = tempDir("media-release-native-receipt", {
    "runtime.exe": "runtime bytes",
    "video.exe": "application bytes",
    "qualification.json": JSON.stringify({
      source: "a".repeat(40),
      target: "windows-x64",
      native: true,
      passed: true,
      runtimeSHA256: "b".repeat(64),
      executableSHA256: "c".repeat(64),
    }),
  });
  const root = String(directory);
  const plan = await planMediaRelease({
    source: "a".repeat(40),
    sourceRoot: root,
    platforms: {
      "windows-x64": {
        runtime: join(root, "runtime.exe"),
        executable: join(root, "video.exe"),
        nativeQualification: join(root, "qualification.json"),
      },
    },
  });
  expect(plan.platforms.find(platform => platform.target === "windows-x64")!.missing).toContain(
    "Matching native artifact-bound platform gate receipt",
  );
});

test("SDK validator consumes a real Bun pm pack archive and detects changed source bytes", async () => {
  using directory = tempDir("media-release-sdk", {});
  const root = String(directory);
  const source = join(root, "source");
  const output = join(root, "packed");
  await mkdir(source);
  await mkdir(output);
  await Bun.write(
    join(source, "package.json"),
    JSON.stringify({
      name: "@aphrody/fixture-media-sdk",
      version: "1.4.4",
      files: ["src"],
      exports: { ".": "./src/index.ts" },
    }),
  );
  await Bun.write(join(source, "src/index.ts"), "export const fixture = 42;\n");
  const child = Bun.spawn(
    [process.execPath, "pm", "pack", "--ignore-scripts", "--filename", join(output, "fixture.tgz"), "--quiet"],
    { cwd: source, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, code] = await Promise.all([
    Bun.readableStreamToText(child.stdout),
    Bun.readableStreamToText(child.stderr),
    child.exited,
  ]);
  expect(stderr).toBe("");
  expect(stdout.trim()).toBe(join(output, "fixture.tgz"));
  expect(code).toBe(0);
  const archive = join(output, "fixture.tgz");
  const receipt = await verifyMediaSDKArchive(archive, source);
  expect(receipt.name).toBe("@aphrody/fixture-media-sdk");
  expect(receipt.version).toBe("1.4.4");
  expect(receipt.files).toBe(2);
  await Bun.write(join(source, "src/index.ts"), "export const fixture = 43;\n");
  await expect(verifyMediaSDKArchive(archive, source)).rejects.toThrow(
    "SDK member differs from source: package/src/index.ts",
  );
}, 15_000);

test("SDK validator refuses absent export files and differing manifest versions", async () => {
  using directory = tempDir("media-release-sdk-invalid", {});
  const root = String(directory);
  const manifest = { name: "@aphrody/fixture-media-sdk", version: "1.4.4", exports: { ".": "./src/index.ts" } };
  await Bun.write(join(root, "package.json"), JSON.stringify(manifest));
  const archive = join(root, "fixture.tgz");
  await Bun.write(
    archive,
    await new Bun.Archive({ "package/package.json": JSON.stringify(manifest) }, { compress: "gzip" }).blob(),
  );
  await expect(verifyMediaSDKArchive(archive, root)).rejects.toThrow("Packed SDK entry point absent: src/index.ts");
  await Bun.write(
    archive,
    await new Bun.Archive(
      { "package/package.json": JSON.stringify({ ...manifest, version: "1.4.5" }) },
      { compress: "gzip" },
    ).blob(),
  );
  await expect(verifyMediaSDKArchive(archive, root)).rejects.toThrow("Packed SDK manifest differs");
});

test("ZIP assembly includes existing BunFile payload bytes", async () => {
  using directory = tempDir("media-release-zip", { "bun.exe": "fixture PE payload" });
  const output = join(String(directory), "media.zip");
  await archiveMediaReleaseFiles(String(directory), output, ["bun.exe"]);
  expect(new DataView((await Bun.file(output).bytes()).buffer).getUint32(0, true)).toBe(0x04034b50);
  const entries = await new Bun.Archive(await Bun.file(output).bytes()).files();
  expect([...entries.keys()]).toEqual(["bun-windows-x64-full/bun.exe"]);
  expect(await entries.get("bun-windows-x64-full/bun.exe")!.text()).toBe("fixture PE payload");
  await expect(
    archiveMediaReleaseFiles(String(directory), join(String(directory), "bun.exe"), ["bun.exe"]),
  ).rejects.toThrow("overwrite an input member");
  await expect(archiveMediaReleaseFiles(String(directory), output, ["bun.exe", "bun.exe"])).rejects.toThrow(
    "empty or duplicated",
  );
});

test("ZIP assembly preserves immutable destinations before starting a writer", async () => {
  using directory = tempDir("media-release-immutable", { "bun.exe": "runtime", "media.zip": "existing archive" });
  const output = join(String(directory), "media.zip");
  await expect(archiveMediaReleaseFiles(String(directory), output, ["bun.exe"])).rejects.toThrow(
    "Immutable archive destination already exists",
  );
  expect(await Bun.file(output).text()).toBe("existing archive");
});

test("ZIP assembly rejects a writer from a different source before encoding", async () => {
  using directory = tempDir("media-release-writer-identity", { "bun.exe": "runtime" });
  const output = join(String(directory), "media.zip");
  await expect(
    archiveMediaReleaseFiles(String(directory), output, ["bun.exe"], {
      runtime: { executable: process.execPath, source: "a".repeat(40), version: Bun.version, target: "windows-x64" },
    }),
  ).rejects.toThrow("Archive writer runtime identity differs");
  expect(await Bun.file(output).exists()).toBe(false);
});

test("native identity, SDK directory and extension names cover every release ABI", () => {
  const source = "a".repeat(40);
  for (const [name, sdk, platform, arch] of [
    ["linux-x64", "linux-x64", "linux", "x64"],
    ["linux-aarch64", "linux-arm64", "linux", "arm64"],
    ["linux-x64-musl", "linux-x64-musl", "linux", "x64"],
    ["linux-aarch64-musl", "linux-arm64-musl", "linux", "arm64"],
    ["darwin-x64", "darwin-x64", "darwin", "x64"],
    ["darwin-aarch64", "darwin-arm64", "darwin", "arm64"],
    ["windows-x64", "windows-x64", "win32", "x64"],
    ["windows-aarch64", "windows-arm64", "win32", "arm64"],
  ] as const) {
    expect(mediaReleaseTarget(name!).sdkTarget).toBe(sdk);
    assertMediaRuntimeIdentity(
      { version: runtimeManifest.version, revision: source, platform: platform!, arch: arch! },
      source,
      name,
    );
  }
});

test("POSIX isolated gates exclude inherited library-loader overrides", () => {
  using directory = tempDir("media-release-posix-env", {});
  const root = String(directory);
  const env = isolatedMediaEnvironment(root, join(root, "scratch"), "linux-aarch64-musl");
  expect(env.BUN_VIDEO_FFMPEG).toBe(join(root, "lib/media/ffmpeg/linux-arm64-musl/bin/ffmpeg"));
  expect(env.BUN_VIDEO_MEDIA_DIR).toBe(join(root, "lib/media/ffmpeg/linux-arm64-musl/lib"));
  expect(env.LD_LIBRARY_PATH).toBeUndefined();
  expect(env.DYLD_LIBRARY_PATH).toBeUndefined();
  expect(env.SystemRoot).toBeUndefined();
});

test("POSIX ZIP modes preserve executable bits even when packaged on Windows", async () => {
  using directory = tempDir("media-release-posix-mode", { "bun": "fixture ELF payload" });
  const output = join(String(directory), "media.zip");
  await archiveMediaReleaseFiles(String(directory), output, ["bun"], {
    triplet: "bun-linux-x64-full",
    modes: { bun: 0o755 },
  });
  const bytes = await Bun.file(output).bytes();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let found = false;
  for (let offset = 0; offset + 46 <= bytes.length; offset++)
    if (view.getUint32(offset, true) === 0x02014b50) {
      expect((view.getUint32(offset + 38, true) >>> 16) & 0o777).toBe(0o755);
      found = true;
      break;
    }
  expect(found).toBe(true);
  const entries = await new Bun.Archive(bytes).files();
  expect(await entries.get("bun-linux-x64-full/bun")!.text()).toBe("fixture ELF payload");
});
