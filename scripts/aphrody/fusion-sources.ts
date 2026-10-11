#!/usr/bin/env bun
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";

export const FUSION_REFS = ["HEAD", "bun-os/main", "origin/main", "upstream/main"] as const;
export type GitResult = { exitCode: number; stdout: string; stderr: string };
export type GitReader = (args: string[]) => GitResult;
export type SourceRef = {
  ref: string;
  state: "available" | "unavailable";
  sha: string | null;
  comparison: { state: "available" | "unavailable"; mergeBase: string | null;
    ahead: number | null; behind: number | null; reason?: string };
  reason?: string;
};
export type SourceLedger = {
  path: string; state: "available" | "unavailable"; sha256: string | null;
  sourceRepository: string | null; sourceCommit: string | null;
  sourceCommitInObjectStore: boolean | null; files: number | null;
  originalBytes: number | null; originalHashEntries: number | null; reason?: string;
};
export type MergePreview = {
  state: "clean" | "conflicted" | "unavailable";
  head: string | null; upstream: string | null; tree: string | null;
  conflicts: string[]; reason?: string;
};
export type FusionSourcePlan = {
  schema: "bun.fusion-source-plan/1";
  root: string; observedAt: string; shallow: boolean | null;
  refs: SourceRef[]; remotes: Array<{ name: string; state: "available" | "unavailable"; url: string | null }>;
  provenance: SourceLedger[]; upstreamMerge: MergePreview;
  policy: { fetch: false; checkout: false; merge: false; stage: false; push: false;
    gitObjectWrites: "merge-tree-may-write-unreferenced-tree-objects" };
};
const validSha = (value: string) => /^[a-f0-9]{40,64}$/.test(value);
const unavailableComparison = (reason: string): SourceRef["comparison"] =>
  ({ state: "unavailable", mergeBase: null, ahead: null, behind: null, reason });

function nativeGit(root: string): GitReader {
  return (args) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe", windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" } });
    return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  };
}

/** Never serialize credential-bearing remote configuration. */
export function redactRemoteUrl(value: string): string | null {
  const input = value.trim();
  try {
    const url = new URL(input);
    if (!["https:", "http:", "ssh:", "git:"].includes(url.protocol)) return null;
    url.username = ""; url.password = ""; url.search = ""; url.hash = "";
    return url.toString();
  } catch {
    // scp-style SSH remotes: the login is not needed in a source receipt.
    const match = /^(?:[^\s@]+@)?([A-Za-z0-9.-]+):([A-Za-z0-9._/-]+)$/.exec(input);
    return match ? `ssh://${match[1]}/${match[2]}` : null;
  }
}

export function parseMergePreview(result: GitResult, head: string, upstream: string): MergePreview {
  if (result.exitCode !== 0 && result.exitCode !== 1)
    return { state: "unavailable", head, upstream, tree: null, conflicts: [], reason: "git merge-tree could not compute the preview" };
  const fields = result.stdout.split("\0");
  const tree = fields.shift()?.trim() ?? "";
  if (!validSha(tree))
    return { state: "unavailable", head, upstream, tree: null, conflicts: [], reason: "Invalid merge-tree output" };
  const paths: string[] = [];
  for (const field of fields) {
    if (!field) break;
    paths.push(field);
  }
  return { state: result.exitCode === 0 ? "clean" : "conflicted", head, upstream, tree,
    conflicts: [...new Set(paths)].sort() };
}

async function readLedger(root: string, path: string, git: GitReader): Promise<SourceLedger> {
  const absent: SourceLedger = { path, state: "unavailable", sha256: null, sourceRepository: null,
    sourceCommit: null, sourceCommitInObjectStore: null, files: null, originalBytes: null, originalHashEntries: null };
  try {
    const file = Bun.file(join(root, path));
    if (!await file.exists()) return { ...absent, reason: "Migration ledger not present" };
    if (file.size > 2 * 1024 * 1024) return { ...absent, reason: "Migration ledger exceeds the 2 MiB planning budget" };
    const bytes = await file.bytes();
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const commit = data.sourceCommit ?? data.sourceRevision;
    if (!validSha(commit ?? "") || !Array.isArray(data.files))
      return { ...absent, reason: "Migration ledger requires an exact original source commit and file array" };
    const hashes = data.files.filter((entry: { sha256?: unknown }) => typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/.test(entry.sha256));
    const sizes = data.files.map((entry: { bytes?: unknown }) => entry.bytes);
    return { path, state: "available", sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
      sourceRepository: typeof data.sourceRepository === "string" ? redactRemoteUrl(data.sourceRepository) : null,
      sourceCommit: commit, sourceCommitInObjectStore: git(["cat-file", "-e", `${commit}^{commit}`]).exitCode === 0,
      files: data.files.length, originalBytes: sizes.every((n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)
        ? sizes.reduce((total: number, n: number) => total + n, 0) : null,
      originalHashEntries: hashes.length };
  } catch {
    return { ...absent, reason: "Migration ledger could not be read or parsed" };
  }
}

/** Plan against existing object/ref state only; no network synchronization or worktree changes. */
export async function collectFusionSources(root: string, options: { git?: GitReader } = {}): Promise<FusionSourcePlan> {
  const absolute = resolve(root);
  const git = options.git ?? nativeGit(absolute);
  const probe = git(["rev-parse", "--is-shallow-repository"]);
  const shallow = probe.exitCode === 0 ? probe.stdout.trim() === "true" : null;
  const resolved = FUSION_REFS.map((ref) => {
    const result = git(["rev-parse", "--verify", `${ref}^{commit}`]);
    const sha = result.stdout.trim();
    return { ref, sha: result.exitCode === 0 && validSha(sha) ? sha : null };
  });
  const head = resolved[0]!.sha;
  const refs: SourceRef[] = resolved.map(({ ref, sha }) => {
    if (!sha) return { ref, state: "unavailable", sha: null, reason: "Existing ref is missing or does not resolve to a commit",
      comparison: unavailableComparison("Missing reference") };
    if (!head || shallow !== false) return { ref, state: "available", sha,
      comparison: unavailableComparison(shallow === true ? "Shallow history cannot prove full ancestry/counts" : "Repository or HEAD unavailable") };
    const base = git(["merge-base", head, sha]);
    const counts = git(["rev-list", "--left-right", "--count", `${head}...${sha}`]);
    const match = /^(\d+)\s+(\d+)$/.exec(counts.stdout.trim());
    const baseSha = base.stdout.trim();
    if (base.exitCode !== 0 || !validSha(baseSha) || counts.exitCode !== 0 || !match)
      return { ref, state: "available", sha, comparison: unavailableComparison("Ancestry unavailable or histories unrelated") };
    return { ref, state: "available", sha, comparison: { state: "available", mergeBase: baseSha,
      ahead: Number(match[1]), behind: Number(match[2]) } };
  });
  const upstream = refs.find((ref) => ref.ref === "upstream/main")!;
  let upstreamMerge: MergePreview = { state: "unavailable", head, upstream: upstream.sha, tree: null, conflicts: [],
    reason: shallow === true ? "Shallow history: preview unavailable" : "HEAD/upstream ancestry unavailable" };
  if (head && upstream.sha && upstream.comparison.state === "available") {
    const result = git(["merge-tree", "--write-tree", "--name-only", "--no-messages", "-z", head, upstream.sha]);
    upstreamMerge = parseMergePreview(result, head, upstream.sha);
  }
  const remotes = ["bun-os", "origin", "upstream"].map((name) => {
    const result = git(["remote", "get-url", name]);
    const url = result.exitCode === 0 ? redactRemoteUrl(result.stdout) : null;
    return { name, state: url ? "available" as const : "unavailable" as const, url };
  });
  const provenance = await Promise.all(["src/browser/MIGRATION.json", "src/browser/BROWSER-MIGRATION.json"]
    .map((path) => readLedger(absolute, path, git)));
  return { schema: "bun.fusion-source-plan/1", root: absolute, observedAt: new Date().toISOString(), shallow,
    refs, remotes, provenance, upstreamMerge,
    policy: { fetch: false, checkout: false, merge: false, stage: false, push: false,
      gitObjectWrites: "merge-tree-may-write-unreferenced-tree-objects" } };
}

export const OFFICIAL_RESEARCH_HOSTS = ["bun.sh", "bun.com", "docs.deno.com", "v8.dev", "webkit.org", "docs.webkit.org"] as const;
export type ResearchSummary = { url: string; title: string; headings: Array<{ level: number; text: string }>;
  links: Array<{ url: string; text: string }>; truncated: boolean; bytesRead: number };

/** Extract navigation metadata only, using native HTMLRewriter. Never evaluate document scripts. */
export async function summarizeOfficialHtml(url: string, html: string): Promise<ResearchSummary> {
  const base = new URL(url);
  if (base.protocol !== "https:" || base.username || base.password ||
    !OFFICIAL_RESEARCH_HOSTS.some((host) => host === base.hostname)) throw new Error("Official HTTPS research source required");
  const bytes = new TextEncoder().encode(html);
  const limit = 512 * 1024;
  const bounded = new TextDecoder().decode(bytes.subarray(0, limit));
  const clean = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 200);
  let title = "";
  let suppressed = 0;
  const headings: ResearchSummary["headings"] = [];
  const links: ResearchSummary["links"] = [];
  let heading: ResearchSummary["headings"][number] | null = null;
  let link: ResearchSummary["links"][number] | null = null;
  const rewriter = new HTMLRewriter()
    .on("script, style, template", { element(element) {
      suppressed++; element.remove(); element.onEndTag(() => { suppressed--; });
    } })
    .on("title", { text(text) { if (!suppressed) title = (title + text.text).slice(0, 400); } })
    .on("h1, h2, h3", { element(element) {
      if (headings.length >= 24) { heading = null; return; }
      heading = { level: Number(element.tagName.slice(1)), text: "" }; headings.push(heading);
      element.onEndTag(() => { heading = null; });
    }, text(text) { if (heading && !suppressed) heading.text = (heading.text + text.text).slice(0, 400); } })
    .on("a[href]", { element(element) {
      link = null;
      if (links.length >= 32) return;
      try {
        const parsed = new URL(element.getAttribute("href") ?? "", base);
        if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
          !OFFICIAL_RESEARCH_HOSTS.some((host) => host === parsed.hostname)) return;
        if (links.some((entry) => entry.url === parsed.href)) return;
        link = { url: parsed.href, text: "" }; links.push(link);
        element.onEndTag(() => { link = null; });
      } catch { /* malformed links do not affect source planning */ }
    }, text(text) { if (link && !suppressed) link.text = (link.text + text.text).slice(0, 400); } });
  await rewriter.transform(new Response(bounded)).text();
  return { url: base.href, title: clean(title), headings: headings.map((entry) => ({ ...entry, text: clean(entry.text) })),
    links: links.map((entry) => ({ ...entry, text: clean(entry.text) })), truncated: bytes.length > limit,
    bytesRead: Math.min(bytes.length, limit) };
}

if (import.meta.main) {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { root: { type: "string" }, help: { type: "boolean" } }, strict: true });
  if (values.help) console.log("bun scripts/aphrody/fusion-sources.ts --root PATH\nPlans existing refs/provenance and upstream conflicts. No fetch or worktree mutation.");
  else console.log(JSON.stringify(await collectFusionSources(values.root ?? process.cwd()), null, 2));
}
