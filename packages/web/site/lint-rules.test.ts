import { expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "../../../test/harness";
import { readRulePages } from "./build";

test("rule pages missing from the navigation are published, unlisted, in the Linter tab", () => {
  using dir = tempDir("lint-rules", {
    "lint/rules/index.mdx": "---\ntitle: Rules\n---\n",
    "lint/rules/eslint/eqeqeq.mdx": "---\ntitle: eqeqeq\n---\n",
    "lint/rules/node/no-unsupported-features/node-builtins.mdx": "---\ntitle: x\n---\n",
    "lint/rules/eslint/notes.txt": "ignored",
  });
  const pages = readRulePages(String(dir), new Set(["lint/rules/index"]));
  expect(pages).toEqual([
    { slug: "lint/rules/eslint/eqeqeq", tab: "Linter", group: "Rules", unlisted: true },
    { slug: "lint/rules/node/no-unsupported-features/node-builtins", tab: "Linter", group: "Rules", unlisted: true },
  ]);
});

test("no rule page is left out for the real docs tree", () => {
  const docs = join(import.meta.dir, "..", "..", "..", "docs");
  const pages = readRulePages(docs, new Set(["lint/rules/index"]));
  const count = (dir: string): number =>
    readdirSync(dir, { withFileTypes: true }).reduce(
      (n, e) => n + (e.isDirectory() ? count(join(dir, e.name)) : /\.mdx$/.test(e.name) ? 1 : 0),
      0,
    );
  expect(existsSync(join(docs, "lint", "rules"))).toBe(true);
  expect(pages.length).toBe(count(join(docs, "lint", "rules")) - 1);
  expect(pages.length).toBeGreaterThan(1000);
  expect(new Set(pages.map(p => p.slug)).size).toBe(pages.length);
});
