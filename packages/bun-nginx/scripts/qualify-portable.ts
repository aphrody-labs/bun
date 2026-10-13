import { isAbsolute, resolve } from "node:path";
import { hashSDKFile } from "../../bun-video/src/sdk";
import type { MediaELF } from "../../../scripts/aphrody/media-sdk-abi";

async function inspect(path: string, flag: string) {
  await using child = Bun.spawn(["readelf", flag, path], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
  });
  const [stdout, stderr, code] = await Promise.all([
    Bun.readableStreamToText(child.stdout),
    Bun.readableStreamToText(child.stderr),
    child.exited,
  ]);
  if (code) throw Error(`NGINX ELF inspection failed: ${stderr}`);
  return stdout;
}
export async function qualifyPortable(
  buildPath: string,
  enginePath: string,
  output: string,
  abiOwnerPath = resolve(import.meta.dir, "../../../scripts/aphrody/media-sdk-abi.ts"),
) {
  if (
    process.platform !== "linux" ||
    process.arch !== "x64" ||
    ![buildPath, enginePath, output, abiOwnerPath].every(isAbsolute)
  )
    throw Error("Portable NGINX qualification requires GNU x64 Linux and absolute receipts");
  const abiOwnerSha256 = await hashSDKFile(abiOwnerPath);
  if (abiOwnerSha256 !== "f4615233b1a486b4e1d8cd747e6078facbae2adc1d6fa21f93e4a5f9e018d2df")
    throw Error("Canonical Bun ELF qualification owner changed; review its pin");
  const { qualifyMediaELFs }: typeof import("../../../scripts/aphrody/media-sdk-abi") = await import(abiOwnerPath);
  const build = await Bun.file(buildPath).json(),
    engine = await Bun.file(enginePath).json();
  if (
    build.kind !== "bun-nginx-native-provider-build" ||
    build.portableSDK?.receipt?.target !== "linux-x64-gnu" ||
    build.portableSDK.receipt.requiredGlibcMaximum !== "2.17" ||
    build.environment.ngx_cargo_profile !== "ngx-release" ||
    engine.kind !== "nginx-native-engine-qualification" ||
    engine.nativeModule?.nativeRustModuleQualified !== true ||
    engine.nativeModule.head !== true ||
    engine.nativeModule.clientAbortAfterNativeTimerObserved !== true ||
    engine.nativeModule.timerCleanup !== true ||
    engine.nativeModule.invalidRustConfigurationRejected !== true ||
    engine.nativeModule.abiMismatchRejected !== true ||
    engine.nativeModule.mismatchFixture?.sha256 !== build.mismatchFixture?.sha256 ||
    engine.gates?.configuration !== true ||
    engine.gates.http?.status !== 200 ||
    engine.gates.range?.status !== 206 ||
    engine.gates.reload?.status !== 200 ||
    engine.gates.invalidConfigurationRejected !== true ||
    engine.gates.quit !== true ||
    engine.gates.exitCode !== 0 ||
    engine.executable.sha256 !== build.executable.sha256 ||
    engine.nativeModule.information.configurationSha256 !== build.configurationSha256
  )
    throw Error("NGINX native engine evidence differs from its portable source build");
  const timer = engine.nativeModule.nativeEventLoopTimer;
  if (
    !Number.isFinite(timer?.instantMilliseconds) ||
    !Number.isFinite(timer.elapsedMilliseconds) ||
    timer.instantMilliseconds < 0 ||
    timer.elapsedMilliseconds < 450 ||
    timer.instantMilliseconds >= timer.elapsedMilliseconds - 100 ||
    !Array.isArray(build.mismatchFixture.dependencies) ||
    build.mismatchFixture.dependencies.length > 8
  )
    throw Error("NGINX native timer or negative fixture closure is unqualified");
  const inputs: MediaELF[] = [];
  for (const selected of [
    { ...build.executable, file: "bin/nginx" },
    { ...build.mismatchFixture, file: "lib/abi-mismatch-fixture.so" },
    ...(build.mismatchFixture.dependencies ?? []),
  ]) {
    if (!isAbsolute(selected.path) || selected.sha256 !== (await hashSDKFile(selected.path)))
      throw Error("Portable NGINX executable or ABI fixture drift");
    const [header, dynamic, versions, programHeaders] = await Promise.all(
      ["--file-header", "--dynamic", "--version-info", "--program-headers"].map(flag => inspect(selected.path, flag)),
    );
    inputs.push({ file: selected.file, sha256: selected.sha256, header, dynamic, versions, programHeaders });
  }
  const abi = qualifyMediaELFs("linux-x64", inputs);
  const receipt = {
    schema: 1,
    kind: "bun-nginx-portable-native-qualification",
    measuredAt: new Date().toISOString(),
    target: "linux-x64-gnu",
    build: { path: buildPath, sha256: await hashSDKFile(buildPath) },
    engine: { path: enginePath, sha256: await hashSDKFile(enginePath) },
    executable: build.executable,
    abi,
    abiOwner: { path: abiOwnerPath, sha256: abiOwnerSha256 },
    inspectedELFs: inputs,
    nativeRustModuleQualified: true,
    portableEngineQualified: true,
    nativeBunController: false,
    portableReleaseQualified: false,
    allReleasePlatformsQualified: false,
    limits: [
      "The negative ABI fixture is deliberately incompatible and is excluded from release artifacts.",
      "The fresh native Bun controller and TLS/HTTP2/HTTP3 protocol behavior require separate gates.",
      "Symbol requirements meet GLIBC2.17; execution on an actual 2.17 host is not attested here.",
    ],
  };
  await Bun.write(output, JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}
if (import.meta.main) {
  const [build, engine, output, abiOwner] = process.argv.slice(2);
  if (!build || !engine || !output)
    throw Error("Usage: qualify-portable.ts <absolute-build-receipt> <absolute-engine-receipt> <absolute-output>");
  const receipt = await qualifyPortable(build, engine, output, abiOwner);
  console.log(
    JSON.stringify({
      output,
      maximumGLIBC: receipt.abi.maximumGLIBC,
      nativeRustModuleQualified: true,
      portableEngineQualified: true,
      portableReleaseQualified: false,
    }),
  );
}
