// Coloration syntaxique au build (aucun JS côté client) : tokenizer par expressions régulières pour les langages
// des docs, appliqué aux `<pre><code class="language-x">` produits par Bun.markdown.html. Classes : hl-c commentaire,
// hl-s chaîne, hl-n nombre, hl-k mot-clé, hl-l littéral, hl-t type, hl-f fonction/commande, hl-p clé/propriété,
// hl-v variable, hl-a attribut/option, hl-d ajout (diff), hl-r retrait (diff).

type Rule = [cls: string, source: string];

const words = (list: string) => `\\b(?:${list.trim().split(/\s+/).join("|")})\\b`;
const NUM = String.raw`\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)n?\b`;
const DQ = String.raw`"(?:[^"\\\n]|\\.)*"`;
const SQ = String.raw`'(?:[^'\\\n]|\\.)*'`;
const BT = "`(?:[^`\\\\]|\\\\.)*`";
const SLASH_COMMENTS: Rule[] = [
  ["c", String.raw`\/\/[^\n]*`],
  ["c", String.raw`\/\*[\s\S]*?\*\/`],
];
const HASH_COMMENT: Rule = ["c", String.raw`(?:^|(?<=\s))#[^\n]*`];

const JS_KEYWORDS = words(`
  abstract as async await break case catch class const continue debugger declare default delete do else enum export
  extends finally for from function get if implements import in infer instanceof interface is keyof let namespace new
  of private protected public readonly return satisfies set static super switch throw try type typeof using var void
  while with yield`);
const C_KEYWORDS = words(`
  auto break case char const continue default do double else enum extern float for goto if inline int long register
  return short signed sizeof static struct switch typedef union unsigned void volatile while class namespace template
  typename public private protected virtual override using new delete this throw try catch nullptr constexpr bool
  include define ifdef ifndef endif pragma fn pub var comptime defer errdefer try orelse catch test usize isize u8 u16
  u32 u64 i8 i16 i32 i64 f32 f64 string object var async await foreach in out ref readonly internal sealed`);

const LANGS: Record<string, Rule[]> = {
  js: [
    ...SLASH_COMMENTS,
    ["s", BT],
    ["s", DQ],
    ["s", SQ],
    ["k", JS_KEYWORDS],
    ["l", words("true false null undefined this NaN Infinity")],
    ["n", NUM],
    ["t", String.raw`\b[A-Z][\w$]*\b`],
    ["f", String.raw`[A-Za-z_$][\w$]*(?=\s*(?:<[^<>()]*>)?\()`],
  ],
  json: [
    ...SLASH_COMMENTS,
    ["p", `${DQ}(?=\\s*:)`],
    ["s", DQ],
    ["s", SQ],
    ["l", words("true false null")],
    ["n", String.raw`-?${NUM}`],
  ],
  sh: [
    HASH_COMMENT,
    ["s", DQ],
    ["s", SQ],
    ["v", String.raw`\$(?:\{[^}\n]*\}|[A-Za-z_]\w*|[@*#?$!\d])`],
    [
      "k",
      words(
        "if then else elif fi for while until do done case esac function in select return export local set unset source",
      ),
    ],
    [
      "f",
      String.raw`(?:^|(?<=^\s*\$\s)|(?<=[|;&]\s*)|(?<=&&\s*)|(?<=^\s+))(?![-#$])[\w./@:+-]+(?=[ \t]|$)`,
    ],
    ["a", String.raw`(?<=\s)--?[\w-]+(?:=\S*)?`],
    ["n", String.raw`(?<=\s)\d+(?=\s|$)`],
  ],
  ps: [
    HASH_COMMENT,
    ["c", String.raw`<#[\s\S]*?#>`],
    ["s", DQ],
    ["s", SQ],
    ["v", String.raw`\$(?:\{[^}\n]*\}|[\w:]+)`],
    [
      "k",
      words(
        "if else elseif foreach for while do until switch function param return try catch finally throw begin process end in",
      ),
    ],
    [
      "f",
      String.raw`\b[A-Z][a-z]+-[A-Za-z]+\b|(?:^|(?<=[|;]\s*)|(?<=^\s+))(?![-#$])[\w./:-]+(?=[ \t]|$)`,
    ],
    ["a", String.raw`(?<=\s)-[A-Za-z][\w-]*`],
    ["n", NUM],
  ],
  toml: [
    ["c", String.raw`(?:^|(?<=\s))[#;][^\n]*`],
    ["t", String.raw`^\s*\[\[?[^\]\n]+\]\]?`],
    ["p", String.raw`^\s*[\w."-]+(?=\s*=)`],
    ["s", `"""[\\s\\S]*?"""|'''[\\s\\S]*?'''`],
    ["s", DQ],
    ["s", SQ],
    ["l", words("true false")],
    ["n", NUM],
  ],
  yaml: [
    HASH_COMMENT,
    ["p", String.raw`^\s*-?\s*[\w./"'-]+(?=\s*:(?:\s|$))`],
    ["s", DQ],
    ["s", SQ],
    ["l", words("true false null yes no on off")],
    ["n", NUM],
  ],
  css: [
    ["c", String.raw`\/\*[\s\S]*?\*\/`],
    ["c", String.raw`(?<=^|\s)\/\/[^\n]*`],
    ["s", DQ],
    ["s", SQ],
    ["k", String.raw`@[\w-]+`],
    ["v", String.raw`(?:--|\$)[\w-]+`],
    ["p", String.raw`\b[a-z-]+(?=\s*:[^:{]*[;}\n])`],
    ["n", String.raw`#[\da-fA-F]{3,8}\b|-?\b\d+(?:\.\d+)?(?:%|[a-z]+)?\b`],
    ["f", String.raw`\b[\w-]+(?=\()`],
    ["t", String.raw`[.#][\w-]+`],
  ],
  html: [
    ["c", String.raw`<!--[\s\S]*?-->`],
    ["k", String.raw`<!DOCTYPE[^>]*>|<\?[\s\S]*?\?>`],
    ["t", String.raw`<\/?[\w:-]+|\/?>`],
    ["a", String.raw`(?<=\s)[\w:@.-]+(?==)`],
    ["s", DQ],
    ["s", SQ],
  ],
  rust: [
    ...SLASH_COMMENTS,
    ["s", String.raw`b?r#*"[\s\S]*?"#*`],
    ["s", DQ],
    ["s", String.raw`'(?:[^'\\\n]|\\.)'`],
    ["a", String.raw`'[a-z_]\w*\b`],
    [
      "k",
      words(`as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut
        pub ref return self Self static struct super trait type unsafe use where while`),
    ],
    ["l", words("true false None Some Ok Err")],
    ["n", NUM],
    ["f", String.raw`\b[a-z_]\w*!|\b[a-z_]\w*(?=\s*(?:::<[^>]*>)?\()`],
    [
      "t",
      String.raw`\b[A-Z]\w*\b|\b(?:u8|u16|u32|u64|u128|usize|i8|i16|i32|i64|i128|isize|f32|f64|bool|char|str)\b`,
    ],
  ],
  python: [
    HASH_COMMENT,
    ["s", String.raw`[rbfRBF]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?''')`],
    ["s", `[rbfRBF]{0,2}(?:${DQ}|${SQ})`],
    ["a", String.raw`@[\w.]+`],
    [
      "k",
      words(`and as assert async await break class continue def del elif else except finally for from global if import
        in is lambda nonlocal not or pass raise return try while with yield match case`),
    ],
    ["l", words("True False None self")],
    ["n", NUM],
    ["f", String.raw`\b[A-Za-z_]\w*(?=\()`],
    ["t", String.raw`\b[A-Z]\w*\b`],
  ],
  c: [
    ...SLASH_COMMENTS,
    ["k", String.raw`^\s*#\s*\w+`],
    ["s", DQ],
    ["s", String.raw`'(?:[^'\\\n]|\\.)'`],
    ["k", C_KEYWORDS],
    ["l", words("true false NULL null nullptr undefined")],
    ["n", NUM],
    ["f", String.raw`[A-Za-z_@]\w*(?=\s*\()`],
    ["t", String.raw`\b[A-Z]\w*\b`],
  ],
  docker: [
    HASH_COMMENT,
    [
      "k",
      String.raw`^\s*(?:FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\b|\bAS\b`,
    ],
    ["s", DQ],
    ["s", SQ],
    ["v", String.raw`\$(?:\{[^}\n]*\}|\w+)`],
    ["a", String.raw`(?<=\s)--[\w-]+(?:=\S*)?`],
  ],
  diff: [
    ["d", String.raw`^\+[^\n]*`],
    ["r", String.raw`^-[^\n]*`],
    ["k", String.raw`^@@[^\n]*`],
  ],
};

const ALIASES: Record<string, string> = {
  ts: "js",
  tsx: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  mts: "js",
  cts: "js",
  typescript: "js",
  javascript: "js",
  jsonc: "json",
  json5: "json",
  bash: "sh",
  zsh: "sh",
  shell: "sh",
  console: "sh",
  terminal: "sh",
  powershell: "ps",
  ps1: "ps",
  pwsh: "ps",
  ini: "toml",
  yml: "yaml",
  scss: "css",
  sass: "css",
  less: "css",
  xml: "html",
  svg: "html",
  vue: "html",
  rs: "rust",
  py: "python",
  cpp: "c",
  "c++": "c",
  h: "c",
  hpp: "c",
  cs: "c",
  csharp: "c",
  zig: "c",
  go: "c",
  prisma: "c",
  dockerfile: "docker",
  patch: "diff",
};

const compiled = new Map<string, { re: RegExp; classes: string[] }>();

function lexer(lang: string) {
  const key = ALIASES[lang] ?? lang;
  const rules = LANGS[key];
  if (!rules) return undefined;
  let entry = compiled.get(key);
  if (!entry) {
    entry = {
      re: new RegExp(rules.map(([, s]) => `(${s})`).join("|"), "gm"),
      classes: rules.map(([c]) => c),
    };
    compiled.set(key, entry);
  }
  return entry;
}

const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const unescape = (s: string) =>
  s
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");

/** Code source -> HTML échappé avec des `<span class="hl-x">`. `undefined` si le langage est inconnu. */
export function highlight(code: string, lang: string): string | undefined {
  const lex = lexer(lang.toLowerCase());
  if (!lex) return undefined;
  const { re, classes } = lex;
  re.lastIndex = 0;
  let out = "";
  let last = 0;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    const group = m.findIndex((g, i) => i > 0 && g !== undefined);
    out += escape(code.slice(last, m.index));
    out += `<span class="hl-${classes[group - 1]}">${escape(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + escape(code.slice(last));
}

/** Colore tous les blocs `<pre><code class="language-x">` d'un HTML rendu par Bun.markdown.html. */
export function highlightHtml(html: string): string {
  return html.replace(
    /<pre><code class="language-([\w+#.-]+)">([\s\S]*?)<\/code><\/pre>/g,
    (all, lang: string, body: string) => {
      const colored = highlight(unescape(body), lang);
      return colored === undefined
        ? all
        : `<pre><code class="language-${lang}">${colored}</code></pre>`;
    },
  );
}

export const HIGHLIGHT_CSS = `.hl-c{color:#6f6670;font-style:italic}.hl-s{color:#2e6b30}.hl-n,.hl-l{color:#9a4a12}.hl-k{color:#7e2d7c;font-weight:500}.hl-t{color:#1d5f8a}.hl-f{color:#5b3fa0}.hl-p{color:#8a2846}.hl-v{color:#9a4a12}.hl-a{color:#1d5f8a}.hl-d{color:#2e6b30;background:#2e6b3014}.hl-r{color:#ba1a1a;background:#ba1a1a14}
@media (prefers-color-scheme:dark){.hl-c{color:#9a8d96}.hl-s{color:#a8db9a}.hl-n,.hl-l,.hl-v{color:#f4b8a0}.hl-k{color:#efb4e9}.hl-t,.hl-a{color:#9ccaf3}.hl-f{color:#cdbdff}.hl-p{color:#ffb1c4}.hl-d{color:#8fd88a;background:#8fd88a14}.hl-r{color:#ffb4ab;background:#ffb4ab14}}`;
