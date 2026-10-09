#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { run, sha256File } from "./lib.ts";

export interface CoreIdentity {
  schema: "buv-core/1";
  name: "buv";
  version: string;
  revision: string;
  engine: "JavaScriptCore";
  webkit: string;
  graph: true;
}

export interface NativeCore extends CoreIdentity {
  executable: string;
  sha256: string;
  uv: string;
}

export interface CoreSelectionOptions {
  executable?: string;
  workspace?: string;
  env?: Readonly<Record<string, string | undefined>>;
}

export function coreCandidates(options: CoreSelectionOptions = {}): string[] {
  const env = options.env ?? process.env;
  const executable = options.executable ?? env["BUV_EXECUTABLE"];
  if (executable !== undefined) {
    if (!executable || executable.includes("\0")) throw new Error("invalid native core executable path");
    return [resolve(executable)];
  }
  const workspace = options.workspace ?? env["APHRODY_BUN_CHECKOUT"];
  if (workspace === undefined)
    throw new Error("provide --buv or BUV_EXECUTABLE, or --workspace or APHRODY_BUN_CHECKOUT");
  if (!workspace || workspace.includes("\0")) throw new Error("invalid Bun workspace path");
  const root = resolve(workspace);
  const extension = process.platform === "win32" ? ".exe" : "";
  return [join(root, "build", "debug", `bun-debug${extension}`), join(root, "build", "release", `bun${extension}`)];
}

export async function selectCore(options: CoreSelectionOptions = {}, expectedUv = "0.12.24"): Promise<NativeCore> {
  const candidates = coreCandidates(options);
  for (const executable of candidates) {
    let file;
    try {
      file = await stat(executable);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") continue;
      throw error;
    }
    if (!file.isFile()) throw new Error(`native core is not a file: ${executable}`);
    try {
      return await qualifyCore(executable, expectedUv);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`native core qualification failed: ${executable}: ${detail}`, { cause: error });
    }
  }
  throw new Error(`native core executable is missing; checked ${candidates.join(", ")}`);
}

export function validateCore(value: unknown): CoreIdentity {
  if (!value || typeof value !== "object") throw new Error("invalid Buv core identity");
  const core = value as Partial<CoreIdentity>;
  if (
    core.schema !== "buv-core/1" ||
    core.name !== "buv" ||
    core.engine !== "JavaScriptCore" ||
    core.graph !== true ||
    typeof core.version !== "string" ||
    !/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(core.version) ||
    typeof core.revision !== "string" ||
    !/^[0-9a-f]{40}$/.test(core.revision) ||
    typeof core.webkit !== "string" ||
    !/^[0-9a-f]{40}$/.test(core.webkit)
  )
    throw new Error("invalid Buv core identity");
  return {
    schema: core.schema,
    name: core.name,
    version: core.version,
    revision: core.revision,
    engine: core.engine,
    webkit: core.webkit,
    graph: core.graph,
  };
}

export async function qualifyCore(executable: string, expectedUv = "0.12.24"): Promise<NativeCore> {
  if (!/^\d+\.\d+\.\d+$/.test(expectedUv)) throw new Error("invalid UV version");
  const path = resolve(executable);
  const identity = await run(
    [
      path,
      "-e",
      "(()=>{const graph=require('buv:graph');using db=new graph.PyJS(':memory:');const counts=db.counts();console.log(JSON.stringify({schema:'buv-core/1',name:'buv',version:Bun.version,revision:Bun.revision,engine:'JavaScriptCore',webkit:process.versions.webkit,graph:graph.PyJS===graph.BunPython&&counts.nodes===0&&counts.edges===0&&db.db.query('PRAGMA foreign_keys').get().foreign_keys===1&&db.db.query('PRAGMA foreign_key_check').all().length===0}))})()",
    ],
    { env: { BUN_DEBUG_QUIET_LOGS: "1" } },
  );
  if (identity.code !== 0)
    throw new Error(`native core graph qualification failed: ${identity.stderr.trim() || `exit ${identity.code}`}`);
  const core = validateCore(JSON.parse(identity.stdout.trim()));
  const uv = await run([path, "uv", "--version"]);
  if (uv.code !== 0 || !new RegExp(`^uv ${expectedUv.replaceAll(".", "\\.")}(?:\\s|$)`).test(uv.stdout.trim())) {
    throw new Error(`native core UV qualification requires uv ${expectedUv}`);
  }
  return { ...core, executable: path, sha256: await sha256File(path), uv: uv.stdout.trim() };
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const value = (flag: string): string | undefined => {
    const equal = argv.find(arg => arg.startsWith(`${flag}=`));
    if (equal !== undefined) {
      const path = equal.slice(flag.length + 1);
      if (!path) throw new Error(`${flag} requires a path`);
      return path;
    }
    const index = argv.indexOf(flag);
    if (index < 0) return undefined;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`${flag} requires a path`);
    return next;
  };
  const executable = value("--buv") ?? (argv[0]?.startsWith("--") ? undefined : argv[0]);
  console.log(JSON.stringify(await selectCore({ executable, workspace: value("--workspace") })));
}
