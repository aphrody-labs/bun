// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { tempDir } from "../../../test/harness.ts";
import { coreCandidates, selectCore, validateCore } from "./core.ts";
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
  await expect(forge(["--steps", "fetch"])).rejects.toThrow("--allow-network");
  await expect(forge(["--steps=fetch"])).rejects.toThrow("--allow-network");
  await expect(forge(["--buv"])).rejects.toThrow("--buv requires a value");
  await expect(forge(["--workspace="])).rejects.toThrow("--workspace requires a value");
});

const extension = process.platform === "win32" ? ".exe" : "";

test("core selection honors the configured executable before checkout discovery", () => {
  expect(
    coreCandidates({
      executable: "chosen core",
      workspace: "ignored checkout",
      env: { BUV_EXECUTABLE: "ignored core", APHRODY_BUN_CHECKOUT: "ignored environment checkout" },
    }),
  ).toEqual([resolve("chosen core")]);
  expect(coreCandidates({ env: { BUV_EXECUTABLE: "environment core", APHRODY_BUN_CHECKOUT: "ignored" } })).toEqual([
    resolve("environment core"),
  ]);
});

test("checkout discovery selects native debug then release paths", () => {
  const expected = [
    resolve("checkout", "build", "debug", `bun-debug${extension}`),
    resolve("checkout", "build", "release", `bun${extension}`),
  ];
  expect(coreCandidates({ workspace: "checkout", env: { APHRODY_BUN_CHECKOUT: "ignored" } })).toEqual(expected);
  expect(coreCandidates({ env: { APHRODY_BUN_CHECKOUT: "checkout" } })).toEqual(expected);
});

test("core selection rejects absent configuration and invalid explicit values without searching PATH", () => {
  expect(() => coreCandidates({ env: { PATH: resolve(process.execPath, "..") } })).toThrow("provide --buv");
  expect(() => coreCandidates({ executable: "", env: { BUV_EXECUTABLE: process.execPath } })).toThrow(
    "invalid native core executable path",
  );
  expect(() => coreCandidates({ workspace: "", env: { APHRODY_BUN_CHECKOUT: "ignored" } })).toThrow(
    "invalid Bun workspace path",
  );
  expect(() => coreCandidates({ executable: "bad\0path", env: {} })).toThrow("invalid native core executable path");
  expect(() => coreCandidates({ workspace: "bad\0path", env: {} })).toThrow("invalid Bun workspace path");
});

test.concurrent("a missing explicit core never selects an environment or checkout binary", async () => {
  using dir = tempDir("buv-core-missing", {});
  const missing = join(String(dir), `missing${extension}`);
  await expect(
    selectCore({ executable: missing, workspace: String(dir), env: { BUV_EXECUTABLE: process.execPath } }),
  ).rejects.toThrow(`native core executable is missing; checked ${missing}`);
});

test.concurrent("a missing checkout core reports both candidates", async () => {
  using dir = tempDir("buv-core-checkout-missing", {});
  const options = { workspace: String(dir), env: {} };
  await expect(selectCore(options)).rejects.toThrow(
    `native core executable is missing; checked ${coreCandidates(options).join(", ")}`,
  );
});

test.concurrent("a present debug directory cannot redirect selection to release", async () => {
  using dir = tempDir("buv-core-directory", {
    [`build/debug/bun-debug${extension}/marker`]: "directory",
    [`build/release/bun${extension}`]: "unqualified release",
  });
  await expect(selectCore({ workspace: String(dir), env: {} })).rejects.toThrow(
    `native core is not a file: ${join(String(dir), "build", "debug", `bun-debug${extension}`)}`,
  );
});

for (const profile of ["debug", "release"] as const) {
  test.concurrent(`a selected ${profile} binary must qualify before use`, async () => {
    const binary = profile === "debug" ? `bun-debug${extension}` : `bun${extension}`;
    using dir = tempDir("buv-core-unqualified", {
      [`build/${profile}/${binary}`]: "unqualified core",
      ...(profile === "debug" ? { [`build/release/bun${extension}`]: "unqualified release" } : {}),
    });
    await expect(selectCore({ workspace: String(dir), env: {} })).rejects.toThrow(
      `native core qualification failed: ${join(String(dir), "build", profile, binary)}`,
    );
  });
}

test.skipIf(!process.env["BUV_TEST_EXECUTABLE"])(
  "provided native core exposes the builtin and embedded UV",
  async () => {
    const core = await selectCore({ executable: process.env["BUV_TEST_EXECUTABLE"]!, env: {} });
    expect(core.graph).toBe(true);
    expect(core.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(core.uv).toMatch(/^uv 0\.12\.24(?:\s|$)/);
  },
);
