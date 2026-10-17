import { expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import { hashSDKFile, mediaSDKPlan } from "../../packages/bun-video/src/sdk";
import {
  bootstrapNativeMediaInputs,
  nativeMediaBootstrapPlan,
  assertNativeMediaTests,
  existingMediaQualification,
  nativeMediaInputs,
  readNativeMediaInputs,
  verifyNativeMediaPrefix,
} from "./media-sdk-producer";
import { mkdir } from "node:fs/promises";

test("native media bootstrap plans reuse canonical owners without asserting native qualification", () => {
  using directory = tempDir("media-bootstrap-plan", {});
  const root = String(directory);
  const input = {
    root: join(root, "repo"),
    sources: join(root, "sources"),
    output: join(root, "pool"),
    target: "linux-x64" as const,
  };
  const plan = nativeMediaBootstrapPlan(input);
  expect(plan.components.ffmpeg.kind).toBe("source");
  if (plan.components.ffmpeg.kind !== "source" || plan.components.mpv.kind !== "source")
    throw new Error("Expected canonical source recipes");
  expect(plan.components.ffmpeg.input.dependencies.zlib).toBe(join(input.output, "zlib/prefix"));
  expect(plan.components.mpv.input.dependencies.ffmpeg).toBe(join(input.output, "ffmpeg/prefix"));
  expect(plan.avio?.input.component).toBe("avio");
  expect(JSON.stringify(plan)).not.toContain("sourceClean");
  expect(() => nativeMediaBootstrapPlan({ ...input, output: join(input.root, "new") })).toThrow("overlaps");
  expect(() => nativeMediaBootstrapPlan({ ...input, output: join(input.root, "..private") })).toThrow("overlaps");
  expect(() => nativeMediaBootstrapPlan({ ...input, output: root })).toThrow("overlaps");
});

test("bootstrap capacity and host guards precede all source or compiler work", async () => {
  using directory = tempDir("media-bootstrap-host-capacity", {});
  const root = String(directory);
  const input = {
    root: join(root, "repo"),
    sources: join(root, "sources"),
    output: join(root, "pool"),
    target: "linux-x64" as const,
  };
  let sourceCalls = 0;
  const sources = async () => {
    sourceCalls++;
    return [];
  };
  await expect(bootstrapNativeMediaInputs(input, { hostTarget: () => "windows-x64", sources })).rejects.toThrow(
    "actual target host ABI",
  );
  await expect(
    bootstrapNativeMediaInputs(input, {
      hostTarget: () => "linux-x64",
      sources,
      capacity: async () => {
        throw new Error("insufficient pool space");
      },
    }),
  ).rejects.toThrow("insufficient pool space");
  expect(sourceCalls).toBe(0);
  expect(await Bun.file(join(input.output, "native-media-inputs.json")).exists()).toBe(false);
});

test("bootstrap rejects unverified source owners before zlib qualification or native builds", async () => {
  using directory = tempDir("media-bootstrap-refuse-source", {});
  const root = String(directory),
    output = join(root, "pool");
  let calls = 0;
  await expect(
    bootstrapNativeMediaInputs(
      {
        root: join(root, "repo"),
        sources: join(root, "sources"),
        output,
        target: "linux-x64",
      },
      {
        hostTarget: () => "linux-x64",
        capacity: async () => {},
        sources: async () => {
          throw new Error("source pin differs");
        },
        zlib: async () => {
          calls++;
          throw new Error("must not execute");
        },
        prepare: async () => {
          calls++;
          throw new Error("must not execute");
        },
      },
    ),
  ).rejects.toThrow("source pin differs");
  expect(calls).toBe(0);
  expect(await Bun.file(join(output, "native-media-inputs.json")).exists()).toBe(false);
});

test("bootstrap saves measured SDK archives and preserves the canonical AVIO recipe", async () => {
  using directory = tempDir("media-bootstrap-handoff", {});
  const root = String(directory),
    output = join(root, "pool");
  const calls: string[] = [];
  const result = await bootstrapNativeMediaInputs(
    {
      root: join(root, "repo"),
      sources: join(root, "sources"),
      output,
      target: "linux-x64",
    },
    {
      hostTarget: () => "linux-x64",
      capacity: async () => {},
      sources: async () => {
        calls.push("sources");
        return [];
      },
      zlib: async path => {
        calls.push("zlib");
        return { prefix: join(path, "prefix"), sourceReceiptSHA256: "a".repeat(64) };
      },
      prepare: async (_inputs, _root, prepared) => {
        calls.push("native gates");
        for (const component of ["ffmpeg", "mpv"] as const) {
          const pack = join(prepared, `sdk-${component}-pack`);
          await mkdir(pack);
          const filename = `${component}-${mediaSDKPlan(component, "linux-x64").version}-linux-x64-sdk.zip`;
          const archive = join(pack, filename);
          await Bun.write(archive, `${component}: hermetic qualified-owner port\n`);
          await Bun.write(
            join(pack, "distribution.json"),
            JSON.stringify({
              asset: {
                url: `https://bun-lib.aphrody.app/media/${filename}`,
                sha256: await hashSDKFile(archive),
                bytes: Bun.file(archive).size,
              },
            }),
          );
        }
        return join(prepared, "media-prefix");
      },
    },
  );
  expect(calls).toEqual(["sources", "zlib", "native gates"]);
  const manifest = await readNativeMediaInputs(result.inputPath, result.inputSHA256, "linux-x64");
  expect(manifest.components.ffmpeg.kind).toBe("archive");
  expect(manifest.components.mpv.kind).toBe("archive");
  const buildInput = await readNativeMediaInputs(result.buildInputPath, result.buildInputSHA256, "linux-x64");
  expect(manifest.avio).toEqual(buildInput.avio);
  expect(manifest.avio?.input.component).toBe("avio");
  expect(manifest.avio?.input.output).toBe(join(output, "avio"));
  expect(result.buildInputSHA256).toBe(await hashSDKFile(result.buildInputPath));
});

test("local input pins survive empty publication inventories without attesting any provider", () => {
  using directory = tempDir("media-producer-inputs", {});
  const path = join(String(directory), "sdk.zip");
  const value = {
    schema: 1,
    target: "linux-x64",
    components: {
      ffmpeg: { kind: "archive", path, sha256: "a".repeat(64), bytes: 123 },
      mpv: { kind: "prefix", path: String(directory), receiptSHA256: "b".repeat(64) },
    },
  };
  expect(mediaSDKPlan("ffmpeg", "linux-x64").assets).toEqual([]);
  expect(nativeMediaInputs(value, "linux-x64").components.ffmpeg.kind).toBe("archive");
  for (const changed of [
    { ...value, target: "linux-x64-musl" },
    { ...value, schema: 2 },
    { ...value, components: { ...value.components, ffmpeg: { ...value.components.ffmpeg, sha256: "main" } } },
    { ...value, components: { ...value.components, ffmpeg: { ...value.components.ffmpeg, bytes: 2 ** 31 + 1 } } },
    { ...value, components: { ...value.components, mpv: { ...value.components.mpv, path: "relative" } } },
    { ...value, components: { ffmpeg: value.components.ffmpeg } },
  ])
    expect(() => nativeMediaInputs(changed, "linux-x64")).toThrow();
});

test("existing source prefix qualification must be explicitly pinned before any build or process starts", () => {
  using directory = tempDir("media-producer-source", {});
  const base = String(directory);
  const input = {
    root: base,
    sources: base,
    output: join(base, "build-ffmpeg"),
    prefix: join(base, "build-ffmpeg/prefix"),
    component: "ffmpeg",
    target: "linux-x64",
    dependencies: {},
  };
  const value = {
    schema: 1,
    target: "linux-x64",
    components: {
      ffmpeg: { kind: "source", input, build: false },
      mpv: { kind: "prefix", path: base, receiptSHA256: "a".repeat(64) },
    },
  };
  expect(() => nativeMediaInputs(value, "linux-x64")).toThrow("pinned native qualification");
  const pinned = {
    ...value,
    components: {
      ...value.components,
      ffmpeg: {
        ...value.components.ffmpeg,
        qualification: { path: join(base, "qualification.json"), sha256: "b".repeat(64) },
      },
    },
  };
  expect(nativeMediaInputs(pinned, "linux-x64").components.ffmpeg.kind).toBe("source");
  expect(() =>
    nativeMediaInputs(
      { ...pinned, avio: { input: { ...input, component: "avio", target: "windows-x64" } } },
      "linux-x64",
    ),
  ).toThrow("AVIO recipe");
});

test("native media input file mutation and missing hashes are rejected before extraction", async () => {
  using directory = tempDir("media-producer-input-sha", {});
  const path = join(String(directory), "inputs.json");
  const value = {
    schema: 1,
    target: "windows-x64",
    components: {
      ffmpeg: { kind: "prefix", path: String(directory), receiptSHA256: "a".repeat(64) },
      mpv: { kind: "prefix", path: String(directory), receiptSHA256: "a".repeat(64) },
    },
  };
  await Bun.write(path, JSON.stringify(value));
  const pin = await hashSDKFile(path);
  expect((await readNativeMediaInputs(path, pin, "windows-x64")).target).toBe("windows-x64");
  await Bun.write(path, JSON.stringify({ ...value, target: "windows-arm64" }));
  await expect(readNativeMediaInputs(path, pin, "windows-x64")).rejects.toThrow("exact SHA-256");
  await expect(readNativeMediaInputs(path, "", "windows-x64")).rejects.toThrow("exact SHA-256");
});

test("native gates reject skipped, failed, empty and incomplete test executions", () => {
  assertNativeMediaTests("6 pass\n0 fail", 6);
  assertNativeMediaTests("2 pass\n0 skip\n0 fail", 2);
  for (const output of ["0 pass\n0 fail", "5 pass\n0 fail", "6 pass\n1 skip\n0 fail", "6 pass\n1 fail", "6 pass", ""]) {
    expect(() => assertNativeMediaTests(output, 6)).toThrow("required tests without skips");
  }
});

test("layout-only receipt and wrong native source pins cannot qualify a local SDK", async () => {
  using directory = tempDir("media-producer-receipt", {});
  const path = join(String(directory), "bun-sdk-receipt.json");
  const receipt = {
    schema: 1,
    component: "ffmpeg",
    target: "windows-x64",
    sourceRevision: mediaSDKPlan("ffmpeg", "windows-x64").sourceRevision,
    files: { "licenses/LICENSE": "a".repeat(64) },
    licenses: ["licenses/LICENSE"],
  };
  await Bun.write(path, JSON.stringify(receipt));
  await expect(verifyNativeMediaPrefix("ffmpeg", "windows-x64", String(directory))).rejects.toThrow(
    "executed native target",
  );
  await Bun.write(
    path,
    JSON.stringify({
      ...receipt,
      nativeQualification: { target: "windows-x64", passed: true, sourceRevision: "b".repeat(40), sourceClean: true },
    }),
  );
  await expect(verifyNativeMediaPrefix("ffmpeg", "windows-x64", String(directory))).rejects.toThrow("clean source pin");
});

test("historical native qualification binds fixture bytes and rejects a changed license or foreign source", async () => {
  using directory = tempDir("media-producer-provenance", { "bin/image": "fixture", "licenses/LICENSE": "notice" });
  const prefix = String(directory),
    path = join(prefix, "qualification.json");
  const receipt = {
    schema: 1,
    component: "ffmpeg",
    target: "linux-x64",
    sourceRevision: mediaSDKPlan("ffmpeg", "linux-x64").sourceRevision,
    sourceClean: true,
    passed: true,
    layout: { files: { "bin/image": await hashSDKFile(join(prefix, "bin/image")) } },
    licenses: { "licenses/LICENSE": await hashSDKFile(join(prefix, "licenses/LICENSE")) },
    linuxABI: { files: [{ file: "bin/image", sha256: await hashSDKFile(join(prefix, "bin/image")) }] },
    oldGLIBCExecution: "not-performed",
    graphics: "not-qualified",
  };
  await Bun.write(path, JSON.stringify(receipt));
  const qualification = { path, sha256: await hashSDKFile(path) };
  const read = await existingMediaQualification("ffmpeg", "linux-x64", prefix, qualification);
  expect(read.oldGLIBCExecution).toBe("not-performed");
  expect(read.graphics).toBe("not-qualified");
  await Bun.write(join(prefix, "licenses/LICENSE"), "changed");
  await expect(existingMediaQualification("ffmpeg", "linux-x64", prefix, qualification)).rejects.toThrow(
    "bytes have changed",
  );
  await Bun.write(path, JSON.stringify({ ...receipt, sourceRevision: "a".repeat(40) }));
  await expect(
    existingMediaQualification("ffmpeg", "linux-x64", prefix, { path, sha256: await hashSDKFile(path) }),
  ).rejects.toThrow("source or target");
});
