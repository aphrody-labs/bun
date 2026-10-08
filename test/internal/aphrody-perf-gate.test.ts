import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
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
