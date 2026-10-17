import { expect, test } from "bun:test";
import { normalizeRuntimeHomeFact, publicRuntimeHomeFact, type RuntimeHomeFact } from "./runtime-facts";

const source = "a".repeat(40);
const receipt = (): RuntimeHomeFact => ({
  schema: 1,
  capturedAt: "2026-10-13T16:00:00Z",
  source,
  version: "1.4.4",
  target: "win32-x64",
  binary: { sha256: "b".repeat(64), bytes: 1024 },
  nativeVideo: { available: true, methods: ["metadata", "frame", "resize", "png", "write"] },
  nativeImage: { available: true, methods: ["resize", "png", "write"] },
  gates: [{ sha256: "c".repeat(64), passed: 1, failed: 0, assertions: 5 }],
});

test("public capability facts discard local paths and provider configuration and reject malformed evidence", () => {
  const value = {
    ...receipt(),
    providerKey: "fixture-secret",
    privateVector: "protected-do-not-copy",
    binary: { ...receipt().binary, path: "protected-do-not-copy" },
  };
  const clean = publicRuntimeHomeFact(value);
  expect(JSON.stringify(clean)).not.toContain("fixture-secret");
  expect(JSON.stringify(clean)).not.toContain("protected-do-not-copy");
  expect(clean.nativeVideo.methods).toContain("metadata");
  expect(() => publicRuntimeHomeFact({ ...receipt(), source: "main" })).toThrow("capability receipt");
  expect(() =>
    publicRuntimeHomeFact({ ...receipt(), gates: [{ sha256: "mutable", passed: 1, failed: 0, assertions: 5 }] }),
  ).toThrow("capability gate");
  expect(() =>
    publicRuntimeHomeFact({ ...receipt(), nativeVideo: { available: true, methods: ["<script>"] } }),
  ).toThrow("native surface");
});

test("factory receipts keep test counts and release ABI status without local paths", () => {
  const measured = {
    schema: 1,
    kind: "bun-runtime-capabilities",
    measuredAt: receipt().capturedAt,
    source: { commit: source, codeMatchesCommit: true, checkout: "protected-do-not-copy" },
    runtime: {
      revision: source,
      version: "1.4.4",
      platform: "linux",
      arch: "x64",
      executable: { ...receipt().binary, path: "protected-do-not-copy" },
      libc: { kind: "glibc", minimumDirectRequirement: "2.43" },
    },
    apis: { video: receipt().nativeVideo, image: receipt().nativeImage },
    gates: {
      native: true,
      passed: true,
      tests: { native: true, passed: true, passCount: 161, failCount: 0 },
      binaryRelease: { passed: false },
      receipts: [{ name: "native-tests.log", sha256: "d".repeat(64) }],
    },
  };
  const clean = normalizeRuntimeHomeFact(measured);
  expect(clean.target).toBe("linux-x64");
  expect(clean.gates[0]).toEqual({ sha256: "d".repeat(64), passed: 161, failed: 0 });
  expect(clean.distribution).toEqual({ status: "failed", minimumGLIBC: "2.43" });
  expect(JSON.stringify(clean)).not.toContain("protected-do-not-copy");
  expect(() =>
    normalizeRuntimeHomeFact({ ...measured, source: { ...measured.source, codeMatchesCommit: false } }),
  ).toThrow("factory capability");
  expect(() => normalizeRuntimeHomeFact({ ...measured, gates: { ...measured.gates, receipts: [] } })).toThrow(
    "bound receipt",
  );
});
