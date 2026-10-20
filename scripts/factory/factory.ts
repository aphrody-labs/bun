#!/usr/bin/env bun
// Build factory: VPS depot_tools/gclient/GN and native host build-slot execution.
// Heavy steps take build slots from tools/config/fusion-factory.json. In multi mode, slot i is a
// flock on `heavy.lock` (i = 0) or `heavy.<i>.lock` and owns `jobsPerSlot` CPUs through taskset,
// so concurrent builds run side by side. A step also takes every other free slot, so a build alone
// uses all CPUs. Scripts that flock `heavy.lock` hold slot 0. Windows uses global OS mutexes
// keyed by checkout-local lock paths, and Job Objects keep child lifetimes within each reservation.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { posix, delimiter, resolve } from "node:path";

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
  lane <runtime|os|web> -- <command...>
                  Run in the canonical VPS checkout with one slot, leaving room for the other lanes
Mode: ${builds.mode} (BUN_FACTORY_MODE=single|multi), ${builds.slots} slots of ${builds.jobsPerSlot} jobs
Targets: ${Object.keys(targets).join(", ")}`;

export function slotLocks(): string[] {
  if (process.platform === "win32" || process.env.BUN_FACTORY_LOCK_ROOT) {
    const root = resolve(process.env.BUN_FACTORY_LOCK_ROOT ?? resolve(import.meta.dir, "../../build/factory/locks"));
    return Array.from({ length: slotCount() }, (_, i) => resolve(root, i ? `heavy.${i}.lock` : "heavy.lock"));
  }
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
  if (process.platform === "win32") return { ...(process.env as Record<string, string>) };
  const cache = google.cacheRoot;
  return {
    ...(process.env as Record<string, string>),
    PATH: `${google.depotTools}${delimiter}${process.env.PATH ?? ""}`,
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
  if (process.platform === "win32")
    return [
      process.execPath,
      import.meta.path,
      "--windows-locks",
      wait ? "wait" : "try",
      held.join(","),
      "--",
      ...argv,
    ];
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
      ...(t.maxSlots === undefined ? {} : { maxSlots: t.maxSlots }),
    });
  return steps;
}

/** Concurrent product builds share slots without creating additional source checkouts. */
export function lane(name: string, argv: string[]): Step {
  if (!Object.hasOwn(factory.lanes, name)) throw new Error(`Unknown build lane ${name}`);
  if (!argv.length) throw new Error("lane needs a command after --");
  const owner = factory.lanes[name as keyof typeof factory.lanes];
  return { cwd: owner.cwd, argv, slots: 1, maxSlots: 1 };
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
    windowsHide: true,
  }).exitCode;
}

/** Kernel waiters own one lock each; the admission mutex prevents partial-set deadlocks. */
export async function reserveLinuxSlots(locks: readonly string[], min: number, max: number, signal?: AbortSignal, onWaiting?: () => void) {
  if (process.platform !== "linux") throw new Error("Linux reservations require Linux");
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > locks.length)
    throw new Error("Invalid slot reservation bounds");
  if (new Set(locks).size !== locks.length || locks.some(lock => !lock.startsWith("/") || resolve(lock) !== lock || lock.includes("\0")))
    throw new Error("Factory reservation locks must be distinct normalized absolute paths");
  const children = new Set<ReturnType<typeof Bun.spawn>>();
  const release = async () => {
    for (const child of children) child.kill();
    await Promise.all([...children].map(child => child.exited));
    children.clear();
  };
  const abort = () => { for (const child of children) child.kill(); };
  signal?.throwIfAborted();
  signal?.addEventListener("abort", abort, { once: true });
  const waiter = (lock: string, tryOnly = false) => {
    // --no-fork keeps the handle at one PID, both while flock waits and after exec.
    const child = Bun.spawn(["flock", "--no-fork", ...(tryOnly ? ["-n", "-E", String(BUSY)] : []), "--", lock, "/bin/sh", "-c",
      'printf "reserved\\n"; cat >/dev/null'],
    { stdin: "pipe", stdout: "pipe", stderr: "inherit" });
    children.add(child);
    const ready = (async () => {
      const reader = child.stdout.getReader();
      let marker = "";
      try {
        while (!marker.includes("\n")) {
          const chunk = await reader.read();
          if (chunk.done) {
            if (tryOnly && await child.exited === BUSY) return false;
            throw new Error("Factory reservation waiter exited before acquiring its lock");
          }
          marker += new TextDecoder().decode(chunk.value);
        }
        if (marker !== "reserved\n") throw new Error("Invalid factory reservation acknowledgement");
        signal?.throwIfAborted();
        return true;
      } finally { reader.releaseLock(); }
    })();
    return { child, ready };
  };
  try {
    const admission = waiter(`${locks[0]}.reservation`);
    await admission.ready;
    const held: number[] = [];
    const candidates = locks.map(lock => waiter(lock, true));
    const available = await Promise.all(candidates.map(candidate => candidate.ready));
    for (const [index, ready] of available.entries()) {
      if (ready) held.push(index);
      else children.delete(candidates[index]!.child);
    }
    if (held.length < min) {
      await new Promise<void>((resolve, reject) => {
        for (const [index, ready] of available.entries()) {
          if (ready) continue;
          const candidate = candidates[index] = waiter(locks[index]!);
          candidate.ready.then(() => {
            held.push(index);
            if (held.length === min) resolve();
          }, reject);
        }
        onWaiting?.();
      });
    }
    signal?.throwIfAborted();
    const selected = held.slice(0, max).sort((a, b) => a - b);
    const losers = candidates.filter((value, i) => !selected.includes(i) && children.has(value.child)).map(value => value.child);
    losers.push(admission.child);
    for (const child of losers) child.kill();
    await Promise.all(losers.map(child => child.exited));
    for (const child of losers) children.delete(child);
    signal?.removeEventListener("abort", abort);
    signal?.throwIfAborted();
    return { held: selected, release: async () => { signal?.removeEventListener("abort", abort); await release(); } };
  } catch (error) {
    signal?.removeEventListener("abort", abort);
    await release();
    signal?.throwIfAborted();
    throw error;
  }
}

/** Runs `step` in every free slot it may take, or waits for its fewest slots when too few are free. */
export async function run(step: Step, dry: boolean) {
  console.log(`$ (cd ${step.cwd} && ${step.argv.join(" ")})`);
  if (dry) return;
  mkdirSync(step.cwd, { recursive: true });
  let code: number | null = BUSY;
  if (!step.slots) code = spawn(step.cwd, step.argv, 0);
  else {
    for (let attempt = 0; process.platform !== "linux" && attempt < 3 && code === BUSY; attempt++) {
      const held = choose(
        slots().flatMap((s, i) => (s.taken ? [] : [i])),
        step.slots,
        step.maxSlots,
      );
      if (!held) break;
      console.log(
        `factory: ${held.length} slot(s), CPUs ${multi() && process.platform !== "win32" ? cpuList(held) : "all"}, ${jobs(held.length)} jobs`,
      );
      code = spawn(step.cwd, wrap(withJobs(step.argv, held.length), held, false), held.length);
    }
    if (code === BUSY) {
      if (process.platform === "linux") {
        const controller = new AbortController();
        const cancel = () => controller.abort(new Error("Factory reservation interrupted"));
        process.once("SIGINT", cancel);
        process.once("SIGTERM", cancel);
        try {
          const reservation = await reserveLinuxSlots(
            slotLocks(),
            clamp(step.slots),
            Math.max(clamp(step.slots), clamp(step.maxSlots ?? slotCount())),
            controller.signal,
            () => console.log("factory: waiting for the first available slot set"),
          );
          try {
            controller.signal.throwIfAborted();
            const held = reservation.held;
            // The waiter processes already hold these locks; never flock them a second time.
            const argv = [...(multi() ? ["taskset", "-c", cpuList(held)] : []), "nice", "-n", "10", ...withJobs(step.argv, held.length)];
            const n = String(jobs(held.length));
            const child = Bun.spawn(argv, { cwd: step.cwd, env: { ...env(), BUN_FACTORY_JOBS: n, CARGO_BUILD_JOBS: n, CMAKE_BUILD_PARALLEL_LEVEL: n }, stdio: ["inherit", "inherit", "inherit"] });
            const stop = () => child.kill();
            controller.signal.addEventListener("abort", stop, { once: true });
            try { code = await child.exited; } finally { controller.signal.removeEventListener("abort", stop); }
          } finally { await reservation.release(); }
        } finally {
          process.removeListener("SIGINT", cancel);
          process.removeListener("SIGTERM", cancel);
        }
      } else {
        const sets = slotSets(clamp(step.slots));
        const held = sets[process.pid % sets.length]!;
        console.log(`factory: too few free slots, waiting for ${held.map(i => slotLocks()[i]).join(", ")}`);
        code = spawn(step.cwd, wrap(withJobs(step.argv, held.length), held, true), held.length);
      }
    }
  }
  if (code !== 0) throw new Error(`exit ${code}: ${step.argv.join(" ")}`);
}

export function slots(): { lock: string; cpus: string; taken: boolean }[] {
  if (process.platform === "win32")
    return slotLocks().map((lock, i) => {
      const release = windowsSlotLock(i, false);
      const taken = !release;
      release?.();
      return { lock, cpus: "all", taken };
    });
  return slotLocks().map((lock, i) => ({
    lock,
    cpus: multi() ? cpuList([i]) : "all",
    taken: Bun.spawnSync(["flock", "-n", "-E", String(BUSY), lock, "true"]).exitCode === BUSY,
  }));
}

/** Kernel-owned mutex handles release after process death, including an interrupted build. */
export function windowsSlotLock(slot: number, wait: boolean): (() => void) | undefined {
  if (process.platform !== "win32") throw new Error("Windows factory locks require Windows");
  const lock = slotLocks()[slot];
  if (!lock) throw new RangeError("Unknown factory slot");
  const { dlopen, ptr } = require("bun:ffi") as typeof import("bun:ffi");
  const kernel = dlopen("kernel32.dll", {
    CreateMutexW: { args: ["ptr", "i32", "ptr"], returns: "ptr" },
    WaitForSingleObject: { args: ["ptr", "u32"], returns: "u32" },
    ReleaseMutex: { args: ["ptr"], returns: "i32" },
    CloseHandle: { args: ["ptr"], returns: "i32" },
  });
  const digest = new Bun.CryptoHasher("sha256").update(lock.toLowerCase()).digest("hex");
  const name = Buffer.from(`Global\\BunFactory-${digest}\0`, "utf16le");
  const handle = kernel.symbols.CreateMutexW(null, 0, ptr(name));
  if (!handle) {
    kernel.close();
    throw new Error("CreateMutexW failed for factory slot");
  }
  const status = kernel.symbols.WaitForSingleObject(handle, wait ? 30_000 : 0);
  if (status !== 0 && status !== 0x80) {
    kernel.symbols.CloseHandle(handle);
    kernel.close();
    if (status === 258) return undefined;
    throw new Error(`Factory mutex wait failed: ${status}`);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const ok = kernel.symbols.ReleaseMutex(handle);
    kernel.symbols.CloseHandle(handle);
    kernel.close();
    if (!ok) throw new Error("Factory mutex release failed");
  };
}

async function depot(dry: boolean) {
  const d = google.depotTools;
  if (!existsSync(join(d, ".git")))
    await run(
      {
        cwd: google.home,
        argv: ["git", "clone", "https://chromium.googlesource.com/chromium/tools/depot_tools.git", d],
        slots: 0,
      },
      dry,
    );
  await run({ cwd: d, argv: ["./update_depot_tools"], slots: 0 }, dry);
}

async function timer(dry: boolean) {
  const dir = join(google.home, ".config/systemd/user");
  const service = `[Unit]\nDescription=Update depot_tools\n\n[Service]\nType=oneshot\nWorkingDirectory=${google.depotTools}\nExecStart=${google.depotTools}/update_depot_tools\nNice=10\n`;
  const unit = `[Unit]\nDescription=Daily depot_tools update\n\n[Timer]\nOnCalendar=daily\nRandomizedDelaySec=1h\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n`;
  console.log(`${dir}/depot-tools-update.{service,timer}`);
  if (dry) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "depot-tools-update.service"), service);
  writeFileSync(join(dir, "depot-tools-update.timer"), unit);
  await run({ cwd: google.home, argv: ["systemctl", "--user", "daemon-reload"], slots: 0 }, false);
  await run(
    { cwd: google.home, argv: ["systemctl", "--user", "enable", "--now", "depot-tools-update.timer"], slots: 0 },
    false,
  );
}

export async function main(argv = process.argv.slice(2)) {
  if (argv[0] === "--windows-locks") {
    const separator = argv.indexOf("--");
    if (separator !== 3 || !["wait", "try"].includes(argv[1]!)) throw new Error("Invalid Windows factory lock command");
    const held = argv[2]!.split(",").map(Number);
    if (!held.length || held.some((slot, i) => !Number.isInteger(slot) || slot < 0 || (i > 0 && slot <= held[i - 1]!)))
      throw new Error("Factory slots must be unique and ascending");
    const releases: (() => void)[] = [];
    try {
      for (const slot of held) {
        const release = windowsSlotLock(slot, argv[1] === "wait");
        if (!release) {
          process.exitCode = BUSY;
          return;
        }
        releases.push(release);
      }
      const command = argv.slice(separator + 1);
      if (!command.length) throw new Error("Factory lock command requires an executable");
      const { Job } = await import("bun:windows");
      using job = new Job({ killOnClose: true });
      const n = String(jobs(held.length));
      const child = job.spawn(command, {
        cwd: process.cwd(),
        env: { ...env(), BUN_FACTORY_JOBS: n, CARGO_BUILD_JOBS: n, CMAKE_BUILD_PARALLEL_LEVEL: n },
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        windowsHide: true,
      });
      process.exitCode = await child.exited;
    } finally {
      for (const release of releases.reverse()) release();
    }
    return;
  }
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
      return run({ cwd: process.cwd(), argv: command, slots: n, ...(max ? { maxSlots: Number(max) } : {}) }, dry);
    }
    case "lane": {
      if (!dry && process.platform !== "linux") throw new Error("Product build lanes run on the VPS only");
      return run(lane(name!, command), dry);
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
      for (const s of plan(name!, config).filter(pick)) await run(s, dry);
      return;
    }
    default:
      console.log(HELP);
  }
}

if (import.meta.main) await main();
