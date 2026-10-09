import { describe, expect, test } from "bun:test";
import { tempDir } from "harness";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { apply, rewrite } from "../../scripts/aphrody/scope.ts";
import { sync } from "../../scripts/aphrody/sync-upstream.ts";

describe("scope rewrite", () => {
  test("a manifest renames itself and local dependencies, not registry ones", () => {
    const manifest = JSON.stringify(
      {
        name: "bun-plugin-yaml",
        devDependencies: { "bun-types": "canary", "bun-inspector-protocol": "workspace:*" },
      },
      null,
      2,
    );
    expect(JSON.parse(rewrite("packages/bun-plugin-yaml/package.json", manifest))).toEqual({
      name: "@aphrody/bun-plugin-yaml",
      devDependencies: { "bun-types": "canary", "@aphrody/bun-inspector-protocol": "workspace:*" },
    });
  });

  test("mdx-rs platform packages are scoped, their binaries are not", () => {
    const manifest = `{\n  "name": "bun-mdx-rs-linux-x64-gnu",\n  "main": "bun-mdx-rs.linux-x64-gnu.node"\n}\n`;
    expect(rewrite("packages/bun-build-mdx-rs/npm/linux-x64-gnu/package.json", manifest)).toBe(
      `{\n  "name": "@aphrody/bun-mdx-rs-linux-x64-gnu",\n  "main": "bun-mdx-rs.linux-x64-gnu.node"\n}\n`,
    );
  });

  test("code rewrites string literals but keeps relative paths", () => {
    const code = `import a from "bun-inspector-protocol";\nimport b from "../../bun-inspector-protocol/index.ts";\n`;
    expect(rewrite("packages/x/src/a.ts", code)).toBe(
      `import a from "@aphrody/bun-inspector-protocol";\nimport b from "../../bun-inspector-protocol/index.ts";\n`,
    );
  });

  test("prose rewrites bare names, keeps paths, URLs and lines about upstream", () => {
    const md = [
      "bun add -d @types/bun bun-plugin-svelte",
      "See packages/bun-plugin-svelte and https://npmjs.com/package/bun-plugin-svelte.",
      "Upstream publishes bun-types as @types/bun.",
    ].join("\n");
    expect(rewrite("packages/bun-plugin-svelte/README.md", md)).toBe(
      [
        "bun add -d @aphrody/bun-types @aphrody/bun-plugin-svelte",
        "See packages/bun-plugin-svelte and https://npmjs.com/package/bun-plugin-svelte.",
        "Upstream publishes bun-types as @types/bun.",
      ].join("\n"),
    );
  });

  test("is idempotent and leaves files outside packages/ alone", () => {
    const md = "bun add bun-plugin-yaml";
    const once = rewrite("packages/bun-plugin-yaml/README.md", md);
    expect(rewrite("packages/bun-plugin-yaml/README.md", once)).toBe(once);
    expect(rewrite("docs/typescript.mdx", "bun add -d @types/bun")).toBe("bun add -d @types/bun");
  });

  test("the checkout has no unscoped references left", async () => {
    expect(await apply(join(import.meta.dir, "..", ".."), false)).toEqual([]);
  });
});

function git(cwd: string, ...args: string[]) {
  const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
  return proc.stdout.toString().trim();
}

const README = "packages/bun-plugin-yaml/README.md";
const MANIFEST = "packages/bun-plugin-yaml/package.json";

// A repo where `upstream` is a branch that edits the same lines the fork renamed.
function forkRepo(prefix: string) {
  const dir = tempDir(prefix, {
    [README]: "# bun-plugin-yaml\n\nbun add bun-plugin-yaml\n\nUsage.\n",
    [MANIFEST]: `{\n  "name": "bun-plugin-yaml",\n  "version": "1.0.0"\n}\n`,
  });
  const root = String(dir);
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.email", "sync@example.com");
  git(root, "config", "user.name", "sync");
  git(root, "config", "core.autocrlf", "false");
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", "base");
  git(root, "branch", "upstream");
  return { dir, root };
}

const options = (root: string) => ({
  root,
  remote: "origin",
  ref: "upstream",
  branch: "main",
  fetch: false,
  push: false,
  dryRun: false,
  keepConflicts: false,
  index: false,
});

describe("sync-upstream", () => {
  test("conflicts that only differ by the rename merge, upstream changes are kept", async () => {
    const { dir, root } = forkRepo("aphrody-sync-clean");
    using _ = dir;

    git(root, "checkout", "--quiet", "upstream");
    writeFileSync(join(root, README), "# bun-plugin-yaml\n\nbun add bun-plugin-yaml@2\n\nUsage.\n");
    writeFileSync(join(root, MANIFEST), `{\n  "name": "bun-plugin-yaml",\n  "version": "2.0.0"\n}\n`);
    writeFileSync(join(root, "packages/bun-plugin-yaml/index.ts"), `export const name = "bun-plugin-yaml";\n`);
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "-m", "upstream: v2");

    git(root, "checkout", "--quiet", "main");
    await apply(root, true);
    writeFileSync(join(root, README), readFileSync(join(root, README), "utf8") + "\nFork note.\n");
    git(root, "commit", "--quiet", "-am", "fork: scope");

    const result = await sync(options(root));

    expect(result).toMatchObject({ status: "merged", behind: 1, pushed: false });
    expect(readFileSync(join(root, README), "utf8")).toBe(
      "# @aphrody/bun-plugin-yaml\n\nbun add @aphrody/bun-plugin-yaml@2\n\nUsage.\n\nFork note.\n",
    );
    expect(JSON.parse(readFileSync(join(root, MANIFEST), "utf8"))).toEqual({
      name: "@aphrody/bun-plugin-yaml",
      version: "2.0.0",
    });
    expect(readFileSync(join(root, "packages/bun-plugin-yaml/index.ts"), "utf8")).toBe(
      `export const name = "@aphrody/bun-plugin-yaml";\n`,
    );
    expect(git(root, "log", "-1", "--format=%P").split(" ")).toHaveLength(2);
    expect(git(root, "status", "--porcelain")).toBe("");
  }, 30000);

  test("a real conflict aborts the merge and reports the file", async () => {
    const { dir, root } = forkRepo("aphrody-sync-conflict");
    using _ = dir;

    git(root, "checkout", "--quiet", "upstream");
    writeFileSync(join(root, README), "# bun-plugin-yaml\n\nbun add bun-plugin-yaml\n\nUpstream usage.\n");
    git(root, "commit", "--quiet", "-am", "upstream: usage");

    git(root, "checkout", "--quiet", "main");
    writeFileSync(join(root, README), "# bun-plugin-yaml\n\nbun add bun-plugin-yaml\n\nFork usage.\n");
    git(root, "commit", "--quiet", "-am", "fork: usage");
    const before = git(root, "rev-parse", "HEAD");

    expect(await sync(options(root))).toEqual({ status: "conflicts", behind: 1, conflicts: [README] });
    expect(git(root, "rev-parse", "HEAD")).toBe(before);
    expect(git(root, "status", "--porcelain")).toBe("");
  }, 30000);

  test("nothing to merge is a no-op", async () => {
    const { dir, root } = forkRepo("aphrody-sync-noop");
    using _ = dir;
    expect(await sync(options(root))).toEqual({ status: "up-to-date", behind: 0 });
  });
});
