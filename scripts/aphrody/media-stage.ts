import { chmod, lstat, mkdir, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { hashSDKFile, verifyMediaSDKLayout } from "../../packages/bun-video/src/sdk";
import sdkManifest from "../../packages/bun-video/src/sdk-manifest.json";
import { windowsPEImports } from "../../packages/bun-video/scripts/media-plugin";
import { mediaSDKHostTarget } from "../../packages/bun-video/src/sdk-platform";

const root = resolve(import.meta.dir, "../..");
const mediaRoot = "lib/media";
const receiptName = "bun-media.json";
export const mediaStageTargets = [
  "windows-x64",
  "windows-arm64",
  "linux-x64",
  "linux-arm64",
  "linux-x64-musl",
  "linux-arm64-musl",
  "darwin-x64",
  "darwin-arm64",
] as const;
export type MediaStageTarget = (typeof mediaStageTargets)[number];
const privatePath =
  /(?:^|\/)(?:\.git|node_modules|target|build|__pycache__|cookies?|captures?|datasets?|weights)(?:\/|$)|(?:^|\/)(?:\.env(?:\..*)?|cookies?\.json|hls\.json)|\.(?:har|sqlite(?:3)?|db|safetensors|bak|old)$/i;
const systemDLL =
  /^(?:(?:api-ms-win|ext-ms-win)-[a-z0-9-]+|kernel32|kernelbase|ntdll|advapi32|user32|gdi32|gdi32full|ole32|oleaut32|shell32|shlwapi|comdlg32|comctl32|ws2_32|wsock32|iphlpapi|dnsapi|secur32|crypt32|bcrypt|ncrypt|normaliz|winmm|winhttp|wininet|version|psapi|setupapi|cfgmgr32|imm32|dwmapi|uxtheme|msvcrt|ucrtbase|d3d(?:9|10|11|12)|d3dcompiler_47|dxgi|dxva2|dwrite|d2d1|opengl32|avrt|mf|mfplat|mfreadwrite|mfuuid|propsys|winspool|powrprof|wtsapi32|netapi32|userenv|wintrust|hid|dinput8|xinput1_[34]|nvcuda|nvcuvid|nvencodeapi64|vulkan-1)\.dll$/i;

export interface MediaStageFile {
  name: string;
  sha256: string;
  bytes: number;
  mode?: number;
}
interface SourceFile extends MediaStageFile {
  source: string;
}
export interface MediaStagePlan {
  schemaVersion: 2;
  prefix: string;
  destination: string;
  target: MediaStageTarget;
  qualification: "file-layout-and-pe-import-closure-only" | "file-layout-only";
  requiresNativeQualification: true;
  files: SourceFile[];
  receipt: string;
  aliases: { from: string; to: string; sha256: string }[];
  systemImports: string[];
}
export interface MediaStageOptions {
  apply?: boolean;
  prefix?: string;
  target?: string;
}

function safeName(name: string): string {
  if (
    !name ||
    /[:\\]/.test(name) ||
    [...name].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    name.startsWith("/") ||
    name.split("/").some(part => !part || part === "." || part === "..") ||
    privatePath.test(name)
  )
    throw new Error(`Unsafe or private media member: ${name}`);
  return name;
}
function inside(base: string, path: string): boolean {
  const name = relative(base, path);
  return name === "" || (!isAbsolute(name) && name !== ".." && !name.startsWith("..\\") && !name.startsWith("../"));
}
async function regularFile(base: string, path: string, allowAlias = false): Promise<string> {
  const info = await lstat(path);
  if ((!info.isFile() && !(allowAlias && info.isSymbolicLink())) || (!allowAlias && info.isSymbolicLink()))
    throw new Error(`Media member must be a regular file: ${path}`);
  const actual = await realpath(path);
  if (!inside(base, actual)) throw new Error(`Media member escaped its source directory: ${path}`);
  if (!(await stat(actual)).isFile()) throw new Error(`Media alias must point to a regular file: ${path}`);
  return actual;
}
async function tree(base: string, directory: string, allowAliases = false): Promise<string[]> {
  const info = await lstat(directory).catch(error => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!info) return [];
  if (!info.isDirectory() || info.isSymbolicLink() || !inside(base, await realpath(directory)))
    throw new Error(`Media directory must remain inside its source: ${directory}`);
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    safeName(relative(base, path).replaceAll("\\", "/"));
    if (entry.isSymbolicLink() && !allowAliases) throw new Error(`Media source contains a symbolic link: ${path}`);
    if (entry.isDirectory()) files.push(...(await tree(base, path, allowAliases)));
    else if (entry.isFile() || entry.isSymbolicLink()) {
      await regularFile(base, path, allowAliases);
      files.push(path);
    } else throw new Error(`Media source contains a special file: ${path}`);
  }
  return files.sort();
}
async function identity(path: string) {
  return { sha256: await hashSDKFile(path), bytes: (await lstat(path)).size };
}

export async function binaryImports(
  path: string,
  target: MediaStageTarget,
  maxBytes = 128 * 1024 * 1024,
): Promise<string[]> {
  if ((await stat(path)).size > maxBytes) throw new Error(`Media binary exceeds its size bound: ${path}`);
  const bytes = await Bun.file(path).bytes(),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const arm64 = target.includes("arm64");
  if (target.startsWith("windows")) {
    const imports = windowsPEImports(bytes);
    if (view.getUint16(view.getUint32(0x3c, true) + 4, true) !== (arm64 ? 0xaa64 : 0x8664))
      throw new Error(`Media PE image does not match ${target}: ${path}`);
    return imports;
  }
  if (target.startsWith("linux")) {
    if (
      bytes.length < 64 ||
      bytes[0] !== 0x7f ||
      bytes[1] !== 0x45 ||
      bytes[2] !== 0x4c ||
      bytes[3] !== 0x46 ||
      bytes[4] !== 2 ||
      bytes[5] !== 1 ||
      view.getUint16(18, true) !== (arm64 ? 183 : 62)
    )
      throw new Error(`Media ELF image does not match ${target}: ${path}`);
  } else if (
    bytes.length < 32 ||
    view.getUint32(0, true) !== 0xfeedfacf ||
    view.getUint32(4, true) !== (arm64 ? 0x100000c : 0x1000007)
  )
    throw new Error(`Media Mach-O image does not match ${target}: ${path}`);
  return [];
}

export function isMediaSystemDLL(name: string): boolean {
  return systemDLL.test(name);
}

/** Inventory public SDK directories and the imports required by the media executables. */
export async function planMediaStage(options: {
  destination: string;
  prefix?: string;
  target?: string;
}): Promise<MediaStagePlan> {
  const selectedTarget = options.target ?? Bun.env.BUN_MEDIA_TARGET ?? mediaSDKHostTarget();
  if (!(mediaStageTargets as readonly string[]).includes(selectedTarget))
    throw new Error(`Unsupported media staging target: ${selectedTarget}`);
  const target = selectedTarget as MediaStageTarget,
    windows = target.startsWith("windows"),
    darwin = target.startsWith("darwin");
  const selectedPrefix = options.prefix ?? Bun.env.BUN_MEDIA_PREFIX ?? join(root, "build/media");
  if (!isAbsolute(options.destination) || !isAbsolute(selectedPrefix))
    throw new Error("Media source and destination must be absolute directories");
  for (const path of [selectedPrefix, options.destination]) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error("Media source and destination must be real directories");
  }
  const prefix = await realpath(selectedPrefix),
    destination = await realpath(options.destination);
  if (inside(prefix, destination) || inside(destination, prefix))
    throw new Error("Media source and destination must not overlap");
  await binaryImports(
    await regularFile(destination, join(destination, windows ? "bun.exe" : "bun")),
    target,
    512 * 1024 * 1024,
  );
  const files: SourceFile[] = [],
    aliases: MediaStagePlan["aliases"] = [],
    systemImports = new Set<string>();
  const directory = join(prefix, "bin");
  const available = new Map((await readdir(directory)).map(name => [name.toLowerCase(), name]));
  const sharedLibrary = (name: string, major: number) =>
    darwin ? `lib${name}.${major}.dylib` : `lib${name}.so.${major}`;
  const nativeLibrary = darwin ? "libbun_video_native.dylib" : "libbun_video_native.so";
  const components = windows
    ? {
        ffmpeg: [
          "ffmpeg.exe",
          "ffprobe.exe",
          "bun-video-native.exe",
          "bun_video_native.dll",
          ...Object.entries(sdkManifest.ffmpegABI).map(([name, major]) => `${name}-${major}.dll`),
        ],
        mpv: ["mpv.exe", available.has("libmpv-2.dll") ? "libmpv-2.dll" : "mpv-2.dll"],
      }
    : {
        ffmpeg: [
          "bin/ffmpeg",
          "bin/ffprobe",
          "bin/bun-video-native",
          `lib/${nativeLibrary}`,
          ...Object.entries(sdkManifest.ffmpegABI).map(([name, major]) => `lib/${sharedLibrary(name, major)}`),
        ],
        mpv: ["bin/mpv", `lib/${sharedLibrary("mpv", 2)}`],
      };
  const add = async (component: string, member: string, source: string) => {
    const memberName = safeName(`${mediaRoot}/${component}/${target}/${member}`);
    if (files.some(file => file.name === memberName)) return;
    const path = await regularFile(prefix, source, !windows);
    files.push({
      name: memberName,
      source: path,
      ...(await identity(path)),
      ...(!windows ? { mode: member.startsWith("bin/") ? 0o755 : 0o644 } : {}),
    });
  };
  for (const [component, seeds] of Object.entries(components)) {
    const pending = windows ? [...seeds] : [],
      seen = new Set<string>();
    if (!windows)
      for (const member of seeds) {
        const source = await regularFile(prefix, join(prefix, member), true);
        await binaryImports(source, target);
        await add(component, member, join(prefix, member));
      }
    while (pending.length) {
      const requested = pending.shift()!,
        name = available.get(requested.toLowerCase());
      if (!name) throw new Error(`Required ${component} media dependency is missing: ${requested}`);
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      const source = await regularFile(prefix, join(directory, name));
      const imports = await binaryImports(source, target);
      await add(component, `bin/${name}`, source);
      for (const imported of imports) {
        if (systemDLL.test(imported)) {
          if (available.has(imported)) throw new Error(`Media SDK shadows a Windows or driver library: ${imported}`);
          systemImports.add(imported);
        } else pending.push(imported);
      }
    }
    if (windows && component === "mpv" && !seen.has("libmpv-2.dll")) {
      const source = join(directory, available.get("mpv-2.dll")!);
      await add(component, "bin/libmpv-2.dll", source);
      aliases.push({
        from: "bin/mpv-2.dll",
        to: `${mediaRoot}/mpv/${target}/bin/libmpv-2.dll`,
        sha256: await hashSDKFile(source),
      });
    }
    for (const kind of ["include", "lib", "share", "licenses", "licences"])
      for (const source of await tree(prefix, join(prefix, kind), !windows))
        await add(component, relative(prefix, source).replaceAll("\\", "/"), source);
    for (const name of await readdir(prefix))
      if (/^(?:COPYING|LICENSE|Copyright)(?:[._-].*)?$/i.test(name))
        await add(component, `licenses/${name}`, join(prefix, name));
    const componentRoot = `${mediaRoot}/${component}/${target}/`;
    if (
      !files.some(
        file =>
          file.name.startsWith(componentRoot) &&
          /(?:^|\/)(?:licenses|licences|COPYING[^/]*|LICENSE[^/]*|Copyright[^/]*)(?:\/|$)/i.test(file.name),
      )
    )
      throw new Error(`Required ${component} license notices are missing from the SDK prefix`);
    // FFmpeg installs version_major.h for most libraries; libavutil keeps its major in version.h (as sdk.ts reads it).
    const versionHeader = (library: string) =>
      [`include/lib${library}/version_major.h`, `include/lib${library}/version.h`].find(member =>
        files.some(file => file.name === componentRoot + member),
      ) ?? `include/lib${library}/version_major.h`;
    for (const required of component === "ffmpeg"
      ? Object.keys(sdkManifest.ffmpegABI).flatMap(name => [
          versionHeader(name),
          ...(windows ? [`lib/${name}.lib`] : []),
        ])
      : ["include/mpv/client.h", ...(windows ? ["lib/mpv.lib"] : [])])
      if (!files.some(file => file.name === componentRoot + required))
        throw new Error(`Required ${component} SDK member is missing: ${required}`);
    for (const [library, major] of component === "ffmpeg" ? Object.entries(sdkManifest.ffmpegABI) : []) {
      const header = await Bun.file(join(prefix, versionHeader(library))).text();
      if (!new RegExp(`#\\s*define\\s+LIB${library.toUpperCase()}_VERSION_MAJOR\\s+${major}(?:\\s|$)`).test(header))
        throw new Error(`FFmpeg ${library} SDK header ABI mismatch`);
    }
    if (
      component === "mpv" &&
      !/MPV_CLIENT_API_VERSION\s+MPV_MAKE_VERSION\(\s*2\s*,/.test(
        await Bun.file(join(prefix, "include/mpv/client.h")).text(),
      )
    )
      throw new Error("mpv client SDK header ABI mismatch");
  }
  files.sort((a, b) => a.name.localeCompare(b.name, "en"));
  if (new Set(files.map(file => file.name.toLowerCase())).size !== files.length)
    throw new Error("Media SDK contains duplicate destination members");
  const plan: MediaStagePlan = {
    schemaVersion: 2,
    prefix,
    destination,
    target,
    qualification: windows ? "file-layout-and-pe-import-closure-only" : "file-layout-only",
    requiresNativeQualification: true,
    files,
    receipt: "",
    aliases,
    systemImports: [...systemImports].sort(),
  };
  plan.receipt =
    JSON.stringify(
      {
        schemaVersion: 2,
        target,
        qualification: plan.qualification,
        requiresNativeQualification: true,
        sourceDirectory: prefix,
        aliases,
        systemImports: plan.systemImports,
        files: files.map(({ source: _source, ...file }) => file),
      },
      null,
      2,
    ) + "\n";
  return plan;
}

async function ownedDestination(destination: string): Promise<void> {
  const directory = join(destination, mediaRoot);
  const rootReceipt = join(destination, receiptName);
  if (await lstat(rootReceipt).catch(() => undefined)) {
    await regularFile(destination, rootReceipt);
    const receipt = await Bun.file(rootReceipt).json();
    if (![1, 2].includes(receipt.schemaVersion) || !Array.isArray(receipt.files))
      throw new Error("Runtime root media receipt is not owned by media staging");
    if (
      receipt.schemaVersion === 2 &&
      (await Bun.file(join(directory, receiptName)).exists()) &&
      (await Bun.file(rootReceipt).text()) !== (await Bun.file(join(directory, receiptName)).text())
    )
      throw new Error("Runtime root media receipt changed independently of the SDK");
  }
  if (!(await Bun.file(join(directory, receiptName)).exists())) {
    if (await lstat(directory).catch(() => undefined))
      throw new Error("Existing media directory has no ownership receipt");
    return;
  }
  const receipt = await Bun.file(join(directory, receiptName)).json();
  if (receipt.schemaVersion !== 2 || !Array.isArray(receipt.files))
    throw new Error("Existing media receipt is invalid");
  const expected = new Set<string>([receiptName]);
  for (const file of receipt.files as MediaStageFile[]) {
    safeName(file.name);
    if (!file.name.startsWith(`${mediaRoot}/`)) throw new Error("Existing media receipt escaped its owned directory");
    expected.add(file.name.slice(mediaRoot.length + 1));
    const actual = await regularFile(directory, join(destination, file.name));
    if ((await identity(actual)).sha256 !== file.sha256)
      throw new Error(`Existing staged media member changed: ${file.name}`);
  }
  const actual = await tree(directory, directory);
  if (
    actual.length !== expected.size ||
    actual.some(path => !expected.has(relative(directory, path).replaceAll("\\", "/")))
  )
    throw new Error("Existing media directory contains unowned files");
}

/** Verify every byte before switching directories; restore the previous directory on replacement failure. */
export async function applyMediaStage(plan: MediaStagePlan) {
  await ownedDestination(plan.destination);
  const sourcePlan = await planMediaStage({ prefix: plan.prefix, destination: plan.destination, target: plan.target });
  if (sourcePlan.receipt !== plan.receipt) throw new Error("Media source changed after planning");
  const lib = join(plan.destination, "lib");
  await mkdir(lib, { recursive: true });
  if (!inside(plan.destination, await realpath(lib)) || (await lstat(lib)).isSymbolicLink())
    throw new Error("Media destination lib directory escaped its runtime");
  const temporary = join(lib, `.media-stage-${crypto.randomUUID()}`),
    previous = join(lib, `.media-previous-${crypto.randomUUID()}`),
    destination = join(lib, "media");
  await mkdir(temporary);
  let movedPrevious = false,
    installed = false;
  try {
    for (const file of sourcePlan.files) {
      const output = join(temporary, file.name.slice(mediaRoot.length + 1));
      await mkdir(dirname(output), { recursive: true });
      await Bun.write(output, Bun.file(file.source));
      if (file.mode !== undefined) await chmod(output, file.mode);
      const actual = await identity(output);
      if (actual.sha256 !== file.sha256 || actual.bytes !== file.bytes)
        throw new Error(`Staged media identity changed: ${file.name}`);
    }
    if (Object.hasOwn(sdkManifest.targets, plan.target))
      for (const component of ["ffmpeg", "mpv"] as const)
        await verifyMediaSDKLayout(component, plan.target, join(temporary, component, plan.target));
    await Bun.write(join(temporary, receiptName), sourcePlan.receipt);
    await ownedDestination(plan.destination);
    if (await lstat(destination).catch(() => undefined)) {
      await rename(destination, previous);
      movedPrevious = true;
    }
    await rename(temporary, destination);
    installed = true;
    const stagedReceipt = join(plan.destination, `.bun-media-${crypto.randomUUID()}.json`);
    try {
      await Bun.write(stagedReceipt, sourcePlan.receipt);
      await rename(stagedReceipt, join(plan.destination, receiptName));
    } finally {
      await rm(stagedReceipt, { force: true });
    }
  } catch (error) {
    if (installed) await rm(destination, { recursive: true, force: true });
    if (movedPrevious) {
      await rename(previous, destination);
      movedPrevious = false;
    }
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  if (movedPrevious) await rm(previous, { recursive: true });
  const receiptBytes = new TextEncoder().encode(sourcePlan.receipt);
  const receipt = {
    sha256: new Bun.CryptoHasher("sha256").update(receiptBytes).digest("hex"),
    bytes: receiptBytes.byteLength,
  };
  return {
    applied: true,
    destination: plan.destination,
    target: plan.target,
    qualification: plan.qualification,
    requiresNativeQualification: true,
    files: [
      ...sourcePlan.files.map(({ source: _source, ...file }) => file),
      { name: `${mediaRoot}/${receiptName}`, ...receipt },
      { name: receiptName, ...receipt },
    ],
  };
}

export async function stageMediaBundle(destination: string, options: MediaStageOptions = {}) {
  const plan = await planMediaStage({
    destination,
    ...(options.prefix !== undefined ? { prefix: options.prefix } : {}),
    ...(options.target !== undefined ? { target: options.target } : {}),
  });
  if (options.apply) return applyMediaStage(plan);
  return {
    applied: false,
    destination: plan.destination,
    target: plan.target,
    qualification: plan.qualification,
    requiresNativeQualification: true,
    files: plan.files.map(({ source: _source, ...file }) => file),
    aliases: plan.aliases,
    systemImports: plan.systemImports,
  };
}
if (import.meta.main) {
  const [destination, ...args] = Bun.argv.slice(2);
  const targetIndex = args.indexOf("--target");
  const target = targetIndex >= 0 ? args[targetIndex + 1] : undefined;
  if (
    !destination ||
    (targetIndex >= 0 && !target) ||
    args.some(
      (argument, index) =>
        argument !== "--apply" && argument !== "--target" && !(targetIndex >= 0 && index === targetIndex + 1),
    )
  )
    throw new Error("usage: bun run media:stage ABS_BUN_DIRECTORY [--apply] [--target TARGET]");
  console.log(
    JSON.stringify(
      await stageMediaBundle(destination, {
        apply: args.includes("--apply"),
        ...(target !== undefined ? { target } : {}),
      }),
      null,
      2,
    ),
  );
}
