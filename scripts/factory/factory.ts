#!/usr/bin/env bun
// Google-style build factory for the VPS: depot_tools, gclient/repo sync, gn gen, autoninja.
// Every heavy step runs under flock on the shared heavy lock from tools/config/fusion-factory.json.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { posix } from "node:path";

const { join } = posix;
import factory from "../../tools/config/fusion-factory.json";

type Target = {
  kind: "gclient" | "repo" | "external";
  checkout: string;
  url?: string;
  source?: string;
  revision?: string;
  branch?: string;
  configs: Record<string, string>;
  ninjaTargets: string[];
};
const google = factory.google;
const targets = google.targets as Record<string, Target>;

const HELP = `Usage: bun scripts/factory/factory.ts <command> [target] [--config <name>] [--dry-run]
  layout          Print the factory layout
  plan <target>   Print the sync, gen and build commands
  depot           Clone or update ${google.depotTools}
  timer           Install the systemd user timer updating depot_tools daily
  sync <target>   gclient sync / repo sync
  gen <target>    gn gen ${google.outRoot}/<target>/<config>
  build <target>  autoninja the configured ninja targets
  all <target>    sync, gen and build
Targets: ${Object.keys(targets).join(", ")}`;

export function env(): Record<string, string> {
  const cache = google.cacheRoot;
  return {
    ...(process.env as Record<string, string>),
    PATH: `${google.depotTools}:${process.env.PATH ?? ""}`,
    DEPOT_TOOLS_UPDATE: "0",
    GIT_CACHE_PATH: join(cache, "git"),
    SCCACHE_DIR: join(cache, "sccache"),
    CCACHE_DIR: join(cache, "ccache"),
    SISO_CACHE_DIR: join(cache, "siso"),
  };
}

const locked = (argv: string[]) => ["flock", factory.lockPath, "nice", "-n", "10", ...argv];

export function plan(name: string, config = "release"): { cwd: string; argv: string[] }[] {
  const t = targets[name];
  if (!t) throw new Error(`Unknown target ${name}`);
  if (t.kind === "external") throw new Error(`${name} is owned by its own toolchain; factory only reserves its layout`);
  const steps: { cwd: string; argv: string[] }[] = [];
  if (t.kind === "repo") {
    if (!existsSync(join(t.checkout, ".repo")))
      steps.push({ cwd: t.checkout, argv: ["repo", "init", "-u", t.url!, "-b", t.branch ?? "stable", "--depth=1"] });
    steps.push({ cwd: t.checkout, argv: locked(["repo", "sync", "-c", "-j", String(google.jobs)]) });
    return steps;
  }
  if (!existsSync(join(t.checkout, ".gclient")))
    steps.push({
      cwd: t.checkout,
      argv: [
        "gclient",
        "config",
        `--name=${t.source}`,
        "--unmanaged",
        `--cache-dir=${join(google.cacheRoot, "git")}`,
        t.url!,
      ],
    });
  const sync = ["gclient", "sync", "--no-history", "-j", String(google.jobs)];
  if (t.revision) sync.push("--revision", `${t.source}@${t.revision}`);
  steps.push({ cwd: t.checkout, argv: locked(sync) });
  const args = t.configs[config];
  if (args === undefined) return steps;
  const out = join(google.outRoot, name, config);
  const src = join(t.checkout, t.source!);
  steps.push({ cwd: src, argv: locked(["gn", "gen", out, `--args=${args}`]) });
  if (t.ninjaTargets.length)
    steps.push({ cwd: src, argv: locked(["autoninja", "-C", out, "-j", String(google.jobs), ...t.ninjaTargets]) });
  return steps;
}

function run(step: { cwd: string; argv: string[] }, dry: boolean) {
  console.log(`$ (cd ${step.cwd} && ${step.argv.join(" ")})`);
  if (dry) return;
  mkdirSync(step.cwd, { recursive: true });
  const r = Bun.spawnSync(step.argv, { cwd: step.cwd, env: env(), stdio: ["inherit", "inherit", "inherit"] });
  if (r.exitCode !== 0) throw new Error(`exit ${r.exitCode}: ${step.argv.join(" ")}`);
}

function depot(dry: boolean) {
  const d = google.depotTools;
  if (!existsSync(join(d, ".git")))
    run(
      {
        cwd: google.home,
        argv: ["git", "clone", "https://chromium.googlesource.com/chromium/tools/depot_tools.git", d],
      },
      dry,
    );
  run({ cwd: d, argv: ["./update_depot_tools"] }, dry);
}

function timer(dry: boolean) {
  const dir = join(google.home, ".config/systemd/user");
  const service = `[Unit]\nDescription=Update depot_tools\n\n[Service]\nType=oneshot\nWorkingDirectory=${google.depotTools}\nExecStart=${google.depotTools}/update_depot_tools\nNice=10\n`;
  const unit = `[Unit]\nDescription=Daily depot_tools update\n\n[Timer]\nOnCalendar=daily\nRandomizedDelaySec=1h\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n`;
  console.log(`${dir}/depot-tools-update.{service,timer}`);
  if (dry) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "depot-tools-update.service"), service);
  writeFileSync(join(dir, "depot-tools-update.timer"), unit);
  run({ cwd: google.home, argv: ["systemctl", "--user", "daemon-reload"] }, false);
  run({ cwd: google.home, argv: ["systemctl", "--user", "enable", "--now", "depot-tools-update.timer"] }, false);
}

export function main(args = process.argv.slice(2)) {
  const dry = args.includes("--dry-run");
  const ci = args.indexOf("--config");
  const config = ci >= 0 ? args[ci + 1] : "release";
  const [cmd, name] = args.filter((a, i) => !a.startsWith("--") && (ci < 0 || i !== ci + 1));
  switch (cmd) {
    case "layout":
      console.log(JSON.stringify({ ...google, lock: factory.lockPath }, null, 2));
      return;
    case "plan":
      for (const s of plan(name!, config)) console.log(`(cd ${s.cwd} && ${s.argv.join(" ")})`);
      return;
    case "depot":
      return depot(dry);
    case "timer":
      return timer(dry);
    case "sync":
    case "gen":
    case "build":
    case "all": {
      const steps = plan(name!, config);
      const pick = (s: { argv: string[] }) => {
        const tool = s.argv.find(a => ["gclient", "repo", "gn", "autoninja"].includes(a));
        if (cmd === "all") return true;
        if (cmd === "sync") return tool === "gclient" || tool === "repo";
        return cmd === "gen" ? tool === "gn" : tool === "autoninja";
      };
      for (const s of steps.filter(pick)) run(s, dry);
      return;
    }
    default:
      console.log(HELP);
  }
}

if (import.meta.main) main();
