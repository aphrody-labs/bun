import { expect, test } from "bun:test";
import { jitArchivePaths, productionReceiptQualified } from "./auto-publish";

test("Windows publication consumes the existing immutable JIT source archive contract", async () => {
  const paths = jitArchivePaths(await Bun.file(new URL("./auto-publish.sh", import.meta.url)).text());
  expect(paths).toContain("packages/web/site");
  expect(paths).toContain("packages/bun-cloudflare");
  expect(paths).toContain("packages/bun-agent-plugin");
  expect(paths).toContain("scripts/aphrody");
  expect(paths).not.toContain("node_modules");
  expect(() =>
    jitArchivePaths('git -C "$checkout" archive "$site_source" ../provider-store | tar -x -C "$work"'),
  ).toThrow();
  expect(() => jitArchivePaths('git -C "$checkout" archive "$site_source" /credentials | tar -x -C "$work"')).toThrow();
});

test("task activation requires one confirmed static and database production source", () => {
  const commit = "a".repeat(40);
  const receipt = {
    commit,
    evidence: "b".repeat(64),
    snapshot: { source: commit },
    deployment: { source: commit, qualified: true, dryRun: false },
  };
  expect(productionReceiptQualified(receipt)).toBe(true);
  expect(productionReceiptQualified({ ...receipt, deployment: { ...receipt.deployment, dryRun: true } })).toBe(false);
  expect(productionReceiptQualified({ ...receipt, snapshot: { source: "c".repeat(40) } })).toBe(false);
  expect(productionReceiptQualified({ ...receipt, deployment: { ...receipt.deployment, qualified: false } })).toBe(
    false,
  );
  expect(productionReceiptQualified({ commit, deployment: receipt.deployment })).toBe(false);
});
