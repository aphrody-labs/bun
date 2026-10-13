import { expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "harness";
import {
  bindingPlan,
  cefTargetEnvironment,
  generatedBindingPaths,
  qualifyBindings,
} from "../../scripts/aphrody/cef-rs-bindings";
import { CEF_RS_REVISION, validateCEFSourcePath, verifyCEF_RS } from "../../scripts/aphrody/vendor-cef-rs";
import { CHROMIUM_BASE_REVISION, CHROMIUM_REVISION } from "../../scripts/aphrody/cef";

test("CEF binding plans use exact owner headers, the native wrapper and all three generated surfaces", () => {
  using directory = tempDir("cef-rs-owner-headers", {});
  const headers = String(directory);
  expect(cefTargetEnvironment("x86_64-pc-windows-msvc", headers)).toEqual({ CEF_PATH_windows_x86_64: headers });
  expect(cefTargetEnvironment("aarch64-unknown-linux-gnu", headers)).toEqual({ CEF_PATH_linux_aarch64: headers });
  const plan = bindingPlan("x86_64-pc-windows-msvc", headers, "win32", "fixture-bun");
  expect(plan.argv.slice(-4)).toEqual(["--", "--bindgen", "--target", "x86_64-pc-windows-msvc"]);
  expect(plan.argv[2]).toBe("--msvc");
  expect(plan.outputs).toEqual([
    "sys/src/bindings/x86_64_pc_windows_msvc.rs",
    "cef/src/bindings/x86_64_pc_windows_msvc.rs",
    "cef/src/resources/x86_64_pc_windows_msvc.rs",
  ]);
  expect(plan.chromiumVersion).toBe("157.0.8099.0");
  expect(plan.chromiumRevision).toBe(CHROMIUM_REVISION);
  expect(plan.chromiumBaseRevision).toBe(CHROMIUM_BASE_REVISION);
  expect(plan.chromiumRevision).not.toBe(plan.chromiumBaseRevision);
});

test("CEF source receipts reject drift and unsafe archive paths", async () => {
  using directory = tempDir("cef-rs-source-receipt", { "LICENSE": "fixture license" });
  const sha256 = new Bun.CryptoHasher("sha256").update("fixture license").digest("hex");
  await Bun.write(
    join(String(directory), ".bun-vendor.json"),
    JSON.stringify({ schema: 1, revision: CEF_RS_REVISION, files: [{ path: "LICENSE", size: 15, sha256 }] }),
  );
  expect(await verifyCEF_RS(String(directory))).toEqual({ revision: CEF_RS_REVISION, files: 1 });
  await Bun.write(join(String(directory), "LICENSE"), "changed fixture");
  await expect(verifyCEF_RS(String(directory))).rejects.toThrow("cef-rs source drift: LICENSE");
  for (const path of ["../outside", "a/../outside", "/absolute", "C:/absolute", "a\\outside", ".git/config"]) {
    expect(() => validateCEFSourcePath(path)).toThrow(`Invalid cef-rs source path: ${path}`);
  }
});

test("CEF source-generated bindings cannot qualify from an unrelated prebuilt native receipt", async () => {
  using directory = tempDir("cef-rs-native-receipt-mismatch", {});
  const target = "x86_64-pc-windows-msvc";
  const filename = generatedBindingPaths(target)[0]!.replace(/\.rs$/, ".bun-cef.json");
  const generated = {
    schema: 1,
    target,
    cefRevision: "owner-cef",
    chromiumRevision: "owner-chromium",
    chromiumVersion: "157.0.8099.0",
    apiVersion: 15600,
    qualification: "source-generated",
  };
  await Bun.write(join(String(directory), filename), JSON.stringify(generated));
  await Bun.write(
    join(String(directory), ".bun-cef-build.json"),
    JSON.stringify({ ...generated, chromiumVersion: "152.0.7977.83", apiHash: "synthetic" }),
  );
  await expect(qualifyBindings(target, String(directory), String(directory))).rejects.toThrow(
    "Native CEF and generated bindings do not match (chromiumVersion)",
  );
});
