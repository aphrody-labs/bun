// SPDX-License-Identifier: MIT
// Regenerates the tool table of docs/runtime/mcp.mdx from the tool descriptors of a `bun mcp`
// binary (`bun mcp tools --markdown`), the single source of the tool list.
//
//   bun scripts/aphrody/mcp-docs.ts [--bun <path>] [--check]
//
// --bun defaults to the debug build (build/debug/bun-debug), then `bun` on PATH.
// --check exits 1 when the page is out of date instead of writing it.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dir, "..", "..");
const page = join(root, "docs", "runtime", "mcp.mdx");
const START = "{/* generated:mcp-tools:start — bun scripts/aphrody/mcp-docs.ts */}";
const END = "{/* generated:mcp-tools:end */}";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: { bun: { type: "string" }, check: { type: "boolean", default: false } },
});

const debug = join(root, "build", "debug", process.platform === "win32" ? "bun-debug.exe" : "bun-debug");
const bun = values.bun ?? (existsSync(debug) ? debug : "bun");
const proc = Bun.spawnSync({ cmd: [bun, "mcp", "tools", "--markdown"], stdout: "pipe", stderr: "pipe" });
if (proc.exitCode !== 0) {
  console.error(`${bun} mcp tools --markdown failed:\n${proc.stderr.toString()}`);
  process.exit(1);
}
const table = proc.stdout.toString().trimEnd();
const text = await Bun.file(page).text();
const start = text.indexOf(START);
const end = text.indexOf(END);
if (start < 0 || end < start) {
  console.error(`${page}: generated markers not found`);
  process.exit(1);
}
const next = `${text.slice(0, start + START.length)}\n\n${table}\n\n${text.slice(end)}`;
if (next === text) {
  console.log("docs/runtime/mcp.mdx is up to date");
} else if (values.check) {
  console.error("docs/runtime/mcp.mdx is out of date: run bun scripts/aphrody/mcp-docs.ts");
  process.exit(1);
} else {
  await Bun.write(page, next);
  console.log("updated docs/runtime/mcp.mdx");
}
