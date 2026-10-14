// @bun
// scripts/aphrody/media-sdk-factory.ts
import { mkdir as mkdir2, realpath as realpath2, readdir, stat as stat2 } from "fs/promises";
import { isAbsolute as isAbsolute2, join as join2, relative as relative2, resolve as resolve2 } from "path";

// scripts/aphrody/media-sdk-abi.ts
var gnuSystemLibraries = new Set([
  "libc.so.6",
  "libm.so.6",
  "libpthread.so.0",
  "libdl.so.2",
  "librt.so.1",
  "libresolv.so.2",
  "libutil.so.1"
]);
function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let i = 0;i < Math.max(a.length, b.length); i++) {
    const order = (a[i] ?? 0) - (b[i] ?? 0);
    if (order)
      return order;
  }
  return 0;
}
function qualifyMediaELFs(target, inputs) {
  if (!/^linux-(?:x64|arm64)(?:-musl)?$/.test(target))
    throw new TypeError("ELF qualification requires a supported Linux SDK target");
  if (!inputs.length || inputs.length > 1024)
    throw new Error("SDK ELF inventory is empty or exceeds its bound");
  const arm64 = target.includes("arm64");
  const musl = target.endsWith("-musl");
  const loader = musl ? `ld-musl-${arm64 ? "aarch64" : "x86_64"}.so.1` : arm64 ? "ld-linux-aarch64.so.1" : "ld-linux-x86-64.so.2";
  const interpreter = musl || arm64 ? `/lib/${loader}` : `/lib64/${loader}`;
  const systemLibraries = musl ? new Set([`libc.musl-${arm64 ? "aarch64" : "x86_64"}.so.1`, "libc.so", loader]) : new Set([...gnuSystemLibraries, loader]);
  const bundled = new Set(inputs.filter((input) => input.file.startsWith("lib/")).map((input) => input.file.slice(4)));
  let maximumGLIBC = null;
  const files = inputs.map((input) => {
    if (!/^(?:lib|bin)\/[^/]+$/.test(input.file) || !/^[a-f0-9]{64}$/.test(input.sha256))
      throw new Error("Invalid SDK ELF member or digest");
    if (systemLibraries.has(input.file.slice(4)))
      throw new Error(`SDK bundles a system libc member: ${input.file}`);
    if (!/Class:\s+ELF64/.test(input.header) || !/Data:.*little endian/.test(input.header) || !/Type:\s+(?:DYN|EXEC)\b/.test(input.header) || !(arm64 ? /Machine:\s+AArch64\b/ : /Machine:\s+Advanced Micro Devices X86-64\b/).test(input.header))
      throw new Error(`SDK ELF architecture differs from its target: ${input.file}`);
    if (/\bGLIBC_PRIVATE\b/.test(input.versions))
      throw new Error(`SDK requires a private libc ABI: ${input.file}`);
    if ((input.versions.match(/\bGLIBC_[A-Za-z0-9_.]+\b/g) ?? []).some((version) => !/^GLIBC_\d+(?:\.\d+)+$/.test(version)))
      throw new Error(`SDK requires an unsupported libc ABI tag: ${input.file}`);
    if (!musl && /\((?:RELR|RELRSZ|RELRENT)\)/.test(input.dynamic))
      throw new Error(`SDK requires packed relocations beyond its GNU loader floor: ${input.file}`);
    const glibcVersions = [...new Set(input.versions.match(/\bGLIBC_\d+(?:\.\d+)+\b/g) ?? [])].map((version) => version.slice(6)).sort(compareVersions);
    const floor = glibcVersions.at(-1) ?? null;
    if (musl && floor)
      throw new Error(`musl SDK requires GNU libc: ${input.file}`);
    if (floor && compareVersions(floor, "2.17") > 0)
      throw new Error(`SDK requires GLIBC ${floor}, above the 2.17 release floor: ${input.file}`);
    if (floor && (!maximumGLIBC || compareVersions(floor, maximumGLIBC) > 0))
      maximumGLIBC = floor;
    const needed = [...input.dynamic.matchAll(/\(NEEDED\).*\[([^\]]+)\]/g)].map((match) => match[1]);
    for (const dependency of needed) {
      if (dependency.includes("/") || !systemLibraries.has(dependency) && !bundled.has(dependency))
        throw new Error(`SDK dependency is outside its qualified closure: ${input.file}: ${dependency}`);
    }
    const paths = [...input.dynamic.matchAll(/\((?:RUNPATH|RPATH)\).*\[([^\]]*)\]/g)].map((match) => match[1]);
    const expectedPath = input.file.startsWith("lib/") ? "$ORIGIN" : "$ORIGIN/../lib";
    if (needed.length && (paths.length !== 1 || paths[0] !== expectedPath))
      throw new Error(`SDK ELF search path is not relocatable: ${input.file}`);
    const requested = input.programHeaders.match(/\[Requesting program interpreter:\s*([^\]]+)\]/)?.[1];
    if (requested && requested !== interpreter)
      throw new Error(`SDK ELF loader differs from its target: ${input.file}`);
    return { file: input.file, sha256: input.sha256, minimumGLIBC: floor, needed, rpath: paths[0] ?? null };
  });
  return {
    schema: 1,
    target,
    libc: musl ? "musl" : "gnu",
    releaseGLIBCFloor: musl ? null : "2.17",
    maximumGLIBC,
    files
  };
}

// packages/bun-video/src/sdk.ts
import { mkdir, realpath, rename, stat, unlink } from "fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "path";
// packages/bun-video/src/sdk-manifest.json
var sdk_manifest_default = {
  schema: 1,
  registryBindings: {
    package: "ffmpeg-sys-next",
    version: "9.0.1",
    checksum: "c6f932d8c1cede016c65d4f1435f323369c99c74df55143b18676aa10e7603f9",
    registryStatus: "published-raw-native-owner"
  },
  ffmpegABI: {
    avutil: 61,
    avcodec: 63,
    avformat: 63,
    avdevice: 63,
    avfilter: 12,
    swscale: 10,
    swresample: 7
  },
  targets: {
    "windows-x64": {
      ffmpeg: {
        version: "9.0.2-27-g7e93014c5b",
        sourceRevision: "7e93014c5bbb61e7c22afebb478bf92f7a08d59a",
        sourceRepository: "https://github.com/FFmpeg/FFmpeg",
        license: "LGPL-2.1-or-later",
        status: "upstream-digest-pinned-awaiting-sdk-qualification",
        assets: [],
        upstreamAssets: [
          {
            url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-12-13-12/ffmpeg-n9.0.2-27-g7e93014c5b-win64-lgpl-shared-9.0.zip",
            sha256: "de3f3b16b3dbf2038a56878aa35795f48bd220f01479697e008470773cecba5b",
            bytes: 77230796,
            format: "zip"
          }
        ]
      },
      mpv: {
        version: "0.41.0-dev-gc3ac7f395",
        sourceRevision: "c3ac7f39514c7f45bc38a18e66887240539ee33c",
        sourceRepository: "https://github.com/mpv-player/mpv",
        license: "bundle-notices-awaiting-verification",
        status: "upstream-digest-pinned-awaiting-sdk-qualification",
        apiMajor: 2,
        libraryName: "libmpv-2.dll",
        assets: [],
        upstreamAssets: [
          {
            url: "https://github.com/mpv-player/mpv/releases/download/git-release/libmpv-v0.41.0-dev-gc3ac7f395-38326895870-x86_64-w64-mingw32-lgpl.zip",
            sha256: "9ffbed7a8aa013da07a925dfbb046116683796af76a9b635e4e7b3328d44f9d5",
            bytes: 56765949,
            format: "zip"
          },
          {
            url: "https://github.com/mpv-player/mpv/releases/download/git-release/mpv-v0.41.0-dev-gc3ac7f395-38326895870-x86_64-pc-windows-msvc.zip",
            sha256: "0e4b520f53de5a608a06cd5c5bb065f354c20253b3c727562c0b583e07efca24",
            bytes: 28575932,
            format: "zip"
          }
        ]
      }
    },
    "linux-x64": {
      ffmpeg: {
        version: "9.0.2-27-g7e93014c5b",
        sourceRevision: "7e93014c5bbb61e7c22afebb478bf92f7a08d59a",
        sourceRepository: "https://github.com/FFmpeg/FFmpeg",
        license: "LGPL-2.1-or-later",
        status: "upstream-digest-pinned-awaiting-sdk-qualification",
        assets: [],
        upstreamAssets: [
          {
            url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-12-13-12/ffmpeg-n9.0.2-27-g7e93014c5b-linux64-lgpl-shared-9.0.tar.xz",
            sha256: "d0dde42b22038f77ee6403e0d60c78a6b502bfea2d1cb410a8f66779484e61ee",
            bytes: 63541740,
            format: "tar.xz"
          }
        ]
      },
      mpv: {
        version: "0.41.0-dev-gc3ac7f395",
        sourceRevision: "c3ac7f39514c7f45bc38a18e66887240539ee33c",
        sourceRepository: "https://github.com/mpv-player/mpv",
        license: "LGPL-2.1-or-later",
        apiMajor: 2,
        libraryName: "libmpv.so.2",
        status: "no-qualified-complete-prebuilt-sdk",
        assets: [],
        upstreamAssets: []
      }
    },
    "windows-arm64": {
      ffmpeg: {
        version: "9.0.2-27-g7e93014c5b",
        sourceRevision: "7e93014c5bbb61e7c22afebb478bf92f7a08d59a",
        sourceRepository: "https://github.com/FFmpeg/FFmpeg",
        license: "LGPL-2.1-or-later",
        status: "upstream-digest-pinned-awaiting-sdk-qualification",
        assets: [],
        upstreamAssets: [
          {
            url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-12-13-12/ffmpeg-n9.0.2-27-g7e93014c5b-winarm64-lgpl-shared-9.0.zip",
            sha256: "627952cd8656f6f12b1221efcb59eb83b0134660721d6aab01ff6140dd4d54dd",
            bytes: 53762744,
            format: "zip"
          }
        ]
      },
      mpv: {
        version: "0.41.0-dev-gc3ac7f395",
        sourceRevision: "c3ac7f39514c7f45bc38a18e66887240539ee33c",
        sourceRepository: "https://github.com/mpv-player/mpv",
        license: "bundle-notices-awaiting-verification",
        status: "upstream-digest-pinned-awaiting-sdk-qualification",
        apiMajor: 2,
        libraryName: "libmpv-2.dll",
        assets: [],
        upstreamAssets: [
          {
            url: "https://github.com/mpv-player/mpv/releases/download/git-release/libmpv-v0.41.0-dev-gc3ac7f395-38326895870-aarch64-w64-mingw32-lgpl.zip",
            sha256: "f0599227abeafd1d599bb6179876a901a55aace850d7cd0dab50789c36241ce3",
            bytes: 40042872,
            format: "zip"
          },
          {
            url: "https://github.com/mpv-player/mpv/releases/download/git-release/mpv-v0.41.0-dev-gc3ac7f395-38326895870-aarch64-pc-windows-msvc.zip",
            sha256: "a1e84737046185e9c8b2a10fcc706785af4376019627ea952fcf3a4a118c6822",
            bytes: 26093501,
            format: "zip"
          }
        ]
      }
    },
    "linux-arm64": {
      ffmpeg: {
        version: "9.0.2-27-g7e93014c5b",
        sourceRevision: "7e93014c5bbb61e7c22afebb478bf92f7a08d59a",
        sourceRepository: "https://github.com/FFmpeg/FFmpeg",
        license: "LGPL-2.1-or-later",
        status: "upstream-digest-pinned-awaiting-sdk-qualification",
        assets: [],
        upstreamAssets: [
          {
            url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-12-13-12/ffmpeg-n9.0.2-27-g7e93014c5b-linuxarm64-lgpl-shared-9.0.tar.xz",
            sha256: "898213a5bb1a4ee70caa0fa774aee3cf7954fe2fa662b5b7dd7c72b67faef008",
            bytes: 54100032,
            format: "tar.xz"
          }
        ]
      },
      mpv: {
        version: "0.41.0-dev-gc3ac7f395",
        sourceRevision: "c3ac7f39514c7f45bc38a18e66887240539ee33c",
        sourceRepository: "https://github.com/mpv-player/mpv",
        license: "bundle-notices-awaiting-verification",
        apiMajor: 2,
        libraryName: "libmpv.so.2",
        status: "source-build-awaiting-sdk-qualification",
        assets: [],
        upstreamAssets: []
      }
    },
    "linux-x64-musl": {
      ffmpeg: {
        version: "9.0.2-27-g7e93014c5b",
        sourceRevision: "7e93014c5bbb61e7c22afebb478bf92f7a08d59a",
        sourceRepository: "https://github.com/FFmpeg/FFmpeg",
        license: "LGPL-2.1-or-later",
        status: "source-build-awaiting-sdk-qualification",
        assets: [],
        upstreamAssets: []
      },
      mpv: {
        version: "0.41.0-dev-gc3ac7f395",
        sourceRevision: "c3ac7f39514c7f45bc38a18e66887240539ee33c",
        sourceRepository: "https://github.com/mpv-player/mpv",
        license: "bundle-notices-awaiting-verification",
        apiMajor: 2,
        libraryName: "libmpv.so.2",
        status: "source-build-awaiting-sdk-qualification",
        assets: [],
        upstreamAssets: []
      }
    },
    "linux-arm64-musl": {
      ffmpeg: {
        version: "9.0.2-27-g7e93014c5b",
        sourceRevision: "7e93014c5bbb61e7c22afebb478bf92f7a08d59a",
        sourceRepository: "https://github.com/FFmpeg/FFmpeg",
        license: "LGPL-2.1-or-later",
        status: "source-build-awaiting-sdk-qualification",
        assets: [],
        upstreamAssets: []
      },
      mpv: {
        version: "0.41.0-dev-gc3ac7f395",
        sourceRevision: "c3ac7f39514c7f45bc38a18e66887240539ee33c",
        sourceRepository: "https://github.com/mpv-player/mpv",
        license: "bundle-notices-awaiting-verification",
        apiMajor: 2,
        libraryName: "libmpv.so.2",
        status: "source-build-awaiting-sdk-qualification",
        assets: [],
        upstreamAssets: []
      }
    },
    "darwin-x64": {
      ffmpeg: {
        version: "9.0.2-27-g7e93014c5b",
        sourceRevision: "7e93014c5bbb61e7c22afebb478bf92f7a08d59a",
        sourceRepository: "https://github.com/FFmpeg/FFmpeg",
        license: "LGPL-2.1-or-later",
        status: "source-build-awaiting-sdk-qualification",
        assets: [],
        upstreamAssets: []
      },
      mpv: {
        version: "0.41.0-dev-gc3ac7f395",
        sourceRevision: "c3ac7f39514c7f45bc38a18e66887240539ee33c",
        sourceRepository: "https://github.com/mpv-player/mpv",
        license: "bundle-notices-awaiting-verification",
        apiMajor: 2,
        libraryName: "libmpv.2.dylib",
        status: "source-build-awaiting-sdk-qualification",
        assets: [],
        upstreamAssets: []
      }
    },
    "darwin-arm64": {
      ffmpeg: {
        version: "9.0.2-27-g7e93014c5b",
        sourceRevision: "7e93014c5bbb61e7c22afebb478bf92f7a08d59a",
        sourceRepository: "https://github.com/FFmpeg/FFmpeg",
        license: "LGPL-2.1-or-later",
        status: "source-build-awaiting-sdk-qualification",
        assets: [],
        upstreamAssets: []
      },
      mpv: {
        version: "0.41.0-dev-gc3ac7f395",
        sourceRevision: "c3ac7f39514c7f45bc38a18e66887240539ee33c",
        sourceRepository: "https://github.com/mpv-player/mpv",
        license: "bundle-notices-awaiting-verification",
        apiMajor: 2,
        libraryName: "libmpv.2.dylib",
        status: "source-build-awaiting-sdk-qualification",
        assets: [],
        upstreamAssets: []
      }
    }
  }
};

// packages/bun-video/src/sdk.ts
function mediaSDKPlan(component, target) {
  if (!Object.hasOwn(sdk_manifest_default.targets, target) || !["ffmpeg", "mpv"].includes(component))
    throw new TypeError("Unsupported media SDK target or component");
  const plan = structuredClone(sdk_manifest_default.targets[target][component]);
  if ("libraryName" in plan && (typeof plan.libraryName !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(plan.libraryName)))
    throw new TypeError("SDK library name must be a file basename");
  return plan;
}
async function hashSDKFile(file) {
  if (!isAbsolute(file))
    throw new TypeError("SDK file path must be absolute");
  const hash = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(file).stream())
    hash.update(chunk);
  return hash.digest("hex");
}
async function confinedFile(prefix, path) {
  const base = await realpath(prefix);
  const actual = await realpath(path);
  const within = relative(base, actual);
  if (!within || within.startsWith("..") || isAbsolute(within))
    throw new Error("SDK member escaped its selected directory");
  if (!(await stat(actual)).isFile())
    throw new Error("SDK member must be a regular file");
  return actual;
}
async function verifyMediaSDKLayout(component, target, prefix) {
  if (!isAbsolute(prefix))
    throw new TypeError("SDK prefix must be absolute");
  const plan = mediaSDKPlan(component, target);
  if (!plan.sourceRevision)
    throw new Error(`No source revision is pinned for ${component} on ${target}`);
  const files = [];
  if (component === "ffmpeg") {
    for (const [library, major] of Object.entries(sdk_manifest_default.ffmpegABI)) {
      const includeDirectory = `lib${library}`;
      const candidates = [
        join(prefix, "include", includeDirectory, "version_major.h"),
        join(prefix, "include", includeDirectory, "version.h")
      ];
      const header = await Bun.file(candidates[0]).exists() ? candidates[0] : candidates[1];
      const source = Bun.file(await confinedFile(prefix, header));
      if (source.size > 1024 * 1024)
        throw new Error("SDK header exceeded its size bound");
      const version = (await source.text()).match(new RegExp(`#\\s*define\\s+LIB${library.toUpperCase()}_VERSION_MAJOR\\s+(\\d+)`));
      if (!version || Number(version[1]) !== major)
        throw new Error(`FFmpeg ${library} SDK header ABI mismatch`);
      files.push(header);
      const libraryFile = target.startsWith("windows") ? join(prefix, "bin", `${library}-${major}.dll`) : target.startsWith("darwin") ? join(prefix, "lib", `lib${library}.${major}.dylib`) : join(prefix, "lib", `lib${library}.so.${major}`);
      files.push(await confinedFile(prefix, libraryFile));
      if (target.startsWith("windows")) {
        const imports = [join(prefix, "lib", `${library}.lib`), join(prefix, "lib", `lib${library}.dll.a`)];
        const found = await Bun.file(imports[0]).exists() ? imports[0] : imports[1];
        files.push(await confinedFile(prefix, found));
      }
    }
    for (const executable of ["ffmpeg", "ffprobe"]) {
      files.push(await confinedFile(prefix, join(prefix, "bin", executable + (target.startsWith("windows") ? ".exe" : ""))));
    }
  } else {
    const header = await confinedFile(prefix, join(prefix, "include/mpv/client.h"));
    if (Bun.file(header).size > 1024 * 1024 || !(await Bun.file(header).text()).match(/MPV_CLIENT_API_VERSION\s+MPV_MAKE_VERSION\(\s*2\s*,/))
      throw new Error("mpv client SDK header ABI mismatch");
    files.push(header);
    files.push(await confinedFile(prefix, join(prefix, target.startsWith("windows") ? "bin" : "lib", plan.libraryName ?? (target.startsWith("windows") ? "libmpv-2.dll" : "libmpv.so.2"))));
    files.push(await confinedFile(prefix, join(prefix, target.startsWith("windows") ? "bin/mpv.exe" : "bin/mpv")));
    if (target.startsWith("windows")) {
      const imports = [join(prefix, "lib/mpv.lib"), join(prefix, "lib/libmpv.dll.a")];
      files.push(await confinedFile(prefix, await Bun.file(imports[0]).exists() ? imports[0] : imports[1]));
    }
  }
  const licenses = [];
  for await (const name of new Bun.Glob("**/{COPYING,LICENSE,Copyright,licenses}/**").scan({
    cwd: prefix,
    onlyFiles: true
  }))
    licenses.push(name);
  for await (const name of new Bun.Glob("**/{COPYING*,LICENSE*,Copyright*}").scan({ cwd: prefix, onlyFiles: true }))
    licenses.push(name);
  if (!licenses.length)
    throw new Error("A complete SDK must retain its license notices");
  const hashes = Object.fromEntries(await Promise.all(files.map(async (path) => [relative(prefix, path).replaceAll("\\", "/"), await hashSDKFile(resolve(path))])));
  return {
    schema: 1,
    component,
    target,
    version: plan.version,
    sourceRevision: plan.sourceRevision,
    qualification: "headers-and-file-layout-only",
    files: hashes,
    licenses: [...new Set(licenses)]
  };
}

// scripts/aphrody/media-sdk-factory.ts
async function nativeTool(argv, cwd) {
  await using child = Bun.spawn(argv, {
    cwd,
    stdout: "pipe",
    stderr: "inherit",
    timeout: 120000,
    killSignal: "SIGKILL"
  });
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder;
  for await (const chunk of child.stdout) {
    bytes += chunk.byteLength;
    if (bytes > 16 * 1024 * 1024) {
      child.kill();
      throw new Error("SDK archive listing exceeded its bound");
    }
    text += decoder.decode(chunk, { stream: true });
  }
  if (await child.exited !== 0)
    throw new Error(`SDK factory native tool failed: ${argv[0]}`);
  return text + decoder.decode();
}
async function qualifyLinuxMediaSDK(target, prefix) {
  if (process.platform !== "linux")
    throw new Error("SDK ELF inspection belongs to the Linux factory");
  const readelf = Bun.which("llvm-readelf") ?? Bun.which("readelf");
  if (!readelf)
    throw new Error("SDK ELF inspection requires the installed readelf owner");
  const canonical = await realpath2(prefix);
  const inputs = [];
  for await (const name of new Bun.Glob("{bin,lib}/*").scan({ cwd: prefix, onlyFiles: true, followSymlinks: true })) {
    const path = await realpath2(join2(prefix, name));
    const member = relative2(canonical, path);
    if (member.startsWith("..") || isAbsolute2(member))
      throw new Error("SDK ELF member escaped its prefix");
    const magic = await Bun.file(path).slice(0, 4).bytes();
    if (magic.length !== 4 || magic[0] !== 127 || magic[1] !== 69 || magic[2] !== 76 || magic[3] !== 70)
      continue;
    if (inputs.length >= 1024)
      throw new Error("SDK ELF inventory exceeds its bound");
    inputs.push({
      file: name.replaceAll("\\", "/"),
      sha256: await hashSDKFile(path),
      header: await nativeTool([readelf, "--file-header", path], prefix),
      dynamic: await nativeTool([readelf, "--dynamic", path], prefix),
      versions: await nativeTool([readelf, "--version-info", path], prefix),
      programHeaders: await nativeTool([readelf, "--program-headers", path], prefix)
    });
  }
  return qualifyMediaELFs(target, inputs);
}

// factory/artifacts/runtime-release/linux-media-portable-20261013/qualify-final.ts
import { join as join3 } from "path";
var factory = "/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk";
var ffmpeg = join3(factory, "ffmpeg-linux-x64-portable");
var mpv = join3(factory, "mpv-linux-x64-portable");
var sourceCommit = "165df62bc02539eaa74e29126355a860e0738405";
async function run(argv) {
  await using child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", timeout: 20000 });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (await child.exited)
    throw new Error(`qualification failed: ${argv[0]}
${stderr.slice(0, 4096)}`);
  return stdout;
}
var raw = new Uint8Array(64 * 64 * 4);
for (let i = 0;i < raw.length; i += 4) {
  raw[i] = 255;
  raw[i + 3] = 255;
}
await Bun.write(join3(ffmpeg, "red-source.rgba"), raw);
var executable = join3(ffmpeg, "prefix/bin/ffmpeg");
await run([executable, "-v", "error", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "64x64", "-framerate", "1", "-i", join3(ffmpeg, "red-source.rgba"), "-frames:v", "1", "-c:v", "png", "-threads", "1", "-filter_threads", "1", "-y", join3(ffmpeg, "red.png")]);
await run([executable, "-v", "error", "-i", join3(ffmpeg, "red.png"), "-frames:v", "1", "-pix_fmt", "rgba", "-f", "rawvideo", "-threads", "1", "-filter_threads", "1", "-y", join3(ffmpeg, "red-decoded.rgba")]);
var decoded = await Bun.file(join3(ffmpeg, "red-decoded.rgba")).bytes();
if (decoded.length !== raw.length || decoded.some((byte, i) => byte !== raw[i]))
  throw new Error("PNG pixel roundtrip differs");
await run([executable, "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=4", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=8000", "-frames:v", "4", "-t", "1", "-c:v", "ffv1", "-c:a", "pcm_s16le", "-threads", "1", "-filter_threads", "1", "-y", join3(ffmpeg, "fixture.mkv")]);
var probe = JSON.parse(await run([join3(ffmpeg, "prefix/bin/ffprobe"), "-v", "error", "-show_streams", "-show_format", "-of", "json", join3(ffmpeg, "fixture.mkv")]));
var video = probe.streams.find((stream) => stream.codec_type === "video");
var audio = probe.streams.find((stream) => stream.codec_type === "audio");
if (video?.codec_name !== "ffv1" || video.width !== 64 || video.height !== 64 || audio?.codec_name !== "pcm_s16le")
  throw new Error("synthetic media metadata differs");
var frames = await run([executable, "-v", "error", "-i", join3(ffmpeg, "fixture.mkv"), "-map", "0:v:0", "-f", "framemd5", "-threads", "1", "-filter_threads", "1", "-"]);
if (frames.split(`
`).filter((line) => /^0,/.test(line)).length !== 4)
  throw new Error("video frame count differs");
var api = (await run(["/home/ubuntu/build/tmp/media-sdk-mpv-probe", join3(ffmpeg, "fixture.mkv")])).trim();
if (api !== "MPV_API_PASS major=2 minor>=5 cpu=64x64 pause=roundtrip end=EOF")
  throw new Error("MPV API qualification differs");
var cli = await run([join3(mpv, "prefix/bin/mpv"), "--no-config", "--vo=null", "--ao=null", "--hwdec=no", "--vd-lavc-threads=1", join3(ffmpeg, "fixture.mkv")]);
if (!cli.includes("VO: [null] 64x64") || !cli.includes("Exiting... (End of file)"))
  throw new Error("MPV CLI qualification differs");
for (const [component, owner, sourceRevision] of [
  ["ffmpeg", ffmpeg, "7e93014c5bbb61e7c22afebb478bf92f7a08d59a"],
  ["mpv", mpv, "c3ac7f39514c7f45bc38a18e66887240539ee33c"]
]) {
  const source = join3("/home/ubuntu/src", component);
  if ((await run(["git", "-C", source, "rev-parse", "HEAD"])).trim() !== sourceRevision || (await run(["git", "-C", source, "status", "--porcelain"])).trim())
    throw new Error("qualification source pin changed");
  const linuxABI = await qualifyLinuxMediaSDK("linux-x64", join3(owner, "prefix"));
  const layout = await verifyMediaSDKLayout(component, "linux-x64", join3(owner, "prefix"));
  const licenses = Object.fromEntries(await Promise.all(layout.licenses.map(async (name) => [name, new Bun.CryptoHasher("sha256").update(await Bun.file(join3(owner, "prefix", name)).bytes()).digest("hex")])));
  const receipt = { schema: 1, component, target: "linux-x64", sourceCommit, noticesCommit: "d3916f15622783ed9add7cd65d55f56c00177093", sourceRevision, sourceClean: true, passed: true, linuxABI, layout, licenses, functional: component === "ffmpeg" ? { PNG: { exactRGBABytes: raw.length, dimensions: [64, 64] }, video: { codec: "ffv1", frames: 4, dimensions: [64, 64] }, audio: { codec: "pcm_s16le", sampleRate: 8000 } } : { api, cli: { nullOutput: true, dimensions: [64, 64], EOF: true } }, oldGLIBCExecution: "not-performed", graphics: "not-qualified", archivePublished: false };
  await Bun.write(join3(owner, "native-qualification-portable.json"), JSON.stringify(receipt, null, 2));
  await Bun.write(join3(owner, "linux-abi.json"), JSON.stringify(linuxABI, null, 2));
  console.log(JSON.stringify({ component, passed: true, maximumGLIBC: linuxABI.maximumGLIBC, ELFMembers: linuxABI.files.length }));
}
