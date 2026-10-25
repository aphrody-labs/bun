// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GpuRuntime as SharedGpuRuntime } from "../bun-runtime-sdk/src/gpu.ts";
import { GpuRuntime } from "./gpu.ts";

const root = import.meta.dir;

test("Buv exposes the shared SDK without a parallel runtime workspace", () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  expect(packageJson.name).toBe("@aphrody/buv");
  expect(packageJson.private).toBe(true);
  expect(packageJson.dependencies).toBeUndefined();
  expect(Object.keys(packageJson.exports)).toEqual([
    "./runtime-sdk",
    "./gpu",
    "./runtime-artifact",
    "./runtime-release",
  ]);
  expect(GpuRuntime).toBe(SharedGpuRuntime);
  expect(packageJson.main).toBeUndefined();
  expect(existsSync(join(root, "Cargo.toml"))).toBe(false);
  expect(existsSync(join(root, "Cargo.lock"))).toBe(false);
  expect(existsSync(join(root, "crates", "buv", "Cargo.toml"))).toBe(false);
  expect(existsSync(join(root, "crates", "buv-runtime", "Cargo.toml"))).toBe(false);
});

test("UV has exactly one source checkout and fetch never creates project vendors", () => {
  const vendor = JSON.parse(readFileSync(join(root, "vendor.json"), "utf8"));
  expect(vendor.sources).toHaveLength(1);
  expect(vendor.sources[0]).toMatchObject({
    name: "uv",
    path: "../../plugins/uv/vendor/uv",
    upstreamTag: "0.12.24",
    ref: "f3e56e16e0302e26ea456cb51b676b35958572a0",
    embedded: true,
  });
  const fetch = readFileSync(join(root, "scripts", "fetch.ts"), "utf8");
  expect(fetch).not.toContain("git clone");
  expect(fetch).not.toContain("fetchSource");
  expect(readFileSync(join(root, ".gitignore"), "utf8")).not.toMatch(/^\/vendor\/$/m);
  expect(existsSync(join(root, "vendor"))).toBe(false);
});

test("the Bun CLI owns the only Python compiler source", () => {
  const compiler = join(root, "..", "..", "src", "runtime", "cli", "python_compile.py");
  const dispatch = readFileSync(join(root, "..", "..", "src", "runtime", "cli", "python_compile.rs"), "utf8");
  expect(existsSync(compiler)).toBe(true);
  expect(dispatch).toContain('include_str!("python_compile.py")');
  expect(dispatch).not.toContain("packages/buv");
});
