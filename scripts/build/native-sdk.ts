import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { lstat, mkdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Config } from "./config.ts";
import { computeDepFlags } from "./flags.ts";
import { toolIdentityFile } from "./tools.ts";
import type { Dependency, Source } from "./source.ts";
import { downloadWithRetry } from "./download.ts";
import index from "./native-sdk-index.json";

export interface NativeSDKReceipt {
  schema: 1;
  kind: "native-sdk";
  component: string;
  source: Extract<Source, { kind: "github-archive" }>;
  sourceIdentity: string;
  target: string;
  buildABI: ReturnType<typeof computeNativeSDKABI>;
  sourceRoot: "source";
  includes: string[];
  libraries: string[];
  defines: string[];
  licenses: string[];
  files: Record<string, string>;
  qualification: "native-tests-passed" | "wine-smoke-passed";
}

export interface NativeSDKAsset extends NativeSDKReceipt {
  asset: { url: string; sha256: string; bytes: number; format: "zip" };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function nativeSDKHash(value: unknown): string {
  return new Bun.CryptoHasher("sha256").update(stable(value)).digest("hex");
}

export function computeNativeSDKABI(cfg: Config, dep: Dependency) {
  const roots = [
    [cfg.buildDir, "$build"],
    [cfg.vendorDir, "$vendor"],
    [cfg.cwd, "$repo"],
    [cfg.winsysroot, "$winsysroot"],
    [cfg.sysroot, "$sysroot"],
    [cfg.osxSysroot, "$osxsysroot"],
  ]
    .filter((v): v is [string, string] => typeof v[0] === "string")
    .sort(([a], [b]) => b.length - a.length);
  function normalize(value: unknown): unknown {
    if (typeof value === "string") {
      let normalized = value.replaceAll("\\", "/");
      for (const [name, sourceRoot] of selectedRoots.get(cfg) ?? []) {
        normalized = normalized.replaceAll(sourceRoot.replaceAll("\\", "/"), `$vendor/${name}`);
        normalized = normalized.replaceAll(
          join(dirname(sourceRoot), "generated").replaceAll("\\", "/"),
          `$build/deps/${name}`,
        );
      }
      for (const [root, token] of roots) normalized = normalized.replaceAll(root.replaceAll("\\", "/"), token);
      return normalized;
    }
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
    return value;
  }
  const tools: Record<string, string> = {};
  for (const name of ["cc", "cxx", "ld", "nasm"] as const) {
    if (!cfg[name]) continue;
    const file = toolIdentityFile(cfg, name);
    if (!existsSync(file)) throw new Error(`Native SDK requires the configured ${name} identity: ${file}`);
    tools[name] = readFileSync(file, "utf8").trim();
  }
  if (!tools.cc || !tools.cxx) throw new Error("Native SDK compiler identity is missing");
  const systemHeaders: Record<string, string> = {};
  function header(root: string, member: string): void {
    const path = join(root, member);
    if (!existsSync(path)) return;
    if (statSync(path).size > 1024 ** 2) throw new Error("Native SDK toolchain header exceeded its bound");
    systemHeaders[member.replaceAll("\\", "/")] = new Bun.CryptoHasher("sha256")
      .update(readFileSync(path))
      .digest("hex");
  }
  if (cfg.sysroot)
    for (const file of ["include/features.h", "usr/include/features.h", "include/stdio.h", "usr/include/stdio.h"])
      header(cfg.sysroot, file);
  if (cfg.winsysroot) {
    for (const [path, file] of [
      ["VC/Tools/MSVC", "include/yvals_core.h"],
      ["Windows Kits/10/Include", "shared/sdkddkver.h"],
    ] as const) {
      const directory = join(cfg.winsysroot, path);
      if (!existsSync(directory)) throw new Error("Native SDK Windows toolchain headers are missing");
      const versions = readdirSync(directory);
      if (versions.length > 64) throw new Error("Native SDK Windows toolchain version count exceeded its bound");
      for (const version of versions)
        if (/^[0-9.]+$/.test(version)) header(cfg.winsysroot, `${path}/${version}/${file}`);
    }
  }
  return {
    os: cfg.os,
    arch: cfg.arch,
    abi: cfg.abi,
    buildType: cfg.buildType,
    asan: cfg.asan,
    lto: cfg.lto,
    baseline: cfg.baseline,
    crossTarget: cfg.crossTarget ?? null,
    osxDeploymentTarget: cfg.osxDeploymentTarget ?? null,
    pgo: !!(cfg.pgoGenerate || cfg.pgoUse),
    tools,
    systemHeaders,
    nativeWindowsSDK: cfg.host.os === "windows" ? (process.env.WindowsSDKVersion ?? null) : null,
    flags: normalize(computeDepFlags(cfg)),
    build: normalize(dep.build(cfg)),
    provides: normalize(dep.provides(cfg)),
  };
}

export function nativeSDKSourceIdentity(
  cfg: Config,
  dep: Dependency,
  source: Extract<Source, { kind: "github-archive" }>,
): string {
  const patches = typeof dep.patches === "function" ? dep.patches(cfg) : (dep.patches ?? []);
  return nativeSDKHash({
    source,
    patches: patches.map(path => ({
      path,
      sha256: new Bun.CryptoHasher("sha256").update(readFileSync(resolve(cfg.cwd, path))).digest("hex"),
    })),
  });
}

export function nativeSDKMember(path: string): boolean {
  return (
    !!path &&
    !isAbsolute(path) &&
    !path.includes("\\") &&
    !path.includes(":") &&
    !path.includes("\0") &&
    path
      .split("/")
      .every(
        part =>
          !!part &&
          part !== "." &&
          part !== ".." &&
          !/[. ]$/.test(part) &&
          !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      )
  );
}

export function validateNativeSDKAsset(value: NativeSDKAsset): void {
  const url = new URL(value.asset.url);
  if (
    value.schema !== 1 ||
    value.kind !== "native-sdk" ||
    value.sourceRoot !== "source" ||
    !/^[a-zA-Z0-9_-]+$/.test(value.component) ||
    value.source.kind !== "github-archive" ||
    !/^[a-f0-9]{40}$/.test(value.source.commit) ||
    !/^[a-f0-9]{64}$/.test(value.sourceIdentity) ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    value.asset.format !== "zip" ||
    !/^[a-f0-9]{64}$/.test(value.asset.sha256) ||
    !Number.isSafeInteger(value.asset.bytes) ||
    value.asset.bytes < 1 ||
    value.asset.bytes > 2 * 1024 ** 3 ||
    !["native-tests-passed", "wine-smoke-passed"].includes(value.qualification)
  )
    throw new Error("Native SDK asset lacks qualified source, ABI or checksum pins");
  if (
    !value.libraries.length ||
    !value.includes.length ||
    !value.licenses.length ||
    value.includes.length > 128 ||
    value.libraries.length > 10_000 ||
    value.licenses.length > 128 ||
    value.files["bun-native-sdk.json"] !== undefined ||
    Object.keys(value.files).length > 100_000
  )
    throw new Error("Native SDK library/header/license layout is missing");
  for (const [name, hash] of Object.entries(value.files)) {
    if (!nativeSDKMember(name) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid native SDK member hash");
  }
  const names = Object.keys(value.files).map(name => name.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error("Native SDK contains case-colliding members");
  for (const name of [...value.libraries, ...value.licenses]) {
    if (!nativeSDKMember(name) || !value.files[name]) throw new Error("Native SDK references an unpinned member");
  }
  for (const include of value.includes) {
    if (
      !(include === "source" || nativeSDKMember(include)) ||
      !Object.keys(value.files).some(name => name.startsWith(include + "/"))
    )
      throw new Error("Native SDK references an empty or unsafe include directory");
  }
}

export function assertNativeSDKCompatible(
  asset: NativeSDKAsset,
  sourceIdentity: string,
  buildABI: NativeSDKAsset["buildABI"],
): void {
  validateNativeSDKAsset(asset);
  if (asset.sourceIdentity !== sourceIdentity || nativeSDKHash(asset.buildABI) !== nativeSDKHash(buildABI))
    throw new Error("Native SDK source/patch/ABI mismatch; select BUN_NATIVE_SDK_MODE=source explicitly");
}

export function compatibleNativeSDK(
  candidates: readonly NativeSDKAsset[],
  sourceIdentity: string,
  buildABI: NativeSDKAsset["buildABI"],
  required: boolean,
): NativeSDKAsset | undefined {
  const exact = candidates.filter(
    asset => asset.sourceIdentity === sourceIdentity && nativeSDKHash(asset.buildABI) === nativeSDKHash(buildABI),
  );
  if (!exact.length) {
    if (required) throw new Error("Native SDK source/patch/ABI mismatch");
    return;
  }
  if (exact.length !== 1) throw new Error("Native SDK index contains ambiguous compatible assets");
  const asset = exact[0]!;
  validateNativeSDKAsset(asset);
  return asset;
}

export function selectNativeSDK(
  cfg: Config,
  dep: Dependency,
  source: Source,
  assets: readonly NativeSDKAsset[] = index.assets,
): NativeSDKAsset | undefined {
  const mode = process.env.BUN_NATIVE_SDK_MODE ?? "auto";
  if (!["auto", "source", "sdk"].includes(mode)) throw new Error("BUN_NATIVE_SDK_MODE must be auto, source or sdk");
  if (mode === "source" || source.kind !== "github-archive" || dep.build(cfg).kind !== "direct") return;
  const candidates = assets.filter(asset => asset.component === dep.name && asset.target === `${cfg.os}-${cfg.arch}`);
  if (!candidates.length) {
    if (mode === "sdk") throw new Error(`No qualified native SDK for ${dep.name}/${cfg.os}-${cfg.arch}`);
    return;
  }
  const abi = computeNativeSDKABI(cfg, dep);
  const sourceIdentity = nativeSDKSourceIdentity(cfg, dep, source);
  const selected = compatibleNativeSDK(candidates, sourceIdentity, abi, mode === "sdk");
  if (!selected) return;
  if (nativeSDKHash(selected.source) !== nativeSDKHash(source))
    throw new Error("Native SDK source repository/commit mismatch");
  return selected;
}

const selectedRoots = new WeakMap<Config, Map<string, string>>();
export function nativeSDKSourceRoot(cfg: Config, name: string): string | undefined {
  return selectedRoots.get(cfg)?.get(name);
}
export function registerNativeSDKRoot(cfg: Config, name: string, root: string): void {
  let selected = selectedRoots.get(cfg);
  if (!selected) selectedRoots.set(cfg, (selected = new Map()));
  selected.set(name, join(root, "source"));
}

export async function verifyNativeSDKDirectory(directory: string, asset: NativeSDKAsset): Promise<void> {
  validateNativeSDKAsset(asset);
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Native SDK root must be a real directory");
  for await (const member of new Bun.Glob("**/*").scan({
    cwd: directory,
    onlyFiles: false,
    dot: true,
    followSymlinks: false,
  })) {
    const name = member.replaceAll("\\", "/");
    const info = await lstat(join(directory, member));
    if (info.isSymbolicLink() || (!info.isDirectory() && name !== "bun-native-sdk.json" && !asset.files[name]))
      throw new Error("Native SDK contains an unregistered member or symbolic link");
  }
  const receiptFile = join(directory, "bun-native-sdk.json");
  const info = await lstat(receiptFile);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 16 * 1024 ** 2)
    throw new Error("Native SDK receipt is not a bounded regular file");
  const receipt = await Bun.file(receiptFile).json();
  const { asset: _distribution, ...expected } = asset;
  // The factory may retain additional provenance fields in its receipt.
  for (const [key, value] of Object.entries(expected)) {
    if (nativeSDKHash(receipt[key]) !== nativeSDKHash(value)) throw new Error(`Native SDK receipt mismatch: ${key}`);
  }
  let total = 0;
  for (const [name, hash] of Object.entries(asset.files)) {
    let current = directory;
    for (const part of name.split("/")) {
      current = join(current, part);
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) throw new Error("Native SDK members cannot traverse symbolic links");
    }
    const entry = await lstat(current);
    total += entry.size;
    if (!entry.isFile() || total > 2 * 1024 ** 3) throw new Error("Native SDK member/expanded size mismatch");
    const hasher = new Bun.CryptoHasher("sha256");
    for await (const chunk of Bun.file(current).stream()) hasher.update(chunk);
    if (hasher.digest("hex") !== hash) throw new Error(`Native SDK member checksum mismatch: ${name}`);
  }
}

export async function fetchNativeSDK(descriptor: string, directory: string): Promise<void> {
  if (![descriptor, directory].every(isAbsolute)) throw new Error("Native SDK paths must be absolute");
  if (Bun.file(descriptor).size > 16 * 1024 ** 2) throw new Error("Native SDK descriptor exceeded its bound");
  const asset = (await Bun.file(descriptor).json()) as NativeSDKAsset;
  validateNativeSDKAsset(asset);
  if (existsSync(directory)) return verifyNativeSDKDirectory(directory, asset);
  const staging = `${directory}.${process.pid}.${crypto.randomUUID()}.staging`;
  const archiveFile = `${staging}.zip`;
  await mkdir(resolve(directory, ".."), { recursive: true });
  await mkdir(staging, { recursive: false });
  try {
    await downloadWithRetry(
      asset.asset.url,
      archiveFile,
      asset.component,
      undefined,
      AbortSignal.timeout(120_000),
      asset.asset,
    );
    const members = await new Bun.Archive(await Bun.file(archiveFile).arrayBuffer()).files();
    let bytes = 0;
    if (members.size !== Object.keys(asset.files).length + 1)
      throw new Error("Native SDK archive member count mismatch");
    for (const [name, member] of members) {
      if (!nativeSDKMember(name) || (name !== "bun-native-sdk.json" && !asset.files[name]))
        throw new Error("Native SDK archive contains an unregistered member");
      bytes += member.size;
      if (bytes > 2 * 1024 ** 3) throw new Error("Native SDK expanded budget exceeded");
      const path = join(staging, name);
      await mkdir(resolve(path, ".."), { recursive: true });
      await Bun.write(path, member);
    }
    await verifyNativeSDKDirectory(staging, asset);
    try {
      await rename(staging, directory);
    } catch (error) {
      if (!existsSync(directory)) throw error;
      await verifyNativeSDKDirectory(directory, asset);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(archiveFile, { force: true });
  }
}
