// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  artifactPath,
  ACCEPTED_RECEIPT_SHA256,
  classifyTorchAvailability,
  hostTarget,
  validateManifest,
  type ToolchainReceipt,
  type VuManifest,
} from "./toolchain.ts";

const receipt = (await Bun.file(
  join(import.meta.dir, "..", "toolchain.receipt.json"),
).json()) as ToolchainReceipt;
const fixtureReceipt: ToolchainReceipt = {
  ...receipt,
  observedArtifacts: [
    {
      name: "test-fixture",
      target: "x86_64-unknown-linux-gnu",
      revision: "a".repeat(40),
      manifestSha256: "a".repeat(64),
      files: { uv: "1".repeat(64), ruff: "2".repeat(64), python: "3".repeat(64) },
    },
  ],
};

function manifest(): VuManifest {
  return {
    schema: 1,
    name: "vu-runtime",
    version: "0.1.0",
    target: "x86_64-unknown-linux-gnu",
    revision: "a".repeat(40),
    pins: {
      uv: { upstreamTag: receipt.sidecars.uv.version, ref: receipt.sidecars.uv.revision },
      ruff: { upstreamTag: receipt.sidecars.ruff.version, ref: receipt.sidecars.ruff.revision },
      python: { version: receipt.python.version, sha256: receipt.python.archiveSha256 },
    },
    capabilities: ["uv", "ruff", "python"],
    files: {
      "bin/uv": { sha256: "1".repeat(64), bytes: 8, mode: 0o755 },
      "bin/ruff": { sha256: "2".repeat(64), bytes: 8, mode: 0o755 },
      "bin/python3.12": { sha256: "3".repeat(64), bytes: 8, mode: 0o755 },
    },
    links: {},
  };
}

test("the accepted uv and Ruff refs are exactly the vu source pins and lock blobs", async () => {
  const vu = (await Bun.file(
    join(import.meta.dir, "..", "..", "bun-vu", "vendor.json"),
  ).json()) as {
    sources: {
      name: string;
      ref: string;
      upstreamTag: string;
      workspace: { cargoLockBlob: string };
    }[];
  };
  for (const name of ["uv", "ruff"] as const) {
    const source = vu.sources.find((entry) => entry.name === name);
    expect(source).toBeDefined();
    expect(source?.ref).toBe(receipt.sidecars[name].revision);
    expect(source?.upstreamTag).toBe(receipt.sidecars[name].version);
    expect(source?.workspace.cargoLockBlob).toBe(receipt.sidecars[name].lockBlob);
  }
});

test("a runtime manifest must match the exact pins, host ABI and manifested binaries", () => {
  expect(
    validateManifest(manifest(), "x86_64-unknown-linux-gnu", fixtureReceipt, "a".repeat(64)),
  ).toEqual([]);
  const drifted = manifest();
  drifted.pins["ruff"] = { upstreamTag: "0.16.10", ref: "f".repeat(40) };
  expect(
    validateManifest(drifted, "x86_64-unknown-linux-gnu", fixtureReceipt, "a".repeat(64)),
  ).toContain("ruff source pin does not match the accepted receipt");
});

test("an ABI mismatch or missing binary hash fails closed", () => {
  const invalid = manifest();
  invalid.files["bin/uv"] = { sha256: "not-a-digest", bytes: 8, mode: 0o755 };
  const problems = validateManifest(
    invalid,
    "aarch64-unknown-linux-gnu",
    fixtureReceipt,
    "a".repeat(64),
  );
  expect(problems).toContain(
    "artifact target x86_64-unknown-linux-gnu does not match host aarch64-unknown-linux-gnu",
  );
  expect(problems).toContain("uv has no valid manifested executable");
});

test("a byte-perfect manifest outside the committed artifact receipt is rejected", () => {
  expect(
    validateManifest(manifest(), "x86_64-unknown-linux-gnu", fixtureReceipt, "b".repeat(64)),
  ).toContain("artifact manifest is not covered by the immutable toolchain receipt");
});

test("a file hash cannot be changed independently of its immutable artifact receipt", () => {
  const modified = manifest();
  modified.files["bin/ruff"] = { sha256: "f".repeat(64), bytes: 8, mode: 0o755 };
  expect(
    validateManifest(modified, "x86_64-unknown-linux-gnu", fixtureReceipt, "a".repeat(64)),
  ).toContain("ruff file hash does not match the immutable toolchain receipt");
});

test("artifact discovery uses only explicit vu paths or VU_HOME, never PATH", () => {
  expect(artifactPath({ VU_ARTIFACT: "/artifacts/pinned", VU_PREFIX: "/other" }, "target")).toBe(
    resolve("/artifacts/pinned"),
  );
  expect(artifactPath({ VU_PREFIX: "/prefix" }, "target")).toBe(resolve("/prefix"));
  expect(artifactPath({ VU_HOME: "/runtime-home" }, "target")).toBe(
    join("/runtime-home", "runtime/target/current"),
  );
});

test("Torch capability classification distinguishes a built CUDA backend from a working runtime", () => {
  expect(
    classifyTorchAvailability({
      status: "not-installed",
      cpuRuntimeAvailable: false,
      cudaBuild: null,
      cudaRuntimeAvailable: false,
      rocmBuild: null,
      rocmRuntimeAvailable: false,
    }),
  ).toBe("not-installed");
  expect(
    classifyTorchAvailability({
      status: "available",
      cpuRuntimeAvailable: true,
      cudaBuild: "12.8",
      cudaRuntimeAvailable: false,
      rocmBuild: null,
      rocmRuntimeAvailable: false,
    }),
  ).toBe("cpu-runtime-available");
  expect(
    classifyTorchAvailability({
      status: "available",
      cpuRuntimeAvailable: true,
      cudaBuild: "12.8",
      cudaRuntimeAvailable: true,
      rocmBuild: null,
      rocmRuntimeAvailable: false,
    }),
  ).toBe("cuda-runtime-available");
  expect(
    classifyTorchAvailability({
      status: "available",
      cpuRuntimeAvailable: true,
      cudaBuild: null,
      cudaRuntimeAvailable: false,
      rocmBuild: "6.4",
      rocmRuntimeAvailable: true,
    }),
  ).toBe("rocm-runtime-available");
});

test("host target mapping does not silently label unsupported operating systems", () => {
  expect(hostTarget("linux", "x64")).toBe("x86_64-unknown-linux-gnu");
  expect(hostTarget("darwin", "arm64")).toBe("aarch64-apple-darwin");
  expect(() => hostTarget("freebsd", "x64")).toThrow("unsupported Python toolchain host");
});

test("the committed acceptance receipt has a stable serialized source revision", async () => {
  const text = await readFile(join(import.meta.dir, "..", "toolchain.receipt.json"), "utf8");
  expect(JSON.parse(text).source.revision).toBe("6ea52f1aada7269d81470dd9d93144555610868e");
  expect(createHash("sha256").update(text).digest("hex")).toBe(ACCEPTED_RECEIPT_SHA256);
  expect(receipt.observedArtifacts).toHaveLength(3);
});

test("every owned package file matches its provenance digest", async () => {
  const root = join(import.meta.dir, "..");
  const provenance = (await Bun.file(join(root, "provenance.json")).json()) as {
    source: { receiptSha256: string };
    transfer: { files: Record<string, string> };
  };
  const mismatches: string[] = [];
  for (const [path, expected] of Object.entries(provenance.transfer.files)) {
    const bytes = await readFile(join(root, path));
    if (createHash("sha256").update(bytes).digest("hex") !== expected) mismatches.push(path);
  }
  expect(provenance.source.receiptSha256).toBe(ACCEPTED_RECEIPT_SHA256);
  expect(mismatches).toEqual([]);
});

test("the optional private package has no direct dependencies", async () => {
  const packageJson = (await Bun.file(join(import.meta.dir, "..", "package.json")).json()) as {
    name: string;
    private: boolean;
    dependencies?: unknown;
    optionalDependencies?: unknown;
  };
  expect(packageJson.name).toBe("@aphrody/bun-python-toolchain");
  expect(packageJson.private).toBe(true);
  expect(packageJson.dependencies).toBeUndefined();
  expect(packageJson.optionalDependencies).toBeUndefined();
});
