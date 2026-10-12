import { dirname, isAbsolute, relative, sep } from "node:path";
import { mkdir } from "node:fs/promises";

export const indexingProvenance = {
  repository: "https://github.com/aphrody-labs/omar",
  revision: "d565a5a67d570e3648c091c351698781fb24bf54",
  upstreamLicense: "No license file was present in the pinned source; migration authorized by the repository owner.",
} as const;

export function positiveInteger(name: string, value: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new RangeError(`${name} must be an integer between 1 and ${maximum}`);
  return value;
}

export function absolutePath(name: string, value: string): string {
  if (!isAbsolute(value)) throw new TypeError(`${name} must be absolute`);
  return value;
}

export function within(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

export async function prepareDatabase(path: string): Promise<void> {
  absolutePath("dbPath", path);
  await mkdir(dirname(path), { recursive: true });
}
