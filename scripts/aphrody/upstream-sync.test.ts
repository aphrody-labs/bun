import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireLock,
  applyOutcomes,
  areasFor,
  classifyDiscussion,
  classifyLive,
  countStates,
  crateNamesFor,
  createGql,
  decide,
  fetchDiscussions,
  fetchOpenIssues,
  fetchOpenPrs,
  formatCounts,
  isPrTestFile,
  issueEntry,
  paginate,
  parseDiscussions,
  parseLedger,
  parseRefs,
  planPrs,
  priorityOf,
  processBatch,
  rankCandidates,
  reconcileClosed,
  serializeDiscussions,
  serializeLedger,
  stamp,
  tailOf,
  toDiscussionRecord,
  type Candidate,
  type DiscussionRecord,
  type Gates,
  type Gql,
  type LedgerEntry,
  type LivePr,
  type Repos,
  type RepoOps,
} from "./upstream-sync";

const repos: Repos = {
  ours: { owner: "fork", name: "bun" },
  upstream: { owner: "up", name: "bun" },
  baseBranch: "main",
  oursBranch: "main",
};
const quiet = () => {};

const livePr = (overrides: Partial<LivePr> = {}): LivePr => ({
  number: 1,
  title: "fix: thing",
  isDraft: false,
  mergeable: "MERGEABLE",
  headSha: "a".repeat(40),
  reviewDecision: null,
  labels: [],
  updatedAt: "2026-11-01T00:00:00Z",
  baseRef: "main",
  ci: "SUCCESS",
  ...overrides,
});

const entry = (overrides: Partial<LedgerEntry>): LedgerEntry => ({
  number: 1,
  kind: "pr",
  state: "skipped-this-run",
  ...overrides,
});

describe("prioritisation", () => {
  test("approved beats labels beats areas beats the rest", () => {
    const ranked = rankCandidates([
      { number: 4, reviewDecision: null, labels: [], areas: [], fileCount: 1 },
      { number: 3, reviewDecision: null, labels: [], areas: ["shell"], fileCount: 1 },
      { number: 2, reviewDecision: null, labels: ["crash"], areas: [], fileCount: 9 },
      { number: 1, reviewDecision: "APPROVED", labels: [], areas: [], fileCount: 50 },
    ]);
    expect(ranked.map(item => [item.number, item.tier])).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 3],
    ]);
  });

  test("ties: more signals, then fewer files, then lower number", () => {
    const ranked = rankCandidates([
      { number: 10, reviewDecision: null, labels: ["regression"], areas: [], fileCount: 2 },
      { number: 11, reviewDecision: null, labels: ["regression", "windows"], areas: ["windows"], fileCount: 8 },
      { number: 12, reviewDecision: null, labels: ["regression"], areas: [], fileCount: 1 },
      { number: 9, reviewDecision: null, labels: ["regression"], areas: [], fileCount: 1 },
    ]);
    expect(ranked.map(item => item.number)).toEqual([11, 9, 12, 10]);
  });

  test("priority labels are exactly the five asked for", () => {
    for (const label of ["confirmed bug", "regression", "crash", "performance", "windows"]) {
      expect(priorityOf({ reviewDecision: null, labels: [label], areas: [] }).tier).toBe(1);
    }
    expect(priorityOf({ reviewDecision: null, labels: ["docs"], areas: [] }).tier).toBe(3);
  });

  test("areas come from labels and from changed paths", () => {
    expect(areasFor(["bun:sqlite"], [])).toEqual(["sqlite"]);
    expect(areasFor([], ["src/runtime/image/mod.rs", "test/cli/install/x.test.ts"]).sort()).toEqual([
      "cli",
      "image",
      "install",
    ]);
    expect(areasFor(["docs"], ["docs/readme.md"])).toEqual([]);
  });
});

describe("state decisions", () => {
  test("drafts, conflicts, red and pending CI are classified before any work", () => {
    expect(classifyLive(livePr({ isDraft: true }), "main").state).toBe("draft");
    expect(classifyLive(livePr({ mergeable: "CONFLICTING" }), "main").state).toBe("not-mergeable");
    expect(classifyLive(livePr({ mergeable: "UNKNOWN" }), "main").state).toBe("not-mergeable");
    expect(classifyLive(livePr({ baseRef: "release" }), "main").state).toBe("not-mergeable");
    expect(classifyLive(livePr({ ci: "FAILURE" }), "main").state).toBe("red");
    expect(classifyLive(livePr({ ci: "PENDING" }), "main").state).toBe("waiting-ci");
    expect(classifyLive(livePr({ ci: null }), "main").state).toBe("waiting-ci");
    expect(classifyLive(livePr(), "main").state).toBe("candidate");
  });

  test("a recorded failure is retried only when the head sha changed", () => {
    const live = livePr();
    const cls = classifyLive(live, "main");
    const failed = entry({
      state: "conflict",
      result: "conflict",
      headSha: live.headSha,
      reason: "conflicts in 2 files",
    });
    expect(decide(failed, live, cls)).toMatchObject({
      action: "keep",
      state: "conflict",
      reason: "conflicts in 2 files",
    });
    expect(decide(failed, livePr({ headSha: "b".repeat(40) }), cls)).toEqual({ action: "process" });
    expect(decide(undefined, live, cls)).toEqual({ action: "process" });
  });

  test("CI red upstream is not a recorded failure: when CI turns green the PR is picked up", () => {
    const live = livePr();
    const wasRed = entry({ state: "red", headSha: live.headSha, reason: "upstream CI FAILURE" });
    expect(decide(wasRed, live, classifyLive(live, "main"))).toEqual({ action: "process" });
  });

  test("a PR in main stays carried; a new head is re-merged when it is a candidate again", () => {
    const merged = entry({ state: "merged", headSha: "a".repeat(40), ourCommit: "c".repeat(40), result: "ok" });
    const same = livePr();
    expect(decide(merged, same, classifyLive(same, "main"))).toMatchObject({ action: "keep", state: "carried" });
    const moved = livePr({ headSha: "b".repeat(40) });
    expect(decide(merged, moved, classifyLive(moved, "main"))).toEqual({ action: "process" });
    const movedDraft = livePr({ headSha: "b".repeat(40), isDraft: true });
    expect(decide(merged, movedDraft, classifyLive(movedDraft, "main"))).toMatchObject({
      action: "keep",
      state: "carried",
    });
  });

  test("drafts and waiting PRs are tracked and picked up when the state changes", () => {
    const draft = livePr({ isDraft: true });
    const first = decide(undefined, draft, classifyLive(draft, "main"));
    expect(first).toMatchObject({ action: "keep", state: "draft" });
    const ready = livePr();
    expect(decide(entry({ state: "draft", headSha: ready.headSha }), ready, classifyLive(ready, "main"))).toEqual({
      action: "process",
    });
  });
});

describe("ledger reconcile", () => {
  const ours = (number: number, state = "carried"): [string, LedgerEntry] => [
    `pr:${number}`,
    entry({ number, state, headSha: "a".repeat(40), ourCommit: "c".repeat(40) }),
  ];

  test("carried PRs that upstream merged or closed are marked, everything else closed is dropped", () => {
    const prior = Object.fromEntries([
      ours(1),
      ours(2, "merged"),
      ours(3),
      ours(4),
      [`pr:5`, entry({ number: 5, state: "conflict", result: "conflict" })],
      [`pr:6`, entry({ number: 6, state: "upstream-merged", reason: "x" })],
      [`issue:9`, entry({ number: 9, kind: "issue", state: "unfixed" })],
    ]);
    const lookup = new Map([
      [1, { state: "MERGED" as const, mergeCommit: "d".repeat(40) }],
      [2, { state: "CLOSED" as const }],
    ]);
    const out = reconcileClosed(prior, new Set([4]), lookup);
    expect(out["pr:1"]!.state).toBe("upstream-merged");
    expect(out["pr:1"]!.reason).toContain("duplicate");
    expect(out["pr:1"]!.ourCommit).toBe("c".repeat(40));
    expect(out["pr:2"]!.state).toBe("upstream-closed");
    expect(out["pr:2"]!.reason).toContain("stays");
    expect(out["pr:3"]!.state).toBe("carried");
    expect(out["pr:6"]!.state).toBe("upstream-merged");
    expect(Object.keys(out).sort()).toEqual(["pr:1", "pr:2", "pr:3", "pr:6"]);
  });

  test("serialize and parse round-trip with one entry per line; counts per kind", () => {
    const entries = {
      "pr:10": entry({ number: 10, state: "merged", ourCommit: "x" }),
      "pr:2": entry({ number: 2, state: "draft" }),
      "issue:5": entry({ number: 5, kind: "issue", state: "unfixed" }),
      "discussion:7": entry({ number: 7, kind: "discussion", state: "untracked" }),
    };
    const ledger = { generatedAt: "t", upstreamMainSha: "u", ourMainSha: "o", counts: countStates(entries), entries };
    const text = serializeLedger(ledger);
    expect(text.split("\n").filter(line => line.startsWith('"pr:'))).toHaveLength(2);
    expect(text.indexOf('"pr:2"')).toBeLessThan(text.indexOf('"pr:10"'));
    expect(parseLedger(text)).toEqual(ledger);
    expect(ledger.counts).toEqual({ pr: { merged: 1, draft: 1 }, issue: { unfixed: 1 }, discussion: { untracked: 1 } });
    expect(formatCounts(ledger.counts)).toBe("draft 1, merged 1, unfixed 1, untracked 1");
  });

  test("applyOutcomes writes the gate result and clears a dropped commit", () => {
    const entries = { "pr:1": entry({ number: 1, ourCommit: "old" }), "pr:2": entry({ number: 2 }) };
    applyOutcomes(
      entries,
      [
        { number: 1, headSha: "h1", state: "red", result: "smoke", reason: "dropped" },
        { number: 2, headSha: "h2", state: "merged", result: "ok", reason: "all gates green", ourCommit: "new" },
      ],
      "now",
    );
    expect(entries["pr:1"]).toMatchObject({ state: "red", result: "smoke", headSha: "h1", attemptedAt: "now" });
    expect(entries["pr:1"]!.ourCommit).toBeUndefined();
    expect(entries["pr:2"]).toMatchObject({ state: "merged", ourCommit: "new" });
  });
});

describe("planning with a stubbed fetcher", () => {
  const aliasStub =
    (log: string[] = []): Gql =>
    async (query: string) => {
      log.push(query);
      const repository: Record<string, unknown> = {};
      for (const match of query.matchAll(/p(\d+):pullRequest\(number:\d+\)\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)) {
        const number = Number(match[1]);
        const fields = match[2]!;
        repository[`p${number}`] = fields.startsWith("files")
          ? {
              files: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ path: number === 3 ? "src/runtime/shell/x.rs" : "README.md" }],
              },
            }
          : fields.startsWith("mergeable")
            ? { mergeable: "MERGEABLE" }
            : {
                state: number === 50 ? "MERGED" : "CLOSED",
                mergeCommit: number === 50 ? { oid: "d".repeat(40) } : null,
              };
      }
      return { repository };
    };

  test("every open PR gets an entry; candidates are ranked; carried PRs closed upstream are reconciled", async () => {
    const live = [
      livePr({ number: 1, isDraft: true }),
      livePr({ number: 2, ci: "FAILURE" }),
      livePr({ number: 3, mergeable: "UNKNOWN" }),
      livePr({ number: 4, reviewDecision: "APPROVED" }),
      livePr({ number: 5, labels: ["bug"] }),
      livePr({ number: 6, mergeable: "CONFLICTING" }),
      livePr({ number: 7, ci: null }),
      livePr({ number: 8, headSha: "b".repeat(40) }),
    ];
    const prior: Record<string, LedgerEntry> = {
      "pr:5": entry({
        number: 5,
        state: "conflict",
        result: "conflict",
        headSha: "a".repeat(40),
        reason: "conflicts in 1 file(s): x",
      }),
      "pr:8": entry({ number: 8, state: "merged", result: "ok", headSha: "a".repeat(40), ourCommit: "c".repeat(40) }),
      "pr:50": entry({ number: 50, state: "carried", headSha: "a".repeat(40), ourCommit: "c".repeat(40) }),
      "pr:51": entry({ number: 51, state: "carried", headSha: "a".repeat(40), ourCommit: "c".repeat(40) }),
    };
    const queries: string[] = [];
    const plan = await planPrs({ gql: aliasStub(queries), repos, prior, live, sleep: async () => {}, log: quiet });
    const states = Object.fromEntries(Object.entries(plan.entries).map(([key, value]) => [key, value.state]));
    expect(states).toMatchObject({
      "pr:1": "draft",
      "pr:2": "red",
      "pr:3": "skipped-this-run",
      "pr:4": "skipped-this-run",
      "pr:5": "conflict",
      "pr:6": "not-mergeable",
      "pr:7": "waiting-ci",
      "pr:8": "skipped-this-run",
      "pr:50": "upstream-merged",
      "pr:51": "upstream-closed",
    });
    expect(plan.candidates.map(candidate => candidate.number)).toEqual([4, 3, 8]);
    expect(plan.entries["pr:3"]!.areas).toEqual(["shell"]);
    expect(plan.entries["pr:4"]!.priority).toBe("tier 0: approved");
    expect(plan.entries["pr:50"]!.ourCommit).toBe("c".repeat(40));
  });

  test("changed paths are cached by head sha: a cached candidate costs no files query", async () => {
    const live = [livePr({ number: 3 })];
    const prior = { "pr:3": entry({ number: 3, headSha: live[0]!.headSha, areas: ["shell"], fileCount: 4 }) };
    const queries: string[] = [];
    const plan = await planPrs({ gql: aliasStub(queries), repos, prior, live, sleep: async () => {}, log: quiet });
    expect(queries.some(query => query.includes("files("))).toBe(false);
    expect(plan.candidates[0]).toMatchObject({ areas: ["shell"], fileCount: 4 });
  });
});

describe("GraphQL paging", () => {
  const pagesOf = (total: number, size: number, node: (index: number) => unknown, key: string) => {
    const calls: Array<Record<string, unknown>> = [];
    const gql: Gql = async (_query, variables) => {
      calls.push(variables ?? {});
      const start = variables?.after ? Number(variables.after) : 0;
      const nodes = Array.from({ length: Math.min(size, total - start) }, (_, i) => node(start + i));
      const end = start + nodes.length;
      return {
        repository: {
          [key]: { totalCount: total, pageInfo: { hasNextPage: end < total, endCursor: String(end) }, nodes },
        },
      };
    };
    return { gql, calls };
  };

  test("paginate walks every page and can stop early", async () => {
    const { gql, calls } = pagesOf(120, 50, i => i, "things");
    const all = await paginate<number>(gql, "q", {}, data => data.repository.things);
    expect(all).toHaveLength(120);
    expect(calls.map(call => call.after)).toEqual([null, "50", "100"]);
    const early = await paginate<number>(
      gql,
      "q",
      {},
      data => data.repository.things,
      () => false,
    );
    expect(early).toHaveLength(50);
  });

  test("fetchOpenPrs maps nodes and pages all of them", async () => {
    const { gql } = pagesOf(
      130,
      50,
      i => ({
        number: i + 1,
        title: `pr ${i}`,
        isDraft: i % 2 === 0,
        mergeable: "MERGEABLE",
        headRefOid: String(i),
        reviewDecision: null,
        updatedAt: "t",
        baseRefName: "main",
        labels: { nodes: [{ name: "crash" }] },
        commits: { nodes: [{ commit: { statusCheckRollup: i === 1 ? { state: "SUCCESS" } : null } }] },
      }),
      "pullRequests",
    );
    const prs = await fetchOpenPrs(gql, repos, quiet);
    expect(prs).toHaveLength(130);
    expect(prs[1]).toMatchObject({ number: 2, isDraft: false, labels: ["crash"], ci: "SUCCESS", headSha: "1" });
    expect(prs[0]!.ci).toBeNull();
  });

  test("fetchOpenIssues lists per label, dedupes, and links PRs", async () => {
    const gql: Gql = async (_query, variables) => ({
      repository: {
        issues: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes:
            variables?.label === "crash"
              ? [
                  {
                    number: 1,
                    title: "a",
                    updatedAt: "t",
                    closedByPullRequestsReferences: { nodes: [] },
                    timelineItems: { nodes: [] },
                  },
                  {
                    number: 2,
                    title: "b",
                    updatedAt: "t",
                    closedByPullRequestsReferences: { nodes: [{ number: 90, state: "OPEN" }] },
                    timelineItems: { nodes: [] },
                  },
                ]
              : [
                  {
                    number: 1,
                    title: "a",
                    updatedAt: "t",
                    closedByPullRequestsReferences: { nodes: [] },
                    timelineItems: { nodes: [{ __typename: "CrossReferencedEvent", source: { __typename: "Issue" } }] },
                  },
                  {
                    number: 3,
                    title: "c",
                    updatedAt: "t",
                    closedByPullRequestsReferences: { nodes: [{ number: 91, state: "MERGED" }] },
                    timelineItems: {
                      nodes: [
                        {
                          __typename: "CrossReferencedEvent",
                          source: { __typename: "PullRequest", number: 92, state: "CLOSED" },
                        },
                      ],
                    },
                  },
                ],
        },
      },
    });
    const issues = await fetchOpenIssues(gql, repos, ["crash", "regression"], quiet);
    expect(issues.map(issue => [issue.number, issue.labels])).toEqual([
      [1, ["crash", "regression"]],
      [2, ["crash"]],
      [3, ["regression"]],
    ]);
    const states = Object.fromEntries(issues.map(issue => [issue.number, issueEntry(issue)]));
    expect(states[1]!.state).toBe("unfixed");
    expect(states[2]).toMatchObject({ state: "covered", linkedPrs: [90] });
    expect(states[3]).toMatchObject({ state: "covered", linkedPrs: [91] });
  });

  test("discussions: full paging, then incremental stop at the first known one", async () => {
    const node = (number: number, updatedAt: string) => ({
      number,
      title: `d${number}`,
      body: "body",
      url: `u${number}`,
      createdAt: "c",
      updatedAt,
      author: { login: "a" },
      category: { name: "General" },
      answer: null,
    });
    const all = [node(9, "2026-03"), node(8, "2026-02"), node(7, "2026-01"), node(6, "2025-12")];
    let pages = 0;
    const gql: Gql = async (_query, variables) => {
      pages++;
      const start = variables?.after ? Number(variables.after) : 0;
      const nodes = all.slice(start, start + 2);
      return {
        repository: {
          discussions: {
            totalCount: all.length,
            pageInfo: { hasNextPage: start + 2 < all.length, endCursor: String(start + 2) },
            nodes,
          },
        },
      };
    };
    const full = await fetchDiscussions(gql, repos, new Map(), false, quiet);
    expect([...full.keys()].sort()).toEqual([6, 7, 8, 9]);
    expect(pages).toBe(2);
    pages = 0;
    all[0] = node(9, "2026-04");
    const incremental = await fetchDiscussions(gql, repos, full, false, quiet);
    expect(pages).toBe(1);
    expect(incremental.get(9)!.updatedAt).toBe("2026-04");
    expect(incremental.size).toBe(4);
    pages = 0;
    await fetchDiscussions(gql, repos, full, true, quiet);
    expect(pages).toBe(2);
  });

  test("createGql retries transient errors with backoff, tolerates NOT_FOUND, throws on the rest", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    const replies = [
      { code: 1, out: "", err: "HTTP 502: Bad Gateway" },
      { code: 1, out: JSON.stringify({ errors: [{ message: "secondary rate limit" }] }), err: "" },
      {
        code: 0,
        out: JSON.stringify({ data: { ok: 1, rateLimit: { cost: 1, remaining: 4000, resetAt: "x" } } }),
        err: "",
      },
    ];
    const gql = createGql(async () => replies.shift()!, sleep, quiet);
    expect(await gql("q")).toMatchObject({ ok: 1 });
    expect(waits).toEqual([5000, 10000]);

    const partial = createGql(
      async () => ({
        code: 1,
        out: JSON.stringify({ data: { repository: { p1: null } }, errors: [{ type: "NOT_FOUND", message: "gone" }] }),
        err: "",
      }),
      sleep,
      quiet,
    );
    expect(await partial("q")).toEqual({ repository: { p1: null } });

    const fatal = createGql(
      async () => ({ code: 1, out: JSON.stringify({ errors: [{ message: "Field 'x' doesn't exist" }] }), err: "" }),
      sleep,
      quiet,
    );
    await expect(fatal("q")).rejects.toThrow("doesn't exist");

    const low = createGql(
      async () => ({
        code: 0,
        out: JSON.stringify({
          data: { rateLimit: { cost: 1, remaining: 3, resetAt: new Date(Date.now() + 60_000).toISOString() } },
        }),
        err: "",
      }),
      sleep,
      quiet,
    );
    waits.length = 0;
    await low("q");
    expect(waits[0]).toBeGreaterThan(50_000);
  });
});

describe("discussions", () => {
  const node = (body: string, extra: Record<string, unknown> = {}) => ({
    number: 1,
    title: "t",
    body,
    url: "u",
    createdAt: "c",
    updatedAt: "u",
    author: { login: "a" },
    category: { name: "General" },
    answer: null,
    ...extra,
  });

  test("references come from URLs and bare numbers outside code fences", () => {
    const text =
      "see https://github.com/up/bun/issues/12 and github.com/up/bun/pull/34, also #56 and &#39; and ```\n#78\n``` and #123456";
    expect(parseRefs(text, "up/bun")).toEqual({ issues: [12], pulls: [34], bare: [56] });
    expect(parseRefs("https://github.com/other/bun/issues/1", "up/bun")).toEqual({ issues: [], pulls: [], bare: [] });
  });

  test("a diff fence, a workaround or a bug report without a reference is untracked", () => {
    const patch = toDiscussionRecord(node("here:\n```diff\n- a\n+ b\n```"), "up/bun");
    expect(patch).toMatchObject({ untracked: true, reason: "patch" });
    const workaround = toDiscussionRecord(node("As a workaround, pass --foo."), "up/bun");
    expect(workaround).toMatchObject({ untracked: true, reason: "workaround" });
    const bug = toDiscussionRecord(node("Steps to reproduce: run it. Expected behavior: no crash."), "up/bun");
    expect(bug).toMatchObject({ untracked: true, reason: "bug-report" });
    const answered = toDiscussionRecord(
      node("how do I do x?", { answer: { body: "A workaround is y", author: { login: "b" } } }),
      "up/bun",
    );
    expect(answered).toMatchObject({ untracked: true, reason: "workaround", answer: { author: "b" } });
  });

  test("a reference, or a category that is not a question, keeps it tracked", () => {
    expect(toDiscussionRecord(node("workaround in #4242"), "up/bun")).toMatchObject({ untracked: false, reason: null });
    expect(
      toDiscussionRecord(node("```diff\n+ x\n```\nsee https://github.com/up/bun/pull/9"), "up/bun").untracked,
    ).toBe(false);
    expect(
      classifyDiscussion(
        { title: "Show", body: "Steps to reproduce my demo", category: "Show and tell" },
        { issues: [], pulls: [], bare: [] },
      ).untracked,
    ).toBe(false);
    expect(toDiscussionRecord(node("how do I install bun?"), "up/bun").untracked).toBe(false);
  });

  test("announcements are never untracked, and fault wording alone is not a bug report", () => {
    expect(
      toDiscussionRecord(node("```diff\n+ x\n```", { category: { name: "Announcements" } }), "up/bun").untracked,
    ).toBe(false);
    expect(toDiscussionRecord(node("Steps to reproduce my deployment pipeline"), "up/bun").untracked).toBe(false);
    expect(toDiscussionRecord(node("it crashes\n```\nboom\n```"), "up/bun")).toMatchObject({
      untracked: true,
      reason: "bug-report",
    });
  });

  test("jsonl is sorted by number, one object per line, and round-trips", () => {
    const records: DiscussionRecord[] = [3, 1, 2].map(number => toDiscussionRecord(node("x", { number }), "up/bun"));
    const text = serializeDiscussions(records);
    expect(
      text
        .trimEnd()
        .split("\n")
        .map(line => JSON.parse(line).number),
    ).toEqual([1, 2, 3]);
    expect(parseDiscussions(text).get(2)).toEqual(records.find(record => record.number === 2)!);
    expect(records[0]!.v).toBe(1);
  });
});

describe("crates", () => {
  const manifests: Record<string, string> = {
    "": '[workspace]\nmembers = ["src/a"]\n',
    "src/a": '[package]\nname = "bun_a"\nversion = "0.0.0"\n',
    "src/a/inner": '[package]\nname = "bun_a_inner"\n',
    "src/b": '[lib]\nname = "not_a_package"\n',
  };
  const read = (dir: string) => manifests[dir] ?? null;

  test("nearest Cargo.toml with a [package] name; non-Rust files are ignored", () => {
    expect(
      crateNamesFor(["src/a/x.rs", "src/a/inner/y.rs", "src/a/inner/z.rs", "src/c/q.ts", "src/a/Cargo.toml"], read),
    ).toEqual(["bun_a", "bun_a_inner"]);
    expect(crateNamesFor(["src/b/x.rs", "top.rs"], read)).toEqual([]);
  });

  test("only .test.ts files under test/ are the PR's own tests", () => {
    expect(isPrTestFile("test/js/bun/x.test.ts")).toBe(true);
    expect(isPrTestFile("test/js/bun/x.test.js")).toBe(false);
    expect(isPrTestFile("src/x.test.ts")).toBe(false);
    expect(isPrTestFile("test/harness.ts")).toBe(false);
  });
});

describe("batch", () => {
  const candidate = (number: number): Candidate => ({ number, title: `pr ${number}`, headSha: `sha${number}` });

  /** A fake clone: head is a list of merged PR numbers; conflicts/changes are scripted. */
  const fakeRepo = (
    script: { conflicts?: number[]; crates?: Record<number, string[]>; tests?: Record<number, string[]> } = {},
  ) => {
    const state = { merged: [] as number[], calls: [] as string[] };
    let fetched = 0;
    const repo: RepoOps = {
      head: async () => `head:${state.merged.join(",")}`,
      fetchPr: async number => {
        fetched = number;
        return `sha${number}`;
      },
      mergePr: async c => {
        if (script.conflicts?.includes(c.number)) return { ok: false, reason: "conflicts in 1 file(s): a.rs" };
        state.merged.push(fetched);
        return { ok: true, commit: `commit${c.number}` };
      },
      changed: async () => {
        const number = state.merged.at(-1)!;
        return { crates: script.crates?.[number] ?? [], tests: script.tests?.[number] ?? [] };
      },
      resetTo: async sha => {
        const list = sha.slice("head:".length);
        state.merged = list ? list.split(",").map(Number) : [];
        state.calls.push(`reset ${sha}`);
      },
    };
    return { repo, state };
  };

  const gates = (
    rules: {
      cargo?: (crates: string[]) => boolean;
      tests?: (files: string[]) => boolean;
      smoke: (merged: number[]) => boolean;
    },
    state: { merged: number[] },
    calls: string[] = [],
  ): Gates => ({
    cargoCheck: async crates => {
      calls.push(`cargo ${crates.join(",")}`);
      return { ok: rules.cargo?.(crates) ?? true, tail: "cargo tail" };
    },
    prTests: async files => {
      calls.push(`tests ${files.join(",")}`);
      return { ok: rules.tests?.(files) ?? true, tail: "tests tail" };
    },
    smoke: async () => {
      calls.push(`smoke ${state.merged.join(",")}`);
      return { ok: rules.smoke(state.merged), tail: "smoke tail" };
    },
  });

  test("green PRs are kept and the smoke suite runs once for the batch", async () => {
    const { repo, state } = fakeRepo({ crates: { 1: ["bun_a"] }, tests: { 2: ["test/js/bun/x.test.ts"] } });
    const calls: string[] = [];
    const result = await processBatch({
      candidates: [candidate(1), candidate(2), candidate(3)],
      repo,
      gates: gates({ smoke: () => true }, state, calls),
      baseChanged: false,
      log: quiet,
    });
    expect(result.outcomes.map(outcome => [outcome.number, outcome.state])).toEqual([
      [1, "merged"],
      [2, "merged"],
      [3, "merged"],
    ]);
    expect(result.outcomes[0]).toMatchObject({ ourCommit: "commit1", result: "ok", headSha: "sha1" });
    expect(calls).toEqual(["cargo bun_a", "tests test/js/bun/x.test.ts", "smoke 1,2,3"]);
    expect(result).toMatchObject({ pushable: true, smokeRuns: 1 });
    expect(state.merged).toEqual([1, 2, 3]);
  });

  test("a conflict or a failed per-PR gate is reverted and recorded; later PRs build on the clean state", async () => {
    const { repo, state } = fakeRepo({
      conflicts: [1],
      crates: { 2: ["bun_b"], 3: ["bun_c"] },
      tests: { 3: ["test/x.test.ts"] },
    });
    const result = await processBatch({
      candidates: [candidate(1), candidate(2), candidate(3), candidate(4)],
      repo,
      gates: gates({ cargo: crates => !crates.includes("bun_b"), tests: () => false, smoke: () => true }, state),
      baseChanged: false,
      log: quiet,
    });
    expect(result.outcomes.map(outcome => [outcome.number, outcome.state, outcome.result])).toEqual([
      [1, "conflict", "conflict"],
      [2, "red", "cargo-check"],
      [3, "red", "pr-tests"],
      [4, "merged", "ok"],
    ]);
    expect(result.outcomes[1]!.reason).toContain("cargo check -p bun_b");
    expect(result.outcomes[1]!.reason).toContain("cargo tail");
    expect(result.outcomes[2]!.reason).toContain("bun bd test test/x.test.ts");
    expect(state.merged).toEqual([4]);
  });

  test("a red batch smoke drops the last PR until green and records the dropped ones red", async () => {
    const { repo, state } = fakeRepo();
    const calls: string[] = [];
    const result = await processBatch({
      candidates: [candidate(1), candidate(2), candidate(3)],
      repo,
      gates: gates({ smoke: merged => !merged.includes(2) }, state, calls),
      baseChanged: false,
      log: quiet,
    });
    expect(calls.filter(call => call.startsWith("smoke"))).toEqual(["smoke 1,2,3", "smoke 1,2", "smoke 1"]);
    expect(result.outcomes.map(outcome => [outcome.number, outcome.state, outcome.result])).toEqual([
      [1, "merged", "ok"],
      [2, "red", "smoke"],
      [3, "red", "smoke"],
    ]);
    expect(result.outcomes[2]!.ourCommit).toBeUndefined();
    expect(result).toMatchObject({ pushable: true, smokeRuns: 3 });
    expect(state.merged).toEqual([1]);
  });

  test("smoke red with every PR dropped means the base is red: nothing may be pushed", async () => {
    const { repo, state } = fakeRepo();
    const result = await processBatch({
      candidates: [candidate(1)],
      repo,
      gates: gates({ smoke: () => false }, state),
      baseChanged: true,
      log: quiet,
    });
    expect(result.pushable).toBe(false);
    expect(result.outcomes[0]).toMatchObject({ state: "red", result: "smoke" });
    expect(state.merged).toEqual([]);
  });

  test("no smoke run when nothing new would be pushed; an upstream merge alone is smoke-tested", async () => {
    const { repo, state } = fakeRepo({ conflicts: [1] });
    const calls: string[] = [];
    const idle = await processBatch({
      candidates: [candidate(1)],
      repo,
      gates: gates({ smoke: () => true }, state, calls),
      baseChanged: false,
      log: quiet,
    });
    expect(calls).toEqual([]);
    expect(idle).toMatchObject({ pushable: true, smoke: null });
    const based = await processBatch({
      candidates: [],
      repo,
      gates: gates({ smoke: () => true }, state, calls),
      baseChanged: true,
      log: quiet,
    });
    expect(calls).toEqual(["smoke "]);
    expect(based.pushable).toBe(true);
  });

  test("--no-build probes conflicts only and leaves the clone as it was", async () => {
    const { repo, state } = fakeRepo({ conflicts: [2] });
    const result = await processBatch({
      candidates: [candidate(1), candidate(2)],
      repo,
      gates: null,
      baseChanged: false,
      log: quiet,
    });
    expect(result.outcomes.map(outcome => [outcome.number, outcome.state])).toEqual([
      [1, "skipped-this-run"],
      [2, "conflict"],
    ]);
    expect(state.merged).toEqual([]);
    expect(result.smoke).toBeNull();
  });
});

describe("helpers", () => {
  test("lock: second holder is refused, a dead holder is taken over", () => {
    const dir = mkdtempSync(join(tmpdir(), "upstream-sync-test-"));
    const lock = join(dir, "lock");
    const release = acquireLock(lock, 111, () => true);
    expect(release).not.toBeNull();
    expect(readFileSync(lock, "utf8")).toBe("111");
    expect(acquireLock(lock, 222, () => true)).toBeNull();
    const taken = acquireLock(lock, 333, () => false);
    expect(taken).not.toBeNull();
    expect(readFileSync(lock, "utf8")).toBe("333");
    taken!();
    expect(existsSync(lock)).toBe(false);
    writeFileSync(lock, "444");
    expect(acquireLock(lock, 555, pid => pid === 444)).toBeNull();
  });

  test("report timestamps are unique per second and tails are bounded", () => {
    expect(stamp(new Date("2026-11-21T02:27:15.123Z"))).toBe("20261121T022715Z");
    expect(tailOf(Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n"), 3)).toBe("line 97\nline 98\nline 99");
    expect(tailOf("x".repeat(5000)).length).toBe(1500);
  });
});
