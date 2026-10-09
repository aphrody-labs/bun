/**
 * Installed-artifact management of the YOLO runtime: install (verified, immutable, previous kept),
 * rollback, list. Layout and rationale in `artifact.ts`; used by `scripts/release/runtime_release.ts` and
 * by `yolo runtime ...` of the standalone CLI.
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { copyFile, lstat, mkdir, readlink, rename, rm, symlink } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { hostTarget, runtimeHome, verifyArtifact, verifyArtifactAsync } from "./artifact";

export interface ReleaseOptions {
  home?: string;
  manifestSha256?: string;
}

async function existing(path: string) {
  return lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
}

async function selected(dir: string, slot: "current" | "previous") {
  const status = await existing(join(dir, slot));
  if (!status) return undefined;
  if (!status.isSymbolicLink()) throw new Error(`Runtime slot ${slot} is not a link`);
  const target = await readlink(join(dir, slot));
  const name = basename(target);
  if (
    !/^\d+\.\d+\.\d+-[a-f0-9]{8}$/.test(name) ||
    (isAbsolute(target) ? resolve(target) !== resolve(dir, name) : target !== name)
  ) {
    throw new Error(`Unsafe runtime slot ${slot}`);
  }
  return name;
}

async function select(dir: string, slot: "current" | "previous", name: string | undefined) {
  const link = join(dir, slot);
  if (!name) {
    if (await existing(link)) await rm(link);
    return;
  }
  const temporary = join(dir, `.${slot}-${crypto.randomUUID()}.tmp`);
  try {
    await symlink(
      process.platform === "win32" ? resolve(dir, name) : name,
      temporary,
      process.platform === "win32" ? "junction" : "dir",
    );
    if (process.platform === "win32" && (await existing(link))) {
      const backup = `${temporary}.previous`;
      await rename(link, backup);
      try {
        await rename(temporary, link);
      } catch (error) {
        await rename(backup, link);
        throw error;
      }
      await rm(backup);
    } else await rename(temporary, link);
  } finally {
    if (await existing(temporary)) await rm(temporary);
  }
}

async function withRelease<T>(options: ReleaseOptions, operation: (dir: string) => Promise<T>): Promise<T> {
  const dir = join(resolve(options.home ?? runtimeHome()), hostTarget());
  await mkdir(dir, { recursive: true });
  const lock = join(dir, ".release.lock");
  await mkdir(lock);
  try {
    return await operation(dir);
  } finally {
    await rm(lock, { recursive: true });
  }
}

async function switchSlots(dir: string, current: string, previous: string | undefined) {
  const oldPrevious = await selected(dir, "previous");
  await select(dir, "previous", previous);
  try {
    await select(dir, "current", current);
  } catch (error) {
    await select(dir, "previous", oldPrevious);
    throw error;
  }
}

export async function installArtifact(source: string, options: ReleaseOptions = {}): Promise<string> {
  const manifestText = await Bun.file(join(source, "manifest.json")).text();
  const manifestDigest = new Bun.CryptoHasher("sha256").update(manifestText).digest("hex");
  if (options.manifestSha256 && options.manifestSha256 !== manifestDigest)
    throw new Error("Runtime manifest changed before installation");
  const manifest = await verifyArtifactAsync(source);
  if (JSON.stringify(manifest) !== JSON.stringify(JSON.parse(manifestText)))
    throw new Error("Runtime manifest changed during verification");
  const library = Object.entries(manifest.files).find(([name]) => /\.(so|dylib|dll)$/.test(name));
  if (!library || !/^\d+\.\d+\.\d+$/.test(manifest.version))
    throw new Error("Runtime artifact lacks a version or library");
  const name = `${manifest.version}-${library[1].sha256.slice(0, 8)}`;
  return withRelease(options, async dir => {
    const destination = join(dir, name);
    const sameManifest = async (directory: string) => {
      await verifyArtifactAsync(directory);
      if ((await Bun.file(join(directory, "manifest.json")).text()) !== manifestText) {
        throw new Error("Installed runtime directory conflicts with the requested artifact");
      }
    };
    if (await existing(destination)) await sameManifest(destination);
    else {
      const staging = `${destination}-${crypto.randomUUID()}.staging`;
      try {
        await mkdir(staging);
        await Promise.all(Object.keys(manifest.files).map(file => copyFile(join(source, file), join(staging, file))));
        await Bun.write(join(staging, "manifest.json"), manifestText);
        await sameManifest(staging);
        await rename(staging, destination);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    }
    const current = await selected(dir, "current");
    if (current !== name) await switchSlots(dir, name, current);
    return name;
  });
}

export async function rollbackArtifact(
  options: ReleaseOptions = {},
): Promise<{ current: string; previous: string | undefined }> {
  return withRelease(options, async dir => {
    const previous = await selected(dir, "previous");
    const current = await selected(dir, "current");
    if (!previous) throw new Error("Nothing to roll back to: no previous artifact");
    await verifyArtifactAsync(join(dir, previous));
    if (options.manifestSha256) {
      const digest = new Bun.CryptoHasher("sha256")
        .update(await Bun.file(join(dir, previous, "manifest.json")).bytes())
        .digest("hex");
      if (digest !== options.manifestSha256) throw new Error("Runtime manifest changed before rollback");
    }
    await switchSlots(dir, previous, current);
    return { current: previous, previous: current };
  });
}

function targetDir(): string {
  return join(runtimeHome(), hostTarget());
}

function point(dir: string, name: "current" | "previous", to: string | undefined): void {
  const link = join(dir, name);
  if (existsSync(link) || isLink(link)) rmSync(link, { force: true });
  if (to === undefined) return;
  const tmp = `${link}.tmp`;
  rmSync(tmp, { force: true });
  symlinkSync(to, tmp, "dir");
  renameSync(tmp, link); // atomic replacement
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function read(dir: string, name: "current" | "previous"): string | undefined {
  const link = join(dir, name);
  return isLink(link) ? readlinkSync(link) : undefined;
}

export function install(source: string): string {
  const manifest = verifyArtifact(source);
  const lib = Object.entries(manifest.files).find(([f]) => /\.(so|dylib|dll)$/.test(f));
  const hash8 = (lib?.[1].sha256 ?? "unknown").slice(0, 8);
  const name = `${manifest.version}-${hash8}`;
  const dir = targetDir();
  mkdirSync(dir, { recursive: true });
  const destination = join(dir, name);
  if (!existsSync(destination)) {
    const staging = `${destination}.staging`;
    rmSync(staging, { recursive: true, force: true });
    cpSync(source, staging, { recursive: true });
    verifyArtifact(staging); // never activate a copy that does not verify
    renameSync(staging, destination);
  }
  const current = read(dir, "current");
  if (current !== name) {
    point(dir, "previous", current);
    point(dir, "current", name);
  }
  return name;
}

export function rollback(): { current: string; previous: string | undefined } {
  const dir = targetDir();
  const previous = read(dir, "previous");
  const current = read(dir, "current");
  if (previous === undefined) throw new Error("Nothing to roll back to: no previous artifact");
  verifyArtifact(join(dir, previous));
  point(dir, "previous", current);
  point(dir, "current", previous);
  return { current: previous, previous: current };
}

export function list(): { name: string; current: boolean; previous: boolean }[] {
  const dir = targetDir();
  if (!existsSync(dir)) return [];
  const current = read(dir, "current");
  const previous = read(dir, "previous");
  return readdirSync(dir)
    .filter(entry => entry !== "current" && entry !== "previous" && !entry.endsWith(".tmp"))
    .toSorted()
    .map(name => ({ name, current: name === current, previous: name === previous }));
}
