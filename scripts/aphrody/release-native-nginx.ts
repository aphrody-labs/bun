import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { hashSDKFile } from "../../packages/bun-video/src/sdk";
import { mediaSDKTargetFor } from "../../packages/bun-video/src/sdk-platform";

const digest = /^[a-f0-9]{64}$/;
const required = [
  "nativeBunController",
  "nativeRustModuleHTTP",
  "head",
  "clientAborted",
  "timerCleanup",
  "invalidConfigurationRejected",
  "originalMasterSurvivesInvalidConfig",
  "reloadSameMaster",
  "abiMismatchRejected",
  "gracefulQuit",
] as const;
type Identity = { sha256: string; bytes: number };
export type NginxReleaseContext = { source: string; target: string; platform: string; arch: string };
export type NginxReleaseManifest = {
  schema: 1;
  kind: "bun-nginx-native-sdk";
  source: string;
  sourceDirty: false;
  target: string;
  platform: string;
  arch: string;
  executable: string;
  files: Record<string, Identity>;
};

export function nativeNginxRecipe(target: string) {
  if (target !== "linux-x64")
    throw new Error(`packages/bun-nginx/scripts: portable native NGINX engine/module recipe absent for ${target}`);
  return "packages/bun-nginx/scripts/build-portable-gnu-x64.sh";
}

export function nginxReleaseManifest(value: unknown, context: NginxReleaseContext): NginxReleaseManifest {
  const manifest = value as NginxReleaseManifest;
  const executable = context.platform === "win32" ? "bin/nginx.exe" : "bin/nginx";
  if (
    !manifest ||
    manifest.schema !== 1 ||
    manifest.kind !== "bun-nginx-native-sdk" ||
    manifest.source !== context.source ||
    manifest.sourceDirty !== false ||
    manifest.target !== context.target ||
    manifest.platform !== context.platform ||
    manifest.arch !== context.arch ||
    manifest.executable !== executable ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files)
  )
    throw new Error("Native NGINX sidecar source, target or architecture differs");
  const names = Object.keys(manifest.files);
  if (
    !names.length ||
    names.length > 10_000 ||
    !manifest.files[executable] ||
    !manifest.files["receipts/module-qualification.json"] ||
    !manifest.files["receipts/closure.json"] ||
    !manifest.files["receipts/build-receipt.json"] ||
    !names.some(name => name.startsWith("share/licenses/")) ||
    !names.some(name => name.startsWith("sources/"))
  )
    throw new Error("Native NGINX sidecar requires engine, module/closure/source evidence and notices");
  for (const [name, file] of Object.entries(manifest.files))
    if (
      !/^(?:bin|receipts|share\/licenses|sources)\/[A-Za-z0-9_./+-]+$/.test(name) ||
      name.split("/").some(part => !part || part === "." || part === ".." || part.startsWith(".")) ||
      name.includes("abi-mismatch") ||
      /\.(?:so|dll|dylib)$/.test(name) ||
      !file ||
      !digest.test(file.sha256) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 1 ||
      file.bytes > 512 * 1024 ** 2
    )
      throw new Error(`Invalid native NGINX release member: ${name}`);
  return manifest;
}

export function nginxModuleQualification(value: unknown, context: NginxReleaseContext, executable: Identity) {
  const qualification = value as {
    schema: number;
    kind: string;
    nativeModuleQualified: boolean;
    host: { platform: string; arch: string; bunRevision: string };
    executable: Identity;
    gates: Record<string, unknown>;
  };
  if (
    !qualification ||
    qualification.schema !== 1 ||
    qualification.kind !== "bun-nginx-native-module-qualification" ||
    qualification.nativeModuleQualified !== true ||
    qualification.host?.platform !== context.platform ||
    qualification.host.arch !== context.arch ||
    qualification.host.bunRevision !== context.source ||
    qualification.executable?.sha256 !== executable.sha256 ||
    qualification.executable.bytes !== executable.bytes ||
    !qualification.gates ||
    required.some(gate => qualification.gates[gate] !== true)
  )
    throw new Error("Native NGINX controller/module evidence differs from the release engine or source");
  return qualification;
}

export function nginxClosureQualification(value: unknown, context: NginxReleaseContext, executable: Identity) {
  const closure = value as {
    schema: number;
    target: string;
    qualification?: string;
    libc?: string;
    releaseGLIBCFloor?: string | null;
    maximumGLIBC?: string | null;
    releaseMacOSFloor?: string;
    files: Array<{
      file: string;
      sha256: string;
      needed: string[];
      minimumGLIBC?: string | null;
      minimumMacOS?: string;
    }>;
  };
  const engine = context.platform === "win32" ? "bin/nginx.exe" : "bin/nginx";
  const sdkTarget = mediaSDKTargetFor({
    platform: context.platform,
    arch: context.arch,
    ...(context.platform === "linux" ? { abi: context.target.endsWith("-musl") ? "musl" : "gnu" } : {}),
  });
  if (
    !closure ||
    closure.schema !== 1 ||
    closure.target !== sdkTarget ||
    !Array.isArray(closure.files) ||
    closure.files.length !== 1 ||
    closure.files[0]?.file !== engine ||
    closure.files[0].sha256 !== executable.sha256 ||
    !Array.isArray(closure.files[0].needed) ||
    closure.files[0].needed.length > 64 ||
    closure.files[0].needed.some(name => typeof name !== "string" || !name || name.length > 512)
  )
    throw new Error("Native NGINX closure differs from the release engine or target");
  // This checks the canonical inspector's receipt; binary parsing remains with the SDK owner.
  const within = (value: unknown, maximum: number[]) => {
    if (typeof value !== "string" || !/^\d+(?:\.\d+){1,2}$/.test(value)) return false;
    const parts = value.split(".").map(Number);
    for (let index = 0; index < Math.max(parts.length, maximum.length); index++) {
      const order = (parts[index] ?? 0) - (maximum[index] ?? 0);
      if (order) return order < 0;
    }
    return true;
  };
  const file = closure.files[0];
  if (context.platform === "linux") {
    const musl = context.target.endsWith("-musl");
    if (
      closure.libc !== (musl ? "musl" : "gnu") ||
      closure.releaseGLIBCFloor !== (musl ? null : "2.17") ||
      closure.maximumGLIBC !== file.minimumGLIBC ||
      (musl ? closure.maximumGLIBC !== null : closure.maximumGLIBC !== null && !within(closure.maximumGLIBC, [2, 17]))
    )
      throw new Error("Native NGINX closure exceeds or differs from the release libc floor");
  } else if (context.platform === "darwin") {
    if (
      closure.qualification !== "Mach-O-load-command-closure-only" ||
      closure.releaseMacOSFloor !== "13.0" ||
      !within(file.minimumMacOS, [13, 0])
    )
      throw new Error("Native NGINX closure exceeds or differs from the release macOS floor");
  } else if (context.platform !== "win32" || closure.qualification !== "PE-architecture-and-import-closure-only")
    throw new Error("Native NGINX closure inspector differs from its platform");
  return closure;
}

export async function readNginxReleaseArtifact(directory: string, context: NginxReleaseContext) {
  if (!isAbsolute(directory)) throw new Error("Native NGINX artifact must be absolute");
  const root = await realpath(directory);
  const manifestFile = Bun.file(join(root, "nginx-sdk.json"));
  if (manifestFile.size > 8 * 1024 ** 2) throw new Error("Native NGINX manifest exceeds bound");
  const manifest = nginxReleaseManifest(await manifestFile.json(), context);
  for (const [name, file] of Object.entries(manifest.files)) {
    const path = await realpath(join(root, name)),
      member = relative(root, path);
    if (
      isAbsolute(member) ||
      member.startsWith("..") ||
      Bun.file(path).size !== file.bytes ||
      (await hashSDKFile(path)) !== file.sha256
    )
      throw new Error(`Native NGINX artifact member differs: ${name}`);
  }
  nginxModuleQualification(
    await Bun.file(join(root, "receipts/module-qualification.json")).json(),
    context,
    manifest.files[manifest.executable]!,
  );
  nginxClosureQualification(
    await Bun.file(join(root, "receipts/closure.json")).json(),
    context,
    manifest.files[manifest.executable]!,
  );
  return manifest;
}
