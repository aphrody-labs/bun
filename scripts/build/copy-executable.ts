import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { unlockRunningExe } from "./lock";

export function copyExecutable(input: string, output: string): void {
  if (resolve(input) === resolve(output)) throw new Error("Executable copy needs distinct paths");
  // A process can start after configure unlocked the destination.
  unlockRunningExe(output);
  copyFileSync(input, output);
}

if (import.meta.main) {
  const [input, output] = Bun.argv.slice(2);
  if (!input || !output || Bun.argv.length !== 4) throw new Error("Usage: copy-executable.ts <input> <output>");
  copyExecutable(input, output);
}
