// Builds the "bun-native" dataset: instruction → Bun-native code pairs taken from this checkout's sources of truth,
// so coding agents (Claude, Codex) can retrieve how Bun is written at this exact version.
//
//   bun scripts/aphrody/dataset/build.ts [--out build/dataset] [--typecheck] [--bun <binary>]
//
// Sources: docs/**/*.mdx code blocks, @example blocks and function signatures of packages/bun-types/*.d.ts,
// short tests of test/js/bun, the n2b registry (src/n2b/registry/registry/*.toml) and the curated
// Node → Bun pairs of packages/bun-agent-plugin/src/native.ts, REVIEW.md rules, and `bun <command> --help` of the release build when present.
// Every snippet must transpile (Bun.Transpiler); --typecheck runs tsc against packages/bun-types and records the
// result per entry. Deterministic: same checkout, same bytes (no timestamps; entries sorted by id).
//
// Outputs: <out>/bun-native.jsonl and <out>/manifest.json (counts, version, commit, sha256).

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { PAIRS } from "../../../packages/bun-agent-plugin/src/native.ts";

export const DATASET = "bun-native";

export type Kind = "example" | "signature" | "test" | "migration" | "cli" | "config" | "rule";
export type Entry = {
  id: string;
  kind: Kind;
  instruction: string;
  response: string;
  code: string;
  lang: string;
  api: string[];
  tags: string[];
  source: string;
  version: string;
  commit: string;
  checks: { parse: boolean; types?: boolean };
};
type Draft = Omit<Entry, "id" | "version" | "commit" | "checks" | "api"> & { api?: string[]; before?: string };

const LANGS: Record<string, string> = {
  ts: "ts",
  typescript: "ts",
  tsx: "tsx",
  js: "js",
  javascript: "js",
  jsx: "jsx",
  mjs: "js",
  bash: "sh",
  sh: "sh",
  shell: "sh",
  toml: "toml",
};
const CODE_LANGS = new Set(["ts", "tsx", "js", "jsx"]);

// ─── Helpers ───────────────────────────────────────────────────────────────

const norm = (s: string) => s.replace(/\r\n/g, "\n");

function walk(dir: string, accept: (rel: string) => boolean, base = dir, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const rel = relative(base, p).replace(/\\/g, "/");
    if (statSync(p).isDirectory()) walk(p, accept, base, out);
    else if (accept(rel)) out.push(rel);
  }
  return out;
}

/** Markdown/MDX prose to one plain line: links, emphasis, inline JSX and code ticks removed. */
export function plain(md: string): string {
  return md
    .replace(/<[^>]+>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bun APIs a snippet uses: `Bun.x`, `bun:x` modules, named imports from "bun", and Bun-provided globals. */
export function apisOf(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/\bBun\.([A-Za-z_$][\w$]*)(?:\.([a-z][\w$]*))?/g)) {
    const sub =
      m[2] && /^[a-z]/.test(m[1]!) && ["password", "hash", "semver", "s3", "redis", "sql"].includes(m[1]!)
        ? `.${m[2]}`
        : "";
    out.add(`Bun.${m[1]}${sub}`);
  }
  for (const m of code.matchAll(/from\s+["'](bun:[\w/-]+)["']/g)) out.add(m[1]!);
  for (const m of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']bun["']/g))
    for (const name of m[1]!.split(",")) {
      const id = name
        .trim()
        .split(/\s+as\s+/)[0]!
        .replace(/^type\s+/, "");
      if (/^[A-Za-z$][\w$]*$/.test(id)) out.add(id === "$" ? "Bun.$" : `Bun.${id}`);
    }
  if (/\bHTMLRewriter\b/.test(code)) out.add("HTMLRewriter");
  if (/\bnew Worker\(/.test(code)) out.add("Worker");
  if (/\bimport\.meta\.(dir|path|main|file|env|resolve)\b/.test(code)) out.add("import.meta");
  return [...out].sort();
}

export function transpiles(code: string, lang: string): boolean {
  if (!CODE_LANGS.has(lang)) return true;
  try {
    new Bun.Transpiler({ loader: lang as "ts" | "tsx" | "js" | "jsx", target: "bun" }).transformSync(code);
    return true;
  } catch {
    return false;
  }
}

const SECRETS = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{36}\b/,
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bnpm_[A-Za-z0-9]{36}\b/,
];
export const hasSecret = (s: string) => SECRETS.some(r => r.test(s));

const fence = (lang: string, code: string) => "```" + lang + "\n" + code.trimEnd() + "\n```";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// ─── docs/**/*.mdx ─────────────────────────────────────────────────────────

/** Skipped: contributor docs (building Bun itself) and fork planning notes. */
const DOCS_SKIP = /^(project|aphrody)\//;

export function fromMdx(rel: string, text: string): Draft[] {
  const lines = norm(text).split("\n");
  let i = 0;
  const fm: Record<string, string> = {};
  if (lines[0] === "---") {
    for (i = 1; i < lines.length && lines[i] !== "---"; i++) {
      const m = /^([\w-]+):\s*(.*)$/.exec(lines[i]!);
      if (m) fm[m[1]!] = m[2]!.replace(/^["'](.*)["']$/, "$1");
    }
    i++;
  }
  const page = fm.title ?? basename(rel, ".mdx");
  const headings: string[] = [];
  let prose: string[] = [];
  let lastProse = "";
  const out: Draft[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const open = /^(\s*)```([\w-]*)(.*)$/.exec(line);
    if (open) {
      const indent = open[1]!.length;
      const body: string[] = [];
      const start = i + 1;
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]!); i++)
        body.push(lines[i]!.slice(Math.min(indent, lines[i]!.search(/\S|$/))));
      const lang = LANGS[open[2]!.toLowerCase()];
      const title = /title="([^"]+)"/.exec(open[3]!)?.[1] ?? "";
      const code = body.join("\n").trim();
      if (prose.length) lastProse = plain(prose.join(" "));
      prose = [];
      if (!lang || code.length < 30 || (code.split("\n").length < 2 && !/\bbun\b/.test(code))) continue;
      let kind: Kind = CODE_LANGS.has(lang) ? "example" : "cli";
      if (lang === "toml") {
        if (!/bunfig/.test(title + rel + lastProse)) continue;
        kind = "config";
      }
      if (kind === "cli" && !/^\s*(?:\$\s*)?bunx?\s/m.test(code)) continue;
      const heading = headings.filter(Boolean).at(-1) ?? page;
      const where = heading === page ? page : `${heading} (${page})`;
      const ask =
        kind === "cli"
          ? `Which bun command does this: ${where}?`
          : kind === "config"
            ? `Configure Bun in bunfig.toml: ${where}.`
            : `Write Bun code: ${where}.`;
      const context =
        lastProse && lastProse.length > 20 ? lastProse.slice(0, 400) : fm.description ? plain(fm.description) : "";
      out.push({
        kind,
        instruction: context ? `${ask} ${context}` : ask,
        response: `${context ? context + "\n\n" : ""}${fence(lang, code)}\n\nSource: docs/${rel}`,
        code,
        lang,
        tags: ["docs", ...rel.split("/").slice(0, -1)],
        source: `docs/${rel}:${start}`,
      });
      continue;
    }
    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length - 2;
      headings.length = level;
      headings[level] = plain(h[2]!);
      prose = [];
      lastProse = "";
      continue;
    }
    const t = line.trim();
    if (!t) {
      if (prose.length) lastProse = plain(prose.join(" "));
      prose = [];
    } else if (!/^(<|import |\||-{3,}|\{\/\*)/.test(t)) prose.push(t);
  }
  return out;
}

// ─── packages/bun-types/*.d.ts ─────────────────────────────────────────────

/** Name of the declaration following a doc comment, qualified by the enclosing module or namespace. */
function declName(line: string): string | undefined {
  const m =
    /^\s*(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:function|class|interface|const|let|var|type|namespace|enum)\s+([A-Za-z_$][\w$]*)/.exec(
      line,
    ) ?? /^\s*(?:readonly\s+|static\s+|get\s+|set\s+|async\s+)*([A-Za-z_$][\w$]*)\??\s*[<(:]/.exec(line);
  return m?.[1];
}

export function fromDts(rel: string, text: string): Draft[] {
  const lines = norm(text).split("\n");
  const out: Draft[] = [];
  const scope: { name: string; depth: number }[] = [];
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const mod =
      /^\s*declare module\s+["']([^"']+)["']/.exec(line) ??
      /^\s*(?:export\s+)?(?:declare\s+)?namespace\s+([\w.]+)/.exec(line);
    const cls = /^\s*(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (mod || cls) scope.push({ name: (mod ?? cls)![1]!, depth });
    if (/^\s*\/\*\*/.test(line)) {
      const doc: string[] = [];
      const start = i;
      for (; i < lines.length; i++) {
        doc.push(lines[i]!.replace(/^\s*\/?\*+\/?\s?/, "").replace(/\*\/\s*$/, ""));
        if (lines[i]!.includes("*/")) break;
      }
      let j = i + 1;
      while (j < lines.length && !lines[j]!.trim()) j++;
      const name = declName(lines[j] ?? "");
      if (!name) continue;
      const ns = scope.at(-1)?.name;
      const qual = ns && ns !== name ? `${ns === "bun" ? "Bun" : ns}.${name}` : name;
      const summary = plain(doc.slice(0, doc.findIndex(l => l.startsWith("@")) >>> 0).join(" ")).slice(0, 400);
      // @example blocks: optional caption lines, then a fenced block.
      for (let k = 0; k < doc.length; k++) {
        if (!doc[k]!.startsWith("@example")) continue;
        let caption = doc[k]!.slice(8).trim();
        let f = k + 1;
        for (; f < doc.length && !doc[f]!.startsWith("```"); f++) {
          if (doc[f]!.startsWith("@")) break;
          if (doc[f]!.trim()) caption = `${caption} ${doc[f]!.trim()}`.trim();
        }
        if (f >= doc.length || !doc[f]!.startsWith("```")) continue;
        const lang = LANGS[doc[f]!.slice(3).trim().split(/\s/)[0]!.toLowerCase() || "ts"] ?? "ts";
        const body: string[] = [];
        for (f++; f < doc.length && !doc[f]!.startsWith("```"); f++) body.push(doc[f]!);
        const code = body.join("\n").trim();
        if (code.length < 20) continue;
        const what = caption ? `${plain(caption)} — ${qual}` : qual;
        out.push({
          kind: "example",
          instruction: `Write Bun code using ${what}.${summary ? " " + summary : ""}`,
          response: `${summary ? summary + "\n\n" : ""}${fence(lang, code)}\n\nSource: packages/bun-types/${rel} (${qual})`,
          code,
          lang,
          api: [qual.startsWith("Bun.") || qual.includes(":") ? qual : "", ...apisOf(code)].filter(Boolean).sort(),
          tags: ["bun-types", rel.replace(/\.d\.ts$/, "")],
          source: `packages/bun-types/${rel}:${start + 1}`,
        });
        k = f;
      }
      // Function signatures of the Bun namespace and bun:* modules.
      const decl = lines[j]!;
      if (
        summary &&
        /^\s*(?:export\s+)?(?:declare\s+)?function\s/.test(decl) &&
        ns &&
        (ns === "Bun" || ns === "bun" || ns.startsWith("bun:"))
      ) {
        const sig: string[] = [];
        for (let k = j; k < lines.length && sig.length < 25; k++) {
          sig.push(lines[k]!.trim());
          if (/;\s*$/.test(lines[k]!)) break;
        }
        const signature = sig
          .join(" ")
          .replace(/\s+/g, " ")
          .replace(/^export\s+|^declare\s+/g, "");
        out.push({
          kind: "signature",
          instruction: `What is the signature of ${qual} in Bun?`,
          response: `${summary}\n\n${fence("ts", signature)}\n\nSource: packages/bun-types/${rel}`,
          code: signature,
          lang: "ts",
          api: [qual],
          tags: ["bun-types", "signature", rel.replace(/\.d\.ts$/, "")],
          source: `packages/bun-types/${rel}:${j + 1}`,
        });
      }
      i = j - 1;
      continue;
    }
    for (const c of line) {
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        while (scope.length && scope.at(-1)!.depth >= depth) scope.pop();
      }
    }
  }
  return out;
}

// ─── test/js/bun ───────────────────────────────────────────────────────────

const TEST_INTERNAL =
  /\b(bunExe|bunEnv|tempDir|tmpdirSync|tempDirWithFiles|isWindows|isPosix|isLinux|isMacOS|isASAN|isDebug|isCI|gc\(|heapStats|harness|fixture|__dirname|import\.meta\.dir|bun:internal|\$debug|Bun\.unsafe)\b/;

export function fromTest(rel: string, text: string, perFile = 4): Draft[] {
  const lines = norm(text).split("\n");
  const out: Draft[] = [];
  for (let i = 0; i < lines.length && out.length < perFile; i++) {
    const m =
      /^(\s*)(?:it|test)(?:\.concurrent)?\(\s*(["'`])((?:(?!\2).)+)\2\s*,\s*(?:async\s*)?\(\)\s*=>\s*\{\s*$/.exec(
        lines[i]!,
      );
    if (!m) continue;
    const indent = m[1]!;
    let end = -1;
    for (let j = i + 1; j < Math.min(lines.length, i + 40); j++)
      if (lines[j]!.startsWith(indent + "});")) {
        end = j;
        break;
      }
    if (end < 0) continue;
    const body = lines
      .slice(i, end + 1)
      .map(l => l.slice(indent.length))
      .join("\n");
    const startLine = i + 1;
    i = end;
    if (end - startLine > 35 || TEST_INTERNAL.test(body) || !/\bexpect\(/.test(body)) continue;
    const api = apisOf(body);
    if (!api.length) continue;
    const used = [
      "test",
      "expect",
      "describe",
      "mock",
      "spyOn",
      "beforeEach",
      "afterEach",
      "beforeAll",
      "afterAll",
    ].filter(n => new RegExp(`\\b${n}\\b`).test(body));
    const code = `import { ${used.join(", ")} } from "bun:test";\n\n${body.replace(/^it\(/, "test(")}`;
    const area = rel.split("/").slice(0, -1).join("/");
    out.push({
      kind: "test",
      instruction: `Write a bun:test test for ${api.join(", ")}: ${m[3]}.`,
      response: `${fence("ts", code)}\n\nSource: test/js/bun/${rel}`,
      code,
      lang: "ts",
      api,
      tags: ["test", "bun:test", ...(area ? area.split("/") : [])],
      source: `test/js/bun/${rel}:${startLine}`,
    });
  }
  return out;
}

// ─── n2b registry and curated pairs ────────────────────────────────────────

type Registry = {
  packages?: { id: string; package: string; replacement: string; note?: string }[];
  apis?: { id: string; message: string; replacement?: string }[];
  globals?: { id: string; symbol: string; bun: string; template?: string; docs?: string }[];
  cli?: { id: string; replace?: string; message?: string }[];
};

export function fromN2b(dir: string): Draft[] {
  const read = (f: string) =>
    existsSync(join(dir, f)) ? (Bun.TOML.parse(readFileSync(join(dir, f), "utf8")) as Registry) : {};
  const src = (f: string) => relative(process.cwd(), join(dir, f)).replace(/\\/g, "/");
  const out: Draft[] = [];
  for (const p of read("packages.toml").packages ?? []) {
    if (p.id !== "imports/bun-native") continue;
    const use = p.replacement.startsWith("<")
      ? p.replacement === "<auto>"
        ? "nothing (built into Bun)"
        : p.replacement.slice(1, -1)
      : p.replacement;
    out.push({
      kind: "migration",
      instruction: `In a Bun project, what replaces the npm package ${p.package}?`,
      response: `Use ${use} instead of ${p.package}.${p.note ? ` (${p.note})` : ""}`,
      code: "",
      lang: "",
      api: p.replacement.startsWith("<") ? [] : [p.replacement],
      tags: ["n2b", "migration", "package"],
      source: `${src("packages.toml")}#${p.package}`,
    });
  }
  for (const a of read("apis.toml").apis ?? []) {
    if (!a.replacement) continue;
    out.push({
      kind: "migration",
      instruction: `Rewrite this Node.js pattern for Bun: ${a.id.replace(/^api\//, "")}.`,
      response: `${a.message}\n\n${fence("ts", a.replacement)}`,
      code: a.replacement,
      lang: "",
      api: apisOf(a.replacement),
      tags: ["n2b", "migration", "api"],
      source: `${src("apis.toml")}#${a.id}`,
    });
  }
  for (const g of read("globals.toml").globals ?? []) {
    out.push({
      kind: "migration",
      instruction: `What is the Bun equivalent of the Node.js global ${g.symbol}?`,
      response: `${g.bun}${g.docs ? `\n\nDocs: ${g.docs}` : ""}`,
      code: "",
      lang: "",
      api: apisOf(g.bun),
      tags: ["n2b", "migration", "global"],
      source: `${src("globals.toml")}#${g.id}`,
    });
  }
  for (const c of read("cli.toml").cli ?? []) {
    if (!c.message) continue;
    out.push({
      kind: "migration",
      instruction: `Translate this npm/yarn/pnpm/npx command to bun: ${c.id.replace(/^cli\//, "")}.`,
      response: c.message,
      code: "",
      lang: "",
      tags: ["n2b", "migration", "cli"],
      source: `${src("cli.toml")}#${c.id}`,
    });
  }
  return out;
}

export function fromPairs(): Draft[] {
  return PAIRS.map((p, i) => ({
    kind: "migration" as const,
    instruction: `${p.task} in Bun, without ${p.instead.join(", ")}. Convert this Node.js code:\n\n${fence("ts", p.before)}`,
    response: `Use ${p.use}.\n\n${fence("ts", p.after)}`,
    code: p.after,
    lang: "ts",
    before: p.before,
    tags: ["migration", "pair", ...p.instead.map(x => x.toLowerCase())],
    source: `packages/bun-agent-plugin/src/native.ts#${i}`,
  }));
}

// ─── REVIEW.md and CLI help ────────────────────────────────────────────────

export function fromReview(text: string): Draft[] {
  const out: Draft[] = [];
  let heading = "";
  const lines = norm(text).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const h = /^#{2,3}\s+(.*)$/.exec(lines[i]!);
    if (h) heading = plain(h[1]!);
    const b = /^\s*[-*]\s+(.*)$/.exec(lines[i]!);
    if (!b || !heading) continue;
    const rule = plain(b[1]!);
    if (rule.length < 40) continue;
    out.push({
      kind: "rule",
      instruction: `Bun code review rule (${heading}): what must code in the Bun repository respect?`,
      response: rule,
      code: "",
      lang: "",
      tags: ["review", "contributing"],
      source: `REVIEW.md:${i + 1}`,
    });
  }
  return out;
}

export const HELP_COMMANDS = [
  "run",
  "test",
  "x",
  "repl",
  "exec",
  "install",
  "add",
  "remove",
  "update",
  "outdated",
  "audit",
  "link",
  "unlink",
  "publish",
  "patch",
  "pm",
  "info",
  "why",
  "build",
  "init",
  "create",
  "upgrade",
  "n2b",
  "mcp",
  "lsp",
  "graph",
  "docs",
];

export function fromHelp(cmd: string, text: string): Draft[] {
  const help = norm(text)
    .replace(/\x1b\[[0-9;]*m/g, "")
    .trim();
  if (help.length < 40) return [];
  return [
    {
      kind: "cli",
      instruction: `What does \`bun ${cmd}\` do and which flags does it take?`,
      response: fence("text", help),
      code: help,
      lang: "",
      api: [`bun ${cmd}`],
      tags: ["cli", "help"],
      source: `bun ${cmd} --help`,
    },
  ];
}

// ─── Assembly ──────────────────────────────────────────────────────────────

/** Ids are stable across runs: kind, then the first api, then a content hash. */
function idOf(d: Draft): string {
  const slug = (d.api?.[0] ?? d.tags[1] ?? d.kind)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${d.kind}/${slug || "bun"}/${sha(d.source + "\0" + d.instruction + "\0" + d.code).slice(0, 12)}`;
}

export function finalize(
  drafts: Draft[],
  version: string,
  commit: string,
): { entries: Entry[]; dropped: Record<string, number> } {
  const dropped: Record<string, number> = { parse: 0, duplicate: 0, secret: 0 };
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const d of drafts) {
    if (hasSecret(d.response) || hasSecret(d.instruction)) {
      dropped.secret!++;
      continue;
    }
    const parse = transpiles(d.code, d.lang);
    if (!parse) {
      dropped.parse!++;
      continue;
    }
    const key = sha((d.code || d.response).replace(/\s+/g, " ").trim() + "\0" + d.kind);
    if (seen.has(key)) {
      dropped.duplicate!++;
      continue;
    }
    seen.add(key);
    const { before: _before, ...rest } = d;
    const api = [...new Set([...(d.api ?? []), ...apisOf(d.code)])].sort();
    entries.push({ ...rest, id: idOf({ ...d, api }), api, version, commit, checks: { parse } });
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { entries, dropped };
}

/** Typechecks the TS/JS snippets against packages/bun-types in one tsc run; sets checks.types per entry. */
export function typecheck(root: string, entries: Entry[], tsc = Bun.which("tsc")): boolean {
  if (!tsc) return false;
  const dir = mkdtempSync(join(tmpdir(), "bun-native-tsc-"));
  try {
    const files: string[] = [];
    const byFile = new Map<string, Entry>();
    entries.forEach((e, i) => {
      if (!CODE_LANGS.has(e.lang) || e.kind === "signature") return;
      const name = `s${i}.${e.lang === "tsx" || e.lang === "jsx" ? "tsx" : "ts"}`;
      writeFileSync(join(dir, name), `${e.code}\nexport {};\n`);
      files.push(name);
      byFile.set(name, e);
    });
    const options = {
      target: "ESNext",
      module: "Preserve",
      moduleResolution: "bundler",
      lib: ["ESNext", "DOM", "DOM.Iterable"],
      jsx: "react-jsx",
      strict: false,
      noEmit: true,
      skipLibCheck: true,
      allowJs: true,
      types: [],
      typeRoots: [],
      noImplicitAny: false,
    };
    const types = join(root, "packages", "bun-types", "index.d.ts").replace(/\\/g, "/");
    // tsc reports no semantic error while any file has a syntax error (TS1xxx): those files fail and are
    // dropped, then the rest is checked again.
    const failed = new Set<string>();
    for (let pass = 0; pass < 5; pass++) {
      const left = files.filter(f => !failed.has(f));
      writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: options, files: [types, ...left] }));
      const r = Bun.spawnSync([tsc, "-p", "tsconfig.json", "--pretty", "false"], {
        cwd: dir,
        stdout: "pipe",
        stderr: "pipe",
      });
      let syntaxOnly = true;
      let any = false;
      for (const m of r.stdout.toString().matchAll(/^(s\d+\.tsx?)\(\d+,\d+\): error TS(\d+)/gm)) {
        failed.add(m[1]!);
        any = true;
        if (!m[2]!.startsWith("1") || m[2]!.length !== 4) syntaxOnly = false;
      }
      if (!any || !syntaxOnly) break;
    }
    for (const [name, e] of byFile) e.checks.types = !failed.has(name);
    return true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export type BuildOptions = { root: string; typecheck?: boolean; bun?: string };

export function collect(opts: BuildOptions): { drafts: Draft[]; help?: string } {
  const { root } = opts;
  const drafts: Draft[] = [];
  for (const rel of walk(join(root, "docs"), r => r.endsWith(".mdx") && !DOCS_SKIP.test(r)))
    drafts.push(...fromMdx(rel, readFileSync(join(root, "docs", rel), "utf8")));
  for (const rel of walk(join(root, "packages", "bun-types"), r => /^[\w-]+\.d\.ts$/.test(r)))
    drafts.push(...fromDts(rel, readFileSync(join(root, "packages", "bun-types", rel), "utf8")));
  for (const rel of walk(join(root, "test", "js", "bun"), r => /\.test\.(ts|js)$/.test(r)))
    drafts.push(...fromTest(rel, readFileSync(join(root, "test", "js", "bun", rel), "utf8")));
  const cwd = process.cwd();
  process.chdir(root);
  try {
    drafts.push(...fromN2b(join(root, "src", "n2b", "registry", "registry")));
  } finally {
    process.chdir(cwd);
  }
  drafts.push(...fromPairs());
  if (existsSync(join(root, "REVIEW.md"))) drafts.push(...fromReview(readFileSync(join(root, "REVIEW.md"), "utf8")));
  let help: string | undefined;
  if (opts.bun && existsSync(opts.bun)) {
    const env = { ...process.env, NO_COLOR: "1", BUN_DEBUG_QUIET_LOGS: "1", BUN_BE_BUN: "1" };
    help = Bun.spawnSync([opts.bun, "--revision"], { env }).stdout.toString().trim();
    for (const cmd of HELP_COMMANDS) {
      const r = Bun.spawnSync([opts.bun, cmd, "--help"], { env, stdout: "pipe", stderr: "pipe", timeout: 10_000 });
      if (r.exitCode === 0) drafts.push(...fromHelp(cmd, r.stdout.toString()));
    }
  }
  return { drafts, ...(help === undefined ? {} : { help }) };
}

export function count<T>(items: T[], key: (t: T) => string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of items) for (const k of key(t)) out[k] = (out[k] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function build(opts: BuildOptions & { version: string; commit: string }) {
  const { drafts, help } = collect(opts);
  const { entries, dropped } = finalize(drafts, opts.version, opts.commit);
  const typed = opts.typecheck ? typecheck(opts.root, entries) : false;
  const jsonl = entries.map(e => JSON.stringify(e)).join("\n") + "\n";
  const manifest = {
    name: DATASET,
    version: opts.version,
    commit: opts.commit,
    entries: entries.length,
    sha256: sha(jsonl),
    bytes: Buffer.byteLength(jsonl),
    file: `${DATASET}.jsonl`,
    format:
      "jsonl: id, kind, instruction, response, code, lang, api[], tags[], source, version, commit, checks{parse,types?}",
    kinds: count(entries, e => [e.kind]),
    apis: Object.fromEntries(Object.entries(count(entries, e => e.api)).filter(([, n]) => n >= 3)),
    checks: {
      parse: entries.length,
      typechecked: typed ? entries.filter(e => e.checks.types !== undefined).length : 0,
      types: typed ? entries.filter(e => e.checks.types).length : 0,
    },
    dropped,
    help: help ?? null,
  };
  return { entries, jsonl, manifest };
}

function git(root: string, args: string[]): string {
  return Bun.spawnSync(["git", ...args], { cwd: root })
    .stdout.toString()
    .trim();
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  if (args.includes("--help")) {
    console.log(
      "bun scripts/aphrody/dataset/build.ts [--out <directory>] [--typecheck] [--bun <binary>]\n" +
        "bun scripts/aphrody/dataset/build.ts --complete-source --sources <public-pins.json> --out <protected-directory> [--graph-snapshots <published-scopes.json>]\n" +
        "Public sources: [{repository: oven-sh/bun|aphrody-labs/bun,root,revision: exact40hex}].\n" +
        "Graphs: [{db,artifact,scope:{repositoryId,snapshotId,domain,source:graph:bun:...,profile:bun,revision}}].\n" +
        "Source blobs and graph rows retain separate coverage; exporting does not train a model.",
    );
    process.exit(0);
  }
  if (args.includes("--complete-source")) {
    const pinsPath = opt("--sources"),
      output = opt("--out");
    if (!pinsPath || !output) throw new Error("Complete source export requires --sources and protected --out");
    const file = Bun.file(pinsPath);
    if (file.size > 65536) throw new Error("Public source pins exceed byte limit");
    const pins: unknown = await file.json();
    if (!Array.isArray(pins)) throw new Error("Public source pins must be an array");
    const { exportPublicSources, exportGraphSnapshot } = await import("./source.ts");
    const sourceManifest = await exportPublicSources({ sources: pins, out: output });
    const graphsPath = opt("--graph-snapshots");
    const graphs = [];
    if (graphsPath) {
      const graphFile = Bun.file(graphsPath);
      if (graphFile.size > 1048576) throw new Error("Graph scopes exceed byte limit");
      const snapshots: unknown = await graphFile.json();
      if (!Array.isArray(snapshots) || snapshots.length > 4096) throw new Error("Graph scopes must be a bounded array");
      const { Database } = await import("bun:sqlite");
      for (const snapshot of snapshots) {
        const db = new Database(snapshot.db, { readonly: true });
        try {
          graphs.push(await exportGraphSnapshot(db, snapshot.scope, snapshot.artifact, output));
        } finally {
          db.close();
        }
      }
      await Bun.write(
        join(output, "graph-manifest.json"),
        JSON.stringify({ schema: "bun.graph-dataset/1", graphs, trained: false }, null, 2) + "\n",
      );
    }
    console.log(
      JSON.stringify({
        sourceBlobsComplete: sourceManifest.sourceBlobsComplete,
        gitlinksComplete: sourceManifest.gitlinksComplete,
        graphSnapshotsExported: graphs.length,
        graphComplete: false,
        trained: false,
        files: sourceManifest.files,
        shards: sourceManifest.shards.length,
      }),
    );
    process.exit(0);
  }
  const root = join(import.meta.dir, "..", "..", "..");
  const out = opt("--out") ?? join(root, "build", "dataset");
  const exe = process.platform === "win32" ? ".exe" : "";
  const bun = opt("--bun") ?? [join(root, "build", "release", `bun${exe}`)].find(p => existsSync(p));
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version as string;
  const commit = git(root, ["rev-parse", "HEAD"]);
  const { jsonl, manifest } = build({
    root,
    version,
    commit,
    ...(bun ? { bun } : {}),
    typecheck: args.includes("--typecheck"),
  });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${DATASET}.jsonl`), jsonl);
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${manifest.entries} entries (${JSON.stringify(manifest.kinds)}) -> ${out}`);
  console.log(
    `dropped ${JSON.stringify(manifest.dropped)}; types ${manifest.checks.types}/${manifest.checks.typechecked}`,
  );
}
