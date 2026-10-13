import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { nativePlan } from "./delivery-native.ts";
import {
  installWindowsCandidate,
  verifyWindowsCandidate,
  verifyWindowsCandidatePE,
  verifyFactoryArtifacts,
  verifyFactoryRelease,
  type FactoryQualification,
  type WindowsCandidateQualification,
} from "./release-factory.ts";
import { tempDir } from "../../test/harness";

function candidatePEFixture(): Uint8Array {
  const bytes = new Uint8Array(1024);
  const pe = new DataView(bytes.buffer);
  pe.setUint16(0, 0x5a4d, true);
  pe.setUint32(0x3c, 0x80, true);
  pe.setUint32(0x80, 0x00004550, true);
  pe.setUint16(0x84, 0x8664, true);
  pe.setUint16(0x86, 1, true);
  pe.setUint16(0x94, 240, true);
  pe.setUint16(0x96, 0x22, true);
  pe.setUint16(0x98, 0x20b, true);
  pe.setUint32(0x98 + 60, 512, true);
  pe.setUint16(0x98 + 68, 3, true);
  pe.setUint32(0x98 + 240 + 16, 512, true);
  pe.setUint32(0x98 + 240 + 20, 512, true);
  return bytes;
}

async function candidateFixture(
  run: (
    input: Parameters<typeof installWindowsCandidate>[0],
    receipt: WindowsCandidateQualification,
    directory: string,
  ) => Promise<void>,
) {
  using directory = tempDir("factory-windows-candidate");
  const root = String(directory);
  const artifact = join(root, "bun.exe");
  const qualification = join(root, "qualification.json");
  const sourceReceipt = join(root, "source-receipt.json");
  const digest = (bytes: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const bytes = candidatePEFixture();
  await Bun.write(artifact, bytes);
  const sourceBody = JSON.stringify([
    { path: "src/runtime/api/Archive.rs", before: "1".repeat(64), after: "2".repeat(64), changed: true },
  ]);
  await Bun.write(sourceReceipt, sourceBody);
  const receipt: WindowsCandidateQualification = {
    schema: 1,
    kind: "windows-candidate",
    host: "vps",
    source: "a".repeat(40),
    version: "1.4.4-canary",
    target: "x86_64-pc-windows-msvc",
    sourceReceiptSHA256: digest(sourceBody),
    artifact: { name: "bun.exe", sha256: digest(bytes), bytes: bytes.length },
    gates: [],
  };
  for (const id of ["native-compile", "wine-smoke"] as const) {
    const body = `${id} validator fixture`;
    const name = `${id}.log`;
    await Bun.write(join(root, name), body);
    receipt.gates.push({
      id,
      passed: true,
      artifactSha256: receipt.artifact.sha256,
      log: { name, sha256: digest(body) },
    });
  }
  const body = JSON.stringify(receipt);
  await Bun.write(qualification, body);
  await run(
    {
      artifact,
      qualification,
      qualificationSHA256: digest(body),
      sourceReceipt,
      expectedSource: receipt.source,
      output: join(root, "installed/bun.exe"),
    },
    receipt,
    root,
  );
}

test("Windows candidate delivery preserves the current binary until the staged PE and receipts verify", async () => {
  await candidateFixture(async (input, receipt) => {
    await Bun.write(input.output!, "current binary");
    expect((await verifyWindowsCandidate(input)).receipt.sourceReceiptSHA256).toBe(receipt.sourceReceiptSHA256);
    const installed = await installWindowsCandidate(input);
    expect(await Bun.file(input.output!).bytes()).toEqual(candidatePEFixture());
    expect(installed.qualification).toBe("cross-compiled-and-wine-smoke-passed");
    expect(installed.sha256).toBe(receipt.artifact.sha256);
    expect(
      readdirSync(dirname(input.output!)).filter(name => name.includes(".part.") || name.endsWith(".bak")),
    ).toEqual([]);
  });
});

test("Windows candidate delivery rejects bad hashes, failed gates and altered evidence without replacing the old binary", async () => {
  await candidateFixture(async (input, receipt, directory) => {
    await Bun.write(input.output!, "current binary");
    await expect(installWindowsCandidate({ ...input, expectedSource: "b".repeat(40) })).rejects.toThrow(
      "identity mismatch",
    );
    await expect(installWindowsCandidate({ ...input, qualificationSHA256: "0".repeat(64) })).rejects.toThrow(
      "qualification SHA-256 mismatch",
    );
    await Bun.write(input.artifact, "altered candidate");
    await expect(installWindowsCandidate(input)).rejects.toThrow("artifact SHA-256 or size mismatch");
    await Bun.write(input.artifact, candidatePEFixture());
    await Bun.write(input.sourceReceipt, "{}");
    await expect(installWindowsCandidate(input)).rejects.toThrow("source receipt SHA-256 mismatch");
    await Bun.write(
      input.sourceReceipt,
      JSON.stringify([
        { path: "src/runtime/api/Archive.rs", before: "1".repeat(64), after: "2".repeat(64), changed: true },
      ]),
    );
    receipt.gates[1]!.passed = false;
    const body = JSON.stringify(receipt);
    await Bun.write(input.qualification, body);
    input.qualificationSHA256 = new Bun.CryptoHasher("sha256").update(body).digest("hex");
    await expect(installWindowsCandidate(input)).rejects.toThrow("gate failed or missing: wine-smoke");
    receipt.gates[1]!.passed = true;
    const passed = JSON.stringify(receipt);
    await Bun.write(input.qualification, passed);
    input.qualificationSHA256 = new Bun.CryptoHasher("sha256").update(passed).digest("hex");
    await Bun.write(join(directory, "native-compile.log"), "altered log");
    await expect(installWindowsCandidate(input)).rejects.toThrow("log SHA-256 mismatch");
    expect(await Bun.file(input.output!).text()).toBe("current binary");
    expect(readdirSync(dirname(input.output!)).filter(name => name.includes(".part."))).toEqual([]);
  });
});

test("Windows candidate PE validation rejects malformed headers, wrong architecture, DLLs and GUI images", async () => {
  using directory = tempDir("factory-candidate-pe");
  const path = join(String(directory), "bun.exe");
  for (const [offset, value] of [
    [0, 0],
    [0x84, 0xaa64],
    [0x96, 0x20],
    [0x96, 0x2022],
    [0x98, 0x10b],
    [0x98 + 68, 2],
  ] as const) {
    const bytes = candidatePEFixture();
    new DataView(bytes.buffer).setUint16(offset, value, true);
    await Bun.write(path, bytes);
    await expect(verifyWindowsCandidatePE(path, bytes.length)).rejects.toThrow("AMD64 PE32+");
  }
  await Bun.write(path, candidatePEFixture().slice(0, 400));
  await expect(verifyWindowsCandidatePE(path, 400)).rejects.toThrow("AMD64 PE32+");
});

test("Windows candidate delivery rejects a hashed malformed PE and removes only its stage after a failed rename", async () => {
  await candidateFixture(async (input, receipt) => {
    await Bun.write(input.output!, "current binary");
    const bytes = candidatePEFixture();
    bytes[0] = 0;
    await Bun.write(input.artifact, bytes);
    receipt.artifact.sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    for (const gate of receipt.gates) gate.artifactSha256 = receipt.artifact.sha256;
    const body = JSON.stringify(receipt);
    await Bun.write(input.qualification, body);
    input.qualificationSHA256 = new Bun.CryptoHasher("sha256").update(body).digest("hex");
    await expect(installWindowsCandidate(input)).rejects.toThrow("AMD64 PE32+");
    expect(await Bun.file(input.output!).text()).toBe("current binary");
  });
  await candidateFixture(async input => {
    await Bun.write(join(input.output!, "marker"), "preserved directory");
    await expect(installWindowsCandidate(input)).rejects.toThrow();
    expect(await Bun.file(join(input.output!, "marker")).text()).toBe("preserved directory");
    expect(readdirSync(dirname(input.output!)).filter(name => name.includes(".part."))).toEqual([]);
  });
});

const sourceResult = Bun.spawnSync(["git", "rev-parse", "HEAD"], { stdout: "pipe", stderr: "pipe" });
if (sourceResult.exitCode !== 0) throw new Error("Unable to resolve the current Bun source commit");
const source = sourceResult.stdout.toString().trim();
const mullvadSource = source;
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
      "Mullvad sidecar source does not match the embedded Bun source",
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
