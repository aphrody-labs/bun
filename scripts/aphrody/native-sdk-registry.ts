#!/usr/bin/env bun
/**
 * Vendored dependencies from the npm registry instead of a source build (scripts/build/deps/README.md).
 *
 *   bun scripts/aphrody/native-sdk-registry.ts pack    --build build/release [--out DIR] [--deps zlib,zstd]
 *   bun scripts/aphrody/native-sdk-registry.ts publish --out DIR [--dry-run]
 *   bun scripts/aphrody/native-sdk-registry.ts record  --out DIR
 *   bun scripts/aphrody/native-sdk-registry.ts status  --build build/release
 *
 * `pack` takes a build whose bun is linked, runs native-sdk-smoke.ts with it, then turns every direct
 * C/C++ dependency it compiled into `@aphrody/bun-native-sdk-<dep>-<target>@0.0.0-c<commit>.a<id>`.
 * `publish` puts those tarballs on the registry (NPM_TOKEN, else ~/.npmrc; already published versions
 * are skipped). `record` writes their pins into scripts/build/native-sdk-index.json, after which
 * `bun bd` downloads each matching dependency instead of compiling it.
 */
import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hashSDKFile } from "../../packages/bun-video/src/sdk";
import { bunExeName, type Config } from "../build/config";
import { configOf, type ConfigureInput } from "../build/configure";
import { allDeps } from "../build/deps";
import {
  nativeSDKHash,
  nativeSDKPackageName,
  selectNativeSDK,
  validateNativeSDKAsset,
  type NativeSDKAsset,
} from "../build/native-sdk";
import { ensureNinja } from "../build/ninja-release";
import { depSource, depSourceDir, type Dependency } from "../build/source";
import { mediaSDKTool, mediaSourceTree } from "./media-sdk-source";
import { packageNativeSDK, type NativeSDKGate } from "./native-sdk-factory";

const ROOT = resolve(import.meta.dir, "..", "..");
const INDEX = join(ROOT, "scripts", "build", "native-sdk-index.json");
const SMOKE = join(import.meta.dir, "native-sdk-smoke.ts");
export const REGISTRY = "https://registry.npmjs.org";
export const SMOKE_EXPECTED = {
  zlib: true,
  libdeflate: true,
  zstd: true,
  brotli: true,
  boringssl: true,
  libarchive: true,
  sqlite: true,
};

/** npm `os`/`cpu`/`libc` of a build, so a registry client installs only the matching target. */
export function npmPlatform(cfg: Pick<Config, "os" | "arch" | "abi">) {
  const os = cfg.os === "windows" ? "win32" : cfg.os;
  const cpu = cfg.arch === "aarch64" ? "arm64" : cfg.arch;
  return { os: [os], cpu: [cpu], ...(cfg.os === "linux" ? { libc: [cfg.abi === "musl" ? "musl" : "glibc"] } : {}) };
}

/** Prerelease identifiers must not be all digits with a leading zero, hence the letter prefixes. */
export function nativeSDKVersion(commit: string, identity: string): string {
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{16,64}$/.test(identity))
    throw new TypeError("Native SDK version needs a commit and an identity");
  return `0.0.0-c${commit.slice(0, 12)}.a${identity.slice(0, 16)}`;
}

export function nativeSDKTarballURL(name: string, version: string, registry = REGISTRY): string {
  return `${registry}/${name}/-/${name.split("/")[1]}-${version}.tgz`;
}

/** Index entries keyed by component, target and ABI; a newer pack of the same key replaces the old one. */
export function mergeNativeSDKIndex(current: readonly NativeSDKAsset[], added: readonly NativeSDKAsset[]) {
  const key = (asset: NativeSDKAsset) => `${asset.component}\0${asset.target}\0${nativeSDKHash(asset.buildABI)}`;
  const merged = new Map(current.map(asset => [key(asset), asset]));
  for (const asset of added) {
    validateNativeSDKAsset(asset);
    merged.set(key(asset), asset);
  }
  return [...merged.values()].sort(
    (a, b) => a.component.localeCompare(b.component) || a.target.localeCompare(b.target),
  );
}

/** Direct C/C++ dependencies of a configured build that a native SDK can replace. */
export function packableDeps(cfg: Config, only?: readonly string[]): Dependency[] {
  return allDeps.filter(
    dep =>
      (!dep.enabled || dep.enabled(cfg)) &&
      !cfg.localDeps[dep.name] &&
      depSource(cfg, dep).kind === "github-archive" &&
      dep.build(cfg).kind === "direct" &&
      !dep.provides(cfg).sources?.length &&
      (!only || only.includes(dep.name)),
  );
}

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

async function configured(build: string) {
  const input = (await Bun.file(join(build, "configure.json")).json()) as ConfigureInput;
  return configOf(input).cfg;
}

async function pack(build: string, out: string, only?: string[]) {
  const cfg = await configured(build);
  if (resolve(cfg.buildDir) !== build) throw new Error(`${build} was configured as ${cfg.buildDir}`);
  if (!cfg.canRunOnHost) throw new Error("pack runs the linked bun: build for this host");
  const exe = join(build, bunExeName(cfg) + cfg.exeSuffix);
  if (!existsSync(exe)) throw new Error(`${exe} is missing: build bun first`);
  const deps = packableDeps(cfg, only);
  if (!deps.length) throw new Error("No direct dependency to pack");
  const ninja = await ensureNinja(cfg);
  const pending = (await mediaSDKTool([ninja, "-n", ...deps.map(dep => dep.name)], build)).trim();
  if (pending !== "ninja: no work to do.") throw new Error(`Dependencies are not up to date in ${build}`);

  const smoke = await mediaSDKTool([exe, SMOKE], ROOT, 120_000, { ...process.env, BUN_DEBUG_QUIET_LOGS: "1" });
  const result = JSON.parse(smoke.trim().split("\n").at(-1)!);
  if (nativeSDKHash(result) !== nativeSDKHash(SMOKE_EXPECTED))
    throw new Error(`native-sdk-smoke.ts failed with ${exe}: ${smoke.trim()}`);
  const evidence = [
    `bun:${await hashSDKFile(exe)}`,
    `smoke:${new Bun.CryptoHasher("sha256").update(smoke).digest("hex")}`,
  ];
  const configureSHA256 = await hashSDKFile(join(build, "configure.json"));
  const ninjaSHA256 = await hashSDKFile(join(build, "build.ninja"));
  const platform = npmPlatform(cfg);
  const packed: string[] = [];

  for (const dep of deps) {
    if (existsSync(join(build, "native-sdk", `${dep.name}.json`))) {
      console.log(`skip ${dep.name}: this build already downloads it`);
      continue;
    }
    const source = depSource(cfg, dep);
    if (source.kind !== "github-archive") continue;
    const work = join(out, dep.name);
    await rm(work, { recursive: true, force: true });
    await mkdir(work, { recursive: true });
    const sourceDir = depSourceDir(cfg, dep.name);
    const receiptFile = join(out, `${dep.name}.source.json`);
    await Bun.write(
      receiptFile,
      JSON.stringify({
        schema: 1,
        component: dep.name,
        repository: source.repo,
        commit: source.commit,
        ref: (await Bun.file(join(sourceDir, ".ref")).text()).trim(),
        sourceTreeSHA256: (await mediaSourceTree(sourceDir)).sourceTreeSHA256,
      }),
    );
    const gate: NativeSDKGate = {
      schema: 1,
      nativeLink: "passed",
      runtimeQualification: "native-tests-passed",
      configureSHA256,
      ninjaSHA256,
      sourceReceiptSHA256: await hashSDKFile(receiptFile),
      evidence,
    };
    const gateFile = join(out, `${dep.name}.gate.json`);
    await Bun.write(gateFile, JSON.stringify(gate, null, 2) + "\n");
    const zipped = await packageNativeSDK(dep.name, build, join(work, "zip"), gateFile);
    const distribution = (await Bun.file(join(work, "zip", "distribution.json")).json()) as NativeSDKAsset;

    const name = nativeSDKPackageName(dep.name, cfg.os, cfg.arch, cfg.abi);
    // Same SDK archive, same version and tarball: a repack never republishes other bytes under a version.
    const version = nativeSDKVersion(source.commit, await hashSDKFile(zipped.output));
    const entries: Record<string, Bun.ArchiveEntry> = {
      "package/package.json": {
        data: JSON.stringify(
          {
            name,
            version,
            description: `Prebuilt ${dep.name} (${source.repo}@${source.commit.slice(0, 12)}) for the Aphrody Bun build`,
            license: "SEE LICENSE IN licenses",
            repository: { type: "git", url: "git+https://github.com/aphrody-labs/bun.git" },
            ...platform,
            publishConfig: { access: "public" },
          },
          null,
          2,
        ),
        mode: 0o644,
        mtime: 0,
      },
    };
    for (const [member, file] of await new Bun.Archive(await Bun.file(zipped.output).bytes()).files())
      entries[`package/${member}`] = { data: await file.bytes(), mode: 0o644, mtime: 0 };
    const tarball = join(work, `${name.split("/")[1]}-${version}.tgz`);
    await Bun.write(tarball, await new Bun.Archive(entries, { compress: "gzip", mtime: 0 }).blob());
    const asset: NativeSDKAsset = {
      ...distribution,
      asset: {
        url: nativeSDKTarballURL(name, version),
        sha256: await hashSDKFile(tarball),
        bytes: Bun.file(tarball).size,
        format: "npm",
      },
    };
    validateNativeSDKAsset(asset);
    await Bun.write(join(work, "asset.json"), JSON.stringify({ name, version, tarball, asset }, null, 2) + "\n");
    await rm(join(work, "zip"), { recursive: true, force: true });
    packed.push(`${name}@${version}`);
    console.log(`packed ${name}@${version} (${(asset.asset.bytes / 1024 ** 2).toFixed(1)} MiB)`);
  }
  return packed;
}

type Packed = { name: string; version: string; tarball: string; asset: NativeSDKAsset };
async function packedIn(out: string): Promise<Packed[]> {
  const found: Packed[] = [];
  for (const entry of readdirSync(out, { withFileTypes: true }))
    if (entry.isDirectory() && existsSync(join(out, entry.name, "asset.json")))
      found.push(await Bun.file(join(out, entry.name, "asset.json")).json());
  if (!found.length) throw new Error(`No packed native SDK in ${out}`);
  return found;
}

async function isPublished(name: string, version: string): Promise<boolean> {
  const response = await fetch(`${REGISTRY}/${name}/${version}`, { signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`registry ${name}@${version}: HTTP ${response.status}`);
  return true;
}

async function publish(out: string, dryRun: boolean) {
  for (const { name, version, tarball } of await packedIn(out)) {
    if (await isPublished(name, version)) {
      console.log(`skip ${name}@${version}: already on the registry`);
      continue;
    }
    const cwd = resolve(tarball, "..");
    if (process.env.NPM_TOKEN) await Bun.write(join(cwd, ".npmrc"), "//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n");
    console.log(`${dryRun ? "dry-run" : "publish"} ${name}@${version}`);
    await using child = Bun.spawn(
      [process.execPath, "publish", tarball, "--access", "public", ...(dryRun ? ["--dry-run"] : [])],
      { cwd, stdio: ["ignore", "inherit", "inherit"], timeout: 600_000 },
    );
    if ((await child.exited) !== 0) throw new Error(`bun publish ${name}@${version} failed`);
  }
}

/** Only what the registry serves byte for byte enters the index: a missing pin would fail every build. */
export async function verifyPublished(asset: NativeSDKAsset, url = asset.asset.url): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}; publish it first`);
  const bytes = await response.bytes();
  const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== asset.asset.bytes || sha256 !== asset.asset.sha256)
    throw new Error(`${url} differs from the packed tarball`);
}

async function record(out: string) {
  const index = (await Bun.file(INDEX).json()) as { schema: 1; assets: NativeSDKAsset[] };
  const added = (await packedIn(out)).map(packed => packed.asset);
  for (const asset of added) await verifyPublished(asset);
  index.assets = mergeNativeSDKIndex(index.assets, added);
  await Bun.write(INDEX, JSON.stringify(index, null, 2) + "\n");
  console.log(`${added.length} asset(s) recorded, ${index.assets.length} in ${INDEX}`);
}

async function status(build: string) {
  const cfg = await configured(build);
  for (const dep of packableDeps(cfg)) {
    let state: string;
    try {
      const asset = selectNativeSDK(cfg, dep, depSource(cfg, dep));
      state = asset ? `registry ${asset.asset.url}` : "source build (no matching asset)";
    } catch (error) {
      state = `error: ${(error as Error).message}`;
    }
    console.log(`${dep.name.padEnd(16)} ${state}`);
  }
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  const build = option(args, "--build");
  const out = option(args, "--out");
  if (command === "pack") {
    if (!build) throw new TypeError("pack needs --build <dir>");
    const dir = resolve(build);
    await pack(dir, resolve(out ?? join(dir, "native-sdk-registry")), option(args, "--deps")?.split(","));
  } else if (command === "publish" && out) await publish(resolve(out), args.includes("--dry-run"));
  else if (command === "record" && out) await record(resolve(out));
  else if (command === "status" && build) await status(resolve(build));
  else {
    console.error("usage: native-sdk-registry.ts pack|publish|record|status (see the header of this file)");
    process.exit(2);
  }
}
