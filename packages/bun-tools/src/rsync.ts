// rsync du fork (aphrody-labs/rsync, binaire statique musl). Sous Windows il s'exécute dans la distro WSL AphrodyAlpine
// (couche de compatibilité Linux), les chemins Windows étant convertis en /mnt/<lecteur>/….
import { assetName, ensureAsset } from "./assets.ts";

const WSL_DISTRO = process.env.APHRODY_RSYNC_DISTRO ?? "AphrodyAlpine";

/** C:\a\b -> /mnt/c/a/b ; les autres arguments (options, hôtes distants) restent inchangés. */
export const toWslPath = (a: string) =>
  a.replace(
    /^([A-Za-z]):[\\/](.*)$/,
    (_, d: string, r: string) => `/mnt/${d.toLowerCase()}/${r.replaceAll("\\", "/")}`,
  );

export async function rsync(args: string[]) {
  const cmd =
    process.platform === "win32"
      ? ["wsl.exe", "-d", WSL_DISTRO, "--", "rsync", ...args.map(toWslPath)]
      : [process.env.APHRODY_RSYNC ?? (await ensureAsset(assetName("rsync"))), ...args];
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([p.stdout.text(), p.stderr.text(), p.exited]);
  return { stdout, stderr, exitCode };
}
