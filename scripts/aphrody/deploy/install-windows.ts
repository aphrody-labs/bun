// Installe (ou retire) le service Windows AphrodyBun, à lancer en administrateur :
//   bun install-windows.ts [--name AphrodyBun] [--dir C:\ProgramData\Aphrody\Bun] [--winsvc PATH] [--script PATH]
//   bun install-windows.ts --uninstall
// Copie bun.exe, bun-winsvc.exe (packages/bun-winsvc, cargo build --release) et le script dans --dir, puis crée le service
// démarrage automatique qui lance `bun.exe <script>` ; bun-winsvc le relance s'il sort et tue son arbre à l'arrêt.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1]! : d;
};
const name = arg("--name", "AphrodyBun");
const dir = arg("--dir", "C:/ProgramData/Aphrody/Bun");
const repo = resolve(import.meta.dir, "../../..");
const winsvc = arg("--winsvc", join(repo, "packages/bun-winsvc/target/release/bun-winsvc.exe"));
const script = arg("--script", join(import.meta.dir, "probe.ts"));

const sc = (...a: string[]) => Bun.spawnSync(["sc.exe", ...a]);
if (process.platform !== "win32") throw new Error("Windows uniquement");

async function remove() {
  if (sc("query", name).exitCode !== 0) return;
  sc("stop", name);
  for (let i = 0; i < 40 && /RUNNING|STOP_PENDING/.test(sc("query", name).stdout.toString()); i++) await Bun.sleep(250);
  sc("delete", name);
  for (let i = 0; i < 40 && sc("query", name).exitCode === 0; i++) await Bun.sleep(250);
}

if (process.argv.includes("--uninstall")) {
  await remove();
  process.exit(0);
}

if (!existsSync(winsvc)) throw new Error(`bun-winsvc.exe absent: ${winsvc} (cargo build --release dans packages/bun-winsvc)`);
mkdirSync(dir, { recursive: true });
await remove();
copyFileSync(process.execPath, join(dir, "bun.exe"));
copyFileSync(winsvc, join(dir, "bun-winsvc.exe"));
copyFileSync(script, join(dir, "service.ts"));
const r = Bun.spawnSync([
  join(dir, "bun-winsvc.exe"),
  "install",
  "--name",
  name,
  "--display",
  "Aphrody Bun",
  "--log",
  join(dir, "service.log"),
  "--",
  join(dir, "bun.exe"),
  join(dir, "service.ts"),
]);
process.stdout.write(r.stdout);
process.stderr.write(r.stderr);
process.exit(r.exitCode);
