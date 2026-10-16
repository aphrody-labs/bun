#!/usr/bin/env bun
// Google-style build factory for the VPS: depot_tools, gclient/repo sync, gn gen, autoninja.
// Heavy steps take build slots from tools/config/fusion-factory.json. In multi mode, slot i is a
// flock on `heavy.lock` (i = 0) or `heavy.<i>.lock` and owns `jobsPerSlot` CPUs through taskset,
// so concurrent builds run side by side. A step also takes every other free slot, so a build alone
// uses all CPUs. Scripts that flock `heavy.lock` hold slot 0.
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
  slots?: number;
  maxSlots?: number;
  ninjaTargets: string[];
};
/**
 * `slots` is the fewest build slots the step needs (0 runs it without a lock); it also takes every
 * other free slot up to `maxSlots`. A `JOBS` argument becomes the jobs of the slots it holds.
 */
export type Step = { cwd: string; argv: string[]; slots: number; maxSlots?: number };
export const JOBS = "{jobs}";

const google = factory.google;
const targets = google.targets as Record<string, Target>;
const builds = factory.builds;
/** Exit code of `flock -n` when a slot is taken. */
const BUSY = 222;

export const multi = (mode = process.env.BUN_FACTORY_MODE ?? builds.mode) => mode === "multi";
const slotCount = () => (multi() ? builds.slots : 1);
const clamp = (n: number) => Math.min(Math.max(1, n), slotCount());

const HELP = `Usage: bun scripts/factory/factory.ts <command> [target] [--config <name>] [--dry-run]
  layout          Print the factory layout
  plan <target>   Print the sync, gen and build commands
  depot           Clone or update ${google.depotTools}
  timer           Install the systemd user timer updating depot_tools daily
  sync <target>   gclient sync / repo sync
  gen <target>    gn gen ${google.outRoot}/<target>/<config>
  build <target>  autoninja the configured ninja targets
  all <target>    sync, gen and build
  slots           Print which build slots are taken
  run [--slots <n>] [--max-slots <n>] -- <command...>
                  Run a heavy command (bun bd, cargo, ninja) in build slots; alone, it takes all CPUs
Mode: ${builds.mode} (BUN_FACTORY_MODE=single|multi), ${builds.slots} slots of ${builds.jobsPerSlot} jobs
Targets: ${Object.keys(targets).join(", ")}`;

export function slotLocks(): string[] {
  return Array.from({ length: slotCount() }, (_, i) =>
    i === 0 ? factory.lockPath : factory.lockPath.replace(/\.lock$/, `.${i}.lock`),
  );
}

/** Parallel jobs of a step holding `slots` slots. */
export const jobs = (slots: number) => (multi() ? clamp(slots) * builds.jobsPerSlot : google.jobs);

/** The CPUs of `held` slots, for `taskset -c`. */
export function cpuList(held: number[]): string {
  const n = builds.jobsPerSlot;
  return held.map(i => `${i * n}-${i * n + n - 1}`).join(",");
}

/** Every ascending set of `k` slots, so locks are always taken in the same order. */
export function slotSets(k: number, n = slotCount()): number[][] {
  const out: number[][] = [];
  const pick = (start: number, acc: number[]) => {
    if (acc.length === k) return void out.push(acc);
    for (let i = start; i < n; i++) pick(i + 1, [...acc, i]);
  };
  pick(0, []);
  return out;
}

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
    SCCACHE_CACHE_SIZE: `${builds.sccacheGiB}G`,
    CCACHE_MAXSIZE: `${builds.ccacheGiB}G`,
  };
}

/** `argv` under the flocks of `held`, pinned to their CPUs in multi mode. */
export function wrap(argv: string[], held: number[], wait: boolean): string[] {
  const locks = slotLocks();
  const out: string[] = [];
  for (const i of held) out.push("flock", ...(wait ? [] : ["-n", "-E", String(BUSY)]), locks[i]!);
  if (multi()) out.push("taskset", "-c", cpuList(held));
  return [...out, "nice", "-n", "10", ...argv];
}

export function plan(name: string, config = "release"): Step[] {
  const t = targets[name];
  if (!t) throw new Error(`Unknown target ${name}`);
  if (t.kind === "external") throw new Error(`${name} is owned by its own toolchain; factory only reserves its layout`);
  const steps: Step[] = [];
  if (t.kind === "repo") {
    if (!existsSync(join(t.checkout, ".repo")))
      steps.push({
        cwd: t.checkout,
        argv: ["repo", "init", "-u", t.url!, "-b", t.branch ?? "stable", "--depth=1"],
        slots: 0,
      });
    steps.push({ cwd: t.checkout, argv: ["repo", "sync", "-c", "-j", JOBS], slots: 1 });
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
      slots: 0,
    });
  const sync = ["gclient", "sync", "--no-history", "-j", JOBS];
  if (t.revision) sync.push("--revision", `${t.source}@${t.revision}`);
  steps.push({ cwd: t.checkout, argv: sync, slots: 1 });
  const args = t.configs[config];
  if (args === undefined) return steps;
  const out = join(google.outRoot, name, config);
  const src = join(t.checkout, t.source!);
  steps.push({ cwd: src, argv: ["gn", "gen", out, `--args=${args}`], slots: 1 });
  if (t.ninjaTargets.length)
    steps.push({
      cwd: src,
      argv: ["autoninja", "-C", out, "-j", JOBS, ...t.ninjaTargets],
      slots: clamp(t.slots ?? 1),
      maxSlots: t.maxSlots,
    });
  return steps;
}

/** `argv` with `JOBS` replaced by the jobs of `held` slots. */
export const withJobs = (argv: string[], held: number) => argv.map(a => (a === JOBS ? String(jobs(held)) : a));

const show = (s: Step) =>
  (s.slots ? wrap(withJobs(s.argv, clamp(s.slots)), slotSets(clamp(s.slots))[0]!, true) : s.argv).join(" ");

/** The slots to take: every free one, at least `min` and at most `max`, or none if too few are free. */
export function choose(free: number[], min: number, max = slotCount()): number[] | undefined {
  const lo = clamp(min);
  const hi = Math.max(lo, clamp(max));
  return free.length >= lo ? free.slice(0, hi) : undefined;
}

function spawn(cwd: string, argv: string[], held: number) {
  const n = String(jobs(held));
  const vars = { BUN_FACTORY_JOBS: n, CARGO_BUILD_JOBS: n, CMAKE_BUILD_PARALLEL_LEVEL: n };
  return Bun.spawnSync(argv, {
    cwd,
    env: { ...env(), ...(held ? vars : {}) },
    stdio: ["inherit", "inherit", "inherit"],
  }).exitCode;
}

/** Runs `step` in every free slot it may take, or waits for its fewest slots when too few are free. */
export function run(step: Step, dry: boolean) {
  console.log(`$ (cd ${step.cwd} && ${step.argv.join(" ")})`);
  if (dry) return;
  mkdirSync(step.cwd, { recursive: true });
  let code: number | null = BUSY;
  if (!step.slots) code = spawn(step.cwd, step.argv, 0);
  else {
    for (let attempt = 0; attempt < 3 && code === BUSY; attempt++) {
      const held = choose(
        slots().flatMap((s, i) => (s.taken ? [] : [i])),
        step.slots,
        step.maxSlots,
      );
      if (!held) break;
      console.log(
        `factory: ${held.length} slot(s), CPUs ${multi() ? cpuList(held) : "all"}, ${jobs(held.length)} jobs`,
      );
      code = spawn(step.cwd, wrap(withJobs(step.argv, held.length), held, false), held.length);
    }
    if (code === BUSY) {
      const sets = slotSets(clamp(step.slots));
      const held = sets[process.pid % sets.length]!;
      console.log(`factory: too few free slots, waiting for ${held.map(i => slotLocks()[i]).join(", ")}`);
      code = spawn(step.cwd, wrap(withJobs(step.argv, held.length), held, true), held.length);
    }
  }
  if (code !== 0) throw new Error(`exit ${code}: ${step.argv.join(" ")}`);
}

export function slots(): { lock: string; cpus: string; taken: boolean }[] {
  return slotLocks().map((lock, i) => ({
    lock,
    cpus: multi() ? cpuList([i]) : "all",
    taken: Bun.spawnSync(["flock", "-n", "-E", String(BUSY), lock, "true"]).exitCode === BUSY,
  }));
}

function depot(dry: boolean) {
  const d = google.depotTools;
  if (!existsSync(join(d, ".git")))
    run(
      {
        cwd: google.home,
        argv: ["git", "clone", "https://chromium.googlesource.com/chromium/tools/depot_tools.git", d],
        slots: 0,
      },
      dry,
    );
  run({ cwd: d, argv: ["./update_depot_tools"], slots: 0 }, dry);
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
  run({ cwd: google.home, argv: ["systemctl", "--user", "daemon-reload"], slots: 0 }, false);
  run(
    { cwd: google.home, argv: ["systemctl", "--user", "enable", "--now", "depot-tools-update.timer"], slots: 0 },
    false,
  );
}

export function main(argv = process.argv.slice(2)) {
  const sep = argv.indexOf("--");
  const command = sep >= 0 ? argv.slice(sep + 1) : [];
  const args = sep >= 0 ? argv.slice(0, sep) : argv;
  const dry = args.includes("--dry-run");
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const config = value("--config") ?? "release";
  const [cmd, name] = args.filter(
    (a, i) => !a.startsWith("--") && !["--config", "--slots", "--max-slots"].includes(args[i - 1]!),
  );
  switch (cmd) {
    case "layout":
      console.log(JSON.stringify({ ...google, builds, locks: slotLocks() }, null, 2));
      return;
    case "plan":
      for (const s of plan(name!, config)) console.log(`(cd ${s.cwd} && ${show(s)})`);
      return;
    case "depot":
      return depot(dry);
    case "timer":
      return timer(dry);
    case "slots":
      for (const s of slots()) console.log(`${s.taken ? "taken" : "free "}  cpus ${s.cpus}  ${s.lock}`);
      return;
    case "run": {
      if (!command.length) throw new Error("run needs a command after --");
      const n = clamp(Number(value("--slots") ?? 1));
      const max = value("--max-slots");
      return run({ cwd: process.cwd(), argv: command, slots: n, maxSlots: max ? Number(max) : undefined }, dry);
    }
    case "sync":
    case "gen":
    case "build":
    case "all": {
      const pick = (s: Step) => {
        const tool = s.argv.find(a => ["gclient", "repo", "gn", "autoninja"].includes(a));
        if (cmd === "all") return true;
        if (cmd === "sync") return tool === "gclient" || tool === "repo";
        return cmd === "gen" ? tool === "gn" : tool === "autoninja";
      };
      for (const s of plan(name!, config).filter(pick)) run(s, dry);
      return;
    }
    default:
      console.log(HELP);
  }
}

if (import.meta.main) main();
