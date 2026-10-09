// SessionStart (Claude, Codex) / first PreInvocation (Antigravity): says whether the `bun` on PATH is the
// Aphrody runtime (aphrody-labs/bun), adds its working rules (context.md, generated from docs/project/agent-plugin.mdx),
// and refreshes the installed plugin in the background when its version differs from `bun --version`.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { bunCheckout, cwdOf, input, isAphrodyBun, meta, reply, target } from "./common.ts";

const t = target();
const event = await input();

if (t === "agy" && Number(event.invocationNum ?? 0) > 1) {
  reply({});
  process.exit(0);
}

const lines: string[] = [];
const aphrody = isAphrodyBun();
if (aphrody) {
  lines.push(`bun ${Bun.version_with_sha} (Aphrody runtime, aphrody-labs/bun) at ${process.execPath}.`);
} else {
  lines.push(
    `WARNING: the bun on PATH (${process.execPath}, ${Bun.version_with_sha}) is not the Aphrody runtime (aphrody-labs/bun). ` +
      'Install it: `curl -fsSL https://aphrody.com/install | bash` (Windows: `powershell -c "irm aphrody.com/install.ps1|iex"`), ' +
      "then make sure ~/.bun/bin comes first on PATH.",
  );
}

const checkout = bunCheckout(cwdOf(event));
if (checkout) {
  lines.push(
    `This is a Bun checkout (${checkout}): build with \`bun bd\`, test with \`bun bd test <file>\` (never plain \`bun test\`).`,
  );
}

try {
  lines.push(readFileSync(join(import.meta.dir, "context.md"), "utf8").trim());
} catch {}

// Self-update: the installed plugin records the bun that installed it (install.json). Another bun on PATH (an
// upgrade, a new build) reinstalls it from its own embedded copy, in the background, once per bun: the installer
// does nothing when the content is the same.
const root = join(process.env.BUN_INSTALL || join(homedir(), ".bun"), "agent-plugin");
let installed: { bun?: string; version?: string } | undefined;
try {
  installed = JSON.parse(readFileSync(join(root, "install.json"), "utf8"));
} catch {}
if (aphrody && installed && installed.bun !== Bun.version_with_sha) {
  const stamp = join(root, ".update-attempt");
  let last = "";
  try {
    last = readFileSync(stamp, "utf8");
  } catch {}
  if (last !== Bun.version_with_sha) {
    try {
      writeFileSync(stamp, Bun.version_with_sha);
      spawn(process.execPath, ["agent-plugin", "install", "--update", "--quiet"], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, BUN_BE_BUN: "1" },
      }).unref();
      if (meta()?.bunVersion !== Bun.version)
        lines.push(`The bun plugin (made for bun ${meta()?.bunVersion}) is being reinstalled for bun ${Bun.version}.`);
    } catch {}
  }
}

const text = lines.join("\n");
if (t === "agy") reply({ injectSteps: [{ ephemeralMessage: text }] });
else reply({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } });
