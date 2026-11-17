// Fork versus upstream for everything a reader sees: docs (md, mdx), the root markdown files and the
// TypeScript declarations. Git answers "what differs"; the working tree answers "is it sound".
import { join } from "node:path";
import type { Config } from "./config.ts";
import { sha256 } from "./config.ts";

export interface FileDiff {
  path: string;
  status: "changed" | "fork-only" | "upstream-only";
  added: number;
  removed: number;
}
export interface DocIssue {
  path: string;
  line: number;
  kind: "frontmatter" | "title" | "link";
  detail: string;
}
export interface Comparison {
  upstream: { ref: string; sha: string } | null;
  files: { total: number; same: number; changed: number; forkOnly: number; upstreamOnly: number };
  diffs: FileDiff[];
  issues: DocIssue[];
  /** Broken links and bad frontmatter in files the fork added or changed: these are ours to fix. */
  forkIssues: DocIssue[];
  types: { fork: number; upstream: number; forkOnly: string[]; missing: string[] };
  pages: string[];
  /** Hash of every input: same hash, same report. */
  inputs: string;
}

async function git(repo: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  const proc = Bun.spawn(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe", env: { ...Bun.env, GIT_TERMINAL_PROMPT: "0" } });
  const [out, code] = await Promise.all([proc.stdout.text(), proc.exited]);
  return { ok: code === 0, out };
}

/** The upstream commit to compare with: the tracking ref when the checkout has one, else a fetch. */
export async function resolveUpstream(cfg: Config, fetch = false): Promise<{ ref: string; sha: string } | null> {
  const tracking = `refs/remotes/${cfg.upstream.remote}/${cfg.upstream.branch}`;
  if (fetch) {
    const fetched = await git(cfg.repo, ["fetch", "--quiet", "--no-tags", "--filter=blob:none", cfg.upstream.url, `+refs/heads/${cfg.upstream.branch}:${tracking}`]);
    if (!fetched.ok) return null;
  }
  const sha = await git(cfg.repo, ["rev-parse", "--verify", "--quiet", `${tracking}^{commit}`]);
  return sha.ok ? { ref: tracking, sha: sha.out.trim() } : null;
}

function matcher(patterns: string[]): (path: string) => boolean {
  const globs = patterns.map((p) => new Bun.Glob(p));
  return (path) => globs.some((g) => g.match(path));
}

async function tree(repo: string, ref: string): Promise<Map<string, string>> {
  const { out } = await git(repo, ["ls-tree", "-r", "-z", "--format=%(objectname) %(path)", ref]);
  const map = new Map<string, string>();
  for (const entry of out.split("\0")) {
    const space = entry.indexOf(" ");
    if (space > 0) map.set(entry.slice(space + 1), entry.slice(0, space));
  }
  return map;
}

/** Names a declaration file gives to the world: `declare module "x"` and the declarations inside. */
export function declaredNames(source: string): string[] {
  const names = new Set<string>();
  let scope = "";
  for (const line of source.split("\n")) {
    const mod = line.match(/^\s*declare\s+(?:module|namespace)\s+["']?([^"'\s{]+)["']?/);
    if (mod && !line.startsWith(" ")) scope = mod[1]!;
    const decl = line.match(/^\s*(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(function|const|let|var|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/);
    if (decl) names.add(`${scope ? `${scope}:` : ""}${decl[2]}`);
    else if (mod) names.add(`module:${mod[1]}`);
  }
  return [...names].sort();
}

const LINK = /\]\((\/[^)\s#?]*|\.{1,2}\/[^)\s#?]*)(?:[#?][^)\s]*)?\)/g;

/**
 * Frontmatter, title and internal links of one docs file. `exists` answers for a docs URL path
 * (a page or a redirect). A root-relative link is a docs link when its first segment is one of the
 * docs `sections`; anything else (`/careers`, an old URL space) is a route of the site, not of the
 * docs tree, and is left to the sitemap coverage.
 */
export function checkDoc(path: string, text: string, exists: (urlPath: string) => boolean, docsPrefix: string, sections?: Set<string>): DocIssue[] {
  const issues: DocIssue[] = [];
  if (path.endsWith(".mdx")) {
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fm) {
      try {
        const data = Bun.YAML.parse(fm[1]!) as Record<string, unknown> | null;
        if (!data || typeof data.title !== "string" || !data.title.trim()) issues.push({ path, line: 1, kind: "title", detail: "frontmatter has no title" });
      } catch (err) {
        issues.push({ path, line: 1, kind: "frontmatter", detail: err instanceof Error ? err.message.split("\n")[0]! : String(err) });
      }
    }
  }
  const dir = path.slice("docs/".length).split("/").slice(0, -1);
  let fence = false;
  text.split("\n").forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) return;
    for (const m of line.matchAll(LINK)) {
      let target = m[1]!;
      if (!target.startsWith("/")) target = new URL(target, `http://x/${dir.join("/")}/`).pathname;
      else if (target.startsWith(`${docsPrefix}/`)) target = target.slice(docsPrefix.length);
      else if (target === docsPrefix) target = "/";
      if (/\.[a-z0-9]{2,5}$/i.test(target) && !/\.mdx?$/.test(target)) continue; // images, files
      target = target.replace(/\.mdx?$/, "").replace(/\/$/, "") || "/";
      if (sections && target !== "/" && !sections.has(target.split("/")[1]!)) continue;
      if (!exists(target)) issues.push({ path, line: i + 1, kind: "link", detail: m[1]! });
    }
  });
  return issues;
}

/** URL path (without the docs prefix) of a docs file: docs/runtime/sql.mdx -> /runtime/sql. */
export const docPath = (file: string): string => `/${file.slice("docs/".length).replace(/\.mdx?$/, "").replace(/(^|\/)index$/, "")}`.replace(/\/$/, "") || "/";

export async function compare(cfg: Config, opts: { fetch?: boolean } = {}): Promise<Comparison> {
  const isDoc = matcher(cfg.compare.docs);
  const isType = matcher(cfg.compare.types);
  const wanted = (p: string): boolean => isDoc(p) || isType(p);
  const upstream = await resolveUpstream(cfg, opts.fetch);

  // The fork side is the working tree: tracked files plus new ones that are not ignored.
  const listed = await git(cfg.repo, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  const forkFiles = [...new Set(listed.out.split("\0").filter(Boolean))].filter(wanted).sort();
  const forkHashes = new Map<string, string>();
  const forkText = new Map<string, string>();
  for (const path of forkFiles) {
    const file = Bun.file(join(cfg.repo, path));
    if (!(await file.exists())) continue; // deleted in the working tree
    const text = await file.text();
    forkText.set(path, text);
    forkHashes.set(path, sha256(text));
  }

  const diffs: FileDiff[] = [];
  let same = 0;
  let upstreamTypes: string[] = [];
  if (upstream) {
    const theirs = [...(await tree(cfg.repo, upstream.sha))].filter(([p]) => wanted(p));
    const stat = await git(cfg.repo, ["diff", "--numstat", "-z", "--no-renames", upstream.sha, "--", "."]);
    const numstat = new Map<string, [number, number]>();
    for (const entry of stat.out.split("\0")) {
      const [added, removed, path] = entry.split("\t");
      if (path) numstat.set(path, [Number(added) || 0, Number(removed) || 0]);
    }
    const theirPaths = new Set(theirs.map(([p]) => p));
    for (const path of forkHashes.keys()) {
      const [added, removed] = numstat.get(path) ?? [0, 0];
      if (!theirPaths.has(path)) diffs.push({ path, status: "fork-only", added: forkText.get(path)!.split("\n").length, removed: 0 });
      else if (numstat.has(path)) diffs.push({ path, status: "changed", added, removed });
      else same++;
    }
    for (const path of theirPaths) if (!forkHashes.has(path)) diffs.push({ path, status: "upstream-only", added: 0, removed: numstat.get(path)?.[1] ?? 0 });
    const typeNames = new Set<string>();
    for (const [path] of theirs.filter(([p]) => isType(p))) {
      const shown = await git(cfg.repo, ["show", `${upstream.sha}:${path}`]);
      for (const name of declaredNames(shown.out)) typeNames.add(name);
    }
    upstreamTypes = [...typeNames].sort();
  }
  diffs.sort((a, b) => a.path.localeCompare(b.path));

  // Soundness of the fork's docs.
  const pages = new Set<string>();
  for (const path of forkHashes.keys()) if (path.startsWith("docs/") && /\.mdx?$/.test(path)) pages.add(docPath(path));
  // Redirects declared by the docs site count as existing targets.
  const redirects = new Set<string>();
  const nav = forkText.get("docs/docs.json") ?? (await Bun.file(join(cfg.repo, "docs", "docs.json")).text().catch(() => ""));
  if (nav) for (const r of (Bun.JSONC.parse(nav) as { redirects?: { source: string }[] }).redirects ?? []) redirects.add(r.source.replace(/\/$/, "") || "/");
  const sections = new Set([...pages].map((p) => p.split("/")[1]!).filter(Boolean));
  const issues: DocIssue[] = [];
  for (const [path, text] of forkText) {
    if (path.startsWith("docs/") && /\.mdx?$/.test(path)) issues.push(...checkDoc(path, text, (p) => pages.has(p) || redirects.has(p), cfg.compare.docs_prefix, sections));
  }
  const ours = new Set(diffs.filter((d) => d.status !== "upstream-only").map((d) => d.path));
  const forkIssues = upstream ? issues.filter((i) => ours.has(i.path)) : [];

  const forkTypeSet = new Set<string>();
  for (const [path, text] of forkText) if (isType(path)) for (const name of declaredNames(text)) forkTypeSet.add(name);
  const upstreamSet = new Set(upstreamTypes);
  const allowed = new Set(cfg.compare.allow_missing_types);

  const inputs = sha256(JSON.stringify([upstream?.sha ?? null, [...forkHashes].sort(), cfg.compare]));
  return {
    upstream,
    files: { total: forkHashes.size, same, changed: diffs.filter((d) => d.status === "changed").length, forkOnly: diffs.filter((d) => d.status === "fork-only").length, upstreamOnly: diffs.filter((d) => d.status === "upstream-only").length },
    diffs,
    issues,
    forkIssues,
    types: {
      fork: forkTypeSet.size,
      upstream: upstreamSet.size,
      forkOnly: [...forkTypeSet].filter((n) => upstream !== null && !upstreamSet.has(n)).sort(),
      missing: upstreamTypes.filter((n) => !forkTypeSet.has(n) && !allowed.has(n)),
    },
    pages: [...pages].sort(),
    inputs,
  };
}

/** Docs pages against the origin's sitemap: what the site publishes that the fork lacks, and the reverse. */
export function coverage(pages: string[], sitemap: string[], cfg: Config): { published: number; missingInFork: string[]; unpublished: string[] } {
  const prefix = cfg.compare.docs_prefix;
  const site = new Set(sitemap.map((u) => new URL(u).pathname).filter((p) => p === prefix || p.startsWith(`${prefix}/`)).map((p) => p.slice(prefix.length) || "/"));
  const mine = new Set(pages);
  return { published: site.size, missingInFork: [...site].filter((p) => !mine.has(p)).sort(), unpublished: [...mine].filter((p) => !site.has(p)).sort() };
}
