// Surface publique de Node (lib/*.js + doc/api/*.md d'un clone aphrody-labs/node) croisée avec
// les règles n2b (packages/bun-n2b/crates/n2b-registry/registry) et ce que le Bun qui exécute
// le script expose réellement.
//
//   bun scripts/aphrody/node-api-surface.ts [--node C:/forks/node] [--out docs/aphrody/merge]
//
// Sorties : M-n2b-node.md (table de couverture) et M-n2b-node.json (une ligne par API).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    node: { type: "string", default: "C:/forks/node" },
    out: { type: "string", default: join(import.meta.dir, "../../docs/aphrody/merge") },
  },
});
const nodeRoot = values.node!;
const outDir = values.out!;
const registryDir = join(import.meta.dir, "../../packages/bun-n2b/crates/n2b-registry/registry");
const require = createRequire(import.meta.path);

type Status = "règle n2b" | "natif Bun" | "absent de Bun" | "membre d'instance";
type Entry = { kind: string; doc: string; symbol: string; status: Status; rules: string[] };

const toml = async (name: string) =>
  Bun.TOML.parse(await Bun.file(join(registryDir, name)).text()) as any;
const [apis, modules, globalsToml, cliToml] = await Promise.all(
  ["apis.toml", "modules.toml", "globals.toml", "cli.toml"].map(toml),
);

// Symboles `objet.membre` cités par les motifs des règles d'API, et globals traités par globals.toml.
const rulesBySymbol = new Map<string, string[]>();
const addRule = (symbol: string, id: string) =>
  rulesBySymbol.set(symbol, [...(rulesBySymbol.get(symbol) ?? []), id]);
for (const rule of apis.apis) {
  for (const m of String(rule.pattern).matchAll(/(\w+)\\\.(\w+)(?:\\\.(\w+))?/g)) {
    addRule(`${m[1]}.${m[2]}`, rule.id);
    if (m[3]) addRule(`${m[1]}.${m[2]}.${m[3]}`, rule.id);
  }
  // `(?:child_process\.)?execSync` : le membre seul, rattaché au module importé.
  if (rule.import_from) {
    for (const m of String(rule.pattern).matchAll(/\)\?(\w+)\\s\*\\\(/g))
      addRule(`${rule.import_from}.${m[1]}`, rule.id);
  }
}
for (const g of globalsToml.globals) addRule(g.symbol, g.id);
const moduleCompat = new Map<string, any>(modules.modules.map((m: any) => [m.module, m]));

// Modules publics : lib/*.js et lib/<dir>/*.js hors internal/ et hors `_`-préfixés.
const publicModules: string[] = [];
for await (const file of new Bun.Glob("**/*.js").scan({ cwd: join(nodeRoot, "lib") })) {
  const path = file.replaceAll("\\", "/");
  if (path.startsWith("internal/") || path.split("/").some((p) => p.startsWith("_"))) continue;
  publicModules.push(path.slice(0, -3));
}
publicModules.sort();

const loadBun = (specifier: string) => {
  try {
    return require(specifier);
  } catch {
    return undefined;
  }
};
const bunModule = (m: string) => loadBun(`node:${m}`);

// Préfixes de la doc qui ne portent pas le nom du module.
const prefixAlias: Record<string, string> = {
  fsPromises: "fs/promises",
  timersPromises: "timers/promises",
  dnsPromises: "dns/promises",
  readlinePromises: "readline/promises",
  childProcess: "child_process",
  diagnosticsChannel: "diagnostics_channel",
  stringDecoder: "string_decoder",
  workerThreads: "worker_threads",
  perfHooks: "perf_hooks",
  asyncHooks: "async_hooks",
};

const resolveObject = (path: string[]): { found: boolean; value?: any } => {
  const [head, ...rest] = path;
  let value: any;
  const moduleName = prefixAlias[head] ?? (publicModules.includes(head) ? head : undefined);
  if (moduleName) value = bunModule(moduleName);
  else if (head in globalThis) value = (globalThis as any)[head];
  else return { found: false };
  for (const key of rest) {
    if (value == null || !(key in Object(value))) return { found: true, value: undefined };
    value = value[key];
  }
  return { found: true, value };
};

const entries: Entry[] = [];
const push = (
  kind: string,
  doc: string,
  symbol: string,
  present: boolean | undefined,
  rules: string[] = [],
) => {
  const status: Status = rules.length
    ? "règle n2b"
    : present === undefined
      ? "membre d'instance"
      : present
        ? "natif Bun"
        : "absent de Bun";
  entries.push({ kind, doc, symbol, status, rules });
};

for (const m of publicModules) {
  const known = moduleCompat.get(m.split("/")[0]);
  const present = bunModule(m) !== undefined;
  push("module", "lib", `node:${m}`, present, known && !present ? [known.id] : []);
}

// Exports par module tirés de lib/*.js (`module.exports = { … }`, `module.exports.x =`, `exports.x =`).
const libExports = new Map<string, Set<string>>();
for (const m of publicModules) {
  const src = await Bun.file(join(nodeRoot, "lib", `${m}.js`)).text();
  const names = new Set<string>();
  const block = src.match(/module\.exports\s*=\s*\{([\s\S]*?)\n\};?/);
  if (block) {
    for (const line of block[1].split("\n")) {
      const key = line.match(/^\s{2}(?:get\s+|set\s+)?(?:\[?)([A-Za-z_$][\w$]*)/);
      if (key && !["__proto__", "get", "set"].includes(key[1])) names.add(key[1]);
    }
  }
  for (const k of src.matchAll(/^(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/gm)) names.add(k[1]);
  for (const k of src.matchAll(/ObjectDefinePropert(?:y|ies)\(module\.exports,\s*'([\w$]+)'/g))
    names.add(k[1]);
  libExports.set(m, names);
}

const seen = new Set<string>();
for (const [m, names] of libExports) {
  const mod = bunModule(m);
  for (const name of names) {
    const symbol = `${m}.${name}`;
    seen.add(symbol);
    push(
      "export",
      `lib/${m}.js`,
      symbol,
      mod !== undefined && name in Object(mod),
      rulesBySymbol.get(symbol) ?? [],
    );
  }
}

// Entrées de doc/api/*.md : `## \`a.b(…)\``, `Class: \`X\``, `Static method: \`X.y()\``.
const heading = /^#{2,5} (?:(Class|Static method|Event): )?`([^`]+)`/;
for await (const file of new Bun.Glob("*.md").scan({ cwd: join(nodeRoot, "doc/api") })) {
  const doc = file.slice(0, -3);
  const text = await Bun.file(join(nodeRoot, "doc/api", file)).text();
  let section = "";
  for (const line of text.split("\n")) {
    if (/^## /.test(line)) section = line.slice(3).trim();
    const h = line.match(heading);
    if (!h) continue;
    const [, label, raw] = h;
    if (label === "Event") continue;
    if (doc === "cli") {
      if (/^-/.test(raw)) {
        const flag = raw.split(/[=\s,]/)[0];
        if (seen.has(`cli:${flag}`)) continue;
        seen.add(`cli:${flag}`);
        const rules = cliToml.cli
          .filter(
            (c: any) =>
              String(c.pattern).includes(flag.replaceAll("-", "\\-")) ||
              String(c.pattern).includes(flag),
          )
          .map((c: any) => c.id);
        push("option CLI", "cli", flag, bunAcceptsFlag(flag), rules);
      } else if (/^[A-Z][A-Z0-9_]+/.test(raw) && /environment/i.test(section)) {
        const name = raw.split(/[=\s]/)[0];
        if (seen.has(`env:${name}`)) continue;
        seen.add(`env:${name}`);
        push("variable d'environnement", "cli", name, bunReadsEnv(name));
      }
      continue;
    }
    if (doc === "errors" || doc === "n-api") {
      const name = raw.replace(/\(.*$/s, "").trim();
      if (!/^[A-Za-z_]\w*$/.test(name) || seen.has(name)) continue;
      seen.add(name);
      push(
        doc === "errors" ? "code d'erreur" : "N-API (C)",
        `doc/api/${file}`,
        name,
        corpusWords().has(name),
      );
      continue;
    }
    const symbol = raw.replace(/\(.*$/s, "").replace(/\[.*$/, "").trim();
    if (!/^[A-Za-z_$][\w$]*(\.[\w$]+)*$/.test(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    const path = symbol.split(".");
    const resolved = resolveObject(path);
    const kind =
      label === "Class"
        ? "classe"
        : doc === "globals"
          ? "global"
          : doc === "process"
            ? "process"
            : "api";
    if (!resolved.found && label === "Class" && path.length === 1) {
      const docModule = publicModules.includes(doc) ? doc : undefined;
      const mod = docModule && bunModule(docModule);
      const exported = docModule && libExports.get(docModule)?.has(symbol);
      push(
        kind,
        `doc/api/${file}`,
        symbol,
        mod && symbol in Object(mod) ? true : exported ? false : undefined,
      );
      continue;
    }
    if (!resolved.found) {
      push(
        kind,
        `doc/api/${file}`,
        symbol,
        path.length === 1 ? false : undefined,
        rulesBySymbol.get(symbol) ?? [],
      );
      continue;
    }
    push(
      kind,
      `doc/api/${file}`,
      symbol,
      resolved.value !== undefined,
      rulesBySymbol.get(symbol) ?? [],
    );
  }
}

function bunCliSources(): string {
  return ((bunCliSources as any).cache ??= [
    ...new Bun.Glob("src/runtime/cli/**/*.rs").scanSync({ cwd: join(import.meta.dir, "../..") }),
  ]
    .map((f) => readFileSync(join(import.meta.dir, "../..", f), "utf8"))
    .join("\n"));
}
function bunAcceptsFlag(flag: string): boolean {
  if (flag === "-" || flag === "--") return true;
  return new RegExp(`["\\s,]${flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(
    bunCliSources(),
  );
}
function bunReadsEnv(name: string): boolean {
  return corpusWords().has(name);
}
function bunSourceCorpus(): string {
  if ((bunSourceCorpus as any).cache !== undefined) return (bunSourceCorpus as any).cache;
  const root = join(import.meta.dir, "../..");
  const parts: string[] = [];
  for (const f of new Bun.Glob("src/**/*.{rs,cpp,c,h,ts,js}").scanSync({ cwd: root }))
    parts.push(readFileSync(join(root, f), "utf8"));
  return ((bunSourceCorpus as any).cache = parts.join("\n"));
}
function corpusWords(): Set<string> {
  return ((corpusWords as any).cache ??= new Set(
    bunSourceCorpus().match(/\b[A-Za-z_]\w*\b/g) ?? [],
  ));
}

// Rendu.
const statuses: Status[] = ["règle n2b", "natif Bun", "absent de Bun", "membre d'instance"];
const byKind = Map.groupBy(entries, (e) => e.kind);
const count = (list: Entry[], s: Status) => list.filter((e) => e.status === s).length;
const nodeSha = (
  await Bun.$`git -C ${nodeRoot} rev-parse --short HEAD`.quiet().nothrow().text()
).trim();
const md: string[] = [
  "# M-n2b-node : surface publique de Node couverte par n2b",
  "",
  `Généré par \`bun scripts/aphrody/node-api-surface.ts\` depuis aphrody-labs/node@${nodeSha} (lib/*.js, doc/api/*.md) et le registre n2b (\`packages/bun-n2b/crates/n2b-registry/registry\`), avec Bun ${Bun.version}. Détail par API : \`M-n2b-node.json\`.`,
  "",
  "Statuts :",
  "",
  "- **règle n2b** : `n2b` signale l'appel et le réécrit vers l'équivalent Bun natif (ou le signale quand la réécriture est manuelle).",
  "- **natif Bun** : Bun expose la même API (compat native), pas de réécriture.",
  "- **absent de Bun** : ni API Bun du même nom, ni règle ; à implémenter dans le cœur ou à réécrire.",
  "- **membre d'instance** : méthode ou propriété d'une instance (`filehandle.close`) ou type de la doc sans export (`AesCbcParams`), suit sa classe.",
  "",
  "## Synthèse",
  "",
  `| Catégorie | Total | ${statuses.join(" | ")} |`,
  `| --- | --- | ${statuses.map(() => "---").join(" | ")} |`,
  ...[...byKind].map(
    ([kind, list]) =>
      `| ${kind} | ${list.length} | ${statuses.map((s) => count(list, s)).join(" | ")} |`,
  ),
  `| **total** | ${entries.length} | ${statuses.map((s) => count(entries, s)).join(" | ")} |`,
  "",
  "## Par document (API, classes, globals, process)",
  "",
  `| Source | Total | ${statuses.join(" | ")} |`,
  `| --- | --- | ${statuses.map(() => "---").join(" | ")} |`,
  ...[
    ...Map.groupBy(
      entries.filter((e) => !["module", "option CLI", "variable d'environnement"].includes(e.kind)),
      (e) => e.doc,
    ),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([doc, list]) =>
        `| ${doc} | ${list.length} | ${statuses.map((s) => count(list, s)).join(" | ")} |`,
    ),
  "",
  "## API réécrites par une règle n2b",
  "",
  "| API Node | Règles |",
  "| --- | --- |",
  ...entries
    .filter((e) => e.status === "règle n2b")
    .map((e) => `| \`${e.symbol}\` | ${e.rules.map((r) => `\`${r}\``).join(", ")} |`),
  "",
  "## Absentes de Bun",
  "",
  "| Catégorie | API Node | Source |",
  "| --- | --- | --- |",
  ...entries
    .filter((e) => e.status === "absent de Bun")
    .map((e) => `| ${e.kind} | \`${e.symbol}\` | ${e.doc} |`),
  "",
];
await Bun.write(join(outDir, "M-n2b-node.md"), md.join("\n"));
await Bun.write(
  join(outDir, "M-n2b-node.json"),
  JSON.stringify({ node: nodeSha, bun: Bun.version, entries }, null, 1) + "\n",
);
console.log(
  `${entries.length} entrées ; ${statuses.map((s) => `${s} ${count(entries, s)}`).join(", ")}`,
);
