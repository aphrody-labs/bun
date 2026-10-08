// Programmatic access to the n2b CLI subcommands whose output is text on
// stdout. Each call runs `bin/n2b.ts` in a child Bun process and captures it.

import { join } from "node:path";
import type { Mode, N2BReport } from "./types";

const BIN = join(import.meta.dir, "..", "bin", "n2b.ts");

export interface N2BError extends Error {
  stderr: string;
  code: number;
}

async function run(args: string[], cwd?: string) {
  await using proc = Bun.spawn([process.execPath, BIN, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
    ...(cwd === undefined ? {} : { cwd }),
  });
  const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, code };
}

function fail(what: string, stderr: string, code: number): N2BError {
  const err = new Error(`n2b ${what} failed (exit ${code})\n${stderr.trim()}`) as N2BError;
  err.stderr = stderr;
  err.code = code;
  return err;
}

/** `n2b <root> --report=json [--fix|--aggressive]`. Exit 1 (findings in check mode) is not an error. */
export async function scan(
  root: string,
  opts: { mode?: Mode; ignore?: string[]; cwd?: string } = {},
): Promise<N2BReport> {
  const args = [root, "--report=json"];
  if (opts.mode === "fix") args.push("--fix");
  else if (opts.mode === "aggressive") args.push("--aggressive");
  for (const glob of opts.ignore ?? []) args.push(`--ignore=${glob}`);
  const { stdout, stderr, code } = await run(args, opts.cwd);
  if (code !== 0 && code !== 1) throw fail("scan", stderr, code);
  return JSON.parse(stdout) as N2BReport;
}

/** `n2b rules --report=json`: the rule catalogue. */
export async function rules(): Promise<unknown> {
  const { stdout, stderr, code } = await run(["rules", "--report=json"]);
  if (code !== 0) throw fail("rules", stderr, code);
  return JSON.parse(stdout);
}

/** `n2b prompt <root>`: a Markdown migration prompt for an LLM. */
export async function promptMarkdown(root: string): Promise<string> {
  const { stdout, stderr, code } = await run(["prompt", root]);
  if (code !== 0) throw fail("prompt", stderr, code);
  return stdout;
}
