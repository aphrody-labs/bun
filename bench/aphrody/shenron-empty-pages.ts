// Read-only audit: which public Shenron pages render without data.
//
//   bun bench/aphrody/shenron-empty-pages.ts [--origin https://dragonballfr.com] [--concurrency 5]
//       [--limit 0] [--out bench/aphrody/results]
//
// Reads the sitemap, fetches every page once and records its status, text size and the empty-state markers the
// site renders ("à compléter", "Non renseigné", "Aucune source", ...). A page is `empty` when it answers with an
// error status, carries almost no text, or shows a marker. The raw rows land in `--out`; the report groups them
// by section. Nothing is written to the site.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = new Map<string, string>();
for (let i = 2; i < Bun.argv.length; i += 2) args.set(Bun.argv[i]!.replace(/^--/, ""), Bun.argv[i + 1] ?? "");
const origin = (args.get("origin") ?? "https://dragonballfr.com").replace(/\/$/, "");
const concurrency = Number(args.get("concurrency") ?? 5);
const limit = Number(args.get("limit") ?? 0);
const out = resolve(args.get("out") ?? join(import.meta.dir, "results"));

const MARKERS = [
  "à compléter",
  "Non renseigné",
  "Aucune source",
  "Aucune planche",
  "Aucune entrée",
  "Aucun scan pour cette planche",
  "Aucune traduction publiée",
  "Aucune donnée",
  "Aucun résultat",
] as const;

const sitemap = await (await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(60_000) })).text();
let urls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]!))];
if (limit > 0) urls = urls.slice(0, limit);

type Row = { path: string; section: string; status: number; textChars: number; markers: string[]; empty: boolean; error?: string };
const rows: Row[] = [];

const visibleText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

async function audit(url: string): Promise<Row> {
  const path = new URL(url).pathname;
  const section = path.split("/").slice(1, 3).join("/") || "/";
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
    const html = await response.text();
    const text = visibleText(html);
    const markers = MARKERS.filter(marker => text.includes(marker));
    return {
      path,
      section,
      status: response.status,
      textChars: text.length,
      markers: [...markers],
      empty: !response.ok || text.length < 800 || markers.length > 0,
    };
  } catch (error) {
    return { path, section, status: 0, textChars: 0, markers: [], empty: true, error: String((error as Error).message) };
  }
}

let next = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < urls.length) {
      const url = urls[next++]!;
      rows.push(await audit(url));
      if (rows.length % 250 === 0) console.error(`${rows.length}/${urls.length}`);
    }
  }),
);

const bySection = new Map<string, { total: number; empty: number; markers: Map<string, number> }>();
for (const row of rows) {
  const entry = bySection.get(row.section) ?? { total: 0, empty: 0, markers: new Map() };
  entry.total++;
  if (row.empty) entry.empty++;
  for (const marker of row.markers) entry.markers.set(marker, (entry.markers.get(marker) ?? 0) + 1);
  bySection.set(row.section, entry);
}

const lines = [`Shenron empty-page audit — ${origin}, ${rows.length} pages, ${rows.filter(row => row.empty).length} empty`, "", "| section | pages | empty | markers |", "|---|---:|---:|---|"];
for (const [section, entry] of [...bySection].sort((a, b) => b[1].empty - a[1].empty)) {
  lines.push(`| ${section} | ${entry.total} | ${entry.empty} | ${[...entry.markers].map(([marker, count]) => `${marker} ×${count}`).join(", ")} |`);
}
console.log(lines.join("\n"));

mkdirSync(out, { recursive: true });
const file = join(out, `shenron-empty-pages-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify({ origin, rows: rows.sort((a, b) => a.path.localeCompare(b.path)) }, null, 2));
console.error(`wrote ${file}`);
