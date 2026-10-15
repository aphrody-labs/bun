import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableExecutable } from "./install";
import { probeMcp } from "./mcp-probe";

test.skipIf(process.platform === "win32")("installed MCP command prefers the bun link over a versioned file", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-plugin-exe-"));
  try {
    const versioned = join(dir, "bun-9.9.9");
    writeFileSync(versioned, "");
    expect(stableExecutable(versioned)).toBe(versioned);
    symlinkSync(versioned, join(dir, "bun"));
    expect(stableExecutable(versioned)).toBe(join(dir, "bun"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("doctor probe reports a server that does not answer initialize", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-plugin-probe-"));
  try {
    mkdirSync(join(dir, "local"));
    const server = (args: string[]) =>
      writeFileSync(
        join(dir, "local", "mcp.json"),
        JSON.stringify({ mcpServers: { bun: { command: process.execPath, args } } }),
      );
    server(["-e", "console.error('Script not found'); process.exit(1)"]);
    const failing = await probeMcp(dir);
    expect(failing?.error).toContain("Script not found");
    expect(failing?.ok).toBe(false);
    server(["-e", `console.log(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }))`]);
    const working = await probeMcp(dir);
    expect(working?.error).toBeUndefined();
    expect(working?.ok).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
