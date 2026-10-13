import { expect, test } from "bun:test";
import { dlopen, ptr } from "bun:ffi";
import { join } from "node:path";
import { tempDir } from "harness";
import {
  loadArtifactAsync,
  validateArtifactManifest,
  verifyArtifact,
  verifyArtifactAsync,
  verifyRuntimeIdentity,
} from "../src/artifact";
import { hostTarget, SUPPORTED_TARGETS } from "../src/target";
import { STDIO_SYMBOLS, Status } from "../src/index";

function fixture(target = hostTarget()) {
  const extension = target.includes("windows") ? "dll" : target.includes("darwin") ? "dylib" : "so";
  return {
    schema: 1,
    name: "buv-runtime",
    version: "1.0.0",
    target,
    abi: "1.6",
    compatibility: { abiMajor: 1 },
    sources: { bun: { rev: "a".repeat(40), dirty: false } },
    build: {
      panicRecovery: true,
      native: {
        name: "buv-runtime",
        version: "1.0.0",
        target,
        abi: "1.6",
        rustc: "rustc synthetic fixture",
        git_rev: "a".repeat(12),
        panic_recovery: true,
      },
    },
    capabilities: ["process.stdin", "process.wait"],
    files: {
      [`buv_runtime.${extension}`]: { sha256: "b".repeat(64), bytes: 8 },
      "yolo_runtime.h": { sha256: "c".repeat(64), bytes: 8 },
    },
  };
}

test("each target validates native build/source identity without executing a fixture", () => {
  for (const target of Object.values(SUPPORTED_TARGETS)) {
    expect(validateArtifactManifest(fixture(target), target).target).toBe(target);
  }
});

test.each([
  "target",
  "native-target",
  "revision",
  "dirty",
  "native-revision",
  "native-abi",
  "native-name",
  "panic",
  "capabilities",
  "hash",
  "size",
  "path",
])("manifest refuses %s before native execution", mutation => {
  const data = fixture();
  if (mutation === "target") data.target = "foreign";
  else if (mutation === "native-target") data.build.native.target = "foreign";
  else if (mutation === "revision") data.sources.bun.rev = "unpinned";
  else if (mutation === "dirty") data.sources.bun.dirty = true;
  else if (mutation === "native-revision") data.build.native.git_rev = "d".repeat(12);
  else if (mutation === "native-abi") data.build.native.abi = "1.4";
  else if (mutation === "native-name") data.build.native.name = "yolo-runtime";
  else if (mutation === "panic") data.build.native.panic_recovery = false;
  else if (mutation === "capabilities") data.capabilities.pop();
  else if (mutation === "hash") Object.values(data.files)[0]!.sha256 = "unpinned";
  else if (mutation === "size") Object.values(data.files)[0]!.bytes = -1;
  else data.files["../outside.so"] = { sha256: "e".repeat(64), bytes: 8 };
  expect(() => validateArtifactManifest(data)).toThrow();
});

test("same architecture does not make GNU and musl interchangeable", () => {
  expect(() => validateArtifactManifest(fixture("x86_64-unknown-linux-gnu"), "x86_64-unknown-linux-musl")).toThrow(
    "qualified host",
  );
});

test("libc metadata cannot contradict a native target or export a full report", () => {
  const target = "x86_64-unknown-linux-gnu";
  const data = {
    ...fixture(target),
    libc: { abi: "gnu", version: "2.43", source: "process.report.glibcVersionRuntime" },
  };
  expect(validateArtifactManifest(data, target).libc?.version).toBe("2.43");
  expect(() => validateArtifactManifest({ ...data, libc: { ...data.libc, abi: "musl" } }, target)).toThrow(
    "libc metadata",
  );
  expect(() => validateArtifactManifest({ ...data, libc: { ...data.libc, environmentVariables: {} } }, target)).toThrow(
    "libc metadata",
  );
});

test("loaded capabilities and source must match the verified manifest", () => {
  const manifest = validateArtifactManifest(fixture());
  const runtime = { buildInfo: () => manifest.build.native, capabilities: () => [...manifest.capabilities] };
  verifyRuntimeIdentity(runtime, manifest);
  expect(() =>
    verifyRuntimeIdentity(
      { ...runtime, buildInfo: () => ({ ...manifest.build.native, git_rev: "d".repeat(12) }) },
      manifest,
    ),
  ).toThrow("git_rev");
  expect(() => verifyRuntimeIdentity({ ...runtime, capabilities: () => ["process.stdin"] }, manifest)).toThrow(
    "capabilities",
  );
});

test("sync/async verification both refuse changed bytes without loading a library", async () => {
  using directory = tempDir("runtime-sdk-manifest", {});
  const manifest = fixture();
  for (const [name, file] of Object.entries(manifest.files)) {
    const bytes = new TextEncoder().encode("fixture!");
    file.sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    await Bun.write(join(String(directory), name), bytes);
  }
  await Bun.write(join(String(directory), "manifest.json"), JSON.stringify(manifest));
  expect(verifyArtifact(String(directory)).target).toBe(hostTarget());
  expect((await verifyArtifactAsync(String(directory))).target).toBe(hostTarget());
  await Bun.write(join(String(directory), Object.keys(manifest.files)[0]!), "changed!");
  expect(() => verifyArtifact(String(directory))).toThrow("Hash mismatch");
  let error: unknown;
  try {
    await verifyArtifactAsync(String(directory));
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(Error);
});

test.skipIf(!process.env.BUV_RUNTIME_SDK_GATE_DIR)(
  "qualified native provider attests the hash-verified manifest",
  async () => {
    using runtime = await loadArtifactAsync(process.env.BUV_RUNTIME_SDK_GATE_DIR!);
    expect(runtime.buildInfo().target).toBe(hostTarget());
    expect(runtime.capabilities()).toContain("process.stdin");
    expect(runtime.capabilities()).toContain("process.wait");
  },
);

test.skipIf(!process.env.BUV_RUNTIME_SDK_GATE_DIR)(
  "optional ABI 1.6 table calls the real owner's handle guards",
  async () => {
    const directory = process.env.BUV_RUNTIME_SDK_GATE_DIR!;
    const manifest = await verifyArtifactAsync(directory);
    const name = Object.keys(manifest.files).find(file => /\.(?:dll|so|dylib)$/.test(file))!;
    using runtime = await loadArtifactAsync(directory);
    expect(runtime.capabilities()).toContain("process.wait");
    const native = dlopen(join(directory, name), STDIO_SYMBOLS);
    try {
      const operation = new BigUint64Array(1);
      expect(native.symbols.yolo_process_stdin_write(0n, null, 0n)).toBe(Status.InvalidHandle);
      expect(native.symbols.yolo_process_stdin_close(0n)).toBe(Status.InvalidHandle);
      expect(native.symbols.yolo_process_wait_start(0n, ptr(operation))).toBe(Status.InvalidHandle);
      expect(operation[0]).toBe(0n);
    } finally {
      native.close();
    }
  },
);
