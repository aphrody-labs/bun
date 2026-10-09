// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

test("missing native host is reported open and never as activation", () => {
  const result = spawnSync(process.execPath, [join(here, "run.ts")], {
    encoding: "utf8",
    env: { ...process.env, BUN_PYTHON_HOST_LIBRARY: "" },
  });

  expect(result.status).toBe(77);
  const report = JSON.parse(result.stdout);
  expect(report.status).toBe("open");
  expect(report.nativeDispatchExecuted).toBe(false);
  expect(report.activationVerified).toBe(false);
  expect(report.checks.every((check: { status: string }) => check.status === "skipped")).toBe(true);
  expect(result.stderr).toBe("");
});
