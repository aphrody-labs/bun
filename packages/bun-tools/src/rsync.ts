// The existing rsync producer targets Linux x64 musl.
import { assetName, ensureAsset } from "./assets.ts";

/** C:\a\b -> /mnt/c/a/b ; les autres arguments (options, hôtes distants) restent inchangés. */
export const toWslPath = (a: string) =>
  a.replace(
    /^([A-Za-z]):[\\/](.*)$/,
    (_, d: string, r: string) => `/mnt/${d.toLowerCase()}/${r.replaceAll("\\", "/")}`,
  );

export async function rsync(args: string[]) {
  if (process.platform === "win32") {
    throw new Error(
      "Native rsync is unsupported on Windows; a qualified native producer is required",
    );
  }
  const cmd = [process.env.APHRODY_RSYNC ?? (await ensureAsset(assetName("rsync"))), ...args];
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    p.stdout.text(),
    p.stderr.text(),
    p.exited,
  ]);
  return { stdout, stderr, exitCode };
}
