import { expect, test } from "bun:test";
import { releaseTargets } from "./build-host.ts";
import {
  fullIntegrationPolicy,
  runtimeFlavorArgs,
  runtimeFlavorManifest,
  runtimeReleaseMatrix,
  vpsRuntimeReleasePlan,
} from "./release-matrix.ts";

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
  expect(plan.reserveDiskGiB).toBe(8);
  for (const step of plan.steps) {
    expect(step.command.slice(0, 3)).toEqual([
      "bun",
      "/home/ubuntu/src/aphrody/packages/infra/workspace/src/build-factory-cleanup.ts",
      "/home/ubuntu/builds/bun-os-factory/sources/bun/tools/config/fusion-factory.json",
    ]);
    expect(step.command).toContain("-j6");
    expect(
      step.command.some(arg =>
        arg.startsWith("--build-dir=/home/ubuntu/builds/bun-os-factory/artifacts/runtime-release/"),
      ),
    ).toBe(true);
  }
  expect(plan.wasm.runtimeQualified).toBe(false);
  expect(plan.mullvadSidecar.target).toBe("x86_64-unknown-linux-gnu");
  expect(plan.mullvadSidecar.runtimeLinked).toBe(false);
  expect(plan.mullvadSidecar.performanceQualified).toBe(false);
  expect(plan.mullvadSidecar.relayList).toEqual([
    "bun",
    "scripts/aphrody/mullvad-sidecar.ts",
    "relay",
    `${plan.source}/vendor/mullvad/target/x86_64-unknown-linux-gnu/release/relay-list`,
    "/home/ubuntu/builds/bun-os-factory/artifacts/runtime-release/mullvad/relays.json",
  ]);
});
