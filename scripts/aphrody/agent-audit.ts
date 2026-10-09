// Fact-check of agent work in a checkout: `bun scripts/aphrody/agent-audit.ts [--base REF] [--json]`.
// Checks (each finding is a failure): commit messages (attribution), pushed state, added lines
// (allow(dead_code), stash-like leftovers), docs nav targets, Cargo workspace members, skill frontmatter,
// untracked crates/packages that no manifest references.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type Finding = { check: string; where: string; detail: string };

const ATTRIBUTION = /co-authored-by|generated with|\bclaude\b|anthropic|\bchatgpt\b|\bcopilot\b|\bgemini\b(?! cli)/i;

function git(root: string, ...args: string[]): string {
  const p = Bun.spawnSync({ cmd: ["git", "-C", root, ...args], stdout: "pipe", stderr: "pipe" });
  return p.stdout.toString();
}

export function auditCommits(root: string, base: string): Finding[] {
  const out: Finding[] = [];
  const log = git(root, "log", "--format=%H%x00%B%x01", `${base}..HEAD`);
  for (const rec of log.split("\x01")) {
    const [sha, body] = rec.trim().split("\x00");
    if (sha && body && ATTRIBUTION.test(body)) {
      out.push({ check: "commit-attribution", where: sha.slice(0, 11), detail: body.split("\n")[0] });
    }
  }
  const unpushed = git(root, "rev-list", "--count", `${base}..HEAD`).trim();
  if (unpushed && unpushed !== "0") {
    out.push({ check: "unpushed", where: base, detail: `${unpushed} commit(s) not on ${base}` });
  }
  return out;
}

export function auditAddedLines(root: string, base: string): Finding[] {
  const out: Finding[] = [];
  const diff = git(root, "diff", "--unified=0", "--no-color", `${base}..HEAD`, "--", "src", "packages", "scripts");
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) file = line.slice(6);
    else if (line.startsWith("+") && !line.startsWith("+++") && file.endsWith(".rs")) {
      if (/#!?\[allow\((dead_code|unused)/.test(line))
        out.push({ check: "allow-escape", where: file, detail: line.slice(1).trim() });
    }
  }
  return out;
}

function walkPages(node: unknown, pages: string[]) {
  if (typeof node === "string") pages.push(node);
  else if (Array.isArray(node)) for (const n of node) walkPages(n, pages);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) if (k === "pages" || typeof v === "object") walkPages(v, pages);
}

export function auditDocsNav(root: string): Finding[] {
  const file = join(root, "docs", "docs.json");
  if (!existsSync(file)) return [];
  const pages: string[] = [];
  walkPages(JSON.parse(readFileSync(file, "utf8")).navigation, pages);
  const out: Finding[] = [];
  for (const p of new Set(pages)) {
    if (!p.startsWith("/")) continue;
    const base = join(root, "docs", p.slice(1));
    if (!existsSync(base + ".mdx") && !existsSync(base + ".md") && !existsSync(join(base, "index.mdx")))
      out.push({ check: "docs-nav", where: "docs/docs.json", detail: `${p} has no page` });
  }
  return out;
}

export function auditWorkspace(root: string): Finding[] {
  const file = join(root, "Cargo.toml");
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8");
  const members =
    /members\s*=\s*\[([\s\S]*?)\]/
      .exec(text)?.[1]
      .match(/"([^"]+)"/g)
      ?.map(s => s.slice(1, -1)) ?? [];
  const out: Finding[] = [];
  for (const m of members)
    if (!existsSync(join(root, m, "Cargo.toml")))
      out.push({ check: "workspace-member", where: "Cargo.toml", detail: `${m} has no Cargo.toml` });
  return out;
}

export function auditSkills(root: string): Finding[] {
  const dir = join(root, ".claude", "skills");
  if (!existsSync(dir)) return [];
  const out: Finding[] = [];
  for (const name of readdirSync(dir)) {
    const skill = join(dir, name, "SKILL.md");
    if (!statSync(join(dir, name)).isDirectory()) continue;
    if (!existsSync(skill)) {
      out.push({ check: "skill", where: relative(root, join(dir, name)), detail: "no SKILL.md" });
      continue;
    }
    const fm = /^---\n([\s\S]*?)\n---/.exec(readFileSync(skill, "utf8"))?.[1] ?? "";
    const n = /^name:\s*(.+)$/m.exec(fm)?.[1].trim();
    if (n !== name)
      out.push({ check: "skill", where: relative(root, skill), detail: `name ${n ?? "missing"} != directory ${name}` });
    if (!/^description:\s*\S/m.test(fm))
      out.push({ check: "skill", where: relative(root, skill), detail: "no description" });
  }
  return out;
}

export function auditUntracked(root: string): Finding[] {
  const out: Finding[] = [];
  for (const f of git(
    root,
    "ls-files",
    "-o",
    "--exclude-standard",
    "-z",
    "--",
    "src/*/Cargo.toml",
    "packages/*/Cargo.toml",
  )
    .split("\0")
    .filter(Boolean))
    out.push({ check: "untracked-crate", where: f.replace(/\/Cargo\.toml$/, ""), detail: "crate not committed" });
  return out;
}

export function audit(root: string, base: string): Finding[] {
  return [
    ...auditCommits(root, base),
    ...auditAddedLines(root, base),
    ...auditDocsNav(root),
    ...auditWorkspace(root),
    ...auditSkills(root),
    ...auditUntracked(root),
  ];
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "origin/main";
  const root = git(process.cwd(), "rev-parse", "--show-toplevel").trim() || process.cwd();
  const findings = audit(root, base);
  if (args.includes("--json")) console.log(JSON.stringify(findings, null, 2));
  else for (const f of findings) console.log(`${f.check}\t${f.where}\t${f.detail}`);
  process.exit(findings.length ? 1 : 0);
}
