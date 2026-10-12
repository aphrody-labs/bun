import { expect, test } from "bun:test";
import { CEF_CHROMIUM_VERSION, CEF_VERSION, CHROMIUM_REVISION, environment, layout, plan } from "../../scripts/aphrody/cef";

test("CEF integration keeps one pinned ABI contract", () => {
  expect(CEF_VERSION).toBe("152.3.0");
  expect(CEF_CHROMIUM_VERSION).toBe("152.0.7977.83");
  expect(CHROMIUM_REVISION).toMatch(/^[0-9a-f]{40}$/);
});

test("CEF layout is repo-relative and overridable without mutation", () => {
  const value = layout({ CEF_PATH: "C:\\cef\\152" });
  expect(value.distribution).toBe("C:\\cef\\152");
  expect(value.chromiumSource.endsWith("vendor\\chromium\\src")).toBe(true);
});

test("CEF environment exports the shared contract", () => {
  const value = layout({ CEF_PATH: "C:\\cef\\152" });
  const env = environment(value, { PATH: "test" });
  expect(env.CEF_PATH).toBe("C:\\cef\\152");
  expect(env.BUN_CEF_VERSION).toBe(CEF_VERSION);
  expect(env.BUN_CHROMIUM_REVISION).toBe(CHROMIUM_REVISION);
});

test("CEF plan reports missing binaries instead of claiming readiness", () => {
  const result = plan({ CEF_PATH: "C:\\missing\\cef" });
  expect(result.valid).toBe(false);
  expect(result.errors.some(error => error.includes("Distribution CEF absente"))).toBe(true);
});
