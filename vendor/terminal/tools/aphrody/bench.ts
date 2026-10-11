// bun run bench [--runs N] [--label nom] : temps entre le lancement de wt et le démarrage du shell
// dans le nouvel onglet (cmd.exe /c qui crée un fichier marqueur), pour le Terminal stable et le paquet Dev.
// cold : aucun processus du paquet Dev ne tourne (fermé entre deux mesures, uniquement les siens).
// warm : nouvelle fenêtre dans un processus déjà lancé. Le stable de l'utilisateur n'est jamais fermé,
// il n'est donc mesuré qu'à chaud.
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { LAYOUT_DIR, LOCALAPPDATA, OUT, ensureDir, log, pwsh } from "./lib.ts";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const runs = Number(arg("--runs", "10"));
const label = arg("--label", "baseline");
const aliases = join(LOCALAPPDATA, "Microsoft", "WindowsApps");
const dir = ensureDir(join(OUT, "bench"));

const devProcesses = `Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${LAYOUT_DIR.replaceAll("'", "''")}*' }`;

async function stopDev(): Promise<void> {
  await pwsh(`${devProcesses} | Stop-Process -Force`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && Number((await pwsh(`@(${devProcesses}).Count`)).out.trim()) > 0) await Bun.sleep(100);
}

async function once(alias: string, i: number): Promise<number> {
  const marker = join(dir, `m${i}`);
  rmSync(marker, { force: true });
  const t0 = performance.now();
  Bun.spawn([join(aliases, alias), "-w", "new", "nt", "cmd.exe", "/d", "/c", `type nul > ${marker}`], {
    stdout: "ignore",
    stderr: "ignore",
  });
  const deadline = t0 + 30_000;
  while (performance.now() < deadline) {
    if (existsSync(marker)) return performance.now() - t0;
    await Bun.sleep(1);
  }
  throw new Error(`${alias} : pas de shell en 30 s`);
}

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { median: Math.round(q(0.5)), p90: Math.round(q(0.9)), min: Math.round(s[0]), runs: s.length };
}

async function series(name: string, alias: string, cold: boolean): Promise<ReturnType<typeof stats>> {
  const xs: number[] = [];
  await once(alias, -1); // warms caches / starts the process for warm series
  for (let i = 0; i < runs; i++) {
    if (cold) await stopDev();
    xs.push(await once(alias, i));
    await Bun.sleep(300); // let the tab close before the next launch
  }
  const r = stats(xs);
  log(name, `médiane ${r.median} ms, p90 ${r.p90} ms, min ${r.min} ms (${r.runs} mesures)`);
  return r;
}

const result: Record<string, unknown> = { label, at: new Date().toISOString() };
if (existsSync(join(aliases, "wtd.exe"))) {
  result.devCold = await series("dev cold", "wtd.exe", true);
  // Keep one Dev window open so the warm series reuses the process.
  Bun.spawn([join(aliases, "wtd.exe"), "-w", "aphrody-bench-hold", "nt", "cmd.exe", "/d", "/k"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  result.devWarm = await series("dev warm", "wtd.exe", false);
  await stopDev();
}
if (existsSync(join(aliases, "wt.exe")) && !process.argv.includes("--dev-only")) {
  result.stableWarm = await series("stable warm", "wt.exe", false);
}
const file = join(OUT, `bench-${label}.json`);
await Bun.write(file, JSON.stringify(result, null, 2));
log("bench", file);
