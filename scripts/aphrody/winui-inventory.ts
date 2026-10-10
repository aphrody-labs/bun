// WinUI 3 inventory from the real aphrody-labs/microsoft-ui-xaml source, plus the
// WinUI -> Fluent UI web components v3 -> M3 table checked against the real tag lists.
//
//   bun scripts/aphrody/winui-inventory.ts [--winui C:/forks/microsoft-ui-xaml]
//     [--fluent C:/forks/fluentui] [--m3 C:/aphrody/m3/packages/m3-react/md-elements.txt]
//
// Writes docs/aphrody/merge/winui-inventory.json and the table section of
// docs/aphrody/merge/M-winui-m3.md (between the GENERATED markers).
import { $ } from "bun";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const WINUI = opt("winui", "C:/forks/microsoft-ui-xaml");
const FLUENT = opt("fluent", "C:/forks/fluentui");
const M3 = opt("m3", "C:/aphrody/m3/packages/m3-react/md-elements.txt");
const ROOT = join(import.meta.dir, "../..");
const OUT_JSON = join(ROOT, "docs/aphrody/merge/winui-inventory.json");
const OUT_MD = join(ROOT, "docs/aphrody/merge/M-winui-m3.md");

const sha = async (dir: string) => (await $`git -C ${dir} rev-parse --short=12 HEAD`.text()).trim();
const rel = (p: string) => relative(WINUI, p).replaceAll("\\", "/");
const isTest = (p: string) => /(^|\/)(TestUI|APITests|InteractionTests|test|tests|TestInfra)(\/|$)/i.test(p);

async function scan(dir: string, pattern: string): Promise<string[]> {
  const out: string[] = [];
  for await (const f of new Bun.Glob(pattern).scan({ cwd: dir, onlyFiles: true })) {
    const r = f.replaceAll("\\", "/");
    if (!isTest(r)) out.push(join(dir, r));
  }
  return out.sort();
}

type Member = { name: string; type: string; static?: boolean; readonly?: boolean };
type Klass = {
  name: string;
  namespace: string;
  base: string | null;
  source: string;
  origin: "controls/dev idl" | "XamlOM model" | "XamlOM module";
  properties: Member[];
  dependencyProperties: string[];
  events: string[];
};

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function blockEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return i;
  }
  return src.length;
}

// Nested-brace bodies (accessors) are removed so only top-level members remain.
function topLevel(body: string): string {
  let out = "";
  let depth = 0;
  for (const c of body) {
    if (c === "{") depth++;
    if (depth === 0) out += c;
    else if (c === "}" && --depth === 0) out += "{}";
  }
  return out;
}

function parseIdl(file: string, text: string): { classes: Klass[]; enums: string[] } {
  const src = stripComments(text).replace(/\[[^\]]*\]/g, " ");
  const classes: Klass[] = [];
  const enums: string[] = [];
  const nsRe = /namespace\s+([\w.]+)\s*\{/g;
  const namespaces: { name: string; start: number; end: number }[] = [];
  for (const m of src.matchAll(nsRe)) {
    const open = m.index! + m[0].length - 1;
    namespaces.push({ name: m[1], start: open, end: blockEnd(src, open) });
  }
  const nsAt = (i: number) =>
    namespaces
      .filter(n => n.start < i && i < n.end)
      .at(-1)
      ?.name.replace("MU_XC_NAMESPACE", "Microsoft.UI.Xaml.Controls")
      .replace("MU_XCP_NAMESPACE", "Microsoft.UI.Xaml.Controls.Primitives") ?? "";
  for (const m of src.matchAll(/\benum\s+(\w+)\s*\{/g)) enums.push(`${nsAt(m.index!)}.${m[1]}`);
  for (const m of src.matchAll(/\bruntimeclass\s+(\w+)\s*(?::\s*([\w.]+))?[^{;]*\{/g)) {
    const open = m.index! + m[0].length - 1;
    const body = topLevel(src.slice(open + 1, blockEnd(src, open)));
    const k: Klass = {
      name: m[1],
      namespace: nsAt(m.index!),
      base: m[2] ?? null,
      source: rel(file),
      origin: "controls/dev idl",
      properties: [],
      dependencyProperties: [],
      events: [],
    };
    for (const stmt of body.split(";").map(s => s.replace(/\s+/g, " ").trim())) {
      if (!stmt || stmt.includes("(")) continue;
      const ev = stmt.match(/^(?:static )?event (.+) (\w+)$/);
      if (ev) {
        k.events.push(ev[2]);
        continue;
      }
      const pm = stmt.match(/^(static )?([\w.<>, ]+?) (\w+)\s*(\{\})?$/);
      if (!pm) continue;
      if (pm[1] && pm[2].endsWith("DependencyProperty") && pm[3].endsWith("Property")) {
        k.dependencyProperties.push(pm[3].slice(0, -"Property".length));
        continue;
      }
      const readonly = stmt.endsWith("{}") && /\bget\b/.test(stmt) && !/\bset\b/.test(stmt);
      k.properties.push({
        name: pm[3],
        type: pm[2],
        ...(pm[1] ? { static: true } : {}),
        ...(readonly ? { readonly } : {}),
      });
    }
    classes.push(k);
  }
  return { classes, enums };
}

// Accessor contents are needed to tell read-only properties apart, so keep them per member.
function parseModel(
  file: string,
  text: string,
  namespace: string,
  origin: Klass["origin"] = "XamlOM model",
): { classes: Klass[]; enums: string[] } {
  const src = stripComments(text).replace(/\[[^\]]*\]/g, " ");
  const classes: Klass[] = [];
  const enums = [...src.matchAll(/\benum\s+(\w+)/g)].map(m => `${namespace}.${m[1]}`);
  for (const m of src.matchAll(
    /\bpublic\s+(?:sealed\s+|abstract\s+|partial\s+)*class\s+(\w+)\s*(?::\s*([\w.]+))?[^{]*\{/g,
  )) {
    const open = m.index! + m[0].length - 1;
    const body = src.slice(open + 1, blockEnd(src, open));
    const k: Klass = {
      name: m[1],
      namespace,
      base: m[2] ?? null,
      source: rel(file),
      origin,
      properties: [],
      dependencyProperties: [],
      events: [],
    };
    let depth = 0;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") depth--;
      if (depth !== 0) continue;
      const rest = body.slice(i);
      const pm = rest.match(
        /^\s*(?:public|internal)\s+(static\s+)?(?:new\s+)?([\w.<>\[\], ]+?)\s+(\w+)\s*\{([^{}]*)\}/,
      );
      if (pm && i === 0 ? true : pm && /[;}\s]/.test(body[i - 1] ?? " ")) {
        if (pm && !/\bclass\b/.test(pm[2])) {
          k.properties.push({
            name: pm[3],
            type: pm[2].trim(),
            ...(pm[1] ? { static: true } : {}),
            ...(/\bset\b/.test(pm[4]) ? {} : { readonly: true }),
          });
          i += pm[0].length - 1;
          continue;
        }
      }
      const ev = rest.match(/^\s*public\s+event\s+[\w.<>, ]+\s+(\w+)\s*;/);
      if (ev && /[;}\s]/.test(body[i - 1] ?? " ")) {
        k.events.push(ev[1]);
        i += ev[0].length - 1;
      }
    }
    classes.push(k);
  }
  return { classes, enums };
}

type ThemeDict = Record<string, Record<string, string>>; // theme -> key -> element type
type XamlFile = { file: string; styles: { targetType: string; key: string | null }[]; themes: ThemeDict; keys: number };

function parseXaml(file: string, text: string): XamlFile {
  const src = text.replace(/<!--[\s\S]*?-->/g, "");
  const out: XamlFile = { file: rel(file), styles: [], themes: {}, keys: 0 };
  const stack: { tag: string; theme: string | null }[] = [];
  for (const m of src.matchAll(/<(\/?)([\w:.]+)((?:\s+[\w:.]+\s*=\s*"[^"]*")*)\s*(\/?)>/g)) {
    const [, close, tag, attrs, self] = m;
    if (tag.startsWith("?")) continue;
    if (close) {
      stack.pop();
      continue;
    }
    const attr = (n: string) =>
      attrs.match(new RegExp(`(?:^|\\s)${n.replace(".", "\\.")}\\s*=\\s*"([^"]*)"`))?.[1] ?? null;
    const key = attr("x:Key");
    const parentTheme = stack.at(-1)?.theme ?? null;
    let theme = parentTheme;
    const parent = stack.at(-1)?.tag;
    if (tag === "ResourceDictionary" && key && parent === "ResourceDictionary.ThemeDictionaries") theme = key;
    if (tag === "Style") {
      const t = attr("TargetType");
      if (t) out.styles.push({ targetType: t, key });
    }
    if (key && !(tag === "ResourceDictionary" && theme === key)) {
      out.keys++;
      (out.themes[theme ?? "(shared)"] ??= {})[key] = tag;
    }
    if (!self) stack.push({ tag, theme });
  }
  return out;
}

// ---------- WinUI ----------
const winuiSha = await sha(WINUI);
const idlFiles = await scan(WINUI, "controls/dev/**/*.idl");
const classes: Klass[] = [];
const enums: string[] = [];
for (const f of idlFiles) {
  const r = parseIdl(f, await Bun.file(f).text());
  classes.push(...r.classes);
  enums.push(...r.enums);
}
const modelDir = join(WINUI, "dxaml/xcp/tools/XCPTypesAutoGen/XamlOM/Model");
for (const ns of ["Microsoft.UI.Xaml.Controls", "Microsoft.UI.Xaml.Controls.Primitives"]) {
  const f = join(modelDir, `${ns}.cs`);
  const r = parseModel(f, await Bun.file(f).text(), ns);
  classes.push(...r.classes);
  enums.push(...r.enums);
}
// The core controls (TextBox, ComboBox, CommandBar, CalendarView, Pivot...) are declared one module per file.
const moduleDir = join(WINUI, "dxaml/xcp/tools/XCPTypesAutoGen/Modules");
for (const f of await scan(moduleDir, "**/*.cs")) {
  const text = await Bun.file(f).text();
  const namespace = stripComments(text).match(/\bnamespace\s+([\w.]+)/)?.[1];
  if (!namespace) continue;
  const r = parseModel(f, text, namespace, "XamlOM module");
  classes.push(...r.classes);
  enums.push(...r.enums);
}
const xamlFiles = [
  ...(await scan(WINUI, "controls/dev/**/*.xaml")),
  join(WINUI, "dxaml/xcp/dxaml/themes/generic.xaml"),
];
const xaml: XamlFile[] = [];
for (const f of xamlFiles) xaml.push(parseXaml(f, await Bun.file(f).text()));

const byName = new Map<string, Klass>();
const rank = { "controls/dev idl": 0, "XamlOM module": 1, "XamlOM model": 2 } as const;
for (const k of classes) {
  const known = byName.get(k.name);
  if (!known || rank[k.origin] < rank[known.origin]) byName.set(k.name, k);
}
const isControl = (k: Klass): boolean => {
  const seen = new Set<string>();
  let cur: Klass | undefined = k;
  while (cur && !seen.has(cur.name)) {
    seen.add(cur.name);
    const base = cur.base?.split(".").at(-1);
    if (base === "Control" || base === "Panel" || base === "FrameworkElement" || base === "FlyoutBase") return true;
    cur = base ? byName.get(base) : undefined;
  }
  return false;
};
const controls = [...byName.values()].filter(isControl).sort((a, b) => a.name.localeCompare(b.name));

const themeTotals: Record<string, number> = {};
const themeKeys: Record<string, Set<string>> = {};
for (const x of xaml)
  for (const [t, keys] of Object.entries(x.themes)) {
    themeKeys[t] ??= new Set();
    for (const k of Object.keys(keys)) themeKeys[t].add(k);
  }
for (const [t, s] of Object.entries(themeKeys)) themeTotals[t] = s.size;
const styleTargets = new Set(xaml.flatMap(x => x.styles.map(s => s.targetType.replace(/^\w+:/, ""))));

// ---------- Fluent / M3 ----------
const fluentSha = await sha(FLUENT);
const fluentPkg = await Bun.file(join(FLUENT, "packages/web-components/package.json")).json();
const fluentTags = new Set<string>();
for (const f of await scan(join(FLUENT, "packages/web-components/src"), "**/*.options.ts")) {
  const m = (await Bun.file(f).text()).match(/export const tagName = `\$\{FluentDesignSystem\.prefix\}-([\w-]+)`/);
  if (m) fluentTags.add(`fluent-${m[1]}`);
}
const m3Tags = new Set((await Bun.file(M3).text()).split(/\s+/).filter(t => t.startsWith("md-")));

// WinUI control -> Fluent v3 tag(s) -> M3 tag(s). Correspondence is by role; every tag and
// control name below is checked against the real sources and reported if missing.
const MAP: [string, string[], string[]][] = [
  ["Button", ["fluent-button"], ["md-filled-button", "md-outlined-button", "md-text-button"]],
  ["HyperlinkButton", ["fluent-anchor-button", "fluent-link"], ["md-link"]],
  ["ToggleButton", ["fluent-toggle-button"], ["md-filled-tonal-button"]],
  ["DropDownButton", ["fluent-menu-button"], ["md-split-button"]],
  ["SplitButton", [], ["md-split-button"]],
  ["CheckBox", ["fluent-checkbox"], ["md-checkbox"]],
  ["RadioButton", ["fluent-radio"], ["md-radio"]],
  ["RadioButtons", ["fluent-radio-group"], []],
  ["ToggleSwitch", ["fluent-switch"], ["md-switch"]],
  ["Slider", ["fluent-slider"], ["md-slider"]],
  ["ProgressBar", ["fluent-progress-bar"], ["md-linear-progress"]],
  ["ProgressRing", ["fluent-spinner"], ["md-circular-progress"]],
  ["TextBox", ["fluent-text-input"], ["md-filled-text-field", "md-outlined-text-field"]],
  ["RichEditBox", ["fluent-textarea"], []],
  ["PasswordBox", ["fluent-text-input"], ["md-outlined-text-field"]],
  ["NumberBox", ["fluent-text-input"], ["md-outlined-text-field"]],
  ["AutoSuggestBox", [], ["md-autocomplete", "md-search-bar"]],
  ["ComboBox", ["fluent-dropdown", "fluent-option"], ["md-filled-select", "md-outlined-select", "md-select-option"]],
  ["ListBox", ["fluent-listbox", "fluent-option"], ["md-list", "md-list-item"]],
  ["ListView", [], ["md-list", "md-list-item"]],
  ["TreeView", ["fluent-tree", "fluent-tree-item"], ["md-tree", "md-tree-item"]],
  ["TabView", ["fluent-tablist", "fluent-tab"], ["md-tabs", "md-primary-tab", "md-secondary-tab"]],
  ["SelectorBar", ["fluent-tablist", "fluent-tab"], ["md-tabs", "md-secondary-tab"]],
  ["Pivot", ["fluent-tablist", "fluent-tab"], ["md-tabs", "md-primary-tab"]],
  [
    "NavigationView",
    ["fluent-drawer", "fluent-drawer-body"],
    ["md-navigation-drawer", "md-navigation-rail", "md-navigation-bar"],
  ],
  ["ContentDialog", ["fluent-dialog", "fluent-dialog-body"], ["md-dialog"]],
  ["MenuFlyout", ["fluent-menu", "fluent-menu-list", "fluent-menu-item"], ["md-menu", "md-menu-item", "md-sub-menu"]],
  ["MenuBar", [], ["md-menu", "md-toolbar"]],
  ["CommandBar", [], ["md-toolbar", "md-top-app-bar"]],
  ["ToolTip", ["fluent-tooltip"], ["md-tooltip"]],
  ["TeachingTip", [], ["md-popover"]],
  ["InfoBar", ["fluent-message-bar"], ["md-banner", "md-alert", "md-snackbar"]],
  ["InfoBadge", ["fluent-badge", "fluent-counter-badge"], ["md-badge"]],
  ["Expander", ["fluent-accordion", "fluent-accordion-item"], ["md-expansion-panel", "md-accordion"]],
  ["PersonPicture", ["fluent-avatar"], ["md-avatar"]],
  ["RatingControl", ["fluent-rating-display"], ["md-rating"]],
  ["BreadcrumbBar", [], ["md-breadcrumbs"]],
  ["PipsPager", [], ["md-paginator"]],
  ["PagerControl", [], ["md-paginator"]],
  ["CalendarDatePicker", [], ["md-date-picker"]],
  ["DatePicker", [], ["md-date-picker"]],
  ["TimePicker", [], ["md-time-picker"]],
  ["TextBlock", ["fluent-text"], []],
  ["Image", ["fluent-image"], []],
  ["ColorPicker", [], []],
  ["CalendarView", [], ["md-date-picker"]],
  ["TitleBar", [], ["md-top-app-bar"]],
  ["ItemsView", [], ["md-list"]],
  ["SwipeControl", [], []],
  ["TwoPaneView", [], []],
  ["AnimatedIcon", [], []],
  ["ScrollView", [], []],
  ["WebView2", [], []],
];

const missing: string[] = [];
const cell = (tags: string[], set: Set<string>) =>
  tags.length === 0
    ? "—"
    : tags
        .map(t => {
          if (set.has(t)) return `\`${t}\``;
          missing.push(t);
          return `~~${t}~~ (absent)`;
        })
        .join(", ");
const rows = MAP.map(([name, fl, md]) => {
  const k = byName.get(name);
  if (!k) missing.push(name);
  const props = k ? k.properties.length + k.dependencyProperties.length : 0;
  const style = styleTargets.has(name) ? "oui" : "non";
  return `| ${k ? `\`${name}\`` : `~~${name}~~`} | ${k ? `\`${k.source}\`` : "absent"} | ${props} | ${k?.events.length ?? 0} | ${style} | ${cell(fl, fluentTags)} | ${cell(md, m3Tags)} |`;
});
const mappedControls = new Set(MAP.map(m => m[0]));
const fluentUnused = [...fluentTags].filter(t => !MAP.some(m => m[1].includes(t))).sort();

const inventory = {
  generated: "scripts/aphrody/winui-inventory.ts",
  sources: {
    winui: { repo: "aphrody-labs/microsoft-ui-xaml", sha: winuiSha },
    fluent: {
      repo: "aphrody-labs/fluentui",
      sha: fluentSha,
      webComponents: fluentPkg.version,
      tags: [...fluentTags].sort(),
    },
    m3: { file: "m3/packages/m3-react/md-elements.txt", tags: m3Tags.size },
  },
  totals: {
    idlFiles: idlFiles.length,
    xamlFiles: xamlFiles.length,
    classes: byName.size,
    controls: controls.length,
    enums: enums.length,
    styles: xaml.reduce((n, x) => n + x.styles.length, 0),
    themeResourceKeys: themeTotals,
  },
  controls: controls.map(k => ({ ...k, style: styleTargets.has(k.name) })),
  enums: enums.sort(),
  themeResources: Object.fromEntries(
    xaml
      .filter(x => Object.keys(x.themes).length)
      .map(x => [
        x.file,
        Object.fromEntries(Object.entries(x.themes).map(([t, keys]) => [t, Object.keys(keys).sort()])),
      ]),
  ),
  styles: Object.fromEntries(xaml.filter(x => x.styles.length).map(x => [x.file, x.styles])),
};
await Bun.write(OUT_JSON, JSON.stringify(inventory, null, 1) + "\n");

const table = [
  "<!-- GENERATED by scripts/aphrody/winui-inventory.ts — do not edit by hand -->",
  `Sources : aphrody-labs/microsoft-ui-xaml@${winuiSha} · aphrody-labs/fluentui@${fluentSha} (\`@fluentui/web-components\` ${fluentPkg.version}, ${fluentTags.size} balises) · M3 \`md-elements.txt\` (${m3Tags.size} balises).`,
  "",
  `Inventaire : ${idlFiles.length} .idl (controls/dev, hors tests) + modèle XamlOM (Controls, Controls.Primitives) → ${byName.size} classes, ${controls.length} contrôles, ${enums.length} enums ; ${xamlFiles.length} .xaml → ${inventory.totals.styles} styles ; clés de ressources de thème uniques : ${Object.entries(
    themeTotals,
  )
    .map(([t, n]) => `${t} ${n}`)
    .join(", ")}. Détail : \`winui-inventory.json\`.`,
  "",
  "| WinUI | Source | Propriétés (+DP) | Événements | Style XAML | Fluent UI web components v3 | M3 |",
  "|---|---|---:|---:|---|---|---|",
  ...rows,
  "",
  `Balises Fluent v3 sans contrôle WinUI associé dans la table : ${fluentUnused.map(t => `\`${t}\``).join(", ") || "aucune"}.`,
  "",
  `Contrôles WinUI de l'inventaire hors table : ${controls.filter(k => !mappedControls.has(k.name)).length} (liste complète dans le JSON).`,
  "",
  missing.length
    ? `Noms absents des sources (barrés ci-dessus) : ${missing.join(", ")}.`
    : "Toutes les balises et tous les contrôles de la table existent dans les sources citées.",
  "<!-- END GENERATED -->",
].join("\n");

const START = "<!-- GENERATED by scripts/aphrody/winui-inventory.ts";
const END = "<!-- END GENERATED -->";
const md = (await Bun.file(OUT_MD).exists()) ? await Bun.file(OUT_MD).text() : "";
let next: string;
if (md.includes(START) && md.includes(END))
  next = md.slice(0, md.indexOf(START)) + table + md.slice(md.indexOf(END) + END.length);
else
  next =
    (md || "# M-winui-m3 — WinUI 3 → Fluent UI web components v3 → M3\n\n") + "\n## Table générée\n\n" + table + "\n";
await Bun.write(OUT_MD, next);

console.log(
  JSON.stringify({ ...inventory.totals, missing, out: [relative(ROOT, OUT_JSON), relative(ROOT, OUT_MD)] }, null, 1),
);
