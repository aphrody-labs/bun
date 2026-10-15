import { expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "harness";
import { applyChanges, sourceVersionPlan } from "../../scripts/aphrody/win/version-sync.ts";

test("runtime version synchronization preserves independent SDK and Windows package identities", async () => {
  using directory = tempDir("runtime-version-plan", {
    "package.json": '{\n  "name": "bun",\n  "version": "1.4.4"\n}\n',
    "packages/bun-agent-plugin/package.json":
      '{\n  "name": "bun-agent-plugin",\n  "version": "1.4.4",\n  "engines": {\n    "bun": ">=1.4.4"\n  }\n}\n',
    "packages/bun-runtime-sdk/package.json": '{"name":"@aphrody/bun-runtime-sdk","version":"1.4.10"}',
    "packages/bun-windows-win32/package.json": '{"name":"@aphrody/bun-windows-win32","version":"71.0.30-preview"}',
  });
  const root = String(directory);
  const independent = ["packages/bun-runtime-sdk/package.json", "packages/bun-windows-win32/package.json"];
  const before = await Promise.all(independent.map(path => Bun.file(join(root, path)).text()));
  const plan = sourceVersionPlan(root, "1.4.5");
  expect(plan.map(change => change.path)).toEqual(["package.json", "packages/bun-agent-plugin/package.json"]);
  applyChanges(root, plan);
  expect((await Bun.file(join(root, "package.json")).json()).version).toBe("1.4.5");
  expect((await Bun.file(join(root, "packages/bun-agent-plugin/package.json")).json()).version).toBe("1.4.5");
  expect(await Promise.all(independent.map(path => Bun.file(join(root, path)).text()))).toEqual(before);
  expect(sourceVersionPlan(root, "1.4.5")).toEqual([]);
});
