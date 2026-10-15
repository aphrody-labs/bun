import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inputFiles } from "./generate";

test("plugin inputs follow the documentation navigation and its selected source files", async () => {
  const root = mkdtempSync(join(tmpdir(), "bun-plugin-doc-inputs-"));
  try {
    const navigation = {
      tabs: [{ tab: "Runtime", groups: [{ group: "APIs", pages: ["/runtime/first", "runtime/fallback"] }] }],
    };
    await Bun.write(join(root, "docs/docs.json"), JSON.stringify({ navigation }));
    await Bun.write(join(root, "docs/runtime/first.mdx"), "---\ntitle: First\n---\n");
    await Bun.write(join(root, "docs/runtime/first.md"), "unused lower-priority source");
    await Bun.write(join(root, "docs/runtime/fallback.md"), "---\ntitle: Fallback\n---\n");
    await Bun.write(join(root, "docs/chromium/sources/unrelated.md"), "unrelated archived documentation");
    expect(inputFiles(root)).toEqual(
      [
        join(root, "docs/docs.json"),
        join(root, "docs/runtime/fallback.md"),
        join(root, "docs/runtime/first.mdx"),
      ].sort(),
    );
    await Bun.write(join(root, "docs/runtime/fallback.mdx"), "---\ntitle: Preferred source\n---\n");
    const changed = inputFiles(root);
    expect(changed).toContain(join(root, "docs/runtime/fallback.mdx"));
    expect(changed).not.toContain(join(root, "docs/runtime/fallback.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32")(
  "plugin dependency discovery does not traverse unrelated documentation archives",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "bun-plugin-doc-archive-"));
    try {
      await Bun.write(join(root, "docs/docs.json"), JSON.stringify({ navigation: { pages: ["runtime/current"] } }));
      await Bun.write(join(root, "docs/runtime/current.mdx"), "---\ntitle: Current\n---\n");
      const archive = join(root, "docs/chromium/sources");
      mkdirSync(archive, { recursive: true });
      symlinkSync(join(root, "missing-archive-source"), join(archive, "unavailable"));
      expect(inputFiles(root)).toEqual([join(root, "docs/docs.json"), join(root, "docs/runtime/current.mdx")].sort());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
