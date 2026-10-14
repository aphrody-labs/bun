// @bun
// scripts/aphrody/media-sdk-factory.ts
import { mkdir, realpath, readdir, stat } from "fs/promises";
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
import { dirname, isAbsolute, join, relative, resolve } from "path";
async function hashSDKFile(file) {
  if (!isAbsolute(file))
    throw new TypeError("SDK file path must be absolute");
  const hash = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(file).stream())
    hash.update(chunk);
  return hash.digest("hex");
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
  const canonical = await realpath(prefix);
  const inputs = [];
  for await (const name of new Bun.Glob("{bin,lib}/*").scan({ cwd: prefix, onlyFiles: true, followSymlinks: true })) {
    const path = await realpath(join2(prefix, name));
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

// factory/artifacts/runtime-release/linux-media-portable-20261013/qualify-sdk.ts
var [target, prefix, receipt] = process.argv.slice(2);
if (!target || !prefix || !receipt)
  throw new Error("target, prefix and receipt required");
var result = await qualifyLinuxMediaSDK(target, prefix);
await Bun.write(receipt, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ target, maximumGLIBC: result.maximumGLIBC, members: result.files.length }));
