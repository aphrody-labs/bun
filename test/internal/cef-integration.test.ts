import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import {
  CEF_CHROMIUM_VERSION,
  CEF_VERSION,
  CHROMIUM_REVISION,
  CHROMIUM_BASE_REVISION,
  environment,
  layout,
  plan,
} from "../../scripts/aphrody/cef";

test("CEF integration keeps one pinned ABI contract", () => {
  expect(CEF_VERSION).toBe("157.0.0");
  expect(CEF_CHROMIUM_VERSION).toBe("157.0.8099.0");
  expect(CHROMIUM_REVISION).toMatch(/^[0-9a-f]{40}$/);
  expect(CHROMIUM_REVISION).toBe("95ff46fdacff0d4973f17710418f12e1ceedeed9");
  expect(CHROMIUM_BASE_REVISION).toBe("ce0615a76d6347f1914d673f1da66285b328d494");
});

test("CEF layout is repo-relative and overridable without mutation", () => {
  const directory = resolve("build/cef-test-fixture");
  const value = layout({ CEF_PATH: directory });
  expect(value.distribution).toBe(directory);
  expect(value.chromiumSource.endsWith(join("vendor", "chromium", "src"))).toBe(true);
  expect(value.cefSource.endsWith(join("vendor", "cef"))).toBe(true);
});

test("CEF environment exports the shared contract", () => {
  const directory = resolve("build/cef-test-fixture");
  const value = layout({ CEF_PATH: directory });
  const env = environment(value, { PATH: "test" });
  expect(env.CEF_PATH).toBe(directory);
  expect(env.BUN_CEF_VERSION).toBe(CEF_VERSION);
  expect(env.BUN_CHROMIUM_REVISION).toBe(CHROMIUM_REVISION);
});

test("CEF plan reports missing binaries instead of claiming readiness", () => {
  const result = plan({ CEF_PATH: resolve("build/missing-cef-fixture") });
  expect(result.valid).toBe(false);
  expect(result.errors.some(error => error.includes("Distribution CEF absente"))).toBe(true);
  expect(result.source.upstreamChromiumVersion).toBe("156.0.8078.0");
  expect(result.source.targetChromiumVersion).toBe("157.0.8099.0");
  expect(result.source.gen.argv).toContain("uv");
});
