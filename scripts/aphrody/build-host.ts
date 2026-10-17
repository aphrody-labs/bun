// Turns a GitHub-hosted runner into the machine upstream compiles every target
// on: a Debian 13 container set up by the same steps as CI's build image
// (scripts/build/ci-images/spec.ts), so the fork's release binaries get the
// same pinned toolchain and sysroots — focal glibc 2.31 for linux-gnu, Alpine musl,
// the xwin MSVC/SDK splat for Windows and Apple's SDK for macOS — instead of
// whatever the runner's own OS links against.
//
//   bun scripts/aphrody/build-host.ts targets                       JSON matrix of release targets
//   bun scripts/aphrody/build-host.ts provision --target T --out F  writes F, a root sh script for debian:13
//   bun scripts/aphrody/build-host.ts args --target T               scripts/build.ts flags for T

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Arch } from "../agent.ts";
import { generateImage, type LinuxImage } from "../build/ci-images/spec.ts";

export type ReleaseTarget = {
  /** Matrix key and the asset name without `bun-`: `linux-x64-musl`. */
  target: string;
  os: "linux" | "darwin" | "windows";
  arch: Arch;
  abi?: "gnu" | "musl";
  /** `bun-<os>-<arch>[-musl]`: the zip and the directory inside it. */
  triplet: string;
  /** Upstream re-zips these under the historical `-baseline` name (upload-release.sh). */
  baselineAlias?: string;
  /** A GitHub runner that can execute the binary, for the smoke test. */
  runner: string;
  /** Oldest GNU runtime image in the release smoke matrix; ELF checks enforce the actual symbol-version floor. */
  container?: string;
};

/** The targets upstream builds for its releases (.buildkite/ci.ts buildPlatforms, without asan/android/freebsd). */
export const releaseTargets: ReleaseTarget[] = [
  {
    target: "linux-x64",
    os: "linux",
    arch: "x64",
    abi: "gnu",
    runner: "ubuntu-24.04",
    container: "debian:bullseye",
  },
  {
    target: "linux-aarch64",
    os: "linux",
    arch: "aarch64",
    abi: "gnu",
    runner: "ubuntu-24.04-arm",
    container: "debian:bullseye",
  },
  {
    target: "linux-x64-musl",
    os: "linux",
    arch: "x64",
    abi: "musl",
    runner: "ubuntu-24.04",
    container: "alpine:3.24",
  },
  {
    target: "linux-aarch64-musl",
    os: "linux",
    arch: "aarch64",
    abi: "musl",
    runner: "ubuntu-24.04-arm",
    container: "alpine:3.24",
  },
  { target: "darwin-aarch64", os: "darwin", arch: "aarch64", runner: "macos-15-xlarge" },
  { target: "darwin-x64", os: "darwin", arch: "x64", runner: "macos-15-large" },
  { target: "windows-x64", os: "windows", arch: "x64", runner: "windows-2025" },
  { target: "windows-aarch64", os: "windows", arch: "aarch64", runner: "windows-11-arm" },
].map(t => {
  const triplet = `bun-${t.os}-${t.arch}${t.abi === "musl" ? "-musl" : ""}`;
  const alias = t.arch === "x64" ? `${triplet}-baseline` : undefined;
  return { ...t, triplet, ...(alias ? { baselineAlias: alias } : {}) } as ReleaseTarget;
});

export function findTarget(name: string): ReleaseTarget {
  const t = releaseTargets.find(t => t.target === name);
  if (!t) throw new Error(`unknown target ${name}; known: ${releaseTargets.map(t => t.target).join(", ")}`);
  return t;
}

/** `scripts/build.ts` flags, as .buildkite/ci.ts getBuildArgs passes them (always explicit os/arch/abi). */
export function buildArgs(t: ReleaseTarget, opts: { lto: boolean; versionTag?: string }): string[] {
  return [
    "--profile=release",
    `--os=${t.os}`,
    `--arch=${t.arch}`,
    ...(t.os === "linux" ? [`--abi=${t.abi ?? "gnu"}`] : []),
    `--lto=${opts.lto ? "on" : "off"}`,
    "--canary=off",
    ...(opts.versionTag ? [`--version-tag=${opts.versionTag}`] : []),
  ];
}

export type FactoryHostObservation = {
  cpu: number;
  memoryMiB: number;
  availableMemoryMiB: number;
  freeDiskMiB: number;
  filesystem: string;
  observedAt: string;
};
export type FactoryHostProfile = {
  schema: 1;
  host: string;
  target: string;
  factoryRoot: string;
  sourceTree: string;
  cpu: number;
  memoryMiB: number;
  diskMiB: number;
  heavySlots: number;
  lightSlots: number;
  lockPath: string;
  heavyMemoryMiB?: number;
  lightMemoryMiB?: number;
  reserveMemoryMiB: number;
  reserveDiskMiB: number;
  observedAt: string;
};
export function deriveFactoryProfile(
  observation: FactoryHostObservation,
  config: {
    host: string;
    target: string;
    factoryRoot: string;
    sourceTree: string;
    lockPath: string;
    heavyMemoryMiB?: number;
    lightMemoryMiB?: number;
  },
): FactoryHostProfile {
  const target = findTarget(config.target);
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(config.host)) throw new Error("invalid factory host identity");
  if (!observation.filesystem) throw new Error("factory filesystem must be observed");
  for (const [name, value] of Object.entries({
    cpu: observation.cpu,
    memoryMiB: observation.memoryMiB,
    availableMemoryMiB: observation.availableMemoryMiB,
    freeDiskMiB: observation.freeDiskMiB,
  }))
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("invalid live resource observation: " + name);
  if (observation.availableMemoryMiB > observation.memoryMiB)
    throw new Error("available memory exceeds physical memory");
  const age = Date.now() - Date.parse(observation.observedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 300_000) throw new Error("factory resource observation is stale");
  if (observation.filesystem === "tmpfs") throw new Error("factory target must reside on persistent disk");
  if (!/^[a-f0-9]{40}$/.test(config.sourceTree)) throw new Error("factory source tree must be an exact Git object");
  for (const path of [config.factoryRoot, config.lockPath]) {
    if (!path.startsWith("/") || path === "/" || path.split("/").includes("..") || path.includes("\0")) {
      throw new Error("factory paths must be explicit absolute host paths");
    }
  }
  if (config.factoryRoot === "/tmp" || config.factoryRoot.startsWith("/tmp/"))
    throw new Error("factory target cannot use temporary memory storage");
  const reserveMemoryMiB = Math.max(512, Math.min(2048, Math.floor(observation.memoryMiB / 32)));
  const reserveDiskMiB = 1024;
  if (observation.freeDiskMiB <= reserveDiskMiB)
    throw new Error("insufficient disk beyond the operating system reserve");
  const usableMemory = observation.availableMemoryMiB - reserveMemoryMiB;
  const heavyMemory = config.heavyMemoryMiB ?? 2048;
  const lightMemory = config.lightMemoryMiB ?? 512;
  if (![heavyMemory, lightMemory].every(value => Number.isSafeInteger(value) && value > 0))
    throw new Error("invalid per-slot memory estimate");
  const heavySlots = Math.min(observation.cpu, Math.floor(usableMemory / heavyMemory));
  if (heavySlots < 1) throw new Error("insufficient memory for one heavy build slot");
  const lightSlots = Math.min(observation.cpu, Math.floor(usableMemory / lightMemory));
  return {
    schema: 1,
    host: config.host,
    target: target.target,
    factoryRoot: config.factoryRoot,
    sourceTree: config.sourceTree,
    cpu: observation.cpu,
    memoryMiB: observation.availableMemoryMiB,
    diskMiB: observation.freeDiskMiB,
    heavySlots,
    lightSlots,
    lockPath: config.lockPath,
    heavyMemoryMiB: heavyMemory,
    lightMemoryMiB: lightMemory,
    reserveMemoryMiB,
    reserveDiskMiB,
    observedAt: observation.observedAt,
  };
}

/** Sections of the build image's bootstrap.sh a target needs (the rest set up Buildkite, tests and images). */
export function sectionsFor(t: ReleaseTarget): string[] {
  const common = ["packages", "bun", "bun-ninja", "cmake", "llvm", "rust"];
  const sysroot =
    t.os === "darwin"
      ? "macos-sdk"
      : t.os === "windows"
        ? "windows-sysroot"
        : t.abi === "musl"
          ? "musl-sysroot"
          : "glibc-sysroot";
  return [...common, sysroot];
}

/** Splits a generated bootstrap.sh at its `# ---- <tool>` markers. */
export function splitSections(script: string): { header: string; sections: Map<string, string> } {
  const parts = script.split(/^# ---- /m);
  const sections = new Map<string, string>();
  for (const part of parts.slice(1)) {
    const nl = part.indexOf("\n");
    sections.set(part.slice(0, nl).trim(), part.slice(nl + 1));
  }
  return { header: parts[0]!, sections };
}

export type ForkBootstrap = { containerPath: string; sha256: string; version: string };

export function provisionScript(t: ReleaseTarget, hostArch: Arch, bootstrap: ForkBootstrap): string {
  if (
    !bootstrap ||
    !/^\/[a-zA-Z0-9_./-]+$/.test(bootstrap.containerPath) ||
    bootstrap.containerPath.split("/").includes("..") ||
    !/^[a-f0-9]{64}$/.test(bootstrap.sha256) ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-aphrody\.[0-9]+)?$/.test(bootstrap.version)
  ) {
    throw new Error("a pinned native fork bootstrap path, SHA256 and version are required");
  }
  const image: LinuxImage = {
    os: "linux",
    arch: hostArch,
    distro: "debian",
    release: "13",
    abi: "gnu",
    role: "build",
    base: { name: "debian:13", owner: "docker" },
  };
  const root = mkdtempSync(join(tmpdir(), "aphrody-build-host-"));
  try {
    const { directory } = generateImage(image, root);
    const { sections } = splitSections(readFileSync(join(directory, "bootstrap.sh"), "utf8"));
    const xmac = readFileSync(join(directory, "xmac.mjs"), "utf8");
    const body = sectionsFor(t).map(name => {
      const section =
        name === "bun"
          ? [
              'test -f "${bootstrap.containerPath}"',
              'test "$(sha256sum ${bootstrap.containerPath} | cut -d" " -f1)" = "${bootstrap.sha256}"',
              'test "$(${bootstrap.containerPath} --version)" = "${bootstrap.version}"',
              '(cd "$BAKE_DIR" && ${bootstrap.containerPath} -e \'if (Bun.resolveSync("picocolors", ".") !== "picocolors") process.exit(1)\')',
              "install -m 755 ${bootstrap.containerPath} /usr/local/bin/bun",
              "ln -sf bun /usr/local/bin/bunx",
            ]
              .map(line =>
                line
                  .replaceAll("${bootstrap.containerPath}", bootstrap.containerPath)
                  .replaceAll("${bootstrap.sha256}", bootstrap.sha256)
                  .replaceAll("${bootstrap.version}", bootstrap.version),
              )
              .join("\n")
          : sections.get(name);
      if (section === undefined) throw new Error(`bootstrap.sh has no "${name}" section any more`);
      return `# ---- ${name}\n${section}`;
    });
    return [
      "#!/bin/sh",
      `# Generated by scripts/aphrody/build-host.ts for ${t.target} on a linux-${hostArch} debian:13 container.`,
      "set -eu",
      "export DEBIAN_FRONTEND=noninteractive",
      'BAKE_DIR="$(mktemp -d)"',
      'mkdir -p "$BAKE_DIR/observed"',
      // The image's steps hand some directories to the Buildkite agent's account.
      "id buildkite-agent >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/buildkite-agent buildkite-agent",
      "mkdir -p /var/lib/buildkite-agent/hooks /etc/profile.d",
      "apt-get update --yes && apt-get install --yes --no-install-recommends ca-certificates curl unzip xz-utils",
      `cat > "$BAKE_DIR/xmac.mjs" <<'APHRODY_XMAC_EOF'\n${xmac}\nAPHRODY_XMAC_EOF`,
      "",
      ...body,
    ].join("\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "profile") {
    const observation = flag(args, "--observation");
    const required = (name: string) => {
      const value = flag(args, name);
      if (!value) throw new Error("missing " + name);
      return value;
    };
    if (!observation) throw new Error("missing --observation");
    const profile = deriveFactoryProfile(JSON.parse(readFileSync(observation, "utf8")), {
      host: required("--host"),
      target: required("--target"),
      factoryRoot: required("--factory-root"),
      lockPath: required("--heavy-lock"),
      sourceTree: required("--source-tree"),
      ...(flag(args, "--heavy-memory-mib") ? { heavyMemoryMiB: Number(flag(args, "--heavy-memory-mib")) } : {}),
      ...(flag(args, "--light-memory-mib") ? { lightMemoryMiB: Number(flag(args, "--light-memory-mib")) } : {}),
    });
    console.log(JSON.stringify(profile, null, 2));
  } else if (command === "targets") {
    const wanted = (flag(args, "--only") ?? "").split(",").filter(Boolean);
    const list = wanted.length ? wanted.map(findTarget) : releaseTargets;
    console.log(JSON.stringify(list));
  } else if (command === "provision") {
    const target = findTarget(flag(args, "--target") ?? "");
    const out = flag(args, "--out");
    const host = (flag(args, "--host-arch") ?? (process.arch === "arm64" ? "aarch64" : "x64")) as Arch;
    const script = provisionScript(target, host, {
      containerPath: flag(args, "--bootstrap-path") ?? "",
      sha256: flag(args, "--bootstrap-sha256") ?? "",
      version: flag(args, "--bootstrap-version") ?? "",
    });
    if (out) writeFileSync(out, script, { mode: 0o755 });
    else process.stdout.write(script);
  } else if (command === "args") {
    const target = findTarget(flag(args, "--target") ?? "");
    const lto = (flag(args, "--lto") ?? "on") !== "off";
    const versionTag = flag(args, "--version-tag");
    console.log(buildArgs(target, { lto, ...(versionTag !== undefined ? { versionTag } : {}) }).join(" "));
  } else {
    console.error("usage: build-host.ts <targets|provision|args> ...");
    process.exit(2);
  }
}
