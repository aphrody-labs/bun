// bun run build [Debug|Release] [x64|ARM64] : paquet Terminal (CascadiaPackage) via msbuild,
// même chemin qu'Invoke-OpenConsoleBuild (tools/OpenConsole.psm1) dans un environnement VsDevCmd.
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { OUT, ensureDir, log, msbuildExe, pwsh, runLogged, vsDevEnv, vsInstance } from "./lib.ts";

const configuration = process.argv.find(a => /^(debug|release)$/i.test(a)) ?? "Release";
const platform = process.argv.find(a => /^(x64|arm64)$/i.test(a)) ?? "x64";
const branding = process.env.WT_BRANDING ?? "Dev";

const vs = await vsInstance();
if (!vs) throw new Error("Visual Studio introuvable : lancer `bun run setup`");
const env = await vsDevEnv(vs);
ensureDir(OUT);

// Each cl.exe reserves ~1.5 GB of commit for the large PCHs; with /m and /MP unbounded, a loaded host
// runs out of commit (C3859/C1076). MultiToolTask caps the cl.exe count across all projects.
async function compilerJobs(): Promise<number> {
  if (process.env.WT_JOBS) return Number(process.env.WT_JOBS);
  const freeKb = Number((await pwsh("(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory")).out.trim());
  const byMemory = Number.isFinite(freeKb) && freeKb > 0 ? Math.floor(freeKb / 1024 / 1024 / 1.5) : 4;
  return Math.max(2, Math.min(availableParallelism(), byMemory));
}

const jobs = await compilerJobs();
const logFile = join(OUT, `build-${platform}-${configuration}.log`);
const args = [
  msbuildExe(vs),
  "OpenConsole.slnx",
  `/p:Configuration=${configuration}`,
  `/p:Platform=${platform}`,
  `/p:WindowsTerminalBranding=${branding}`,
  "/p:AppxSymbolPackageEnabled=false",
  "/p:AppxBundle=Never",
  "/p:UseMultiToolTask=true",
  "/p:EnforceProcessCountAcrossBuilds=true",
  `/p:CL_MPCount=${jobs}`,
  "/t:Terminal\\CascadiaPackage",
  `/m:${jobs}`,
  "/nr:false",
  "/nologo",
  "/v:minimal",
  `/bl:${join(OUT, `build-${platform}-${configuration}.binlog`)}`,
];

log("build", `${configuration}|${platform} branding=${branding}, ${jobs} compilations parallèles, journal ${logFile}`);
const started = performance.now();
const code = await runLogged(args, { env, logFile });
const minutes = ((performance.now() - started) / 60000).toFixed(1);
await Bun.write(
  join(OUT, "last-build.json"),
  JSON.stringify(
    { configuration, platform, branding, code, minutes: Number(minutes), at: new Date().toISOString() },
    null,
    2,
  ),
);
if (code !== 0) {
  log("build", `échec (code ${code}) après ${minutes} min, voir ${logFile}`);
  process.exit(code);
}
log("build", `OK en ${minutes} min`);
