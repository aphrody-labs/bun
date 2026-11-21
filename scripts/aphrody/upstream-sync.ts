#!/usr/bin/env bun
/**
 * upstream-sync: keeps the fork (aphrody-labs/bun) current with its upstream (oven-sh/bun).
 *
 * One run, on the build host, inside its own scratch clone (~/ci/bun-upstream/clone):
 *   a. merge upstream main into our main ("Merge oven-sh/bun main (<sha>) into the fork");
 *   b. enumerate every open upstream PR (GraphQL, 50 per page), rank the candidates (non-draft,
 *      mergeable, head CI green), merge up to --max-prs of them one at a time behind the gates
 *      (conflict, cargo check of the touched crates, the PR's own .test.ts files), then run the
 *      smoke suite once for the batch; a red batch drops its last PR until it is green;
 *   c. list the open issues labelled confirmed bug / regression / crash that no PR links;
 *   d. mirror every discussion into aphrody/upstream-discussions.jsonl and flag the untracked ones;
 *   e. write aphrody/upstream-ledger.json, commit it with the discussions file, push once.
 *
 * Usage:
 *   bun scripts/aphrody/upstream-sync.ts [run] [--max-prs N] [--dry-run] [--no-build]
 *                                        [--full-discussions] [--home DIR] [--out DIR]
 *   bun scripts/aphrody/upstream-sync.ts install [--dry-run]
 *
 *   --dry-run   enumeration only: no clone, no merge, no push; ledger and discussions go to --out
 *               (default: a fresh temp directory)
 *   --no-build  skip the cargo/bun gates: candidates are only probed for conflicts, nothing is
 *               merged into main, only the ledger and discussions are committed and pushed
 *
 * Operations:
 *   systemd user unit  bun-upstream-sync.service, fired every 3 hours by bun-upstream-sync.timer
 *                      (Persistent=true); `install` copies scripts/aphrody/systemd/* to
 *                      ~/.config/systemd/user and runs `systemctl --user enable --now`
 *   logs               journalctl --user -u bun-upstream-sync, and ~/ci/bun-upstream/log/upstream-sync-<date>.log
 *   report             ~/ci/bun-upstream/report-<timestamp>.md (one per run)
 *   lock               ~/ci/bun-upstream/lock (pid file; a stale pid is taken over)
 *   exit codes         0 ok, 1 failure, 2 upstream main conflicts with ours (nothing pushed),
 *                      3 gate red or push failed (nothing pushed), 4 another run holds the lock
 */
import {
  appendFileSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------------------------
// Types

export type PrState =
  | "merged"
  | "conflict"
  | "red"
  | "waiting-ci"
  | "draft"
  | "not-mergeable"
  | "skipped-this-run"
  | "carried"
  | "upstream-merged"
  | "upstream-closed";
export type IssueState = "unfixed" | "covered" | "closed";
export type DiscussionState = "untracked" | "tracked";
/** The gate that stopped a PR, or "ok". */
export type GateName = "ok" | "conflict" | "cargo-check" | "pr-tests" | "smoke";

export interface LedgerEntry {
  number: number;
  kind: "pr" | "issue" | "discussion";
  state: string;
  title?: string;
  /** PR: the head commit last tried (or last seen). */
  headSha?: string;
  /** PR: the gate outcome of the last attempt; absent when never attempted. */
  result?: GateName;
  reason?: string;
  /** PR: our merge commit on main. */
  ourCommit?: string;
  updatedAt?: string;
  attemptedAt?: string;
  priority?: string;
  areas?: string[];
  labels?: string[];
  fileCount?: number;
  linkedPrs?: number[];
}

export interface Ledger {
  generatedAt: string;
  upstreamMainSha: string;
  ourMainSha: string;
  counts: Record<string, Record<string, number>>;
  entries: Record<string, LedgerEntry>;
}

export interface LivePr {
  number: number;
  title: string;
  isDraft: boolean;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  headSha: string;
  reviewDecision: string | null;
  labels: string[];
  updatedAt: string;
  baseRef: string;
  /** state of the status check rollup of the head commit; null when the commit has no checks */
  ci: string | null;
}

export type Gql = (query: string, variables?: Record<string, unknown>) => Promise<any>;
export interface GateResult {
  ok: boolean;
  tail: string;
}

// ---------------------------------------------------------------------------------------------
// Ranking

export const PRIORITY_LABELS = ["confirmed bug", "regression", "crash", "performance", "windows"];
export const ISSUE_LABELS = ["confirmed bug", "regression", "crash"];

/** Areas the fork uses, judged from labels and from changed paths. */
export const AREAS: Record<string, { labels: string[]; paths: RegExp }> = {
  image: { labels: [], paths: /^(src\/(runtime\/image|image|jpeg|png|webp)|test\/js\/bun\/image)\// },
  cli: { labels: ["cli"], paths: /^(src\/(runtime\/cli|cli)|test\/cli)\// },
  install: { labels: ["bun install"], paths: /^(src\/install|test\/cli\/install)/ },
  serve: { labels: ["bun:serve"], paths: /^(src\/(runtime\/server|http|uws)|test\/js\/bun\/http)/ },
  shell: { labels: ["shell"], paths: /^(src\/(runtime\/shell|shell_parser)|test\/js\/bun\/shell)/ },
  sqlite: { labels: ["bun:sqlite"], paths: /^(src\/sql|test\/js\/bun\/sqlite)|sqlite/i },
  bundler: { labels: ["bundler"], paths: /^(src\/(bundler|js_parser|js_printer)|test\/bundler)/ },
  windows: { labels: ["windows"], paths: /^src\/(windows|libuv_sys|sys\/windows)|\.ps1$|\/windows\//i },
};

export function areasFor(labels: string[], paths: string[]): string[] {
  return Object.entries(AREAS)
    .filter(
      ([, rule]) => rule.labels.some(label => labels.includes(label)) || paths.some(path => rule.paths.test(path)),
    )
    .map(([name]) => name);
}

export interface Rankable {
  number: number;
  reviewDecision: string | null;
  labels: string[];
  areas: string[];
  fileCount: number;
}

export function priorityOf(pr: Pick<Rankable, "reviewDecision" | "labels" | "areas">): {
  tier: 0 | 1 | 2 | 3;
  signals: string[];
} {
  const approved = pr.reviewDecision === "APPROVED";
  const labels = pr.labels.filter(label => PRIORITY_LABELS.includes(label));
  const signals = [
    ...(approved ? ["approved"] : []),
    ...labels.map(label => `label:${label}`),
    ...pr.areas.map(area => `area:${area}`),
  ];
  const tier = approved ? 0 : labels.length ? 1 : pr.areas.length ? 2 : 3;
  return { tier, signals };
}

/** Approved, then priority labels, then our areas, then the rest; ties: more signals, fewer files, lower number. */
export function rankCandidates<T extends Rankable>(items: T[]): Array<T & { tier: number; signals: string[] }> {
  return items
    .map(item => ({ ...item, ...priorityOf(item) }))
    .sort(
      (a, b) =>
        a.tier - b.tier || b.signals.length - a.signals.length || a.fileCount - b.fileCount || a.number - b.number,
    );
}

// ---------------------------------------------------------------------------------------------
// State decisions and ledger reconcile

export function classifyLive(pr: LivePr, baseBranch: string): { state: PrState | "candidate"; reason: string } {
  if (pr.isDraft) return { state: "draft", reason: "draft upstream" };
  if (pr.baseRef !== baseBranch) return { state: "not-mergeable", reason: `base branch is ${pr.baseRef}` };
  if (pr.mergeable === "CONFLICTING") return { state: "not-mergeable", reason: "conflicts with upstream main" };
  if (pr.mergeable !== "MERGEABLE")
    return { state: "not-mergeable", reason: "mergeability not computed by GitHub yet" };
  if (pr.ci === "FAILURE" || pr.ci === "ERROR") return { state: "red", reason: `upstream CI ${pr.ci}` };
  if (pr.ci !== "SUCCESS") return { state: "waiting-ci", reason: pr.ci ? `upstream CI ${pr.ci}` : "no checks on head" };
  return { state: "candidate", reason: "" };
}

export type Decision = { action: "process" } | { action: "keep"; state: PrState; reason: string; keepAttempt: boolean };

const isOurs = (entry?: LedgerEntry) =>
  !!entry && (entry.state === "merged" || entry.state === "carried") && !!entry.ourCommit;
const short = (sha?: string) => (sha ?? "").slice(0, 11);

/** What to do with a live PR given the ledger: keep, or process (new PR, new head, or a retriable state). */
export function decide(prior: LedgerEntry | undefined, live: LivePr, cls: ReturnType<typeof classifyLive>): Decision {
  if (isOurs(prior) && prior!.headSha === live.headSha) {
    return { action: "keep", state: "carried", reason: "merged into main; head unchanged", keepAttempt: true };
  }
  if (cls.state !== "candidate") {
    if (isOurs(prior)) {
      return {
        action: "keep",
        state: "carried",
        reason: `head moved to ${short(live.headSha)}, now ${cls.state}: ${cls.reason}`,
        keepAttempt: true,
      };
    }
    return { action: "keep", state: cls.state, reason: cls.reason, keepAttempt: false };
  }
  const failed =
    prior && (prior.state === "conflict" || prior.state === "red") && prior.result && prior.result !== "ok";
  if (failed && prior!.headSha === live.headSha) {
    return { action: "keep", state: prior!.state as PrState, reason: prior!.reason ?? "", keepAttempt: true };
  }
  return { action: "process" };
}

export interface ClosedLookup {
  state: "MERGED" | "CLOSED" | "OPEN";
  mergeCommit?: string | null;
}

/**
 * PRs we carried that are no longer open: upstream merged them (our merge commit is a duplicate the
 * main merge absorbs) or closed them unmerged (ours stays). Everything else not open is dropped.
 */
export function reconcileClosed(
  prior: Record<string, LedgerEntry>,
  openNumbers: Set<number>,
  lookup: Map<number, ClosedLookup>,
): Record<string, LedgerEntry> {
  const out: Record<string, LedgerEntry> = {};
  for (const [key, entry] of Object.entries(prior)) {
    if (entry.kind !== "pr" || openNumbers.has(entry.number)) continue;
    if (entry.state === "upstream-merged" || entry.state === "upstream-closed") {
      out[key] = entry;
    } else if (isOurs(entry)) {
      const found = lookup.get(entry.number);
      if (found?.state === "MERGED") {
        out[key] = {
          ...entry,
          state: "upstream-merged",
          reason: `merged upstream${found.mergeCommit ? ` as ${short(found.mergeCommit)}` : ""}; our merge commit ${short(entry.ourCommit)} is a duplicate absorbed by the main merge`,
        };
      } else if (found?.state === "CLOSED") {
        out[key] = {
          ...entry,
          state: "upstream-closed",
          reason: `closed unmerged upstream; our merge commit ${short(entry.ourCommit)} stays`,
        };
      } else {
        out[key] = { ...entry, state: "carried" };
      }
    }
  }
  return out;
}

export function countStates(entries: Record<string, LedgerEntry>): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = { pr: {}, issue: {}, discussion: {} };
  for (const entry of Object.values(entries)) {
    const bucket = counts[entry.kind]!;
    bucket[entry.state] = (bucket[entry.state] ?? 0) + 1;
  }
  return counts;
}

export function formatCounts(counts: Ledger["counts"]): string {
  return Object.values(counts)
    .flatMap(states => Object.entries(states).sort(([a], [b]) => a.localeCompare(b)))
    .map(([state, n]) => `${state} ${n}`)
    .join(", ");
}

const KEY_RE = /^(pr|issue|discussion):(\d+)$/;

/** One entry per line keeps the committed file diffable. */
export function serializeLedger(ledger: Ledger): string {
  const keys = Object.keys(ledger.entries).sort((a, b) => {
    const [ka, na] = a.split(":") as [string, string];
    const [kb, nb] = b.split(":") as [string, string];
    return ka.localeCompare(kb) || Number(na) - Number(nb);
  });
  const head = [
    `"generatedAt":${JSON.stringify(ledger.generatedAt)}`,
    `"upstreamMainSha":${JSON.stringify(ledger.upstreamMainSha)}`,
    `"ourMainSha":${JSON.stringify(ledger.ourMainSha)}`,
    `"counts":${JSON.stringify(ledger.counts)}`,
  ];
  const lines = [...head, ...keys.map(key => `${JSON.stringify(key)}:${JSON.stringify(ledger.entries[key])}`)];
  return `{\n${lines.join(",\n")}\n}\n`;
}

export function parseLedger(text: string): Ledger {
  const raw = JSON.parse(text) as Record<string, any>;
  const entries: Record<string, LedgerEntry> = {};
  for (const [key, value] of Object.entries(raw)) if (KEY_RE.test(key)) entries[key] = value;
  return {
    generatedAt: raw.generatedAt ?? "",
    upstreamMainSha: raw.upstreamMainSha ?? "",
    ourMainSha: raw.ourMainSha ?? "",
    counts: raw.counts ?? {},
    entries,
  };
}

// ---------------------------------------------------------------------------------------------
// Discussions

export interface DiscussionRecord {
  /** schema version of this line */
  v: 1;
  number: number;
  title: string;
  url: string;
  category: string;
  author: string | null;
  createdAt: string;
  updatedAt: string;
  body: string;
  answer: { author: string | null; body: string } | null;
  /** numbers the text points at: from issue/pull URLs, and bare #N outside code fences */
  linked: { issues: number[]; pulls: number[]; bare: number[] };
  untracked: boolean;
  /** why it is untracked: patch, workaround and/or bug-report; null when tracked */
  reason: string | null;
}

const BODY_CAP = 60_000;

export function parseRefs(text: string, slug: string): DiscussionRecord["linked"] {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const urlRe = new RegExp(`github\\.com/${escaped}/(issues|pull)/(\\d+)`, "gi");
  const issues = new Set<number>();
  const pulls = new Set<number>();
  for (const match of text.matchAll(urlRe)) (match[1]!.toLowerCase() === "pull" ? pulls : issues).add(Number(match[2]));
  const bare = new Set<number>();
  const prose = text.replace(/```[\s\S]*?```/g, " ");
  for (const match of prose.matchAll(/(?<![\w&/#])#(\d{1,5})(?!\w)/g)) bare.add(Number(match[1]));
  const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);
  return { issues: sorted(issues), pulls: sorted(pulls), bare: sorted(bare) };
}

const PATCH_FENCE = /```\s*(diff|patch)\b|^diff --git |^@@ -\d+(,\d+)? \+\d+|^--- a\/|^\+\+\+ b\//m;
const PROPOSED_CHANGE =
  /\b(proposed (fix|change|patch)|here'?s (a|the|my) (fix|patch|change)|you (can|could|should) (change|patch|replace)|(change|replace) .{1,80} (with|to) )/i;
const WORKAROUND = /\bwork-?\s?around\b/i;
const REPRO = /\b(steps to reproduce|reproduc(e|tion)|expected (behaviou?r|result)|actual (behaviou?r|result))\b/i;
const FAULT = /\b(bug|crash(es|ed|ing)?|segfault|panic(s|ked)?|regression|broken|does(n'?t| not) work|stack trace)\b/i;
const BUG_CATEGORIES = new Set(["General", "Q&A"]);
/** Maintainer announcements (release notes) are not user proposals. */
const SKIPPED_CATEGORIES = new Set(["Announcements", "Polls"]);

/** Heuristic: a patch, a workaround or a bug report that cites no issue/PR number is not tracked anywhere. */
export function classifyDiscussion(
  input: { title: string; body: string; category: string; answerBody?: string | null },
  linked: DiscussionRecord["linked"],
): { untracked: boolean; reason: string | null } {
  if (SKIPPED_CATEGORIES.has(input.category)) return { untracked: false, reason: null };
  const text = `${input.body}\n${input.answerBody ?? ""}`;
  const head = `${input.title}\n${input.body}`;
  const reasons: string[] = [];
  const fenced = text.includes("```");
  if (PATCH_FENCE.test(text) || (fenced && PROPOSED_CHANGE.test(text))) reasons.push("patch");
  if (WORKAROUND.test(text)) reasons.push("workaround");
  if (BUG_CATEGORIES.has(input.category) && FAULT.test(head) && (REPRO.test(head) || fenced))
    reasons.push("bug-report");
  const referenced = linked.issues.length + linked.pulls.length + linked.bare.length > 0;
  return reasons.length && !referenced
    ? { untracked: true, reason: reasons.join(", ") }
    : { untracked: false, reason: null };
}

export function toDiscussionRecord(node: any, slug: string): DiscussionRecord {
  const body: string = String(node.body ?? "").slice(0, BODY_CAP);
  const answerBody: string | null = node.answer ? String(node.answer.body ?? "").slice(0, BODY_CAP) : null;
  const linked = parseRefs(`${node.title}\n${body}\n${answerBody ?? ""}`, slug);
  const category = node.category?.name ?? "";
  const verdict = classifyDiscussion({ title: node.title, body, category, answerBody }, linked);
  return {
    v: 1,
    number: node.number,
    title: node.title,
    url: node.url,
    category,
    author: node.author?.login ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    body,
    answer: node.answer ? { author: node.answer.author?.login ?? null, body: answerBody ?? "" } : null,
    linked,
    untracked: verdict.untracked,
    reason: verdict.reason,
  };
}

export function serializeDiscussions(records: Iterable<DiscussionRecord>): string {
  const sorted = [...records].sort((a, b) => a.number - b.number);
  return sorted.map(record => JSON.stringify(record)).join("\n") + "\n";
}

export function parseDiscussions(text: string): Map<number, DiscussionRecord> {
  const out = new Map<number, DiscussionRecord>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as DiscussionRecord;
    out.set(record.number, record);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// GraphQL: transport with backoff, paging, enumerations

const RL = "rateLimit{cost remaining resetAt}";
export const usage = { queries: 0, cost: 0 };

export type Exec = (input: string) => Promise<{ code: number; out: string; err: string }>;

const TRANSIENT =
  /rate limit|abuse|secondary|50[0-9]|timeout|timed out|EOF|reset by peer|temporar|connection|try again/i;

/** `gh api graphql` with retries: exponential backoff on transient errors, sleep to reset when the budget is spent. */
export function createGql(
  exec: Exec,
  sleep: (ms: number) => Promise<void> = ms => Bun.sleep(ms),
  log: (line: string) => void = () => {},
): Gql {
  return async (query, variables = {}) => {
    for (let attempt = 0; ; attempt++) {
      const result = await exec(JSON.stringify({ query, variables }));
      let json: any = null;
      try {
        json = JSON.parse(result.out);
      } catch {}
      const errors: any[] = json?.errors ?? [];
      const fatal = errors.filter(error => error.type !== "NOT_FOUND");
      if (json?.data && fatal.length === 0) {
        usage.queries++;
        const limit = json.data.rateLimit;
        if (limit) {
          usage.cost += limit.cost ?? 0;
          if (limit.remaining < 50) {
            const wait = Math.max(0, Date.parse(limit.resetAt) - Date.now()) + 2000;
            log(`rate budget low (${limit.remaining}); sleeping ${Math.round(wait / 1000)}s`);
            await sleep(wait);
          }
        }
        return json.data;
      }
      const message =
        `${errors.map(error => error.message).join("; ")} ${result.err} ${json ? "" : result.out.slice(0, 300)}`.trim();
      if (attempt >= 7 || !TRANSIENT.test(message)) throw new Error(`graphql failed: ${message}`);
      const wait = Math.min(300, 5 * 2 ** attempt) * 1000;
      log(`graphql transient error (${message.slice(0, 120)}); retry ${attempt + 1} in ${wait / 1000}s`);
      await sleep(wait);
    }
  };
}

export const ghExec: Exec = async input => {
  const proc = Bun.spawn(["gh", "api", "graphql", "--input", "-"], {
    stdin: Buffer.from(input),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err };
};

interface Page<N> {
  nodes: N[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

/** Walks a connection; `onPage` may return false to stop early. */
export async function paginate<N>(
  gql: Gql,
  query: string,
  variables: Record<string, unknown>,
  pick: (data: any) => Page<N>,
  onPage?: (nodes: N[], all: N[]) => boolean | void,
): Promise<N[]> {
  const all: N[] = [];
  let after: string | null = null;
  for (;;) {
    const page: Page<N> = pick(await gql(query, { ...variables, after }));
    all.push(...page.nodes);
    if (onPage?.(page.nodes, all) === false || !page.pageInfo.hasNextPage) return all;
    after = page.pageInfo.endCursor;
  }
}

export interface Repos {
  ours: { owner: string; name: string };
  upstream: { owner: string; name: string };
  baseBranch: string;
  oursBranch: string;
}

const repoVars = (repos: Repos) => ({ owner: repos.upstream.owner, name: repos.upstream.name });

const PR_QUERY = `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){pullRequests(states:OPEN,first:50,after:$after,orderBy:{field:CREATED_AT,direction:ASC}){totalCount pageInfo{hasNextPage endCursor} nodes{number title isDraft mergeable headRefOid reviewDecision updatedAt baseRefName labels(first:30){nodes{name}} commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}} ${RL}}`;

export function toLivePr(node: any): LivePr {
  return {
    number: node.number,
    title: node.title,
    isDraft: node.isDraft,
    mergeable: node.mergeable,
    headSha: node.headRefOid,
    reviewDecision: node.reviewDecision ?? null,
    labels: (node.labels?.nodes ?? []).map((label: any) => label.name),
    updatedAt: node.updatedAt,
    baseRef: node.baseRefName,
    ci: node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null,
  };
}

export async function fetchOpenPrs(gql: Gql, repos: Repos, log: (line: string) => void): Promise<LivePr[]> {
  let total = 0;
  const nodes = await paginate<any>(
    gql,
    PR_QUERY,
    repoVars(repos),
    data => {
      total = data.repository.pullRequests.totalCount;
      return data.repository.pullRequests;
    },
    (_, all) => {
      if (all.length % 500 < 50) log(`prs: ${all.length}/${total}`);
    },
  );
  return nodes.map(toLivePr);
}

/** Batches of aliased lookups: one request per `size` numbers. */
async function aliased<T>(
  gql: Gql,
  repos: Repos,
  numbers: number[],
  size: number,
  fields: string,
  map: (node: any) => T,
): Promise<Map<number, T>> {
  const out = new Map<number, T>();
  for (let i = 0; i < numbers.length; i += size) {
    const chunk = numbers.slice(i, i + size);
    const body = chunk.map(n => `p${n}:pullRequest(number:${n}){${fields}}`).join(" ");
    const data = await gql(
      `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){${body}} ${RL}}`,
      repoVars(repos),
    );
    for (const n of chunk) if (data.repository[`p${n}`]) out.set(n, map(data.repository[`p${n}`]));
  }
  return out;
}

/** GitHub computes mergeability lazily: UNKNOWN is re-polled for the PRs that could become candidates. */
export async function refreshUnknown(
  gql: Gql,
  repos: Repos,
  prs: LivePr[],
  sleep: (ms: number) => Promise<void>,
  log: (line: string) => void,
  rounds = 3,
): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    const unknown = prs.filter(
      pr => pr.mergeable === "UNKNOWN" && !pr.isDraft && pr.ci === "SUCCESS" && pr.baseRef === repos.baseBranch,
    );
    if (!unknown.length) return;
    log(`mergeable UNKNOWN on ${unknown.length} green PRs; re-poll ${round + 1}/${rounds}`);
    await sleep(5000);
    const fresh = await aliased(
      gql,
      repos,
      unknown.map(pr => pr.number),
      40,
      "mergeable",
      node => node.mergeable as LivePr["mergeable"],
    );
    for (const pr of unknown) pr.mergeable = fresh.get(pr.number) ?? pr.mergeable;
  }
}

/** Changed paths of the given PRs (paths only; PRs with more than 100 files are paged). */
export async function fetchChangedPaths(gql: Gql, repos: Repos, numbers: number[]): Promise<Map<number, string[]>> {
  const fields = "files(first:100){pageInfo{hasNextPage endCursor} nodes{path}}";
  const first = await aliased(gql, repos, numbers, 25, fields, node => node.files);
  const out = new Map<number, string[]>();
  for (const [number, files] of first) {
    const paths: string[] = files.nodes.map((node: any) => node.path);
    let info = files.pageInfo;
    while (info.hasNextPage) {
      const data = await gql(
        `query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){files(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{path}}}} ${RL}}`,
        { ...repoVars(repos), number, after: info.endCursor },
      );
      const page = data.repository.pullRequest.files;
      paths.push(...page.nodes.map((node: any) => node.path));
      info = page.pageInfo;
    }
    out.set(number, paths);
  }
  return out;
}

export async function fetchClosedLookup(gql: Gql, repos: Repos, numbers: number[]): Promise<Map<number, ClosedLookup>> {
  return aliased(gql, repos, numbers, 40, "state mergeCommit{oid}", node => ({
    state: node.state,
    mergeCommit: node.mergeCommit?.oid ?? null,
  }));
}

const ISSUE_FIELDS = `number title updatedAt closedByPullRequestsReferences(first:5,includeClosedPrs:true){nodes{number state}} timelineItems(first:30,itemTypes:[CROSS_REFERENCED_EVENT,CONNECTED_EVENT]){nodes{__typename ... on CrossReferencedEvent{source{__typename ... on PullRequest{number state}}} ... on ConnectedEvent{subject{__typename ... on PullRequest{number state}}}}}`;

export interface LiveIssue {
  number: number;
  title: string;
  updatedAt: string;
  labels: string[];
  linked: Array<{ number: number; state: string; closes: boolean }>;
}

export function toLiveIssue(node: any, label: string): LiveIssue {
  const linked = new Map<number, { number: number; state: string; closes: boolean }>();
  for (const pr of node.closedByPullRequestsReferences?.nodes ?? []) {
    linked.set(pr.number, { number: pr.number, state: pr.state, closes: true });
  }
  for (const item of node.timelineItems?.nodes ?? []) {
    const pr = item.source ?? item.subject;
    if (pr?.__typename === "PullRequest" && !linked.has(pr.number)) {
      linked.set(pr.number, { number: pr.number, state: pr.state, closes: false });
    }
  }
  return {
    number: node.number,
    title: node.title,
    updatedAt: node.updatedAt,
    labels: [label],
    linked: [...linked.values()],
  };
}

/** `labels:` ANDs its values, so each label is its own listing; the union is deduplicated. */
export async function fetchOpenIssues(
  gql: Gql,
  repos: Repos,
  labels: string[],
  log: (line: string) => void,
): Promise<LiveIssue[]> {
  const query = `query($owner:String!,$name:String!,$label:String!,$after:String){repository(owner:$owner,name:$name){issues(states:OPEN,labels:[$label],first:50,after:$after){totalCount pageInfo{hasNextPage endCursor} nodes{${ISSUE_FIELDS}}}} ${RL}}`;
  const byNumber = new Map<number, LiveIssue>();
  for (const label of labels) {
    const nodes = await paginate<any>(gql, query, { ...repoVars(repos), label }, data => data.repository.issues);
    log(`issues labelled "${label}": ${nodes.length}`);
    for (const node of nodes) {
      const issue = toLiveIssue(node, label);
      const known = byNumber.get(issue.number);
      if (known) known.labels.push(label);
      else byNumber.set(issue.number, issue);
    }
  }
  return [...byNumber.values()];
}

export function issueEntry(issue: LiveIssue): LedgerEntry {
  const open = issue.linked.filter(pr => pr.state === "OPEN");
  const merged = issue.linked.filter(pr => pr.state === "MERGED" && pr.closes);
  const linkedPrs = [...open, ...merged].map(pr => pr.number);
  const base = {
    number: issue.number,
    kind: "issue" as const,
    title: issue.title,
    updatedAt: issue.updatedAt,
    labels: issue.labels,
  };
  const list = (prs: typeof open) => prs.map(pr => `#${pr.number}`).join(", ");
  if (open.length) return { ...base, state: "covered", reason: `open PR ${list(open)} (handled as a PR)`, linkedPrs };
  if (merged.length) {
    return {
      ...base,
      state: "covered",
      reason: `fixed by merged PR ${list(merged)}; the main merge carries it`,
      linkedPrs,
    };
  }
  return { ...base, state: "unfixed", reason: "no linked PR" };
}

/** Issues closed since `since` that a PR closed: the commit merge carries their fix. */
export async function fetchClosedIssues(
  gql: Gql,
  repos: Repos,
  since: string,
  log: (line: string) => void,
): Promise<LedgerEntry[]> {
  const search = `repo:${repos.upstream.owner}/${repos.upstream.name} is:issue is:closed linked:pr closed:>=${since}`;
  const query = `query($q:String!,$after:String){search(query:$q,type:ISSUE,first:50,after:$after){issueCount pageInfo{hasNextPage endCursor} nodes{... on Issue{number title closedAt closedByPullRequestsReferences(first:5,includeClosedPrs:true){nodes{number state}}}}} ${RL}}`;
  const nodes = await paginate<any>(gql, query, { q: search }, data => data.search);
  log(`issues closed since ${since} with a linked PR: ${nodes.length}`);
  return nodes
    .filter(node => node?.number)
    .map(node => {
      const prs: number[] = (node.closedByPullRequestsReferences?.nodes ?? []).map((pr: any) => pr.number);
      return {
        number: node.number,
        kind: "issue" as const,
        state: "closed",
        title: node.title,
        updatedAt: node.closedAt,
        linkedPrs: prs,
        reason: prs.length ? `closed by ${prs.map(n => `#${n}`).join(", ")}; covered by the main merge` : "closed",
      };
    });
}

const DISCUSSION_QUERY = `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){discussions(first:50,after:$after,orderBy:{field:UPDATED_AT,direction:DESC}){totalCount pageInfo{hasNextPage endCursor} nodes{number title body url createdAt updatedAt author{login} category{name} answer{body author{login}}}}} ${RL}}`;

/** Newest-updated first; stops at the first discussion already mirrored unless `full` or the mirror is short. */
export async function fetchDiscussions(
  gql: Gql,
  repos: Repos,
  known: Map<number, DiscussionRecord>,
  full: boolean,
  log: (line: string) => void,
): Promise<Map<number, DiscussionRecord>> {
  const slug = `${repos.upstream.owner}/${repos.upstream.name}`;
  const out = new Map(known);
  let total = Infinity;
  const nodes = await paginate<any>(
    gql,
    DISCUSSION_QUERY,
    repoVars(repos),
    data => {
      total = data.repository.discussions.totalCount;
      return data.repository.discussions;
    },
    (page, all) => {
      if (all.length % 250 < 50) log(`discussions: ${all.length}/${total}`);
      const complete = !full && known.size >= total;
      return !(complete && page.some(node => (known.get(node.number)?.updatedAt ?? "") >= node.updatedAt));
    },
  );
  for (const node of nodes) out.set(node.number, toDiscussionRecord(node, slug));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Crates and the batch

/** Nearest enclosing package of a Rust-side file; `readManifest` returns the Cargo.toml text of a directory or null. */
export function crateNamesFor(files: string[], readManifest: (dir: string) => string | null): string[] {
  const names = new Set<string>();
  for (const file of files) {
    if (!/\.rs$|(^|\/)Cargo\.toml$/.test(file)) continue;
    let dir = dirname(file);
    for (;;) {
      const text = readManifest(dir === "." ? "" : dir);
      const name = text && /^\[package\][^[]*?^name\s*=\s*"([^"]+)"/ms.exec(text)?.[1];
      if (name) {
        names.add(name);
        break;
      }
      if (dir === "." || dir === "") break;
      dir = dirname(dir);
    }
  }
  return [...names].sort();
}

export function isPrTestFile(path: string): boolean {
  return path.startsWith("test/") && path.endsWith(".test.ts");
}

export interface Candidate {
  number: number;
  title: string;
  headSha: string;
}

export interface Outcome {
  number: number;
  headSha: string;
  state: "merged" | "conflict" | "red" | "skipped-this-run";
  result: GateName;
  reason: string;
  ourCommit?: string;
}

export interface RepoOps {
  fetchPr(number: number): Promise<string>;
  head(): Promise<string>;
  mergePr(candidate: Candidate, sha: string): Promise<{ ok: true; commit: string } | { ok: false; reason: string }>;
  changed(since: string): Promise<{ crates: string[]; tests: string[] }>;
  resetTo(sha: string): Promise<void>;
}

export interface Gates {
  cargoCheck(crates: string[]): Promise<GateResult>;
  prTests(files: string[]): Promise<GateResult>;
  smoke(): Promise<GateResult>;
}

export interface BatchResult {
  outcomes: Outcome[];
  smoke: GateResult | null;
  smokeRuns: number;
  /** true when main (as left in the clone) may be pushed */
  pushable: boolean;
}

/**
 * Merges candidates one by one behind the per-PR gates, then smoke-tests the batch once. A red smoke
 * drops the last kept PR (reset to the head before its merge) and retries until green; red with no PR
 * left means the base itself (the upstream merge) is red and nothing may be pushed.
 * `gates === null` only probes conflicts and resets after each PR.
 */
export async function processBatch(args: {
  candidates: Candidate[];
  repo: RepoOps;
  gates: Gates | null;
  baseChanged: boolean;
  log: (line: string) => void;
}): Promise<BatchResult> {
  const { repo, gates, log } = args;
  const outcomes: Outcome[] = [];
  const kept: Array<{ outcome: Outcome; before: string }> = [];

  for (const candidate of args.candidates) {
    const before = await repo.head();
    const sha = await repo.fetchPr(candidate.number);
    const base = { number: candidate.number, headSha: sha };
    const fail = async (state: "conflict" | "red", result: GateName, reason: string) => {
      await repo.resetTo(before);
      outcomes.push({ ...base, state, result, reason });
      log(`#${candidate.number} ${state} (${result}): ${reason.split("\n")[0]}`);
    };
    const merged = await repo.mergePr({ ...candidate, headSha: sha }, sha);
    if (!merged.ok) {
      await fail("conflict", "conflict", merged.reason);
      continue;
    }
    if (!gates) {
      await repo.resetTo(before);
      outcomes.push({
        ...base,
        state: "skipped-this-run",
        result: "ok",
        reason: "merges cleanly; gates skipped (--no-build)",
      });
      continue;
    }
    const changed = await repo.changed(before);
    const cargo = changed.crates.length ? await gates.cargoCheck(changed.crates) : { ok: true, tail: "" };
    if (!cargo.ok) {
      await fail("red", "cargo-check", `cargo check -p ${changed.crates.join(" -p ")}\n${cargo.tail}`);
      continue;
    }
    const tests = changed.tests.length ? await gates.prTests(changed.tests) : { ok: true, tail: "" };
    if (!tests.ok) {
      await fail("red", "pr-tests", `bun bd test ${changed.tests.join(" ")}\n${tests.tail}`);
      continue;
    }
    const outcome: Outcome = {
      ...base,
      state: "merged",
      result: "ok",
      reason: "all gates green",
      ourCommit: merged.commit,
    };
    outcomes.push(outcome);
    kept.push({ outcome, before });
    log(`#${candidate.number} merged as ${short(merged.commit)}`);
  }

  if (!gates || (kept.length === 0 && !args.baseChanged))
    return { outcomes, smoke: null, smokeRuns: 0, pushable: true };

  let smoke = await gates.smoke();
  let smokeRuns = 1;
  while (!smoke.ok && kept.length) {
    const last = kept.pop()!;
    await repo.resetTo(last.before);
    last.outcome.state = "red";
    last.outcome.result = "smoke";
    last.outcome.reason = `dropped: batch smoke red\n${smoke.tail}`;
    delete last.outcome.ourCommit;
    log(`smoke red; dropped #${last.outcome.number}, re-running`);
    smoke = await gates.smoke();
    smokeRuns++;
  }
  return { outcomes, smoke, smokeRuns, pushable: smoke.ok };
}

// ---------------------------------------------------------------------------------------------
// Process helpers

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  logFile?: string;
  timeoutMs?: number;
}

export function tailOf(text: string, lines = 15, max = 1500): string {
  const body = text.trim().split("\n").slice(-lines).join("\n");
  return body.length > max ? body.slice(-max) : body;
}

export async function sh(cmd: string[], options: RunOptions = {}): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const timer = options.timeoutMs ? setTimeout(() => proc.kill(), options.timeoutMs) : null;
  let out = "";
  const pump = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      const text = decoder.decode(chunk, { stream: true });
      out = (out + text).slice(-200_000);
      if (options.logFile) appendFileSync(options.logFile, text);
    }
  };
  await Promise.all([pump(proc.stdout), pump(proc.stderr)]);
  const code = await proc.exited;
  if (timer) clearTimeout(timer);
  return { code, out };
}

// ---------------------------------------------------------------------------------------------
// Planning: live PRs + ledger -> entries and the ranked candidate list

export interface PlannedCandidate extends Rankable {
  title: string;
  headSha: string;
  tier: number;
  signals: string[];
}

export interface PrPlan {
  entries: Record<string, LedgerEntry>;
  candidates: PlannedCandidate[];
}

const REASON_CAP = 1200;
export const clip = (text: string) => (text.length > REASON_CAP ? `${text.slice(0, REASON_CAP)}…` : text);

export async function planPrs(args: {
  gql: Gql;
  repos: Repos;
  prior: Record<string, LedgerEntry>;
  live: LivePr[];
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
}): Promise<PrPlan> {
  const { gql, repos, prior, live, log } = args;
  await refreshUnknown(gql, repos, live, args.sleep, log);

  const entries: Record<string, LedgerEntry> = {};
  const toProcess: LivePr[] = [];
  for (const pr of live) {
    const key = `pr:${pr.number}`;
    const before = prior[key];
    const decision = decide(before, pr, classifyLive(pr, repos.baseBranch));
    if (decision.action === "process") {
      toProcess.push(pr);
      continue;
    }
    const entry: LedgerEntry = {
      number: pr.number,
      kind: "pr",
      state: decision.state,
      title: pr.title,
      headSha: pr.headSha,
      reason: decision.reason,
      updatedAt: pr.updatedAt,
      labels: pr.labels,
    };
    if (decision.keepAttempt && before) {
      entry.headSha = before.headSha;
      if (before.result) entry.result = before.result;
      if (before.ourCommit) entry.ourCommit = before.ourCommit;
      if (before.attemptedAt) entry.attemptedAt = before.attemptedAt;
    }
    entries[key] = entry;
  }

  const cached = (pr: LivePr) => {
    const before = prior[`pr:${pr.number}`];
    return before?.headSha === pr.headSha && before.areas && before.fileCount !== undefined ? before : null;
  };
  const missing = toProcess.filter(pr => !cached(pr)).map(pr => pr.number);
  log(`candidates ${toProcess.length}; changed paths to fetch for ${missing.length} (rest cached by head sha)`);
  const paths = await fetchChangedPaths(gql, repos, missing);

  const candidates = rankCandidates(
    toProcess.map(pr => {
      const hit = cached(pr);
      const files = paths.get(pr.number) ?? [];
      return {
        number: pr.number,
        title: pr.title,
        headSha: pr.headSha,
        reviewDecision: pr.reviewDecision,
        labels: pr.labels,
        areas: hit?.areas ?? areasFor(pr.labels, files),
        fileCount: hit?.fileCount ?? files.length,
      };
    }),
  );
  candidates.forEach((candidate, index) => {
    const pr = live.find(item => item.number === candidate.number)!;
    entries[`pr:${pr.number}`] = {
      number: pr.number,
      kind: "pr",
      state: "skipped-this-run",
      title: pr.title,
      headSha: pr.headSha,
      reason: `rank ${index + 1}/${candidates.length}`,
      updatedAt: pr.updatedAt,
      labels: pr.labels,
      areas: candidate.areas,
      fileCount: candidate.fileCount,
      priority: candidate.signals.length
        ? `tier ${candidate.tier}: ${candidate.signals.join(",")}`
        : `tier ${candidate.tier}`,
    };
  });

  const openNumbers = new Set(live.map(pr => pr.number));
  const ours = Object.values(prior).filter(
    entry => entry.kind === "pr" && isOurs(entry) && !openNumbers.has(entry.number),
  );
  const lookup = await fetchClosedLookup(
    gql,
    repos,
    ours.map(entry => entry.number),
  );
  Object.assign(entries, reconcileClosed(prior, openNumbers, lookup));
  return { entries, candidates };
}

/** Writes the per-PR outcomes of this run onto the planned entries. */
export function applyOutcomes(entries: Record<string, LedgerEntry>, outcomes: Outcome[], now: string): void {
  for (const outcome of outcomes) {
    const entry = entries[`pr:${outcome.number}`];
    if (!entry) continue;
    entry.state = outcome.state;
    entry.result = outcome.result;
    entry.headSha = outcome.headSha;
    entry.reason = clip(outcome.reason);
    entry.attemptedAt = now;
    if (outcome.ourCommit) entry.ourCommit = outcome.ourCommit;
    else delete entry.ourCommit;
  }
}

// ---------------------------------------------------------------------------------------------
// Git, gates, lock, logging

export const LEDGER_REL = "aphrody/upstream-ledger.json";
export const DISCUSSIONS_REL = "aphrody/upstream-discussions.jsonl";
export const SMOKE_PATHS = [
  "test/js/bun/shell",
  "test/js/bun/spawn",
  "test/js/bun/http",
  "test/js/bun/sqlite",
  "test/js/bun/image",
  "test/cli/run",
];

export class GitRepo implements RepoOps {
  constructor(
    readonly dir: string,
    private readonly slug: string,
  ) {}

  async git(args: string[], allowFail = false): Promise<{ code: number; out: string }> {
    const result = await sh(["git", "-C", this.dir, ...args]);
    if (result.code !== 0 && !allowFail) throw new Error(`git ${args.join(" ")} failed: ${tailOf(result.out, 6)}`);
    return result;
  }

  async rev(ref: string): Promise<string> {
    return (await this.git(["rev-parse", ref])).out.trim();
  }

  head = () => this.rev("HEAD");

  async isAncestor(sha: string, of = "HEAD"): Promise<boolean> {
    return (await this.git(["merge-base", "--is-ancestor", sha, of], true)).code === 0;
  }

  async resetTo(sha: string): Promise<void> {
    await this.git(["reset", "--hard", sha]);
  }

  async fetchPr(number: number): Promise<string> {
    await this.git(["fetch", "--no-tags", "upstream", `pull/${number}/head`]);
    return this.rev("FETCH_HEAD");
  }

  /** Merge with --no-ff; on conflict the merge is aborted and the reason names the files. */
  async merge(ref: string, message: string): Promise<{ ok: true; commit: string } | { ok: false; reason: string }> {
    if (await this.isAncestor(ref)) return { ok: true, commit: await this.head() };
    const result = await this.git(["merge", "--no-ff", "-m", message, ref], true);
    if (result.code === 0) return { ok: true, commit: await this.head() };
    const files = (await this.git(["diff", "--name-only", "--diff-filter=U"], true)).out
      .trim()
      .split("\n")
      .filter(Boolean);
    await this.git(["merge", "--abort"], true);
    await this.git(["reset", "--hard", "HEAD"], true);
    const reason = files.length
      ? `conflicts in ${files.length} file(s): ${files.slice(0, 8).join(", ")}`
      : tailOf(result.out, 6);
    return { ok: false, reason };
  }

  mergePr(candidate: Candidate, sha: string) {
    return this.merge(sha, `Merge ${this.slug}#${candidate.number} (${short(sha)}): ${candidate.title}`);
  }

  async changed(since: string): Promise<{ crates: string[]; tests: string[] }> {
    const files = (await this.git(["diff", "--name-only", "--diff-filter=AMR", since, "HEAD"])).out
      .trim()
      .split("\n")
      .filter(Boolean);
    const manifest = (dir: string) => {
      const path = join(this.dir, dir, "Cargo.toml");
      return existsSync(path) ? readFileSync(path, "utf8") : null;
    };
    return { crates: crateNamesFor(files, manifest), tests: files.filter(isPrTestFile) };
  }

  /** Clone on first use; the `upstream` remote is a lazy promisor so partial-clone merges can read its blobs. */
  async ensure(originUrl: string, upstreamUrl: string): Promise<void> {
    if (!existsSync(join(this.dir, ".git"))) {
      mkdirSync(dirname(this.dir), { recursive: true });
      const clone = await sh(["git", "clone", "--filter=blob:none", originUrl, this.dir]);
      if (clone.code !== 0) throw new Error(`git clone failed: ${tailOf(clone.out, 6)}`);
    }
    const has = (await this.git(["remote", "get-url", "upstream"], true)).code === 0;
    await this.git(has ? ["remote", "set-url", "upstream", upstreamUrl] : ["remote", "add", "upstream", upstreamUrl]);
    for (const [key, value] of [
      ["tagOpt", "--no-tags"],
      ["promisor", "true"],
      ["partialclonefilter", "blob:none"],
    ] as const) {
      await this.git(["config", `remote.upstream.${key}`, value]);
    }
    if (!(await this.git(["config", "user.email"], true)).out.trim()) {
      const user = await sh(["gh", "api", "user", "--jq", '.login + " " + (.id|tostring)']);
      const [login, id] = user.out.trim().split(" ");
      if (user.code !== 0 || !login) throw new Error("git identity missing and gh api user failed");
      await this.git(["config", "user.name", login]);
      await this.git(["config", "user.email", `${id}+${login}@users.noreply.github.com`]);
    }
  }
}

export function makeGates(dir: string, logFile: string, bun: string): Gates {
  const run = async (cmd: string[]): Promise<GateResult> => {
    const result = await sh(cmd, { cwd: dir, logFile });
    return { ok: result.code === 0, tail: tailOf(result.out) };
  };
  const smoke = SMOKE_PATHS.filter(path => existsSync(join(dir, path)));
  return {
    cargoCheck: crates => run(["cargo", "check", "--message-format=short", ...crates.flatMap(name => ["-p", name])]),
    prTests: files => run([bun, "bd", "test", ...files]),
    smoke: () => run([bun, "bd", "test", ...smoke]),
  };
}

export function acquireLock(
  file: string,
  pid = process.pid,
  alive: (pid: number) => boolean = other => {
    try {
      process.kill(other, 0);
      return true;
    } catch {
      return false;
    }
  },
): (() => void) | null {
  mkdirSync(dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, "wx");
      writeFileSync(fd, String(pid));
      closeSync(fd);
      return () => rmSync(file, { force: true });
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      const holder = Number(readFileSync(file, "utf8").trim());
      if (holder && alive(holder)) return null;
      rmSync(file, { force: true });
    }
  }
  return null;
}

export const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

function makeLogger(logDir: string): { log: (line: string) => void; file: string } {
  mkdirSync(logDir, { recursive: true });
  const file = join(logDir, `upstream-sync-${new Date().toISOString().slice(0, 10)}.log`);
  return {
    file,
    log: line => {
      const text = `${new Date().toISOString()} ${line}`;
      console.log(text);
      appendFileSync(file, `${text}\n`);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The run

export interface Options {
  maxPrs: number;
  dryRun: boolean;
  noBuild: boolean;
  fullDiscussions: boolean;
  home: string;
  out: string | null;
  repoRoot: string;
}

const parseSlug = (url: string) => {
  const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim());
  if (!match) throw new Error(`cannot read owner/name from remote url ${url}`);
  return { owner: match[1]!, name: match[2]! };
};

async function resolveRepos(repoRoot: string): Promise<Repos> {
  const origin = await sh(["git", "-C", repoRoot, "remote", "get-url", "origin"]);
  if (origin.code !== 0) throw new Error(`no origin remote in ${repoRoot}`);
  const ours = parseSlug(origin.out);
  const info = await sh(["gh", "api", `repos/${ours.owner}/${ours.name}`]);
  if (info.code !== 0) throw new Error(`gh api repos/${ours.owner}/${ours.name} failed: ${tailOf(info.out, 3)}`);
  const json = JSON.parse(info.out);
  if (!json.parent) throw new Error(`${ours.owner}/${ours.name} is not a fork`);
  const [owner, name] = String(json.parent.full_name).split("/") as [string, string];
  return { ours, upstream: { owner, name }, baseBranch: json.parent.default_branch, oursBranch: json.default_branch };
}

async function remoteSha(url: string, branch: string): Promise<string> {
  const result = await sh(["git", "ls-remote", url, `refs/heads/${branch}`]);
  const sha = result.out.split(/\s/)[0];
  if (result.code !== 0 || !sha) throw new Error(`git ls-remote ${url} ${branch} failed: ${tailOf(result.out, 3)}`);
  return sha;
}

async function priorState(
  clone: string,
  repos: Repos,
): Promise<{ ledger: Ledger | null; discussions: Map<number, DiscussionRecord> }> {
  const read = async (rel: string): Promise<string | null> => {
    const local = join(clone, rel);
    if (existsSync(local)) return readFileSync(local, "utf8");
    const result = await sh([
      "gh",
      "api",
      `repos/${repos.ours.owner}/${repos.ours.name}/contents/${rel}`,
      "-H",
      "Accept: application/vnd.github.raw",
    ]);
    return result.code === 0 ? result.out : null;
  };
  const ledgerText = await read(LEDGER_REL);
  const discussionText = await read(DISCUSSIONS_REL);
  return {
    ledger: ledgerText ? parseLedger(ledgerText) : null,
    discussions: discussionText ? parseDiscussions(discussionText) : new Map(),
  };
}

export interface RunResult {
  exitCode: number;
  ledger: Ledger;
  outcomes: Outcome[];
  discussionCount: number;
  untrackedCount: number;
  upstreamMerge: string;
  reportPath: string;
}

function writeAtomic(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export function renderReport(args: {
  ledger: Ledger;
  outcomes: Outcome[];
  candidates: PlannedCandidate[];
  entries: Record<string, LedgerEntry>;
  options: Options;
  upstreamMerge: string;
  smoke: string;
  discussionCount: number;
  untrackedCount: number;
  durationSeconds: number;
}): string {
  const { ledger, entries } = args;
  const rows = (kind: string, state: string) =>
    Object.values(entries).filter(entry => entry.kind === kind && entry.state === state);
  const lines = [
    `# upstream-sync ${ledger.generatedAt}`,
    "",
    `mode: ${args.options.dryRun ? "dry-run" : args.options.noBuild ? "no-build" : "full"}; max-prs ${args.options.maxPrs}; ${Math.round(args.durationSeconds)}s; graphql ${usage.queries} queries, cost ${usage.cost}`,
    `upstream main ${ledger.upstreamMainSha}; our main ${ledger.ourMainSha}`,
    `upstream merge: ${args.upstreamMerge}`,
    `batch smoke: ${args.smoke}`,
    "",
    "## Counts",
    "",
    ...Object.entries(ledger.counts).flatMap(([kind, states]) => [
      `${kind}: ${
        Object.entries(states)
          .map(([state, n]) => `${state} ${n}`)
          .join(", ") || "none"
      }`,
      "",
    ]),
    `discussions mirrored: ${args.discussionCount}, untracked: ${args.untrackedCount}`,
    "",
    "## Processed PRs",
    "",
    ...(args.outcomes.length
      ? args.outcomes.flatMap(outcome => [
          `- #${outcome.number} ${outcome.state} (${outcome.result}) ${entries[`pr:${outcome.number}`]?.title ?? ""}`,
          ...(outcome.state === "merged"
            ? [`  ourCommit ${outcome.ourCommit}`]
            : ["  ```", ...outcome.reason.split("\n").map(line => `  ${line}`), "  ```"]),
        ])
      : ["none"]),
    "",
    `## Candidates by priority (${args.candidates.length}, first 40)`,
    "",
    ...args.candidates
      .slice(0, 40)
      .map(
        (candidate, index) =>
          `${index + 1}. #${candidate.number} tier ${candidate.tier} ${candidate.signals.join(",")} - ${candidate.title}`,
      ),
    "",
    `## Unfixed issues (${rows("issue", "unfixed").length}, first 60)`,
    "",
    ...rows("issue", "unfixed")
      .slice(0, 60)
      .map(entry => `- #${entry.number} [${(entry.labels ?? []).join(", ")}] ${entry.title}`),
    "",
    `## Untracked discussions (${args.untrackedCount}, first 60)`,
    "",
    ...rows("discussion", "untracked")
      .slice(0, 60)
      .map(entry => `- #${entry.number} (${entry.reason}) ${entry.title}`),
    "",
  ];
  return lines.join("\n");
}

export async function runSync(options: Options): Promise<RunResult> {
  const started = Date.now();
  const now = new Date();
  const { log, file: logFile } = makeLogger(join(options.home, "log"));
  const reportPath = join(options.home, `report-${stamp(now)}${options.dryRun ? "-dry" : ""}.md`);
  const clone = join(options.home, "clone");
  const gql = createGql(ghExec, ms => Bun.sleep(ms), log);
  const repos = await resolveRepos(options.repoRoot);
  const slug = `${repos.upstream.owner}/${repos.upstream.name}`;
  const upstreamUrl = `https://github.com/${slug}.git`;
  const originUrl = `https://github.com/${repos.ours.owner}/${repos.ours.name}.git`;
  log(
    `upstream-sync ${options.dryRun ? "dry-run" : options.noBuild ? "no-build" : "run"}: ${slug} -> ${repos.ours.owner}/${repos.ours.name}`,
  );

  const release = options.dryRun ? () => {} : acquireLock(join(options.home, "lock"));
  if (!release) {
    log("another run holds the lock; exiting");
    return {
      exitCode: 4,
      ledger: emptyLedger(now),
      outcomes: [],
      discussionCount: 0,
      untrackedCount: 0,
      upstreamMerge: "not run",
      reportPath,
    };
  }

  try {
    const repo = new GitRepo(clone, slug);
    if (!options.dryRun) {
      await repo.ensure(originUrl, upstreamUrl);
      await repo.git(["fetch", "--no-tags", "origin", repos.oursBranch]);
      await repo.git(["checkout", "-f", repos.oursBranch]);
      await repo.resetTo(`origin/${repos.oursBranch}`);
    }
    const prior = await priorState(clone, repos);
    const priorEntries = prior.ledger?.entries ?? {};

    log("enumerating open PRs");
    const live = await fetchOpenPrs(gql, repos, log);
    const plan = await planPrs({ gql, repos, prior: priorEntries, live, sleep: ms => Bun.sleep(ms), log });
    const entries = plan.entries;

    log("enumerating issues");
    const issues = await fetchOpenIssues(gql, repos, ISSUE_LABELS, log);
    for (const issue of issues) entries[`issue:${issue.number}`] = issueEntry(issue);
    const since = prior.ledger?.generatedAt
      ? new Date(Date.parse(prior.ledger.generatedAt) - 3600_000)
      : new Date(now.getTime() - 7 * 86400_000);
    for (const entry of await fetchClosedIssues(gql, repos, since.toISOString().replace(/\.\d+/, ""), log))
      entries[`issue:${entry.number}`] ??= entry;
    for (const [key, entry] of Object.entries(priorEntries)) {
      const fresh =
        entry.kind === "issue" &&
        entry.state === "closed" &&
        Date.parse(entry.updatedAt ?? "") > now.getTime() - 14 * 86400_000;
      if (fresh) entries[key] ??= entry;
    }

    log("enumerating discussions");
    const discussions = await fetchDiscussions(gql, repos, prior.discussions, options.fullDiscussions, log);
    let untrackedCount = 0;
    for (const record of discussions.values()) {
      if (record.untracked) untrackedCount++;
      entries[`discussion:${record.number}`] = {
        number: record.number,
        kind: "discussion",
        state: record.untracked ? "untracked" : "tracked",
        title: record.title,
        updatedAt: record.updatedAt,
        ...(record.reason ? { reason: record.reason } : {}),
      };
    }

    let upstreamMerge = "not run (dry-run)";
    let smokeText = "not run";
    let outcomes: Outcome[] = [];
    let exitCode = 0;
    let upstreamMainSha = await remoteSha(upstreamUrl, repos.baseBranch);
    let ourMainSha = await remoteSha(originUrl, repos.oursBranch);

    const rankText = (index: number) => `rank ${index + 1}/${plan.candidates.length}`;
    if (options.dryRun) {
      plan.candidates.forEach((candidate, index) => {
        entries[`pr:${candidate.number}`]!.reason =
          `${rankText(index)}; ${index < options.maxPrs ? "dry-run: would be processed" : `beyond --max-prs ${options.maxPrs}`}`;
      });
    } else {
      const baseRef = `upstream/${repos.baseBranch}`;
      await repo.git(["fetch", "--no-tags", "upstream", repos.baseBranch]);
      upstreamMainSha = await repo.rev(baseRef);
      const probeOnly = options.noBuild;
      const start = await repo.head();
      const merge = await repo.merge(
        baseRef,
        `Merge ${slug} ${repos.baseBranch} (${short(upstreamMainSha)}) into the fork`,
      );
      if (!merge.ok) {
        upstreamMerge = `CONFLICT ${merge.reason}`;
        log(`upstream merge: ${upstreamMerge}`);
        exitCode = 2;
      } else {
        const baseChanged = (await repo.head()) !== start;
        upstreamMerge = baseChanged
          ? `merged ${short(upstreamMainSha)} as ${short(await repo.head())}`
          : "already contained";
        if (probeOnly && baseChanged) {
          await repo.resetTo(start);
          upstreamMerge += " (probe only, --no-build: reset)";
        }
        const selected = plan.candidates.slice(0, options.maxPrs);
        plan.candidates.forEach((candidate, index) => {
          if (index >= options.maxPrs)
            entries[`pr:${candidate.number}`]!.reason = `${rankText(index)}; beyond --max-prs ${options.maxPrs}`;
        });
        const batch = await processBatch({
          candidates: selected.map(candidate => ({
            number: candidate.number,
            title: candidate.title,
            headSha: candidate.headSha,
          })),
          repo,
          gates: probeOnly ? null : makeGates(clone, logFile, process.execPath),
          baseChanged: baseChanged && !probeOnly,
          log,
        });
        outcomes = batch.outcomes;
        smokeText = batch.smoke
          ? `${batch.smoke.ok ? "green" : "RED"} after ${batch.smokeRuns} run(s)${batch.smoke.ok ? "" : `\n${batch.smoke.tail}`}`
          : probeOnly
            ? "skipped (--no-build)"
            : "not needed (nothing new in main)";
        if (!batch.pushable) {
          exitCode = 3;
          log("batch smoke red with every PR dropped: the upstream merge itself is red; nothing pushed");
        }
        applyOutcomes(entries, outcomes, now.toISOString());
        ourMainSha = await repo.head();
      }
    }

    const ledger: Ledger = {
      generatedAt: now.toISOString(),
      upstreamMainSha,
      ourMainSha,
      counts: countStates(entries),
      entries,
    };
    const outDir = options.dryRun ? (options.out ?? mkdtempSync(join(tmpdir(), "upstream-sync-dry-"))) : clone;
    const ledgerPath = join(outDir, LEDGER_REL);
    const discussionsPath = join(outDir, DISCUSSIONS_REL);

    if (exitCode === 0) {
      writeAtomic(ledgerPath, serializeLedger(ledger));
      writeAtomic(discussionsPath, serializeDiscussions(discussions.values()));
      log(`ledger ${ledgerPath}; discussions ${discussionsPath}`);
      if (!options.dryRun) {
        const message = `upstream-sync: ledger ${now.toISOString().slice(0, 10)} (${formatCounts(ledger.counts)})`;
        await repo.git(["add", "--", LEDGER_REL, DISCUSSIONS_REL]);
        await repo.git(["commit", "-m", message, "--", LEDGER_REL, DISCUSSIONS_REL]);
        try {
          await pushMain(repo, repos.oursBranch, log);
        } catch (error) {
          log(`push failed: ${(error as Error).message}`);
          exitCode = 3;
        }
      }
    }

    const report = renderReport({
      ledger,
      outcomes,
      candidates: plan.candidates,
      entries,
      options,
      upstreamMerge,
      smoke: smokeText,
      discussionCount: discussions.size,
      untrackedCount,
      durationSeconds: (Date.now() - started) / 1000,
    });
    writeAtomic(reportPath, report);
    log(`report ${reportPath}`);
    return { exitCode, ledger, outcomes, discussionCount: discussions.size, untrackedCount, upstreamMerge, reportPath };
  } finally {
    release();
  }
}

function emptyLedger(now: Date): Ledger {
  return { generatedAt: now.toISOString(), upstreamMainSha: "", ourMainSha: "", counts: {}, entries: {} };
}

/** Others push to main too: merge what arrived (a conflict stops the run), then push; retried once. */
async function pushMain(repo: GitRepo, branch: string, log: (line: string) => void): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await repo.git(["fetch", "--no-tags", "origin", branch]);
    if (!(await repo.isAncestor(`origin/${branch}`))) {
      const merged = await repo.merge(`origin/${branch}`, `Merge origin/${branch} into upstream-sync`);
      if (!merged.ok) throw new Error(`origin/${branch} moved and does not merge cleanly: ${merged.reason}`);
    }
    const push = await repo.git(["push", "origin", `HEAD:${branch}`], true);
    if (push.code === 0) {
      log(`pushed ${short(await repo.head())} to ${branch}`);
      return;
    }
    log(`push rejected (attempt ${attempt + 1}): ${tailOf(push.out, 3)}`);
  }
  throw new Error("push rejected three times");
}

export function summary(result: RunResult): string {
  const { counts } = result.ledger;
  return [
    `upstream-sync ${result.ledger.generatedAt} exit ${result.exitCode}`,
    `upstream main ${short(result.ledger.upstreamMainSha)}  our main ${short(result.ledger.ourMainSha)}  merge: ${result.upstreamMerge.split("\n")[0]}`,
    ...Object.entries(counts).map(
      ([kind, states]) =>
        `${kind.padEnd(10)} ${
          Object.entries(states)
            .map(([state, n]) => `${state}=${n}`)
            .join(" ") || "-"
        }`,
    ),
    `discussions ${result.discussionCount} (untracked ${result.untrackedCount}); processed ${result.outcomes.length} PR(s): ${result.outcomes.map(outcome => `#${outcome.number} ${outcome.state}`).join(", ") || "none"}`,
    `graphql ${usage.queries} queries, cost ${usage.cost}; report ${result.reportPath}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// install and CLI

const UNITS = ["bun-upstream-sync.service", "bun-upstream-sync.timer"];

export async function install(options: Options): Promise<void> {
  const source = join(options.repoRoot, "scripts/aphrody/systemd");
  const target = join(homedir(), ".config/systemd/user");
  const steps = [
    `ensure the scratch clone ${join(options.home, "clone")}`,
    ...UNITS.map(unit => `copy ${join(source, unit)} -> ${join(target, unit)}`),
    "systemctl --user daemon-reload",
    `systemctl --user enable --now ${UNITS[1]}`,
  ];
  if (options.dryRun) {
    console.log(steps.map(step => `would: ${step}`).join("\n"));
    return;
  }
  const repos = await resolveRepos(options.repoRoot);
  await new GitRepo(join(options.home, "clone"), `${repos.upstream.owner}/${repos.upstream.name}`).ensure(
    `https://github.com/${repos.ours.owner}/${repos.ours.name}.git`,
    `https://github.com/${repos.upstream.owner}/${repos.upstream.name}.git`,
  );
  mkdirSync(target, { recursive: true });
  for (const unit of UNITS) copyFileSync(join(source, unit), join(target, unit));
  for (const args of [["daemon-reload"], ["enable", "--now", UNITS[1]!]]) {
    const result = await sh(["systemctl", "--user", ...args]);
    if (result.code !== 0) throw new Error(`systemctl --user ${args.join(" ")} failed: ${tailOf(result.out, 4)}`);
  }
  console.log(`installed ${UNITS.join(", ")} in ${target}; logs: journalctl --user -u bun-upstream-sync`);
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      "max-prs": { type: "string", default: "25" },
      "dry-run": { type: "boolean", default: false },
      "no-build": { type: "boolean", default: false },
      "full-discussions": { type: "boolean", default: false },
      home: { type: "string" },
      out: { type: "string" },
    },
  });
  const maxPrs = Number(values["max-prs"]);
  if (!Number.isInteger(maxPrs) || maxPrs < 0)
    throw new Error(`--max-prs must be a non-negative integer, got ${values["max-prs"]}`);
  const options: Options = {
    maxPrs,
    dryRun: values["dry-run"]!,
    noBuild: values["no-build"]!,
    fullDiscussions: values["full-discussions"]!,
    home: resolve(values.home ?? process.env.UPSTREAM_SYNC_HOME ?? join(homedir(), "ci", "bun-upstream")),
    out: values.out ? resolve(values.out) : null,
    repoRoot: resolve(import.meta.dir, "../.."),
  };
  const command = positionals[0] ?? "run";
  if (command === "install") {
    await install(options);
    return 0;
  }
  if (command !== "run") throw new Error(`unknown command ${command}; use run or install`);
  const result = await runSync(options);
  console.log(`\n${summary(result)}`);
  return result.exitCode;
}

if (import.meta.main) {
  main().then(
    code => process.exit(code),
    error => {
      console.error(`upstream-sync failed: ${error instanceof Error ? error.stack : error}`);
      process.exit(1);
    },
  );
}
