// Point d'entrée de l'image aphrody/bun : rôles build, prod, health ; tout autre argument est exécuté par bun.
//   build  bun queue.ts --once toutes les APHRODY_DEPLOY_INTERVAL secondes (120), config /config/apps.json
//   prod   supervise ${APP_ROOT}/current/${APP_BIN}, ou `bun ${APP_SCRIPT}` ; sans l'un ni l'autre, la sonde probe.ts, relancé avec attente croissante ; SIGTERM l'arrête proprement
//   health build: dernière passe de moins de 3 intervalles ; prod: HEALTH_URL répond 200 (sinon le processus vit)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir;
const interval = Number(process.env.APHRODY_DEPLOY_INTERVAL ?? 120) * 1000;
const stamp = "/tmp/aphrody-pass";
const appRoot = process.env.APP_ROOT ?? "/srv/app";

let stopping = false;
let child: Bun.Subprocess | undefined;
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    stopping = true;
    child?.kill(sig);
  });
}

async function build() {
  const config = process.env.APHRODY_DEPLOY_CONFIG ?? "/config/apps.json";
  if (!existsSync(config)) {
    console.error(`config absente: ${config}`);
    return 4;
  }
  const tokenFile = process.env.GH_TOKEN_FILE;
  if (!process.env.GH_TOKEN && tokenFile && existsSync(tokenFile)) process.env.GH_TOKEN = readFileSync(tokenFile, "utf8").trim();
  while (!stopping) {
    child = Bun.spawn({ cmd: ["bun", join(dir, "queue.ts"), "--once", "--config", config], stdio: ["ignore", "inherit", "inherit"] });
    const code = await child.exited;
    if (code === 0 || code === 75) writeFileSync(stamp, String(Date.now()));
    else console.error(`queue.ts: code ${code}`);
    await Bun.sleep(interval);
  }
  return 0;
}

async function prod() {
  const bin = process.env.APP_BIN;
  const script = process.env.APP_SCRIPT || (bin ? undefined : join(dir, "probe.ts"));
  let wait = 1000;
  while (!stopping) {
    const exe = script ? "bun" : join(appRoot, "current", bin!);
    if (!script && !existsSync(exe)) {
      console.error(`en attente de ${exe}`);
      await Bun.sleep(5000);
      continue;
    }
    const started = Date.now();
    child = Bun.spawn({ cmd: script ? ["bun", script, ...process.argv.slice(3)] : [exe, ...process.argv.slice(3)], stdio: ["ignore", "inherit", "inherit"] });
    writeFileSync(stamp, String(started));
    const code = await child.exited;
    if (stopping) break;
    console.error(`${bin} terminé (code ${code}), relance dans ${wait} ms`);
    await Bun.sleep(wait);
    wait = Date.now() - started > 60_000 ? 1000 : Math.min(wait * 2, 30_000);
  }
  return 0;
}

async function health() {
  const url = process.env.HEALTH_URL;
  if (url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) }).catch(() => null);
    return res?.status === 200 ? 0 : 1;
  }
  if (!existsSync(stamp)) return 1;
  if (process.env.APHRODY_ROLE !== "build") return 0;
  return Date.now() - Number(readFileSync(stamp, "utf8")) < 3 * interval + 60_000 ? 0 : 1;
}

const role = process.argv[2];
const code =
  role === "build" ? await build() : role === "prod" ? await prod() : role === "health" ? await health() : await (child = Bun.spawn({ cmd: ["bun", ...process.argv.slice(2)], stdio: ["inherit", "inherit", "inherit"] })).exited;
process.exit(code);
