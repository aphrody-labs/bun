import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

const root = "/home/ubuntu/src";
const factory = "/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk";
const owners = [
  { component: "ffmpeg", directory: join(root, "ffmpeg"), revision: "7e93014c5bbb61e7c22afebb478bf92f7a08d59a" },
  { component: "mpv", directory: join(root, "mpv"), revision: "c3ac7f39514c7f45bc38a18e66887240539ee33c" },
  { component: "libplacebo", directory: join(root, "libplacebo"), revision: "1dd022687b9ac1dd996855b51433bf770ae76aab" },
  { component: "fast_float", directory: join(root, "libplacebo/3rdparty/fast_float"), revision: "97b54ca9e75f5303507699d27c6b4f4efe4641a1" },
  { component: "freetype", directory: join(root, "freetype"), version: "2.14.2+dfsg-1ubuntu0.2", dsc: "freetype_2.14.2+dfsg-1ubuntu0.2.dsc" },
  { component: "fribidi", directory: join(root, "fribidi"), version: "1.0.16-5", dsc: "fribidi_1.0.16-5.dsc" },
  { component: "harfbuzz", directory: join(root, "harfbuzz"), version: "12.3.2-2", dsc: "harfbuzz_12.3.2-2.dsc" },
  { component: "libass", directory: join(root, "libass"), version: "1:0.17.4-2", dsc: "libass_0.17.4-2.dsc" },
  { component: "zlib-ng", directory: "/home/ubuntu/build/bun-os-obscura-4634063/vendor/zlib", revision: "12731092979c6d07f42da27da673a9f6c7b13586", vendorRef: "21426576697e7e84" },
  { component: "vulkan-headers", directory: join(factory, "mpv-linux-x64-portable/headers"), version: "libvulkan-dev=1.4.341.0-1", verification: "dpkg --verify libvulkan-dev" },
];
const components = [];
for (const owner of owners) {
  const canonical = await realpath(owner.directory);
  const files: Record<string, { sha256: string; bytes: number }> = {};
  let bytes = 0;
  for await (const name of new Bun.Glob("**/*").scan({ cwd: canonical, onlyFiles: true, dot: true, followSymlinks: true })) {
    if (name === ".git" || name.startsWith(".git/") || name.startsWith(".pc/")) continue;
    const path = await realpath(join(canonical, name));
    const member = relative(canonical, path);
    if (isAbsolute(member) || member.startsWith("..")) throw new Error("source symlink escaped its owner");
    const file = Bun.file(path);
    bytes += file.size;
    if (bytes > 512 * 1024 * 1024 || Object.keys(files).length >= 100000) throw new Error("source inventory exceeded its bound");
    files[name] = { bytes: file.size, sha256: new Bun.CryptoHasher("sha256").update(await file.bytes()).digest("hex") };
  }
  const ordered = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
  const treeSHA256 = new Bun.CryptoHasher("sha256").update(JSON.stringify(ordered)).digest("hex");
  const dsc = "dsc" in owner ? Bun.file(join(factory, "dependency-sources", owner.dsc)) : null;
  components.push({ ...owner, sourceTreeSHA256: treeSHA256, fileBytes: bytes, files, ...(dsc ? { dscSHA256: new Bun.CryptoHasher("sha256").update(await dsc.bytes()).digest("hex") } : {}) });
  console.log(`${owner.component} ${treeSHA256} ${ordered.length} files`);
}
await Bun.write(join(factory, "portable-source-receipt.json"), JSON.stringify({ schema: 1, components }, null, 2));
