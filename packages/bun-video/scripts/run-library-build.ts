import { availableParallelism } from "node:os";
import { delimiter, dirname, resolve } from "node:path";
import { Job, processes } from "bun:windows";

if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error("The current native-asset library build is qualified only for Windows x64");
using job = new Job({ killOnClose: true, cpuRate: Math.min(100, 200 / availableParallelism()) });
const child = job.spawn([process.execPath, "--no-env-file", "scripts/build.ts", "--library"], {
  cwd: resolve(import.meta.dir, ".."),
  stdin: "ignore",
  stdout: "inherit",
  stderr: "inherit",
  env: {
    SystemRoot: Bun.env.SystemRoot ?? "",
    PATH: dirname(process.execPath) + delimiter + (Bun.env.PATH ?? ""),
    TEMP: Bun.env.TEMP ?? "",
    TMP: Bun.env.TMP ?? "",
    APHRODY_HOME: resolve(import.meta.dir, "../../../build/media/neon-fixture-home"),
    BUN_VIDEO_CATALOG_BACKEND: "sqlite",
  },
});
processes.setAffinity(child, 3);
let expired = false;
const deadline = setTimeout(() => {
  expired = true;
  job.terminate();
}, 120_000);
try {
  const code = await child.exited;
  if (expired || child.signalCode) throw new Error("Library build exceeded its deadline");
  process.exitCode = code;
} finally {
  clearTimeout(deadline);
}
