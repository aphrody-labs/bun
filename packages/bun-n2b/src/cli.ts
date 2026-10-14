// Programmatic access to the n2b CLI's reports through the native owner.

import { resolve } from "node:path";
import { scan as scanProject } from "./index";
import { native } from "./native";
import type { Mode, N2BReport } from "./types";

export interface N2BError extends Error {
  stderr: string;
  code: number;
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
  opts: {
    mode?: Mode;
    ignore?: string[];
    cwd?: string;
    jobs?: number;
    since?: string;
    dryRun?: boolean;
    submodules?: boolean;
    maxFiles?: number;
    maxReportBytes?: number;
  } = {},
): Promise<N2BReport> {
  try {
    return scanProject(resolve(opts.cwd ?? process.cwd(), root), { ...opts, dryRun: opts.dryRun ?? false });
  } catch (error) {
    throw fail("scan", `n2b: ${error instanceof Error ? error.message : String(error)}\n`, 2);
  }
}

/** `n2b rules --report=json`: the rule catalogue. */
export async function rules(): Promise<unknown> {
  try {
    return native().rules();
  } catch (error) {
    throw fail("rules", `n2b: ${error instanceof Error ? error.message : String(error)}\n`, 2);
  }
}

/** `n2b prompt <root>`: a Markdown migration prompt for an LLM. */
export async function promptMarkdown(root: string): Promise<string> {
  try {
    return native().promptMarkdown(resolve(root));
  } catch (error) {
    throw fail("prompt", `n2b: ${error instanceof Error ? error.message : String(error)}\n`, 2);
  }
}
