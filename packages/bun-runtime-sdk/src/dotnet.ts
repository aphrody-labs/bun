// SPDX-License-Identifier: Apache-2.0
import { locate, type DotnetLocation } from "bun:dotnet";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runtimeHome } from "./paths.ts";

export * from "bun:dotnet";
export { default } from "bun:dotnet";

export interface DotnetSelectOptions {
  /** .NET install root; defaults to `BUV_DOTNET_ROOT`, then the host's own lookup. */
  root?: string;
  /** SDK version or prefix (`"10"`, `"10.0.1"`); defaults to `BUV_DOTNET_SDK`, then the newest. */
  sdk?: string;
  /** `Microsoft.NETCore.App` version or prefix; defaults to `BUV_DOTNET_RUNTIME`, then the newest. */
  runtime?: string;
}

export interface DotnetSelection {
  location: DotnetLocation;
  sdk: string | null;
  runtime: string | null;
  /** Environment that makes a child `dotnet` / apphost use this selection. */
  env: Record<string, string>;
}

function pick(versions: readonly string[], wanted: string | undefined, what: string): string | null {
  const matching = wanted ? versions.filter(v => v === wanted || v.startsWith(`${wanted}.`)) : [...versions];
  if (wanted && matching.length === 0) {
    throw new Error(`.NET ${what} ${wanted} is not installed (found: ${versions.join(", ") || "none"})`);
  }
  return matching.sort((a, b) => Bun.semver.order(a, b)).at(-1) ?? null;
}

/** Selects the .NET install, SDK and runtime the way buv selects its runtime artifact. */
export function selectDotnet(options: DotnetSelectOptions = {}, env: NodeJS.ProcessEnv = process.env): DotnetSelection {
  const location = locate(options.root ?? (env.BUV_DOTNET_ROOT || undefined));
  const sdk = pick(location.sdks, options.sdk ?? (env.BUV_DOTNET_SDK || undefined), "SDK");
  const runtime = pick(location.runtimes, options.runtime ?? (env.BUV_DOTNET_RUNTIME || undefined), "runtime");
  const selected: Record<string, string> = { DOTNET_ROOT: location.dotnetRoot };
  if (location.muxer) selected.DOTNET_HOST_PATH = location.muxer;
  return { location, sdk, runtime, env: selected };
}

/** `<runtime home>/dotnet`: generated runtime configs and caches of the buv runtime. */
export function dotnetHome(env: NodeJS.ProcessEnv = process.env): string {
  return join(runtimeHome(env), "dotnet");
}

/** Writes (once per version) a `.runtimeconfig.json` pinned to `runtime`, for `initialize()`. */
export function runtimeConfigFor(runtime: string, env: NodeJS.ProcessEnv = process.env): string {
  const [major = "0", minor = "0"] = runtime.split(".");
  const directory = dotnetHome(env);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `Microsoft.NETCore.App-${runtime}.runtimeconfig.json`);
  const config = {
    runtimeOptions: {
      tfm: `net${major}.${minor}`,
      rollForward: "Disable",
      framework: { name: "Microsoft.NETCore.App", version: runtime },
    },
  };
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  return path;
}
