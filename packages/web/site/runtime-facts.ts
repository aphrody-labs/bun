// SPDX-License-Identifier: Apache-2.0
// Measured runtime receipts shown on the home page and bound into the site synchronization identity.
const sha = (value: Uint8Array | string) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
const commit = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
export const RUNTIME_TARGETS: Record<string, string> = {
  "win32-x64": "Windows x64",
  "windows-x64": "Windows x64",
  "win32-arm64": "Windows ARM64",
  "windows-arm64": "Windows ARM64",
  "linux-x64": "Linux x64 GNU",
  "linux-arm64": "Linux ARM64 GNU",
  "linux-x64-musl": "Linux x64 musl",
  "linux-arm64-musl": "Linux ARM64 musl",
  "darwin-x64": "macOS x64",
  "darwin-arm64": "macOS ARM64",
};
export type RuntimeHomeFact = {
  schema: 1;
  capturedAt: string;
  source: string;
  version: string;
  target: string;
  binary: { sha256: string; bytes: number };
  nativeVideo: { available: boolean; methods: string[] };
  nativeImage: { available: boolean; methods: string[] };
  gates: { sha256: string; passed: number; failed: number; assertions?: number }[];
  distribution?: { status: "passed" | "failed" | "pending"; minimumGLIBC?: string };
};
export type HomeGraphFact = {
  source: string;
  snapshotId?: string;
  nodes?: number;
  edges?: number;
  truncated?: boolean;
};

/** Project explicit public fields only; provider configuration and local evidence paths never reach the browser. */
export function publicRuntimeHomeFact(value: RuntimeHomeFact): RuntimeHomeFact {
  if (
    value.schema !== 1 ||
    !commit.test(value.source) ||
    !RUNTIME_TARGETS[value.target] ||
    !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(value.version) ||
    !Number.isFinite(Date.parse(value.capturedAt)) ||
    !digest.test(value.binary?.sha256) ||
    !Number.isSafeInteger(value.binary.bytes) ||
    value.binary.bytes < 1 ||
    !Array.isArray(value.gates) ||
    value.gates.length > 32
  )
    throw new Error("Invalid public runtime capability receipt");
  const surface = (input: RuntimeHomeFact["nativeVideo"]) => {
    if (
      typeof input?.available !== "boolean" ||
      !Array.isArray(input.methods) ||
      input.methods.length > 128 ||
      input.methods.some(name => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))
    )
      throw new Error("Invalid measured native surface");
    return { available: input.available, methods: [...new Set(input.methods)].sort() };
  };
  const gates = value.gates.map(gate => {
    if (
      !digest.test(gate.sha256) ||
      ![gate.passed, gate.failed].every(count => Number.isSafeInteger(count) && count >= 0) ||
      (gate.assertions !== undefined && (!Number.isSafeInteger(gate.assertions) || gate.assertions < 0))
    )
      throw new Error("Invalid supplied capability gate");
    return {
      sha256: gate.sha256,
      passed: gate.passed,
      failed: gate.failed,
      ...(gate.assertions === undefined ? {} : { assertions: gate.assertions }),
    };
  });
  const distribution = value.distribution;
  if (
    distribution &&
    (!["passed", "failed", "pending"].includes(distribution.status) ||
      (distribution.minimumGLIBC !== undefined && !/^\d+\.\d+(?:\.\d+)?$/.test(distribution.minimumGLIBC)))
  )
    throw new Error("Invalid distribution qualification");
  return {
    schema: 1,
    capturedAt: value.capturedAt,
    source: value.source,
    version: value.version,
    target: value.target,
    binary: { sha256: value.binary.sha256, bytes: value.binary.bytes },
    nativeVideo: surface(value.nativeVideo),
    nativeImage: surface(value.nativeImage),
    gates,
    ...(distribution
      ? {
          distribution: {
            status: distribution.status,
            ...(distribution.minimumGLIBC ? { minimumGLIBC: distribution.minimumGLIBC } : {}),
          },
        }
      : {}),
  };
}

/** Normalize the Linux factory's measured receipt without exporting host paths or guessing assertion counts. */
export function normalizeRuntimeHomeFact(input: unknown): RuntimeHomeFact {
  if (!input || typeof input !== "object") throw new Error("Invalid public runtime capability receipt");
  if ((input as { kind?: string }).kind !== "bun-runtime-capabilities")
    return publicRuntimeHomeFact(input as RuntimeHomeFact);
  const value = input as {
    schema: number;
    measuredAt: string;
    runtime: {
      version: string;
      revision: string;
      platform: string;
      arch: string;
      executable: RuntimeHomeFact["binary"];
      libc: { kind: string; minimumDirectRequirement?: string };
    };
    source: { commit: string; codeMatchesCommit: boolean };
    apis: { video: RuntimeHomeFact["nativeVideo"]; image: RuntimeHomeFact["nativeImage"] };
    gates: {
      native: boolean;
      passed: boolean;
      tests: { native: boolean; passed: boolean; passCount: number; failCount: number };
      binaryRelease: { passed: boolean };
      receipts: { name: string; sha256: string }[];
    };
  };
  if (
    value.schema !== 1 ||
    !value.runtime ||
    !value.source ||
    !value.apis ||
    value.runtime?.revision !== value.source?.commit ||
    value.source.codeMatchesCommit !== true ||
    value.runtime.platform !== "linux" ||
    !["x64", "arm64"].includes(value.runtime.arch) ||
    !["glibc", "musl"].includes(value.runtime.libc?.kind) ||
    value.gates?.native !== true ||
    value.gates.tests?.native !== true ||
    typeof value.gates.binaryRelease?.passed !== "boolean"
  )
    throw new Error("Invalid measured factory capability receipt");
  const testReceipt = value.gates.receipts?.find(receipt => receipt.name === "native-tests.log");
  const tests = value.gates.tests;
  if (
    !testReceipt ||
    tests.passed !== (tests.failCount === 0 && tests.passCount > 0) ||
    value.gates.passed !== tests.passed
  )
    throw new Error("Factory native tests have no bound receipt");
  return publicRuntimeHomeFact({
    schema: 1,
    capturedAt: value.measuredAt,
    source: value.source.commit,
    version: value.runtime.version,
    target: `linux-${value.runtime.arch}${value.runtime.libc.kind === "musl" ? "-musl" : ""}`,
    binary: value.runtime.executable,
    nativeVideo: value.apis.video,
    nativeImage: value.apis.image,
    gates: [{ sha256: testReceipt.sha256, passed: tests.passCount, failed: tests.failCount }],
    distribution: {
      status: value.gates.binaryRelease.passed ? "passed" : "failed",
      ...(value.runtime.libc.kind === "glibc" && value.runtime.libc.minimumDirectRequirement
        ? { minimumGLIBC: value.runtime.libc.minimumDirectRequirement }
        : {}),
    },
  });
}
export async function loadRuntimeHomeFacts(
  paths: readonly string[],
  options?: { onReceipt?: (receipt: { index: number; fact: RuntimeHomeFact; sha256: string; bytes: number }) => void },
) {
  if (paths.length > 8) throw new Error("Runtime capability receipt count exceeds the target budget");
  return Promise.all(
    paths.map(async (path, index) => {
      const file = Bun.file(path);
      if (file.size < 1 || file.size > 1024 * 1024)
        throw new Error("Runtime capability receipt exceeds its byte budget");
      const bytes = await file.bytes();
      if (bytes.length < 1 || bytes.length > 1024 * 1024)
        throw new Error("Runtime capability receipt exceeds its byte budget");
      const fact = normalizeRuntimeHomeFact(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      options?.onReceipt?.({ index, fact, sha256: sha(bytes), bytes: bytes.length });
      return fact;
    }),
  );
}
