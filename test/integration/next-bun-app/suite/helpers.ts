// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A fresh temporary directory, removed by the returned disposer. */
export async function tempDir(
  prefix = "next-bun-app-",
): Promise<{ dir: string; [Symbol.asyncDispose](): Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return { dir, [Symbol.asyncDispose]: () => rm(dir, { recursive: true, force: true }) };
}
