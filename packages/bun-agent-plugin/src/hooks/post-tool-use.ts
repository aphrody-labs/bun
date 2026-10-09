// PostToolUse on shell commands: when a command failed because npm/node/python/... is missing, says which Aphrody runtime
// command replaces it. Silent otherwise.

import { input, reply, target } from "./common.ts";
import { rewriteCommand } from "./rewrite.ts";

const t = target();
const event = await input();

let hint: string | undefined;
const command: unknown = t === "agy" ? event.toolCall?.args?.CommandLine : event.tool_input?.command;
const response = event.tool_response ?? {};
const output = [event.error, response.stderr, response.output, typeof response === "string" ? response : ""]
  .filter(x => typeof x === "string")
  .join("\n");
if (
  typeof command === "string" &&
  /command not found|is not recognized as|No such file or directory|cannot find the path|ENOENT/i.test(output)
) {
  const r = rewriteCommand(command, { aphrody: true });
  if (r) hint = `Use the Aphrody runtime instead: ${r.command}`;
}

if (t === "agy") reply({});
else if (hint) reply({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: hint } });
