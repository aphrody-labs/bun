// Loads the n2b Node-API addon: `APHRODY_BUN_PLUGIN_N2B_NATIVE`, else
// `bun-plugin-n2b.<platform>.node` next to package.json (local build, see
// scripts/aphrody/build-napi.ts), else the `@aphrody/bun-plugin-n2b-<platform>`
// package npm installed as an optional dependency.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { N2BReport, FileFix } from "./types";

const require = createRequire(import.meta.url);

export interface NativeScanOptions {
  mode?: "check" | "fix" | "aggressive";
  ignore?: string[];
  jobs?: number;
  dryRun?: boolean;
  since?: string;
}

export interface NativeTransformResult {
  code: string;
  changed: boolean;
  findings: FileFix["findings"];
}

export interface N2BNative {
  version(): string;
  runCli(args: string[]): number;
  scan(root: string, options?: NativeScanOptions): N2BReport;
  transform(path: string, source: string, mode?: "check" | "fix" | "aggressive"): NativeTransformResult;
}

/** napi-rs platform keys for this process, most likely first. */
export function platformKeys(): string[] {
  const { platform, arch } = process;
  if (platform === "win32") return [`win32-${arch}-msvc`];
  if (platform === "linux") return [`linux-${arch}-gnu`, `linux-${arch}-musl`];
  return [`${platform}-${arch}`];
}

let cached: N2BNative | undefined;

export function native(): N2BNative {
  if (cached) return cached;
  const candidates: string[] = [];
  const override = process.env.APHRODY_BUN_PLUGIN_N2B_NATIVE;
  if (override) candidates.push(override);
  for (const key of platformKeys()) {
    const local = join(import.meta.dir, "..", `bun-plugin-n2b.${key}.node`);
    if (existsSync(local)) candidates.push(local);
  }
  for (const key of platformKeys()) candidates.push(`@aphrody/bun-plugin-n2b-${key}`);

  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      return (cached = require(candidate) as N2BNative);
    } catch (error) {
      errors.push(`${candidate}: ${(error as Error).message.split("\n")[0]}`);
    }
  }
  throw new Error(
    `@aphrody/bun-plugin-n2b: no native addon for ${platformKeys()[0]}. Tried:\n  ${errors.join("\n  ")}`,
  );
}
