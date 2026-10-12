import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectFusionSources,
  parseMergePreview,
  redactRemoteUrl,
  summarizeOfficialHtml,
  type GitReader,
} from "./fusion-sources.ts";

const head = "a".repeat(40);
const upstream = "b".repeat(40);
const base = "c".repeat(40);
const tree = "d".repeat(40);
function reader(options: { shallow?: boolean; missing?: string; mergeCode?: number } = {}) {
  const calls: string[][] = [];
  const git: GitReader = args => {
    calls.push(args);
    const success = (stdout: string) => ({ exitCode: 0, stdout, stderr: "" });
    if (args[0] === "rev-parse" && args[1] === "--is-shallow-repository")
      return success(String(options.shallow ?? false));
    if (args[0] === "rev-parse") {
      if (args[2] === `${options.missing}^{commit}`) return { exitCode: 128, stdout: "", stderr: "missing" };
      return success(args[2] === "HEAD^{commit}" ? head : upstream);
    }
    if (args[0] === "merge-base") return success(base);
    if (args[0] === "rev-list") return success("7\t3\n");
    if (args[0] === "remote") return success("https://github.com/aphrody-labs/bun.git\n");
    if (args[0] === "cat-file") return success("");
    if (args[0] === "merge-tree")
      return {
        exitCode: options.mergeCode ?? 1,
        stdout: `${tree}\0package.json\0Cargo.lock\0\0`,
        stderr: "",
      };
    throw new Error(`Unexpected planning operation ${args.join(" ")}`);
  };
  return { git, calls };
}
async function fixture<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "bun-fusion-sources-"));
  try {
    return await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("Bun source planning", () => {
  test("pins existing refs, ancestry/counts and conflicts without mutation commands", () =>
    fixture(async root => {
      const { git, calls } = reader();
      const plan = await collectFusionSources(root, { git });
      expect(plan.refs.map(ref => ref.ref)).toEqual(["HEAD", "bun-os/main", "origin/main", "upstream/main"]);
      expect(plan.refs[3]!.comparison).toEqual({
        state: "available",
        mergeBase: base,
        ahead: 7,
        behind: 3,
      });
      expect(plan.upstreamMerge).toEqual({
        state: "conflicted",
        head,
        upstream,
        tree,
        conflicts: ["Cargo.lock", "package.json"],
      });
      expect(calls.find(args => args[0] === "merge-tree")).toEqual([
        "merge-tree",
        "--write-tree",
        "--name-only",
        "--no-messages",
        "-z",
        head,
        upstream,
      ]);
      expect(calls.some(args => ["fetch", "checkout", "merge", "add", "push"].includes(args[0]!))).toBe(false);
      expect(plan.policy.fetch).toBe(false);
    }));
  test("missing upstream is explicitly unavailable and never merged", () =>
    fixture(async root => {
      const { git, calls } = reader({ missing: "upstream/main" });
      const plan = await collectFusionSources(root, { git });
      expect(plan.refs[3]!.state).toBe("unavailable");
      expect(plan.upstreamMerge.state).toBe("unavailable");
      expect(calls.some(args => args[0] === "merge-tree")).toBe(false);
    }));
  test("shallow checkout reports refs but refuses ancestry claims and merge preview", () =>
    fixture(async root => {
      const { git, calls } = reader({ shallow: true });
      const plan = await collectFusionSources(root, { git });
      expect(plan.shallow).toBe(true);
      expect(plan.refs.every(ref => ref.comparison.state === "unavailable")).toBe(true);
      expect(plan.upstreamMerge.state).toBe("unavailable");
      expect(calls.some(args => args[0] === "merge-tree")).toBe(false);
    }));
  test("original source commit/hash is not substituted by integrated hashes", () =>
    fixture(async root => {
      const original = "e".repeat(64);
      const data = {
        sourceRepository: "https://github.com/aphrody-labs/aphrody",
        sourceRevision: upstream,
        files: [{ bytes: 12, sha256: original, integratedBytes: 30, integratedSha256: "f".repeat(64) }],
      };
      await Bun.write(join(root, "src/browser/BROWSER-MIGRATION.json"), JSON.stringify(data));
      const plan = await collectFusionSources(root, { git: reader().git });
      const ledger = plan.provenance[1]!;
      expect(ledger.sourceCommit).toBe(upstream);
      expect(ledger.originalBytes).toBe(12);
      expect(ledger.originalHashEntries).toBe(1);
      expect(ledger.sourceCommitInObjectStore).toBe(true);
      expect(plan.provenance[0]!.state).toBe("unavailable");
    }));
  test("invalid or unrelated merge output cannot be reported clean", () => {
    expect(parseMergePreview({ exitCode: 128, stdout: "", stderr: "unrelated" }, head, upstream).state).toBe(
      "unavailable",
    );
    expect(parseMergePreview({ exitCode: 0, stdout: "not-a-tree", stderr: "" }, head, upstream).state).toBe(
      "unavailable",
    );
    expect(parseMergePreview({ exitCode: 0, stdout: `${tree}\0`, stderr: "" }, head, upstream).state).toBe("clean");
  });
  test("remote receipts never retain passwords, queries or SSH logins", () => {
    expect(redactRemoteUrl("https://login:secret@github.com/aphrody-labs/bun.git?token=x#secret")).toBe(
      "https://github.com/aphrody-labs/bun.git",
    );
    expect(redactRemoteUrl("git@github.com:aphrody-labs/bun.git")).toBe("ssh://github.com/aphrody-labs/bun.git");
    expect(redactRemoteUrl("file:///private/credential-repository")).toBeNull();
  });
});

describe("bounded official research metadata", () => {
  test("extracts title/headings/official links and ignores script snippets", async () => {
    const result = await summarizeOfficialHtml(
      "https://bun.sh/docs/runtime/html-rewriter",
      `<html><head><title>HTML &amp; Bun</title><script>globalThis.doNotRun=1</script></head>
      <body><h1> Native <em>HTML</em> </h1><h2>API<script>untrusted()</script></h2>
      <a href="../fetch">Fetch API</a><a href="https://v8.dev/docs">V8</a>
      <a href="javascript:alert(1)">Bad</a><a href="https://evil.test/">Other</a></body></html>`,
    );
    expect(result.title).toBe("HTML & Bun");
    expect(result.headings).toEqual([
      { level: 1, text: "Native HTML" },
      { level: 2, text: "API" },
    ]);
    expect(result.links.map(entry => entry.url)).toEqual(["https://bun.sh/docs/fetch", "https://v8.dev/docs"]);
    expect(result.truncated).toBe(false);
  });
  test("rejects nonofficial sources and credential-bearing URLs", async () => {
    await expect(summarizeOfficialHtml("http://bun.sh/docs", "")).rejects.toThrow("Official");
    await expect(summarizeOfficialHtml("https://bun.sh.evil.test/docs", "")).rejects.toThrow("Official");
    await expect(summarizeOfficialHtml("https://secret@bun.sh/docs", "")).rejects.toThrow("Official");
  });
  test("bounds parsed input, headings, links and text", async () => {
    const html =
      "<title>" +
      "x".repeat(500) +
      "</title>" +
      Array.from({ length: 60 }, (_, i) => `<h2>Section ${i}</h2><a href="/docs/${i}">Link ${i}</a>`).join("") +
      " ".repeat(600_000);
    const result = await summarizeOfficialHtml("https://bun.sh/docs", html);
    expect(result.title.length).toBe(200);
    expect(result.headings.length).toBe(24);
    expect(result.links.length).toBe(32);
    expect(result.bytesRead).toBe(512 * 1024);
    expect(result.truncated).toBe(true);
  });
});
