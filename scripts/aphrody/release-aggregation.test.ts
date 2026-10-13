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
