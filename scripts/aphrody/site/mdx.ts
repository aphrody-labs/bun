// Mintlify MDX (docs/**/*.mdx) vers Markdown brut (pages .md, llms-full.txt) et vers un Markdown
// dont les composants sont devenus du HTML, rendu ensuite par Bun.markdown.html.

export type Frontmatter = { title?: string; description?: string; sidebarTitle?: string; [key: string]: unknown };

export function parseFrontmatter(source: string): { data: Frontmatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  let data: Frontmatter = {};
  try {
    data = (Bun.YAML.parse(match[1]!) as Frontmatter) ?? {};
  } catch {
    for (const line of match[1]!.split(/\r?\n/)) {
      const kv = /^(\w+):\s*(.*)$/.exec(line);
      if (kv) data[kv[1]!] = kv[2]!.replace(/^["']|["']$/g, "");
    }
  }
  return { data, body: source.slice(match[0].length) };
}

const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;

/** Applique `fn` aux morceaux hors blocs de code clôturés. */
export function mapOutsideFences(text: string, fn: (chunk: string) => string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let buffer: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (buffer.length) out.push(fn(buffer.join("\n")));
    buffer = [];
  };
  for (const line of lines) {
    const m = FENCE.exec(line);
    if (fence) {
      out.push(line);
      if (m && m[2]!.startsWith(fence) && m[3]!.trim() === "") fence = null;
    } else if (m) {
      flush();
      fence = m[2]!;
      out.push(line);
    } else buffer.push(line);
  }
  flush();
  return out.join("\n");
}

/** Remplace les imports de /snippets/*.mdx par leur contenu et retire les commentaires MDX. */
export function inlineSnippets(body: string, readSnippet: (path: string) => string | undefined, depth = 0): string {
  const names = new Map<string, string>();
  let text = mapOutsideFences(body, chunk =>
    chunk
      .replace(/^import\s+(\w+)\s+from\s+["'](\/snippets\/[^"']+\.mdx?)["'];?[ \t]*$/gm, (_, name, path) => {
        names.set(name, path);
        return "";
      })
      .replace(/^import\s+\{[^}]*\}\s+from\s+["']\/snippets\/[^"']+["'];?[ \t]*$/gm, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ""),
  );
  for (const [name, path] of names) {
    const raw = depth < 4 ? readSnippet(path) : undefined;
    const content = raw === undefined ? "" : inlineSnippets(parseFrontmatter(raw).body, readSnippet, depth + 1).trim();
    text = mapOutsideFences(text, chunk =>
      chunk.replace(new RegExp(`^([ \\t]*)<${name}\\s*/>`, "gm"), (_, indent) =>
        content
          .split("\n")
          .map(l => (l ? indent + l : l))
          .join("\n"),
      ),
    );
  }
  return text.replace(/\n{3,}/g, "\n\n");
}

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function parseAttributes(source: string): Record<string, string | true> {
  const attrs: Record<string, string | true> = {};
  const re = /([A-Za-z_][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}))?/g;
  for (let m; (m = re.exec(source)); ) {
    const value = m[2] ?? m[3] ?? m[4];
    attrs[m[1]!] = value === undefined ? true : value.replace(/^["'`]|["'`]$/g, "");
  }
  return attrs;
}

/** Info d'un bloc de code Mintlify : `ts title="a.ts" icon="x"`, `bash npm icon="npm"`, `ts index.ts`. */
export function parseFenceInfo(info: string): { lang: string; title?: string } {
  const trimmed = info.trim();
  const lang = /^[^\s{]*/.exec(trimmed)![0];
  const rest = trimmed.slice(lang.length);
  const attrs = parseAttributes(rest.replace(/\{[^}]*\}/g, ""));
  if (typeof attrs.title === "string") return { lang, title: attrs.title };
  const bare = rest
    .replace(/\w+\s*=\s*("[^"]*"|'[^']*'|\{[^}]*\})/g, "")
    .trim()
    .split(/\s+/)
    .filter(w => w && !/^(lines|wrap|expandable|twoslash|terminal)$/.test(w));
  return bare.length ? { lang, title: bare.join(" ") } : { lang };
}

const CALLOUTS = new Set(["Note", "Tip", "Info", "Warning", "Check", "Danger", "Callout"]);
const BLOCKS = new Set([
  ...CALLOUTS,
  "Tabs",
  "Tab",
  "CodeGroup",
  "Steps",
  "Step",
  "Accordion",
  "AccordionGroup",
  "Card",
  "CardGroup",
  "Columns",
  "Frame",
  "ParamField",
  "ResponseField",
  "Expandable",
  "Update",
  "Panel",
  "RequestExample",
  "ResponseExample",
  "GuidesList",
  "Image",
]);
const INLINE = new Set(["Badge", "Icon", "Tooltip", "Button", "Kbd"]);

function openTag(name: string, a: Record<string, string | true>, ctx: HtmlContext): string {
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  if (CALLOUTS.has(name)) return `<div class="callout ${name.toLowerCase()}">`;
  switch (name) {
    case "Tabs":
      return `<div class="tabs">`;
    case "Tab":
      return `<div class="tab" data-title="${escapeHtml(s("title"))}">`;
    case "CodeGroup":
      return `<div class="code-group">`;
    case "Steps":
      return `<div class="steps">`;
    case "Step":
      return `<div class="step"><p class="step-title">${escapeHtml(s("title"))}</p>`;
    case "Accordion":
      return `<details class="accordion"><summary>${escapeHtml(s("title"))}</summary>`;
    case "Expandable":
      return `<details class="accordion"><summary>${escapeHtml(s("title") || "Properties")}</summary>`;
    case "Card": {
      const href = s("href") ? ctx.link(s("href")) : "";
      const title = escapeHtml(s("title"));
      return `<div class="card"><p class="card-title">${href ? `<a href="${escapeHtml(href)}">${title}</a>` : title}</p>`;
    }
    case "Frame":
      return `<figure class="frame">`;
    case "ParamField":
    case "ResponseField": {
      const field = s("path") || s("query") || s("body") || s("header") || s("name") || s("param");
      const type = s("type");
      const def = s("default");
      return (
        `<div class="param"><p class="param-head"><code class="param-name">${escapeHtml(field)}</code>` +
        (type ? ` <span class="param-type">${escapeHtml(type)}</span>` : "") +
        (a.required ? ` <span class="param-req">required</span>` : "") +
        (def ? ` <span class="param-default">default: <code>${escapeHtml(def)}</code></span>` : "") +
        `</p>`
      );
    }
    case "Update":
      return `<div class="update"><p class="update-label">${escapeHtml(s("label"))}</p>${s("description") ? `<p class="update-desc">${escapeHtml(s("description"))}</p>` : ""}`;
    default:
      return `<div class="${name.replace(/[A-Z]/g, (c, i) => (i ? "-" : "") + c.toLowerCase())}">`;
  }
}

function closeTag(name: string, a: Record<string, string | true>): string {
  if (name === "Accordion" || name === "Expandable") return "</details>";
  if (name === "Frame")
    return typeof a.caption === "string" ? `<figcaption>${escapeHtml(a.caption)}</figcaption></figure>` : "</figure>";
  return "</div>";
}

function inlineComponent(name: string, a: Record<string, string | true>, inner: string, ctx: HtmlContext): string {
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  switch (name) {
    case "Badge":
      return `<span class="badge">${inner}</span>`;
    case "Kbd":
      return `<kbd>${inner}</kbd>`;
    case "Tooltip":
      return `<span title="${escapeHtml(s("tip"))}">${inner}</span>`;
    case "Button":
      return s("href") ? `<a class="button" href="${escapeHtml(ctx.link(s("href")))}">${inner}</a>` : inner;
    default:
      return inner;
  }
}

export type HtmlContext = {
  /** Lien Mintlify (racine des docs) vers une URL du site. */
  link: (href: string) => string;
  /** HTML remplaçant <GuidesList />. */
  guides?: string;
};

type Token =
  | { kind: "text"; text: string }
  | { kind: "tag"; name: string; close: boolean; self: boolean; attrs: string };

/** Découpe une ligne en texte et balises de composants, en ignorant les spans de code inline. */
function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let text = "";
  let i = 0;
  while (i < line.length) {
    const c = line[i]!;
    if (c === "`") {
      const run = /^`+/.exec(line.slice(i))![0];
      const end = line.indexOf(run, i + run.length);
      if (end >= 0) {
        text += line.slice(i, end + run.length);
        i = end + run.length;
        continue;
      }
    }
    if (c === "<") {
      const m = /^<(\/?)([A-Z][A-Za-z0-9]*)((?:\s+(?:[^>"'{}]|"[^"]*"|'[^']*'|\{[^}]*\})*)?)\s*(\/?)>/.exec(
        line.slice(i),
      );
      if (m && (BLOCKS.has(m[2]!) || INLINE.has(m[2]!))) {
        if (text) tokens.push({ kind: "text", text });
        text = "";
        tokens.push({ kind: "tag", name: m[2]!, close: m[1] === "/", self: m[4] === "/", attrs: m[3] ?? "" });
        i += m[0].length;
        continue;
      }
      if (/^<[A-Z]/.test(line.slice(i))) {
        // Type générique dans la prose (Promise<Response>) : texte, pas une balise HTML.
        text += "&lt;";
        i++;
        continue;
      }
    }
    text += c;
    i++;
  }
  if (text) tokens.push({ kind: "text", text });
  return tokens;
}

const leading = (line: string) => /^[ ]*/.exec(line)![0].length;
const dedent = (line: string, n: number) => line.slice(Math.min(leading(line), n));

/** Vrai si la première balise de la ligne se ferme (`>` hors guillemets et hors accolades). */
function tagClosed(line: string): boolean {
  let depth = 0;
  let quote = "";
  for (let i = line.indexOf("<") + 1; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === quote) quote = "";
    } else if (depth === 0 && (c === '"' || c === "'")) quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return true;
  }
  return false;
}

/** Joint les balises de composants écrites sur plusieurs lignes. */
function joinMultilineTags(lines: string[]): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;
    const m = FENCE.exec(line);
    if (fence) {
      if (m && m[2]!.startsWith(fence) && m[3]!.trim() === "") fence = null;
      out.push(line);
      continue;
    }
    if (m) {
      fence = m[2]!;
      out.push(line);
      continue;
    }
    const open = /^\s*<([A-Z][A-Za-z0-9]*)\b/.exec(line);
    if (open && (BLOCKS.has(open[1]!) || INLINE.has(open[1]!))) {
      let j = i;
      while (!tagClosed(line) && j + 1 < lines.length && j - i < 30) {
        j++;
        line += " " + lines[j]!.trim();
      }
      i = j;
    }
    out.push(line);
  }
  return out;
}

/** MDX (snippets déjà inlinés) vers Markdown dont les composants sont du HTML. */
export function mdxToHtmlMarkdown(body: string, ctx: HtmlContext): string {
  const lines = joinMultilineTags(body.split("\n").map(l => l.replace(/^[\t ]+/, ws => ws.replace(/\t/g, "    "))));
  const out: string[] = [];
  const stack: { name: string; attrs: Record<string, string | true>; base?: number }[] = [];
  let fence: { marker: string; indent: number } | null = null;
  const pushBlock = (html: string) => out.push("", html, "");

  for (const line of lines) {
    if (fence) {
      const m = FENCE.exec(line);
      if (m && m[2]!.startsWith(fence.marker) && m[3]!.trim() === "") {
        out.push(fence.marker);
        fence = null;
      } else out.push(dedent(line, fence.indent));
      continue;
    }
    const fm = FENCE.exec(line);
    if (fm) {
      const top = stack.at(-1);
      if (top && top.base === undefined) top.base = fm[1]!.length;
      fence = { marker: fm[2]!, indent: fm[1]!.length };
      const { lang, title } = parseFenceInfo(fm[3]!);
      out.push("");
      if (title) out.push(`<div class="code-title">${escapeHtml(title)}</div>`, "");
      out.push(fm[2]! + lang);
      continue;
    }
    const tokens = tokenize(line);
    if (!tokens.some(t => t.kind === "tag" && BLOCKS.has(t.name))) {
      const rendered = tokens.map(t => (t.kind === "text" ? t.text : "")).join("");
      let text = renderInline(tokens, ctx);
      if (rendered.trim() && stack.length) {
        const top = stack.at(-1)!;
        if (top.base === undefined) top.base = leading(text);
        text = dedent(text, top.base);
      }
      out.push(text);
      continue;
    }
    let pending: Token[] = [];
    const flushText = () => {
      const text = renderInline(pending, ctx).trim();
      pending = [];
      if (text) out.push(text);
    };
    for (const token of tokens) {
      if (token.kind === "text" || INLINE.has(token.name)) {
        pending.push(token);
        continue;
      }
      flushText();
      const attrs = parseAttributes(token.attrs);
      if (token.name === "GuidesList") {
        pushBlock(ctx.guides ?? "");
        continue;
      }
      if (token.name === "Image") {
        if (typeof attrs.src === "string")
          pushBlock(
            `<p><img src="${escapeHtml(ctx.link(attrs.src))}" alt="${escapeHtml(String(attrs.alt ?? ""))}" loading="lazy"></p>`,
          );
        continue;
      }
      if (token.close) {
        const index = stack.findLastIndex(s => s.name === token.name);
        if (index < 0) continue;
        while (stack.length > index) {
          const s = stack.pop()!;
          pushBlock(closeTag(s.name, s.attrs));
        }
        continue;
      }
      pushBlock(openTag(token.name, attrs, ctx));
      if (token.self) pushBlock(closeTag(token.name, attrs));
      else stack.push({ name: token.name, attrs });
    }
    flushText();
  }
  while (stack.length) {
    const s = stack.pop()!;
    pushBlock(closeTag(s.name, s.attrs));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

function renderInline(tokens: Token[], ctx: HtmlContext): string {
  let out = "";
  const stack: { name: string; attrs: Record<string, string | true>; start: number }[] = [];
  for (const t of tokens) {
    if (t.kind === "text") {
      out += t.text;
      continue;
    }
    const attrs = parseAttributes(t.attrs);
    if (t.self) out += inlineComponent(t.name, attrs, "", ctx);
    else if (!t.close) stack.push({ name: t.name, attrs, start: out.length });
    else {
      const index = stack.findLastIndex(s => s.name === t.name);
      if (index < 0) continue;
      const open = stack[index]!;
      stack.length = index;
      out = out.slice(0, open.start) + inlineComponent(open.name, open.attrs, out.slice(open.start), ctx);
    }
  }
  return out;
}

/** Récrit les URL amont (installation, docs) vers celles du site. */
export function rewriteUpstreamUrls(text: string, origin: string): string {
  return text
    .replace(/https?:\/\/(?:www\.)?bun\.(?:sh|com)\/install\.ps1/g, `${origin}/install.ps1`)
    .replace(/(["'\s(])(?:www\.)?bun\.(?:sh|com)\/install\.ps1/g, `$1${new URL(origin).host}/install.ps1`)
    .replace(/https?:\/\/(?:www\.)?bun\.(?:sh|com)\/install\b(?!\.)/g, `${origin}/install`)
    .replace(/https?:\/\/(?:www\.)?bun\.(?:sh|com)\/docs\b/g, `${origin}/docs`)
    .replace(/https?:\/\/(?:www\.)?bun\.(?:sh|com)\/llms(-full)?\.txt/g, `${origin}/llms$1.txt`);
}

/** Liens racine Mintlify (`/runtime/x`) du Markdown brut vers des URL absolues du site. */
export function absolutizeMarkdownLinks(markdown: string, origin: string): string {
  return mapOutsideFences(markdown, chunk =>
    chunk
      .replace(/\]\(\/(?!docs\/|\/)([^)\s]*)\)/g, (_, path) => `](${origin}/docs/${path})`)
      .replace(/(href|src)="\/(?!docs\/|\/)([^"]*)"/g, (_, attr, path) => `${attr}="${origin}/docs/${path}"`),
  );
}
