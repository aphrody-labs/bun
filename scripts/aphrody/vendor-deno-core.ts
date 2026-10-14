import { lstat, mkdir, chmod } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const DENO_CORE_UPSTREAM_REVISION = "0c071246a412575e07423263404a5d13e7ed6aa2";
export const DENO_CORE_REVISION = "f6897bfa654d11de09325faa963c4570b7d0de5e";
export const DENO_CORE_REPOSITORY = "aphrody-labs/deno_core";
const root = resolve(import.meta.dir, "../..");
const target = join(root, "src/browser/deno-core");
const prefixes = ["libs/core/", "libs/ops/", "libs/serde_v8/", "libs/deno_v8/"];
const hash = (data: Uint8Array) => new Bun.CryptoHasher("sha256").update(data).digest("hex");

export function denoSourcePath(path: string): boolean {
  if (
    !path ||
    isAbsolute(path) ||
    /^[a-z]:/i.test(path) ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some(part => !part || part === "." || part === ".." || part === ".git")
  )
    throw new Error(`Invalid Deno source path: ${path}`);
  return path === "Cargo.toml" || path === "LICENSE.md" || prefixes.some(prefix => path.startsWith(prefix));
}

export async function verifyDenoCore(directory = target) {
  if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink())
    throw new Error("Deno source owner is not a directory");
  if (!(await lstat(join(directory, ".bun-vendor.json"))).isFile())
    throw new Error("Deno source receipt is not a regular file");
  const receipt = await Bun.file(join(directory, ".bun-vendor.json")).json();
  if (
    receipt.schema !== 1 ||
    receipt.repository !== DENO_CORE_REPOSITORY ||
    receipt.revision !== DENO_CORE_REVISION ||
    receipt.upstreamRevision !== DENO_CORE_UPSTREAM_REVISION ||
    !/^[0-9a-f]{64}$/.test(receipt.archiveSha256) ||
    !Array.isArray(receipt.files) ||
    !receipt.files.length
  )
    throw new Error("Deno core source receipt mismatch");
  const seen = new Set<string>();
  const directories = new Set<string>([""]);
  for (const entry of receipt.files) {
    if (
      !denoSourcePath(entry.path) ||
      seen.has(entry.path) ||
      !["100644", "100755"].includes(entry.mode) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      !/^[0-9a-f]{40}$/.test(entry.blob) ||
      !/^[0-9a-f]{64}$/.test(entry.sha256)
    )
      throw new Error("Invalid Deno core receipt entry");
    seen.add(entry.path);
    const parts = entry.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join("/");
      if (directories.has(parent)) continue;
      const status = await lstat(join(directory, parent));
      if (!status.isDirectory() || status.isSymbolicLink())
        throw new Error(`Deno source parent is a symlink: ${parent}`);
      directories.add(parent);
    }
    const file = join(directory, entry.path);
    if (!(await lstat(file)).isFile()) throw new Error(`Deno source is not a regular file: ${entry.path}`);
    const bytes = await Bun.file(file).bytes();
    const blob = new Bun.CryptoHasher("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (bytes.length !== entry.size || hash(bytes) !== entry.sha256 || blob !== entry.blob)
      throw new Error(`Deno core source drift: ${entry.path}`);
  }
  for (const required of ["Cargo.toml", "LICENSE.md", ...prefixes.map(prefix => prefix + "Cargo.toml")])
    if (!seen.has(required)) throw new Error(`Deno core source absent: ${required}`);
  for (const path of new Bun.Glob("**/*").scanSync({ cwd: directory, dot: true, onlyFiles: false }))
    if (
      path.replaceAll("\\", "/") !== ".bun-vendor.json" &&
      !seen.has(path.replaceAll("\\", "/")) &&
      !directories.has(path.replaceAll("\\", "/"))
    )
      throw new Error(`Unexpected Deno core source: ${path}`);
  return { revision: receipt.revision, files: receipt.files.length };
}

export async function importDenoCore() {
  let exists = false;
  try {
    const status = await lstat(target);
    if (!status.isDirectory() || status.isSymbolicLink()) throw new Error("Deno source owner is not a directory");
    exists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (exists) return verifyDenoCore();
  const response = await fetch(
    `https://api.github.com/repos/${DENO_CORE_REPOSITORY}/git/trees/${DENO_CORE_REVISION}?recursive=1`,
    {
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok) throw new Error(`Deno source tree fetch failed (${response.status})`);
  const tree = (await response.json()) as {
    truncated: boolean;
    tree: { path: string; mode: string; type: string; sha: string; size: number }[];
  };
  if (tree.truncated) throw new Error("Deno source tree is incomplete");
  const entries = tree.tree.filter(entry => entry.type !== "tree" && denoSourcePath(entry.path));
  if (entries.some(entry => entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)))
    throw new Error("Unsupported entry in Deno core source closure");
  const archiveResponse = await fetch(
    `https://codeload.github.com/${DENO_CORE_REPOSITORY}/tar.gz/${DENO_CORE_REVISION}`,
    {
      signal: AbortSignal.timeout(120000),
    },
  );
  if (!archiveResponse.ok) throw new Error(`Deno source archive fetch failed (${archiveResponse.status})`);
  const archiveBytes = new Uint8Array(await archiveResponse.arrayBuffer());
  if (archiveBytes.length > 150 * 1024 * 1024) throw new Error("Deno source archive exceeds budget");
  const archive = await new Bun.Archive(archiveBytes).files();
  const prefix = `deno_core-${DENO_CORE_REVISION}/`;
  const verified: { entry: (typeof entries)[number]; bytes: Uint8Array }[] = [];
  for (const entry of entries) {
    const file = archive.get(prefix + entry.path);
    if (!file) throw new Error(`Deno archive source absent: ${entry.path}`);
    const bytes = await file.bytes();
    const blob = new Bun.CryptoHasher("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (blob !== entry.sha || bytes.length !== entry.size)
      throw new Error(`Deno archive source differs: ${entry.path}`);
    verified.push({ entry, bytes });
  }
  // Validate the entire selected Git tree before creating the source owner.
  await mkdir(dirname(target), { recursive: true });
  if ((await lstat(dirname(target))).isSymbolicLink()) throw new Error("Deno source parent is a symlink");
  await mkdir(target);
  const receiptFiles: { path: string; mode: string; blob: string; size: number; sha256: string }[] = [];
  for (const { entry, bytes } of verified) {
    const path = join(target, entry.path);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, bytes);
    await chmod(path, entry.mode === "100755" ? 0o755 : 0o644);
    receiptFiles.push({ path: entry.path, mode: entry.mode, blob: entry.sha, size: bytes.length, sha256: hash(bytes) });
  }
  await Bun.write(
    join(target, ".bun-vendor.json"),
    JSON.stringify(
      {
        schema: 1,
        repository: DENO_CORE_REPOSITORY,
        revision: DENO_CORE_REVISION,
        upstreamRevision: DENO_CORE_UPSTREAM_REVISION,
        archiveSha256: hash(archiveBytes),
        files: receiptFiles,
      },
      null,
      2,
    ) + "\n",
  );
  return verifyDenoCore();
}

if (import.meta.main)
  console.log(JSON.stringify(await (Bun.argv.includes("--import") ? importDenoCore() : verifyDenoCore())));
