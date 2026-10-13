import { mkdir, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative } from "node:path";
import { assertPublicMediaPath, mediaReleaseTarget } from "./media-release";
import { fullIntegrationPolicy, runtimeReleaseMatrix } from "./release-matrix";
import mediaSDKManifest from "../../packages/bun-video/src/sdk-manifest.json";

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

/** Verify the eight full archives and their native evidence without extracting archive members. */
export async function aggregateFullRelease(directory: string, source: string, version: string, channel = "candidate") {
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
  for (const full of fullTargets) {
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
    kind: "bun-media-full-qualification",
    source,
    version,
    native: true,
    passed: true,
    targets: fullTargets.map(target => target.target),
    assets,
    platforms,
  } satisfies FullReleaseQualification;
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
