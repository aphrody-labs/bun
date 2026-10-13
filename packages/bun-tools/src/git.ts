import { isAbsolute } from "node:path";
import { runTool, type ToolRunOptions } from "./process.ts";

/** Git executable backend; this does not expose the placeholder native gix crate as an engine. */
export async function git(args: string[], options: ToolRunOptions = {}) {
  const configured = process.env.BUN_GIT_BIN;
  if (configured && !isAbsolute(configured)) throw new Error("BUN_GIT_BIN must be an absolute executable path");
  const executable = configured ?? Bun.which("git");
  if (!executable) throw new Error("Git backend unavailable; install Git explicitly");
  return runTool(executable, args, options);
}
