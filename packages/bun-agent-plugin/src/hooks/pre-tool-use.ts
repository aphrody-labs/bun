// PreToolUse on shell commands: npm/npx/yarn/pnpm/node/pip/python/uv -> the Bun fork, `bun test` in a Bun checkout
// -> `bun bd test`. Rewrites the command where the agent supports it, otherwise blocks it with the replacement.
//
//   claude: updatedInput; auto-approved only in bypassPermissions mode, otherwise the user sees the rewritten command
//   codex:  updatedInput + allow in bypassPermissions/never-ask mode, otherwise deny with the replacement
//   agy:    overwrite of CommandLine, decision "ask" (or "allow" with BUN_AGENT_PLUGIN_AUTO_ALLOW=1)
//
// On Grep, Glob and the shell commands doing their job (Claude Code), names the `bun mcp` tools to prefer, once per
// session (hooks/tools.json).
//
// BUN_AGENT_PLUGIN_REWRITE=0 turns the rewrite off; `# keep-node` (or keep-npm, keep-tool) in a command keeps it as written.

import { bunCheckout, cwdOf, input, isFork, preferHint, reply, target } from "./common.ts";
import { rewriteCommand } from "./rewrite.ts";

const t = target();
const event = await input();

function commandOf(e: Record<string, any>): string | undefined {
  if (t === "agy") {
    const args = e.toolCall?.args;
    return typeof args?.CommandLine === "string" ? args.CommandLine : undefined;
  }
  const c = e.tool_input?.command;
  if (typeof c === "string") return c;
  if (Array.isArray(c) && c.every(x => typeof x === "string")) return c.join(" ");
  return undefined;
}

const command = process.env.BUN_AGENT_PLUGIN_REWRITE === "0" ? undefined : commandOf(event);
const result = command
  ? rewriteCommand(command, { bunCheckout: bunCheckout(cwdOf(event)) !== undefined, fork: isFork() })
  : undefined;

if (!result) {
  const hint = t === "claude" ? preferHint(t, event, commandOf(event)) : undefined;
  if (hint) reply({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: hint } });
  else if (t === "agy") reply({});
} else {
  const reason = `Bun fork: ${result.changes.join("; ")}`;
  const autoAllow = process.env.BUN_AGENT_PLUGIN_AUTO_ALLOW === "1";
  if (t === "agy") {
    reply({ decision: autoAllow ? "allow" : "ask", reason, overwrite: { CommandLine: result.command } });
  } else {
    const bypass = autoAllow || event.permission_mode === "bypassPermissions" || event.permission_mode === "never";
    const updatedInput = { ...event.tool_input, command: result.command };
    if (bypass) {
      reply({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: reason,
          updatedInput,
        },
      });
    } else if (t === "claude") {
      reply({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: reason,
          updatedInput,
        },
      });
    } else {
      reply({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `${reason}. Run instead: ${result.command}`,
        },
      });
    }
  }
}
