import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { copyFile, mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { fullIntegrationPolicy, runtimeReleaseMatrix } from "./release-matrix.ts";

export interface FactoryQualification {
  schema: 1;
  source: string;
  version: string;
  host: "vps";
  assets: Record<string, string>;
  gates: { id: string; passed: boolean; log: string }[];
  platforms: { triplet: string; native: boolean; passed: boolean; log: string }[];
  mullvad?: {
    source: string;
    mullvadSource: string;
    target: "x86_64-unknown-linux-gnu";
    native: boolean;
    passed: boolean;
    log: string;
    asset: "bun-vpn-linux-x86_64.tar.gz";
  };
}

const requiredGates = ["runtime", "site", "source-lint", "native-types", "native-test-types"];

export interface WindowsCandidateQualification {
  schema: 1;
  kind: "windows-candidate";
  host: "vps";
  source: string;
  version: string;
  target: "x86_64-pc-windows-msvc";
  sourceReceiptSHA256: string;
  artifact: { name: string; sha256: string; bytes: number };
  gates: {
    id: "native-compile" | "wine-smoke";
    passed: boolean;
    artifactSha256: string;
    log: { name: string; sha256: string };
  }[];
}

export interface WindowsCandidateInput {
  artifact: string;
  qualification: string;
  qualificationSHA256: string;
  sourceReceipt: string;
  expectedSource: string;
}

const candidateMaxBytes = 2 * 1024 * 1024 * 1024;
const digestPattern = /^[a-f0-9]{64}$/;
const safeCandidateName = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

async function candidateFileIdentity(path: string, limit: number) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > limit)
    throw new Error("Candidate file size or type is invalid");
  const hash = new Bun.CryptoHasher("sha256");
  let bytes = 0;
  for await (const chunk of Bun.file(path).stream()) {
    bytes += chunk.byteLength;
    if (bytes > limit) throw new Error("Candidate file exceeded its bounded size");
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function candidateJSON<T>(path: string, limit: number, expectedSHA256: string, identity: string): Promise<T> {
  const bytes = await Bun.file(path)
    .slice(0, limit + 1)
    .bytes();
  if (!bytes.length || bytes.length > limit) throw new Error(`Candidate ${identity} size is invalid`);
  if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== expectedSHA256)
    throw new Error(`Candidate ${identity} SHA-256 mismatch`);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(`Malformed candidate ${identity} JSON`);
  }
}

export async function verifyWindowsCandidatePE(path: string, size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > candidateMaxBytes || (await stat(path)).size !== size)
    throw new Error("Candidate PE size is invalid");
  const header = await Bun.file(path)
    .slice(0, Math.min(size, 1024 * 1024))
    .bytes();
  const pe = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const invalid = () => new Error("Candidate must be an AMD64 PE32+ executable with console subsystem 3");
  if (header.length < 64 || pe.getUint16(0, true) !== 0x5a4d) throw invalid();
  const offset = pe.getUint32(0x3c, true);
  if (offset < 64 || offset + 24 > header.length || pe.getUint32(offset, true) !== 0x00004550) throw invalid();
  const sections = pe.getUint16(offset + 6, true);
  const optionalSize = pe.getUint16(offset + 20, true);
  const characteristics = pe.getUint16(offset + 22, true);
  const optional = offset + 24;
  const sectionTable = optional + optionalSize;
  if (
    pe.getUint16(offset + 4, true) !== 0x8664 ||
    sections < 1 ||
    sections > 96 ||
    !(characteristics & 0x0002) ||
    characteristics & 0x2000 ||
    optionalSize < 112 ||
    sectionTable + sections * 40 > header.length ||
    pe.getUint16(optional, true) !== 0x20b ||
    pe.getUint16(optional + 68, true) !== 3
  )
    throw invalid();
  const headerSize = pe.getUint32(optional + 60, true);
  if (headerSize < sectionTable + sections * 40 || headerSize > size) throw invalid();
  for (let i = 0; i < sections; i++) {
    const section = sectionTable + i * 40;
    const rawSize = pe.getUint32(section + 16, true);
    const rawOffset = pe.getUint32(section + 20, true);
    if (rawSize && (rawOffset < headerSize || rawOffset + rawSize > size)) throw invalid();
  }
}

/** This candidate lane proves cross compilation and Wine smoke, not native Windows qualification. */
export async function verifyWindowsCandidate(input: WindowsCandidateInput) {
  if (!/^[a-f0-9]{40}$/.test(input.expectedSource) || !digestPattern.test(input.qualificationSHA256))
    throw new Error("Exact candidate source and qualification SHA-256 are required");
  const qualification = resolve(input.qualification);
  const receipt = await candidateJSON<WindowsCandidateQualification>(
    qualification,
    1024 * 1024,
    input.qualificationSHA256,
    "qualification",
  );
  if (
    !receipt ||
    receipt.schema !== 1 ||
    receipt.kind !== "windows-candidate" ||
    receipt.host !== "vps" ||
    receipt.source !== input.expectedSource ||
    receipt.target !== "x86_64-pc-windows-msvc" ||
    typeof receipt.version !== "string" ||
    !receipt.version.length ||
    receipt.version.length > 128 ||
    !digestPattern.test(receipt.sourceReceiptSHA256 ?? "") ||
    !receipt.artifact ||
    typeof receipt.artifact.name !== "string" ||
    !safeCandidateName.test(receipt.artifact.name) ||
    !receipt.artifact.name.endsWith(".exe") ||
    !digestPattern.test(receipt.artifact.sha256 ?? "") ||
    !Number.isSafeInteger(receipt.artifact.bytes) ||
    receipt.artifact.bytes < 1 ||
    receipt.artifact.bytes > candidateMaxBytes ||
    !Array.isArray(receipt.gates) ||
    receipt.gates.length !== 2
  )
    throw new Error("Candidate qualification identity mismatch");
  const sourceReceipt = resolve(input.sourceReceipt);
  await candidateJSON(sourceReceipt, 8 * 1024 * 1024, receipt.sourceReceiptSHA256, "source receipt");
  for (const id of ["native-compile", "wine-smoke"] as const) {
    const gates = receipt.gates.filter(gate => gate?.id === id);
    const gate = gates[0];
    if (
      gates.length !== 1 ||
      gate?.passed !== true ||
      gate.artifactSha256 !== receipt.artifact.sha256 ||
      !gate.log ||
      typeof gate.log.name !== "string" ||
      !safeCandidateName.test(gate.log.name) ||
      !digestPattern.test(gate.log.sha256 ?? "")
    )
      throw new Error(`Candidate qualification gate failed or missing: ${id}`);
    if (
      (await candidateFileIdentity(join(dirname(qualification), gate.log.name), 64 * 1024 * 1024)).sha256 !==
      gate.log.sha256
    )
      throw new Error(`Candidate qualification log SHA-256 mismatch: ${id}`);
  }
  const artifact = resolve(input.artifact);
  if (basename(artifact) !== receipt.artifact.name) throw new Error("Candidate artifact filename mismatch");
  const file = await candidateFileIdentity(artifact, candidateMaxBytes);
  if (file.bytes !== receipt.artifact.bytes || file.sha256 !== receipt.artifact.sha256)
    throw new Error("Candidate artifact SHA-256 or size mismatch");
  await verifyWindowsCandidatePE(artifact, file.bytes);
  return { artifact, receipt, qualificationSHA256: input.qualificationSHA256 };
}

export async function installWindowsCandidate(input: WindowsCandidateInput & { workspace?: string; output?: string }) {
  const verified = await verifyWindowsCandidate(input);
  const workspace = input.workspace ?? resolve(import.meta.dir, "../..");
  if (!isAbsolute(workspace) || (input.output !== undefined && !isAbsolute(input.output)))
    throw new Error("Candidate workspace and output paths must be absolute");
  const output = input.output ?? join(workspace, "build/release/bun.exe");
  if (resolve(output) === verified.artifact)
    throw new Error("Transferred candidate must differ from its installed destination");
  if (process.platform === "win32" && resolve(output).toLowerCase() === resolve(process.execPath).toLowerCase())
    throw new Error("Run candidate installation with a Bun executable outside the replacement destination");
  await mkdir(dirname(output), { recursive: true });
  const staged = `${output}.part.${crypto.randomUUID()}`;
  let ownsStage = false;
  try {
    {
      await using stage = await open(staged, "wx");
      ownsStage = true;
      await stage.close();
    }
    await copyFile(verified.artifact, staged);
    const identity = await candidateFileIdentity(staged, candidateMaxBytes);
    if (identity.bytes !== verified.receipt.artifact.bytes || identity.sha256 !== verified.receipt.artifact.sha256)
      throw new Error("Staged candidate SHA-256 or size mismatch");
    await verifyWindowsCandidatePE(staged, identity.bytes);
    await rename(staged, output);
    ownsStage = false;
  } finally {
    if (ownsStage) await unlink(staged);
  }
  return {
    output,
    source: verified.receipt.source,
    sourceReceiptSHA256: verified.receipt.sourceReceiptSHA256,
    sha256: verified.receipt.artifact.sha256,
    bytes: verified.receipt.artifact.bytes,
    qualification: "cross-compiled-and-wine-smoke-passed" as const,
  };
}

/** Publication consumes owner receipts; it never builds or invents qualification. */
export async function verifyFactoryArtifacts(
  directory: string,
  source: string,
  version: string,
  channel: string,
  platforms: { triplet: string; assets: string[] }[],
  gates: string[] = requiredGates,
) {
  if (!/^[a-f0-9]{40}$/.test(source)) throw new Error("Exact source SHA required");
  if (channel !== "candidate" && channel !== "stable") throw new Error("Unknown release channel");
  if (channel === "stable" && fullIntegrationPolicy.pendingOwners.length)
    throw new Error("Stable integration qualification is pending");
  const receipt: FactoryQualification = await Bun.file(join(directory, "factory-qualification.json")).json();
  if (receipt.schema !== 1 || receipt.source !== source || receipt.version !== version || receipt.host !== "vps")
    throw new Error("Factory receipt identity mismatch");
  if (!receipt.assets || !Array.isArray(receipt.gates) || !Array.isArray(receipt.platforms))
    throw new Error("Incomplete factory receipt");
  for await (const name of new Bun.Glob("*").scan({ cwd: directory, onlyFiles: false })) {
    if (name !== "factory-qualification.json" && name !== "SHA256SUMS.txt" && !Object.hasOwn(receipt.assets, name))
      throw new Error(`Unverified draft asset: ${name}`);
  }
  const assertAsset = (name: string) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name) || !/^[a-f0-9]{64}$/.test(receipt.assets[name] ?? ""))
      throw new Error(`Missing or unsafe hashed asset: ${name}`);
  };
  for (const [name, expected] of Object.entries(receipt.assets)) {
    assertAsset(name);
    const file = Bun.file(join(directory, name));
    if (!(await file.exists())) throw new Error(`Missing factory asset: ${name}`);
    const actual = new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex");
    if (actual !== expected) throw new Error(`Factory checksum mismatch: ${name}`);
  }
  for (const id of gates) {
    const matches = receipt.gates.filter(gate => gate.id === id);
    if (matches.length !== 1 || matches[0]!.passed !== true) throw new Error(`Factory gate failed or missing: ${id}`);
    assertAsset(matches[0]!.log);
  }
  if (!platforms.length) throw new Error("Empty factory platform selection");
  for (const target of platforms) {
    for (const asset of target.assets) assertAsset(asset);
    const matches = receipt.platforms.filter(platform => platform.triplet === target.triplet);
    if (matches.length !== 1 || matches[0]!.native !== true || matches[0]!.passed !== true)
      throw new Error(`Native platform qualification missing: ${target.triplet}`);
    assertAsset(matches[0]!.log);
  }
  const needsMullvad = platforms.some(platform => /^bun-linux-x64(?:-full)?$/.test(platform.triplet));
  if (needsMullvad) {
    const sidecar = receipt.mullvad;
    if (
      !sidecar ||
      sidecar.source !== source ||
      !/^[a-f0-9]{40}$/.test(sidecar.mullvadSource) ||
      sidecar.target !== "x86_64-unknown-linux-gnu" ||
      sidecar.native !== true ||
      sidecar.passed !== true ||
      sidecar.asset !== "bun-vpn-linux-x86_64.tar.gz"
    )
      throw new Error("Native Mullvad VPS sidecar qualification missing");
    // The vpn plugin (aphrody-labs/bun-vpn) is the submodule plugins/vpn; its pin is the sidecar's source.
    const plugin = Bun.spawnSync(["git", "ls-tree", source, "plugins/vpn"], { stdout: "pipe", stderr: "pipe" });
    const gitlink = /^160000 commit ([a-f0-9]{40})	plugins/vpn$/.exec(plugin.stdout.toString().trim());
    if (plugin.exitCode !== 0 || !gitlink || sidecar.mullvadSource !== gitlink[1])
      throw new Error("Mullvad sidecar source does not match the vpn plugin pinned by the Bun source");
    assertAsset(sidecar.asset);
    assertAsset(sidecar.log);
  }
  const sums = await Bun.file(join(directory, "SHA256SUMS.txt")).text();
  const checksums = new Map<string, string>();
  for (const line of sums.trim().split("\n")) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9_.-]*\.(?:zip|node|tar\.gz))$/.exec(line);
    if (!match || checksums.has(match[2]!)) throw new Error("Invalid or duplicate release checksum");
    checksums.set(match[2]!, match[1]!);
  }
  const archives = Object.keys(receipt.assets).filter(name => /\.(?:zip|node|tar\.gz)$/.test(name));
  const selectedAssets = new Set(platforms.flatMap(platform => platform.assets));
  if (needsMullvad) selectedAssets.add(receipt.mullvad!.asset);
  if (archives.some(name => !selectedAssets.has(name))) throw new Error("Unselected binary factory asset");
  if (checksums.size !== archives.length || archives.some(name => checksums.get(name) !== receipt.assets[name]))
    throw new Error("Release checksum inventory differs from factory receipt");
  return receipt;
}

export function verifyFactoryRelease(
  directory: string,
  source: string,
  version: string,
  channel: string,
  targets: string[] = [],
) {
  return verifyFactoryArtifacts(
    directory,
    source,
    version,
    channel,
    runtimeReleaseMatrix(targets).map(target => ({
      triplet: target.triplet,
      assets: [`${target.triplet}.zip`, ...(target.baselineAlias ? [`${target.baselineAlias}.zip`] : [])],
    })),
  );
}

if (import.meta.main) {
  const [action, artifact, qualification, qualificationSHA256, sourceReceipt, expectedSource, output] =
    process.argv.slice(2);
  if (action === "install-windows-candidate" || action === "verify-windows-candidate") {
    if (!artifact || !qualification || !qualificationSHA256 || !sourceReceipt || !expectedSource)
      throw new Error(
        "Usage: release-factory.ts <verify-windows-candidate|install-windows-candidate> <transferred-bun.exe> <qualification.json> <qualification-SHA256> <source-receipt.json> <source-SHA> [absolute-output]",
      );
    const input = { artifact, qualification, qualificationSHA256, sourceReceipt, expectedSource };
    if (action === "install-windows-candidate")
      console.log(JSON.stringify(await installWindowsCandidate({ ...input, output })));
    else {
      const verified = await verifyWindowsCandidate(input);
      console.log(
        JSON.stringify({
          source: verified.receipt.source,
          sha256: verified.receipt.artifact.sha256,
          bytes: verified.receipt.artifact.bytes,
          qualification: "cross-compiled-and-wine-smoke-passed",
        }),
      );
    }
  } else {
    const [directory, source, version, channel, ...targets] = process.argv.slice(2);
    if (!directory || !source || !version || !channel)
      throw new Error(
        "Usage: release-factory.ts <downloaded-draft-assets> <source-SHA> <version> <candidate|stable> [target ...]",
      );
    await verifyFactoryRelease(directory, source, version, channel, targets);
    console.log(`Verified factory artifacts for ${source}`);
  }
}
