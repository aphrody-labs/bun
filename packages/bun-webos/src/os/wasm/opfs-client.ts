// SPDX-License-Identifier: Apache-2.0
import type { Vfs } from "./vfs-client";

const MAX_BYTES = 16 * 1024 * 1024;
export function opfsParts(path: string): string[] {
  const parts = path.replace(/^\//, "").split("/");
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        part.includes("\\") ||
        Array.from(part).some((char) => char.charCodeAt(0) < 32),
    )
  )
    throw new Error("Invalid browser file path");
  return parts;
}

async function fileHandle(path: string, create: boolean): Promise<FileSystemFileHandle> {
  const parts = opfsParts(path);
  let directory = await (
    await navigator.storage.getDirectory()
  ).getDirectoryHandle("bun-webos-files", { create: true });
  for (const part of parts.slice(0, -1))
    directory = await directory.getDirectoryHandle(part, { create });
  return directory.getFileHandle(parts.at(-1)!, { create });
}

export const browserVfs: Vfs = {
  async exists(path) {
    try {
      await fileHandle(path, false);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return false;
      throw error;
    }
  },
  async size(path) {
    return (await (await fileHandle(path, false)).getFile()).size;
  },
  async read(path) {
    const file = await (await fileHandle(path, false)).getFile();
    if (file.size > MAX_BYTES) throw new Error("Browser file exceeds 16 MiB");
    return new Uint8Array(await file.arrayBuffer());
  },
  async write(path, bytes) {
    if (bytes.byteLength > MAX_BYTES) throw new Error("Browser file exceeds 16 MiB");
    const writer = await (await fileHandle(path, true)).createWritable();
    try {
      await writer.write(new Uint8Array(bytes));
      await writer.close();
    } catch (error) {
      await writer.abort();
      throw error;
    }
  },
};
