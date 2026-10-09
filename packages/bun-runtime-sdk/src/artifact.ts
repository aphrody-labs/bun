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
import { Runtime, EXPECTED_ABI_MAJOR, RuntimeError, Status, type LoadOptions } from "./index";
import { SUPPORTED_TARGETS, hostTarget } from "./target";
import { runtimeHome } from "./paths.ts";

export { SUPPORTED_TARGETS, hostTarget, runtimeHome };

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
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ArtifactManifest;
  if (manifest.schema !== 1) throw new Error(`Unsupported manifest schema ${manifest.schema}`);
  if (manifest.compatibility.abiMajor !== EXPECTED_ABI_MAJOR) {
    throw new RuntimeError(
      Status.AbiMismatch,
      `artifact ABI major ${manifest.compatibility.abiMajor}, SDK needs ${EXPECTED_ABI_MAJOR}`,
    );
  }
  if (manifest.target !== hostTarget()) {
    throw new Error(`Artifact targets ${manifest.target}, this host is ${hostTarget()}`);
  }
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
  const manifest = (await Bun.file(join(dir, "manifest.json")).json()) as ArtifactManifest;
  if (manifest.schema !== 1) throw new Error(`Unsupported manifest schema ${manifest.schema}`);
  if (manifest.compatibility?.abiMajor !== EXPECTED_ABI_MAJOR) {
    throw new RuntimeError(
      Status.AbiMismatch,
      `artifact ABI major ${manifest.compatibility?.abiMajor}, SDK needs ${EXPECTED_ABI_MAJOR}`,
    );
  }
  if (manifest.target !== hostTarget())
    throw new Error(`Artifact targets ${manifest.target}, this host is ${hostTarget()}`);
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
  return Runtime.load({ ...options, libraryPath: join(dir, libraryFileName(manifest)) });
}

export async function loadArtifactAsync(dir: string, options: Omit<LoadOptions, "libraryPath"> = {}): Promise<Runtime> {
  const manifest = await verifyArtifactAsync(dir);
  return Runtime.load({ ...options, libraryPath: join(dir, libraryFileName(manifest)) });
}

/** The active installed artifact directory of this host, if any. */
export function installedArtifactDir(): string | undefined {
  const current = join(runtimeHome(), hostTarget(), "current");
  return existsSync(current) ? current : undefined;
}
