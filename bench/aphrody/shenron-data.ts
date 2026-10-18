// Read-only benchmark of the Shenron catalog and data files, plus the full-text index of a crawl.
//
//   bun bench/aphrody/shenron-data.ts [--shenron ~/src/shenron] [--crawl-db <aphrody.sqlite>] [--iters 7]
//       [--out bench/aphrody/results]
//
// Nothing is written to the Shenron checkout. Each file is parsed `--iters` times after one warm-up read; the
// table reports the median per operation. Lookups are measured on a Map built from the file's own records.

import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

const args = new Map<string, string>();
for (let i = 2; i < Bun.argv.length; i += 2) args.set(Bun.argv[i]!.replace(/^--/, ""), Bun.argv[i + 1] ?? "");
const root = resolve(args.get("shenron") ?? join(homedir(), "src/shenron"));
const iterations = Number(args.get("iters") ?? 7);
const out = resolve(args.get("out") ?? join(import.meta.dir, "results"));

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
};

function timed<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const value = fn();
  return [value, performance.now() - start];
}

function* jsonFiles(dir: string, depth = 0): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && depth < 3) yield* jsonFiles(path, depth + 1);
    else if (entry.isFile() && entry.name.endsWith(".json")) yield path;
  }
}

type FileRow = {
  file: string;
  mib: number;
  parseMs: number;
  mibPerSec: number;
  records: number;
  lookupNs: number | null;
};
const files: FileRow[] = [];
const failures: { file: string; error: string }[] = [];

for (const path of jsonFiles(join(root, "data"))) {
  const bytes = statSync(path).size;
  if (bytes < 1024) continue;
  try {
    let text = await Bun.file(path).text();
    const samples: number[] = [];
    let value: unknown;
    for (let i = 0; i <= iterations; i++) {
      text = await Bun.file(path).text();
      const [parsed, ms] = timed(() => JSON.parse(text));
      value = parsed;
      if (i > 0) samples.push(ms);
    }
    const parseMs = median(samples);
    const records = Array.isArray(value)
      ? value.length
      : value && typeof value === "object"
        ? Object.keys(value as object).length
        : 1;

    // Indexed lookup: key every top-level record by its own id-like field (or its position) and read them all back.
    let lookupNs: number | null = null;
    const entries: [string, unknown][] = Array.isArray(value)
      ? (value as unknown[]).map((item, index) => [
          String(
            (item as Record<string, unknown> | null)?.id ?? (item as Record<string, unknown> | null)?.slug ?? index,
          ),
          item,
        ])
      : Object.entries((value ?? {}) as object);
    if (entries.length) {
      const index = new Map(entries);
      const keys = entries.map(([key]) => key);
      const lookupSamples: number[] = [];
      for (let round = 0; round < iterations; round++) {
        const [, ms] = timed(() => {
          let hits = 0;
          for (const key of keys) if (index.get(key) !== undefined) hits++;
          return hits;
        });
        lookupSamples.push((ms * 1e6) / keys.length);
      }
      lookupNs = median(lookupSamples);
    }
    files.push({
      file: relative(root, path),
      mib: bytes / 1048576,
      parseMs,
      mibPerSec: bytes / 1048576 / (parseMs / 1000),
      records,
      lookupNs,
    });
  } catch (error) {
    failures.push({ file: relative(root, path), error: String((error as Error).message).slice(0, 160) });
  }
}

type Query = { query: string; hits: number; medianMs: number };
const queries: Query[] = [];
const crawlDb = args.get("crawl-db");
if (crawlDb) {
  const db = new Database(crawlDb, { readonly: true });
  const statement = db.query("select count(*) c from chunks_fts where chunks_fts match ?1");
  const rank = db.query("select rowid from chunks_fts where chunks_fts match ?1 order by rank limit 10");
  for (const query of ["episode", "Goku", "Lecteur", "saga", '"Dragon Ball Z Kai"', '"sous-titres"', "Freezer OR Cell"]) {
    const samples: number[] = [];
    let hits = 0;
    for (let i = 0; i <= iterations * 5; i++) {
      const [row, ms] = timed(() => {
        const count = (statement.get(query) as { c: number }).c;
        rank.all(query);
        return count;
      });
      hits = row;
      if (i > 0) samples.push(ms);
    }
    queries.push({ query, hits, medianMs: median(samples) });
  }
  db.close();
}

files.sort((a, b) => b.mib - a.mib);
const lines = [
  `Shenron data benchmark — ${root}/data (${files.length} JSON files, ${iterations} iterations, bun ${Bun.version})`,
  "",
  "| file | MiB | records | parse ms | MiB/s | lookup ns |",
  "|---|---:|---:|---:|---:|---:|",
  ...files.map(
    f =>
      `| ${f.file} | ${f.mib.toFixed(2)} | ${f.records} | ${f.parseMs.toFixed(2)} | ${f.mibPerSec.toFixed(0)} | ${f.lookupNs === null ? "n/a" : f.lookupNs.toFixed(0)} |`,
  ),
];
if (queries.length) {
  lines.push("", "| FTS query | hits | median ms |", "|---|---:|---:|");
  for (const q of queries) lines.push(`| ${q.query} | ${q.hits} | ${q.medianMs.toFixed(3)} |`);
}
for (const failure of failures) lines.push(`\nUnparsable ${failure.file}: ${failure.error}`);
console.log(lines.join("\n"));

mkdirSync(out, { recursive: true });
const path = join(out, `shenron-data-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(path, JSON.stringify({ root, iterations, bun: Bun.version, files, queries, failures }, null, 2));
console.error(`wrote ${path}`);
