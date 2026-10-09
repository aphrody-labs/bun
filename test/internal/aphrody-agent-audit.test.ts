// scripts/aphrody/agent-audit.ts: hermetic, local git repositories in temp dirs. Run with the installed bun.
import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "harness";
import { audit } from "../../scripts/aphrody/agent-audit.ts";

function git(cwd: string, ...args: string[]) {
  const p = Bun.spawnSync({ cmd: ["git", "-c", "user.name=t", "-c", "user.email=t@t", ...args], cwd, stderr: "pipe" });
  expect(p.stderr.toString()).toBe("");
}

test("flags attribution, unpushed commits, allow escapes, dangling nav, bad skills, uncommitted crates", () => {
  using dir = tempDir("agent-audit", {
    "docs/docs.json": JSON.stringify({ navigation: { tabs: [{ groups: [{ pages: ["/index", "/missing"] }] }] } }),
    "docs/index.mdx": "x",
    "Cargo.toml": '[workspace]\nmembers = [\n  "src/a",\n  "src/ghost",\n]\nexclude = ["vendor"]\n',
    "src/a/Cargo.toml": "[package]\nname='a'\n",
    "src/b/Cargo.toml": "[package]\nname='b'\n",
    ".claude/skills/one/SKILL.md": "---\nname: other\ndescription: d\n---\n",
  });
  const root = String(dir);
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  mkdirSync(join(root, "src/a/src"), { recursive: true });
  writeFileSync(join(root, "src/a/src/lib.rs"), "#[allow(dead_code)]\nfn f() {}\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "feat: x\n\nCo-Authored-By: someone");
  mkdirSync(join(root, "src/c"), { recursive: true });
  writeFileSync(join(root, "src/c/Cargo.toml"), "x");
  const checks = audit(root, "origin/main")
    .map(f => f.check)
    .sort();
  expect(checks).toEqual(
    [
      "allow-escape",
      "commit-attribution",
      "docs-nav",
      "skill",
      "unpushed",
      "untracked-crate",
      "workspace-member",
    ].sort(),
  );
});

test("clean repository has no findings", () => {
  using dir = tempDir("agent-audit-clean", { "docs/index.mdx": "x" });
  const root = String(dir);
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  expect(audit(root, "origin/main")).toEqual([]);
});
