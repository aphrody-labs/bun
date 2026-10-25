// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { BunPython } from "bun:graph";
import { join } from "node:path";
import { tempDir } from "harness";
import { DOMAINS, SURFACE_FILES, indexSurface, plan } from "../../scripts/aphrody/google-chromium-graph";

test("graph plan covers the owned domains and separates runtime from source tools", () => {
  expect(DOMAINS).toEqual(["packages/bun-google", "packages/bun-chromium", "src/browser"]);
  expect(SURFACE_FILES).toContain("src/js/bun/google.ts");
  expect(SURFACE_FILES).toContain("scripts/aphrody/browser.ts");
  expect(SURFACE_FILES).toContain("scripts/aphrody/gn.ts");
  expect(SURFACE_FILES).toContain("packages/bun-types/chrome.d.ts");
  expect(plan("checkout", "checkout/tmp/evidence").excluded).toContain("vendor/chromium/src full source");
  expect(() => plan("checkout", "checkout/src/graph-output")).toThrow();
});

test("explicit graph keeps immutable file hashes and truthful unsupported coverage", async () => {
  using dir = tempDir("google-chromium-graph", {
    "runtime.ts": "export function owner() { return 42; } export function cli() { return owner(); }",
    "receipt.json": '{"revision":"fixture"}',
  });
  using registry = new BunPython(join(String(dir), "registry.sqlite"));
  const result = await indexSurface(
    registry,
    String(dir),
    "a".repeat(40),
    "b".repeat(64),
    join(String(dir), "output"),
    ["runtime.ts", "receipt.json", "missing.ts"],
  );
  expect(result.coverage).toMatchObject({
    files: 2,
    nativeFiles: 1,
    unresolvedFiles: 1,
    metadataOnlyFiles: 0,
    parseErrors: 0,
    missing: ["missing.ts"],
  });
  const graph = await Bun.file(result.artifact).json();
  expect(graph.links.some((edge: { relation: string }) => edge.relation === "calls")).toBe(true);
  expect(graph.nodes.find((node: { id: string }) => node.id === "file:receipt.json")).toMatchObject({
    provenance: "UNRESOLVED",
    hashKind: "content-sha256",
    sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(registry.getSnapshot(result.repository, result.snapshot)?.revision).toBe("a".repeat(40));
});

test("explicit graph rejects a path outside the source boundary", async () => {
  using dir = tempDir("google-chromium-graph-boundary", {});
  using registry = new BunPython(join(String(dir), "registry.sqlite"));
  await expect(
    indexSurface(registry, String(dir), "a".repeat(40), "b".repeat(64), join(String(dir), "output"), ["../outside.ts"]),
  ).rejects.toThrow("Invalid explicit source path");
});
