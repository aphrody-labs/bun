#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
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
  const identity = await run([
    path,
    "-e",
    "const graph=require('buv:graph');console.log(JSON.stringify({schema:'buv-core/1',name:'buv',version:Bun.version,revision:Bun.revision,engine:'JavaScriptCore',webkit:process.versions.webkit,graph:Object.keys(graph).length>0}))",
  ]);
  if (identity.code !== 0) throw new Error("native core graph qualification failed");
  const core = validateCore(JSON.parse(identity.stdout.trim()));
  const uv = await run([path, "uv", "--version"]);
  if (uv.code !== 0 || !new RegExp(`^uv ${expectedUv.replaceAll(".", "\\.")}(?:\\s|$)`).test(uv.stdout.trim())) {
    throw new Error(`native core UV qualification requires uv ${expectedUv}`);
  }
  return { ...core, executable: path, sha256: await sha256File(path), uv: uv.stdout.trim() };
}

if (import.meta.main) {
  const executable = process.argv[2] ?? process.env["BUV_EXECUTABLE"];
  if (!executable) throw new Error("usage: core.ts <qualified Buv executable>");
  console.log(JSON.stringify(await qualifyCore(executable)));
}
