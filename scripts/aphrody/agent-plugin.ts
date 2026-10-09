// Generates the Bun fork's plugin for Claude Code, Codex and Antigravity/Gemini CLI from this checkout, and installs
// it: `bun scripts/aphrody/agent-plugin.ts generate|install|uninstall|doctor|...` (see docs/project/agent-plugin.mdx).
// The checkout is the one this script is in, unless --root is given.

import { resolve } from "node:path";
import { main } from "../../packages/bun-agent-plugin/src/cli.ts";

const argv = process.argv.slice(2);
if (!argv.some(a => a === "--root" || a.startsWith("--root=") || a === "--from" || a.startsWith("--from=")))
  argv.push("--root", resolve(import.meta.dir, "..", ".."));

await main(argv).catch(error => {
  console.error(`agent-plugin: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
