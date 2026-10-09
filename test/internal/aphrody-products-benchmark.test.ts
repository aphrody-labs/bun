import { expect, test } from "bun:test";
import {
  pairedInterval,
  parseMeasurement,
  reportMarkdown,
  summary,
  validatePair,
} from "../../scripts/aphrody/bench-products.ts";
test("product measurements reject missing, invalid and unequal outputs", () => {
  expect(() => parseMeasurement("42", 1)).toThrow("Missing checked");
  expect(() => parseMeasurement('BENCH_RESULT {"value":"42","workMs":-1}', 1)).toThrow("Invalid work");
  expect(() => parseMeasurement('BENCH_RESULT {"value":42}', 1)).toThrow("Missing correctness");
  const sample = parseMeasurement('log\nBENCH_RESULT {"value":"42","workMs":0.5}', 2);
  expect(sample).toEqual({ value: "42", workMs: 0.5, wallMs: 2 });
  expect(() => validatePair(sample, { ...sample, value: "43" })).toThrow("different");
  expect(() => validatePair(sample, sample, "43")).toThrow("invalid");
  validatePair(sample, sample, "42");
});
test("product statistics are finite, paired and deterministic", () => {
  expect(summary([4, 1, 3, 2])).toMatchObject({ n: 4, median: 2.5, p95: 4 });
  for (const values of [[], [0], [-1], [NaN], [Infinity]]) expect(() => summary(values)).toThrow("finite");
  expect(() => pairedInterval([1], [1, 2])).toThrow("Unpaired");
  const interval = pairedInterval([1, 2, 3, 4], [2, 4, 6, 8]);
  expect(interval).toEqual({ ratio: 2, low: 2, high: 2 });
  expect(pairedInterval([1, 2, 3, 4], [2, 4, 6, 8])).toEqual(interval);
});
test("reports keep unsupported hosts unmeasured", () => {
  const markdown = reportMarkdown({
    generatedAt: "2026-10-10",
    environment: { bunVersion: "1.4.4" },
    samples: 30,
    warmup: 5,
    cases: [{ id: "windows", description: "Native Windows", status: "unsupported-host", reason: "Requires win32" }],
  });
  expect(markdown).toContain("| windows | unsupported-host | — | — | — |");
  expect(markdown).toContain("Requires win32");
  expect(markdown).toContain("Wine");
});
