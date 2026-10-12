// UserPromptSubmit (Claude, Codex): when the prompt names a Node.js module or an npm package Bun replaces
// (native.json, generated from src/native.ts and the n2b registry), adds the Bun-native replacement for those
// names only. Prints nothing otherwise.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { input, reply } from "./common.ts";

type Native = { skill: string; search: string; instead: { names: string[]; use: string }[] };

const event = await input();
const prompt = typeof event.prompt === "string" ? event.prompt : "";
let native: Native | undefined;
try {
  native = JSON.parse(readFileSync(join(import.meta.dir, "native.json"), "utf8"));
} catch {}

if (native && prompt) {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hits: string[] = [];
  for (const r of native.instead) {
    const found = r.names.filter(n =>
      new RegExp(`(?<![\\w@/.:-])${escape(n)}(?![\\w-]|\\.\\w)`, /^[a-z0-9@/._-]+$/.test(n) ? "i" : "").test(prompt),
    );
    if (found.length) hits.push(`- ${found.join(", ")}: ${r.use}`);
    if (hits.length >= 8) break;
  }
  if (hits.length)
    reply({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          `Bun-native replacements for what this prompt names (skill ${native.skill}; more: examples_search of bun mcp or ${native.search}<words>):\n` +
          hits.join("\n"),
      },
    });
}
