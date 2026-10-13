/** Host identity is measured before selecting or loading an installed native module. */
import { closeSync, openSync, readSync } from "node:fs";

export type HostPlatform = "linux" | "darwin" | "win32";
export type HostArch = "x64" | "arm64";
export type LinuxABI = "gnu" | "musl";
export type RuntimeTarget =
  | `${"x86_64" | "aarch64"}-unknown-linux-${LinuxABI}`
  | `${"x86_64" | "aarch64"}-apple-darwin`
  | `${"x86_64" | "aarch64"}-pc-windows-msvc`;

export const SUPPORTED_TARGETS = {
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "linux-x64-musl": "x86_64-unknown-linux-musl",
  "linux-arm64-musl": "aarch64-unknown-linux-musl",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
  "win32-x64": "x86_64-pc-windows-msvc",
  "win32-arm64": "aarch64-pc-windows-msvc",
} as const satisfies Readonly<Record<string, RuntimeTarget>>;

/** Pure matrix mapping. Linux requires an observed or explicitly selected build ABI. */
export function targetFor(platform: HostPlatform, arch: HostArch, abi?: LinuxABI): RuntimeTarget {
  if (!["linux", "darwin", "win32"].includes(platform) || !["x64", "arm64"].includes(arch))
    throw new TypeError("Unsupported runtime platform/architecture");
  if (platform === "linux") {
    if (abi !== "gnu" && abi !== "musl") throw new TypeError("Linux runtime target requires a qualified GNU/musl ABI");
  } else if (abi !== undefined) throw new TypeError("A Linux ABI cannot select a non-Linux target");
  const key = `${platform}-${arch}${abi === "musl" ? "-musl" : ""}` as keyof typeof SUPPORTED_TARGETS;
  return SUPPORTED_TARGETS[key];
}

export interface LinuxABIInfo {
  readonly abi: LinuxABI;
  readonly version?: string;
  readonly source: "process.report.glibcVersionRuntime" | "/proc/self/maps";
  readonly loader?: string;
}

export interface LinuxABIProbe {
  readonly glibcVersionRuntime?: string;
  readonly glibcVersionCompiler?: string;
  /** Probe input only; complete maps/report must never be serialized as metadata. */
  readonly mappedLibraries?: string;
}

/** Positive evidence only: an absent GNU report field does not establish musl. */
export function linuxABIFor(arch: HostArch, probe: LinuxABIProbe): LinuxABIInfo {
  if (arch !== "x64" && arch !== "arm64") throw new TypeError("Unsupported Linux runtime architecture");
  const version = probe.glibcVersionRuntime;
  if (typeof version === "string" && /^\d+\.\d+(?:\.\d+)?$/.test(version))
    return { abi: "gnu", version, source: "process.report.glibcVersionRuntime" };
  if (version !== undefined || probe.glibcVersionCompiler !== undefined)
    throw new Error("Incomplete GNU libc runtime probe");
  const machine = arch === "x64" ? "x86_64" : "aarch64";
  const loaders = [
    ...(probe.mappedLibraries ?? "").matchAll(
      /(?:^|\n)[^\n]*\s(\/[^\s]*\/(?:ld-musl-|libc\.musl-)(x86_64|aarch64)\.so\.1)(?: \(deleted\))?(?=\n|$)/g,
    ),
  ];
  const match = loaders.find(item => item[2] === machine);
  const loader = match?.[1];
  if (!loader || loaders.some(item => item[2] !== machine))
    throw new Error("Linux libc could not be qualified from the running process");
  return { abi: "musl", source: "/proc/self/maps", loader };
}

function processMaps(): string {
  const fd = openSync("/proc/self/maps", "r");
  try {
    const data = new Uint8Array(1024 * 1024 + 1);
    let length = 0;
    while (length < data.length) {
      const count = readSync(fd, data, length, data.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length === data.length) throw new Error("Runtime libc probe exceeds its byte bound");
    return new TextDecoder("utf-8", { fatal: true }).decode(data.subarray(0, length));
  } finally {
    closeSync(fd);
  }
}

export interface HostTargetInfo {
  readonly platform: HostPlatform;
  readonly arch: HostArch;
  readonly target: RuntimeTarget;
  readonly libc?: LinuxABIInfo;
}

let identity: HostTargetInfo | undefined;
/** Reduced native metadata; never exposes environment or complete process reports. */
export function hostTargetInfo(): HostTargetInfo {
  if (identity) return identity;
  const platform = process.platform,
    arch = process.arch;
  if (!["linux", "darwin", "win32"].includes(platform) || !["x64", "arm64"].includes(arch))
    throw new Error(`Unsupported runtime platform ${platform}-${arch}`);
  const supportedPlatform = platform as HostPlatform,
    supportedArch = arch as HostArch;
  let libc: LinuxABIInfo | undefined;
  if (platform === "linux") {
    const report: unknown = process.report.getReport();
    if (typeof report !== "object" || report === null)
      throw new Error("Native process report unavailable for libc qualification");
    const rawHeader = (report as Record<string, unknown>).header;
    if (typeof rawHeader !== "object" || rawHeader === null)
      throw new Error("Native process report header unavailable for libc qualification");
    const header = rawHeader as Record<string, unknown>;
    if (header.platform !== platform || header.arch !== arch || header.processId !== process.pid)
      throw new Error("Native process report identity mismatch");
    if (
      (header.glibcVersionRuntime !== undefined && typeof header.glibcVersionRuntime !== "string") ||
      (header.glibcVersionCompiler !== undefined && typeof header.glibcVersionCompiler !== "string")
    )
      throw new Error("Invalid native libc version probe");
    const probe: LinuxABIProbe = {
      ...(typeof header.glibcVersionRuntime === "string" ? { glibcVersionRuntime: header.glibcVersionRuntime } : {}),
      ...(typeof header.glibcVersionCompiler === "string" ? { glibcVersionCompiler: header.glibcVersionCompiler } : {}),
    };
    libc = linuxABIFor(supportedArch, {
      ...probe,
      ...(probe.glibcVersionRuntime === undefined ? { mappedLibraries: processMaps() } : {}),
    });
  }
  identity = Object.freeze({
    platform: supportedPlatform,
    arch: supportedArch,
    target: targetFor(supportedPlatform, supportedArch, libc?.abi),
    ...(libc ? { libc: Object.freeze(libc) } : {}),
  });
  return identity;
}

export function hostTarget(): string {
  return hostTargetInfo().target;
}
