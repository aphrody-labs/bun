import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findWorkspaceRoot } from "./workspace-paths";

const previous = process.env.APHRODY_SOURCE_WORKSPACE;
const roots: string[] = [];
afterEach(() => {
  if (previous === undefined) delete process.env.APHRODY_SOURCE_WORKSPACE;
  else process.env.APHRODY_SOURCE_WORKSPACE = previous;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("workspace discovery returns no root when every ancestor lacks the marker", () => {
  delete process.env.APHRODY_SOURCE_WORKSPACE;
  const root = mkdtempSync(join(tmpdir(), "bun-workspace-missing-"));
  roots.push(root);
  expect(findWorkspaceRoot(join(root, "child", "leaf"))).toBeUndefined();
});

test("workspace discovery honors a reviewed override and rejects a missing marker", async () => {
  const root = mkdtempSync(join(tmpdir(), "bun-workspace-configured-"));
  roots.push(root);
  process.env.APHRODY_SOURCE_WORKSPACE = root;
  expect(() => findWorkspaceRoot()).toThrow("expected WORKSPACE.md");
  await Bun.write(join(root, "WORKSPACE.md"), "Fixture workspace\n");
  expect(findWorkspaceRoot()).toBe(root);
  delete process.env.APHRODY_SOURCE_WORKSPACE;
  expect(findWorkspaceRoot(join(root, "child", "leaf"))).toBe(root);
});
