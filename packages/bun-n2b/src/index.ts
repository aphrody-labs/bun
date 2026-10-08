// @aphrody/bun-plugin-n2b: Node.js to Bun migration analysis and codemods,
// in process through the n2b Rust crates.
//
//   import { scan, transform } from "@aphrody/bun-plugin-n2b";
//   import { n2bPlugin } from "@aphrody/bun-plugin-n2b/plugin";
//   bunx @aphrody/bun-plugin-n2b scan|fix|report|rules|prompt|audit … (the `n2b` CLI)

import { resolve } from "node:path";
import { native, type NativeScanOptions, type NativeTransformResult } from "./native";
import type { Mode, N2BReport } from "./types";

export { n2bPlugin, type N2BPluginOptions } from "./plugin";
export { platformKeys } from "./native";
export type { N2BReport, FileFix, Finding, Context, Mode, Severity } from "./types";

export interface ScanOptions {
  /** `check` (default) reports only; `fix` applies safe autofixes; `aggressive` also applies API migrations. */
  mode?: Mode;
  /** Extra ignore globs. */
  ignore?: string[];
  /** Scan worker threads (1 to 6). */
  jobs?: number;
  /** With `fix`/`aggressive`, compute the fixes without writing files. Defaults to true. */
  dryRun?: boolean;
}

/** Scans the project under `root` and returns the n2b JSON report (schema v2). */
export function scan(root: string, options: ScanOptions = {}): N2BReport {
  const opts: NativeScanOptions = {};
  if (options.mode !== undefined) opts.mode = options.mode;
  if (options.ignore !== undefined) opts.ignore = options.ignore;
  if (options.jobs !== undefined) opts.jobs = options.jobs;
  if (options.dryRun !== undefined) opts.dryRun = options.dryRun;
  return native().scan(resolve(root), opts);
}

export type TransformResult = NativeTransformResult;

/** Applies the Node-to-Bun codemods to one source file in memory. `check` only reports findings. */
export function transform(path: string, source: string, mode: Mode = "fix"): TransformResult {
  return native().transform(path, source, mode);
}

/** Runs the n2b CLI in this process (output goes to stdout/stderr) and returns its exit status. */
export function runCli(args: string[]): number {
  return native().runCli(args);
}

/** Version of the n2b crates compiled into the native addon. */
export function version(): string {
  return native().version();
}
