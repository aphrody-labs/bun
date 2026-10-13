import manifest from "./sdk-manifest.json";

export type MediaSDKTarget = keyof typeof manifest.targets;

export interface MediaSDKPlatform {
  platform: string;
  arch: string;
  glibcVersionRuntime?: string;
}

export function mediaSDKTargetFor({ platform, arch, glibcVersionRuntime }: MediaSDKPlatform): MediaSDKTarget {
  if (!["win32", "linux", "darwin"].includes(platform) || !["x64", "arm64"].includes(arch))
    throw new TypeError("Unsupported media SDK target");
  const os = platform === "win32" ? "windows" : platform;
  const libc = platform === "linux" && !glibcVersionRuntime?.trim() ? "-musl" : "";
  const target = `${os}-${arch}${libc}`;
  if (!Object.hasOwn(manifest.targets, target)) throw new TypeError("Unsupported media SDK target");
  return target as MediaSDKTarget;
}

let hostTarget: MediaSDKTarget | undefined;

export function mediaSDKHostTarget(): MediaSDKTarget {
  if (hostTarget) return hostTarget;
  let glibcVersionRuntime: string | undefined;
  if (process.platform === "linux") {
    const report = process.report.getReport() as { header?: { glibcVersionRuntime?: string } };
    if (!report?.header) throw new Error("Cannot detect Linux libc for the media SDK");
    glibcVersionRuntime = report.header.glibcVersionRuntime;
  }
  return (hostTarget = mediaSDKTargetFor({ platform: process.platform, arch: process.arch, glibcVersionRuntime }));
}
