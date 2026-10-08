// Turns a GitHub-hosted runner into the machine upstream compiles every target
// on: a Debian 13 container set up by the same steps as CI's build image
// (scripts/build/ci-images/spec.ts), so the fork's release binaries get the
// same pinned toolchain and sysroots — glibc 2.31 for linux-gnu, Alpine musl,
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
  /** Container the smoke test runs in, to prove the oldest libc the binary needs. */
  container?: string;
};

/** The targets upstream builds for its releases (.buildkite/ci.ts buildPlatforms, without asan/android/freebsd). */
export const releaseTargets: ReleaseTarget[] = [
  { target: "linux-x64", os: "linux", arch: "x64", abi: "gnu", runner: "ubuntu-24.04", container: "debian:bullseye" },
  {
    target: "linux-aarch64",
    os: "linux",
    arch: "aarch64",
    abi: "gnu",
    runner: "ubuntu-24.04-arm",
    container: "debian:bullseye",
  },
  { target: "linux-x64-musl", os: "linux", arch: "x64", abi: "musl", runner: "ubuntu-24.04", container: "alpine:3.23" },
  {
    target: "linux-aarch64-musl",
    os: "linux",
    arch: "aarch64",
    abi: "musl",
    runner: "ubuntu-24.04-arm",
    container: "alpine:3.23",
  },
  { target: "darwin-aarch64", os: "darwin", arch: "aarch64", runner: "macos-15" },
  { target: "darwin-x64", os: "darwin", arch: "x64", runner: "macos-15-intel" },
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

/** Sections of the build image's bootstrap.sh a target needs (the rest set up Buildkite, tests and images). */
export function sectionsFor(t: ReleaseTarget): string[] {
  const common = ["packages", "nodejs", "bun", "bun-ninja", "cmake", "llvm", "rust"];
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

export function provisionScript(t: ReleaseTarget, hostArch: Arch): string {
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
      const section = sections.get(name);
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
  if (command === "targets") {
    const wanted = (flag(args, "--only") ?? "").split(",").filter(Boolean);
    const list = wanted.length ? wanted.map(findTarget) : releaseTargets;
    console.log(JSON.stringify(list));
  } else if (command === "provision") {
    const target = findTarget(flag(args, "--target") ?? "");
    const out = flag(args, "--out");
    const host = (flag(args, "--host-arch") ?? (process.arch === "arm64" ? "aarch64" : "x64")) as Arch;
    const script = provisionScript(target, host);
    if (out) writeFileSync(out, script, { mode: 0o755 });
    else process.stdout.write(script);
  } else if (command === "args") {
    const target = findTarget(flag(args, "--target") ?? "");
    const lto = (flag(args, "--lto") ?? "on") !== "off";
    console.log(buildArgs(target, { lto, versionTag: flag(args, "--version-tag") }).join(" "));
  } else {
    console.error("usage: build-host.ts <targets|provision|args> ...");
    process.exit(2);
  }
}
