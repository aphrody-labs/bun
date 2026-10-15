import { mkdir, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative } from "node:path";
import { assertPublicMediaPath, mediaReleaseTarget } from "./media-release";
import { fullIntegrationPolicy, fullNativeRuntimeFeatures, runtimeReleaseMatrix } from "./release-matrix";
import mediaSDKManifest from "../../packages/bun-video/src/sdk-manifest.json";
import { targetFor } from "../../packages/bun-runtime-sdk/src/target";
import { nginxReleaseManifest, nginxModuleQualification, nginxClosureQualification } from "./release-native-nginx";

const fullTargets = runtimeReleaseMatrix().filter(target => target.flavor === "full");
const sha256 = /^[a-f0-9]{64}$/;
const sourceSHA = /^[a-f0-9]{40}$/;
const maximumArchiveBytes = 2 * 1024 * 1024 * 1024;
const maximumJSONBytes = 8 * 1024 * 1024;
export const fullMediaGates = [
  "runtime-channel",
  "video-channel",
  "runtime-identity",
  "video-identity",
  "image-video",
  "media-library-abi",
  "video-cli",
  "native-encode",
  "native-decode",
  "native-pixels",
] as const;
export const fullPlatformGates = [
  "runtime-regressions",
  "native-runtime-sdk",
  "native-nginx-controller",
  "native-nginx-module",
  "native-nginx-closure",
  "native-closure",
  "native-install",
  "native-path",
  "native-update",
] as const;

type FileIdentity = { bytes: number; sha256: string; mode?: number };
type Gate = { id: string; passed: boolean; log: string; sha256: string };
type MediaReceipt = {
  schema: number;
  kind: string;
  source: string;
  version: string;
  target: string;
  triplet: string;
  native: boolean;
  passed: boolean;
  runtimeSHA256: string;
  executableSHA256: string;
  archive: { name: string; sha256: string; bytes: number };
  files: Record<string, FileIdentity>;
  gates: Gate[];
  sdk: { name: string; version: string; archive: string; sha256: string; bytes: number }[];
};
export type NativePlatformQualification = {
  schema: number;
  kind: string;
  source: string;
  version: string;
  target: string;
  native: boolean;
  passed: boolean;
  platform: string;
  arch: string;
  execution: string;
  runtimeSHA256: string;
  executableSHA256: string;
  archiveSHA256: string;
  sdkSources: { ffmpeg: string; mpv: string };
  gates: Gate[];
};
export type FullReleaseQualification = {
  schema: 1;
  kind: "bun-media-full-qualification";
  source: string;
  version: string;
  native: true;
  passed: true;
  targets: string[];
  assets: Record<string, string>;
  platforms: {
    target: string;
    triplet: string;
    archive: FileIdentity;
    receiptSHA256: string;
    platformReceiptSHA256: string;
  }[];
};

function hash(bytes: string | Uint8Array | ArrayBuffer) {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}
function identity(source: string, version: string, channel: string) {
  if (!sourceSHA.test(source) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error("Full release requires exact source SHA and version");
  if (channel !== "candidate" && channel !== "stable") throw new Error("Unknown release channel");
  if (channel === "stable" && fullIntegrationPolicy.pendingOwners.length)
    throw new Error("Stable integration qualification is pending");
}
function requiredGates(gates: Gate[], required: readonly string[]) {
  if (!Array.isArray(gates) || gates.length > 1024 || new Set(gates.map(gate => gate.id)).size !== gates.length)
    throw new Error("Duplicate or missing native gates");
  if (gates.some(gate => !/^[a-z][a-z0-9-]{0,63}$/.test(gate.id) || gate.passed !== true || !sha256.test(gate.sha256)))
    throw new Error("Failed or invalid native gate evidence");
  for (const id of required) {
    const gate = gates.find(gate => gate.id === id);
    if (!gate || gate.passed !== true || !sha256.test(gate.sha256))
      throw new Error(`Native gate failed or missing: ${id}`);
  }
}

export const runtimeFullGates = [
  "runtime-identity",
  "runtime-features",
  "runtime-coreutils",
  "runtime-feature-regressions",
  "runtime-quality-guards",
  "runtime-regressions",
  "runtime-closure",
  "native-install",
  "native-path",
  "native-update",
] as const;

/** Runtime qualification never substitutes for the separately qualified full media bundle. */
export const runtimeFullComponents = {
  runtime: { required: true, status: "qualified" },
  nativeMedia: { required: true, status: "qualified" },
  nginx: { required: false, status: "separate-artifact", owner: "scripts/aphrody/release-native-nginx.ts" },
  videoStandalone: { required: false, status: "separate-artifact", owner: "packages/bun-video/scripts/build.ts" },
  runtimeSDK: { required: false, status: "separate-artifact", owner: "scripts/aphrody/runtime-sdk-build.ts" },
} as const;

export type NativeRuntimeFullReceipt = {
  schema: 1;
  kind: "bun-runtime-full-release";
  source: string;
  version: string;
  target: string;
  triplet: string;
  native: true;
  passed: true;
  execution: "native";
  platform: string;
  arch: string;
  provenance: { version: string; revision: string; platform: string; arch: string; sourceUrl: string };
  compiledFeatures: typeof fullNativeRuntimeFeatures;
  components: typeof runtimeFullComponents;
  allComponentsQualified: false;
  runtimeSHA256: string;
  sdkSources: { ffmpeg: string; mpv: string };
  files: Record<string, FileIdentity>;
  gates: Gate[];
  archive: FileIdentity & { name: string };
};

export function runtimeFullAsset(target: string) {
  const full = fullTargets.find(value => value.target === target);
  if (!full) throw new Error("Unknown native runtime target");
  return `${full.sourceTriplet}-runtime-full`;
}

/** Explicit targets permit a qualified native subset without claiming the eight-platform matrix. */
export async function aggregateRuntimeFullRelease(
  directory: string,
  source: string,
  version: string,
  targets: string[] = fullTargets.map(target => target.target),
  channel = "candidate",
) {
  if (!sourceSHA.test(source) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error("Runtime release requires immutable source and version");
  if (!["candidate", "stable"].includes(channel) || !isAbsolute(directory))
    throw new Error("Invalid runtime release channel or directory");
  if (!targets.length || targets.length > fullTargets.length || new Set(targets).size !== targets.length)
    throw new Error("Runtime release targets are empty or duplicated");
  const root = await realpath(directory);
  const assets: Record<string, string> = Object.create(null);
  const platforms = [];
  const read = async (name: string, maximum = maximumJSONBytes) => {
    assertPublicMediaPath(name);
    if (basename(name) !== name) throw new Error("Runtime inputs must be flat owned assets");
    const path = await realpath(join(root, name));
    if (relative(root, path) !== name) throw new Error("Runtime input escaped its directory");
    const file = Bun.file(path);
    if (!file.size || file.size > maximum) throw new Error("Runtime input missing or exceeds bound");
    const bytes = await file.bytes();
    assets[name] = hash(bytes);
    return bytes;
  };
  for (const name of targets.toSorted()) {
    const asset = runtimeFullAsset(name);
    const full = fullTargets.find(target => target.target === name)!;
    const target = mediaReleaseTarget(name);
    const receiptName = `${asset}.qualification.json`;
    const receipt: NativeRuntimeFullReceipt = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(await read(receiptName)),
    );
    if (
      receipt.schema !== 1 ||
      receipt.kind !== "bun-runtime-full-release" ||
      receipt.source !== source ||
      receipt.version !== version ||
      receipt.target !== name ||
      receipt.triplet !== full.triplet ||
      receipt.native !== true ||
      receipt.passed !== true ||
      receipt.execution !== "native" ||
      receipt.platform !== target.platform ||
      receipt.arch !== target.runtimeArch ||
      receipt.allComponentsQualified !== false
    )
      throw new Error(`Native runtime identity differs: ${name}`);
    if (
      !Bun.deepEquals(receipt.compiledFeatures, fullNativeRuntimeFeatures) ||
      !Bun.deepEquals(receipt.components, runtimeFullComponents)
    )
      throw new Error(`Mandatory runtime feature or component qualification differs: ${name}`);
    const sdk = mediaSDKManifest.targets[target.sdkTarget as keyof typeof mediaSDKManifest.targets];
    if (receipt.sdkSources?.ffmpeg !== sdk.ffmpeg.sourceRevision || receipt.sdkSources?.mpv !== sdk.mpv.sourceRevision)
      throw new Error("Native runtime media source pins differ");
    const provenance = receipt.provenance;
    let sourceURL: URL;
    try {
      sourceURL = new URL(provenance.sourceUrl);
    } catch {
      throw new Error("Runtime source provenance is invalid");
    }
    const parts = sourceURL.pathname.split("/");
    if (
      provenance.version !== version ||
      provenance.revision !== source ||
      provenance.platform !== target.platform ||
      provenance.arch !== target.runtimeArch ||
      sourceURL.origin !== "https://github.com" ||
      sourceURL.search ||
      sourceURL.hash ||
      parts.length !== 7 ||
      parts.slice(1, 5).join("/") !== "aphrody-labs/bun/releases/download" ||
      ![`bun-v${version}`, `aphrody-v${version}`].includes(parts[5]!) ||
      ![`${full.sourceTriplet}.zip`, `${full.triplet}.zip`, `${asset}.zip`].includes(parts[6]!)
    )
      throw new Error(`Runtime source provenance differs: ${name}`);
    requiredGates(receipt.gates, [
      ...runtimeFullGates,
      ...(target.os === "windows" ? ["winget-manifest", "winget-install"] : []),
    ]);
    for (const gate of receipt.gates) {
      if (gate.log !== `${asset}-${gate.id}.log` || hash(await read(gate.log)) !== gate.sha256)
        throw new Error(`Runtime gate log differs: ${name}/${gate.id}`);
    }
    if (receipt.archive?.name !== `${asset}.zip` || !sha256.test(receipt.archive.sha256))
      throw new Error("Runtime archive identity is invalid");
    const archive = await read(receipt.archive.name, maximumArchiveBytes);
    if (archive.byteLength !== receipt.archive.bytes || hash(archive) !== receipt.archive.sha256)
      throw new Error(`Runtime archive checksum differs: ${name}`);
    const members = await new Bun.Archive(archive).files();
    if (!receipt.files || Object.keys(receipt.files).length + 1 !== members.size || members.size > 10_000)
      throw new Error("Runtime archive inventory differs");
    const inner = members.get(`${full.triplet}/bun-runtime-full-release.json`);
    // Install/update gates exercise these exact bytes, so their evidence stays outside the archive.
    const { archive: _archive, gates: _gates, ...manifest } = receipt;
    if (!inner || inner.size > maximumJSONBytes || !Bun.deepEquals(await inner.json(), manifest))
      throw new Error("Embedded runtime qualification differs");
    let expanded = 0;
    for (const [member, file] of members) {
      assertPublicMediaPath(member);
      if (!member.startsWith(`${full.triplet}/`) || (expanded += file.size) > 2 * maximumArchiveBytes)
        throw new Error("Runtime archive escaped its target or expanded bound");
      const relative = member.slice(full.triplet.length + 1);
      if (relative === "bun-runtime-full-release.json") continue;
      const expected = receipt.files[relative];
      if (
        !expected ||
        !sha256.test(expected.sha256) ||
        expected.bytes !== file.size ||
        hash(await file.arrayBuffer()) !== expected.sha256
      )
        throw new Error(`Runtime member checksum differs: ${name}`);
    }
    const runtime = target.os === "windows" ? "bun.exe" : "bun";
    if (!sha256.test(receipt.runtimeSHA256) || receipt.files[runtime]?.sha256 !== receipt.runtimeSHA256)
      throw new Error("Runtime executable checksum binding differs");
    const mediaFile = members.get(`${full.triplet}/bun-media.json`);
    if (!mediaFile || mediaFile.size > maximumJSONBytes) throw new Error("Native runtime media inventory absent");
    const media = await mediaFile.json();
    if (
      media.schemaVersion !== 2 ||
      media.target !== target.sdkTarget ||
      !Array.isArray(media.files) ||
      !media.files.length
    )
      throw new Error("Native runtime media inventory differs");
    for (const member of media.files) {
      assertPublicMediaPath(member.name);
      const expected = receipt.files[member.name];
      if (
        !member.name.startsWith("lib/media/") ||
        !expected ||
        expected.sha256 !== member.sha256 ||
        expected.bytes !== member.bytes
      )
        throw new Error("Native runtime media member binding differs");
    }
    platforms.push({ target: name, archive: receipt.archive, receiptSHA256: assets[receiptName]! });
  }
  return {
    schema: 1 as const,
    kind: "bun-runtime-full-qualification" as const,
    source,
    version,
    channel,
    native: true as const,
    passed: true as const,
    allComponentsQualified: false as const,
    completePlatformMatrix: targets.length === fullTargets.length,
    targets: targets.toSorted(),
    assets,
    platforms,
  };
}

export async function verifyRuntimeFullRelease(
  directory: string,
  source: string,
  version: string,
  targets?: string[],
  channel = "candidate",
) {
  const current = await aggregateRuntimeFullRelease(directory, source, version, targets, channel);
  const file = Bun.file(join(directory, "runtime-full-qualification.json"));
  if (!file.size || file.size > maximumJSONBytes || !Bun.deepEquals(await file.json(), current))
    throw new Error("Recorded runtime qualification differs from current artifacts");
  return current;
}

/** Verify the eight full archives and their native evidence without extracting archive members. */
async function validateMediaTargets(
  directory: string,
  source: string,
  version: string,
  channel: string,
  selected: typeof fullTargets,
) {
  identity(source, version, channel);
  if (!isAbsolute(directory)) throw new Error("Qualification directory must be absolute");
  const root = await realpath(directory);
  const assets: Record<string, string> = Object.create(null);
  const platforms: FullReleaseQualification["platforms"] = [];
  const read = async (name: string, maximum = maximumJSONBytes) => {
    assertPublicMediaPath(name);
    if (basename(name) !== name) throw new Error("Qualification inputs must be flat owned assets");
    const path = await realpath(join(root, name));
    const member = relative(root, path);
    if (member.startsWith("..") || isAbsolute(member)) throw new Error("Qualification asset escaped its directory");
    const file = Bun.file(path);
    if (!file.size || file.size > maximum) throw new Error(`Qualification input missing or exceeds bound: ${name}`);
    const bytes = await file.bytes();
    assets[name] = hash(bytes);
    return bytes;
  };
  for (const full of selected) {
    const target = mediaReleaseTarget(full.target);
    const receiptBytes = await read(`${full.triplet}.qualification.json`);
    const receipt: MediaReceipt = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(receiptBytes));
    if (
      receipt.schema !== 1 ||
      receipt.kind !== "bun-media-release" ||
      receipt.source !== source ||
      receipt.version !== version ||
      receipt.target !== full.target ||
      receipt.triplet !== full.triplet ||
      receipt.native !== true ||
      receipt.passed !== true
    )
      throw new Error(`Native media identity differs: ${full.target}`);
    requiredGates(receipt.gates, fullMediaGates);
    const archiveName = `${full.triplet}.zip`;
    if (receipt.archive?.name !== archiveName || !sha256.test(receipt.archive.sha256))
      throw new Error(`Media archive identity differs: ${full.target}`);
    const archiveBytes = await read(archiveName, maximumArchiveBytes);
    if (archiveBytes.length !== receipt.archive.bytes || hash(archiveBytes) !== receipt.archive.sha256)
      throw new Error(`Media archive checksum differs: ${full.target}`);
    const members = await new Bun.Archive(archiveBytes).files();
    if (!receipt.files || members.size !== Object.keys(receipt.files).length + 1 || members.size > 100_000)
      throw new Error(`Media archive member inventory differs: ${full.target}`);
    const inner = members.get(`${full.triplet}/bun-media-release.json`);
    const { archive: _archive, ...manifest } = receipt;
    if (!inner || inner.size > maximumJSONBytes || !Bun.deepEquals(await inner.json(), manifest))
      throw new Error(`Embedded media receipt differs: ${full.target}`);
    let expanded = 0;
    for (const [name, file] of members) {
      assertPublicMediaPath(name);
      if (!name.startsWith(`${full.triplet}/`) || (expanded += file.size) > 6 * maximumArchiveBytes)
        throw new Error("Media archive escaped its target or expanded byte bound");
      const member = name.slice(full.triplet.length + 1);
      if (member === "bun-media-release.json") continue;
      const expected = receipt.files[member];
      if (
        !expected ||
        !sha256.test(expected.sha256) ||
        file.size !== expected.bytes ||
        hash(await file.arrayBuffer()) !== expected.sha256
      )
        throw new Error(`Media member checksum differs: ${name}`);
    }
    const runtimeName = target.os === "windows" ? "bun.exe" : "bun";
    const executableName = target.os === "windows" ? "bun-video.exe" : "bun-video";
    if (
      receipt.files[runtimeName]?.sha256 !== receipt.runtimeSHA256 ||
      receipt.files[executableName]?.sha256 !== receipt.executableSHA256
    )
      throw new Error(`Native runtime artifact binding differs: ${full.target}`);
    for (const gate of receipt.gates) {
      assertPublicMediaPath(gate.log);
      if (receipt.files[gate.log]?.sha256 !== gate.sha256) throw new Error(`Media gate log differs: ${gate.id}`);
    }
    for (const name of ["@aphrody/bun-video", "@aphrody/bun-runtime-sdk"]) {
      const sdk = receipt.sdk?.filter(sdk => sdk.name === name);
      const packed = sdk?.[0];
      if (sdk?.length !== 1 || !packed || receipt.files[`sdk/${packed.archive}`]?.sha256 !== packed.sha256)
        throw new Error(`Packed source SDK missing or changed: ${name}`);
    }
    const artifactNames = Object.keys(receipt.files).filter(name =>
      /^lib\/runtime-sdk\/[^/]+\/current\/manifest\.json$/.test(name),
    );
    if (artifactNames.length !== 1) throw new Error(`Native runtime SDK sidecar missing: ${full.target}`);
    const artifactName = artifactNames[0]!;
    const artifactRoot = artifactName.slice(0, -"manifest.json".length);
    const artifact = await members.get(`${full.triplet}/${artifactName}`)!.json();
    const sdkTarget = targetFor(target.platform, target.runtimeArch, target.os === "linux" ? target.abi : undefined);
    const nativeBuild = artifact.build?.native;
    if (
      artifact.schema !== 1 ||
      artifact.sources?.bun?.rev !== source ||
      artifact.sources?.bun?.dirty !== false ||
      artifact.build?.panicRecovery !== true ||
      !/^[a-z0-9_-]+$/.test(artifact.target) ||
      artifactRoot !== `lib/runtime-sdk/${artifact.target}/current/` ||
      artifact.target !== sdkTarget ||
      nativeBuild?.target !== artifact.target ||
      nativeBuild?.abi !== artifact.abi ||
      nativeBuild?.panic_recovery !== true ||
      !/^[a-f0-9]{12,40}$/.test(nativeBuild?.git_rev ?? "") ||
      !source.startsWith(nativeBuild.git_rev)
    )
      throw new Error(`Native runtime SDK source or ABI binding differs: ${full.target}`);
    const libraryNames = Object.keys(artifact.files ?? {}).filter(name => /\.(?:dll|so|dylib)$/.test(name));
    if (libraryNames.length !== 1) throw new Error(`Native runtime SDK module absent: ${full.target}`);
    for (const [name, expected] of Object.entries(artifact.files ?? {}) as [string, FileIdentity][]) {
      if (
        !/^[A-Za-z0-9_.-]+$/.test(name) ||
        name === "." ||
        name === ".." ||
        receipt.files[artifactRoot + name]?.sha256 !== expected.sha256 ||
        receipt.files[artifactRoot + name]?.bytes !== expected.bytes
      )
        throw new Error(`Native runtime SDK archived member differs: ${full.target}/${name}`);
    }
    const header = members.get(`${full.triplet}/${artifactRoot}yolo_runtime.h`);
    const headerText = header && header.size < maximumJSONBytes ? await header.text() : "";
    const abiMajor = headerText.match(/#define YOLO_ABI_MAJOR (\d+)u/)?.[1];
    const abiMinor = headerText.match(/#define YOLO_ABI_MINOR (\d+)u/)?.[1];
    if (!abiMajor || !abiMinor || artifact.abi !== `${abiMajor}.${abiMinor}`)
      throw new Error(`Native runtime SDK header ABI differs: ${full.target}`);
    const nginxRoot = `lib/nginx/${target.sdkTarget}/current/`;
    const nginxFile = members.get(`${full.triplet}/${nginxRoot}nginx-sdk.json`);
    if (!nginxFile || nginxFile.size > maximumJSONBytes)
      throw new Error(`Native NGINX sidecar missing: ${full.target}`);
    const nginxContext = { source, target: full.target, platform: target.platform, arch: target.runtimeArch };
    const nginx = nginxReleaseManifest(await nginxFile.json(), nginxContext);
    for (const [name, expected] of Object.entries(nginx.files))
      if (
        receipt.files[nginxRoot + name]?.sha256 !== expected.sha256 ||
        receipt.files[nginxRoot + name]?.bytes !== expected.bytes
      )
        throw new Error(`Native NGINX archived member differs: ${full.target}/${name}`);
    const nginxEvidence = members.get(`${full.triplet}/${nginxRoot}receipts/module-qualification.json`);
    if (!nginxEvidence || nginxEvidence.size > maximumJSONBytes) throw new Error("Native NGINX module evidence absent");
    nginxModuleQualification(await nginxEvidence.json(), nginxContext, nginx.files[nginx.executable]!);
    const nginxClosure = members.get(`${full.triplet}/${nginxRoot}receipts/closure.json`);
    if (!nginxClosure || nginxClosure.size > maximumJSONBytes) throw new Error("Native NGINX closure evidence absent");
    nginxClosureQualification(await nginxClosure.json(), nginxContext, nginx.files[nginx.executable]!);
    const nativeBytes = await read(`${full.triplet}.platform-gates.json`);
    const native: NativePlatformQualification = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(nativeBytes),
    );
    const pinnedSDK = mediaSDKManifest.targets[target.sdkTarget as keyof typeof mediaSDKManifest.targets];
    if (
      native.schema !== 1 ||
      native.kind !== "bun-native-platform-gates" ||
      native.source !== source ||
      native.version !== version ||
      native.target !== full.target ||
      native.native !== true ||
      native.passed !== true ||
      native.execution !== "native" ||
      native.platform !== target.platform ||
      native.arch !== target.runtimeArch ||
      native.archiveSHA256 !== receipt.archive.sha256 ||
      native.runtimeSHA256 !== receipt.runtimeSHA256 ||
      native.executableSHA256 !== receipt.executableSHA256 ||
      native.sdkSources?.ffmpeg !== pinnedSDK.ffmpeg.sourceRevision ||
      native.sdkSources?.mpv !== pinnedSDK.mpv.sourceRevision
    )
      throw new Error(`Native platform or SDK source binding differs: ${full.target}`);
    requiredGates(native.gates, [
      ...fullPlatformGates,
      ...(target.os === "windows" ? ["winget-manifest", "winget-install"] : []),
    ]);
    for (const gate of native.gates) {
      if (gate.log !== `${full.triplet}-${gate.id}.log` || hash(await read(gate.log)) !== gate.sha256)
        throw new Error(`Native platform log differs: ${full.target}/${gate.id}`);
    }
    platforms.push({
      target: full.target,
      triplet: full.triplet,
      archive: { sha256: receipt.archive.sha256, bytes: receipt.archive.bytes },
      receiptSHA256: hash(receiptBytes),
      platformReceiptSHA256: hash(nativeBytes),
    });
  }
  return {
    schema: 1,
    kind: "bun-media-target-qualification" as const,
    source,
    version,
    native: true,
    passed: true,
    targets: selected.map(target => target.target),
    assets,
    platforms,
  };
}

export async function aggregateFullRelease(directory: string, source: string, version: string, channel = "candidate") {
  const result = await validateMediaTargets(directory, source, version, channel, fullTargets);
  return {
    ...result,
    schema: 1 as const,
    native: true as const,
    passed: true as const,
    kind: "bun-media-full-qualification" as const,
  } satisfies FullReleaseQualification;
}

/** A host install validates one complete target, without claiming the eight-platform release. */
export async function validateNativeMediaTarget(directory: string, source: string, version: string, target: string) {
  const selected = fullTargets.filter(item => item.target === target);
  if (selected.length !== 1) throw new Error("Unknown native media install target");
  return validateMediaTargets(directory, source, version, "candidate", selected);
}

export async function verifyFullRelease(
  directory: string,
  source: string,
  version: string,
  channel = "candidate",
  recordedFile = join(directory, "media-full-qualification.json"),
) {
  const file = Bun.file(recordedFile);
  if (!file.size || file.size > maximumJSONBytes)
    throw new Error("Missing or oversized eight-full qualification aggregate");
  const recorded: FullReleaseQualification = await file.json();
  const actual = await aggregateFullRelease(directory, source, version, channel);
  if (!Bun.deepEquals(recorded, actual))
    throw new Error("Eight-full qualification aggregate differs from its exact artifacts");
  return actual;
}

/** Publication workflows download only the exact public-product evidence, then recheck every byte. */
export async function downloadFullRelease(
  tag: string,
  directory: string,
  source: string,
  version: string,
  channel = "candidate",
) {
  identity(source, version, channel);
  if (!/^(?:bun-v|aphrody-v)[0-9A-Za-z.+-]+$/.test(tag) || !isAbsolute(directory))
    throw new Error("Qualification download requires an owner runtime tag and absolute empty directory");
  const gh = async (args: string[], timeout = 30_000) => {
    await using child = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe", timeout, killSignal: "SIGKILL" });
    const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    if (stdout.length + stderr.length > maximumJSONBytes)
      throw new Error("Qualification GitHub output exceeds its bound");
    if (exitCode !== 0) throw new Error("Unable to fetch the exact owner release qualification");
    return stdout;
  };
  const repository = "aphrody-labs/bun";
  const release = JSON.parse(await gh(["api", `repos/${repository}/releases/tags/${tag}`]));
  if (release.target_commitish !== source) throw new Error("Qualification release source differs from this checkout");
  let ref = JSON.parse(await gh(["api", `repos/${repository}/git/ref/tags/${tag}`])).object;
  for (let depth = 0; ref.type === "tag" && depth < 5; depth++)
    ref = JSON.parse(await gh(["api", `repos/${repository}/git/tags/${ref.sha}`])).object;
  if (ref.type !== "commit" || ref.sha !== source)
    throw new Error("Qualification tag source differs from this checkout");
  const names = fullTargets.flatMap(target => [
    `${target.triplet}.zip`,
    `${target.triplet}.qualification.json`,
    `${target.triplet}.platform-gates.json`,
    ...[...fullPlatformGates, ...(target.os === "windows" ? ["winget-manifest", "winget-install"] : [])].map(
      id => `${target.triplet}-${id}.log`,
    ),
  ]);
  const available = new Set(release.assets?.map((asset: { name: string }) => asset.name));
  for (const name of names) if (!available.has(name)) throw new Error(`Missing eight-full release evidence: ${name}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await readdir(directory)).length) throw new Error("Qualification download directory must be empty");
  await gh(
    [
      "release",
      "download",
      tag,
      "--repo",
      repository,
      "--dir",
      directory,
      ...names.flatMap(name => ["--pattern", name]),
    ],
    180_000,
  );
  const receipt = await aggregateFullRelease(directory, source, version, channel);
  await Bun.write(join(directory, "media-full-qualification.json"), JSON.stringify(receipt, null, 2) + "\n");
  return verifyFullRelease(directory, source, version, channel);
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const action = args.shift();
  if (action === "aggregate-runtime" || action === "verify-runtime") {
    const [directory, source, version, channel = "candidate", ...targets] = args;
    if (!directory || !source || !version)
      throw new Error(
        "Usage: release-aggregation.ts aggregate-runtime|verify-runtime <directory> <source-SHA> <version> [candidate|stable] [target ...]",
      );
    const selected = targets.length ? targets : undefined;
    const receipt =
      action === "verify-runtime"
        ? await verifyRuntimeFullRelease(directory, source, version, selected, channel)
        : await aggregateRuntimeFullRelease(directory, source, version, selected, channel);
    if (action === "aggregate-runtime") {
      const file = Bun.file(join(directory, "runtime-full-qualification.json"));
      if (await file.exists()) {
        if (file.size > maximumJSONBytes || !Bun.deepEquals(await file.json(), receipt))
          throw new Error("Immutable runtime qualification already exists with different contents");
      } else await Bun.write(file, JSON.stringify(receipt, null, 2) + "\n");
    }
    console.log(
      JSON.stringify({
        source,
        targets: receipt.targets,
        native: true,
        passed: true,
        completePlatformMatrix: receipt.completePlatformMatrix,
        allComponentsQualified: false,
      }),
    );
    process.exit(0);
  }
  const tag = action === "download-verify" ? args.shift() : undefined;
  const [directory, source, version, channel = "candidate", recordedFile] = args;
  if (!directory || !source || !version || !["aggregate", "verify", "download-verify"].includes(action ?? ""))
    throw new Error(
      "Usage: release-aggregation.ts aggregate|verify|download-verify [tag] <absolute-artifacts> <source-SHA> <version> [candidate|stable]",
    );
  const receipt =
    action === "download-verify"
      ? await downloadFullRelease(tag!, directory, source, version, channel)
      : action === "verify"
        ? await verifyFullRelease(directory, source, version, channel, recordedFile)
        : await aggregateFullRelease(directory, source, version, channel);
  if (action === "aggregate")
    await Bun.write(join(directory, "media-full-qualification.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({ source: receipt.source, targets: receipt.targets, native: true, passed: true }));
}
