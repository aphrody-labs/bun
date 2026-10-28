// SessionStart / first PreInvocation: identify the executing runtime, load generated rules and
// refresh the legacy embedded plugin only when running the Aphrody runtime.

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
  lines.push(`Bun ${Bun.version_with_sha} at ${process.execPath}; use official upstream canary by default. Aphrody-specific integrations require an explicitly selected compatible runtime until migrated.`);
}

const checkout = bunCheckout(cwdOf(event));
if (checkout) {
  lines.push(
    `This is a Bun checkout (${checkout}). Qualify runtime changes with the corresponding changed binary; installed upstream Bun does not contain checkout changes.`,
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
        windowsHide: true,
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
