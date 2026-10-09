// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buvHome, hostTarget } from "./install.ts";
import { ROOT } from "./lib.ts";

const sourceRoot = process.env["BUV_SOURCE_CHECKOUT"] ?? ROOT;

const prefix =
  process.env["BUV_PREFIX"] ?? process.env["BUV_TEST_ARTIFACT"] ?? join(buvHome(), "runtime", hostTarget(), "current");
const python =
  ["python3", "python3.12", "python"].map(name => join(prefix, "bin", name)).find(existsSync) ??
  join(prefix, "bin/python3");
const tests = join(sourceRoot, "tests");

// The canonical helpers embedded in the binary are tested with the runtime's own interpreter.
test.skipIf(!existsSync(python) || !existsSync(tests))(
  "canonical embedded Python programs pass their unittest suite",
  () => {
    const run = Bun.spawnSync([python, "-m", "unittest", "discover", "-s", tests, "-v"], {
      cwd: sourceRoot,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = run.stderr.toString() + run.stdout.toString();
    expect(output).toContain("OK");
    expect(run.exitCode).toBe(0);
  },
);
