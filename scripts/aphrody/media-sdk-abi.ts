import type { MediaSDKTarget } from "../../packages/bun-video/src/sdk-platform";
import { loadCommands } from "../build/verify-binary";

export interface MediaMachO {
  file: string;
  sha256: string;
  privateHeaders: string;
}

/** Reuses the build owner's load-command parser; only an explicit relocatable closure is accepted. */
export function qualifyMediaMachOs(target: MediaSDKTarget, inputs: MediaMachO[]) {
  if (!/^darwin-(?:x64|arm64)$/.test(target) || !inputs.length || inputs.length > 1024)
    throw new Error("Mach-O qualification requires a bounded Darwin SDK inventory");
  const libraries = new Set(inputs.filter(input => input.file.startsWith("lib/")).map(input => input.file.slice(4)));
  const frameworks = new Set([
    "CoreFoundation",
    "Foundation",
    "AppKit",
    "Cocoa",
    "CoreMedia",
    "CoreVideo",
    "VideoToolbox",
    "AudioToolbox",
    "CoreAudio",
    "IOKit",
    "CoreGraphics",
    "Metal",
    "Security",
    "QuartzCore",
    "AVFoundation",
    "OpenGL",
  ]);
  const system = (name: string) =>
    name === "/usr/lib/libSystem.B.dylib" ||
    name === "/usr/lib/libobjc.A.dylib" ||
    name === "/usr/lib/libc++.1.dylib" ||
    [...frameworks].some(
      framework =>
        name === `/System/Library/Frameworks/${framework}.framework/Versions/A/${framework}` ||
        name === `/System/Library/Frameworks/${framework}.framework/${framework}`,
    );
  const files = inputs.map(input => {
    if (!/^(?:bin|lib)\/[^/]+$/.test(input.file) || !/^[a-f0-9]{64}$/.test(input.sha256))
      throw new Error("Invalid SDK Mach-O member or digest");
    const commands = loadCommands(input.privateHeaders);
    if (
      commands.some(
        command => command.cmd === "LC_BUILD_VERSION" && !/^\s*platform (?:macos|1)\s*$/im.test(command.text),
      )
    )
      throw new Error(`SDK Mach-O targets a foreign Apple platform: ${input.file}`);
    const versions = commands
      .filter(command => command.cmd === "LC_BUILD_VERSION" || command.cmd === "LC_VERSION_MIN_MACOSX")
      .map(command => command.text.match(/^\s*(?:minos|version) ([0-9.]+)\s*$/m)?.[1]);
    if (versions.length !== 1 || !versions[0] || compareVersions(versions[0], "13.0") > 0)
      throw new Error(`SDK Mach-O deployment target exceeds the release floor: ${input.file}`);
    const needed = commands
      .filter(command => /^LC_(LOAD|LOAD_WEAK|REEXPORT|LOAD_UPWARD|LAZY_LOAD)_DYLIB$/.test(command.cmd))
      .map(command => command.text.match(/^\s*name (\S+) \(offset \d+\)\s*$/m)?.[1]);
    const localPath = input.file.startsWith("lib/") ? "@loader_path" : "@loader_path/../lib";
    for (const name of needed)
      if (!name || (!system(name) && (!name.startsWith("@rpath/") || !libraries.has(name.slice(7)))))
        throw new Error(`SDK Mach-O dependency is outside its closure: ${input.file}: ${name}`);
    const paths = commands
      .filter(command => command.cmd === "LC_RPATH")
      .map(command => command.text.match(/^\s*path (\S+) \(offset \d+\)\s*$/m)?.[1]);
    if (needed.some(name => name?.startsWith("@rpath/")) && (paths.length !== 1 || paths[0] !== localPath))
      throw new Error(`SDK Mach-O search path is not relocatable: ${input.file}`);
    const identity = commands
      .find(command => command.cmd === "LC_ID_DYLIB")
      ?.text.match(/^\s*name (\S+) \(offset \d+\)\s*$/m)?.[1];
    if (input.file.startsWith("lib/") && (!identity?.startsWith("@rpath/") || !libraries.has(identity.slice(7))))
      throw new Error(`SDK Mach-O install name differs from its member: ${input.file}`);
    if (paths.some(path => path !== localPath))
      throw new Error(`SDK Mach-O contains an external search path: ${input.file}`);
    return { file: input.file, sha256: input.sha256, minimumMacOS: versions[0], needed, rpath: paths[0] ?? null };
  });
  return { schema: 1, target, releaseMacOSFloor: "13.0", qualification: "Mach-O-load-command-closure-only", files };
}

export interface MediaELF {
  file: string;
  sha256: string;
  header: string;
  dynamic: string;
  versions: string;
  programHeaders: string;
}

const gnuSystemLibraries = new Set([
  "libc.so.6",
  "libm.so.6",
  "libpthread.so.0",
  "libdl.so.2",
  "librt.so.1",
  "libresolv.so.2",
  "libutil.so.1",
]);

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const order = (a[i] ?? 0) - (b[i] ?? 0);
    if (order) return order;
  }
  return 0;
}

export interface MediaELFQualification {
  schema: number;
  target: MediaSDKTarget;
  libc: string;
  releaseGLIBCFloor: string | null;
  maximumGLIBC: string | null;
  files: { file: string; sha256: string; minimumGLIBC: string | null; needed: string[]; rpath: string | null }[];
}

/** Reject an unresolved closure even when its root library meets the ABI floor. */
export function qualifyMediaELFs(target: MediaSDKTarget, inputs: MediaELF[]): MediaELFQualification {
  if (!/^linux-(?:x64|arm64)(?:-musl)?$/.test(target))
    throw new TypeError("ELF qualification requires a supported Linux SDK target");
  if (!inputs.length || inputs.length > 1024) throw new Error("SDK ELF inventory is empty or exceeds its bound");
  const arm64 = target.includes("arm64");
  const musl = target.endsWith("-musl");
  const loader = musl
    ? `ld-musl-${arm64 ? "aarch64" : "x86_64"}.so.1`
    : arm64
      ? "ld-linux-aarch64.so.1"
      : "ld-linux-x86-64.so.2";
  const interpreter = musl || arm64 ? `/lib/${loader}` : `/lib64/${loader}`;
  const systemLibraries = musl
    ? new Set([`libc.musl-${arm64 ? "aarch64" : "x86_64"}.so.1`, "libc.so", loader])
    : new Set([...gnuSystemLibraries, loader]);
  const bundled = new Set(inputs.filter(input => input.file.startsWith("lib/")).map(input => input.file.slice(4)));
  let maximumGLIBC: string | null = null;
  const files = inputs.map(input => {
    if (!/^(?:lib|bin)\/[^/]+$/.test(input.file) || !/^[a-f0-9]{64}$/.test(input.sha256))
      throw new Error("Invalid SDK ELF member or digest");
    if (systemLibraries.has(input.file.slice(4))) throw new Error(`SDK bundles a system libc member: ${input.file}`);
    if (
      !/Class:\s+ELF64/.test(input.header) ||
      !/Data:.*little endian/.test(input.header) ||
      !/Type:\s+(?:DYN|EXEC)\b/.test(input.header) ||
      !(arm64 ? /Machine:\s+AArch64\b/ : /Machine:\s+Advanced Micro Devices X86-64\b/).test(input.header)
    )
      throw new Error(`SDK ELF architecture differs from its target: ${input.file}`);
    if (/\bGLIBC_PRIVATE\b/.test(input.versions)) throw new Error(`SDK requires a private libc ABI: ${input.file}`);
    if (
      (input.versions.match(/\bGLIBC_[A-Za-z0-9_.]+\b/g) ?? []).some(version => !/^GLIBC_\d+(?:\.\d+)+$/.test(version))
    )
      throw new Error(`SDK requires an unsupported libc ABI tag: ${input.file}`);
    if (!musl && /\((?:RELR|RELRSZ|RELRENT)\)/.test(input.dynamic))
      throw new Error(`SDK requires packed relocations beyond its GNU loader floor: ${input.file}`);
    // A WEAK version need does not stop the loader (Rust std's statx/gettid fallbacks); only hard needs set the floor.
    // Without GNU readelf's version-need entries, every GLIBC tag counts.
    const needs = [...input.versions.matchAll(/Name:\s+GLIBC_(\d+(?:\.\d+)+)\s+Flags:\s+([^\n]*?)\s+Version:/g)];
    const glibcVersions = [
      ...new Set(
        needs.length
          ? needs.filter(match => !/\bWEAK\b/.test(match[2]!)).map(match => match[1]!)
          : (input.versions.match(/\bGLIBC_\d+(?:\.\d+)+\b/g) ?? []).map(version => version.slice(6)),
      ),
    ].sort(compareVersions);
    const floor = glibcVersions.at(-1) ?? null;
    if (musl && floor) throw new Error(`musl SDK requires GNU libc: ${input.file}`);
    if (floor && compareVersions(floor, "2.17") > 0)
      throw new Error(`SDK requires GLIBC ${floor}, above the 2.17 release floor: ${input.file}`);
    if (floor && (!maximumGLIBC || compareVersions(floor, maximumGLIBC) > 0)) maximumGLIBC = floor;
    const needed = [...input.dynamic.matchAll(/\(NEEDED\).*\[([^\]]+)\]/g)].map(match => match[1]!);
    for (const dependency of needed) {
      if (dependency.includes("/") || (!systemLibraries.has(dependency) && !bundled.has(dependency)))
        throw new Error(`SDK dependency is outside its qualified closure: ${input.file}: ${dependency}`);
    }
    const paths = [...input.dynamic.matchAll(/\((?:RUNPATH|RPATH)\).*\[([^\]]*)\]/g)].map(match => match[1]);
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
    files,
  };
}
