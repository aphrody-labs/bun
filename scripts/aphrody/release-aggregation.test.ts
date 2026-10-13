import { expect, test } from "bun:test";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { tempDir } from "../../test/harness";
import { aggregateFullRelease, fullMediaGates, fullPlatformGates, verifyFullRelease } from "./release-aggregation";
import { runtimeReleaseMatrix } from "./release-matrix";
import { mediaReleaseTarget } from "./media-release";
import sdkManifest from "../../packages/bun-video/src/sdk-manifest.json";

const source = "a".repeat(40);
const version = "1.4.4";
const hash = (value: string | Uint8Array | ArrayBuffer) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
const targets = runtimeReleaseMatrix().filter(target => target.flavor === "full");
async function fixture(run: (root: string) => Promise<void>) {
  using directory = tempDir("full-release-qualification", {});
  const root = String(directory);
  for (const full of targets) {
    const target = mediaReleaseTarget(full.target);
    const files: Record<string, { bytes: number; sha256: string }> = {};
    const payload: Record<string, string> = {};
    const add = (name: string, body: string) => {
      payload[name] = body;
      files[name] = { bytes: Buffer.byteLength(body), sha256: hash(body) };
    };
    const runtime = target.os === "windows" ? "bun.exe" : "bun";
    const executable = target.os === "windows" ? "bun-video.exe" : "bun-video";
    add(runtime, `validator runtime ${full.target}`);
    add(executable, `validator executable ${full.target}`);
    add("sdk/video.tgz", "validator video SDK");
    add("sdk/runtime.tgz", "validator runtime SDK");
    const tripleArch = target.arch === "aarch64" ? "aarch64" : "x86_64";
    const triple = `${tripleArch}-${target.os === "windows" ? "pc-windows-msvc" : target.os === "darwin" ? "apple-darwin" : `unknown-linux-${target.abi}`}`;
    const artifactRoot = `lib/runtime-sdk/${triple}/current/`;
    const libraryName =
      target.os === "windows"
        ? "buv_runtime.dll"
        : target.os === "darwin"
          ? "libbuv_runtime.dylib"
          : "libbuv_runtime.so";
    add(artifactRoot + libraryName, `validator runtime module ${full.target}`);
    add(artifactRoot + "yolo_runtime.h", "#define YOLO_ABI_MAJOR 1u\n#define YOLO_ABI_MINOR 6u\n");
    add(
      artifactRoot + "manifest.json",
      JSON.stringify({
        schema: 1,
        target: triple,
        abi: "1.6",
        sources: { bun: { rev: source, dirty: false } },
        build: { panicRecovery: true, native: { target: triple, abi: "1.6", git_rev: source, panic_recovery: true } },
        files: {
          [libraryName]: files[artifactRoot + libraryName],
          "yolo_runtime.h": files[artifactRoot + "yolo_runtime.h"],
        },
      }),
    );
    const nginxRoot = `lib/nginx/${target.sdkTarget}/current/`;
    const nginxExecutable = target.os === "windows" ? "bin/nginx.exe" : "bin/nginx";
    const nginxFiles: Record<string, { bytes: number; sha256: string }> = {};
    const addNginx = (name: string, body: string) => {
      add(nginxRoot + name, body);
      nginxFiles[name] = files[nginxRoot + name]!;
    };
    addNginx(nginxExecutable, `validator static NGINX ${full.target}`);
    addNginx("receipts/build-receipt.json", "validator source build receipt");
    addNginx(
      "receipts/closure.json",
      JSON.stringify({
        schema: 1,
        target: target.sdkTarget,
        ...(target.os === "linux"
          ? {
              libc: target.abi,
              releaseGLIBCFloor: target.abi === "musl" ? null : "2.17",
              maximumGLIBC: target.abi === "musl" ? null : "2.17",
            }
          : target.os === "darwin"
            ? { qualification: "Mach-O-load-command-closure-only", releaseMacOSFloor: "13.0" }
            : { qualification: "PE-architecture-and-import-closure-only" }),
        files: [
          {
            file: nginxExecutable,
            sha256: nginxFiles[nginxExecutable]!.sha256,
            needed: [],
            ...(target.os === "linux"
              ? { minimumGLIBC: target.abi === "musl" ? null : "2.17" }
              : target.os === "darwin"
                ? { minimumMacOS: "13.0" }
                : {}),
          },
        ],
      }),
    );
    addNginx("share/licenses/nginx/LICENSE", "validator license");
    addNginx("sources/nginx.tar", "validator source bytes");
    addNginx(
      "receipts/module-qualification.json",
      JSON.stringify({
        schema: 1,
        kind: "bun-nginx-native-module-qualification",
        nativeModuleQualified: true,
        host: { platform: target.platform, arch: target.runtimeArch, bunRevision: source },
        executable: nginxFiles[nginxExecutable],
        gates: Object.fromEntries(
          [
            "nativeBunController",
            "nativeRustModuleHTTP",
            "head",
            "clientAborted",
            "timerCleanup",
            "invalidConfigurationRejected",
            "originalMasterSurvivesInvalidConfig",
            "reloadSameMaster",
            "abiMismatchRejected",
            "gracefulQuit",
          ].map(id => [id, true]),
        ),
      }),
    );
    add(
      nginxRoot + "nginx-sdk.json",
      JSON.stringify({
        schema: 1,
        kind: "bun-nginx-native-sdk",
        source,
        sourceDirty: false,
        target: full.target,
        platform: target.platform,
        arch: target.runtimeArch,
        executable: nginxExecutable,
        files: nginxFiles,
      }),
    );
    const gates = fullMediaGates.map(id => {
      const log = `qualification/${id}.log`;
      add(log, `validator media evidence ${id}`);
      return { id, passed: true, log, sha256: files[log].sha256 };
    });
    const receipt = {
      schema: 1,
      kind: "bun-media-release",
      source,
      version,
      target: full.target,
      triplet: full.triplet,
      native: true,
      passed: true,
      runtimeSHA256: files[runtime].sha256,
      executableSHA256: files[executable].sha256,
      files,
      gates,
      sdk: [
        { name: "@aphrody/bun-video", version: "1.4.4-video.2", archive: "video.tgz", ...files["sdk/video.tgz"] },
        { name: "@aphrody/bun-runtime-sdk", version: "1.4.5", archive: "runtime.tgz", ...files["sdk/runtime.tgz"] },
      ],
    };
    const archive = await new Bun.Archive(
      Object.fromEntries([
        ...Object.entries(payload).map(([name, body]) => [`${full.triplet}/${name}`, body]),
        [`${full.triplet}/bun-media-release.json`, JSON.stringify(receipt)],
      ]),
      { format: "zip" },
    ).bytes();
    await Bun.write(join(root, `${full.triplet}.zip`), archive);
    await Bun.write(
      join(root, `${full.triplet}.qualification.json`),
      JSON.stringify({
        ...receipt,
        archive: { name: `${full.triplet}.zip`, sha256: hash(archive), bytes: archive.length },
      }),
    );
    const ids = [...fullPlatformGates, ...(target.os === "windows" ? ["winget-manifest", "winget-install"] : [])];
    const platformGates = [];
    for (const id of ids) {
      const log = `${full.triplet}-${id}.log`,
        body = `validator native evidence ${full.target}/${id}`;
      await Bun.write(join(root, log), body);
      platformGates.push({ id, log, passed: true, sha256: hash(body) });
    }
    const pins = sdkManifest.targets[target.sdkTarget as keyof typeof sdkManifest.targets];
    await Bun.write(
      join(root, `${full.triplet}.platform-gates.json`),
      JSON.stringify({
        schema: 1,
        kind: "bun-native-platform-gates",
        source,
        version,
        target: full.target,
        native: true,
        passed: true,
        platform: target.platform,
        arch: target.runtimeArch,
        execution: "native",
        archiveSHA256: hash(archive),
        runtimeSHA256: files[runtime].sha256,
        executableSHA256: files[executable].sha256,
        sdkSources: { ffmpeg: pins.ffmpeg.sourceRevision, mpv: pins.mpv.sourceRevision },
        gates: platformGates,
      }),
    );
  }
  await run(root);
}

test("aggregate verifies eight exact full products and every archived/evidence byte", async () => {
  await fixture(async root => {
    const receipt = await aggregateFullRelease(root, source, version);
    expect(receipt.targets).toEqual(targets.map(target => target.target));
    expect(receipt.platforms).toHaveLength(8);
    await Bun.write(join(root, "media-full-qualification.json"), JSON.stringify(receipt));
    expect(await verifyFullRelease(root, source, version)).toEqual(receipt);
    receipt.source = "b".repeat(40);
    await Bun.write(join(root, "media-full-qualification.json"), JSON.stringify(receipt));
    await expect(verifyFullRelease(root, source, version)).rejects.toThrow("aggregate differs");
  });
});

test("missing platform, wrong source and tampered ZIP cannot qualify a release", async () => {
  await fixture(async root => {
    await expect(aggregateFullRelease(root, "b".repeat(40), version)).rejects.toThrow("identity differs");
    const archive = join(root, `${targets[0].triplet}.zip`);
    await Bun.write(archive, "altered archive");
    await expect(aggregateFullRelease(root, source, version)).rejects.toThrow("archive checksum differs");
  });
  await fixture(async root => {
    await unlink(join(root, `${targets.at(-1)!.triplet}.qualification.json`));
    await expect(aggregateFullRelease(root, source, version)).rejects.toThrow();
  });
});

for (const mutation of [
  "execution",
  "arch",
  "sdkSources",
  "failed-gate",
  "duplicate-gate",
  "missing-winget",
] as const) {
  test(`native platform evidence rejects ${mutation}`, async () => {
    await fixture(async root => {
      const target = targets.find(target => target.os === "windows")!;
      const path = join(root, `${target.triplet}.platform-gates.json`);
      const receipt = await Bun.file(path).json();
      if (mutation === "execution") receipt.execution = "wine";
      if (mutation === "arch") receipt.arch = "arm64";
      if (mutation === "sdkSources") receipt.sdkSources.mpv = "b".repeat(40);
      if (mutation === "failed-gate") receipt.gates[0].passed = false;
      if (mutation === "duplicate-gate") receipt.gates.push(receipt.gates[0]);
      if (mutation === "missing-winget")
        receipt.gates = receipt.gates.filter((gate: { id: string }) => gate.id !== "winget-install");
      await Bun.write(path, JSON.stringify(receipt));
      await expect(aggregateFullRelease(root, source, version)).rejects.toThrow();
    });
  });
}

test("native install/update log tampering blocks publication and stable guards remain active", async () => {
  await fixture(async root => {
    await Bun.write(join(root, `${targets[0].triplet}-native-update.log`), "different evidence");
    await expect(aggregateFullRelease(root, source, version)).rejects.toThrow("platform log differs");
    await expect(aggregateFullRelease(root, source, version, "stable")).rejects.toThrow(
      "Stable integration qualification is pending",
    );
  });
});

test("rehashing a changed outer archive cannot hide an altered archived native binary", async () => {
  await fixture(async root => {
    const full = targets[0];
    const archivePath = join(root, `${full.triplet}.zip`);
    const entries = await new Bun.Archive(await Bun.file(archivePath).bytes()).files();
    const payload: Record<string, Uint8Array> = {};
    for (const [name, file] of entries) payload[name] = new Uint8Array(await file.arrayBuffer());
    payload[`${full.triplet}/bun`] = new TextEncoder().encode("altered native binary");
    const bytes = await new Bun.Archive(payload, { format: "zip" }).bytes();
    await Bun.write(archivePath, bytes);
    const receiptPath = join(root, `${full.triplet}.qualification.json`);
    const receipt = await Bun.file(receiptPath).json();
    receipt.archive.sha256 = hash(bytes);
    receipt.archive.bytes = bytes.length;
    await Bun.write(receiptPath, JSON.stringify(receipt));
    await expect(aggregateFullRelease(root, source, version)).rejects.toThrow("member checksum differs");
  });
});

test("rehashing all outer evidence cannot qualify a runtime SDK built from another source", async () => {
  await fixture(async root => {
    const full = targets[0]!;
    const archivePath = join(root, `${full.triplet}.zip`);
    const entries = await new Bun.Archive(await Bun.file(archivePath).bytes()).files();
    const payload = Object.fromEntries(
      await Promise.all([...entries].map(async ([name, file]) => [name, await file.bytes()])),
    );
    const receiptPath = join(root, `${full.triplet}.qualification.json`);
    const receipt = await Bun.file(receiptPath).json();
    const manifestName = Object.keys(receipt.files).find(
      name => name.startsWith("lib/runtime-sdk/") && name.endsWith("/manifest.json"),
    )!;
    const artifact = JSON.parse(new TextDecoder().decode(payload[`${full.triplet}/${manifestName}`]));
    artifact.sources.bun.rev = "b".repeat(40);
    const artifactBytes = new TextEncoder().encode(JSON.stringify(artifact));
    payload[`${full.triplet}/${manifestName}`] = artifactBytes;
    receipt.files[manifestName] = { bytes: artifactBytes.length, sha256: hash(artifactBytes) };
    const { archive: _archive, ...inner } = receipt;
    payload[`${full.triplet}/bun-media-release.json`] = new TextEncoder().encode(JSON.stringify(inner));
    const bytes = await new Bun.Archive(payload, { format: "zip" }).bytes();
    await Bun.write(archivePath, bytes);
    receipt.archive = { name: `${full.triplet}.zip`, bytes: bytes.length, sha256: hash(bytes) };
    await Bun.write(receiptPath, JSON.stringify(receipt));
    await expect(aggregateFullRelease(root, source, version)).rejects.toThrow(
      "runtime SDK source or ABI binding differs",
    );
  });
});

for (const mutation of [
  "foreign-source",
  "failed-module-gate",
  "negative-abi-library",
  "libc-floor",
  "musl-glibc",
  "macos-floor",
] as const) {
  test(`rehashing native NGINX evidence cannot hide ${mutation}`, async () => {
    await fixture(async root => {
      const full =
        mutation === "musl-glibc"
          ? targets.find(target => target.abi === "musl")!
          : mutation === "macos-floor"
            ? targets.find(target => target.os === "darwin")!
            : targets[0]!;
      const archivePath = join(root, `${full.triplet}.zip`);
      const entries = await new Bun.Archive(await Bun.file(archivePath).bytes()).files();
      const payload = Object.fromEntries(
        await Promise.all([...entries].map(async ([name, file]) => [name, await file.bytes()])),
      );
      const receiptPath = join(root, `${full.triplet}.qualification.json`);
      const receipt = await Bun.file(receiptPath).json();
      const manifestName = Object.keys(receipt.files).find(
        name => name.startsWith("lib/nginx/") && name.endsWith("/nginx-sdk.json"),
      )!;
      const nginxRoot = manifestName.slice(0, -"nginx-sdk.json".length);
      const manifest = JSON.parse(new TextDecoder().decode(payload[`${full.triplet}/${manifestName}`]));
      const replace = (name: string, value: unknown) => {
        const bytes = new TextEncoder().encode(JSON.stringify(value));
        payload[`${full.triplet}/${nginxRoot}${name}`] = bytes;
        manifest.files[name] = { bytes: bytes.length, sha256: hash(bytes) };
        receipt.files[nginxRoot + name] = manifest.files[name];
      };
      if (mutation === "negative-abi-library") replace("bin/libngx_http_bun_module.so", "negative ABI fixture");
      else if (["libc-floor", "musl-glibc", "macos-floor"].includes(mutation)) {
        const evidenceName = "receipts/closure.json";
        const evidence = JSON.parse(new TextDecoder().decode(payload[`${full.triplet}/${nginxRoot}${evidenceName}`]));
        if (mutation === "macos-floor") evidence.files[0].minimumMacOS = "14.0";
        else {
          evidence.maximumGLIBC = mutation === "musl-glibc" ? "2.17" : "2.43";
          evidence.files[0].minimumGLIBC = evidence.maximumGLIBC;
        }
        replace(evidenceName, evidence);
      } else {
        const evidenceName = "receipts/module-qualification.json";
        const evidence = JSON.parse(new TextDecoder().decode(payload[`${full.triplet}/${nginxRoot}${evidenceName}`]));
        if (mutation === "foreign-source") evidence.host.bunRevision = "b".repeat(40);
        else evidence.gates.abiMismatchRejected = false;
        replace(evidenceName, evidence);
      }
      const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
      payload[`${full.triplet}/${manifestName}`] = manifestBytes;
      receipt.files[manifestName] = { bytes: manifestBytes.length, sha256: hash(manifestBytes) };
      const { archive: _archive, ...inner } = receipt;
      payload[`${full.triplet}/bun-media-release.json`] = new TextEncoder().encode(JSON.stringify(inner));
      const bytes = await new Bun.Archive(payload, { format: "zip" }).bytes();
      await Bun.write(archivePath, bytes);
      receipt.archive = { name: `${full.triplet}.zip`, bytes: bytes.length, sha256: hash(bytes) };
      await Bun.write(receiptPath, JSON.stringify(receipt));
      await expect(aggregateFullRelease(root, source, version)).rejects.toThrow(
        mutation === "negative-abi-library"
          ? "Invalid native NGINX release member"
          : ["libc-floor", "musl-glibc", "macos-floor"].includes(mutation)
            ? "closure exceeds or differs"
            : "controller/module evidence differs",
      );
    });
  });
}
