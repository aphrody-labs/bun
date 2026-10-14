import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { runtimeSDKCargoArgs } from "./runtime-sdk-build";

test("standalone runtime Cargo adapter keeps the native workspace/profile and offline source contract", () => {
  const root = resolve(import.meta.dir, "../..");
  const args = runtimeSDKCargoArgs(root, "x86_64-unknown-linux-gnu");
  for (const value of ["--locked", "--offline", "runtime", "yolo-runtime", "x86_64-unknown-linux-gnu", "-j1"])
    expect(args).toContain(value);
  expect(
    args.some(
      value =>
        value.endsWith("scripts/build/rust/cargo-serial.ts") || value.endsWith("scripts\\build\\rust\\cargo-serial.ts"),
    ),
  ).toBe(true);
  for (const bad of ["host", "x86_64-unknown-linux-gnu;echo", "wasm32-wasi"])
    expect(() => runtimeSDKCargoArgs(root, bad)).toThrow();
  expect(() => runtimeSDKCargoArgs(root, "x86_64-unknown-linux-gnu", 32)).toThrow();
});
