// SPDX-License-Identifier: Apache-2.0
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";

const root = resolve(import.meta.dir, "..");
const manifestPath = resolve(root, "inventory.json");
const inventory = await Bun.file(manifestPath).json();
for (const entry of inventory.entries) {
  if (entry.error === "Error: No main documentation content" && /\.(?:png|svg|ai)$/.test(new URL(entry.url).pathname)) {
    entry.status = "excluded";
    entry.error = "Excluded non-document media (original result: No main documentation content)";
  }
}
const chrome = inventory.corpora.find((corpus: any) => corpus.family === "chrome-pages");
if (chrome?.catalog?.exhausted && chrome.error) {
  chrome.warning = chrome.error;
  delete chrome.error;
}
await Bun.write(manifestPath, JSON.stringify(inventory, null, 2) + "\n");
const fetched = inventory.entries.filter((entry: any) => entry.status === "fetched");
const failed = inventory.entries.filter((entry: any) => entry.status === "failed");
const excluded = inventory.entries.filter((entry: any) => entry.status === "excluded");
const bytes = fetched.reduce((sum: number, entry: any) => sum + entry.bytes, 0);
const familyNames = Array.from(new Set<string>(inventory.entries.map((entry: any) => entry.family))).sort();
const link = (path: string) => path.split("/").map(encodeURIComponent).join("/");
const lines = [
  "# Catalogue des sources récupérées",
  "",
  "Généré depuis `inventory.json`. Chaque entrée relie la copie locale à son origine.",
  "Les copies upstream peuvent être historiques ; consulter les synthèses avant une décision d'implémentation.",
  "",
];
for (const family of familyNames) {
  lines.push(`## ${family}`, "");
  for (const entry of fetched.filter((entry: any) => entry.family === family)) {
    lines.push(`- [${entry.path.replace(/^sources\//, "")} ](${link(entry.path)}) — [origine](${entry.url})`);
  }
  lines.push("");
}
await Bun.write(resolve(root, "catalog.md"), lines.join("\n") + "\n");
const report = [
  "# Couverture de la collecte",
  "",
  `Date : ${inventory.observedOn}. Début du relevé : ${inventory.fetchedAt}.`,
  "",
  `**${fetched.length} fichiers récupérés**, ${bytes.toLocaleString("fr-FR")} octets (${(bytes / 1048576).toFixed(2)} MiB).`,
  `${failed.length} URL/fichiers non récupérés sont explicitement enregistrés ci-dessous.`,
  `${excluded.length} liens médias ont été exclus du corpus textuel.`,
  "",
  "## Révisions et périmètres",
  "",
  "| Corpus | Révision | Sous-arbres | Sélection textuelle | Copies récupérées |",
  "| --- | --- | --- | ---: | ---: |",
];
for (const corpus of inventory.corpora) {
  const entries = fetched.filter((entry: any) => entry.family === corpus.family);
  report.push(
    `| ${corpus.family} | \`${corpus.revision}\` | ${corpus.prefixes.join(", ") || "racine"} | ${corpus.selected} | ${entries.length} |`,
  );
}
report.push(
  "",
  "Les fichiers LICENSE, README et notices supplémentaires peuvent expliquer un nombre",
  "de copies supérieur à celui de la sélection documentaire. Les arbres GitHub",
  "ne sont pas tronqués dans les relevés reçus. Aucun code moteur n'a été compilé.",
  "",
  "## Chrome : découverte par liens",
  "",
  "Les sitemaps officiels ont expiré sans réponse depuis ce poste. Le parcours",
  "des liens des portails `/docs/` a donc remplacé l'énumération sitemap.",
  `Il a découvert ${chrome?.catalog?.discovered ?? 0} URL, avec une limite de ${chrome?.catalog?.limit ?? 0}.`,
  `File de parcours épuisée avant la limite : **${chrome?.catalog?.exhausted ? "oui" : "non"}**.`,
  "Cela couvre les liens accessibles depuis les portails sélectionnés, pas les pages",
  "orphelines, traductions, contenus internes ou documents d'autres domaines.",
  "",
  "## Archives historiques et versions",
  "",
  "Le dépôt `chromiumos/docs` se déclare déprécié depuis Q1 2024 dans son README.",
  "La bibliothèque actuelle est aussi capturée dans le corpus `chromium-site`.",
  "Les pages live et les snapshots de dépôts sont des acquisitions différentes ;",
  "leurs révisions ne représentent pas la version du Chromium installé ou livré.",
  "Les résultats Context7 sont conservés séparément et recoupés par les synthèses.",
  "",
  "## Échecs explicites",
  "",
  "| Origine | Résultat |",
  "| --- | --- |",
);
for (const entry of failed)
  report.push(`| [${entry.url}](${entry.url}) | ${String(entry.error).replaceAll("|", "\\|").replaceAll("\n", " ")} |`);
report.push(
  "",
  "Une URL LICENSE absente ne constitue pas une licence implicite. Une URL",
  "historique cassée ne valide pas le contrat correspondant. Les guides peuvent",
  "diriger vers une URL actuelle tout en conservant la trace de l'échec original.",
  "",
  "## Vérification et réutilisation",
  "",
  "L'intégrité est vérifiée par `tools/collect.ts --verify` : présence, taille",
  "et SHA-256 de chaque copie annoncée. Le catalogue donne les liens locaux",
  "et d'origine. La recherche fonctionne hors ligne avec `rg`.",
  "",
  "Le portail Google reste un catalogue de produits liés au navigateur ; la",
  "documentation de tous les services Google n'est pas incluse. PDF, images,",
  "vidéos, fichiers source non sélectionnés et builds sont exclus.",
  "",
);
await Bun.write(resolve(root, "coverage.md"), report.join("\n") + "\n");
let missing = 0;
for (const path of [
  "README.md",
  "NOTICE.md",
  "architecture.md",
  "chrome.md",
  "google.md",
  "v8-jsc.md",
  "forks.md",
  "gpu-skia.md",
  "build-tools.md",
  "chromiumos.md",
  "coverage.md",
  "catalog.md",
]) {
  const text = await Bun.file(resolve(root, path)).text();
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "");
    if (/^(?:https?:|#)/.test(target)) continue;
    const decoded = decodeURIComponent(target.split("#")[0]);
    const file = resolve(dirname(resolve(root, path)), decoded);
    if (!existsSync(file)) {
      console.error(`Missing local link in ${path}: ${target}`);
      missing++;
    }
  }
}
console.log(
  JSON.stringify({
    fetched: fetched.length,
    failed: failed.length,
    excluded: excluded.length,
    bytes,
    localLinkErrors: missing,
  }),
);
if (missing) process.exitCode = 1;
