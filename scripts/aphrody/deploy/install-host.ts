// Idempotent installer of the deploy pipeline on the host it runs on.
//   bun install-host.ts --role build            (VPS, user units)   queue + lib + activate + clean, launcher, user timer
//   sudo -n bun install-host.ts --role prod --root /srv/shenron-app   (dbfr, system units)  activate + clean + lib, clean timer
// Options: --dry-run, --no-enable, --prefix DIR (stage everything under DIR, for tests), --bun PATH.
// Remote use (no checkout on the host): ship scripts/aphrody/deploy with `git archive ... | ssh host tar -x -C /tmp/d`, then
// run this file from there through `aphrody-infra ssh exec`.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { run } from "./lib.ts";

const here = import.meta.dir;

export interface PlanItem {
  dest: string;
  content: string;
  mode: number;
  /** Written only when absent (operator-owned files). */
  keepExisting?: boolean;
}

export function planInstall(o: {
  role: "build" | "prod";
  home: string;
  root?: string;
  bun?: string;
  prefix?: string;
}): PlanItem[] {
  const read = (...p: string[]) => readFileSync(join(here, ...p), "utf8");
  const at = (p: string) => (o.prefix ? join(o.prefix, p) : p);
  const items: PlanItem[] = [];
  if (o.role === "build") {
    const lib = join(o.home, ".local/lib/aphrody-deploy");
    for (const f of ["queue.ts", "lib.ts", "activate.ts", "clean.ts", "install-host.ts"]) {
      items.push({ dest: at(join(lib, f)), content: read(f), mode: 0o644 });
    }
    items.push({
      dest: at(join(o.home, ".local/bin/aphrody-deploy")),
      mode: 0o755,
      content: [
        "#!/usr/bin/env bash",
        "# Lanceur de la file aphrody-deploy : le jeton GitHub reste dans l'environnement, jamais en argv.",
        "set -euo pipefail",
        "GH_TOKEN=${GH_TOKEN:-$(gh auth token)}",
        "export GH_TOKEN",
        `exec "\${APHRODY_DEPLOY_BUN:-bun}" "${lib}/queue.ts" "$@"`,
        "",
      ].join("\n"),
    });
    for (const u of ["aphrody-deploy.service", "aphrody-deploy.timer"]) {
      items.push({ dest: at(join(o.home, ".config/systemd/user", u)), content: read("systemd", u), mode: 0o644 });
    }
    items.push({
      dest: at(join(o.home, ".config/aphrody-deploy/apps.example.json")),
      content: read("apps.example.json"),
      mode: 0o644,
    });
  } else {
    if (!o.root) throw new Error("--root is required for --role prod");
    const lib = "/usr/local/lib/aphrody-deploy";
    for (const f of ["activate.ts", "clean.ts", "lib.ts"])
      items.push({ dest: at(join(lib, f)), content: read(f), mode: 0o644 });
    for (const u of ["aphrody-deploy-clean.service", "aphrody-deploy-clean.timer"]) {
      const content = read("systemd", u)
        .replaceAll("@BUN@", o.bun ?? "/home/ubuntu/.local/bin/bun")
        .replaceAll("@ROOT@", o.root);
      items.push({ dest: at(join("/etc/systemd/system", u)), content, mode: 0o644 });
    }
  }
  return items;
}

/** Writes the items that differ and returns the destinations that changed. */
export function applyPlan(items: PlanItem[], dryRun = false): string[] {
  const changed: string[] = [];
  for (const it of items) {
    const exists = existsSync(it.dest);
    if (exists && (it.keepExisting || readFileSync(it.dest, "utf8") === it.content)) continue;
    changed.push(it.dest);
    if (dryRun) continue;
    mkdirSync(dirname(it.dest), { recursive: true });
    writeFileSync(it.dest, it.content);
    chmodSync(it.dest, it.mode);
  }
  return changed;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const val = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const role = val("--role");
  if (role !== "build" && role !== "prod") {
    console.error(
      "usage: install-host.ts --role build|prod [--root DIR] [--dry-run] [--no-enable] [--prefix DIR] [--bun PATH]",
    );
    process.exit(4);
  }
  const dryRun = args.includes("--dry-run");
  const prefix = val("--prefix");
  const plan = planInstall({ role, home: homedir(), root: val("--root"), bun: val("--bun"), prefix });
  const changed = applyPlan(plan, dryRun);
  console.log(JSON.stringify({ role, dryRun, changed }));
  if (!dryRun && !prefix && !args.includes("--no-enable")) {
    const sys = role === "build" ? ["systemctl", "--user"] : ["systemctl"];
    const timer = role === "build" ? "aphrody-deploy.timer" : "aphrody-deploy-clean.timer";
    for (const c of [["daemon-reload"], ["enable", "--now", timer]]) {
      const r = await run([...sys, ...c]);
      if (r.code !== 0) {
        console.error(`${sys.join(" ")} ${c.join(" ")}: ${r.stderr.trim()}`);
        process.exit(1);
      }
    }
  }
}
