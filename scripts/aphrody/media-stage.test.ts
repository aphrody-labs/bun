import { expect, test } from "bun:test";
import { mkdir, readdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import sdkManifest from "../../packages/bun-video/src/sdk-manifest.json";
import {
  applyMediaStage,
  mediaStageTargets,
  planMediaStage,
  stageMediaBundle,
  type MediaStageTarget,
} from "./media-stage";

const windowsTest = test.skipIf(process.platform !== "win32" || process.arch !== "x64");
const sdk = (destination: string, component: string, file: string) =>
  join(destination, "lib/media", component, "windows-x64", file);

function pe(imports: string[], revision = 0): Uint8Array<ArrayBuffer> {
  const bytes = Buffer.alloc(4096);
  bytes.writeUInt16LE(0x5a4d, 0);
  bytes.writeUInt32LE(0x80, 0x3c);
  bytes.writeUInt32LE(0x4550, 0x80);
  bytes.writeUInt16LE(0x8664, 0x84);
  bytes.writeUInt16LE(1, 0x86);
  bytes.writeUInt16LE(240, 0x94);
  bytes.writeUInt16LE(0x20b, 0x98);
  bytes.writeUInt32LE(16, 0x98 + 108);
  bytes.writeUInt32LE(imports.length ? 0x1000 : 0, 0x98 + 112 + 8);
  bytes.writeUInt32LE(3584, 0x188 + 8);
  bytes.writeUInt32LE(0x1000, 0x188 + 12);
  bytes.writeUInt32LE(3584, 0x188 + 16);
  bytes.writeUInt32LE(512, 0x188 + 20);
  for (const [index, name] of imports.entries()) {
    bytes.writeUInt32LE(0x1400 + index * 128, 512 + index * 20 + 12);
    bytes.write(name + "\0", 1536 + index * 128, "ascii");
  }
  bytes.writeUInt32LE(revision, 4000);
  return bytes;
}

function binary(target: MediaStageTarget, imports: string[] = []) {
  if (target.startsWith("windows")) {
    const bytes = Buffer.from(pe(imports));
    bytes.writeUInt16LE(target.includes("arm64") ? 0xaa64 : 0x8664, 0x84);
    return bytes;
  }
  const bytes = Buffer.alloc(64);
  if (target.startsWith("linux")) {
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
    bytes.writeUInt16LE(target.includes("arm64") ? 183 : 62, 18);
  } else {
    bytes.writeUInt32LE(0xfeedfacf, 0);
    bytes.writeUInt32LE(target.includes("arm64") ? 0x100000c : 0x1000007, 4);
  }
  return bytes;
}

async function platformFixture(base: string, target: MediaStageTarget) {
  const prefix = join(base, "prefix"),
    destination = join(base, "runtime");
  const windows = target.startsWith("windows"),
    darwin = target.startsWith("darwin");
  const library = (name: string, major: number) =>
    windows ? `${name}-${major}.dll` : darwin ? `lib${name}.${major}.dylib` : `lib${name}.so.${major}`;
  await mkdir(join(prefix, "bin"), { recursive: true });
  await mkdir(destination);
  await Bun.write(join(destination, windows ? "bun.exe" : "bun"), binary(target));
  for (const name of ["ffmpeg", "ffprobe", "bun-video-native", "mpv"])
    await Bun.write(join(prefix, "bin", name + (windows ? ".exe" : "")), binary(target));
  await Bun.write(
    join(
      prefix,
      windows ? "bin/bun_video_native.dll" : darwin ? "lib/libbun_video_native.dylib" : "lib/libbun_video_native.so",
    ),
    binary(target),
  );
  await Bun.write(join(prefix, windows ? "bin/libmpv-2.dll" : "lib/" + library("mpv", 2)), binary(target));
  for (const [name, major] of Object.entries(sdkManifest.ffmpegABI)) {
    await Bun.write(join(prefix, windows ? "bin" : "lib", library(name, major)), binary(target));
    await Bun.write(
      join(prefix, "include", `lib${name}/${name === "avutil" ? "version.h" : "version_major.h"}`),
      `#define LIB${name.toUpperCase()}_VERSION_MAJOR ${major}\n`,
    );
    if (windows) await Bun.write(join(prefix, "lib", `${name}.lib`), "fixture import library");
  }
  await Bun.write(join(prefix, "include/mpv/client.h"), "#define MPV_CLIENT_API_VERSION MPV_MAKE_VERSION(2, 5)\n");
  if (windows) await Bun.write(join(prefix, "lib/mpv.lib"), "fixture import library");
  await Bun.write(join(prefix, "share/licenses/LICENSE"), "public fixture notices");
  return { prefix, destination };
}

test.each(mediaStageTargets)(
  "media stage writes %s SDK files with an explicit requirement for native qualification",
  async target => {
    using directory = tempDir("media-stage-platform", {});
    const { prefix, destination } = await platformFixture(String(directory), target);
    const result = await stageMediaBundle(destination, { prefix, target, apply: true });
    expect(result.target).toBe(target);
    expect(result.requiresNativeQualification).toBe(true);
    expect(result.qualification).toBe(
      target.startsWith("windows") ? "file-layout-and-pe-import-closure-only" : "file-layout-only",
    );
    expect(result.files.some(file => file.name.includes(`ffmpeg/${target}/bin/bun-video-native`))).toBe(true);
    expect(result.files.some(file => file.name.includes(`mpv/${target}/share/licenses/LICENSE`))).toBe(true);
    if (!target.startsWith("windows"))
      expect(result.files.find(file => file.name.endsWith("/bin/ffmpeg"))?.mode).toBe(0o755);
    const receipt = await Bun.file(join(destination, "bun-media.json")).json();
    expect(receipt.target).toBe(target);
    expect(receipt.requiresNativeQualification).toBe(true);
  },
);

test("media stage refuses an architecture mismatch before installing an SDK", async () => {
  using directory = tempDir("media-stage-architecture", {});
  const { prefix, destination } = await platformFixture(String(directory), "linux-arm64");
  await expect(stageMediaBundle(destination, { prefix, target: "linux-x64", apply: true })).rejects.toThrow(
    "does not match linux-x64",
  );
  expect(await readdir(destination)).toEqual(["bun"]);
});

async function fixture(base: string) {
  const prefix = join(base, "prefix"),
    destination = join(base, "runtime");
  await mkdir(join(prefix, "bin"), { recursive: true });
  await mkdir(destination);
  await Bun.write(join(destination, "bun.exe"), pe([]));
  for (const name of [
    "ffmpeg.exe",
    "ffprobe.exe",
    "bun-video-native.exe",
    "bun_video_native.dll",
    "mpv.exe",
    "mpv-2.dll",
  ])
    await Bun.write(
      join(prefix, "bin", name),
      pe(name === "mpv.exe" ? ["mpv-2.dll"] : ["avcodec-63.dll", "kernel32.dll"]),
    );
  for (const [name, major] of Object.entries(sdkManifest.ffmpegABI)) {
    await Bun.write(join(prefix, "bin", `${name}-${major}.dll`), pe(name === "avcodec" ? ["zlib1.dll"] : []));
    await Bun.write(
      join(prefix, "include", `lib${name}/${name === "avutil" ? "version.h" : "version_major.h"}`),
      `#define LIB${name.toUpperCase()}_VERSION_MAJOR ${major}\n`,
    );
    await Bun.write(join(prefix, "lib", `${name}.lib`), "fixture import library");
  }
  await Bun.write(join(prefix, "bin/zlib1.dll"), pe(["kernel32.dll"]));
  await Bun.write(join(prefix, "bin/unused-old-codec.dll"), pe([]));
  await Bun.write(join(prefix, "include/mpv/client.h"), "#define MPV_CLIENT_API_VERSION MPV_MAKE_VERSION(2, 5)\n");
  await Bun.write(join(prefix, "lib/mpv.lib"), "fixture import library");
  await Bun.write(join(prefix, "share/licenses/ffmpeg/COPYING.LGPLv2.1"), "public fixture notice");
  await Bun.write(join(prefix, "share/ffmpeg/probe.xsd"), "public fixture data");
  await Bun.write(join(prefix, "build.log"), "not a distribution input");
  await Bun.write(join(prefix, "dataset.sqlite"), "protected fixture input");
  return { prefix, destination };
}

windowsTest(
  "media stage closes PE imports, includes AVIO and SDK notices, and keeps private source siblings outside the release",
  async () => {
    using directory = tempDir("media-stage-closure", {});
    const { prefix, destination } = await fixture(String(directory));
    const plan = await planMediaStage({ prefix, destination });
    expect(plan.systemImports).toEqual(["kernel32.dll"]);
    expect(plan.aliases).toHaveLength(1);
    expect(plan.aliases[0]!.sha256).toBe(plan.files.find(file => file.name.endsWith("/bin/mpv-2.dll"))!.sha256);
    expect(plan.files.some(file => /unused-old|dataset|build\.log/.test(file.name))).toBe(false);
    expect(await Bun.file(sdk(destination, "ffmpeg", "bin/ffmpeg.exe")).exists()).toBe(false);
    const result = await applyMediaStage(plan);
    expect(result.applied).toBe(true);
    expect(await Bun.file(sdk(destination, "ffmpeg", "bin/bun_video_native.dll")).bytes()).toEqual(
      pe(["avcodec-63.dll", "kernel32.dll"]),
    );
    expect(await Bun.file(sdk(destination, "ffmpeg", "bin/bun-video-native.exe")).exists()).toBe(true);
    expect(await Bun.file(sdk(destination, "mpv", "bin/libmpv-2.dll")).bytes()).toEqual(
      await Bun.file(join(prefix, "bin/mpv-2.dll")).bytes(),
    );
    expect(await Bun.file(sdk(destination, "mpv", "bin/zlib1.dll")).exists()).toBe(true);
    expect(await Bun.file(sdk(destination, "mpv", "share/licenses/ffmpeg/COPYING.LGPLv2.1")).text()).toBe(
      "public fixture notice",
    );
    expect(await Bun.file(join(destination, "bun.exe")).bytes()).toEqual(pe([]));
    for (const file of result.files) {
      const bytes = await Bun.file(join(destination, file.name)).bytes();
      expect(bytes.byteLength).toBe(file.bytes);
      expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(file.sha256);
    }
    expect(await readdir(join(destination, "lib"))).toEqual(["media"]);
  },
);

windowsTest("media stage refuses a missing indirect DLL before altering a runtime", async () => {
  using directory = tempDir("media-stage-missing-import", {});
  const { prefix, destination } = await fixture(String(directory));
  await rm(join(prefix, "bin/zlib1.dll"));
  await expect(stageMediaBundle(destination, { prefix, apply: true })).rejects.toThrow("zlib1.dll");
  expect(await readdir(destination)).toEqual(["bun.exe"]);
});

windowsTest(
  "media stage updates owned payloads and rejects concurrent edits and unowned destination files",
  async () => {
    using directory = tempDir("media-stage-update", {});
    const { prefix, destination } = await fixture(String(directory));
    await stageMediaBundle(destination, { prefix, apply: true });
    await Bun.write(join(prefix, "bin/zlib1.dll"), pe([], 1));
    await stageMediaBundle(destination, { prefix, apply: true });
    expect(await Bun.file(sdk(destination, "ffmpeg", "bin/zlib1.dll")).bytes()).toEqual(pe([], 1));
    const file = sdk(destination, "ffmpeg", "bin/zlib1.dll");
    await Bun.write(file, "concurrent edit");
    await expect(stageMediaBundle(destination, { prefix, apply: true })).rejects.toThrow("changed");
    expect(await Bun.file(file).text()).toBe("concurrent edit");
    await Bun.write(file, pe([], 1));
    await Bun.write(sdk(destination, "ffmpeg", "caller.txt"), "unowned");
    await expect(stageMediaBundle(destination, { prefix, apply: true })).rejects.toThrow("unowned");
    expect(await Bun.file(sdk(destination, "ffmpeg", "caller.txt")).text()).toBe("unowned");
    expect((await readdir(join(destination, "lib"))).filter(name => name.startsWith(".media"))).toEqual([]);
  },
);

windowsTest("media stage binds a plan to unchanged source bytes", async () => {
  using directory = tempDir("media-stage-stale-plan", {});
  const { prefix, destination } = await fixture(String(directory));
  const plan = await planMediaStage({ prefix, destination });
  await Bun.write(join(prefix, "bin/zlib1.dll"), pe([], 2));
  await expect(applyMediaStage(plan)).rejects.toThrow("changed after planning");
  expect(await readdir(destination)).toEqual(["bun.exe"]);
});

windowsTest(
  "media stage rejects relative or overlapping paths, unknown targets, missing SDK notices and private members",
  async () => {
    using directory = tempDir("media-stage-refusal", {});
    const { prefix, destination } = await fixture(String(directory));
    await expect(planMediaStage({ prefix, destination: "relative" })).rejects.toThrow("absolute");
    await expect(planMediaStage({ prefix, destination: prefix })).rejects.toThrow("overlap");
    await expect(planMediaStage({ prefix, destination, target: "unsupported" })).rejects.toThrow("Unsupported");
    await rm(join(prefix, "share/licenses"), { recursive: true });
    await expect(planMediaStage({ prefix, destination })).rejects.toThrow("license notices");
    await Bun.write(join(prefix, "share/licenses/LICENSE"), "notice");
    await Bun.write(join(prefix, "share/cookie.json"), "private fixture");
    await expect(planMediaStage({ prefix, destination })).rejects.toThrow("private");
  },
);

windowsTest("media stage rejects a junction into data outside the selected SDK", async () => {
  using directory = tempDir("media-stage-junction", {});
  const { prefix, destination } = await fixture(String(directory));
  const outside = join(String(directory), "outside");
  await mkdir(outside);
  await Bun.write(join(outside, "protected.txt"), "protected fixture");
  await symlink(outside, join(prefix, "share/external"), "junction");
  await expect(planMediaStage({ prefix, destination })).rejects.toThrow("symbolic link");
  expect(await Bun.file(join(outside, "protected.txt")).text()).toBe("protected fixture");
});
