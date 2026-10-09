// Arena: the fork against upstream Bun (gating) and the pinned Deno (informative) on the same
// shared workloads, under the bench method (C:/aphrody/docs/plans/fusion/bench/METHOD.md, C1 to C14).
//
//   bun bench/aphrody/arena/arena.ts [--bun <fork>] [--upstream <bun>] [--deno <deno> [--deno-sha256 <hex>]]
//       [--only startup,compute,json,realm,serve,fetch,sqlite,gzip,ffi] [--profiles name,name|all]
//       [--procs 5] [--iters 15] [--warmup 10] [--startup-runs 30] [--no-probes]
//       [--locks dir:dir] [--out bench/aphrody/arena/results] [--name label] [--gate] [--list]
//       [--container alpine|ubuntu [--container-cpus n]]
//
// Every workload runs in `--procs` fresh processes per target, interleaved (A, B, C, then C, B, A...).
// Inside a process: one cold call reported apart, `--warmup` calls dropped (never fewer than 10 for
// compute), `--iters` timed calls. The process is the statistical unit: the verdict uses one median per
// process and an exact rank-sum test. Children run under `nice -n 10`. The raw result (§6 format) lands in
// `--out/<UTC>-<name>.json`. Exit code: 0, or 1 with --gate when the fork regresses against upstream,
// 2 on a harness error. `--container` re-runs the same command in the local Docker container of
// scripts/aphrody/tmux.ts (never a remote host); binary paths are then container paths.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, getPriority, hostname, loadavg, platform, release, totalmem } from "node:os";
import { basename, join, resolve } from "node:path";

const here = import.meta.dir;
const root = resolve(here, "..", "..", "..");
const sharedDir = join(here, "shared");
const isWin = platform() === "win32";

export const WORKLOADS = {
  startup: "engine",
  compute: "engine",
  json: "engine",
  realm: "runtime",
  serve: "runtime",
  fetch: "runtime",
  sqlite: "runtime",
  gzip: "runtime",
  ffi: "runtime",
} as const;
export type Workload = keyof typeof WORKLOADS;

// ---------------------------------------------------------------------------------------------------------------
// Statistics (pure, tested in test/internal/aphrody-perf-gate.test.ts)

export type Summary = { n: number; min: number; median: number; mean: number; p95: number; max: number; mad: number };

function median(sorted: number[]): number {
  const n = sorted.length;
  if (!n) return NaN;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

export function summarize(samples: number[]): Summary {
  const s = [...samples].sort((a, b) => a - b);
  const n = s.length;
  const med = median(s);
  const dev = s.map(v => Math.abs(v - med)).sort((a, b) => a - b);
  return {
    n,
    min: s[0],
    median: med,
    mean: s.reduce((a, b) => a + b, 0) / n,
    p95: s[Math.min(n - 1, Math.max(0, Math.ceil(0.95 * n) - 1))],
    max: s[n - 1],
    mad: median(dev),
  };
}

/**
 * Exact Wilcoxon rank-sum (Mann-Whitney) distribution, ties given average ranks.
 * `greater`: P(W >= w) under the null, small when `a` is larger (slower) than `b`.
 */
export function rankSumP(a: number[], b: number[]): { greater: number; less: number; two: number } {
  if (!a.length || !b.length) return { greater: 1, less: 1, two: 1 };
  const all = [...a.map(v => ({ v, g: 0 })), ...b.map(v => ({ v, g: 1 }))].sort((x, y) => x.v - y.v);
  const N = all.length;
  const r2 = new Array<number>(N);
  for (let i = 0; i < N; ) {
    let j = i;
    while (j + 1 < N && all[j + 1].v === all[i].v) j++;
    for (let k = i; k <= j; k++) r2[k] = i + 1 + (j + 1);
    i = j + 1;
  }
  let w = 0;
  for (let i = 0; i < N; i++) if (all[i].g === 0) w += r2[i];
  const n = a.length;
  const maxS = r2.reduce((s, x) => s + x, 0);
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(maxS + 1));
  dp[0][0] = 1;
  for (let i = 0; i < N; i++) {
    const r = r2[i];
    for (let k = Math.min(i + 1, n); k >= 1; k--) {
      const prev = dp[k - 1];
      const cur = dp[k];
      for (let s = maxS; s >= r; s--) if (prev[s - r]) cur[s] += prev[s - r];
    }
  }
  let total = 0,
    ge = 0,
    le = 0;
  dp[n].forEach((c, s) => {
    total += c;
    if (s >= w) ge += c;
    if (s <= w) le += c;
  });
  return { greater: ge / total, less: le / total, two: Math.min(1, (2 * Math.min(ge, le)) / total) };
}

/** METHOD §3.4: median gap > max(5 %, 3 x MAD) and [min, p95] ranges disjoint. */
export function realDifference(a: Summary, b: Summary): boolean {
  const gap = Math.abs(a.median - b.median);
  const floor = Math.max(0.05 * Math.abs(b.median), 3 * Math.max(a.mad, b.mad));
  return gap > floor && (a.min > b.p95 || b.min > a.p95);
}

export type Limit = { maxRatio?: number; maxDeltaBytes?: number; alpha?: number };
export type MetricResult = {
  unit: "ms" | "bytes";
  summary: Summary;
  procMedians: number[];
  cold: number[];
  drift: number;
};
export type Comparison = {
  metric: string;
  a: string;
  b: string;
  unit: "ms" | "bytes";
  ratio: number;
  delta: number;
  real: boolean;
  p: number;
  gated: boolean;
  regression: boolean;
  reason?: string;
};

/** `a` is the candidate, `b` the baseline; every arena metric is lower-is-better. */
export function compare(
  metric: string,
  aId: string,
  bId: string,
  a: MetricResult,
  b: MetricResult,
  gated: boolean,
  limit: Limit = {},
): Comparison {
  const ratio = a.summary.median / b.summary.median;
  const delta = a.summary.median - b.summary.median;
  const real = realDifference(a.summary, b.summary);
  const p = rankSumP(a.procMedians, b.procMedians).greater;
  const alpha = limit.alpha ?? 0.05;
  const reasons: string[] = [];
  if (delta > 0 && real && p <= alpha) {
    if (a.unit === "bytes") {
      if (delta > (limit.maxDeltaBytes ?? 4 * 1048576))
        reasons.push(`+${(delta / 1048576).toFixed(2)} MiB (p=${p.toFixed(4)})`);
    } else if (ratio > (limit.maxRatio ?? 1.05)) {
      reasons.push(`ratio ${ratio.toFixed(3)} (p=${p.toFixed(4)})`);
    }
  }
  const reason = reasons.join("; ") || undefined;
  return { metric, a: aId, b: bId, unit: a.unit, ratio, delta, real, p, gated, regression: gated && !!reason, reason };
}

export type Verdict = "valide" | "indicatif" | "invalide" | "à reproduire";
export function verdictOf(failedChecks: string[]): Verdict {
  if (failedChecks.some(f => /^C(3|13)\b/.test(f))) return "invalide";
  if (failedChecks.some(f => /^C7\b.*(lock|load)/.test(f))) return "à reproduire";
  return failedChecks.length ? "indicatif" : "valide";
}

// ---------------------------------------------------------------------------------------------------------------
// Host, hashes, locks

type Target = {
  id: string;
  kind: "bun" | "deno";
  role: "fork" | "upstream" | "deno" | "profile";
  path: string;
  env: Record<string, string>;
};

function sha256File(path: string): string {
  return new Bun.CryptoHasher("sha256").update(readFileSync(path)).digest("hex");
}

function sh(cmd: string[], env?: Record<string, string>, timeout = 30000) {
  try {
    const p = Bun.spawnSync(cmd, {
      env: env ?? (process.env as Record<string, string>),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      timeout,
    });
    return { code: p.exitCode ?? -1, out: p.stdout.toString(), err: p.stderr.toString(), signal: p.signalCode };
  } catch (e) {
    return { code: -1, out: "", err: String(e), signal: null };
  }
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

type CpuStat = { user: number; nice: number; total: number; steal: number };
function cpuStat(): CpuStat | undefined {
  const line = readText("/proc/stat")?.split("\n")[0];
  if (!line?.startsWith("cpu ")) return undefined;
  const v = line.trim().split(/\s+/).slice(1).map(Number);
  return { user: v[0], nice: v[1], steal: v[7] ?? 0, total: v.slice(0, 8).reduce((a, b) => a + b, 0) };
}

function glibc(): string {
  try {
    const g = (process as any).report?.getReport?.()?.header?.glibcVersionRuntime;
    if (g) return g;
  } catch {}
  if (isWin) return "n/a";
  const r = sh(["ldd", "--version"]);
  const text = `${r.out}\n${r.err}`;
  if (/musl/i.test(text)) return `musl ${/Version\s+([\d.]+)/.exec(text)?.[1] ?? ""}`.trim();
  return /([\d]+\.[\d]+)\s*$/m.exec(r.out.split("\n")[0] ?? "")?.[1] ?? "n/d";
}

function hostInfo() {
  return {
    name: hostname(),
    kernel: `${platform()} ${release()} ${arch()}`,
    cpu: cpus()[0]?.model.trim(),
    nproc: cpus().length,
    ramMiB: Math.round(totalmem() / 1048576),
    governor: readText("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor")?.trim() ?? "n/d",
    glibc: glibc(),
    container: existsSync("/.dockerenv") || existsSync("/run/.containerenv"),
    load: { before: loadavg(), after: [] as number[] },
  };
}

/** C7: a lock file always exists; only `flock -n` tells whether it is held. */
function lockState(dirs: string[]) {
  const flock = Bun.which("flock");
  const out: { file: string; state: "free" | "held" | "unknown" }[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of new Bun.Glob("*.lock").scanSync(dir)) {
      const file = join(dir, f);
      if (!flock) out.push({ file, state: "unknown" });
      else out.push({ file, state: sh([flock, "-n", file, "true"]).code === 0 ? "free" : "held" });
    }
  }
  return out;
}

function revisionOf(t: Target) {
  if (t.kind === "deno") {
    const v = sh([t.path, "--version"]).out;
    return { version: /deno\s+(\S+)/.exec(v)?.[1] ?? "?", v8: /v8\s+(\S+)/.exec(v)?.[1] ?? "?" };
  }
  const rev = sh([t.path, "--revision"]).out.trim();
  const webkit = sh([t.path, "-p", "process.versions.webkit"]).out.trim();
  return { version: rev, webkit };
}

// ---------------------------------------------------------------------------------------------------------------
// Capability probes (METHOD §5): PASS/FAIL, never speed

const P2 = `const vm = await import("node:vm"); const t = performance.now(); let threw = false;
try { vm.runInNewContext("for(;;){}", {}, { timeout: 200 }); } catch { threw = true; }
const ms = performance.now() - t; console.log(JSON.stringify({ threw, ms, after: vm.runInNewContext("1+1") }));`;
const P1 = "const a = []; for (;;) a.push(new Array(1e5).fill(Math.random()));";

function evalCmd(t: Target, code: string, flags: string[] = []): string[] {
  return t.kind === "deno" ? [t.path, "eval", ...flags, code] : [t.path, ...flags, "-e", code];
}

function probes(t: Target, baseEnv: Record<string, string>) {
  const res: Record<string, { status: "PASS" | "FAIL" | "n/a"; detail: string }> = {};
  const p1 = sh(
    evalCmd(t, P1, t.kind === "deno" ? ["--v8-flags=--max-old-space-size=64"] : ["--max-old-space-size=64"]),
    baseEnv,
    120000,
  );
  res.P1 = {
    status: p1.code !== 0 && p1.code !== -1 && /heap/i.test(p1.err) ? "PASS" : "FAIL",
    detail: `exit ${p1.code}${p1.signal ? ` ${p1.signal}` : ""}; ${p1.err.trim().split("\n").slice(-1)[0]?.slice(0, 160) ?? ""}; METHOD P1 also asks the process to survive (realm host), not covered by a CLI`,
  };
  const p2 = sh(evalCmd(t, P2), baseEnv);
  try {
    const j = JSON.parse(p2.out.trim().split("\n").pop()!);
    res.P2 = { status: j.threw && j.ms <= 400 && j.after === 2 ? "PASS" : "FAIL", detail: JSON.stringify(j) };
  } catch {
    res.P2 = { status: "FAIL", detail: `exit ${p2.code}: ${p2.err.slice(0, 200)}` };
  }
  if (platform() === "linux") {
    const env = { ...baseEnv, LANG: "fr_FR.UTF-8" };
    delete env.LC_ALL;
    delete env.LC_MESSAGES;
    const p3 = sh(evalCmd(t, "console.log(new Intl.DateTimeFormat().resolvedOptions().locale)"), env);
    res.P3 = {
      status: p3.out.trim().startsWith("fr") ? "PASS" : "FAIL",
      detail: `LANG=fr_FR.UTF-8 -> ${p3.out.trim() || p3.err.slice(0, 120)}`,
    };
  } else res.P3 = { status: "n/a", detail: "LANG drives the default locale on Linux only" };
  if (t.kind === "deno") {
    const ok = sh(evalCmd(t, "console.log(1)", ["--v8-flags=--jitless"]), baseEnv);
    const bad = sh(evalCmd(t, "console.log(1)", ["--v8-flags=--arena-not-a-flag"]), baseEnv);
    res.P4 = {
      status: ok.code === 0 && (bad.code !== 0 || bad.err.trim() !== "") ? "PASS" : "FAIL",
      detail: `jitless exit ${ok.code}; unknown flag exit ${bad.code} ${bad.err.trim().slice(0, 120)}`,
    };
    res.P5 = { status: "n/a", detail: "no drainMicrotasks() in the Deno CLI" };
  } else {
    const ok = sh(evalCmd(t, "console.log(1)"), { ...baseEnv, BUN_JSC_useJIT: "0" });
    const bad = sh(evalCmd(t, "console.log(1)"), { ...baseEnv, BUN_JSC_arenaNotAnOption: "1" });
    res.P4 = {
      status: ok.code === 0 && (bad.code !== 0 || bad.err.trim() !== "") ? "PASS" : "FAIL",
      detail: `useJIT=0 exit ${ok.code}; unknown option exit ${bad.code} ${bad.err.trim().slice(0, 120)}`,
    };
    const p5 = sh(
      evalCmd(
        t,
        'const { drainMicrotasks } = require("bun:jsc"); let x = 0; Promise.resolve().then(() => { x = 1; }); drainMicrotasks(); console.log(x);',
      ),
      baseEnv,
    );
    res.P5 = {
      status: p5.out.trim() === "1" ? "PASS" : "FAIL",
      detail: `printed ${p5.out.trim() || p5.err.slice(0, 120)}`,
    };
  }
  return res;
}

// ---------------------------------------------------------------------------------------------------------------
// Runner

export type ArenaOptions = {
  bun: string;
  upstream?: string;
  deno?: string;
  denoSha256?: string;
  only?: Workload[];
  profiles?: string[];
  procs?: number;
  iters?: number;
  warmup?: number;
  startupRuns?: number;
  probes?: boolean;
  lockDirs?: string[];
  outDir?: string;
  name?: string;
  command?: string;
  limit?: Limit;
};

export type ArenaResult = {
  command: string;
  host: ReturnType<typeof hostInfo>;
  revisions: Record<string, unknown>;
  hashes: { binaries: Record<string, string>; sources: Record<string, string> };
  n: { procs: number; iters: number; warmup: number; computeWarmup: number; startupRuns: number };
  flags: Record<string, unknown>;
  targets: { id: string; role: string; path: string; env: Record<string, string> }[];
  results: Record<string, Record<string, MetricResult & { samples: number[] }>>;
  checksums: Record<string, Record<string, string[]>>;
  comparisons: Comparison[];
  info: Record<string, Record<string, unknown>>;
  probes: Record<string, ReturnType<typeof probes>>;
  checks: Record<string, string>;
  errors: string[];
  durationS: number;
  verdict: Verdict;
  failedChecks: string[];
  regressions: Comparison[];
  file?: string;
};

function denoPin(): string | undefined {
  const pin = JSON.parse(readFileSync(join(here, "deno.pin.json"), "utf8"));
  return pin.sha256?.[`${platform()}-${arch()}`];
}

function loadProfiles(names: string[]): Record<string, Record<string, string>> {
  const all: Record<string, Record<string, string>> = JSON.parse(
    readFileSync(join(here, "profiles.json"), "utf8"),
  ).profiles;
  const want = names.includes("all") ? Object.keys(all) : names;
  const out: Record<string, Record<string, string>> = {};
  for (const n of want) {
    if (!all[n]) throw new Error(`unknown profile ${n} (profiles.json: ${Object.keys(all).join(", ")})`);
    out[n] = all[n];
  }
  return out;
}

async function startFetchPeer(cmdPrefix: string[], fork: string, env: Record<string, string>) {
  const proc = Bun.spawn([...cmdPrefix, fork, join(sharedDir, "fetch-server.mjs")], {
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
  });
  const reader = proc.stdout.getReader();
  let buf = "";
  while (!buf.includes("\n")) {
    const { value, done } = await reader.read();
    if (done) throw new Error("fetch-server.mjs exited before printing its port");
    buf += new TextDecoder().decode(value);
  }
  reader.releaseLock();
  return {
    url: `http://127.0.0.1:${Number(buf.trim().split("\n")[0])}/`,
    stop: async () => {
      proc.stdin.end();
      await Promise.race([proc.exited, Bun.sleep(5000)]);
      proc.kill();
    },
  };
}

export async function runArena(o: ArenaOptions): Promise<ArenaResult> {
  const t0 = performance.now();
  const procs = o.procs ?? 5;
  const iters = o.iters ?? 15;
  const warmup = o.warmup ?? 10;
  const startupRuns = o.startupRuns ?? 30;
  const only = o.only ?? (Object.keys(WORKLOADS) as Workload[]);
  const errors: string[] = [];
  const failed: string[] = [];
  const checks: Record<string, string> = {};

  // Inherited BUN_JSC_* would put fork and upstream in a JIT state nobody chose (C5): drop and record them.
  const baseEnv: Record<string, string> = {};
  const dropped: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k.startsWith("BUN_JSC_")) dropped[k] = v;
    else baseEnv[k] = v;
  }
  Object.assign(baseEnv, {
    NO_COLOR: "1",
    BUN_DEBUG_QUIET_LOGS: "1",
    ARENA_ITERS: String(iters),
    ARENA_WARMUP: String(warmup),
  });

  const targets: Target[] = [{ id: "fork", kind: "bun", role: "fork", path: resolve(o.bun), env: {} }];
  if (o.upstream) targets.push({ id: "upstream", kind: "bun", role: "upstream", path: resolve(o.upstream), env: {} });
  if (o.deno) targets.push({ id: "deno", kind: "deno", role: "deno", path: resolve(o.deno), env: {} });
  for (const [name, env] of Object.entries(loadProfiles(o.profiles ?? [])))
    targets.push({ id: `fork@${name}`, kind: "bun", role: "profile", path: resolve(o.bun), env });
  for (const t of targets) if (!existsSync(t.path)) throw new Error(`${t.id}: binary not found: ${t.path}`);

  // C1, C2: binaries identified by sha256 before anything runs.
  const binaries: Record<string, string> = {};
  for (const t of targets) if (t.role !== "profile") binaries[t.id] = sha256File(t.path);
  if (o.deno) {
    const want = o.denoSha256 ?? denoPin();
    if (!want) throw new Error(`no pinned Deno sha256 for ${platform()}-${arch()}: pass --deno-sha256`);
    if (binaries.deno !== want.toLowerCase()) throw new Error(`C2: deno sha256 ${binaries.deno} != pinned ${want}`);
    checks.C2 = `PASS sha256 ${want}`;
  } else checks.C2 = "n/a (no --deno)";

  const sourceFiles = [...new Bun.Glob("*.mjs").scanSync(sharedDir)].sort();
  const sources: Record<string, string> = {};
  for (const f of sourceFiles) sources[`shared/${f}`] = sha256File(join(sharedDir, f));
  sources["arena.ts"] = sha256File(join(here, "arena.ts"));

  const revisions: Record<string, unknown> = {};
  for (const t of targets) if (t.role !== "profile") revisions[t.id] = revisionOf(t);

  const host = hostInfo();
  const lockDirs = o.lockDirs ?? ["/home/ubuntu/build/locks", join(root, "tmp", "locks")];
  const locksBefore = lockState(lockDirs);
  const statBefore = cpuStat();
  const niceBin = isWin ? null : Bun.which("nice");
  const alreadyNiced = !isWin && getPriority() >= 10;
  const prefix = niceBin && !alreadyNiced ? [niceBin, "-n", "10"] : [];
  const niced = alreadyNiced || prefix.length > 0;

  const cmdFor = (t: Target, file: string) =>
    t.kind === "deno" ? [...prefix, t.path, "run", "-A", "--quiet", file] : [...prefix, t.path, file];

  const results: ArenaResult["results"] = {};
  const checksums: ArenaResult["checksums"] = {};
  const info: ArenaResult["info"] = {};
  const temporal: Record<string, Record<string, number[]>> = {};
  const put = (metric: string, t: Target, unit: "ms" | "bytes", samples: number[], cold?: number) => {
    const slot = ((results[metric] ??= {})[t.id] ??= {
      unit,
      summary: undefined as any,
      procMedians: [],
      cold: [],
      drift: 0,
      samples: [],
    });
    slot.samples.push(...samples);
    slot.procMedians.push(median([...samples].sort((a, b) => a - b)));
    if (cold !== undefined) slot.cold.push(cold);
    ((temporal[metric] ??= {})[t.id] ??= []).push(...samples);
  };
  const order = (i: number) => (i % 2 ? [...targets].reverse() : targets);
  const runChild = (t: Target, w: Workload, extraEnv: Record<string, string> = {}) => {
    const file = join(sharedDir, `${w}.mjs`);
    const start = Bun.nanoseconds();
    const p = Bun.spawnSync(cmdFor(t, file), {
      env: { ...baseEnv, ...t.env, ...extraEnv },
      cwd: here,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      timeout: 300000,
    });
    const wall = (Bun.nanoseconds() - start) / 1e6;
    if (p.exitCode !== 0)
      throw new Error(
        `${w} (${t.id}) exit ${p.exitCode}${p.signalCode ? ` ${p.signalCode}` : ""}: ${p.stderr.toString().slice(0, 400)}`,
      );
    const line = p.stdout.toString().trim().split(/\r?\n/).pop() ?? "";
    return { wall, out: JSON.parse(line) };
  };
  const hwmSources = new Set<string>();

  let peer: Awaited<ReturnType<typeof startFetchPeer>> | undefined;
  if (only.includes("fetch")) peer = await startFetchPeer(prefix, targets[0].path, baseEnv);
  try {
    for (const w of only) {
      const failedTargets = new Set<string>();
      const sums = (checksums[w] ??= {});
      if (w === "startup") {
        for (let i = 0; i < startupRuns + 5; i++) {
          for (const t of order(i)) {
            if (failedTargets.has(t.id)) continue;
            try {
              const r = runChild(t, w);
              if (i < 5) continue;
              put("startup.wall", t, "ms", [r.wall]);
              put("startup.hwm", t, "bytes", [r.out.hwm]);
              hwmSources.add(r.out.hwmSource);
              (sums[t.id] ??= []).push(r.out.checksum);
            } catch (e) {
              failedTargets.add(t.id);
              errors.push((e as Error).message);
            }
          }
        }
        continue;
      }
      for (let i = 0; i < procs; i++) {
        for (const t of order(i)) {
          if (failedTargets.has(t.id)) continue;
          try {
            const r = runChild(t, w, peer && w === "fetch" ? { ARENA_FETCH_URL: peer.url } : {});
            for (const [part, samples] of Object.entries(r.out.samples as Record<string, number[]>)) {
              if (samples.length) put(`${w}.${part}`, t, "ms", samples, r.out.cold[part]);
              else put(`${w}.${part}`, t, "ms", [r.out.cold[part]]);
            }
            put(`${w}.hwm`, t, "bytes", [r.out.hwm]);
            hwmSources.add(r.out.hwmSource);
            (sums[t.id] ??= []).push(r.out.checksum);
            if (Object.keys(r.out.info ?? {}).length) (info[w] ??= {})[t.id] = r.out.info;
          } catch (e) {
            failedTargets.add(t.id);
            errors.push((e as Error).message);
          }
        }
      }
    }
  } finally {
    await peer?.stop();
  }

  for (const [metric, byTarget] of Object.entries(results)) {
    for (const [id, r] of Object.entries(byTarget)) {
      r.summary = summarize(r.samples);
      const seq = temporal[metric][id];
      const half = Math.floor(seq.length / 2);
      if (half >= 2) {
        const m1 = median(seq.slice(0, half).sort((a, b) => a - b));
        const m2 = median(seq.slice(half).sort((a, b) => a - b));
        r.drift = (m2 - m1) / m1;
      }
    }
  }

  const probeResults: ArenaResult["probes"] = {};
  if (o.probes !== false) for (const t of targets) if (t.role !== "profile") probeResults[t.id] = probes(t, baseEnv);

  // ---- checks
  checks.C1 =
    binaries.fork && (revisions.fork as any)?.version ? `PASS ${(revisions.fork as any).version}` : "FAIL no revision";

  const c3: string[] = [];
  for (const [w, byTarget] of Object.entries(checksums)) {
    const distinct = new Set(Object.values(byTarget).flat());
    if (distinct.size > 1) c3.push(`${w}: ${JSON.stringify(byTarget)}`);
  }
  for (const e of errors) c3.push(`run error: ${e.split("\n")[0]}`);
  checks.C3 = c3.length ? `FAIL ${c3.join(" | ")}` : "PASS same sources, checksums equal across targets";

  const revText = JSON.stringify(revisions);
  checks.C4 = /debug|asan/i.test(revText)
    ? `FAIL debug/asan build in ${revText}`
    : "PASS no debug/asan marker in revisions";

  checks.C5 = Object.keys(dropped).length
    ? `PASS JIT at defaults for fork/upstream/deno; dropped inherited ${JSON.stringify(dropped)}; profiles change it on fork@* only`
    : "PASS JIT at defaults for fork/upstream/deno; profiles change it on fork@* only";

  const c6: string[] = [];
  if (iters < 10) c6.push(`iters ${iters} < 10`);
  for (const [metric, byTarget] of Object.entries(results)) {
    if (metric.endsWith(".hwm") || metric === "startup.wall") continue;
    const drifting = Object.entries(byTarget).filter(([, r]) => Math.abs(r.drift) > 0.05);
    const all = Object.keys(byTarget).length;
    const sameWay =
      drifting.length === all && drifting.every(([, r]) => Math.sign(r.drift) === Math.sign(drifting[0][1].drift));
    if (drifting.length && !sameWay)
      c6.push(`${metric}: ${drifting.map(([id, r]) => `${id} ${(r.drift * 100).toFixed(1)} %`).join(", ")}`);
  }
  checks.C6 = c6.length
    ? `FAIL ${c6.join("; ")}`
    : `PASS warmup ${warmup} (compute ${Math.max(10, warmup)}), ${iters} timed, halves within 5 %`;

  host.load.after = loadavg();
  const statAfter = cpuStat();
  const locksAfter = lockState(lockDirs);
  const durationS = (performance.now() - t0) / 1000;
  const c7: string[] = [];
  if (!niced) c7.push("nice -n 10 unavailable");
  if (host.load.before[0] > 0.17 * host.nproc)
    c7.push(`load before ${host.load.before[0].toFixed(2)} > ${(0.17 * host.nproc).toFixed(2)}`);
  const held = [...locksBefore, ...locksAfter].filter(l => l.state !== "free");
  if (held.length) c7.push(`lock ${held.map(l => `${basename(l.file)} ${l.state}`).join(", ")}`);
  if (statBefore && statAfter) {
    const dt = statAfter.total - statBefore.total;
    const steal = dt ? (statAfter.steal - statBefore.steal) / dt : 0;
    const foreign = (statAfter.user - statBefore.user) / (durationS * 100);
    if (steal >= 0.02) c7.push(`steal ${(steal * 100).toFixed(2)} %`);
    if (foreign > 0.05) c7.push(`non-nice user CPU ${(foreign * 100).toFixed(1)} % of a vCPU`);
  } else c7.push("/proc/stat n/d (steal and foreign CPU unchecked)");
  checks.C7 = c7.length ? `FAIL ${c7.join("; ")}` : "PASS calm host, locks free, nice 10, interleaved";

  checks.C8 =
    only.includes("startup") || only.includes("realm")
      ? "PASS S1 (startup.wall), S3 (realm.s3), S4 (realm.s4.*) measured apart"
      : "n/a (startup and realm not selected)";
  checks.C9 = `PASS lanes declared: engine = ${only.filter(w => WORKLOADS[w] === "engine").join(", ") || "-"}; runtime (R1, never used for #8) = ${only.filter(w => WORKLOADS[w] === "runtime").join(", ") || "-"}`;
  checks.C10 =
    hwmSources.size === 1 && hwmSources.has("VmHWM")
      ? "PASS VmHWM read by each child"
      : `FAIL peak RSS source ${[...hwmSources].join(",") || "none"}`;
  checks.C11 =
    "PASS declared: Deno runs without the Obscura bootstrap snapshot; JSC evaluates at startup (internal module bytecode only with BUN_COMPILE_CACHE_BUILTINS=1); realm.s4.cache is node:vm cachedData on both sides";
  checks.C12 = o.probes === false ? "FAIL probes skipped (--no-probes)" : "PASS P1..P5 run as PASS/FAIL probes";

  const binariesAfter: Record<string, string> = {};
  for (const t of targets) if (t.role !== "profile") binariesAfter[t.id] = sha256File(t.path);
  const sourcesAfter: Record<string, string> = {};
  for (const f of sourceFiles) sourcesAfter[`shared/${f}`] = sha256File(join(sharedDir, f));
  sourcesAfter["arena.ts"] = sha256File(join(here, "arena.ts"));
  checks.C13 =
    JSON.stringify(binariesAfter) === JSON.stringify(binaries) &&
    JSON.stringify(sourcesAfter) === JSON.stringify(sources)
      ? "PASS binaries and sources unchanged (sha256 before = after)"
      : "FAIL a binary or a shared source changed during the session";
  checks.C14 = "PASS raw result archived";
  if (durationS > 300) checks["§3.6"] = `note: session ${durationS.toFixed(0)} s > 5 min`;

  for (const [k, v] of Object.entries(checks)) if (v.startsWith("FAIL")) failed.push(`${k} ${v.slice(5)}`);

  // ---- comparisons: fork vs upstream gates, everything else informs
  const comparisons: Comparison[] = [];
  for (const [metric, byTarget] of Object.entries(results)) {
    const f = byTarget.fork;
    if (!f) continue;
    if (byTarget.upstream) comparisons.push(compare(metric, "fork", "upstream", f, byTarget.upstream, true, o.limit));
    if (byTarget.deno) comparisons.push(compare(metric, "fork", "deno", f, byTarget.deno, false, o.limit));
    for (const t of targets)
      if (t.role === "profile" && byTarget[t.id])
        comparisons.push(compare(metric, t.id, "fork", byTarget[t.id], f, false, o.limit));
  }
  const regressions = comparisons.filter(c => c.regression);

  const result: ArenaResult = {
    command: o.command ?? `bun bench/aphrody/arena/arena.ts`,
    host,
    revisions,
    hashes: { binaries, sources },
    n: { procs, iters, warmup, computeWarmup: Math.max(10, warmup), startupRuns },
    flags: {
      nice: niced,
      droppedEnv: dropped,
      profiles: Object.fromEntries(targets.filter(t => t.role === "profile").map(t => [t.id, t.env])),
      locks: { before: locksBefore, after: locksAfter },
      limit: o.limit ?? {},
    },
    targets: targets.map(t => ({ id: t.id, role: t.role, path: t.path, env: t.env })),
    results,
    checksums,
    info,
    comparisons,
    probes: probeResults,
    checks,
    errors,
    durationS,
    verdict: verdictOf(failed),
    failedChecks: failed,
    regressions,
  };

  const outDir = o.outDir ?? join(here, "results");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  const name = (o.name ?? `${host.name}-${only.join("-")}`).replace(/[^\w.-]+/g, "_").slice(0, 80);
  result.file = join(outDir, `${stamp}-${name}.json`);
  writeFileSync(result.file, JSON.stringify(result, null, 2));
  return result;
}

export function toMarkdown(r: ArenaResult): string {
  const fmt = (c: Comparison) =>
    c.unit === "bytes" ? `${c.delta >= 0 ? "+" : ""}${(c.delta / 1048576).toFixed(2)} MiB` : `${c.ratio.toFixed(3)}`;
  const lines = [
    `## Arène (${r.verdict})`,
    "",
    `${r.host.name}, ${r.host.kernel}, ${r.host.nproc} vCPU ; ${r.n.procs} processus × ${r.n.iters} itérations ; ${r.durationS.toFixed(0)} s.`,
    "",
    "| Mesure | Candidat | Base | Ratio / écart | Réel | p | Statut |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const c of r.comparisons)
    lines.push(
      `| ${c.metric} | ${c.a} | ${c.b} | ${fmt(c)} | ${c.real ? "oui" : "non"} | ${c.p.toFixed(4)} | ${c.regression ? `ÉCHEC ${c.reason}` : c.gated ? "ok" : "info"} |`,
    );
  lines.push("", r.failedChecks.length ? `Contrôles en défaut : ${r.failedChecks.join(" ; ")}` : "C1 à C14 : PASS.");
  if (r.file) lines.push("", `Résultat brut : \`${r.file}\``);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// CLI

function arg(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function inContainer(argv: string[], distro: string): Promise<number> {
  if (distro !== "alpine" && distro !== "ubuntu") throw new Error("--container expects alpine or ubuntu");
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--container" || argv[i] === "--container-cpus") i++;
    else rest.push(argv[i]);
  }
  const job = `arena-${Date.now().toString(36)}`;
  const tmux = join(root, "scripts", "aphrody", "tmux.ts");
  const cpusOpt = arg(argv, "--container-cpus");
  const run = Bun.spawnSync(
    [
      process.execPath,
      tmux,
      "run",
      job,
      `--${distro}`,
      "--sync",
      ...(cpusOpt ? ["--cpus", cpusOpt] : []),
      "--",
      "bun",
      "bench/aphrody/arena/arena.ts",
      ...rest,
      "--emit-result",
    ],
    { cwd: root, stdout: "inherit", stderr: "inherit" },
  );
  if (run.exitCode !== 0) return 2;
  const wait = Bun.spawnSync([process.execPath, tmux, "wait", job], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  const log = readText(join(root, "tmp", "tmux", `${job}.log`)) ?? "";
  const line = log.split(/\r?\n/).find(l => l.startsWith("ARENA_RESULT "));
  if (!line) {
    console.error(`no ARENA_RESULT in tmp/tmux/${job}.log`);
    return 2;
  }
  const result: ArenaResult = JSON.parse(line.slice("ARENA_RESULT ".length));
  const outDir = resolve(arg(argv, "--out") ?? join(here, "results"));
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, basename(result.file ?? `${job}.json`));
  writeFileSync(file, JSON.stringify({ ...result, file }, null, 2));
  console.log(toMarkdown({ ...result, file }));
  return wait.exitCode ?? 2;
}

export async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help")) {
    console.log(
      readFileSync(import.meta.path, "utf8")
        .split("\n")
        .filter(l => l.startsWith("//"))
        .slice(0, 20)
        .join("\n"),
    );
    return 0;
  }
  if (argv.includes("--list")) {
    for (const [w, lane] of Object.entries(WORKLOADS)) console.log(w, lane);
    return 0;
  }
  const distro = arg(argv, "--container");
  if (distro) return inContainer(argv, distro);
  const only = arg(argv, "--only")?.split(",") as Workload[] | undefined;
  for (const w of only ?? []) if (!(w in WORKLOADS)) throw new Error(`unknown workload ${w}`);
  const thresholds = JSON.parse(readFileSync(join(root, "bench", "aphrody", "thresholds.json"), "utf8"));
  const result = await runArena({
    bun: arg(argv, "--bun") ?? join(root, "build", "release", isWin ? "bun.exe" : "bun"),
    upstream: arg(argv, "--upstream"),
    deno: arg(argv, "--deno"),
    denoSha256: arg(argv, "--deno-sha256") ?? process.env.ARENA_DENO_SHA256,
    only,
    profiles: arg(argv, "--profiles")?.split(","),
    procs: Number(arg(argv, "--procs") ?? 5),
    iters: Number(arg(argv, "--iters") ?? 15),
    warmup: Number(arg(argv, "--warmup") ?? 10),
    startupRuns: Number(arg(argv, "--startup-runs") ?? 30),
    probes: !argv.includes("--no-probes"),
    lockDirs: arg(argv, "--locks")?.split(":"),
    outDir: arg(argv, "--out") ? resolve(arg(argv, "--out")!) : undefined,
    name: arg(argv, "--name"),
    command: ["bun", "bench/aphrody/arena/arena.ts", ...argv].join(" "),
    limit: thresholds.arena,
  });
  console.log(toMarkdown(result));
  if (argv.includes("--emit-result")) console.log(`ARENA_RESULT ${JSON.stringify(result)}`);
  return argv.includes("--gate") && result.regressions.length ? 1 : 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    err => {
      console.error(err instanceof Error ? err.stack : err);
      process.exit(2);
    },
  );
}
