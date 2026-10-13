import { expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import { nativeCapacity, nativeOwnerPrerequisites, nativeWorkerInput, nativeLinuxCPUs } from "./release-native-worker";
import { nativeFullReleasePlan } from "./release-matrix";
import { qualifyNativeWinget } from "./release-native-install";

test("native capacity rejects small hosted machines instead of qualifying from their labels", () => {
  const GiB = 1024 ** 3;
  const available = { freeDisk: 24 * GiB, freeMemory: 7 * GiB, cpus: 4 };
  expect(nativeCapacity(available).maxJobs).toBe(2);
  for (const changed of [{ freeDisk: 14 * GiB }, { freeMemory: 5 * GiB }, { cpus: 1 }, { freeDisk: NaN }])
    expect(() => nativeCapacity({ ...available, ...changed })).toThrow("capacity insufficient");
});

test("Linux affinity honors assigned CPU IDs rather than assuming the host starts at CPU zero", () => {
  expect(nativeLinuxCPUs("Cpus_allowed_list:\t128-131\n")).toBe("128,129");
  expect(nativeLinuxCPUs("Cpus_allowed_list:\t3,7-9\n")).toBe("3,7");
  for (const mask of ["", "Cpus_allowed_list:\t0\n", "Cpus_allowed_list:\t9-3\n"])
    expect(() => nativeLinuxCPUs(mask)).toThrow();
});

test("native worker rejects moving refs, foreign targets and products inside the checkout", () => {
  using directory = tempDir("native-worker-input", {});
  const sourceRoot = join(String(directory), "source");
  const out = join(String(directory), "products");
  const args = ["windows-x64", "a".repeat(40), "1.4.4", out];
  expect(nativeWorkerInput(args, sourceRoot).source).toBe(args[1]!);
  for (const bad of [
    ["windows-x64", "main", "1.4.4", out],
    ["windows-x64", "a".repeat(40), "1.4.4", join(sourceRoot, "products")],
    ["wasm", "a".repeat(40), "1.4.4", out],
    [...args, "--skip-gates"],
  ])
    expect(() => nativeWorkerInput(bad, sourceRoot)).toThrow();
});

test("current complete SDK absence remains a concrete failure for every native producer", () => {
  for (const allocation of nativeFullReleasePlan("a".repeat(40)).targets) {
    const missing = nativeOwnerPrerequisites(allocation.target);
    expect(missing.some(cause => cause.includes("pinned ffmpeg SDK assets absent"))).toBe(true);
    expect(missing.some(cause => cause.includes("pinned mpv SDK assets absent"))).toBe(true);
    if (allocation.target !== "windows-x64") expect(missing.some(cause => cause.includes("Sharp/Remotion"))).toBe(true);
    if (allocation.target.endsWith("-musl")) {
      expect(allocation.nativeABIContainer).toBe("alpine:3.24");
      expect(allocation.controlBootstrap.url).not.toContain("-musl.zip");
      expect(allocation.bootstrap.url).toContain("-musl.zip");
    }
  }
});

test("Winget fixture cannot modify the local workstation through the native CI helper", async () => {
  using directory = tempDir("native-winget-boundary", {});
  let called = false;
  await expect(
    qualifyNativeWinget({
      root: String(directory),
      scratch: String(directory),
      target: "windows-x64",
      source: "a".repeat(40),
      version: "1.4.4",
      runtime: join(String(directory), "bun.exe"),
      archive: join(String(directory), "bun.zip"),
      run: async () => {
        called = true;
        return "";
      },
    }),
  ).rejects.toThrow();
  expect(called).toBe(false);
});
