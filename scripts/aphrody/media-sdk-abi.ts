import type { MediaSDKTarget } from "../../packages/bun-video/src/sdk-platform";

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

/** Reject an unresolved closure even when its root library meets the ABI floor. */
export function qualifyMediaELFs(target: MediaSDKTarget, inputs: MediaELF[]) {
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
    const glibcVersions = [...new Set(input.versions.match(/\bGLIBC_\d+(?:\.\d+)+\b/g) ?? [])]
      .map(version => version.slice(6))
      .sort(compareVersions);
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
