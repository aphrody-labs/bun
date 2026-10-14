import { lstatSync } from "node:fs";
import { isAbsolute } from "node:path";

/** Read an explicitly selected protected reference; never include its contents in diagnostics. */
export async function protectedReference(path: string | undefined): Promise<string> {
  if (!path || !isAbsolute(path)) throw new TypeError("Expected an explicit protected file reference");
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 4096)
    throw new TypeError("Invalid protected file reference");
  const bytes = await Bun.file(path).arrayBuffer();
  if (bytes.byteLength < 1 || bytes.byteLength > 4096) throw new TypeError("Invalid protected file reference");
  const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
  if (!value || /[\r\n\0]/.test(value)) throw new TypeError("Invalid protected file reference");
  return value;
}
