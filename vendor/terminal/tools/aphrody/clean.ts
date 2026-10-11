// bun run clean [--all] : supprime les sorties de build (bin, obj, AppPackages, Generated Files).
// --all retire aussi le paquet WindowsTerminalDev, son layout et le fragment de profils.
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { FRAGMENT_DIR, LAYOUT_DIR, PACKAGE_NAME, ROOT, log, pwsh } from "./lib.ts";

const all = process.argv.includes("--all");
const targets = [
  join(ROOT, "bin"),
  join(ROOT, "obj"),
  join(ROOT, "src", "cascadia", "CascadiaPackage", "AppPackages"),
  ...new Bun.Glob("src/**/{bin,obj,Generated Files}").scanSync({ cwd: ROOT, onlyFiles: false, absolute: true }),
];
if (all) {
  const r = await pwsh(`Get-AppxPackage -Name ${PACKAGE_NAME} | Remove-AppxPackage`);
  log("clean", r.code === 0 ? `${PACKAGE_NAME} désinstallé` : r.out.trim());
  targets.push(LAYOUT_DIR, join(FRAGMENT_DIR, "aphrody-terminal.json"));
}
for (const t of targets) {
  if (!existsSync(t)) continue;
  rmSync(t, { recursive: true, force: true });
  log("clean", t);
}
