// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { qualifyCore, validateCore } from "./core.ts";
import { main as forge } from "./forge.ts";

const identity = {
  schema: "buv-core/1",
  name: "buv",
  version: "1.3.14-dev.1",
  revision: "a".repeat(40),
  engine: "JavaScriptCore",
  webkit: "b".repeat(40),
  graph: true,
};

test("native identity requires the graph, exact engine revisions and version", () => {
  expect(validateCore(identity)).toEqual(identity);
  for (const patch of [
    { graph: false },
    { engine: "V8" },
    { name: "vu" },
    { revision: "unknown" },
    { webkit: "15.0.245.2" },
    { version: "not-a-version" },
  ]) {
    expect(() => validateCore({ ...identity, ...patch })).toThrow("invalid Buv core identity");
  }
});

test("forge rejects legacy sidecar build steps before any build or fetch", async () => {
  await expect(forge(["--steps", "uv,buv"])).rejects.toThrow("owner factory builds the core");
  await expect(forge(["--steps", "core"])).rejects.toThrow("provide --buv");
  await expect(forge(["--steps", "fetch"])).rejects.toThrow("--allow-network");
});

test.skipIf(!process.env["BUV_TEST_EXECUTABLE"])(
  "provided native core exposes the builtin and embedded UV",
  async () => {
    const core = await qualifyCore(process.env["BUV_TEST_EXECUTABLE"]!);
    expect(core.graph).toBe(true);
    expect(core.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(core.uv).toMatch(/^uv 0\.12\.24(?:\s|$)/);
  },
);
