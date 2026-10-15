import { expect, test } from "bun:test";
import { symlinkSync, truncateSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import { mediaVulkanHeaderTree, verifyMediaVulkanOwner } from "./media-sdk-source";

test("Vulkan projection hashes both canonical header owners without traversing unrelated includes", async () => {
  using directory = tempDir("media-vulkan-projection", {
    "vulkan/vulkan.h": "#include <vk_video/video.h>\n",
    "vk_video/video.h": "#define VIDEO_VERSION 1\n",
    "unrelated/private.h": "unrelated fixture bytes\n",
    "copyright": "fixture notice\n",
  });
  const root = String(directory);
  const initial = await mediaVulkanHeaderTree(root);
  expect(Object.keys(initial.files).sort()).toEqual(["vk_video/video.h", "vulkan/vulkan.h"]);
  expect(initial.fileBytes).toBe(52);
  await Bun.write(join(root, "unrelated/private.h"), "changed unrelated bytes\n");
  expect((await mediaVulkanHeaderTree(root)).sourceTreeSHA256).toBe(initial.sourceTreeSHA256);
  await Bun.write(join(root, "vk_video/video.h"), "#define VIDEO_VERSION 2\n");
  expect((await mediaVulkanHeaderTree(root)).sourceTreeSHA256).not.toBe(initial.sourceTreeSHA256);
  await expect(verifyMediaVulkanOwner(root, join(root, "copyright"))).rejects.toThrow("recorded source owner");
});

test.skipIf(process.platform === "win32")(
  "Vulkan projection rejects links inside either owned header directory",
  async () => {
    using directory = tempDir("media-vulkan-link", {
      "vulkan/vulkan.h": "#define VULKAN 1\n",
      "vk_video/video.h": "#define VIDEO 1\n",
      "other.h": "outside owner\n",
    });
    const root = String(directory);
    symlinkSync(join(root, "other.h"), join(root, "vk_video/linked.h"));
    await expect(mediaVulkanHeaderTree(root)).rejects.toThrow("unowned link");
  },
);

test("Vulkan projection refuses oversized headers before reading their contents", async () => {
  using directory = tempDir("media-vulkan-budget", {
    "vulkan/vulkan.h": "#define VULKAN 1\n",
    "vk_video/video.h": "#define VIDEO 1\n",
    "vulkan/oversized.h": "",
  });
  const root = String(directory);
  truncateSync(join(root, "vulkan/oversized.h"), 64 * 1024 ** 2 + 1);
  await expect(mediaVulkanHeaderTree(root)).rejects.toThrow("byte bounds");
});

test("source snapshots round-trip owner bytes and requalify all owners after regular-file materialization", async () => {
  const { snapshotMediaSources, materializeMediaSources, mediaSourceTree } = await import("./media-sdk-source");
  using directory = tempDir("media-source-snapshot", {
    "source/ffmpeg/LICENSE": "ffmpeg",
    "source/mpv/LICENSE": "mpv",
    "source/libplacebo/LICENSE": "placebo",
    "source/libplacebo/3rdparty/fast_float/LICENSE": "float",
    "source/freetype/LICENSE": "freetype",
    "source/fribidi/LICENSE": "fribidi",
    "source/harfbuzz/LICENSE": "harfbuzz",
    "source/libass/LICENSE": "libass",
    "include/vulkan/vulkan.h": "vulkan",
    "include/vk_video/video.h": "video",
    "notice": "fixture notice",
  });
  const root = String(directory);
  let verifications = 0;
  const ports = {
    source: async (name: Parameters<typeof import("./media-sdk-source").verifyMediaSourceOwner>[0], path: string) => {
      verifications++;
      return { name, ...(await mediaSourceTree(path)), licenses: ["LICENSE"], clean: true as const };
    },
    vulkan: async (include: string, notice: string) => ({
      headers: {
        ...(await mediaVulkanHeaderTree(include)),
        version: "libvulkan-dev=1.4.341.0-1",
        hardwareQualification: false,
      },
      license: {
        sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(notice).bytes()).digest("hex"),
        bytes: Bun.file(notice).size,
      },
    }),
  };
  const exported = await snapshotMediaSources(
    {
      sources: join(root, "source"),
      include: join(root, "include"),
      notice: join(root, "notice"),
      output: join(root, "snapshot.tar.gz"),
    },
    ports,
  );
  expect(exported.nativeReleaseQualified).toBe(false);
  expect(exported.files).toBe(11);
  const restored = await materializeMediaSources(
    { archive: exported.path, sha256: exported.sha256, bytes: exported.bytes, output: join(root, "restored") },
    ports,
  );
  expect(verifications).toBe(16);
  expect(await Bun.file(join(restored.sources, "ffmpeg/LICENSE")).text()).toBe("ffmpeg");
  expect(await Bun.file(restored.notice).text()).toBe("fixture notice");
  expect(restored.nativeReleaseQualified).toBe(false);
  await expect(
    materializeMediaSources(
      { archive: exported.path, sha256: "0".repeat(64), bytes: exported.bytes, output: join(root, "wrong") },
      ports,
    ),
  ).rejects.toThrow("content pin");
  const entries = await new Bun.Archive(await Bun.file(exported.path).bytes()).files();
  const manifest = JSON.parse(await entries.get("source-snapshot.json")!.text());
  const hostile: Record<string, Blob | string> = Object.fromEntries(entries);
  hostile["sources/ffmpeg/../../escape"] = "escape";
  manifest.members["sources/ffmpeg/../../escape"] = { sha256: "0".repeat(64), bytes: 6, mode: 0o644 };
  hostile["source-snapshot.json"] = JSON.stringify(manifest);
  const bad = join(root, "unsafe.tar.gz");
  await Bun.write(bad, await new Bun.Archive(hostile, { compress: "gzip" }).blob());
  const sha256 = new Bun.CryptoHasher("sha256").update(await Bun.file(bad).bytes()).digest("hex");
  await expect(
    materializeMediaSources({ archive: bad, sha256, bytes: Bun.file(bad).size, output: join(root, "unsafe") }, ports),
  ).rejects.toThrow("unsafe member");
  expect(await Bun.file(join(root, "escape")).exists()).toBe(false);
});
