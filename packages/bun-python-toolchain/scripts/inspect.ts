#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { discoverRuntime, probePythonCapabilities } from "./toolchain.ts";

const args = process.argv.slice(2);
let artifact: string | undefined;
let capabilities = false;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--artifact" && args[index + 1]) artifact = args[++index];
  else if (arg === "--capabilities") capabilities = true;
  else {
    console.error("usage: bun scripts/inspect.ts [--artifact <vu-prefix>] [--capabilities]");
    process.exit(2);
  }
}

try {
  const report = await discoverRuntime({ artifact });
  if (capabilities && report.status === "qualified")
    await probePythonCapabilities(report);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "qualified") process.exitCode = 1;
} catch (error) {
  console.error(`python-toolchain: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
