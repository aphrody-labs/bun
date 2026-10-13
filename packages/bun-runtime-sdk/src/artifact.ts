/**
 * Artifact verification and the installed-artifact layout:
 *
 *   $BUV_RUNTIME_HOME (default ~/.buv/runtime)/<target>/<version>-<hash8>/{library,header,manifest.json}
 *   $BUV_RUNTIME_HOME/<target>/current    -> active artifact directory
 *   $BUV_RUNTIME_HOME/<target>/previous   -> artifact active before the last install (rollback)
 */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import {
  Runtime,
  EXPECTED_ABI_MAJOR,
  EXPECTED_ABI_MINOR,
  RuntimeError,
  Status,
  type LoadOptions,
  type BuildInfo,
} from "./index";
import { SUPPORTED_TARGETS, hostTarget, type RuntimeTarget, type LinuxABIInfo } from "./target";
import { runtimeHome } from "./paths.ts";

export { SUPPORTED_TARGETS, hostTarget, runtimeHome };
export { targetFor, hostTargetInfo, type RuntimeTarget, type LinuxABI, type HostTargetInfo } from "./target";

export interface ArtifactManifest {
  readonly schema: number;
  readonly name: string;
  readonly version: string;
  readonly target: string;
  readonly abi: string;
  readonly toolchain?: string;
  readonly compatibility: { readonly abiMajor: number };
  readonly files: Readonly<Record<string, { readonly sha256: string; readonly bytes: number }>>;
  readonly capabilities: readonly string[];
  readonly sources: Readonly<Record<string, { readonly rev: string; readonly dirty: boolean }>>;
  readonly build: { readonly panicRecovery: boolean; readonly profile?: string; readonly native: BuildInfo };
  readonly libc?: LinuxABIInfo;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid runtime manifest object");
  return value as Record<string, unknown>;
}

/** Validate a pinned manifest without loading its native library. */
export function validateArtifactManifest(value: unknown, expectedTarget: string = hostTarget()): ArtifactManifest {
  const manifest = object(value);
  if (manifest.schema !== 1) throw new Error("Unsupported runtime manifest schema");
  const producer = manifest.name === "buv-runtime" ? "bun" : manifest.name === "yolo-runtime" ? "yolo" : undefined;
  if (!producer) throw new Error("Unsupported runtime manifest producer");
  if (
    !Object.values(SUPPORTED_TARGETS).includes(manifest.target as RuntimeTarget) ||
    manifest.target !== expectedTarget
  )
    throw new Error(`Artifact target differs from the qualified host ${expectedTarget}`);
  if (manifest.libc !== undefined) {
    const libc = object(manifest.libc);
    const abi = expectedTarget.endsWith("-musl") ? "musl" : "gnu";
    const machine = expectedTarget.startsWith("aarch64-") ? "aarch64" : "x86_64";
    if (
      !expectedTarget.includes("-linux-") ||
      libc.abi !== abi ||
      Object.keys(libc).some(key => !["abi", "version", "source", "loader"].includes(key)) ||
      (abi === "gnu"
        ? libc.source !== "process.report.glibcVersionRuntime" ||
          typeof libc.version !== "string" ||
          !/^\d+\.\d+(?:\.\d+)?$/.test(libc.version) ||
          libc.loader !== undefined
        : libc.source !== "/proc/self/maps" ||
          libc.version !== undefined ||
          typeof libc.loader !== "string" ||
          !libc.loader.startsWith("/") ||
          !libc.loader.endsWith(`${machine}.so.1`))
    )
      throw new Error("Runtime libc metadata differs from its target/probe");
  }
  const abi = typeof manifest.abi === "string" ? /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(manifest.abi) : null;
  if (
    !abi ||
    Number(abi[1]) !== EXPECTED_ABI_MAJOR ||
    Number(abi[2]) < EXPECTED_ABI_MINOR ||
    Number(abi[2]) > 65535 ||
    object(manifest.compatibility).abiMajor !== EXPECTED_ABI_MAJOR
  )
    throw new RuntimeError(Status.AbiMismatch, "Artifact ABI is incompatible with this SDK");
  const source = object(object(manifest.sources)[producer]);
  if (typeof source.rev !== "string" || !/^[a-f0-9]{40}$/.test(source.rev) || source.dirty !== false)
    throw new Error("Clean pinned runtime producer revision required");
  const build = object(manifest.build),
    native = object(build.native);
  if (
    build.panicRecovery !== true ||
    native.panic_recovery !== true ||
    native.name !== manifest.name ||
    native.target !== manifest.target ||
    native.abi !== manifest.abi ||
    native.version !== manifest.version ||
    typeof native.rustc !== "string" ||
    !native.rustc.startsWith("rustc ") ||
    typeof native.git_rev !== "string" ||
    !/^[a-f0-9]{12,40}$/.test(native.git_rev) ||
    !source.rev.startsWith(native.git_rev)
  )
    throw new Error("Native build identity differs from its runtime manifest");
  if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.+-]+)?$/.test(manifest.version))
    throw new Error("Invalid runtime version");
  if (
    !Array.isArray(manifest.capabilities) ||
    !manifest.capabilities.length ||
    manifest.capabilities.some(item => typeof item !== "string" || !/^[a-zA-Z0-9_.-]{1,128}$/.test(item)) ||
    new Set(manifest.capabilities).size !== manifest.capabilities.length
  )
    throw new Error("Invalid runtime capability manifest");
  if (
    Number(abi[2]) >= 6 &&
    !["process.stdin", "process.wait"].every(capability => (manifest.capabilities as string[]).includes(capability))
  )
    throw new Error("ABI 1.6 pipe/wait capabilities required");
  const files = object(manifest.files);
  if (!Object.keys(files).length || Object.keys(files).length > 64) throw new Error("Invalid runtime file manifest");
  for (const [name, raw] of Object.entries(files)) {
    const file = object(raw);
    if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name === "." || name === "..")
      throw new Error("Unsafe runtime manifest path");
    if (
      typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      typeof file.bytes !== "number" ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes <= 0
    )
      throw new Error("Invalid runtime file digest/size");
  }
  const accepted = manifest as unknown as ArtifactManifest;
  const library = libraryFileName(accepted);
  const extension = expectedTarget.includes("windows") ? ".dll" : expectedTarget.includes("darwin") ? ".dylib" : ".so";
  if (!library.endsWith(extension) || !["yolo_runtime.h", "aphrody.h"].some(header => header in files))
    throw new Error("Runtime library/header differs from its target");
  return accepted;
}

/** The hash-verified native module must attest the same source, target and capabilities. */
export function verifyRuntimeIdentity(
  runtime: Pick<Runtime, "buildInfo" | "capabilities">,
  manifest: ArtifactManifest,
): void {
  const observed = runtime.buildInfo(),
    expected = manifest.build.native;
  for (const key of ["name", "version", "abi", "target", "rustc", "git_rev", "panic_recovery"] as const)
    if (observed[key] !== expected[key]) throw new Error(`Loaded runtime identity differs: ${key}`);
  const actual = [...runtime.capabilities()].sort(),
    declared = [...manifest.capabilities].sort();
  if (actual.length !== declared.length || actual.some((value, index) => value !== declared[index]))
    throw new Error("Loaded runtime capabilities differ from its manifest");
}

const sha256 = (bytes: Uint8Array): string => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

export function libraryFileName(manifest: ArtifactManifest): string {
  const names = Object.keys(manifest.files).filter(f => /\.(so|dylib|dll)$/.test(f));
  if (names.length !== 1) throw new Error("manifest must list exactly one runtime shared library");
  return names[0]!;
}

/**
 * Verifies an artifact directory: manifest schema, target, ABI major and the SHA-256 of every
 * listed file. Throws before any native code is loaded.
 */
export function verifyArtifact(dir: string): ArtifactManifest {
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`No manifest.json in ${dir}`);
  const manifest = validateArtifactManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  for (const [file, expected] of Object.entries(manifest.files)) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(file) || file === "." || file === "..")
      throw new Error("Unsafe runtime manifest path");
    const path = join(dir, file);
    if (!existsSync(path)) throw new Error(`Artifact file missing: ${file}`);
    const status = lstatSync(path);
    if (!status.isFile() || status.size !== expected.bytes) throw new Error(`Runtime file size differs: ${file}`);
    const actual = sha256(new Uint8Array(readFileSync(path)));
    if (actual !== expected.sha256) {
      throw new Error(`Hash mismatch for ${file}: expected ${expected.sha256}, got ${actual}`);
    }
  }
  return manifest;
}

export async function verifyArtifactAsync(dir: string): Promise<ArtifactManifest> {
  const manifest = validateArtifactManifest(await Bun.file(join(dir, "manifest.json")).json());
  await Promise.all(
    Object.entries(manifest.files).map(async ([name, expected]) => {
      if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name === "." || name === "..")
        throw new Error("Unsafe runtime manifest path");
      const file = join(dir, name);
      const status = await lstat(file);
      if (!status.isFile() || status.size !== expected.bytes) throw new Error(`Runtime file size differs: ${name}`);
      const hash = new Bun.CryptoHasher("sha256");
      for await (const chunk of Bun.file(file).stream()) hash.update(chunk);
      if (hash.digest("hex") !== expected.sha256) throw new Error(`Hash mismatch for ${name}`);
    }),
  );
  return manifest;
}

/** Loads a verified artifact directory. */
export function loadArtifact(dir: string, options: Omit<LoadOptions, "libraryPath"> = {}): Runtime {
  const manifest = verifyArtifact(dir);
  const runtime = Runtime.load({ ...options, libraryPath: join(dir, libraryFileName(manifest)) });
  try {
    verifyRuntimeIdentity(runtime, manifest);
    return runtime;
  } catch (error) {
    runtime.close();
    throw error;
  }
}

export async function loadArtifactAsync(dir: string, options: Omit<LoadOptions, "libraryPath"> = {}): Promise<Runtime> {
  const manifest = await verifyArtifactAsync(dir);
  const runtime = Runtime.load({ ...options, libraryPath: join(dir, libraryFileName(manifest)) });
  try {
    verifyRuntimeIdentity(runtime, manifest);
    return runtime;
  } catch (error) {
    runtime.close();
    throw error;
  }
}

/** The active installed artifact directory of this host, if any. */
export function installedArtifactDir(): string | undefined {
  const current = join(runtimeHome(), hostTarget(), "current");
  return existsSync(current) ? current : undefined;
}
