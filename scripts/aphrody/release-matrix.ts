import { buildArgs, findTarget, releaseTargets, type ReleaseTarget } from "./build-host.ts";

export type RuntimeFlavor = "perf" | "full";
export type RuntimeReleaseTarget = ReleaseTarget & {
  flavor: RuntimeFlavor;
  sourceTriplet: string;
  coreutils: boolean;
};

/** This list is explicit: diagnostic and host-authority flags are not release features. */
export const fullIntegrationPolicy = {
  buildSelections: { coreutils: true, lto: true },
  alwaysLinkedOwners: ["native-html-css"],
  optionalLinkedOwners: ["native-coreutils"],
  pendingOwners: [
    { id: "portable-paint", blockers: ["Native binary renderer dispatch and platform screenshot qualification"] },
    { id: "shared-css-paint", blockers: ["Renderer feature forwarding through the existing native unit graph", "Native Bun CSS renderer linkage and cascade qualification"] },
    { id: "browser-render-stealth", blockers: ["Remaining deno_core/V8 engine ownership", "JSC DOM, event-loop and GC parity", "Platform-specific TLS and rendering qualification"] },
  ],
  incompatibleSelections: [["pgoGenerate", "pgoUse"], ["webkit=local", "webkit=prebuilt"]],
  excludedRuntimeFlags: [
    "BUN_JSC_validateExceptionChecks",
    "BUN_JSC_dumpSimulatedThrows",
    "BUN_FEATURE_FLAG_EXPERIMENTAL_DOCKER_MUTATIONS",
    "BUN_FEATURE_FLAG_EXPERIMENTAL_MCP_NATIVE_TOOLS",
  ],
} as const;

/** Preserve upstream installer asset names for the default performance flavor. */
export function runtimeReleaseMatrix(targets: string[] = []): RuntimeReleaseTarget[] {
  const selected = targets.length ? targets.map(findTarget) : releaseTargets;
  if (new Set(selected.map(target => target.target)).size !== selected.length)
    throw new Error("Duplicate release target");
  return selected.flatMap(target => (["perf", "full"] as const).map(flavor => {
    const suffix = flavor === "full" ? "-full" : "";
    return {
      ...target,
      flavor,
      coreutils: flavor === "full",
      sourceTriplet: target.triplet,
      triplet: target.triplet + suffix,
      ...(target.baselineAlias ? { baselineAlias: target.baselineAlias + suffix } : {}),
    };
  }));
}

export function runtimeFlavorArgs(target: RuntimeReleaseTarget, lto = true, versionTag?: string): string[] {
  return [...buildArgs(target, { lto, versionTag }), `--coreutils=${target.coreutils ? "on" : "off"}`];
}

export function runtimeFlavorManifest(target: RuntimeReleaseTarget, revision: string) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Release requires an exact source revision");
  return {
    schema: 1,
    revision,
    flavor: target.flavor,
    target: target.target,
    asset: `${target.triplet}.zip`,
    compiledFeatures: { coreutils: target.coreutils },
    ...(target.flavor === "full" ? { integrationPolicy: fullIntegrationPolicy, completeIntegrationQualified: false } : {}),
    runtimeFeaturePolicy: "existing-defaults-explicit-opt-in",
    performanceQualified: false,
    note: "perf names the release optimization profile; faster-than-upstream requires comparative benchmark receipts",
  };
}

/** Plan only: execution and live resources remain owned by the Infra factory. */
export function vpsRuntimeReleasePlan(revision: string, targets: string[] = []) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Factory source must be an immutable revision");
  const source = "/home/ubuntu/builds/bun-browser-fusion";
  const artifacts = "/home/ubuntu/builds/bun-os-factory/artifacts/runtime-release";
  const resource = "/home/ubuntu/src/aphrody/packages/infra/workspace/src/build-factory-cleanup.ts";
  const config = source + "/tools/config/fusion-factory.json";
  return {
    schema: 1,
    revision,
    host: "vps",
    source,
    executionOwner: "aphrody infra ssh exec --host vps",
    lock: "/home/ubuntu/build/locks/heavy.lock",
    maxJobs: 6,
    reserveDiskGiB: 8,
    reserveMemoryGiB: 2,
    parallelHeavyJobs: 1,
    requires: ["clean committed source at revision", "fresh owner factory capacity profile", "pinned sysroots and target toolchain", "native platform test receipts before stable publication"],
    steps: runtimeReleaseMatrix(targets).map(target => ({
      target,
      directory: source,
      command: ["bun", resource, config, "bun", "scripts/build.ts", ...runtimeFlavorArgs(target),
        "-j6", `--build-dir=${artifacts}/${target.triplet}`],
      qualification: target.os === "linux" && target.arch === "x64"
        ? "Native VPS and ABI container qualification required"
        : "Qualified remote platform execution required; cross compilation is insufficient",
    })),
    wasm: {
      product: "bun_wasm engine-free C ABI",
      runtimeQualified: false,
      requiredTarget: "wasm32-wasip1-threads",
      compileOwner: "serialized Cargo factory",
      blockers: ["Full Bun JavaScriptCore runtime WASM port absent", "WASI ABI integration tests and release packaging not qualified"],
    },
  };
}

if (import.meta.main) {
  const revision = process.argv[2];
  if (!revision) throw new Error("Usage: bun scripts/aphrody/release-matrix.ts <exact-revision> [target ...] (VPS plan only)");
  console.log(JSON.stringify(vpsRuntimeReleasePlan(revision, process.argv.slice(3)), null, 2));
}
