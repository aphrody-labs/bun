// Browser and crawler benchmark on the live Shenron episodes wiki.
//
//   bun bench/aphrody/browsers/browsers.ts [--runs 5] [--only obscura,lightpanda,...] [--list]
//       [--origin https://dragonballfr.com] [--crawl-requests 25] [--out bench/aphrody/browsers/results]
//
// Every sample is a cold process: the browser starts, loads the page, prints the rendered document and exits.
// A sample only counts when its output passes the workload check (episode links found, player text found), so a
// tool that is fast because it does not run the page's JavaScript shows up as `ok 0/N`, not as a win.
// Targets are interleaved per run (A, B, C, then C, B, A ...) and the raw samples land in `--out`.
// maxRSS is the resident set of the launched process only: browser children (Chrome renderers) are not included.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const here = import.meta.dir;
const args = new Map<string, string>();
for (let i = 2; i < Bun.argv.length; i++) {
  const arg = Bun.argv[i]!;
  if (!arg.startsWith("--")) continue;
  const next = Bun.argv[i + 1];
  if (next === undefined || next.startsWith("--")) args.set(arg.slice(2), "true");
  else (args.set(arg.slice(2), next), i++);
}

const origin = args.get("origin") ?? "https://dragonballfr.com";
const runs = Number(args.get("runs") ?? 5);
const crawlRequests = Number(args.get("crawl-requests") ?? 25);
const outDir = resolve(args.get("out") ?? join(here, "results"));
const only = args.get("only")?.split(",");
const chrome = Bun.env.BUN_CHROME_PATH ?? Bun.which("google-chrome-stable") ?? Bun.which("chromium") ?? "";
const globalModules = [
  join(homedir(), "build/bun/install-global/node_modules"),
  join(homedir(), ".bun/install/global/node_modules"),
].find(existsSync);

type Workload = { name: string; url: string; check: (out: string) => boolean; detail: (out: string) => string };

const episodeLinks = (out: string) =>
  new Set(out.match(/\/wiki\/episodes\/[A-Za-z0-9-]+(?=["'\s<\\,&)]|$)/g) ?? []).size;

const workloads: Workload[] = [
  {
    name: "index",
    url: `${origin}/wiki/episodes`,
    check: out => episodeLinks(out) >= 100,
    detail: out => `${episodeLinks(out)} episode links`,
  },
  {
    name: "episode",
    url: `${origin}/wiki/episodes/1`,
    check: out => out.includes("Lecteur 1"),
    detail: out => (out.includes("Lecteur 1") ? "player rendered" : "player missing"),
  },
];

type Target = {
  id: string;
  describe: string;
  available: () => string | null; // null when usable, else the reason it is not
  commands: (url: string) => string[][]; // run in order; the last stdout is the document
  cleanup?: string[][];
  env?: Record<string, string>;
};

// The harness runtime also runs the bun-based targets, so run it with a release build for timing claims.
const bun = Bun.env.BENCH_BUN ?? process.execPath;
const have = (name: string) => (Bun.which(name) ? null : `${name} not installed`);

const targets: Target[] = [
  {
    id: "obscura",
    describe: "Obscura 0.1 (Rust, V8), obscura fetch --dump html",
    available: () => have("obscura"),
    commands: url => [["obscura", "fetch", url, "--dump", "html"]],
  },
  {
    id: "lightpanda",
    describe: "Lightpanda nightly (Zig), lightpanda fetch --dump html",
    available: () => have("lightpanda"),
    commands: url => [["lightpanda", "fetch", "--dump", "html", url]],
  },
  {
    id: "agent-browser",
    describe: "agent-browser 0.39 on Chrome, open + eval outerHTML",
    available: () => have("agent-browser") ?? (chrome ? null : "no Chrome executable"),
    commands: url => [
      ["agent-browser", "open", url],
      ["agent-browser", "eval", "document.documentElement.outerHTML"],
    ],
    cleanup: [["agent-browser", "close"]],
    env: { AGENT_BROWSER_EXECUTABLE_PATH: chrome, AGENT_BROWSER_ARGS: "--no-sandbox" },
  },
  {
    id: "playwright",
    describe: "Playwright on system Chrome (bun script)",
    available: () => (globalModules ? (chrome ? null : "no Chrome executable") : "playwright not installed globally"),
    commands: url => [[bun, join(here, "playwright-run.ts"), url]],
    env: { BENCH_CHROME: chrome, BENCH_GLOBAL_MODULES: globalModules ?? "" },
  },
  {
    id: "bun-webview",
    describe: "Bun.WebView, Chrome backend",
    available: () => (chrome ? null : "no Chrome executable"),
    commands: url => [[bun, join(here, "webview-run.ts"), url]],
    env: { BENCH_CHROME: chrome },
  },
  {
    id: "bun-web",
    describe: "@aphrody/bun-web BrowserPage over a Chrome CDP endpoint",
    available: () => (chrome ? null : "no Chrome executable"),
    commands: url => [[bun, join(here, "bunweb-run.ts"), url]],
    env: { BENCH_CHROME: chrome },
  },
  {
    id: "aphrody-web",
    describe: "aphrody web scrape --html (static profile)",
    available: () => have("aphrody"),
    commands: url => [["aphrody", "web", "scrape", url, "--html", "--max", "1"]],
  },
  {
    id: "aphrody-web-browser",
    describe: "aphrody web browser snapshot --json (Obscura session; readable text, truncated, no hrefs)",
    available: () => have("aphrody"),
    commands: url => [["aphrody", "web", "browser", "snapshot", url, "--json"]],
  },
];

type Sample = { ms: number; maxRssMiB: number | null; ok: boolean; detail: string; exit: number };

async function once(target: Target, workload: Workload): Promise<Sample> {
  const env = { ...Bun.env, ...target.env } as Record<string, string>;
  let out = "";
  let exit = 0;
  let rss: number | null = null;
  const start = performance.now();
  for (const cmd of target.commands(workload.url)) {
    const child = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore", env, timeout: 90_000, killSignal: "SIGKILL" });
    const [text, code] = await Promise.all([child.stdout.text(), child.exited]);
    out = text;
    exit = code;
    rss = Math.max(rss ?? 0, (child.resourceUsage()?.maxRSS ?? 0) / 1024 / 1024) || rss;
    if (code !== 0) break;
  }
  const ms = performance.now() - start;
  for (const cmd of target.cleanup ?? []) {
    await Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore", env, timeout: 30_000 }).exited;
  }
  const ok = exit === 0 && workload.check(out);
  return { ms, maxRssMiB: rss, ok, detail: exit === 0 ? workload.detail(out) : `exit ${exit}`, exit };
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n ? (n % 2 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2) : NaN;
};

const selected = targets.filter(target => !only || only.includes(target.id));
if (args.has("list")) {
  for (const target of targets)
    console.log(`${target.id.padEnd(22)} ${target.available() ?? "ready"}  ${target.describe}`);
  process.exit(0);
}

const results: Record<string, Record<string, Sample[]>> = {};
const skipped: Record<string, string> = {};
const usable = selected.filter(target => {
  const reason = target.available();
  if (reason) skipped[target.id] = reason;
  return !reason;
});

for (const workload of workloads) {
  for (let run = 0; run < runs; run++) {
    const order = run % 2 ? [...usable].reverse() : usable;
    for (const target of order) {
      const sample = await once(target, workload);
      ((results[target.id] ??= {})[workload.name] ??= []).push(sample);
      console.error(
        `${workload.name} run ${run + 1}/${runs} ${target.id}: ${sample.ms.toFixed(0)} ms ok=${sample.ok} (${sample.detail})`,
      );
    }
  }
}

// Crawl workload: the same bounded set of pages fetched one by one with plain `fetch` (baseline) and crawled and
// indexed in process by Aphrody. Both wait `crawlDelayMs` between requests so the site sees the same modest rate.
type Crawl = { id: string; ms: number; ok: boolean; detail: string };
const crawls: Crawl[] = [];
const crawlDelayMs = Number(args.get("crawl-delay-ms") ?? 250);
if (!only || only.includes("crawl")) {
  const indexHtml = await (await fetch(`${origin}/wiki/episodes`, { signal: AbortSignal.timeout(30_000) })).text();
  const pages = [...new Set(indexHtml.match(/\/wiki\/episodes\/\d+/g) ?? [])].slice(0, crawlRequests);
  const started = performance.now();
  let fetched = 0;
  for (const path of pages) {
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(30_000) });
    await response.text();
    if (response.ok) fetched++;
    await Bun.sleep(crawlDelayMs);
  }
  crawls.push({
    id: "bun-fetch (sequential baseline)",
    ms: performance.now() - started,
    ok: fetched === pages.length,
    detail: `${fetched}/${pages.length} pages`,
  });

  if (have("aphrody") === null) {
    const label = `bench-${Date.now().toString(36)}`;
    const state = mkdtempSync(join(tmpdir(), "bench-crawl-"));
    const crawlStart = performance.now();
    const child = Bun.spawn(
      [
        "aphrody",
        "web",
        "crawl-index",
        "--label",
        label,
        "--state",
        state,
        "--max-requests",
        String(crawlRequests),
        "--max-depth",
        "1",
        "--per-host-delay-ms",
        String(crawlDelayMs),
        `${origin}/wiki/episodes`,
      ],
      { stdout: "pipe", stderr: "pipe", timeout: 300_000, killSignal: "SIGKILL" },
    );
    const [text, errText, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    const ms = performance.now() - crawlStart;
    try {
      const report = JSON.parse(text) as {
        attempts: number;
        pages: number;
        written: number;
        crawl_errors: number;
        index: { indexed: number };
      };
      crawls.push({
        id: "aphrody web crawl-index (crawl + index)",
        ms,
        ok: code === 0 && report.crawl_errors === 0 && report.pages === crawlRequests && report.index.indexed === report.pages,
        detail: `${report.pages}/${report.attempts} pages, ${report.written} written, ${report.index.indexed} indexed, ${report.crawl_errors} errors`,
      });
    } catch {
      crawls.push({ id: "aphrody web crawl-index (crawl + index)", ms, ok: false, detail: `exit ${code}: ${errText.trim().slice(0, 160)}` });
    }
    rmSync(state, { recursive: true, force: true });
  } else {
    skipped["crawl-index"] = "aphrody not installed";
  }
}

const rows: string[] = [];
for (const workload of workloads) {
  rows.push(`\n### ${workload.name} — ${workload.url}\n`);
  rows.push("| target | median ms | min | max | ok | maxRSS MiB | last result |");
  rows.push("|---|---:|---:|---:|---:|---:|---|");
  for (const target of usable) {
    const samples = results[target.id]?.[workload.name] ?? [];
    const times = samples.map(sample => sample.ms);
    const rss = median(samples.map(sample => sample.maxRssMiB ?? NaN).filter(Number.isFinite));
    rows.push(
      `| ${target.id} | ${median(times).toFixed(0)} | ${Math.min(...times).toFixed(0)} | ${Math.max(...times).toFixed(0)} | ${samples.filter(sample => sample.ok).length}/${samples.length} | ${Number.isFinite(rss) ? rss.toFixed(0) : "n/a"} | ${samples.at(-1)?.detail ?? ""} |`,
    );
  }
}
if (crawls.length) {
  rows.push(`\n### crawl — ${crawlRequests} pages\n`);
  rows.push("| target | ms | ok | result |", "|---|---:|:---:|---|");
  for (const crawl of crawls) rows.push(`| ${crawl.id} | ${crawl.ms.toFixed(0)} | ${crawl.ok} | ${crawl.detail} |`);
}
for (const [id, reason] of Object.entries(skipped)) rows.push(`\nSkipped ${id}: ${reason}`);
console.log(rows.join("\n"));

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(
  join(outDir, `${stamp}.json`),
  JSON.stringify(
    { origin, runs, host: { cpus: navigator.hardwareConcurrency }, bun: Bun.version, results, crawls, skipped },
    null,
    2,
  ),
);
console.error(`wrote ${join(outDir, `${stamp}.json`)}`);
