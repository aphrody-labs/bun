import { mkdir, chmod, lstat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const CEF_RS_UPSTREAM_REVISION = "163744c8286d5f593d89202c7807751a7898db28";
export const CEF_RS_REVISION = "d8b49626cf49b3554dae146025176e6b23048cc0";
const root = resolve(import.meta.dir, "../..");
const target = join(root, "src/browser/cef-rs");
const receiptPath = join(target, ".bun-vendor.json");
const sha256 = (data: Uint8Array) => new Bun.CryptoHasher("sha256").update(data).digest("hex");

export function validateCEFSourcePath(path: string): void {
  if (
    !path ||
    isAbsolute(path) ||
    /^[a-z]:/i.test(path) ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some(part => !part || part === "." || part === ".." || part === ".git")
  ) {
    throw new Error(`Invalid cef-rs source path: ${path}`);
  }
}

export async function verifyCEF_RS(directory = target, revision = CEF_RS_REVISION) {
  const receipt = await Bun.file(join(directory, ".bun-vendor.json")).json();
  if (receipt.schema !== 1 || receipt.revision !== revision || !receipt.files.length)
    throw new Error("cef-rs source receipt mismatch");
  for (const entry of receipt.files) {
    validateCEFSourcePath(entry.path);
    const file = join(directory, entry.path);
    if ((await lstat(file)).isSymbolicLink()) throw new Error(`cef-rs source is a symlink: ${entry.path}`);
    const data = await Bun.file(file).bytes();
    if (data.length !== entry.size || sha256(data) !== entry.sha256)
      throw new Error(`cef-rs source drift: ${entry.path}`);
  }
  return { revision: receipt.revision, files: receipt.files.length };
}

async function importSource() {
  const response = await fetch(
    `https://api.github.com/repos/aphrody-labs/cef-rs/git/trees/${CEF_RS_REVISION}?recursive=1`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error(`cef-rs Git tree fetch failed (${response.status})`);
  const tree = (await response.json()) as {
    truncated: boolean;
    tree: { path: string; mode: string; type: string; sha: string; size: number }[];
  };
  if (tree.truncated) throw new Error("cef-rs Git tree is incomplete");
  const archive = await fetch(`https://codeload.github.com/aphrody-labs/cef-rs/tar.gz/${CEF_RS_REVISION}`, {
    signal: AbortSignal.timeout(120000),
  });
  if (!archive.ok) throw new Error(`cef-rs source archive fetch failed (${archive.status})`);
  const bytes = new Uint8Array(await archive.arrayBuffer());
  if (bytes.length > 150 * 1024 * 1024) throw new Error("cef-rs source archive exceeds budget");
  const files = await new Bun.Archive(bytes).files();
  const prefix = `cef-rs-${CEF_RS_REVISION}/`;
  const receiptFiles: { path: string; mode: string; blob: string; size: number; sha256: string }[] = [];
  for (const entry of tree.tree.filter(entry => entry.type !== "tree")) {
    validateCEFSourcePath(entry.path);
    if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode))
      throw new Error(`Unsupported cef-rs entry: ${entry.path}`);
    const file = files.get(prefix + entry.path);
    if (!file) throw new Error(`cef-rs archive entry missing: ${entry.path}`);
    const data = await file.bytes();
    const blob = new Bun.CryptoHasher("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
    if (blob !== entry.sha || data.length !== entry.size)
      throw new Error(`cef-rs archive entry mismatch: ${entry.path}`);
    const output = join(target, entry.path);
    if (await Bun.file(output).exists()) {
      if (sha256(await Bun.file(output).bytes()) !== sha256(data))
        throw new Error(`Refusing cef-rs source overwrite: ${entry.path}`);
    } else {
      await mkdir(dirname(output), { recursive: true });
      await Bun.write(output, data);
    }
    if (process.platform !== "win32") await chmod(output, entry.mode === "100755" ? 0o755 : 0o644);
    receiptFiles.push({ path: entry.path, mode: entry.mode, blob: entry.sha, size: data.length, sha256: sha256(data) });
  }
  await Bun.write(
    receiptPath,
    JSON.stringify(
      {
        schema: 1,
        upstream: "https://github.com/tauri-apps/cef-rs",
        fork: "https://github.com/aphrody-labs/cef-rs",
        upstreamRevision: CEF_RS_UPSTREAM_REVISION,
        revision: CEF_RS_REVISION,
        archiveSha256: sha256(bytes),
        files: receiptFiles,
      },
      null,
      2,
    ) + "\n",
  );
  return verifyCEF_RS();
}

if (import.meta.main) {
  if (Bun.argv.includes("--import")) console.log(JSON.stringify(await importSource()));
  else console.log(JSON.stringify(await verifyCEF_RS()));
}
