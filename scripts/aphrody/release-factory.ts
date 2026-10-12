import { join } from "node:path";
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
    const embeddedSource = Bun.spawnSync(["git", "cat-file", "-e", `${source}:vendor/mullvad/Cargo.toml`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (embeddedSource.exitCode !== 0 || sidecar.mullvadSource !== source)
      throw new Error("Mullvad sidecar source does not match the embedded Bun source");
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
  const [directory, source, version, channel, ...targets] = process.argv.slice(2);
  if (!directory || !source || !version || !channel)
    throw new Error(
      "Usage: release-factory.ts <downloaded-draft-assets> <source-SHA> <version> <candidate|stable> [target ...]",
    );
  await verifyFactoryRelease(directory, source, version, channel, targets);
  console.log(`Verified factory artifacts for ${source}`);
}
