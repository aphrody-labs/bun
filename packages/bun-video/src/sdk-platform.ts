import manifest from "./sdk-manifest.json";
import {
  hostTargetInfo,
  linuxABIFor,
  targetFor,
  type HostArch,
  type HostPlatform,
  type LinuxABI,
} from "@aphrody/bun-runtime-sdk/target";

export type MediaSDKTarget = keyof typeof manifest.targets;

export interface MediaSDKPlatform {
  platform: string;
  arch: string;
  glibcVersionRuntime?: string;
  abi?: LinuxABI;
  mappedLibraries?: string;
}

export function mediaSDKTargetFor({
  platform,
  arch,
  glibcVersionRuntime,
  abi,
  mappedLibraries,
}: MediaSDKPlatform): MediaSDKTarget {
  if (!["win32", "linux", "darwin"].includes(platform) || !["x64", "arm64"].includes(arch))
    throw new TypeError("Unsupported media SDK target");
  const selectedABI =
    platform === "linux"
      ? (abi ??
        linuxABIFor(arch as HostArch, {
          ...(glibcVersionRuntime !== undefined ? { glibcVersionRuntime } : {}),
          ...(mappedLibraries !== undefined ? { mappedLibraries } : {}),
        }).abi)
      : undefined;
  if (platform !== "linux" && abi !== undefined)
    throw new TypeError("Linux ABI cannot select a foreign media SDK platform");
  if (
    platform === "linux" &&
    abi &&
    glibcVersionRuntime !== undefined &&
    linuxABIFor(arch as HostArch, { glibcVersionRuntime }).abi !== abi
  )
    throw new Error("Media SDK ABI contradicts its runtime libc probe");
  targetFor(platform as HostPlatform, arch as HostArch, selectedABI);
  const os = platform === "win32" ? "windows" : platform;
  const libc = selectedABI === "musl" ? "-musl" : "";
  const target = `${os}-${arch}${libc}`;
  if (!Object.hasOwn(manifest.targets, target)) throw new TypeError("Unsupported media SDK target");
  return target as MediaSDKTarget;
}

let hostTarget: MediaSDKTarget | undefined;

export function mediaSDKHostTarget(): MediaSDKTarget {
  if (hostTarget) return hostTarget;
  const measured = hostTargetInfo();
  return (hostTarget = mediaSDKTargetFor({
    platform: measured.platform,
    arch: measured.arch,
    ...(measured.libc ? { abi: measured.libc.abi } : {}),
  }));
}
