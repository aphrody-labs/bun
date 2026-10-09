// What `bun mcp` and `bun lsp` offer, read from their sources so the plugins never list them by hand:
// the tool modules registered in src/mcp/tools/mod.rs (literal names, constants of another crate, or the
// agent tools of src/agent_tools/tools.json) and the file extensions routed by src/lsp/language.rs.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type McpTool = { name: string; title: string };

function maybe(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/** `pub const NAME: &str = "value";` anywhere in the `tools.rs` of a crate. */
function constants(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const src = join(root, "src");
  let dirs: string[] = [];
  try {
    dirs = readdirSync(src).sort();
  } catch {}
  for (const d of dirs) {
    const body = maybe(join(src, d, "tools.rs"));
    if (!body) continue;
    for (const m of body.matchAll(/pub const (\w+): &str = "((?:[^"\\]|\\.)*)";/g)) out.set(m[1]!, m[2]!);
  }
  return out;
}

function value(raw: string, consts: Map<string, string>): string | undefined {
  const lit = /^"((?:[^"\\]|\\.)*)"$/.exec(raw);
  if (lit) return lit[1];
  const path = /(?:\w+::)*(\w+)$/.exec(raw);
  return path ? consts.get(path[1]!) : undefined;
}

/** The tools of `bun mcp`, in `tools/list` order. Empty when the checkout has no MCP server. */
export function mcpTools(root: string): McpTool[] {
  const dir = join(root, "src", "mcp", "tools");
  const mod = maybe(join(dir, "mod.rs"));
  if (!mod) return [];
  const builtin = /BUILTIN[^=]*=\s*&\[([\s\S]*?)\];/.exec(mod)?.[1] ?? "";
  const modules = [...builtin.matchAll(/(\w+)::TOOLS/g)].map(m => m[1]);
  const consts = constants(root);
  const out: McpTool[] = [];
  for (const m of modules) {
    const body = maybe(join(dir, `${m}.rs`)) ?? "";
    const found: McpTool[] = [];
    for (const t of body.matchAll(/\bname:\s*([^,\n]+),\s*title:\s*([^,\n]+),/g)) {
      const name = value(t[1]!.trim(), consts);
      if (name && /^\w+$/.test(name)) found.push({ name, title: value(t[2]!.trim(), consts) ?? name });
    }
    if (!found.length && body.includes("tools.json")) {
      const spec = maybe(join(root, "src", "agent_tools", "tools.json"));
      if (spec) for (const t of JSON.parse(spec).tools ?? []) found.push({ name: t.name, title: t.title ?? t.name });
    }
    out.push(...found);
  }
  return out;
}

/** Extension (with the dot) -> LSP language id, for every file `bun lsp` serves. Empty without src/lsp. */
export function lspExtensions(root: string): Record<string, string> {
  const body = maybe(join(root, "src", "lsp", "language.rs"));
  if (!body) return {};
  const fn = (name: string) => {
    const start = body.indexOf(`fn ${name}(`);
    if (start === -1) return "";
    const end = body.indexOf("\n    }\n", start);
    return body.slice(start, end === -1 ? undefined : end);
  };
  const arms = (code: string) =>
    [...code.matchAll(/((?:"[^"]+"\s*\|\s*)*"[^"]+")\s*=>\s*(?:\{\s*)?([^,\n}]+)/g)].map(m => ({
      keys: [...m[1]!.matchAll(/"([^"]+)"/g)].map(k => k[1]!),
      to: m[2]!.trim(),
    }));
  const ids = new Map<string, string>();
  let fallback: string | undefined;
  const idFn = fn("language_id");
  for (const a of arms(idFn)) {
    const id = /^"([^"]+)"$/.exec(a.to)?.[1];
    if (id) for (const k of a.keys) ids.set(k, id);
  }
  fallback = /_\s*=>\s*"([^"]+)"/.exec(idFn)?.[1];
  const out: Record<string, string> = {};
  for (const a of arms(fn("of_path"))) {
    if (!a.to.startsWith("Language::")) continue;
    for (const k of a.keys) {
      const id = ids.get(k) ?? fallback;
      if (id) out[`.${k}`] = id;
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

export function catalogInputs(root: string): string[] {
  const out = [join(root, "src", "lsp", "language.rs"), join(root, "src", "agent_tools", "tools.json")];
  const dir = join(root, "src", "mcp", "tools");
  try {
    for (const f of readdirSync(dir).sort()) if (f.endsWith(".rs")) out.push(join(dir, f));
  } catch {}
  try {
    for (const d of readdirSync(join(root, "src")).sort()) out.push(join(root, "src", d, "tools.rs"));
  } catch {}
  return out.filter(p => existsSync(p));
}
