import { describe, expect, test } from "bun:test";
import { tempDir } from "harness";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { apply, rewrite } from "../../scripts/aphrody/scope.ts";
import { sync } from "../../scripts/aphrody/sync-upstream.ts";
import { dependencyOrder, inventory, plan, verifyIntegrity } from "../../scripts/aphrody/monorepo-delivery.ts";
import { createHash } from "node:crypto";
import { nativePlan } from "../../scripts/aphrody/delivery-native.ts";

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

describe("monorepo delivery", () => {
  test("native plans preserve dry-run semantics and reject source version drift", () => {
    const common =
      "name: fixture\non:\n  workflow_dispatch:\n    inputs:\n      version:\n        type: string\n      dry-run:\n        type: boolean\n        default: false\n      publish-npm:\n        type: boolean\n        default: true\nenv:\n  BUN_HOST_VERSION: aphrody-v1.4.3-aphrody.4\njobs:\n  plan:\n    if: github.repository == 'aphrody-labs/bun' || github.repository == 'aphrody-labs/bun-os'\n    runs-on: ubuntu-latest\n";
    using dir = tempDir("native-delivery-plan", {
      "package.json": JSON.stringify({ name: "bun", version: "1.4.4" }),
      ".github/workflows/aphrody-publish-native.yml": common,
      ".github/workflows/aphrody-release.yml": common,
    });
    const root = String(dir);
    git(root, "init", "--quiet", "--initial-branch=main");
    git(root, "config", "user.email", "test@example.com");
    git(root, "config", "user.name", "test");
    git(root, "remote", "add", "bun-os", "https://github.com/aphrody-labs/bun-os.git");
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "-m", "workflow");
    const plugin = nativePlan(root, "aphrody-labs/bun-os", "main", "native");
    expect(plugin.inputs["dry-run"]).toBe("true");
    expect(plugin.blockers).toEqual([]);
    expect(plugin.source.workflowSha256).toMatch(/^[a-f0-9]{64}$/);
    const runtime = nativePlan(root, "aphrody-labs/bun-os", "main", "runtime");
    expect(runtime.inputs["publish-npm"]).toBe("false");
    expect(runtime.blockers[0]).toContain("publishes GitHub release assets");
    expect(nativePlan(root, "aphrody-labs/bun-os", "main", "runtime", true, "1.4.5").blockers[0]).toContain(
      "differs from source",
    );
  });

  test("inventory reads immutable Git manifests, excludes regression fixtures, and retains lock checksums", () => {
    using dir = tempDir("delivery-pins", {
      "package.json": JSON.stringify({ name: "bun", private: true, version: "1.4.4" }),
      "Cargo.toml": "[workspace]\nresolver = '3'\n",
      "Cargo.lock":
        "version = 4\n[[package]]\nname = 'external'\nversion = '1.2.3'\nsource = 'registry+https://github.com/rust-lang/crates.io-index'\nchecksum = 'abc'\n",
      "packages/bun-types/package.json": JSON.stringify({ name: "@aphrody/bun-types", version: "1.4.4" }),
      "test/fixtures/package.json": "invalid syntax intentionally",
      "vendor/native/LICENSE": "License notice retained",
      "scripts/build/deps/native.ts":
        "const pin = '1234567890123456789012345678901234567890'; const source = 'https://github.com/owner/native'; const file = 'lib/native';\n",
    });
    const root = String(dir);
    git(root, "init", "--quiet", "--initial-branch=main");
    git(root, "config", "user.email", "test@example.com");
    git(root, "config", "user.name", "test");
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "-m", "source");
    const first = inventory(root);
    writeFileSync(join(root, "packages/bun-types/package.json"), JSON.stringify({ name: "wrong", version: "99" }));
    expect(inventory(root)).toEqual(first);
    expect(first.products.map(p => p.name)).toEqual(["bun", "@aphrody/bun-types"]);
    expect(first.external[0]).toMatchObject({ name: "external", checksum: "abc" });
    expect(first.vendors[0]?.tree).toMatch(/^[0-9a-f]{40}$/);
    expect(first.nativeRecipes[0]?.repositories).toEqual(["https://github.com/owner/native"]);
    expect(plan(first, "release-check").steps.find(s => s.id === "npm")?.command).toContain("--dry-run");
    expect(plan(first, "release-check").steps.some(s => s.command.includes("--publish"))).toBe(false);
    const build = plan(first, "build", root);
    expect(build.steps.find(s => s.id === "pack:@aphrody/bun-types")?.command).toContain("--ignore-scripts");
    expect(build.unsupported).toEqual([]);
  });

  test("dependency ordering rejects cycles instead of publishing partially ordered products", () => {
    expect(
      dependencyOrder([
        { name: "consumer", dependencies: ["base"] },
        { name: "base", dependencies: [] },
      ]).map(p => p.name),
    ).toEqual(["base", "consumer"]);
    expect(() =>
      dependencyOrder([
        { name: "a", dependencies: ["b"] },
        { name: "b", dependencies: ["a"] },
      ]),
    ).toThrow("Dependency cycle");
  });

  test("one-click installation refuses changed archive bytes", () => {
    const original = new TextEncoder().encode("qualified tarball");
    const integrity = `sha512-${createHash("sha512").update(original).digest("base64")}`;
    expect(() => verifyIntegrity(original, integrity)).not.toThrow();
    expect(() => verifyIntegrity(new TextEncoder().encode("changed tarball"), integrity)).toThrow("integrity mismatch");
    expect(() => verifyIntegrity(original, "sha1-legacy")).toThrow("unsupported digest");
  });
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

  test("a conflict in a file the repository owns keeps the local version", async () => {
    const { dir, root } = forkRepo("aphrody-sync-owned");
    using _ = dir;
    writeFileSync(join(root, "README.md"), "# Bun\n\nUpstream intro.\n");
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "-m", "base readme");
    git(root, "branch", "-f", "upstream");

    git(root, "checkout", "--quiet", "upstream");
    writeFileSync(join(root, "README.md"), "# Bun\n\nNew upstream intro.\n");
    writeFileSync(join(root, README), "# bun-plugin-yaml\n\nbun add bun-plugin-yaml\n\nUpstream usage.\n");
    git(root, "commit", "--quiet", "-am", "upstream: readme");

    git(root, "checkout", "--quiet", "main");
    await apply(root, true);
    writeFileSync(join(root, "README.md"), "# Aphrody runtime\n\nComponent intro.\n");
    git(root, "commit", "--quiet", "-am", "fork: readme");

    const result = await sync(options(root));

    expect(result).toMatchObject({ status: "merged", behind: 1, kept: ["README.md"], pushed: false });
    expect({
      readme: readFileSync(join(root, "README.md"), "utf8"),
      package: readFileSync(join(root, README), "utf8"),
    }).toEqual({
      readme: "# Aphrody runtime\n\nComponent intro.\n",
      package: "# @aphrody/bun-plugin-yaml\n\nbun add @aphrody/bun-plugin-yaml\n\nUpstream usage.\n",
    });
    expect(git(root, "status", "--porcelain")).toBe("");
  }, 30000);

  test("nothing to merge is a no-op", async () => {
    const { dir, root } = forkRepo("aphrody-sync-noop");
    using _ = dir;
    expect(await sync(options(root))).toEqual({ status: "up-to-date", behind: 0 });
  });
});
