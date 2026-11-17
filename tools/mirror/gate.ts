// The gate: one report on the running Bun installation, the fork's docs and types against upstream,
// and the docs against the origin's sitemap. It is keyed by the hash of everything it read, so an
// unchanged tree answers from the cache.
import { statSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.ts";
import { sha256 } from "./config.ts";
import { compare, coverage, type Comparison } from "./docs.ts";
import { inspectInstallation, type Installation } from "./install.ts";
import { readSitemap } from "./sitemap.ts";
import type { Store } from "./store.ts";

export interface GateReport {
  key: string;
  cached: boolean;
  tiers: string[];
  install: Installation;
  comparison: Omit<Comparison, "pages">;
  coverage: { published: number; missingInFork: string[]; unpublished: string[] } | null;
  /** What must be fixed before building. Empty: the gate passes. */
  problems: string[];
  ms: number;
}

export interface GateOptions {
  /** Read the origin's sitemap (network). Without it, a sitemap already in the cache is used. */
  live?: boolean;
  /** Fetch the upstream branch when the checkout does not track it. */
  fetch?: boolean;
  /** Ignore a cached report. */
  fresh?: boolean;
}

const stamp = (path: string): string => {
  try {
    const s = statSync(path);
    return `${path}:${s.size}:${s.mtimeMs}`;
  } catch {
    return `${path}:absent`;
  }
};

/**
 * A key that costs two git calls: the commits on both sides, the size and time of every file git
 * reports as modified or new, and the files the installation check reads. It only lets a report
 * that already passed be reused; anything it cannot vouch for goes through the full gate.
 */
async function quickKey(cfg: Config, sitemapKey: string | null): Promise<string | null> {
  const git = async (...args: string[]): Promise<string | null> => {
    const proc = Bun.spawn(["git", "-C", cfg.repo, ...args], { stdout: "pipe", stderr: "ignore" });
    const [out, code] = await Promise.all([proc.stdout.text(), proc.exited]);
    return code === 0 ? out : null;
  };
  const head = await git("rev-parse", "HEAD");
  const status = await git("status", "--porcelain=v1", "-z", "--untracked-files=all");
  if (head === null || status === null) return null;
  const upstream = await git("rev-parse", "--verify", "--quiet", `refs/remotes/${cfg.upstream.remote}/${cfg.upstream.branch}`);
  const dirty = status.split("\0").filter(Boolean).map((entry) => `${entry.slice(0, 2)} ${stamp(join(cfg.repo, entry.slice(3)))}`);
  const reads = [process.execPath, join(cfg.repo, "bun.lock"), join(cfg.repo, "package.json"), join(cfg.repo, "LATEST"), join(import.meta.dir, "mirror.toml")].map(stamp);
  return sha256(JSON.stringify([head, upstream, dirty, reads, Bun.revision, cfg.compare, sitemapKey]));
}

export async function runGate(cfg: Config, store: Store, opts: GateOptions = {}): Promise<GateReport> {
  const started = Bun.nanoseconds();
  const sitemapCacheKey = `sitemap:${new URL(cfg.origin.sitemap, cfg.origin.url).href}`;
  const quick = opts.fresh || opts.live || opts.fetch ? null : await quickKey(cfg, sha256((await store.get(sitemapCacheKey)) ?? ""));
  if (quick) {
    const hit = await store.get(`gate-quick:${quick}`);
    if (hit) return { ...(JSON.parse(hit) as GateReport), cached: true, ms: Math.round((Bun.nanoseconds() - started) / 1e6) };
  }
  const install = await inspectInstallation(cfg.repo);
  const comparison = await compare(cfg, { fetch: opts.fetch });
  let sitemap: string[] | null = null;
  if (opts.live) sitemap = await readSitemap(cfg, store);
  else {
    const cached = await store.get(sitemapCacheKey);
    if (cached) sitemap = Bun.JSONL.parse(cached) as string[];
  }
  const key = sha256(JSON.stringify([comparison.inputs, install.revision, install.binary.sha256, install.lockfile, sitemap ? sha256(sitemap.join("\n")) : null]));
  if (!opts.fresh) {
    const hit = await store.get(`gate:${key}`);
    if (hit) return { ...(JSON.parse(hit) as GateReport), cached: true, ms: Math.round((Bun.nanoseconds() - started) / 1e6) };
  }

  const problems: string[] = [];
  if (install.lockfile?.missingWorkspaces.length) problems.push(`bun.lock lacks ${install.lockfile.missingWorkspaces.length} workspace(s): ${install.lockfile.missingWorkspaces.join(", ")} (run bun install)`);
  if (comparison.types.missing.length) problems.push(`${comparison.types.missing.length} upstream declaration(s) missing from the fork's types: ${comparison.types.missing.slice(0, 10).join(", ")}`);
  for (const issue of comparison.forkIssues) problems.push(`${issue.path}:${issue.line}: ${issue.kind}: ${issue.detail}`);

  const { pages, ...rest } = comparison;
  const report: GateReport = {
    key,
    cached: false,
    tiers: store.tiers(),
    install,
    comparison: rest,
    coverage: sitemap ? coverage(pages, sitemap, cfg) : null,
    problems,
    ms: Math.round((Bun.nanoseconds() - started) / 1e6),
  };
  await store.set(`gate:${key}`, JSON.stringify(report), 7 * 86400);
  if (quick && !problems.length) await store.set(`gate-quick:${quick}`, JSON.stringify(report), 7 * 86400);
  return report;
}

export function summarize(r: GateReport): string {
  const c = r.comparison;
  const lines = [
    `bun ${r.install.version} (${r.install.revision.slice(0, 9)}) ${r.install.platform}-${r.install.arch}, cache ${r.install.cache.packages} packages, lockfile ${r.install.lockfile ? `${r.install.lockfile.packages} packages / ${r.install.lockfile.workspaces} workspaces` : "absent"}`,
    c.upstream ? `upstream ${c.upstream.sha.slice(0, 11)}: ${c.files.total} docs and type files, ${c.files.same} same, ${c.files.changed} changed, ${c.files.forkOnly} fork-only, ${c.files.upstreamOnly} upstream-only` : `upstream not available: ${c.files.total} docs and type files checked on their own`,
    `types: ${c.types.fork} declarations, ${c.types.forkOnly.length} fork-only, ${c.types.missing.length} missing from upstream's ${c.types.upstream}`,
    `docs: ${c.issues.length} link or frontmatter issue(s) in all, ${c.forkIssues.length} in files the fork changed`,
    r.coverage ? `site: ${r.coverage.published} published docs pages, ${r.coverage.missingInFork.length} not in the fork, ${r.coverage.unpublished.length} fork pages not published` : "site: no sitemap read yet (run the crawl, or the gate with --live)",
    `tiers: ${r.tiers.join(", ")}; ${r.cached ? "cached" : "computed"} in ${r.ms} ms`,
    r.problems.length ? `FAIL: ${r.problems.length} problem(s)\n${r.problems.map((p) => `  ${p}`).join("\n")}` : "PASS",
  ];
  return lines.join("\n");
}
