// SPDX-License-Identifier: Apache-2.0
/**
 * Files app backend over the WebOS home (`root`). Every path is relative to it and resolved through
 * realpath, so `..` and links never leave the home. Reads hash with `Bun.hash`, render Markdown with
 * `Bun.markdown.html`, searches run `Bun.Glob`, and a folder downloads as a `Bun.Archive` tar.gz.
 */
import { lstat, mkdir, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

export interface VfsEntry {
  name: string;
  kind: "file" | "dir" | "symlink" | "other";
  size: number;
  mtimeMs: number;
}

export class VfsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const READ_LIMIT = 1 << 20;
const ARCHIVE_LIMIT = 64 << 20;
const SEARCH_LIMIT = 500;

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

/** WebOS path (`/`, `/notes/a.md`, `notes`) → absolute host path inside `root`, links resolved. */
export async function resolveInRoot(root: string, path: string, { mustExist = true } = {}): Promise<string> {
  if (path.includes("\0")) throw new VfsError("invalid path", 400);
  const base = await realpath(root);
  const candidate = resolve(base, `.${sep}${path.replace(/^[/\\]+/, "")}`);
  if (!inside(base, candidate)) throw new VfsError(`${path} is outside the WebOS home`, 403);
  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    if (mustExist) throw new VfsError(`${path}: no such file or directory`, 404);
    real = join(await realpath(dirname(candidate)).catch(() => dirname(candidate)), basename(candidate));
  }
  if (!inside(base, real)) throw new VfsError(`${path} leads outside the WebOS home`, 403);
  return real;
}

/** Host path → WebOS path (`/` separated, rooted at the home). */
export function toWebPath(root: string, abs: string): string {
  return `/${relative(root, abs).split(sep).join("/")}`.replace(/\/$/, "") || "/";
}

export async function listDir(root: string, path: string): Promise<{ path: string; entries: VfsEntry[] }> {
  const dir = await resolveInRoot(root, path);
  const names = await readdir(dir);
  const entries = await Promise.all(
    names.map(async (name): Promise<VfsEntry> => {
      const st = await lstat(join(dir, name)).catch(() => null);
      const kind = !st
        ? "other"
        : st.isSymbolicLink()
          ? "symlink"
          : st.isDirectory()
            ? "dir"
            : st.isFile()
              ? "file"
              : "other";
      return { name, kind, size: st?.size ?? 0, mtimeMs: st?.mtimeMs ?? 0 };
    }),
  );
  entries.sort((a, b) => Number(b.kind === "dir") - Number(a.kind === "dir") || a.name.localeCompare(b.name));
  return { path: toWebPath(await realpath(root), dir), entries };
}

export interface VfsFile {
  path: string;
  size: number;
  /** `Bun.hash` (wyhash) of the bytes, hex. */
  hash: string;
  text: string | null;
  /** `Bun.markdown.html` of a .md file. */
  html: string | null;
  truncated: boolean;
}

export async function readFile(root: string, path: string): Promise<VfsFile> {
  const abs = await resolveInRoot(root, path);
  const file = Bun.file(abs);
  const size = file.size;
  const bytes = new Uint8Array(await file.slice(0, READ_LIMIT).arrayBuffer());
  const binary = bytes.subarray(0, 8192).includes(0);
  const text = binary ? null : new TextDecoder().decode(bytes);
  const md = text !== null && /^\.(md|markdown)$/i.test(extname(abs));
  return {
    path: toWebPath(await realpath(root), abs),
    size,
    hash: Bun.hash(bytes).toString(16),
    text,
    html: md ? Bun.markdown.html(text) : null,
    truncated: size > READ_LIMIT,
  };
}

export async function writeFile(root: string, path: string, data: Uint8Array | string): Promise<number> {
  const abs = await resolveInRoot(root, path, { mustExist: false });
  await mkdir(dirname(abs), { recursive: true });
  return Bun.write(abs, data);
}

export async function makeDir(root: string, path: string): Promise<void> {
  await mkdir(await resolveInRoot(root, path, { mustExist: false }), { recursive: true });
}

export async function remove(root: string, path: string): Promise<void> {
  const abs = await resolveInRoot(root, path);
  if (abs === (await realpath(root))) throw new VfsError("refusing to remove the WebOS home", 403);
  await rm(abs, { recursive: true });
}

export async function move(root: string, from: string, to: string): Promise<void> {
  await rename(await resolveInRoot(root, from), await resolveInRoot(root, to, { mustExist: false }));
}

/** `Bun.Glob` over a directory of the home; at most SEARCH_LIMIT matches. */
export async function search(
  root: string,
  path: string,
  pattern: string,
): Promise<{ matches: string[]; truncated: boolean }> {
  const dir = await resolveInRoot(root, path);
  const base = await realpath(root);
  const matches: string[] = [];
  for await (const rel of new Bun.Glob(pattern).scan({
    cwd: dir,
    dot: false,
    onlyFiles: false,
    followSymlinks: false,
  })) {
    if (matches.length === SEARCH_LIMIT) return { matches, truncated: true };
    matches.push(toWebPath(base, join(dir, rel)));
  }
  return { matches, truncated: false };
}

/** A directory of the home as a gzip tarball built by `Bun.Archive`. */
export async function archiveDir(root: string, path: string): Promise<{ name: string; blob: Blob }> {
  const dir = await resolveInRoot(root, path);
  if (!(await stat(dir)).isDirectory()) throw new VfsError(`${path} is not a directory`, 400);
  const entries: Record<string, Blob> = {};
  let total = 0;
  for await (const rel of new Bun.Glob("**/*").scan({ cwd: dir, dot: true, onlyFiles: true, followSymlinks: false })) {
    const file = Bun.file(join(dir, rel));
    total += file.size;
    if (total > ARCHIVE_LIMIT) throw new VfsError(`${path} is larger than ${ARCHIVE_LIMIT >> 20} MiB`, 413);
    entries[rel.split(sep).join("/")] = file;
  }
  const blob = await new Bun.Archive(entries, { compress: "gzip" }).blob();
  return { name: `${basename(dir) || "home"}.tar.gz`, blob };
}
