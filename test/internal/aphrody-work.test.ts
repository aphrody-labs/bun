// scripts/aphrody/work.ts: file de lots, propriétaires, vérifications par chemin. Hermétique (dossiers temporaires).
import { expect, test } from "bun:test";
import { tempDir } from "harness";
import { gateFor, gatesFor, loadQueue, nextLot, ownerOf, saveQueue, type Lot } from "../../scripts/aphrody/work.ts";

const lots: Lot[] = [
  { id: "A", goal: "a", paths: ["src/vfs", "docs/x.mdx"], status: "done" },
  { id: "B", goal: "b", paths: ["src/mcp"], status: "todo" },
  { id: "C", goal: "c", paths: ["src/lsp"], status: "active" },
];

test("nextLot prefers active, then todo, then nothing", () => {
  expect(nextLot(lots)?.id).toBe("C");
  expect(nextLot(lots.filter(l => l.status !== "active"))?.id).toBe("B");
  expect(nextLot(lots.filter(l => l.status === "done"))).toBeUndefined();
});

test("ownerOf matches path prefixes on directory boundaries", () => {
  expect(ownerOf("src/vfs/index.rs", lots)).toBe("A");
  expect(ownerOf("docs/x.mdx", lots)).toBe("A");
  expect(ownerOf("src/vfs_other/a.rs", lots)).toBe("sans-lot");
  expect(ownerOf("src/lsp/lib.rs", lots)).toBe("C");
});

test("queue round-trips through the JSON file", () => {
  using dir = tempDir("work-queue", { "scripts/aphrody/.keep": "" });
  const root = String(dir);
  expect(loadQueue(root)).toEqual([]);
  saveQueue(root, lots);
  expect(loadQueue(root)).toEqual(lots);
});

test("gateFor maps paths to the right checks and dedupes", () => {
  using dir = tempDir("work-gates", {
    "src/foo/Cargo.toml": '[package]\nname = "bun_foo"\n',
    "src/foo/lib.rs": "",
    "scripts/aphrody/thing.ts": "",
    "test/internal/aphrody-thing.test.ts": "",
    "docs/a.mdx": "",
  });
  const root = String(dir);
  expect(gateFor(root, "src/foo/lib.rs")).toEqual([["cargo", "check", "-p", "bun_foo", "--all-targets"]]);
  expect(gateFor(root, "scripts/aphrody/thing.ts")).toEqual([["bun", "test", "test/internal/aphrody-thing.test.ts"]]);
  expect(gateFor(root, "scripts/aphrody/none.ts")).toEqual([]);
  expect(gateFor(root, "test/cli/x/y.test.ts")).toEqual([["bun", "bd", "test", "test/cli/x/y.test.ts"]]);
  expect(gateFor(root, "docs/a.mdx")).toEqual([["bun", "scripts/aphrody/agent-audit.ts"]]);
  expect(gatesFor(root, ["src/foo/lib.rs", "src/foo/Cargo.toml"])).toHaveLength(1);
});
