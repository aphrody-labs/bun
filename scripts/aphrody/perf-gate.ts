// Garde de performance du fork : compare le binaire du fork à l'upstream oven-sh/bun de même version.
//
//   bun scripts/aphrody/perf-gate.ts [--fork <bun>] [--upstream <bun> | --upstream-version <x.y.z>]
//       [--config bench/aphrody/thresholds.json] [--runs 40] [--warmup 5] [--engine auto|hyperfine|spawn]
//       [--only id,id] [--out <dir>] [--no-gate] [--strict] [--list]
//
// Sortie : <out>/perf-report.json et <out>/perf-report.md (aussi ajouté à $GITHUB_STEP_SUMMARY).
// Code de sortie : 0 = seuils respectés, 1 = au moins un seuil dépassé, 2 = erreur d'exécution.
// Les cas « wall » (démarrage, build, install) passent par hyperfine s'il est présent, sinon par une boucle
// Bun.spawn entrelacée (fork/upstream alternés pour annuler la dérive de la machine). Les micro-benchs mesurent
// dans le processus fils (performance.now) et rapportent un JSON sur stdout. Tous les runs sont « chauds » :
// `warmup` exécutions écartées, caches d'install et de pages OS peuplés.

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync, cpSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..", "..");
const benchDir = join(root, "bench", "aphrody");
const isWin = platform() === "win32";
const exeName = isWin ? "bun.exe" : "bun";

// ---------------------------------------------------------------------------------------------------------------
// Statistiques, seuils, rendu (purs, testés dans test/internal/aphrody-perf-gate.test.ts)

export type Stats = { n: number; min: number; median: number; mean: number; p95: number; max: number };

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank];
}

export function stats(samples: number[]): Stats {
  const s = [...samples].sort((a, b) => a - b);
  const n = s.length;
  const mid = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  return {
    n,
    min: s[0],
    median: mid,
    mean: s.reduce((a, b) => a + b, 0) / n,
    p95: percentile(s, 0.95),
    max: s[n - 1],
  };
}

export type Unit = "ms" | "bytes" | "req/s";

export type Limit = { maxRatio?: number; minDelta?: number; maxDeltaBytes?: number };
export type Thresholds = {
  defaults?: Limit;
  cases?: Record<string, Limit>;
  binarySize?: Limit;
};

export type Row = {
  id: string;
  label: string;
  unit: Unit;
  higherIsBetter: boolean;
  info: boolean;
  fork: Stats;
  upstream?: Stats;
  /** > 1 = le fork est plus mauvais. */
  ratio?: number;
  /** fork - upstream sur la médiane (unité du cas). */
  delta?: number;
  limit?: Limit;
  status: "ok" | "fail" | "info";
  reason?: string;
};

export function judge(row: Pick<Row, "unit" | "higherIsBetter" | "fork" | "upstream">, limit: Limit | undefined) {
  if (!row.upstream) return { ratio: undefined, delta: undefined, reason: undefined };
  const f = row.fork.median;
  const u = row.upstream.median;
  const delta = f - u;
  const worse = row.higherIsBetter ? u / f : f / u;
  const ratio = Number.isFinite(worse) ? worse : f === u ? 1 : Infinity;
  const badDelta = row.higherIsBetter ? -delta : delta;
  const reasons: string[] = [];
  if (limit?.maxDeltaBytes !== undefined && row.unit === "bytes" && badDelta > limit.maxDeltaBytes) {
    reasons.push(`écart ${fmtBytes(badDelta)} > ${fmtBytes(limit.maxDeltaBytes)}`);
  }
  if (limit?.maxRatio !== undefined && ratio > limit.maxRatio && badDelta > (limit.minDelta ?? 0)) {
    reasons.push(`ratio ${ratio.toFixed(3)} > ${limit.maxRatio}`);
  }
  return { ratio, delta, reason: reasons.length ? reasons.join("; ") : undefined };
}

/** Les cas en octets n'héritent pas du ratio par défaut (exprimé pour des durées). */
export function resolveLimit(t: Thresholds, id: string, unit: Unit): Limit {
  const own = t.cases?.[id] ?? {};
  return unit === "bytes" ? { ...own } : { ...t.defaults, ...own };
}

export function fmtBytes(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1048576) return `${sign}${(a / 1048576).toFixed(2)} MiB`;
  if (a >= 1024) return `${sign}${(a / 1024).toFixed(1)} KiB`;
  return `${sign}${a} B`;
}

export function fmtValue(v: number, unit: Unit): string {
  if (unit === "bytes") return fmtBytes(v);
  if (unit === "req/s") return v.toFixed(0);
  return v >= 100 ? `${v.toFixed(0)} ms` : v >= 10 ? `${v.toFixed(1)} ms` : `${v.toFixed(2)} ms`;
}

export type Report = {
  meta: Record<string, unknown> & {
    fork: { path: string; version: string; revision: string; size: number };
    upstream?: { path: string; version: string; revision: string; size: number };
  };
  binarySize?: { fork: number; upstream: number; ratio: number; delta: number; status: "ok" | "fail"; reason?: string };
  rows: Row[];
  failures: string[];
};

export function buildFailures(report: Pick<Report, "rows" | "binarySize">): string[] {
  const out: string[] = [];
  for (const r of report.rows) if (r.status === "fail") out.push(`${r.id}: ${r.reason}`);
  if (report.binarySize?.status === "fail") out.push(`binary-size: ${report.binarySize.reason}`);
  return out;
}

export function toMarkdown(report: Report): string {
  const m = report.meta;
  const lines: string[] = [];
  lines.push("## Garde de performance Aphrody");
  lines.push("");
  lines.push(
    `Fork \`${m.fork.version}\` (${m.fork.revision.slice(0, 9)}) contre ${
      m.upstream ? `upstream \`${m.upstream.version}\` (${m.upstream.revision.slice(0, 9)})` : "aucun upstream"
    } sur ${m.host} ; ${m.runs} runs, ${m.warmup} d'échauffement, moteur ${m.engine}. Médiane (p95).`,
  );
  lines.push("");
  lines.push("| Mesure | Upstream | Fork | Écart | Ratio | Seuil | Statut |");
  lines.push("| --- | ---: | ---: | ---: | ---: | --- | --- |");
  for (const r of report.rows) {
    const cell = (s?: Stats) =>
      s ? `${fmtValue(s.median, r.unit)}${r.unit === "req/s" ? "" : ` (${fmtValue(s.p95, r.unit)})`}` : "n/a";
    const delta = r.delta === undefined ? "" : `${r.delta >= 0 ? "+" : ""}${fmtValue(r.delta, r.unit)}`;
    const lim = r.limit
      ? [
          r.limit.maxRatio !== undefined ? `x${r.limit.maxRatio}` : "",
          r.limit.minDelta !== undefined ? `> ${r.limit.minDelta} ms` : "",
          r.limit.maxDeltaBytes !== undefined ? `+${fmtBytes(r.limit.maxDeltaBytes)}` : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "";
    const status = r.status === "fail" ? `ÉCHEC (${r.reason})` : r.status === "info" ? "info" : "ok";
    lines.push(
      `| ${r.label} | ${cell(r.upstream)} | ${cell(r.fork)} | ${delta} | ${r.ratio === undefined ? "" : r.ratio.toFixed(3)} | ${lim} | ${status} |`,
    );
  }
  if (report.binarySize) {
    const b = report.binarySize;
    lines.push(
      `| Taille du binaire | ${fmtBytes(b.upstream)} | ${fmtBytes(b.fork)} | ${b.delta >= 0 ? "+" : ""}${fmtBytes(b.delta)} | ${b.ratio.toFixed(3)} | | ${b.status === "fail" ? `ÉCHEC (${b.reason})` : "ok"} |`,
    );
  }
  lines.push("");
  lines.push(
    report.failures.length
      ? `**${report.failures.length} seuil(s) dépassé(s)** : ${report.failures.join(" | ")}`
      : "Tous les seuils sont respectés.",
  );
  if (m.note) lines.push("", `> ${m.note}`);
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------------------------------------------
// Définition des cas

type Metric = { id: string; label: string; unit: Unit; key: string; higherIsBetter?: boolean; info?: boolean };
type Spec = {
  id: string;
  /** Commande pour un binaire ; cwd relatif au dossier de travail. */
  cmd: (bin: string, w: Work) => string[];
  cwd?: (w: Work, label: string) => string;
  env?: (w: Work, label: string) => Record<string, string>;
  /** Appelé avant chaque exécution (non chronométré). */
  before?: (w: Work, label: string) => void;
  metrics: Metric[];
  forkOnly?: boolean;
  /** Mesure par le temps mural seul, donc éligible à hyperfine. */
  wallOnly?: boolean;
  runs?: number;
};

type Work = { dir: string; fixtures: string };

const microScript = (name: string) => join(benchDir, "micro", name);

const specs: Spec[] = [
  {
    id: "version",
    cmd: b => [b, "--version"],
    wallOnly: true,
    metrics: [{ id: "version", label: "`bun --version`", unit: "ms", key: "wall" }],
  },
  {
    id: "eval-empty",
    cmd: b => [b, "-e", ""],
    wallOnly: true,
    metrics: [{ id: "eval-empty", label: "`bun -e ''`", unit: "ms", key: "wall" }],
  },
  {
    id: "run-empty",
    cmd: (b, w) => [b, "run", join(w.dir, "empty.js")],
    wallOnly: true,
    metrics: [{ id: "run-empty", label: "`bun run` script vide", unit: "ms", key: "wall" }],
  },
  {
    id: "test-empty",
    cmd: b => [b, "test"],
    cwd: w => join(w.dir, "test-empty"),
    wallOnly: true,
    metrics: [{ id: "test-empty", label: "`bun test` (1 test vide)", unit: "ms", key: "wall" }],
  },
  {
    id: "build-small",
    cmd: (b, w) => [b, "build", "src/index.ts", "--outdir", join(w.dir, "build-out")],
    cwd: w => join(w.dir, "build-small"),
    wallOnly: true,
    metrics: [{ id: "build-small", label: "`bun build` petit projet", unit: "ms", key: "wall" }],
  },
  {
    id: "install-offline",
    cmd: b => [b, "install", "--ignore-scripts", "--no-progress", "--no-summary"],
    cwd: (w, label) => join(w.dir, `install-${label}`),
    env: w => ({ BUN_INSTALL_CACHE_DIR: join(w.dir, "install-cache") }),
    before: (w, label) => rmSync(join(w.dir, `install-${label}`, "node_modules"), { recursive: true, force: true }),
    metrics: [{ id: "install-offline", label: "`bun install` hors-ligne (cache chaud)", unit: "ms", key: "wall" }],
    runs: 20,
  },
  {
    id: "rss",
    cmd: b => [b, microScript("rss.js")],
    metrics: [{ id: "rss-startup", label: "RSS au démarrage", unit: "bytes", key: "rss" }],
  },
  {
    id: "rss-builtins",
    cmd: b => [b, microScript("rss-builtins.js")],
    metrics: [{ id: "rss-after-builtins", label: "RSS après 11 modules node:*", unit: "bytes", key: "rss" }],
  },
  {
    id: "require-node",
    cmd: b => [b, microScript("require-node.js")],
    metrics: [{ id: "require-node", label: "`require` de 31 node:*", unit: "ms", key: "ms" }],
  },
  {
    id: "import-node",
    cmd: b => [b, microScript("import-node.mjs")],
    metrics: [{ id: "import-node", label: "`import()` de 31 node:*", unit: "ms", key: "ms" }],
  },
  {
    id: "require-bun",
    cmd: b => [b, microScript("require-bun.js")],
    metrics: [{ id: "require-bun", label: "`require` de 4 bun:*", unit: "ms", key: "ms" }],
  },
  {
    id: "serve-fetch",
    cmd: b => [b, microScript("serve-fetch.js")],
    metrics: [
      { id: "serve-hello", label: "`Bun.serve` hello + 1re requête", unit: "ms", key: "serveMs" },
      { id: "fetch-local", label: "`fetch` local (p50)", unit: "ms", key: "fetchP50Ms" },
      { id: "fetch-p99", label: "`fetch` local (p99)", unit: "ms", key: "fetchP99Ms", info: true },
      {
        id: "fetch-rps",
        label: "`fetch` local séquentiel",
        unit: "req/s",
        key: "rps",
        higherIsBetter: true,
        info: true,
      },
    ],
  },
  {
    id: "require-fork",
    cmd: b => [b, microScript("require-fork.js")],
    forkOnly: true,
    metrics: [
      {
        id: "fork-builtins",
        label: "`require` des 4 modules ajoutés par le fork (fork seul)",
        unit: "ms",
        key: "ms",
        info: true,
      },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Exécution

type Bin = { label: "fork" | "upstream"; path: string };

function env(extra: Record<string, string> = {}): Record<string, string> {
  return { ...(process.env as Record<string, string>), NO_COLOR: "1", BUN_DEBUG_QUIET_LOGS: "1", ...extra };
}

function runOnce(bin: string, spec: Spec, w: Work, label: string) {
  const t0 = Bun.nanoseconds();
  const p = Bun.spawnSync(spec.cmd(bin, w), {
    cwd: spec.cwd?.(w, label) ?? w.dir,
    env: env(spec.env?.(w, label)),
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const wall = (Bun.nanoseconds() - t0) / 1e6;
  if (p.exitCode !== 0) {
    throw new Error(
      `${spec.id} (${label}) a échoué (code ${p.exitCode}) : ${p.stderr.toString().slice(0, 500)}${p.stdout.toString().slice(0, 300)}`,
    );
  }
  let parsed: Record<string, number> = {};
  const out = p.stdout.toString().trim().split(/\r?\n/).pop() ?? "";
  if (out.startsWith("{")) parsed = JSON.parse(out);
  return { wall, ...parsed } as Record<string, number>;
}

function shellQuote(a: string): string {
  // hyperfine -N découpe en mots façon shell : les antislashs Windows seraient consommés.
  a = isWin ? a.replaceAll("\\", "/") : a;
  return a === "" || /[\s"']/.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a;
}

function hyperfineSamples(hf: string, bins: Bin[], spec: Spec, w: Work, runs: number, warmup: number) {
  const out: Record<string, number[]> = Object.fromEntries(bins.map(b => [b.label, []]));
  const rounds = 2;
  const per = Math.max(3, Math.ceil(runs / rounds));
  for (let r = 0; r < rounds; r++) {
    const order = r % 2 ? [...bins].reverse() : bins;
    for (const b of order) {
      const json = join(w.dir, `hf-${spec.id}-${b.label}-${r}.json`);
      const cmd = spec.cmd(b.path, w).map(shellQuote).join(" ");
      const p = Bun.spawnSync(
        [hf, "-N", "--warmup", String(r === 0 ? warmup : 2), "--runs", String(per), "--export-json", json, cmd],
        { cwd: spec.cwd?.(w, b.label) ?? w.dir, env: env(spec.env?.(w, b.label)), stdout: "pipe", stderr: "pipe" },
      );
      if (p.exitCode !== 0)
        throw new Error(`hyperfine ${spec.id} (${b.label}) : ${p.stderr.toString()}${p.stdout.toString()}`);
      const data = JSON.parse(readFileSync(json, "utf8"));
      out[b.label].push(...data.results[0].times.map((t: number) => t * 1000));
    }
  }
  return out;
}

function measure(spec: Spec, bins: Bin[], w: Work, o: { runs: number; warmup: number; engine: string; hf?: string }) {
  const runs = spec.runs ? Math.min(spec.runs, o.runs) : o.runs;
  const samples: Record<string, Record<string, number[]>> = {};
  for (const b of bins) samples[b.label] = {};
  if (spec.wallOnly && o.hf && o.engine !== "spawn" && !spec.before) {
    const s = hyperfineSamples(o.hf, bins, spec, w, runs, o.warmup);
    for (const b of bins) samples[b.label].wall = s[b.label];
    return samples;
  }
  for (let i = 0; i < runs + o.warmup; i++) {
    const order = i % 2 ? [...bins].reverse() : bins;
    for (const b of order) {
      spec.before?.(w, b.label);
      const r = runOnce(b.path, spec, w, b.label);
      if (i < o.warmup) continue;
      for (const [k, v] of Object.entries(r)) (samples[b.label][k] ??= []).push(v);
    }
  }
  return samples;
}

// ---------------------------------------------------------------------------------------------------------------
// Binaires

function version(bin: string): string {
  return Bun.spawnSync([bin, "--version"], { stdout: "pipe", stderr: "pipe" }).stdout.toString().trim();
}

function revision(bin: string): string {
  const p = Bun.spawnSync([bin, "-p", "Bun.revision"], { stdout: "pipe", stderr: "pipe" });
  return p.stdout.toString().trim() || "unknown";
}

function assetName(): string {
  const os = platform() === "win32" ? "windows" : platform() === "darwin" ? "darwin" : "linux";
  const cpu = arch() === "arm64" ? "aarch64" : "x64";
  return `bun-${os}-${cpu}`;
}

function extract(zip: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  const tries = isWin
    ? [[join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), "-xf", zip, "-C", dest]]
    : [
        ["unzip", "-o", "-q", zip, "-d", dest],
        ["tar", "-xf", zip, "-C", dest],
      ];
  for (const t of tries) {
    try {
      if (Bun.spawnSync(t, { stdout: "pipe", stderr: "pipe" }).exitCode === 0) return;
    } catch {}
  }
  throw new Error(`extraction impossible : ${zip}`);
}

/** Télécharge l'upstream `bun-v<ver>` (repli : dernière release) ; renvoie chemin, version demandée et note. */
export function fetchUpstream(want: string, cache: string): { path: string; note?: string } {
  const asset = assetName();
  const tryTag = (tag: string) => {
    const dir = join(cache, tag, asset);
    const exe = join(dir, asset, exeName);
    if (existsSync(exe)) return exe;
    mkdirSync(dir, { recursive: true });
    const p = Bun.spawnSync(
      ["gh", "release", "download", tag, "-R", "oven-sh/bun", "-p", `${asset}.zip`, "-D", dir, "--clobber"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    if (p.exitCode !== 0) return undefined;
    extract(join(dir, `${asset}.zip`), dir);
    return existsSync(exe) ? exe : undefined;
  };
  const exact = tryTag(`bun-v${want}`);
  if (exact) return { path: exact };
  const latest = Bun.spawnSync(
    ["gh", "release", "list", "-R", "oven-sh/bun", "--exclude-pre-releases", "--limit", "1", "--json", "tagName"],
    {
      stdout: "pipe",
    },
  );
  const tag = JSON.parse(latest.stdout.toString() || "[]")[0]?.tagName as string | undefined;
  const fb = tag && tryTag(tag);
  if (!fb) throw new Error(`release upstream introuvable (${want}, repli ${tag})`);
  return { path: fb, note: `Release upstream bun-v${want} absente : repli sur ${tag}.` };
}

// ---------------------------------------------------------------------------------------------------------------
// Dossier de travail

async function prepareWork(dir: string, labels: string[]): Promise<Work> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const fixtures = join(benchDir, "fixtures");
  writeFileSync(join(dir, "empty.js"), "");
  mkdirSync(join(dir, "test-empty"));
  writeFileSync(
    join(dir, "test-empty", "empty.test.ts"),
    `import { test } from "bun:test";\ntest("empty", () => {});\n`,
  );
  cpSync(join(fixtures, "build-small"), join(dir, "build-small"), { recursive: true });
  // tarballs « registre » pour install hors-ligne via le cache
  mkdirSync(join(dir, "tgz"));
  const names = ["alpha", "beta", "gamma"];
  for (const n of names) {
    const base = join(fixtures, "install", "packages", n);
    const files: Record<string, string> = {};
    for (const f of ["package.json", "index.js"]) files[`package/${f}`] = readFileSync(join(base, f), "utf8");
    const bytes = await new Bun.Archive(files, { compress: "gzip" }).bytes();
    writeFileSync(join(dir, "tgz", `perf-${n}.tgz`), bytes);
  }
  const deps = Object.fromEntries(
    names.map(n => [`perf-${n}`, `file:${join(dir, "tgz", `perf-${n}.tgz`).replaceAll("\\", "/")}`]),
  );
  for (const l of labels) {
    const p = join(dir, `install-${l}`);
    mkdirSync(p, { recursive: true });
    writeFileSync(
      join(p, "package.json"),
      JSON.stringify({ name: `perf-install-${l}`, version: "1.0.0", dependencies: deps }),
    );
  }
  return { dir, fixtures };
}

// ---------------------------------------------------------------------------------------------------------------
// Programme principal

function arg(argv: string[], flag: string, fallback?: string) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}

export async function main(argv: string[]): Promise<number> {
  if (argv.includes("--list")) {
    for (const s of specs) console.log(s.id, s.metrics.map(m => m.id).join(","));
    return 0;
  }
  const forkPath = resolve(arg(argv, "--fork", join(root, "build", "release", exeName))!);
  if (!existsSync(forkPath)) throw new Error(`binaire du fork introuvable : ${forkPath}`);
  const configPath = resolve(arg(argv, "--config", join(benchDir, "thresholds.json"))!);
  const thresholds: Thresholds = JSON.parse(readFileSync(configPath, "utf8"));
  const runs = Number(arg(argv, "--runs", "40"));
  const warmup = Number(arg(argv, "--warmup", "5"));
  const engine = arg(argv, "--engine", "auto")!;
  const only = arg(argv, "--only")?.split(",");
  const outDir = resolve(arg(argv, "--out", join(root, "tmp", "perf", "report"))!);
  const workDir = resolve(arg(argv, "--work", join(root, "tmp", "perf", "work"))!);
  const hf = engine === "spawn" ? undefined : (Bun.which("hyperfine") ?? undefined);
  if (engine === "hyperfine" && !hf) throw new Error("hyperfine absent du PATH");

  const forkVersion = version(forkPath);
  let upstreamPath = arg(argv, "--upstream");
  let note: string | undefined;
  if (upstreamPath) upstreamPath = resolve(upstreamPath);
  else {
    const want = arg(argv, "--upstream-version", forkVersion.split("-")[0])!;
    const r = fetchUpstream(want, join(root, "tmp", "perf", "upstream"));
    upstreamPath = r.path;
    note = r.note;
  }
  const bins: Bin[] = [
    { label: "fork", path: forkPath },
    { label: "upstream", path: upstreamPath },
  ];
  const info = (b: Bin) => ({
    path: b.path,
    version: version(b.path),
    revision: revision(b.path),
    size: statSync(b.path).size,
  });
  const forkInfo = info(bins[0]);
  const upInfo = info(bins[1]);
  const drift = forkInfo.version.split("-")[0] !== upInfo.version.split("-")[0];
  // Taille et RSS dérivent avec le code amont : non bloquants quand les versions de base diffèrent (--strict les impose).
  const skipBytes = drift && !argv.includes("--strict");
  if (drift) {
    note = `${note ? note + " " : ""}Versions de base différentes (fork ${forkInfo.version}, upstream ${upInfo.version}) : l'écart inclut le travail amont entre les deux; taille et RSS ne bloquent pas (--strict pour les imposer).`;
  }

  const work = await prepareWork(
    workDir,
    bins.map(b => b.label),
  );
  const rows: Row[] = [];
  for (const spec of specs) {
    if (only && !spec.metrics.some(m => only.includes(m.id)) && !only.includes(spec.id)) continue;
    const active = spec.forkOnly ? [bins[0]] : bins;
    console.error(`[perf] ${spec.id} ...`);
    let samples: ReturnType<typeof measure>;
    try {
      samples = measure(spec, active, work, { runs, warmup, engine, hf });
    } catch (err) {
      if (!spec.forkOnly) throw err;
      console.error(`[perf] ${spec.id} ignoré : ${(err as Error).message.split("\n")[0]}`);
      continue;
    }
    for (const m of spec.metrics) {
      const f = samples.fork[m.key];
      if (!f?.length) throw new Error(`${spec.id} : métrique ${m.key} absente`);
      const u = samples.upstream?.[m.key];
      const row: Row = {
        id: m.id,
        label: m.label,
        unit: m.unit,
        higherIsBetter: !!m.higherIsBetter,
        info: !!m.info || !!spec.forkOnly || (m.unit === "bytes" && skipBytes),
        fork: stats(f),
        upstream: u ? stats(u) : undefined,
        status: "ok",
      };
      row.limit = row.info ? undefined : resolveLimit(thresholds, m.id, m.unit);
      const j = judge(row, row.limit);
      row.ratio = j.ratio;
      row.delta = j.delta;
      row.reason = j.reason;
      row.status = row.info ? "info" : j.reason ? "fail" : "ok";
      rows.push(row);
    }
  }

  const report: Report = {
    meta: {
      fork: forkInfo,
      upstream: upInfo,
      host: `${platform()} ${release()} ${arch()}, ${cpus()[0]?.model.trim()} x${cpus().length}, ${(totalmem() / 2 ** 30).toFixed(0)} GiB`,
      engine: hf && engine !== "spawn" ? "hyperfine" : "spawn",
      runs,
      warmup,
      date: new Date().toISOString(),
      note,
    },
    rows,
    failures: [],
  };
  if (!only) {
    const sizeRatio = forkInfo.size / upInfo.size;
    const delta = forkInfo.size - upInfo.size;
    const lim = thresholds.binarySize ?? {};
    const reasons: string[] = [];
    if (
      !skipBytes &&
      lim.maxRatio !== undefined &&
      sizeRatio > lim.maxRatio &&
      (lim.maxDeltaBytes === undefined || delta > lim.maxDeltaBytes)
    ) {
      reasons.push(
        `ratio ${sizeRatio.toFixed(3)} > ${lim.maxRatio} et écart ${fmtBytes(delta)} > ${fmtBytes(lim.maxDeltaBytes ?? 0)}`,
      );
    }
    report.binarySize = {
      fork: forkInfo.size,
      upstream: upInfo.size,
      ratio: sizeRatio,
      delta,
      status: reasons.length ? "fail" : "ok",
      reason: reasons.join("; ") || undefined,
    };
  }
  report.failures = buildFailures(report);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "perf-report.json"), JSON.stringify(report, null, 2));
  const md = toMarkdown(report);
  writeFileSync(join(outDir, "perf-report.md"), md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(md);
  if (argv.includes("--no-gate")) return 0;
  return report.failures.length ? 1 : 0;
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
