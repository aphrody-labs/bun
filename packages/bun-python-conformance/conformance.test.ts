// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { terminalExitStatus } from "./run.ts";

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

test("missing installed Python executable is reported open", () => {
  const result = spawnSync(process.execPath, [join(here, "run.ts")], {
    encoding: "utf8",
    env: {
      ...process.env,
      BUN_PYTHON_HOST_LIBRARY: process.execPath,
      BUN_PYTHON_LIBPYTHON: process.execPath,
      BUN_PYTHON_EXECUTABLE: "",
    },
  });

  expect(result.status).toBe(77);
  const report = JSON.parse(result.stdout);
  expect(report.status).toBe("open");
  expect(report.checks.every((check: { status: string }) => check.status === "skipped")).toBe(true);
});

test("negative CPython terminal exit is represented by the process status byte", () => {
  expect(terminalExitStatus(-1)).toBe(255);
  expect(terminalExitStatus(7)).toBe(7);
});

test("real host evidence closes source hashes and records terminal exits without claiming return", () => {
  const evidence = JSON.parse(readFileSync(join(here, "native-host-provenance.json"), "utf8"));

  expect(evidence.transported_source.header_and_implementation_match_payload).toBe(true);
  expect(evidence.transported_source.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(evidence.transported_source.header.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(evidence.transported_source.implementation.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(evidence.built_host.abi_version).toBe(1);
  expect(evidence.actual_conformance_run.native_dispatch_executed).toBe(true);
  expect(evidence.actual_conformance_run.status).toBe("open");
  expect(evidence.actual_conformance_run.system_exit_interpretation).toContain("not out_exit_code");
  expect(evidence.actual_conformance_run.failed).toEqual([]);
});
