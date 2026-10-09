// Shared by the hook scripts. Every hook is one `bun <hook>.ts <target>` process per event, so this stays small:
// node:fs, node:os and node:path only, nothing that spawns.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export type Target = "claude" | "codex" | "agy";

export function target(): Target {
  const t = process.argv[2];
  return t === "codex" || t === "agy" ? t : "claude";
}

export async function input(): Promise<Record<string, any>> {
  try {
    const text = await Bun.stdin.text();
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export function reply(value: unknown): void {
  if (value !== undefined) process.stdout.write(JSON.stringify(value));
}

/** The bun running this hook is the aphrody-labs/bun fork (the bun on PATH, since hooks run `bun <hook>.ts`). */
export function isFork(): boolean {
  if (Bun.version_with_sha.includes("aphrody")) return true;
  try {
    // The fork serves these npm names from built-in modules (src/js/thirdparty); upstream resolves files or fails.
    return Bun.resolveSync("picocolors", import.meta.dir) === "picocolors";
  } catch {
    return false;
  }
}

/** The root of the Bun checkout containing `dir`, if any. */
export function bunCheckout(dir: string | undefined): string | undefined {
  if (!dir) return undefined;
  let d = resolve(dir);
  for (let i = 0; i < 64; i++) {
    if (existsSync(join(d, "scripts", "build.ts")) && existsSync(join(d, "src", "runtime", "cli"))) return d;
    const up = dirname(d);
    if (up === d) return undefined;
    d = up;
  }
  return undefined;
}

/** The workspace directory of the event: Claude and Codex send `cwd`, Antigravity `workspacePaths`. */
export function cwdOf(event: Record<string, any>): string {
  return event.cwd ?? event.workspacePaths?.[0] ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

export type Meta = { name: string; version: string; bunVersion: string; hash: string };

/** `meta.json` at the root of the plugin this hook belongs to. */
export function meta(): Meta | undefined {
  try {
    return JSON.parse(readFileSync(join(import.meta.dir, "..", "meta.json"), "utf8"));
  } catch {
    return undefined;
  }
}

type ToolsFile = {
  server: string;
  plugin: string;
  tools: string[];
  prefer: { instead: string; bash: string; use: string[] }[];
};

/**
 * The `bun mcp` tools to suggest instead of the built-in tool `toolName` (or the shell `command`), once per
 * session and kind: `tools.json` is generated from the server's sources, so only tools it has are named.
 */
export function preferHint(t: Target, event: Record<string, any>, command: string | undefined): string | undefined {
  const session = typeof event.session_id === "string" ? event.session_id.replace(/[^\w-]/g, "") : "";
  if (!session) return undefined;
  let file: ToolsFile;
  try {
    file = JSON.parse(readFileSync(join(import.meta.dir, "tools.json"), "utf8"));
  } catch {
    return undefined;
  }
  const rule = file.prefer.find(p => p.instead === event.tool_name || (command && new RegExp(p.bash).test(command)));
  if (!rule) return undefined;
  const stamp = join(tmpdir(), `bun-agent-plugin-${session}-${rule.instead}`);
  if (existsSync(stamp)) return undefined;
  try {
    writeFileSync(stamp, "");
  } catch {}
  const name = (n: string) => (t === "claude" ? `mcp__plugin_${file.plugin}_${file.server}__${n}` : n);
  return `For code, the ${file.server} MCP server (bun mcp) has ${rule.use.map(name).join(", ")}: prefer them over ${rule.instead} when they fit.`;
}
