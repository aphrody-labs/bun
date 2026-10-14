// Source-derived MCP metadata; schemas remain on the qualified running MCP server.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type McpTool = { name: string; title: string };
export type CatalogSource = { path: string; sha256: string };
export type McpAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};
export type McpDecisionTool = McpTool & {
  description: string | null;
  annotations: McpAnnotations | null;
  sources: CatalogSource[];
  /** Unsupported expressions remain explicit; metadata never grants permission. */
  unresolved: ("description" | "annotations")[];
};

function maybe(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return undefined;
  }
}

/** One Rust field expression, including quoted commas and balanced calls/structs. */
function expression(text: string, start = 0): { value: string; end: number } {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const raw = /^r(#+)?"/.exec(text.slice(i));
    if (raw) {
      const end = text.indexOf('"' + (raw[1] ?? ""), i + raw[0].length);
      if (end === -1) return { value: text.slice(start), end: text.length };
      i = end + (raw[1]?.length ?? 0);
    } else if (text[i] === '"') {
      for (i++; i < text.length; i++) {
        if (text[i] === "\\") i++;
        else if (text[i] === '"') break;
      }
    } else if ("({[".includes(text[i]!)) depth++;
    else if (")}]".includes(text[i]!)) {
      if (depth === 0) return { value: text.slice(start, i).trim(), end: i };
      depth--;
    } else if ((text[i] === "," || text[i] === ";") && depth === 0)
      return { value: text.slice(start, i).trim(), end: i + 1 };
  }
  return { value: text.slice(start).trim(), end: text.length };
}

function field(body: string, name: string): string | undefined {
  const found = new RegExp(`\\b${name}:\\s*`).exec(body);
  return found ? expression(body, found.index + found[0].length).value : undefined;
}

function literal(raw: string): string | undefined {
  const quote = /^r(#+)?"([\s\S]*)"\1$/.exec(raw);
  if (quote) return quote[2];
  if (!/^"(?:[^"\\]|\\.)*"$/.test(raw)) return;
  try {
    return JSON.parse(raw) as string;
  } catch {
    // Rust-only escapes are not inferred by this source reader.
    return undefined;
  }
}

type Constant = { value: string; path: string };
function constants(root: string): Map<string, Constant | undefined> {
  const out = new Map<string, Constant | undefined>();
  const src = join(root, "src");
  if (!existsSync(src)) return out;
  for (const dir of readdirSync(src, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!dir.isDirectory()) continue;
    const path = `src/${dir.name}/tools.rs`;
    const body = maybe(join(root, path));
    if (!body) continue;
    for (const found of body.matchAll(/pub const (\w+): &str\s*=\s*/g)) {
      const value = literal(expression(body, found.index + found[0].length).value);
      if (value === undefined) continue;
      // Ambiguous imports do not silently inherit the last crate's declaration.
      out.set(found[1]!, out.has(found[1]!) ? undefined : { value, path });
    }
  }
  return out;
}

function stringValue(
  raw: string | undefined,
  local: string,
  consts: Map<string, Constant | undefined>,
  sources: Set<string>,
): string | undefined {
  if (!raw) return;
  const text = literal(raw);
  if (text !== undefined) return text;
  const concat = /^(?:const_format::)?concat(?:cp)?!\(([\s\S]*)\)$/.exec(raw);
  if (concat) {
    let start = 0;
    let result = "";
    while (start < concat[1]!.length) {
      if (!concat[1]!.slice(start).trim()) break;
      const next = expression(concat[1]!, start);
      const part = stringValue(next.value, local, consts, sources);
      if (part === undefined) return;
      result += part;
      start = next.end;
    }
    return result;
  }
  if (/^\w+$/.test(raw)) {
    const declared = new RegExp(`\\bconst ${raw}: &str\\s*=\\s*`).exec(local);
    if (declared) return stringValue(expression(local, declared.index + declared[0].length).value, "", consts, sources);
  }
  const name = /^(?:\w+::)*(\w+)$/.exec(raw)?.[1];
  const resolved = name ? consts.get(name) : undefined;
  if (resolved) sources.add(resolved.path);
  return resolved?.value;
}

function annotations(raw: string | undefined, local: string, registry: string): McpAnnotations | null {
  if (!raw) return null;
  const named = /^Annotations::(\w+)$/.exec(raw);
  if (named) {
    const declared = new RegExp(`\\bconst ${named[1]}: Self\\s*=\\s*`).exec(registry);
    if (!declared) return null;
    raw = expression(registry, declared.index + declared[0].length).value;
  } else if (/^\w+$/.test(raw)) {
    const declared = new RegExp(`\\bconst ${raw}: Annotations\\s*=\\s*`).exec(local);
    if (!declared) return null;
    raw = expression(local, declared.index + declared[0].length).value;
  }
  const hints = ["read_only", "destructive", "idempotent", "open_world"].map(
    name => new RegExp(`\\b${name}:\\s*(true|false)\\b`).exec(raw!)?.[1],
  );
  if (hints.some(hint => hint === undefined)) return null;
  return {
    readOnlyHint: hints[0] === "true",
    destructiveHint: hints[1] === "true",
    idempotentHint: hints[2] === "true",
    openWorldHint: hints[3] === "true",
  };
}

/** The same tools/list order; compatibility projection deliberately keeps only name/title. */
export function mcpTools(root: string): McpTool[] {
  return mcpDecisionTools(root).map(({ name, title }) => ({ name, title }));
}

/** Public source metadata, not proof that the running binary exposes or qualifies a tool. */
export function mcpDecisionTools(root: string): McpDecisionTool[] {
  const dir = join(root, "src", "mcp", "tools");
  const mod = maybe(join(dir, "mod.rs"));
  if (!mod) return [];
  const builtin = /BUILTIN[^=]*=\s*&\[([\s\S]*?)\];/.exec(mod)?.[1] ?? "";
  const modules = [...builtin.matchAll(/(\w+)::TOOLS/g)].map(match => match[1]!);
  const consts = constants(root);
  const registry = maybe(join(root, "src", "mcp", "registry.rs")) ?? "";
  const cache = new Map<string, CatalogSource>();
  const source = (path: string): CatalogSource[] => {
    const existing = cache.get(path);
    if (existing) return [existing];
    const body = maybe(join(root, path));
    if (body === undefined) return [];
    const entry = { path, sha256: createHash("sha256").update(body).digest("hex") };
    cache.set(path, entry);
    return [entry];
  };
  const out: McpDecisionTool[] = [];
  for (const module of modules) {
    const body = maybe(join(dir, `${module}.rs`)) ?? "";
    const found: McpDecisionTool[] = [];
    const entries = [...body.matchAll(/\bname:\s*([^,\n]+),\s*title:\s*/g)];
    const add = (
      name: string,
      title: string,
      description: string | undefined,
      hints: McpAnnotations | null,
      paths: Set<string>,
    ) => {
      found.push({
        name,
        title,
        description: description ?? null,
        annotations: hints,
        sources: [...new Set(["src/mcp/tools/mod.rs", `src/mcp/tools/${module}.rs`, ...paths])].flatMap(source),
        unresolved: [
          ...(description === undefined ? ["description" as const] : []),
          ...(hints === null ? ["annotations" as const] : []),
        ],
      });
    };
    for (const [i, match] of entries.entries()) {
      const paths = new Set(["src/mcp/registry.rs"]);
      const name = stringValue(match[1]!.trim(), body, consts, paths);
      if (!name || !/^\w+$/.test(name)) continue;
      const entry = body.slice(match.index, entries[i + 1]?.index);
      add(
        name,
        stringValue(field(entry, "title"), body, consts, paths) ?? name,
        stringValue(field(entry, "description"), body, consts, paths),
        annotations(field(entry, "annotations"), body, registry),
        paths,
      );
    }
    if (!found.length && body.includes("tools.json")) {
      const spec = maybe(join(root, "src", "agent_tools", "tools.json"));
      if (spec) {
        const items = JSON.parse(spec).tools as { name: string; title?: string; description?: string }[];
        for (const tool of items)
          add(
            tool.name,
            tool.title ?? tool.name,
            tool.description,
            annotations(field(body, "annotations"), body, registry),
            new Set(["src/agent_tools/tools.json", "src/agent_tools/lib.rs", "src/mcp/registry.rs"]),
          );
      }
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
