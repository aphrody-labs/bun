import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compare,
  rankSumP,
  realDifference,
  summarize,
  verdictOf,
  type MetricResult,
} from "../../bench/aphrody/arena/arena.ts";
import {
  arenaRows,
  buildFailures,
  fmtBytes,
  judge,
  percentile,
  resolveLimit,
  stats,
  toMarkdown,
  type Report,
  type Row,
  type Thresholds,
} from "../../scripts/aphrody/perf-gate.ts";

const root = join(import.meta.dir, "..", "..");

describe("perf-gate stats", () => {
  test("median, p95, min, max", () => {
    const s = stats([5, 1, 3, 2, 4]);
    expect(s).toMatchObject({ n: 5, min: 1, median: 3, mean: 3, max: 5, p95: 5 });
    expect(stats([1, 2, 3, 4]).median).toBe(2.5);
  });

  test("percentile uses nearest rank", () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(sorted, 0.95)).toBe(95);
    expect(percentile(sorted, 0.5)).toBe(50);
    expect(percentile([], 0.5)).toBeNaN();
  });
});

describe("perf-gate judge", () => {
  const mk = (fork: number, upstream: number, over: Partial<Row> = {}) => ({
    unit: "ms" as const,
    higherIsBetter: false,
    fork: stats([fork]),
    upstream: stats([upstream]),
    ...over,
  });

  test("ratio over the limit and delta over the noise floor fails", () => {
    const j = judge(mk(12, 10), { maxRatio: 1.1, minDelta: 1 });
    expect(j.ratio).toBeCloseTo(1.2);
    expect(j.reason).toContain("ratio");
  });

  test("delta under the noise floor passes even above the ratio", () => {
    expect(judge(mk(1.5, 1), { maxRatio: 1.1, minDelta: 1 }).reason).toBeUndefined();
  });

  test("faster fork passes", () => {
    expect(judge(mk(8, 10), { maxRatio: 1.01, minDelta: 0 }).reason).toBeUndefined();
  });

  test("bytes use an absolute limit", () => {
    const row = mk(30_000_000, 28_000_000, { unit: "bytes" });
    expect(judge(row, { maxDeltaBytes: 1 << 20 }).reason).toContain("écart");
    expect(judge(row, { maxDeltaBytes: 4 << 20 }).reason).toBeUndefined();
  });

  test("throughput inverts the ratio", () => {
    const j = judge(mk(80, 100, { unit: "req/s", higherIsBetter: true }), { maxRatio: 1.1, minDelta: 0 });
    expect(j.ratio).toBeCloseTo(1.25);
    expect(j.reason).toContain("ratio");
  });

  test("no upstream means no verdict", () => {
    expect(judge({ unit: "ms", higherIsBetter: false, fork: stats([1]) }, { maxRatio: 1 }).reason).toBeUndefined();
  });

  test("byte cases do not inherit the duration defaults", () => {
    const t: Thresholds = { defaults: { maxRatio: 1.1, minDelta: 1 }, cases: { rss: { maxDeltaBytes: 10 } } };
    expect(resolveLimit(t, "rss", "bytes")).toEqual({ maxDeltaBytes: 10 });
    expect(resolveLimit(t, "x", "ms")).toEqual({ maxRatio: 1.1, minDelta: 1 });
  });
});

describe("perf-gate report", () => {
  const row: Row = {
    id: "eval-empty",
    label: "`bun -e ''`",
    unit: "ms",
    higherIsBetter: false,
    info: false,
    fork: stats([12]),
    upstream: stats([10]),
    ratio: 1.2,
    delta: 2,
    limit: { maxRatio: 1.1, minDelta: 1 },
    status: "fail",
    reason: "ratio 1.200 > 1.1",
  };
  const report: Report = {
    meta: {
      fork: { path: "f", version: "1.4.3-aphrody.2", revision: "abcdef1234567", size: 100 },
      upstream: { path: "u", version: "1.4.3", revision: "1234567abcdef", size: 100 },
      host: "test",
      runs: 10,
      warmup: 2,
      engine: "spawn",
    },
    rows: [row],
    failures: [],
  };

  test("failures are collected and rendered", () => {
    report.failures = buildFailures(report);
    expect(report.failures).toEqual(["eval-empty: ratio 1.200 > 1.1"]);
    const md = toMarkdown(report);
    expect(md).toContain("| `bun -e ''` |");
    expect(md).toContain("ÉCHEC");
    expect(md).toContain("1 seuil(s) dépassé(s)");
  });

  test("fmtBytes", () => {
    expect(fmtBytes(1048576)).toBe("1.00 MiB");
    expect(fmtBytes(-2048)).toBe("-2.0 KiB");
  });
});

describe("perf-gate config", () => {
  test("thresholds.json covers every gated metric id", () => {
    const t: Thresholds = JSON.parse(readFileSync(join(root, "bench", "aphrody", "thresholds.json"), "utf8"));
    const list = Bun.spawnSync([process.execPath, join(root, "scripts", "aphrody", "perf-gate.ts"), "--list"], {
      env: { ...process.env, BUN_DEBUG_QUIET_LOGS: "1" },
    });
    expect(list.exitCode).toBe(0);
    const infoIds = new Set(["fetch-p99", "fetch-rps", "fork-builtins"]);
    const ids = list.stdout
      .toString()
      .trim()
      .split("\n")
      .flatMap(l => l.split(" ")[1].split(","))
      .filter(id => !infoIds.has(id));
    for (const id of ids) expect(t.cases).toHaveProperty(id);
  });
});

describe("arena statistics", () => {
  const metric = (samples: number[], procMedians = samples): MetricResult => ({
    unit: "ms",
    summary: summarize(samples),
    procMedians,
    cold: [],
    drift: 0,
  });

  test("summarize reports the median absolute deviation", () => {
    expect(summarize([1, 2, 3, 4, 100])).toEqual({ n: 5, min: 1, median: 3, mean: 22, p95: 100, max: 100, mad: 1 });
  });

  test("exact rank-sum: 5 against 5 with disjoint ranges gives p = 1/252 one-sided, 0.0079 two-sided", () => {
    const p = rankSumP([10, 11, 12, 13, 14], [1, 2, 3, 4, 5]);
    expect(p.greater).toBeCloseTo(1 / 252, 10);
    expect(p.less).toBe(1);
    expect(p.two).toBeCloseTo(2 / 252, 10);
  });

  test("rank-sum with every value tied is 1", () => {
    expect(rankSumP([1, 1, 1], [1, 1, 1])).toEqual({ greater: 1, less: 1, two: 1 });
  });

  test("real difference needs the gap above 5 % and 3 x MAD, and disjoint ranges", () => {
    expect(realDifference(summarize([110, 111, 112]), summarize([100, 101, 102]))).toBe(true);
    expect(realDifference(summarize([103, 104, 105]), summarize([100, 101, 102]))).toBe(false);
    expect(realDifference(summarize([110, 111, 300]), summarize([100, 101, 200]))).toBe(false);
  });

  test("a slower fork with a real, significant gap is a gated regression", () => {
    const c = compare("compute.nbody", "fork", "upstream", metric([120, 121, 122, 123, 124]), metric([100, 101, 102, 103, 104]), true);
    expect(c.real).toBe(true);
    expect(c.regression).toBe(true);
    expect(c.reason).toContain("ratio 1.196");
  });

  test("the same gap against Deno only informs", () => {
    const c = compare("compute.nbody", "fork", "deno", metric([120, 121, 122, 123, 124]), metric([100, 101, 102, 103, 104]), false);
    expect(c.regression).toBe(false);
    expect(c.reason).toContain("ratio");
  });

  test("a gap under the ratio limit passes", () => {
    const c = compare("json.roundtrip", "fork", "upstream", metric([103, 103.1, 103.2, 103.3, 103.4]), metric([100, 100.1, 100.2, 100.3, 100.4]), true);
    expect(c.regression).toBe(false);
  });

  test("peak RSS uses the absolute byte limit", () => {
    const mib = 1048576;
    const bytes = (v: number[]): MetricResult => ({ ...metric(v), unit: "bytes" });
    const small = compare("compute.hwm", "fork", "upstream", bytes([52, 52, 52, 52, 52].map((v, i) => (v + i * 0.01) * mib)), bytes([50, 50, 50, 50, 50].map((v, i) => (v + i * 0.01) * mib)), true);
    expect(small.regression).toBe(false);
    const big = compare("compute.hwm", "fork", "upstream", bytes([60, 60, 60, 60, 60].map((v, i) => (v + i * 0.01) * mib)), bytes([50, 50, 50, 50, 50].map((v, i) => (v + i * 0.01) * mib)), true);
    expect(big.regression).toBe(true);
  });

  test("verdicts", () => {
    expect(verdictOf([])).toBe("valide");
    expect(verdictOf(["C6 drift"])).toBe("indicatif");
    expect(verdictOf(["C7 lock heavy.lock held"])).toBe("à reproduire");
    expect(verdictOf(["C7 steal 3 %", "C3 json: mismatch"])).toBe("invalide");
  });

  test("arena rows: fork/upstream gate, fork/Deno is info", () => {
    const f = metric([120, 121, 122, 123, 124]);
    const u = metric([100, 101, 102, 103, 104]);
    const results = { "compute.nbody": { fork: { ...f, samples: [] }, upstream: { ...u, samples: [] }, deno: { ...u, samples: [] } } };
    const comparisons = [
      compare("compute.nbody", "fork", "upstream", f, u, true),
      compare("compute.nbody", "fork", "deno", f, u, false),
    ];
    const rows = arenaRows({ comparisons, results });
    expect(rows.map(r => [r.id, r.status, r.info])).toEqual([
      ["arena:compute.nbody", "fail", false],
      ["arena:compute.nbody@deno", "info", true],
    ]);
    expect(buildFailures({ rows })).toHaveLength(1);
  });
});
