// OpenCode adapter: keep command rewriting owned by the shared Bun engine.
import { bunCheckout, isAphrodyBun } from "./hooks/common.ts";
import { rewriteCommand } from "./hooks/rewrite.ts";

export const BunPlugin = async ({ directory }: { directory: string }) => ({
  "tool.execute.before": async (input: { tool: string }, output: { args: Record<string, unknown> }) => {
    if (input.tool !== "bash" || process.env.BUN_AGENT_PLUGIN_REWRITE !== "1") return;
    const command = output.args.command;
    if (typeof command !== "string") return;
    const result = rewriteCommand(command, {
      bunCheckout: bunCheckout(directory) !== undefined,
      aphrody: isAphrodyBun(),
    });
    if (result) output.args.command = result.command;
  },
});
