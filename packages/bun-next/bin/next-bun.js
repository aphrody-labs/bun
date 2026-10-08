#!/usr/bin/env bun
"use strict";
const { dirname } = require("node:path");
const { applyPatch, checkPatch } = require("../lib/patch.js");

const [command = "patch", projectDir = process.cwd()] = process.argv.slice(2);
const nextDir = dirname(require.resolve("next/package.json", { paths: [projectDir] }));

if (command === "patch") {
  const { version, changed } = applyPatch(nextDir);
  console.log(`next@${version}: ${changed.length ? `patched ${changed.length} file(s)` : "already patched"}`);
} else if (command === "check") {
  const { version, supported, patched } = checkPatch(nextDir);
  console.log(`next@${version}: ${patched ? "patched" : "not patched"}${supported ? "" : " (unsupported version)"}`);
  process.exit(patched ? 0 : 1);
} else {
  console.error("usage: next-bun [patch|check] [projectDir]");
  process.exit(2);
}
