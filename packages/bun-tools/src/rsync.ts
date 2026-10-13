// The existing rsync producer targets Linux x64 musl.
import { assetName, ensureAsset, installedToolPath } from "./assets.ts";
import { existsSync } from "node:fs";
import { runTool, type ToolRunOptions } from "./process.ts";
import { isAbsolute } from "node:path";

/** C:\a\b -> /mnt/c/a/b ; les autres arguments (options, hôtes distants) restent inchangés. */
export const toWslPath = (a: string) =>
  a.replace(
    /^([A-Za-z]):[\\/](.*)$/,
    (_, d: string, r: string) => `/mnt/${d.toLowerCase()}/${r.replaceAll("\\", "/")}`,
  );

export async function rsync(args: string[], options: ToolRunOptions = {}) {
  if (process.platform === "win32") {
    throw new Error("Native rsync is unsupported on Windows; a qualified native producer is required");
  }
  const configured = process.env.BUN_RSYNC_BIN ?? process.env.APHRODY_RSYNC;
  if (configured && !isAbsolute(configured)) throw new Error("Rsync executable override must be absolute");
  if (configured) return runTool(configured, args, options);
  if (process.platform !== "linux" || process.arch !== "x64") {
    const executable = Bun.which("rsync");
    if (!executable) throw new Error("Rsync backend unavailable on this target; install it explicitly");
    return runTool(executable, args, options);
  }
  const name = assetName("rsync");
  const executable =
    configured ??
    (existsSync(installedToolPath(name)) ? await ensureAsset(name) : (Bun.which("rsync") ?? (await ensureAsset(name))));
  return runTool(executable, args, options);
}

/** Native Bun-to-Bun delta upload, including from Windows; the remote Bun must be selected explicitly. */
export async function rsyncNative(
  source: string,
  destination: string,
  remoteBun: string,
  sshArgs: string[] = [],
  options: ToolRunOptions = {},
) {
  return runTool(
    process.execPath,
    ["ssh", "cp", "--native", "--delta", "--remote-bun", remoteBun, ...sshArgs, "--", source, destination],
    { ...options, env: { ...process.env, ...options.env, BUN_BE_BUN: "1" } },
  );
}
