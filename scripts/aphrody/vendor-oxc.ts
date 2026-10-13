import { chmod, lstat, mkdir, readlink, symlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

export const OXC_REVISION = "b25696441c80fd580c35d671797f1940c642a624";
const RECEIPT = ".bun-vendor.json";
const FORBIDDEN = new Set([".git", ".aphrody", ".codex", ".claude", "cookies", "credentials", "sessions"]);
const ROOT_OUTPUTS = new Set(["node_modules", "target"]);

type Entry = { path: string; mode: string; blob: string; size: number; link?: string };
type Receipt = {
  schema: 1;
  revision: string;
  archiveSha256: string;
  files: (Entry & { sha256: string })[];
};
export type VendorOptions = {
  workspace: string;
  source: string;
  target: string;
  revision?: string;
  resumeIncomplete?: boolean;
};

function hash(data: Uint8Array, algorithm: "sha1" | "sha256" = "sha256") {
  return new Bun.CryptoHasher(algorithm).update(data).digest("hex");
}
function gitBlob(data: Uint8Array) {
  return new Bun.CryptoHasher("sha1").update(`blob ${data.byteLength}\0`).update(data).digest("hex");
}
async function git(source: string, args: string[]): Promise<Uint8Array> {
  const proc = Bun.spawn(["git", "-C", source, ...args], { stdout: "pipe", stderr: "pipe" });
  const [bytes, stderr, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    Bun.readableStreamToText(proc.stderr),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`Git ${args[0]} failed: ${stderr.trim()}`);
  return new Uint8Array(bytes);
}
function safePath(path: string) {
  const segments = path.split("/");
  if (
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.includes("\0") ||
    /^[a-z]:/i.test(path) ||
    ROOT_OUTPUTS.has(segments[0]!) ||
    segments.some(segment => !segment || segment === "." || segment === ".." || FORBIDDEN.has(segment))
  ) {
    throw new Error(`Unsafe tracked source path: ${path}`);
  }
}
async function exists(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
async function targetFor(options: VendorOptions) {
  const workspace = resolve(options.workspace);
  const target = resolve(options.target);
  if (target !== resolve(workspace, "vendor/oxc")) throw new Error("Target must be the selected workspace vendor/oxc");
  for (const path of [workspace, resolve(workspace, "vendor"), target]) {
    if ((await exists(path))?.isSymbolicLink()) throw new Error(`Symlink target boundary: ${path}`);
  }
  return target;
}

export async function vendorPlan(options: VendorOptions) {
  const target = await targetFor(options);
  const revision = options.revision ?? OXC_REVISION;
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Revision must be an exact lowercase 40-character Git SHA");
  const resolved = new TextDecoder()
    .decode(await git(resolve(options.source), ["rev-parse", `${revision}^{commit}`]))
    .trim();
  if (resolved !== revision) throw new Error("Resolved revision differs from the requested immutable commit");
  const tree = new TextDecoder("utf-8", { fatal: true }).decode(
    await git(resolve(options.source), ["ls-tree", "-rlz", revision]),
  );
  const entries: Entry[] = [];
  const nativeNames = new Set<string>();
  for (const row of tree.split("\0").filter(Boolean)) {
    const at = row.indexOf("\t");
    const path = row.slice(at + 1);
    const [mode, type, blob, length] = row.slice(0, at).trim().split(/\s+/);
    safePath(path);
    if (process.platform === "win32") {
      const nativeName = path.toLowerCase();
      if (nativeNames.has(nativeName))
        throw new Error(`Case-colliding source requires a qualified case-sensitive host: ${path}`);
      nativeNames.add(nativeName);
      if (
        path
          .split("/")
          .some(
            segment =>
              /[<>:"|?*]|[. ]$/.test(segment) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
          )
      ) {
        throw new Error(`Source filename requires a qualified host: ${path}`);
      }
    }
    if (
      !mode ||
      type !== "blob" ||
      !blob ||
      !/^[a-f0-9]{40}$/.test(blob) ||
      length === undefined ||
      !["100644", "100755", "120000"].includes(mode)
    )
      throw new Error(`Unsupported Git entry: ${path}`);
    const size = Number(length);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Invalid blob size: ${path}`);
    const entry: Entry = { path, mode, blob, size };
    if (mode === "120000") {
      entry.link = new TextDecoder("utf-8", { fatal: true }).decode(
        await git(resolve(options.source), ["cat-file", "blob", blob]),
      );
      if (!entry.link || isAbsolute(entry.link) || /^[a-z]:/i.test(entry.link) || entry.link.includes("\\"))
        throw new Error(`Unsafe source symlink: ${path}`);
      safePath(
        relative(target, resolve(dirname(resolve(target, path)), entry.link))
          .split("\\")
          .join("/"),
      );
    }
    entries.push(entry);
  }
  entries.sort((a, b) => a.path.localeCompare(b.path, "en"));
  if (!entries.some(entry => /^LICENSE(?:\.[^/]*)?$/.test(entry.path)))
    throw new Error("Tracked root license is required");
  const bytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (bytes > 512 * 1024 * 1024) throw new Error("Tracked source exceeds the 512 MiB archive budget");
  return {
    revision,
    source: resolve(options.source),
    target,
    trackedFiles: entries.length,
    bytes,
    symlinks: entries.filter(entry => entry.link).length,
    entries,
  };
}

async function verifyFiles(target: string, entries: Entry[]) {
  const declared = new Set(entries.map(entry => entry.path));
  for await (const path of new Bun.Glob("**").scan({
    cwd: target,
    dot: true,
    onlyFiles: false,
    followSymlinks: false,
  })) {
    const normalized = path.split("\\").join("/");
    const stat = await lstat(resolve(target, path));
    if (stat.isDirectory()) continue;
    if (!declared.has(normalized) && normalized !== RECEIPT && normalized !== ".ref")
      throw new Error(`Unexpected vendor output: ${normalized}`);
  }
  const files: Receipt["files"] = [];
  for (const entry of entries) {
    const path = resolve(target, entry.path);
    let parent = dirname(path);
    while (parent !== target) {
      if ((await lstat(parent)).isSymbolicLink()) throw new Error(`Symlink source parent: ${entry.path}`);
      parent = dirname(parent);
    }
    const stat = await lstat(path);
    if (entry.link === undefined ? !stat.isFile() : !stat.isSymbolicLink())
      throw new Error(`Entry type differs: ${entry.path}`);
    const data =
      entry.link === undefined
        ? new Uint8Array(await Bun.file(path).arrayBuffer())
        : new TextEncoder().encode(
            process.platform === "win32" ? (await readlink(path)).split("\\").join("/") : await readlink(path),
          );
    if (data.length !== entry.size || gitBlob(data) !== entry.blob)
      throw new Error(`Tracked source integrity differs: ${entry.path}`);
    files.push({ ...entry, sha256: hash(data) });
  }
  return files;
}

export async function verifyVendorReceipt(targetPath: string, revision = OXC_REVISION) {
  const target = resolve(targetPath);
  if ((await lstat(target)).isSymbolicLink()) throw new Error("Vendor target must not be a symlink");
  const receiptPath = resolve(target, RECEIPT);
  const stat = await lstat(receiptPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Vendor receipt must be a regular file");
  const receipt = (await Bun.file(receiptPath).json()) as Receipt;
  if (
    receipt.schema !== 1 || receipt.revision !== revision ||
    !/^[a-f0-9]{64}$/.test(receipt.archiveSha256) ||
    !Array.isArray(receipt.files) || !receipt.files.length
  )
    throw new Error("Vendor receipt is not the requested immutable source");
  const seen = new Set<string>();
  let bytes = 0;
  for (const entry of receipt.files) {
    safePath(entry.path);
    const name = process.platform === "win32" ? entry.path.toLowerCase() : entry.path;
    if (seen.has(name)) throw new Error(`Duplicate vendor source: ${entry.path}`);
    seen.add(name);
    if (
      !["100644", "100755", "120000"].includes(entry.mode) ||
      !/^[a-f0-9]{40}$/.test(entry.blob) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.size) || entry.size < 0 ||
      (entry.mode === "120000") !== (typeof entry.link === "string")
    ) throw new Error(`Invalid vendor source receipt: ${entry.path}`);
    bytes += entry.size;
    if (entry.link !== undefined) {
      if (!entry.link || isAbsolute(entry.link) || /^[a-z]:/i.test(entry.link) || entry.link.includes("\\"))
        throw new Error(`Unsafe source symlink: ${entry.path}`);
      safePath(relative(target, resolve(dirname(resolve(target, entry.path)), entry.link)).split("\\").join("/"));
    }
  }
  if (bytes > 512 * 1024 * 1024 || !receipt.files.some(entry => /^LICENSE(?:\.[^/]*)?$/.test(entry.path)))
    throw new Error("Invalid vendor source scope");
  const stamp = await exists(resolve(target, ".ref"));
  if (stamp && (!stamp.isFile() || stamp.isSymbolicLink())) throw new Error("Vendor stamp must be a regular file");
  const files = await verifyFiles(target, receipt.files);
  if (JSON.stringify(files) !== JSON.stringify(receipt.files)) throw new Error("Vendor receipt content hashes differ");
  return receipt;
}

async function writeTrackedBlobs(source: string, target: string, entries: Entry[]) {
  const regular = entries.filter(entry => entry.link === undefined);
  const proc = Bun.spawn(["git", "-C", source, "cat-file", "--batch"], {
    stdin: new Blob([regular.map(entry => entry.blob + "\n").join("")]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [buffer, stderr, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    Bun.readableStreamToText(proc.stderr),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`Git blob export failed: ${stderr.trim()}`);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  for (const entry of regular) {
    const end = bytes.indexOf(10, offset);
    const header = new TextDecoder().decode(bytes.subarray(offset, end));
    if (end < offset || header !== `${entry.blob} blob ${entry.size}`)
      throw new Error(`Git blob header differs: ${entry.path}`);
    offset = end + 1;
    const data = bytes.subarray(offset, offset + entry.size);
    if (data.length !== entry.size || gitBlob(data) !== entry.blob)
      throw new Error(`Git blob export differs: ${entry.path}`);
    const path = resolve(target, entry.path);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, data);
    if (process.platform !== "win32") await chmod(path, entry.mode === "100755" ? 0o755 : 0o644);
    offset += entry.size;
    if (bytes[offset++] !== 10) throw new Error(`Git blob separator differs: ${entry.path}`);
  }
  if (offset !== bytes.length) throw new Error("Unexpected trailing Git blob data");
}

async function ensureTrackedLinks(target: string, entries: Entry[]) {
  for (const entry of entries.filter(entry => entry.link !== undefined)) {
    const path = resolve(target, entry.path);
    let parent = dirname(path);
    while (parent !== target) {
      if ((await lstat(parent)).isSymbolicLink()) throw new Error(`Symlink source parent: ${entry.path}`);
      parent = dirname(parent);
    }
    if (!(await exists(path))) await symlink(entry.link!, path, "file");
  }
}

export async function vendorApply(options: VendorOptions) {
  const plan = await vendorPlan(options);
  if (await exists(plan.target)) {
    const receiptPath = resolve(plan.target, RECEIPT);
    const receiptStat = await exists(receiptPath);
    if (!receiptStat && options.resumeIncomplete) {
      await ensureTrackedLinks(plan.target, plan.entries);
      const files = await verifyFiles(plan.target, plan.entries);
      const archiveSha256 = hash(await git(plan.source, ["archive", "--format=tar", plan.revision]));
      const receipt: Receipt = { schema: 1, revision: plan.revision, archiveSha256, files };
      await Bun.write(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
      return { ...plan, unchanged: false, archiveSha256, resumed: true };
    }
    if (!receiptStat)
      throw new Error(
        "Existing vendor output has no receipt; use explicit --resume-incomplete to verify without overwriting",
      );
    if (receiptStat.isSymbolicLink()) throw new Error("Vendor receipt must not be a symlink");
    const receipt = (await Bun.file(receiptPath).json()) as Receipt;
    if (receipt.schema !== 1 || receipt.revision !== plan.revision)
      throw new Error("Existing vendor target is not the requested immutable source; no overwrite performed");
    const files = await verifyFiles(plan.target, plan.entries);
    if (JSON.stringify(files) !== JSON.stringify(receipt.files))
      throw new Error("Existing vendor receipt differs from tracked content");
    return { ...plan, unchanged: true, archiveSha256: receipt.archiveSha256 };
  }
  const archive = await git(plan.source, ["archive", "--format=tar", plan.revision]);
  if (archive.length > 600 * 1024 * 1024) throw new Error("Archive exceeds the extraction budget");
  await mkdir(dirname(plan.target), { recursive: true });
  await mkdir(plan.target);
  await writeTrackedBlobs(plan.source, plan.target, plan.entries);
  await ensureTrackedLinks(plan.target, plan.entries);
  const files = await verifyFiles(plan.target, plan.entries);
  const archiveSha256 = hash(archive);
  const receipt: Receipt = { schema: 1, revision: plan.revision, archiveSha256, files };
  await Bun.write(resolve(plan.target, RECEIPT), JSON.stringify(receipt, null, 2) + "\n");
  return { ...plan, unchanged: false, archiveSha256 };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      workspace: { type: "string", default: resolve(import.meta.dir, "../..") },
      source: { type: "string" },
      target: { type: "string" },
      revision: { type: "string" },
      "resume-incomplete": { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
    },
  });
  if (!values.source || !values.target)
    throw new Error("Provide --source Git checkout and --target <workspace>/vendor/oxc; default is plan-only");
  const options = {
    workspace: values.workspace!,
    source: values.source,
    target: values.target,
    ...(values.revision === undefined ? {} : { revision: values.revision }),
    resumeIncomplete: values["resume-incomplete"],
  };
  const result = values.apply ? await vendorApply(options) : await vendorPlan(options);
  const { entries: _entries, ...summary } = result;
  console.log(JSON.stringify(summary, null, 2));
}
