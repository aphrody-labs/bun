// Starts the installed MCP server command and checks that it answers `initialize`.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface McpProbe {
  config: string;
  command: string;
  args: string[];
  ok: boolean;
  error?: string;
}

export async function probeMcp(root: string, timeout = 15000): Promise<McpProbe | null> {
  const config = join(root, "local", "mcp.json");
  let server: { command?: string; args?: string[] } | undefined;
  try {
    server = JSON.parse(readFileSync(config, "utf8")).mcpServers?.bun;
  } catch {
    return null;
  }
  if (!server?.command) return null;
  const command = server.command;
  const args = server.args ?? [];
  const result: McpProbe = { config, command, args, ok: false };
  const request = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "bun-agent-plugin-doctor", version: "1" },
    },
  };
  let child: ReturnType<typeof Bun.spawn<"pipe", "pipe", "pipe">>;
  try {
    child = Bun.spawn([command, ...args], { stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout });
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
  child.stdin.write(JSON.stringify(request) + "\n");
  child.stdin.flush();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    for await (const chunk of child.stdout) {
      buffered += decoder.decode(chunk, { stream: true });
      const line = buffered.split("\n").find(l => l.includes('"id":1'));
      if (line) {
        const message = JSON.parse(line);
        result.ok = message.result !== undefined;
        if (!result.ok) result.error = JSON.stringify(message.error ?? message);
        break;
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  child.kill();
  if (!result.ok && !result.error) {
    const stderr = (await child.stderr.text()).trim() || buffered.trim();
    result.error = (stderr || `exited with ${await child.exited}`).split("\n")[0]!;
  }
  return result;
}
