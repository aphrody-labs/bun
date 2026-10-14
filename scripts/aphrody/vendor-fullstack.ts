import { chmod, lstat, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const FULLSTACK_SOURCES = [
  {
    name: "axum",
    upstream: "tokio-rs/axum",
    fork: "aphrody-labs/axum",
    tag: "axum-v0.8.9",
    revision: "c59208c86fded335cd85e388030ad59347b0e5ae",
  },
  {
    name: "leptos",
    upstream: "leptos-rs/leptos",
    fork: "aphrody-labs/leptos",
    tag: "v0.8.22",
    revision: "7ec903d4008ddf7679e771863f7b8b90f5cdebde",
  },
] as const;
type Source = (typeof FULLSTACK_SOURCES)[number];
type Entry = { path: string; mode: string; type: string; sha: string; size?: number };
type FileReceipt = { path: string; mode: string; blob: string; size: number; sha256: string };
const root = resolve(import.meta.dir, "../..");
const sha256 = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
export const gitBlob = (bytes: Uint8Array) =>
  new Bun.CryptoHasher("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

export function validateSourcePath(path: string): void {
  if (
    !path ||
    isAbsolute(path) ||
    /^[a-z]:/i.test(path) ||
    path.includes(":") ||
    path.includes("\\") ||
    path.includes("\0") ||
    path
      .split("/")
      .some(
        part =>
          !part ||
          part === "." ||
          part === ".." ||
          part.toLowerCase() === ".git" ||
          /[<>:"|?*]/.test(part) ||
          [...part].some(character => character.charCodeAt(0) < 32) ||
          /[. ]$/.test(part) ||
          /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part),
      )
  )
    throw new Error(`Invalid fullstack source path: ${path}`);
}

async function github(path: string, raw = false): Promise<Uint8Array> {
  const proc = Bun.spawn(["gh", "api", path, ...(raw ? ["-H", "Accept: application/vnd.github.raw+json"] : [])], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30000,
    windowsHide: true,
  });
  const [bytes, error, code] = await Promise.all([
    new Response(proc.stdout).bytes(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`GitHub source fetch failed: ${error}`);
  return bytes;
}

async function checkAncestors(workspace: string, file: string, checked: Set<string>): Promise<void> {
  const path = relative(workspace, dirname(file));
  if (isAbsolute(path) || path.split(sep).includes("..")) throw new Error("Source path leaves workspace");
  let cursor = workspace;
  for (const part of ["", ...path.split(sep)]) {
    cursor = join(cursor, part);
    if (checked.has(cursor)) continue;
    try {
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe source ancestor: ${cursor}`);
      checked.add(cursor);
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") break;
      throw error;
    }
  }
}

async function regularFile(file: string): Promise<boolean> {
  try {
    const stat = await lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Unsafe source file: ${file}`);
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return false;
    throw error;
  }
}

function receiptPath(source: Source, workspace: string): string {
  return join(workspace, "docs/project", `${source.name}-source.json`);
}

export async function verifySource(source: Source, workspace = root) {
  const checked = new Set<string>();
  const metadata = receiptPath(source, workspace);
  await checkAncestors(workspace, metadata, checked);
  await regularFile(metadata);
  const receipt = await Bun.file(metadata).json();
  if (
    receipt.schema !== "bun.fullstack-source/1" ||
    receipt.revision !== source.revision ||
    receipt.fork !== source.fork ||
    !receipt.files.length
  )
    throw new Error(`${source.name} source receipt mismatch`);
  const target = join(workspace, "vendor", source.name);
  const expected = new Set<string>();
  for (const entry of receipt.files as FileReceipt[]) {
    validateSourcePath(entry.path);
    if (expected.has(entry.path)) throw new Error(`Duplicate source receipt: ${entry.path}`);
    expected.add(entry.path);
    const file = join(target, entry.path);
    await checkAncestors(workspace, file, checked);
    await regularFile(file);
    const bytes = await Bun.file(file).bytes();
    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256 || gitBlob(bytes) !== entry.blob)
      throw new Error(`${source.name} source drift: ${entry.path}`);
  }
  for await (const path of new Bun.Glob("**/*").scan({ cwd: target, dot: true, onlyFiles: false })) {
    const stat = await lstat(join(target, path));
    if (stat.isSymbolicLink()) throw new Error(`Unexpected source symlink: ${path}`);
    if (!stat.isDirectory() && !expected.has(path.replaceAll("\\", "/")))
      throw new Error(`Untracked source file: ${path}`);
  }
  return { name: source.name, revision: source.revision, files: expected.size };
}

async function importSource(source: Source) {
  const [treeBytes, response] = await Promise.all([
    github(`repos/${source.fork}/git/trees/${source.revision}?recursive=1`),
    fetch(`https://codeload.github.com/${source.fork}/tar.gz/${source.revision}`, {
      signal: AbortSignal.timeout(120000),
    }),
  ]);
  if (!response.ok) throw new Error(`${source.name} archive fetch failed (${response.status})`);
  const tree = JSON.parse(new TextDecoder().decode(treeBytes)) as { sha: string; truncated: boolean; tree: Entry[] };
  if (tree.sha !== source.revision || tree.truncated || !tree.tree.length)
    throw new Error(`${source.name} Git tree is incomplete`);
  const archive = new Uint8Array(await response.arrayBuffer());
  if (archive.length > 100 * 1024 * 1024) throw new Error("Fullstack archive exceeds budget");
  const files = await new Bun.Archive(archive).files();
  const prefix = `${source.name}-${source.revision}/`;
  const entries: Array<{ entry: Entry; bytes: Uint8Array }> = [];
  const names = new Set<string>();
  for (const entry of tree.tree.filter(entry => entry.type !== "tree")) {
    validateSourcePath(entry.path);
    if (entry.type !== "blob" || !["100644", "100755", "120000"].includes(entry.mode))
      throw new Error(`Unsupported source entry: ${entry.path}`);
    const folded = entry.path.toLowerCase();
    if (names.has(folded)) throw new Error(`Source path collision: ${entry.path}`);
    names.add(folded);
    // Preserve link blobs as text, without following paths outside the imported tree.
    const bytes =
      entry.mode === "120000"
        ? await github(`repos/${source.fork}/git/blobs/${entry.sha}`, true)
        : await files.get(prefix + entry.path)?.bytes();
    if (!bytes || gitBlob(bytes) !== entry.sha || bytes.length !== entry.size)
      throw new Error(`${source.name} archive blob mismatch: ${entry.path}`);
    entries.push({ entry, bytes });
  }
  const target = join(root, "vendor", source.name);
  const checked = new Set<string>();
  const metadata = receiptPath(source, root);
  await checkAncestors(root, metadata, checked);
  await regularFile(metadata);
  for (const { entry, bytes } of entries) {
    const output = join(target, entry.path);
    await checkAncestors(root, output, checked);
    if (await regularFile(output)) {
      if (sha256(await Bun.file(output).bytes()) !== sha256(bytes))
        throw new Error(`Refusing source overwrite: ${entry.path}`);
    }
  }
  const receipts: FileReceipt[] = [];
  for (const { entry, bytes } of entries) {
    const output = join(target, entry.path);
    if (!(await regularFile(output))) {
      await mkdir(dirname(output), { recursive: true });
      await Bun.write(output, bytes);
    }
    if (process.platform !== "win32") await chmod(output, entry.mode === "100755" ? 0o755 : 0o644);
    receipts.push({ path: entry.path, mode: entry.mode, blob: entry.sha, size: bytes.length, sha256: sha256(bytes) });
  }
  await Bun.write(
    receiptPath(source, root),
    JSON.stringify(
      {
        schema: "bun.fullstack-source/1",
        ...source,
        license: "MIT",
        linkRepresentation: "git-blob-text",
        archiveSha256: sha256(archive),
        files: receipts,
      },
      null,
      2,
    ) + "\n",
  );
  return verifySource(source);
}

if (import.meta.main) {
  for (const source of FULLSTACK_SOURCES)
    console.log(JSON.stringify(await (Bun.argv.includes("--import") ? importSource(source) : verifySource(source))));
}
