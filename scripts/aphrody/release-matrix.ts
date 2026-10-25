import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildArgs, findTarget, releaseTargets, type ReleaseTarget } from "./build-host.ts";
import { createMullvadBuildPlan } from "./mullvad-sidecar.ts";
import { findWorkspaceRoot } from "./workspace-paths.ts";
import bootstraps from "./release-bootstraps.json";
import factory from "../../tools/config/fusion-factory.json";

export type RuntimeFlavor = "perf" | "full";
export type RuntimeReleaseTarget = ReleaseTarget & {
  flavor: RuntimeFlavor;
  sourceTriplet: string;
  coreutils: boolean;
};

export const fullNativeRuntimeFeatures = {
  coreutils: true,
  videoNative: true,
  curlNative: true,
  browserCrawl: true,
  browserIndex: true,
  googleSearch: true,
} as const;

const fullNativeRuntimeFlags = Object.keys(fullNativeRuntimeFeatures).map(
  name => `--${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}=on`,
);

/** This list is explicit: diagnostic and host-authority flags are not release features. */
export const fullIntegrationPolicy = {
  buildSelections: { ...fullNativeRuntimeFeatures, lto: true },
  alwaysLinkedOwners: ["native-html-css"],
  optionalLinkedOwners: ["native-coreutils"],
  pendingOwners: [
    { id: "portable-paint", blockers: ["Native binary renderer dispatch and platform screenshot qualification"] },
    {
      id: "shared-css-paint",
      blockers: [
        "Renderer feature forwarding through the existing native unit graph",
        "Native Bun CSS renderer linkage and cascade qualification",
      ],
    },
    {
      id: "browser-render-stealth",
      blockers: [
        "Remaining deno_core/V8 engine ownership",
        "JSC DOM, event-loop and GC parity",
        "Platform-specific TLS and rendering qualification",
      ],
    },
  ],
  incompatibleSelections: [
    ["pgoGenerate", "pgoUse"],
    ["webkit=local", "webkit=prebuilt"],
  ],
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
  return selected.flatMap(target =>
    (["perf", "full"] as const).map(flavor => {
      const suffix = flavor === "full" ? "-full" : "";
      return {
        ...target,
        flavor,
        coreutils: flavor === "full",
        sourceTriplet: target.triplet,
        triplet: target.triplet + suffix,
        ...(target.baselineAlias ? { baselineAlias: target.baselineAlias + suffix } : {}),
      };
    }),
  );
}

export function runtimeFlavorArgs(target: RuntimeReleaseTarget, lto = true, versionTag?: string): string[] {
  return [
    ...buildArgs(target, { lto, ...(versionTag !== undefined ? { versionTag } : {}) }),
    ...(target.flavor === "full" ? fullNativeRuntimeFlags : ["--coreutils=off"]),
  ];
}

/** Native execution allocation; a runner label and a public bootstrap are not qualification. */
export function nativeFullReleasePlan(revision: string) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Native release requires an exact source revision");
  if (bootstraps.schema !== 1 || bootstraps.repository !== "aphrody-labs/bun")
    throw new Error("Unknown release bootstrap owner");
  return {
    schema: 1,
    source: revision,
    maxJobs: 2,
    parallelHeavyJobsPerHost: 1,
    qualified: false,
    targets: runtimeReleaseMatrix()
      .filter(target => target.flavor === "full")
      .map(target => {
        const bootstrap = bootstraps.bootstraps[target.target as keyof typeof bootstraps.bootstraps];
        if (
          !bootstrap ||
          !/^[a-f0-9]{40}$/.test(bootstrap.source) ||
          !/^[a-f0-9]{64}$/.test(bootstrap.sha256) ||
          !/^aphrody-v[0-9A-Za-z.+-]+$/.test(bootstrap.tag) ||
          !Number.isSafeInteger(bootstrap.bytes) ||
          bootstrap.bytes < 1 ||
          bootstrap.bytes > 2 * 1024 ** 3 ||
          bootstrap.url !==
            `https://github.com/aphrody-labs/bun/releases/download/${bootstrap.tag}/${target.sourceTriplet}.zip`
        )
          throw new Error(`Missing pinned owner bootstrap: ${target.target}`);
        return {
          target: target.target,
          triplet: target.triplet,
          runner: target.runner,
          platform: target.os === "windows" ? "win32" : target.os,
          arch: target.arch === "aarch64" ? "arm64" : "x64",
          ...(target.container ? { nativeABIContainer: target.container } : {}),
          bootstrap,
          controlBootstrap:
            bootstraps.bootstraps[target.target.replace(/-musl$/, "") as keyof typeof bootstraps.bootstraps],
          command: ["bun", "bd", ...runtimeFlavorArgs(target), "-j2"],
          assemblyOwner: "scripts/aphrody/media-release.ts",
          sdkOwner: "scripts/aphrody/media-sdk-factory.ts",
          qualificationOwner: "scripts/aphrody/release-aggregation.ts",
          requires: [
            "fresh disk/memory preflight and existing heavy lock",
            "bootstrap byte checksum, native architecture/version/revision/sourceUrl execution",
            "source checkout exactly at source SHA and clean owned inputs",
            "pinned native toolchain and target sysroot",
            "complete FFmpeg/mpv SDK built and executed on this native ABI",
            "changed-binary regressions, dependency closure, install/PATH/update receipts",
            ...(target.os === "windows" ? ["native Winget manifest validation and install receipt"] : []),
          ],
        };
      }),
  };
}

export function runtimeFlavorManifest(target: RuntimeReleaseTarget, revision: string) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Release requires an exact source revision");
  return {
    schema: 1,
    revision,
    flavor: target.flavor,
    target: target.target,
    asset: `${target.triplet}.zip`,
    compiledFeatures: target.flavor === "full" ? fullNativeRuntimeFeatures : { coreutils: false },
    ...(target.flavor === "full"
      ? { integrationPolicy: fullIntegrationPolicy, completeIntegrationQualified: false }
      : {}),
    runtimeFeaturePolicy: "existing-defaults-explicit-opt-in",
    performanceQualified: false,
    note: "perf names the release optimization profile; faster-than-upstream requires comparative benchmark receipts",
  };
}

/** Plan only: execution and live resources remain owned by the Infra factory. */
export function vpsRuntimeReleasePlan(revision: string, targets: string[] = [], mullvadSource?: string) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Factory source must be an immutable revision");
  const source = factory.workspaceRoot;
  const artifacts = `${factory.artifactRoot}/runtime-release`;
  const mullvadWork = `${factory.cleanup.transientRoot}/mullvad-${revision.slice(0, 12)}`;
  const resource = "/home/ubuntu/src/aphrody/packages/infra/workspace/src/build-factory-cleanup.ts";
  const config = source + "/tools/config/fusion-factory.json";
  const selected = runtimeReleaseMatrix(targets);
  const needsMullvad = selected.some(target => target.target === "linux-x64");
  const mullvad = needsMullvad ? createMullvadBuildPlan(revision, mullvadSource ?? revision) : undefined;
  return {
    schema: 1,
    revision,
    host: "vps",
    source,
    executionOwner: "aphrody infra ssh exec --host vps",
    lock: factory.lockPath,
    maxJobs: factory.rust.maxJobs,
    linkThreads: factory.rust.maxJobs,
    reserveDiskGiB: factory.resources.reserveDiskGiB,
    reserveMemoryGiB: factory.resources.reserveMemoryGiB,
    memoryPerJobGiB: factory.resources.memoryPerJobGiB,
    parallelHeavyJobs: 1,
    requires: [
      "clean committed source at revision",
      "fresh owner factory capacity profile",
      "pinned sysroots and target toolchain",
      "native platform test receipts before stable publication",
    ],
    steps: selected.map(target => ({
      target,
      directory: source,
      command: [
        "bun",
        resource,
        config,
        "bun",
        "scripts/build.ts",
        ...runtimeFlavorArgs(target),
        `-j${factory.rust.maxJobs}`,
        `--link-threads=${factory.rust.maxJobs}`,
        `--cache-dir=${factory.cacheRoot}`,
        `--build-dir=${artifacts}/${target.triplet}`,
      ],
      qualification:
        target.os === "linux" && target.arch === "x64"
          ? "Native VPS and ABI container qualification required"
          : "Qualified remote platform execution required; cross compilation is insufficient",
    })),
    wasm: {
      product: "bun_wasm engine-free C ABI",
      runtimeQualified: false,
      requiredTarget: "wasm32-wasip1-threads",
      compileOwner: "serialized Cargo factory",
      blockers: [
        "Full Bun JavaScriptCore runtime WASM port absent",
        "WASI ABI integration tests and release packaging not qualified",
      ],
    },
    ...(mullvad
      ? {
          mullvadSidecar: {
            target: mullvad.target,
            asset: mullvad.asset,
            outputDirectory: artifacts,
            workDirectory: mullvadWork,
            log: `${artifacts}/mullvad-linux-x64.log`,
            sourcePath: "plugins/vpn/vendor/mullvad",
            workingDirectory: `${source}/plugins/vpn/vendor/mullvad`,
            lock: mullvad.factoryLock,
            mullvadSource: mullvad.mullvadSource,
            build: mullvad.cargo,
            smoke: mullvad.smoke,
            relayList: [
              "bun",
              "scripts/aphrody/mullvad-sidecar.ts",
              "relay",
              `${source}/${mullvad.fetchRelayList}`,
              `${mullvadWork}/relays.json`,
            ],
            package: [
              "bun",
              "scripts/aphrody/mullvad-sidecar.ts",
              "package",
              revision,
              mullvad.mullvadSource,
              artifacts,
              `${mullvadWork}/relays.json`,
            ],
            qualification:
              "Native x86_64 Linux VPS build, daemon/CLI smoke and management-interface tests; no live tunnel activation",
            archiveContents: mullvad.files,
            deploymentRequirements: mullvad.requirements,
            runtimeLinked: false,
            performanceQualified: false,
          },
        }
      : {}),
  };
}

/** Native Windows workstation plan; it cannot stand in for the VPS release matrix. */
export function windowsRuntimeReleasePlan(revision: string, targets: string[] = ["windows-x64", "windows-aarch64"]) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Factory source must be an immutable revision");
  const selected = runtimeReleaseMatrix(targets);
  if (selected.some(target => target.os !== "windows"))
    throw new Error("The Omar PC factory accepts Windows targets only");
  let source = process.env.APHRODY_BUN_CHECKOUT ? resolve(process.env.APHRODY_BUN_CHECKOUT) : undefined;
  if (!source) {
    const workspace = findWorkspaceRoot(process.cwd());
    const workspaceCheckout = workspace && join(workspace, "bun");
    if (workspaceCheckout && existsSync(join(workspaceCheckout, "scripts/build.ts"))) source = workspaceCheckout;
  }
  source ??= resolve(import.meta.dir, "../..");
  source = source.replaceAll("\\", "/").replace(/\/$/, "");
  const artifacts = `${source}/artifacts/runtime-release`;
  return {
    schema: 1,
    revision,
    host: "omar-pc",
    target: "windows-x64",
    source,
    executionOwner: "local Windows workstation",
    lock: `${source}/artifacts/locks/heavy.lock`,
    maxJobs: 2,
    reserveDiskGiB: 20,
    reserveMemoryGiB: 6,
    parallelHeavyJobs: 1,
    requires: [
      "clean committed source at revision",
      "MSVC 14.44 and pinned Windows SDK",
      "at least 20 GiB free disk and 6 GiB available RAM",
      "recorded toolchain and artifact hashes",
    ],
    steps: selected.map(target => ({
      target,
      directory: source,
      command: [
        "bun",
        "scripts/build.ts",
        ...runtimeFlavorArgs(target),
        "-j2",
        `--build-dir=${artifacts}/${target.triplet}`,
      ],
      qualification:
        target.target === "windows-x64"
          ? "Native x64 build; smoke-test and record receipt on omar-pc"
          : "ARM64 cross-build only; native ARM64 qualification is still required",
    })),
    publication: "Candidate artifacts only; combine with required VPS and platform receipts before stable release",
  };
}

if (import.meta.main) {
  const revision = process.argv[2];
  const [host = "vps", ...targets] = process.argv.slice(3);
  if (!revision)
    throw new Error("Usage: bun scripts/aphrody/release-matrix.ts <exact-revision> [vps|windows|native] [target ...]");
  console.log(
    JSON.stringify(
      host === "windows"
        ? windowsRuntimeReleasePlan(revision, targets.length ? targets : undefined)
        : host === "native"
          ? nativeFullReleasePlan(revision)
          : host === "vps"
            ? vpsRuntimeReleasePlan(revision, targets)
            : (() => {
                throw new Error(`unknown factory host: ${host}`);
              })(),
      null,
      2,
    ),
  );
}
