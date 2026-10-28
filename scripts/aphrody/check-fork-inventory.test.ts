import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkForkInventory, parseGitmodules, setupBunSteps } from "./check-fork-inventory";

const repoRoot = resolve(import.meta.dir, "..", "..");

function fixture(files: Record<string, string>, dirs: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "fork-inventory-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  for (const d of dirs) mkdirSync(join(root, d), { recursive: true });
  return root;
}

const plugin = {
  component: "foo",
  path: ["plugins/foo"],
  kind: "plugin",
  migrationState: "moved",
  destinationRepo: "https://github.com/aphrody-labs/bun-foo",
  forkMount: "plugins/foo",
  forkMountUpdate: "none",
  submoduleRevision: "a".repeat(40),
  plugin: { cli: "foo", cargoPackage: "bun_plugin_foo" },
};

const up = { component: "up", path: ["src/runtime"], kind: "upstream-owned", migrationState: "stays" };

function base(over: Record<string, string> = {}) {
  return {
    "docs/project/fork-inventory.json": JSON.stringify({ schema: 1, components: [plugin, up] }),
    ".gitmodules": `[submodule "plugins/foo"]\n\tpath = plugins/foo\n\turl = https://github.com/aphrody-labs/bun-foo.git\n\tupdate = none\n`,
    "src/runtime/cli/plugin_command.rs": `pub(crate) const PLUGINS: &[&str] = &["foo"];`,
    "scripts/build/plugins.ts": `export const plugins = [\n  { name: "foo", package: "bun_plugin_foo" },\n];`,
    ".github/workflows/aphrody-main-runtime.yml": `steps:\n  - run: for plugin in foo; do :; done\n`,
    "docs/project/add-ons.mdx": "`foo`",
    ".claude/skills/bun-add-ons/SKILL.md": "plugins/foo",
    "docs/runtime/bun-plugin.mdx": "bun-foo",
    ...over,
  };
}

describe("parseGitmodules", () => {
  test("reads path, url and update", () => {
    const m = parseGitmodules(`[submodule "a"]\n\tpath = plugins/a\n\turl = u\n\tupdate = none\n[submodule "b"]\n\tpath = plugins/b\n`);
    expect(m).toEqual([{ path: "plugins/a", url: "u", update: "none" }, { path: "plugins/b" }]);
  });
});

describe("setupBunSteps", () => {
  test("collects the with block of a local setup-bun step only", () => {
    const steps = setupBunSteps(
      [
        "steps:",
        "  - uses: ./.github/actions/setup-bun",
        "    with:",
        "      bun-version: aphrody-v1.4.3-aphrody.2",
        "      runtime: fork",
        "  - uses: oven-sh/setup-bun@abc",
        "    with:",
        "      bun-version: canary",
        "  - uses: ./.github/actions/setup-bun",
      ].join("\n"),
    );
    expect(steps).toEqual([
      { line: 2, inputs: { "bun-version": "aphrody-v1.4.3-aphrody.2", runtime: "fork" } },
      { line: 9, inputs: {} },
    ]);
  });
});

describe("checkForkInventory", () => {
  test("a consistent fixture has no errors", () => {
    const root = fixture(base(), ["plugins/foo"]);
    try {
      expect(checkForkInventory(root).errors).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a plugin missing from one list is named", () => {
    const root = fixture(base({ "scripts/build/plugins.ts": "export const plugins = [];" }), ["plugins/foo"]);
    try {
      const { errors } = checkForkInventory(root);
      expect(errors.some(e => e.startsWith("scripts/build/plugins.ts: plugins lacks plugin foo"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("known drift is a warning and a stale entry is an error", () => {
    const drifting = { ...plugin, knownDrift: ["scripts/build/plugins.ts"] };
    const files = base({
      "docs/project/fork-inventory.json": JSON.stringify({ schema: 1, components: [drifting, up] }),
      "scripts/build/plugins.ts": "export const plugins = [];",
    });
    const root = fixture(files, ["plugins/foo"]);
    try {
      const r = checkForkInventory(root);
      expect(r.errors).toEqual([]);
      expect(r.warnings.some(w => w.includes("known drift of foo"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    const stale = fixture(
      base({ "docs/project/fork-inventory.json": JSON.stringify({ schema: 1, components: [drifting, up] }) }),
      ["plugins/foo"],
    );
    try {
      expect(checkForkInventory(stale).errors).toEqual(["foo: knownDrift scripts/build/plugins.ts no longer applies, remove it"]);
    } finally {
      rmSync(stale, { recursive: true, force: true });
    }
  });

  test("a mount missing from the inventory and an uncovered directory are errors", () => {
    const root = fixture(
      base({ ".gitmodules": base()[".gitmodules"] + `[submodule "plugins/bar"]\n\tpath = plugins/bar\n\turl = x\n` }),
      ["plugins/foo", "packages/stray"],
    );
    try {
      const { errors } = checkForkInventory(root);
      expect(errors.some(e => e.startsWith(".gitmodules plugins/bar has no inventory component"))).toBe(true);
      expect(errors.some(e => e.startsWith("packages/stray is not covered"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("CI: a fork tag needs runtime fork, and fork-only commands are refused", () => {
    const wf = [
      "env:",
      '  BUN_HOST_VERSION: "aphrody-v1.4.3-aphrody.4"',
      "steps:",
      "  - uses: ./.github/actions/setup-bun",
      "    with:",
      "      bun-version: ${{ env.BUN_HOST_VERSION }}",
      "  - run: bun n2b src",
      "  - run: bun n2b src # legacy fork binary",
    ].join("\n");
    const root = fixture(base({ ".github/workflows/x.yml": wf }), ["plugins/foo"]);
    try {
      const { errors } = checkForkInventory(root);
      expect(errors.filter(e => e.startsWith(".github/workflows/x.yml"))).toEqual([
        ".github/workflows/x.yml:4: setup-bun asks for the fork runtime (aphrody-v1.4.3-aphrody.4) without `runtime: fork`",
        ".github/workflows/x.yml:7: `bun n2b` exists only in the fork binary (add the workflow to ci.forkBinaryWorkflows or mark the line legacy)",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("this repository's inventory, mounts, plugin lists and CI runtime agree", () => {
    expect(checkForkInventory(repoRoot).errors).toEqual([]);
  });
});
