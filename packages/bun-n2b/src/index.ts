// @aphrody/bun-plugin-n2b: Node.js to Bun migration analysis and codemods,
// in process through the n2b Rust crates.
//
//   import { scan, transform } from "@aphrody/bun-plugin-n2b";
//   import { n2bPlugin } from "@aphrody/bun-plugin-n2b/plugin";
//   bun n2b <root> [--fix] [--report=json] (the native CLI)

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
  /** Incremental scan: only files changed since this git ref (`<ref>...HEAD`, local edits, untracked files) plus root manifests. */
  since?: string;
  /** Include initialized nested Git repositories/submodules. Defaults to false. */
  submodules?: boolean;
  /** Maximum eligible files processed. Defaults to 100000. */
  maxFiles?: number;
  /** Retained scan/report byte limit. Defaults to 64 MiB. */
  maxReportBytes?: number;
}

/** Scans the project under `root` and returns the n2b JSON report (schema v2). */
export function scan(root: string, options: ScanOptions = {}): N2BReport {
  const opts: NativeScanOptions = {};
  if (options.mode !== undefined) opts.mode = options.mode;
  if (options.ignore !== undefined) opts.ignore = options.ignore;
  if (options.jobs !== undefined) opts.jobs = options.jobs;
  if (options.dryRun !== undefined) opts.dryRun = options.dryRun;
  if (options.since !== undefined) opts.since = options.since;
  if (options.submodules !== undefined) opts.submodules = options.submodules;
  if (options.maxFiles !== undefined) opts.maxFiles = options.maxFiles;
  if (options.maxReportBytes !== undefined) opts.maxReportBytes = options.maxReportBytes;
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
