import { describe, expect, test } from "bun:test";
import { DEFAULT_INTERVAL_SEC, parseInterval, report } from "../../scripts/aphrody/autopilot.ts";

describe("aphrody autopilot", () => {
  test("a skipped step does not fail the report, a failed one does", () => {
    const now = new Date(0);
    const pass = { name: "scope", result: "pass", detail: "" } as const;
    const skipped = { name: "container", result: "skipped", detail: "docker daemon unavailable" } as const;
    const fail = { name: "upstream", result: "fail", detail: "3 upstream commit(s) to merge" } as const;
    expect(report([pass, skipped], now)).toEqual({ timestamp: now.toISOString(), ok: true, steps: [pass, skipped] });
    expect(report([pass, fail, skipped], now).ok).toBe(false);
  });

  test("--interval", () => {
    expect(parseInterval([])).toBe(DEFAULT_INTERVAL_SEC);
    expect(parseInterval(["--repair", "--interval", "600"])).toBe(600);
    expect(() => parseInterval(["--interval", "5"])).toThrow(/at least 60/);
    expect(() => parseInterval(["--interval", "soon"])).toThrow(/--interval/);
    expect(() => parseInterval(["--interval"])).toThrow(/--interval/);
  });
});
