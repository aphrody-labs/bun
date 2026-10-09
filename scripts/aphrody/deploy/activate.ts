// Activation of a release on the prod host (run as root, installed in /usr/local/lib/aphrody-deploy/).
//   sudo -n bun activate.ts [--root R] [--unit U] [--health URL] [--timeout S] [--min-free-gb 15] <releaseDir>
// current -> release by atomic symlink rename, `systemctl restart <unit>` (the old version is fully stopped before the new
// one starts: never two versions, never two Discord clients), wait for `active` then GET health = 200. On failure the
// previous release is restored and the failed one is marked `bad`. APHRODY_DEPLOY_SYSTEMCTL overrides the systemctl command.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  EXIT,
  GB,
  appendLine,
  ensureFlock,
  freeBytes,
  logEvent,
  readJson,
  readLink,
  run,
  swapLink,
  verifySums,
} from "./lib.ts";

export interface ActivateOptions {
  releaseDir: string;
  root: string;
  unit: string;
  health: string;
  timeoutMs?: number;
  minFreeBytes?: number;
  systemctl?: string[];
  coordLog?: string | null;
  free?: (path: string) => number;
  fetchHealth?: (url: string) => Promise<number>;
  clean?: (() => Promise<void>) | null;
  pollMs?: number;
  log?: (event: string, fields?: Record<string, unknown>) => void;
}

export type ActivateResult = { ok: boolean; detail?: string; rolledBack?: boolean; code: number };

const defaultHealth = async (url: string) => {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(3000) })).status;
  } catch {
    return 0;
  }
};

export async function activateRelease(o: ActivateOptions): Promise<ActivateResult> {
  const log = o.log ?? ((e, f) => logEvent(e, f));
  const systemctl = o.systemctl ?? (process.env.APHRODY_DEPLOY_SYSTEMCTL ?? "systemctl").split(" ");
  const free = o.free ?? freeBytes;
  const health = o.fetchHealth ?? defaultHealth;
  const timeoutMs = o.timeoutMs ?? 120_000;
  const pollMs = o.pollMs ?? 500;
  const releaseDir = resolve(o.releaseDir);
  const id = basename(releaseDir);
  const current = join(o.root, "current");
  const previous = join(o.root, "previous");

  const bad = verifySums(releaseDir);
  if (bad.length) {
    log("verify-failed", { id, files: bad });
    return { ok: false, detail: `sha256 mismatch: ${bad.join(",")}`, code: EXIT.activate };
  }
  const freeNow = free(o.root);
  if (freeNow < (o.minFreeBytes ?? 15 * GB)) {
    log("no-space", { id, freeBytes: freeNow });
    return { ok: false, detail: `free space ${freeNow} below minimum`, code: EXIT.activate };
  }
  if (o.coordLog) appendLine(o.coordLog, `${new Date().toISOString()} aphrody-deploy: activation ${o.unit} ${id}`);

  const meta = readJson(join(releaseDir, "release.json")) ?? { id };
  writeFileSync(
    join(releaseDir, "release.json"),
    JSON.stringify({ ...meta, id, activatedAt: new Date().toISOString() }, null, 2) + "\n",
  );

  const sys = async (...args: string[]) => run([...systemctl, ...args]);
  const waitHealthy = async () => {
    const deadline = Date.now() + timeoutMs;
    let active = false;
    while (Date.now() < deadline) {
      if (!active) active = (await sys("is-active", o.unit)).stdout.trim() === "active";
      if (active && (await health(o.health)) === 200) return true;
      await Bun.sleep(pollMs);
    }
    return false;
  };
  const restart = async () => (await sys("restart", o.unit)).code === 0;

  const old = readLink(current);
  if (old && old !== releaseDir) swapLink(previous, old);
  swapLink(current, releaseDir);
  log("switched", { id, previous: old ? basename(old) : null });

  if ((await restart()) && (await waitHealthy())) {
    log("healthy", { id });
    if (o.clean) {
      try {
        await o.clean();
      } catch (e) {
        log("clean-failed", { error: (e as Error).message });
      }
    }
    return { ok: true, code: EXIT.ok };
  }

  mkdirSync(releaseDir, { recursive: true });
  writeFileSync(join(releaseDir, "bad"), JSON.stringify({ at: new Date().toISOString(), unit: o.unit }) + "\n");
  if (!old || old === releaseDir) {
    log("failed-no-previous", { id });
    return { ok: false, detail: "unhealthy, no previous release", rolledBack: false, code: EXIT.activate };
  }
  swapLink(current, old);
  const restored = (await restart()) && (await waitHealthy());
  log(restored ? "rolled-back" : "rollback-failed", { id, to: basename(old) });
  return {
    ok: false,
    detail: restored ? "unhealthy, rolled back" : "unhealthy, rollback failed",
    rolledBack: restored,
    code: EXIT.activate,
  };
}

function arg(args: string[], name: string, fallback?: string) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const releaseDir = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")).at(-1);
  if (!releaseDir) {
    console.error(
      "usage: activate.ts [--root R] [--unit U] [--health URL] [--timeout S] [--min-free-gb N] <releaseDir>",
    );
    process.exit(EXIT.config);
  }
  const root = arg(args, "--root", dirname(dirname(resolve(releaseDir))))!;
  await ensureFlock(join(root, ".activate.lock"));
  const unit = arg(args, "--unit")!;
  const health = arg(args, "--health")!;
  if (!unit || !health) {
    console.error("--unit and --health are required");
    process.exit(EXIT.config);
  }
  const cleanTs = join(import.meta.dir, "clean.ts");
  const result = await activateRelease({
    releaseDir,
    root,
    unit,
    health,
    timeoutMs: Number(arg(args, "--timeout", "120")) * 1000,
    minFreeBytes: Number(arg(args, "--min-free-gb", "15")) * GB,
    coordLog: process.env.APHRODY_DEPLOY_COORD_LOG ?? "/home/ubuntu/.coord-dbfr.log",
    clean: existsSync(cleanTs)
      ? async () => {
          const r = await run([process.execPath, cleanTs, "--host-role", "prod", "--root", root]);
          if (r.code !== 0) throw new Error(`clean exit ${r.code}`);
        }
      : null,
  });
  process.exit(result.code);
}
