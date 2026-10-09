#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { discoverRuntime } from "./toolchain.ts";

const args = process.argv.slice(2);
const artifactAt = args.indexOf("--artifact");
const artifact = artifactAt >= 0 ? args[artifactAt + 1] : undefined;
if (artifactAt >= 0) args.splice(artifactAt, 2);
const tool = args.shift();
if (!tool || (tool !== "uv" && tool !== "ruff") || (artifactAt >= 0 && !artifact)) {
  console.error("usage: bun scripts/run.ts [--artifact <vu-prefix>] <uv|ruff> [arguments ...]");
  process.exit(2);
}

const report = await discoverRuntime({ artifact });
if (report.status !== "qualified") {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

const path = report.tools[tool]?.path;
if (!path) {
  console.error(`python-toolchain: qualified ${tool} executable is missing`);
  process.exit(1);
}
const child = Bun.spawn([path, ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exitCode = await child.exited;
