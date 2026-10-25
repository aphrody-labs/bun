import { expect, test } from "bun:test";
import { releaseTargets } from "./build-host.ts";
import {
  fullIntegrationPolicy,
  runtimeFlavorArgs,
  runtimeFlavorManifest,
  runtimeReleaseMatrix,
  vpsRuntimeReleasePlan,
  nativeFullReleasePlan,
  windowsRuntimeReleasePlan,
} from "./release-matrix.ts";

test("eight full native allocations bind public bootstraps without claiming qualification", () => {
  const plan = nativeFullReleasePlan("a".repeat(40));
  expect(plan.qualified).toBe(false);
  expect(plan.targets).toHaveLength(8);
  expect(plan.maxJobs).toBe(2);
  for (const target of plan.targets) {
    expect(target.bootstrap.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(target.bootstrap.url).toStartWith("https://github.com/aphrody-labs/bun/releases/download/");
    expect(target.command).toContain("-j2");
    expect(target.command).toContain("--coreutils=on");
    expect(target.command).toContain("--video-native=on");
    for (const flag of ["curl-native", "browser-crawl", "browser-index", "google-search"])
      expect(target.command.filter(value => value === `--${flag}=on`)).toHaveLength(1);
    expect(target.requires.join(" ")).toContain("native");
  }
  expect(() => nativeFullReleasePlan("main")).toThrow("exact source revision");
});

test("both compiled flavors preserve every upstream release target", () => {
  const matrix = runtimeReleaseMatrix();
  expect(matrix).toHaveLength(releaseTargets.length * 2);
  for (const target of releaseTargets) {
    const perf = matrix.find(item => item.target === target.target && item.flavor === "perf")!;
    const full = matrix.find(item => item.target === target.target && item.flavor === "full")!;
    expect(perf.triplet).toBe(target.triplet);
    expect(full.triplet).toBe(target.triplet + "-full");
    expect(perf.coreutils).toBe(false);
    expect(full.coreutils).toBe(true);
    expect(runtimeFlavorArgs(perf)).toContain("--coreutils=off");
    expect(runtimeFlavorArgs(full)).toContain("--coreutils=on");
    expect(runtimeFlavorArgs(full)).toContain("--lto=on");
  }
  expect(new Set(matrix.map(target => target.triplet)).size).toBe(matrix.length);
});

test("matrix validates targets, duplicates and immutable source provenance", () => {
  expect(() => runtimeReleaseMatrix(["wasm"])).toThrow("unknown target");
  expect(() => runtimeReleaseMatrix(["linux-x64", "linux-x64"])).toThrow("Duplicate");
  const target = runtimeReleaseMatrix(["windows-x64"])[1]!;
  expect(() => runtimeFlavorManifest(target, "main")).toThrow("exact source revision");
  const manifest = runtimeFlavorManifest(target, "a".repeat(40));
  expect(manifest.performanceQualified).toBe(false);
  expect(manifest.compiledFeatures.coreutils).toBe(true);
  expect(manifest.compiledFeatures).toEqual({
    coreutils: true,
    videoNative: true,
    curlNative: true,
    browserCrawl: true,
    browserIndex: true,
    googleSearch: true,
  });
  expect(manifest.asset).toBe("bun-windows-x64-full.zip");
  expect(manifest.completeIntegrationQualified).toBe(false);
  expect(fullIntegrationPolicy.pendingOwners.map(owner => owner.id)).toContain("browser-render-stealth");
  expect(runtimeFlavorArgs(target, false, "aphrody.9")).toContain("--version-tag=aphrody.9");
});

test("full integration policy accounts for every requested feature combination", async () => {
  const config = await Bun.file(new URL("../../tools/config/fusion-features.json", import.meta.url)).json();
  const described = [
    ...fullIntegrationPolicy.alwaysLinkedOwners,
    ...fullIntegrationPolicy.optionalLinkedOwners,
    ...fullIntegrationPolicy.pendingOwners.map(owner => owner.id),
  ].sort();
  expect(described).toEqual(config.combinations.map((owner: { id: string }) => owner.id).sort());
  expect(fullIntegrationPolicy.pendingOwners.every(owner => owner.blockers.length > 0)).toBe(true);
  expect(runtimeFlavorArgs(runtimeReleaseMatrix(["linux-x64"])[1]!)).not.toContain("--all-features");
});

test("VPS release plan keeps execution with the serialized Infra resource owner", () => {
  const plan = vpsRuntimeReleasePlan("a".repeat(40), ["linux-x64", "windows-x64"], "b".repeat(40));
  expect(plan.steps).toHaveLength(4);
  expect(plan.host).toBe("vps");
  expect(plan.parallelHeavyJobs).toBe(1);
  expect(plan.reserveDiskGiB).toBe(32);
  expect(plan.reserveMemoryGiB).toBe(8);
  expect(plan.memoryPerJobGiB).toBe(1);
  expect(plan.maxJobs).toBe(12);
  expect(plan.linkThreads).toBe(12);
  expect(plan.source).toBe("/home/ubuntu/src/bun");
  expect(plan.lock).toBe("/home/ubuntu/build/locks/heavy.lock");
  for (const step of plan.steps) {
    expect(step.command.slice(0, 3)).toEqual([
      "bun",
      "/home/ubuntu/src/aphrody/packages/infra/workspace/src/build-factory-cleanup.ts",
      "/home/ubuntu/src/bun/tools/config/fusion-factory.json",
    ]);
    expect(step.directory).toBe(plan.source);
    expect(step.command).toContain("-j12");
    expect(step.command).toContain("--link-threads=12");
    expect(step.command).toContain("--cache-dir=/home/ubuntu/build/bun/factory/cache");
    expect(
      step.command.some(arg => arg.startsWith("--build-dir=/home/ubuntu/build/bun/factory/artifacts/runtime-release/")),
    ).toBe(true);
  }
  expect(plan.wasm.runtimeQualified).toBe(false);
  if (!plan.mullvadSidecar) throw new Error("Linux full release plan must include its Mullvad sidecar");
  expect(plan.mullvadSidecar.target).toBe("x86_64-unknown-linux-gnu");
  expect(plan.mullvadSidecar.workingDirectory).toBe(`${plan.source}/plugins/vpn/vendor/mullvad`);
  expect(plan.mullvadSidecar.lock).toBe("/home/ubuntu/build/locks/heavy.lock");
  expect(plan.mullvadSidecar.outputDirectory).toBe("/home/ubuntu/build/bun/factory/artifacts/runtime-release");
  expect(plan.mullvadSidecar.workDirectory).toContain("/home/ubuntu/build/bun/factory/transient/mullvad-");
  expect(plan.mullvadSidecar.log).toBe(
    "/home/ubuntu/build/bun/factory/artifacts/runtime-release/mullvad-linux-x64.log",
  );
  expect(plan.mullvadSidecar.runtimeLinked).toBe(false);
  expect(plan.mullvadSidecar.performanceQualified).toBe(false);
  expect(plan.mullvadSidecar.relayList).toEqual([
    "bun",
    "scripts/aphrody/mullvad-sidecar.ts",
    "relay",
    `${plan.source}/plugins/vpn/vendor/mullvad/target/x86_64-unknown-linux-gnu/release/relay-list`,
    `${plan.mullvadSidecar.workDirectory}/relays.json`,
  ]);
});

test("VPS resource budgets share the factory config without changing generic native allocation", async () => {
  const config = await Bun.file(new URL("../../tools/config/fusion-factory.json", import.meta.url)).json();
  const plan = vpsRuntimeReleasePlan("a".repeat(40), ["windows-x64"]);
  expect(plan.source).toBe(config.workspaceRoot);
  expect(config.repositories["bun-os"]).toBe(plan.source);
  expect(plan.maxJobs).toBe(config.rust.maxJobs);
  expect(plan.reserveDiskGiB).toBe(config.resources.reserveDiskGiB);
  expect(plan.reserveMemoryGiB).toBe(config.resources.reserveMemoryGiB);
  expect(plan.memoryPerJobGiB).toBe(config.resources.memoryPerJobGiB);
  const native = nativeFullReleasePlan("a".repeat(40));
  expect(native.maxJobs).toBe(2);
  expect(native.parallelHeavyJobsPerHost).toBe(1);
  expect(native.targets.find(target => target.target === "windows-x64")!.command).toContain("-j2");
  expect(native.targets.every(target => !target.command.includes("-j12"))).toBe(true);
  const windows = windowsRuntimeReleasePlan("a".repeat(40), ["windows-x64"]);
  expect(windows.maxJobs).toBe(2);
  expect(windows.parallelHeavyJobs).toBe(1);
  expect(windows.steps.every(step => step.command.includes("-j2") && !step.command.includes("-j12"))).toBe(true);
});
