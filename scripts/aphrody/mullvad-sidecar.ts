#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const MULLVAD_LINUX_TARGET = "x86_64-unknown-linux-gnu";
export const MULLVAD_ASSET = "bun-vpn-linux-x86_64.tar.gz";
const BINARIES = ["mullvad-daemon", "mullvad", "mullvad-setup", "mullvad-exclude", "mullvad-problem-report"] as const;

export interface MullvadBuildPlan {
  schema: 1;
  source: string;
  mullvadSource: string;
  target: typeof MULLVAD_LINUX_TARGET;
  asset: typeof MULLVAD_ASSET;
  workingDirectory: "plugins/vpn/vendor/mullvad";
  factoryLock: "/home/ubuntu/build/locks/heavy.lock";
  cargo: string[][];
  fetchRelayList: string;
  smoke: string[][];
  files: string[];
  requirements: string[];
  runtimeLinked: false;
  performanceQualified: false;
}

export function createMullvadBuildPlan(source: string, mullvadSource: string): MullvadBuildPlan {
  if (!/^[a-f0-9]{40}$/.test(source) || !/^[a-f0-9]{40}$/.test(mullvadSource))
    throw new Error("Exact Bun and Mullvad source revisions are required");
  return {
    schema: 1,
    source,
    mullvadSource,
    target: MULLVAD_LINUX_TARGET,
    asset: MULLVAD_ASSET,
    workingDirectory: "plugins/vpn/vendor/mullvad",
    factoryLock: "/home/ubuntu/build/locks/heavy.lock",
    cargo: [
      [
        "/home/ubuntu/src/aphrody/scripts/build/rust/cargo-serial.sh",
        "+1.97.1",
        "build",
        "--locked",
        "--release",
        "--target",
        MULLVAD_LINUX_TARGET,
        "--manifest-path",
        "Cargo.toml",
        "-p",
        "mullvad-daemon",
        "-p",
        "mullvad-cli",
        "-p",
        "mullvad-setup",
        "-p",
        "mullvad-exclude",
        "-p",
        "mullvad-problem-report",
        "--features",
        "mullvad-daemon/cgroup2",
      ],
      [
        "/home/ubuntu/src/aphrody/scripts/build/rust/cargo-serial.sh",
        "+1.97.1",
        "build",
        "--locked",
        "--release",
        "--target",
        MULLVAD_LINUX_TARGET,
        "--manifest-path",
        "Cargo.toml",
        "-p",
        "mullvad-api",
        "--bin",
        "relay-list",
      ],
      [
        "/home/ubuntu/src/aphrody/scripts/build/rust/cargo-serial.sh",
        "+1.97.1",
        "test",
        "--locked",
        "--release",
        "--target",
        MULLVAD_LINUX_TARGET,
        "--manifest-path",
        "Cargo.toml",
        "-p",
        "mullvad-management-interface",
      ],
    ],
    fetchRelayList: "plugins/vpn/vendor/mullvad/target/x86_64-unknown-linux-gnu/release/relay-list",
    smoke: [
      ["mullvad-daemon", "--version"],
      ["mullvad", "--version"],
      ["mullvad-setup", "--help"],
      ["mullvad-problem-report", "--help"],
    ],
    files: [
      ...BINARIES.map(binary => `usr/bin/${binary}`),
      "opt/Mullvad VPN/resources/ca.crt",
      "opt/Mullvad VPN/resources/relays.json",
      "usr/lib/systemd/system/mullvad-daemon.service",
      "usr/lib/systemd/system/mullvad-early-boot-blocking.service",
      "usr/share/doc/bun-vpn/README.md",
      "usr/share/doc/bun-vpn/BUILD-INFO.json",
      "usr/share/doc/bun-vpn/LICENSE.md",
      "usr/share/doc/bun-vpn/THIRD_PARTY.md",
      "usr/share/doc/bun-vpn/SOURCE.md",
    ],
    requirements: [
      "/dev/net/tun and CAP_NET_ADMIN (normally root) are required to create a tunnel and update routes/firewall.",
      "A systemd host is required for the included boot-time firewall and daemon units; containers need host network capabilities and explicit device/capability grants.",
      "Serverless platforms that do not grant TUN and network-administration privileges cannot establish Mullvad tunnels.",
      "Only x86_64 Linux glibc is built and qualified by this profile; no Windows, macOS, musl or ARM claim is made.",
    ],
    runtimeLinked: false,
    performanceQualified: false,
  };
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
}

function copyExecutable(source: string, destination: string): void {
  copyFileSync(source, destination);
  chmodSync(destination, 0o755);
}

export function packageMullvadSidecar(options: {
  root: string;
  outDirectory: string;
  source: string;
  mullvadSource: string;
  relayListPath: string;
}): string {
  const root = resolve(options.root);
  const plan = createMullvadBuildPlan(options.source, options.mullvadSource);
  const mullvad = join(root, "vendor", "mullvad");
  const release = join(mullvad, "target", plan.target, "release");
  const staging = mkdtempSync(join(tmpdir(), "bun-vpn-release-"));
  const output = resolve(options.outDirectory);
  const bin = join(staging, "usr", "bin");
  const resources = join(staging, "opt", "Mullvad VPN", "resources");
  const units = join(staging, "usr", "lib", "systemd", "system");
  const docs = join(staging, "usr", "share", "doc", "bun-vpn");
  mkdirSync(bin, { recursive: true });
  mkdirSync(resources, { recursive: true });
  mkdirSync(units, { recursive: true });
  mkdirSync(docs, { recursive: true });
  mkdirSync(output, { recursive: true });

  try {
    for (const binary of BINARIES) copyExecutable(join(release, binary), join(bin, binary));
    copyFileSync(join(mullvad, "dist-assets", "ca.crt"), join(resources, "ca.crt"));
    const relayList = readFileSync(options.relayListPath);
    const parsedRelayList = JSON.parse(relayList.toString("utf8"));
    if (
      !relayList.length ||
      !parsedRelayList ||
      typeof parsedRelayList !== "object" ||
      !Object.keys(parsedRelayList).length
    )
      throw new Error("The signature-verified Mullvad relay list is empty or invalid");
    writeFileSync(join(resources, "relays.json"), relayList);
    for (const unit of ["mullvad-daemon.service", "mullvad-early-boot-blocking.service"])
      copyFileSync(join(mullvad, "dist-assets", "linux", unit), join(units, unit));
    copyFileSync(join(mullvad, "LICENSE.md"), join(docs, "LICENSE.md"));
    copyFileSync(join(mullvad, "THIRD_PARTY.md"), join(docs, "THIRD_PARTY.md"));
    writeFileSync(
      join(docs, "SOURCE.md"),
      `Mullvad VPN source of the Bun vpn plugin\n\nRepository: https://github.com/aphrody-labs/bun-vpn\nCommit: ${options.mullvadSource}\nPath: vendor/mullvad (submodule of https://github.com/aphrody-labs/mullvadvpn-app)\n\nThe embedded source and its build instructions are distributed under GPL-3.0-or-later.\n`,
    );
    const buildInfo = {
      ...plan,
      builtFrom: { bun: options.source, mullvad: options.mullvadSource },
      relayList: {
        bytes: relayList.byteLength,
        sha256: new Bun.CryptoHasher("sha256").update(relayList).digest("hex"),
      },
    };
    writeFileSync(join(docs, "BUILD-INFO.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
    writeFileSync(
      join(docs, "README.md"),
      `# Bun VPN Linux sidecar\n\nThis is a separate Mullvad VPN payload; it is not linked into Bun. Extract the archive at filesystem root to install its /usr/bin, /opt/Mullvad VPN, /usr/lib/systemd and license files. Review the upstream unit files and host policy before enabling them.\n\nThe daemon changes routes, DNS and firewall state. It requires /dev/net/tun and network-administration privileges. Do not run it in a container without an explicit capability and device policy. The included early-boot unit is required to enforce the upstream boot-time firewall behavior.\n\nThis release profile is built for x86_64 Linux/glibc only. It uses Mullvad's upstream release profile and cgroup2 support; no comparative performance or serverless-platform qualification is claimed.\n`,
    );

    const archive = join(output, MULLVAD_ASSET);
    run(
      "tar",
      ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-czf", archive, "-C", staging, "."],
      root,
    );
    return archive;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "plan") {
    console.log(JSON.stringify(createMullvadBuildPlan(args[0] ?? "", args[1] ?? ""), null, 2));
  } else if (command === "relay" && args[0] && args[1]) {
    const result = spawnSync(args[0], [], { stdio: ["ignore", "pipe", "inherit"] });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Mullvad relay-list fetch failed with status ${result.status}`);
    const content = result.stdout.toString("utf8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || !Object.keys(parsed).length)
      throw new Error("The signature-verified Mullvad relay list is empty or invalid");
    const destination = resolve(args[1]);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
    console.log(destination);
  } else if (command === "package" && args[0] && args[1] && args[2] && args[3]) {
    console.log(
      packageMullvadSidecar({
        root: process.cwd(),
        source: args[0],
        mullvadSource: args[1],
        outDirectory: args[2],
        relayListPath: args[3],
      }),
    );
  } else {
    throw new Error(
      "Usage: mullvad-sidecar.ts plan <bun-source-sha> <mullvad-source-sha> | relay <relay-list-binary> <out-relay-json> | package <bun-source-sha> <mullvad-source-sha> <out-directory> <relay-list-json>",
    );
  }
}
