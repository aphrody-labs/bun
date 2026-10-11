import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativePlan } from "./delivery-native.ts";
import { verifyFactoryArtifacts, verifyFactoryRelease, type FactoryQualification } from "./release-factory.ts";

const sourceResult = Bun.spawnSync(["git", "rev-parse", "HEAD"], { stdout: "pipe", stderr: "pipe" });
if (sourceResult.exitCode !== 0) throw new Error("Unable to resolve the current Bun source commit");
const source = sourceResult.stdout.toString().trim();
const mullvadLink = Bun.spawnSync(["git", "ls-tree", source, "vendor/mullvad"], { stdout: "pipe", stderr: "pipe" });
const mullvadSource = mullvadLink.stdout.toString().match(/^160000 commit ([a-f0-9]{40})\s+vendor\/mullvad$/m)?.[1];
if (!mullvadSource) throw new Error("Unable to resolve the pinned Mullvad source commit");
async function fixture(run: (directory: string, receipt: FactoryQualification) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "factory-release-test-"));
  try {
    const receipt: FactoryQualification = {
      schema: 1,
      source,
      version: "1.4.4",
      host: "vps",
      assets: {},
      gates: ["runtime", "site", "source-lint", "native-types", "native-test-types"].map(id => ({
        id,
        passed: true,
        log: `${id}.log`,
      })),
      platforms: ["bun-linux-x64", "bun-linux-x64-full"].map(triplet => ({
        triplet,
        native: true,
        passed: true,
        log: `${triplet}.log`,
      })),
      mullvad: {
        source,
        mullvadSource,
        target: "x86_64-unknown-linux-gnu",
        native: true,
        passed: true,
        log: "mullvad-linux-x64.log",
        asset: "bun-vpn-linux-x86_64.tar.gz",
      },
    };
    for (const name of [
      ...receipt.gates.map(gate => gate.log),
      ...receipt.platforms.flatMap(p => [p.log, `${p.triplet}.zip`]),
      "bun-linux-x64-baseline.zip",
      "bun-linux-x64-baseline-full.zip",
      receipt.mullvad!.log,
      receipt.mullvad!.asset,
    ]) {
      const bytes = `validator fixture ${name}`;
      await Bun.write(join(directory, name), bytes);
      receipt.assets[name] = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    }
    await Bun.write(
      join(directory, "SHA256SUMS.txt"),
      Object.entries(receipt.assets)
        .filter(([name]) => /\.(?:zip|tar\.gz)$/.test(name))
        .map(([name, hash]) => `${hash}  ${name}`)
        .join("\n") + "\n",
    );
    await Bun.write(join(directory, "factory-qualification.json"), JSON.stringify(receipt));
    await run(directory, receipt);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("factory publication verifies exact receipt and asset hashes without building", async () => {
  await fixture(async directory => {
    expect((await verifyFactoryRelease(directory, source, "1.4.4", "candidate", ["linux-x64"])).source).toBe(source);
    await Bun.write(join(directory, "bun-linux-x64.zip"), "changed");
    await expect(verifyFactoryRelease(directory, source, "1.4.4", "candidate", ["linux-x64"])).rejects.toThrow(
      "checksum mismatch",
    );
  });
});

test("factory publication rejects missing gates, source drift and cross compilation receipts", async () => {
  await fixture(async (directory, receipt) => {
    await expect(verifyFactoryRelease(directory, "b".repeat(40), "1.4.4", "candidate", ["linux-x64"])).rejects.toThrow(
      "identity mismatch",
    );
    receipt.gates[0]!.passed = false;
    await Bun.write(join(directory, "factory-qualification.json"), JSON.stringify(receipt));
    await expect(verifyFactoryRelease(directory, source, "1.4.4", "candidate", ["linux-x64"])).rejects.toThrow(
      "gate failed",
    );
    receipt.gates[0]!.passed = true;
    receipt.platforms[0]!.native = false;
    await Bun.write(join(directory, "factory-qualification.json"), JSON.stringify(receipt));
    await expect(verifyFactoryRelease(directory, source, "1.4.4", "candidate", ["linux-x64"])).rejects.toThrow(
      "Native platform",
    );
  });
});

test("Linux VPS release requires its pinned, native Mullvad sidecar receipt", async () => {
  await fixture(async (directory, receipt) => {
    delete receipt.mullvad;
    await Bun.write(join(directory, "factory-qualification.json"), JSON.stringify(receipt));
    await expect(verifyFactoryRelease(directory, source, "1.4.4", "candidate", ["linux-x64"])).rejects.toThrow(
      "Native Mullvad VPS sidecar qualification missing",
    );
  });
  await fixture(async (directory, receipt) => {
    receipt.mullvad!.mullvadSource = "c".repeat(40);
    await Bun.write(join(directory, "factory-qualification.json"), JSON.stringify(receipt));
    await expect(verifyFactoryRelease(directory, source, "1.4.4", "candidate", ["linux-x64"])).rejects.toThrow(
      "Mullvad sidecar source does not match the Bun source gitlink",
    );
  });
});

test("factory publication rejects unverified draft assets and pending stable integration", async () => {
  await fixture(async directory => {
    await expect(verifyFactoryRelease(directory, source, "1.4.4", "stable", ["linux-x64"])).rejects.toThrow("pending");
    await Bun.write(join(directory, "extra.zip"), "unqualified");
    await expect(verifyFactoryRelease(directory, source, "1.4.4", "candidate", ["linux-x64"])).rejects.toThrow(
      "Unverified draft asset",
    );
  });
});

test("current delivery workflows default to factory plans and require a native draft for publication", async () => {
  const directory = mkdtempSync(join(tmpdir(), "factory-delivery-plan-test-"));
  try {
    await Bun.write(join(directory, "package.json"), JSON.stringify({ name: "bun", version: "1.4.4" }));
    for (const name of ["aphrody-release.yml", "aphrody-publish-native.yml"]) {
      const text = await Bun.file(new URL(`../../.github/workflows/${name}`, import.meta.url)).text();
      await Bun.write(join(directory, ".github/workflows", name), text);
      const workflow = Bun.YAML.parse(text) as { jobs: Record<string, unknown> };
      expect(Object.keys(workflow.jobs)).toEqual(["plan", "publish"]);
    }
    for (const args of [
      ["init", "--quiet", "--initial-branch=main"],
      ["config", "user.email", "fixture@example.com"],
      ["config", "user.name", "fixture"],
      ["remote", "add", "origin", "https://github.com/aphrody-labs/bun.git"],
      ["add", "-A"],
      ["commit", "--quiet", "-m", "fixture"],
    ]) {
      if (!Bun.spawnSync(["git", ...args], { cwd: directory, stdout: "pipe", stderr: "pipe" }).success)
        throw new Error("Fixture Git preparation failed");
    }
    const runtime = nativePlan(directory, "aphrody-labs/bun", "main", "runtime");
    expect(runtime.inputs.publish).toBe("false");
    expect(runtime.inputs["publish-only"]).toBeUndefined();
    expect(runtime.blockers).toEqual([]);
    const native = nativePlan(directory, "aphrody-labs/bun", "main", "native", true);
    expect(native.inputs["dry-run"]).toBe("false");
    expect(native.blockers).toContain("Explicit owner factory draft tag is required before native publication");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native addons reuse factory receipts and reject unselected binaries", async () => {
  await fixture(async (directory, receipt) => {
    for (const name of Object.keys(receipt.assets).filter(name => /\.(?:zip|tar\.gz)$/.test(name))) {
      unlinkSync(join(directory, name));
      delete receipt.assets[name];
    }
    const asset = "bun-plugin-n2b.linux-x64-gnu.node";
    const bytes = "native validator fixture";
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    await Bun.write(join(directory, asset), bytes);
    receipt.assets[asset] = hash;
    receipt.platforms = [{ triplet: "n2b-linux-x64-gnu", native: true, passed: true, log: "runtime.log" }];
    await Bun.write(join(directory, "SHA256SUMS.txt"), `${hash}  ${asset}\n`);
    await Bun.write(join(directory, "factory-qualification.json"), JSON.stringify(receipt));
    const platforms = [{ triplet: "n2b-linux-x64-gnu", assets: [asset] }];
    expect((await verifyFactoryArtifacts(directory, source, "1.4.4", "candidate", platforms)).source).toBe(source);
    await Bun.write(join(directory, "extra.node"), bytes);
    receipt.assets["extra.node"] = hash;
    await Bun.write(join(directory, "SHA256SUMS.txt"), `${hash}  ${asset}\n${hash}  extra.node\n`);
    await Bun.write(join(directory, "factory-qualification.json"), JSON.stringify(receipt));
    await expect(verifyFactoryArtifacts(directory, source, "1.4.4", "candidate", platforms)).rejects.toThrow(
      "Unselected binary",
    );
  });
});
