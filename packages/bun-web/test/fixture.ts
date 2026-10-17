// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";

/** Writes a Bun script as an executable: a shebang file on POSIX, a .cmd wrapper on Windows. */
export async function writeScript(binary: string, source: string): Promise<string> {
  if (process.platform !== "win32") {
    await writeFile(binary, "#!/usr/bin/env bun\n" + source, { mode: 0o700 });
    return binary;
  }
  await writeFile(binary + ".ts", source);
  await writeFile(binary + ".cmd", `@"${process.execPath}" "${binary}.ts" %*\r\n`);
  return binary + ".cmd";
}
