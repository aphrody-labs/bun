import { chmod, mkdir, realpath, statfs } from "node:fs/promises";
import { freemem } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pins, locations } from "../build/ci-images/spec";
import {
  downloadMediaSDK,
  extractMediaSDKArchive,
  hashSDKFile,
  mediaSDKPlan,
  verifyMediaSDKLayout,
  type MediaSDKDescriptor,
  type MediaSDKTarget,
} from "../../packages/bun-video/src/sdk";
import { mediaSDKHostTarget } from "../../packages/bun-video/src/sdk-platform";
import {
  assertPublicMediaPath,
  assertMediaRuntimeIdentity,
  mediaReleaseTarget,
  packageMediaRelease,
} from "./media-release";
import { nativeFullReleasePlan, runtimeFlavorArgs } from "./release-matrix";
import { qualifyLinuxMediaSDK } from "./media-sdk-factory";
import { qualifyNativeInstall, qualifyNativeWinget } from "./release-native-install";
import type { NativePlatformQualification } from "./release-aggregation";
import { binaryImports, isMediaSystemDLL } from "./media-stage";

type WorkerInput = { target: string; source: string; version: string; output: string; root: string };
const root = resolve(import.meta.dir, "../..");
const GiB = 1024 ** 3;

export function nativeLinuxCPUs(status: string): string {
  const ranges = status.match(/^Cpus_allowed_list:\s*([0-9,-]+)$/m)?.[1];
  const cpus: number[] = [];
  for (const range of (ranges ?? "").split(",")) {
    const [first, last = first] = range.split("-").map(Number);
    if (
      first === undefined ||
      last === undefined ||
      !Number.isSafeInteger(first) ||
      !Number.isSafeInteger(last) ||
      first < 0 ||
      last < first ||
      last > 1_048_576
    )
      throw new Error("Native Linux CPU allocation is invalid");
    for (let cpu = first; cpu <= last && cpus.length < 2; cpu++) cpus.push(cpu);
    if (cpus.length === 2) break;
  }
  if (cpus.length !== 2) throw new Error("Native Linux producer requires two allocated CPUs");
  return cpus.join(",");
}

export function nativeWorkerInput(args: string[], sourceRoot = root): WorkerInput {
  const [target, source, version, output] = args;
  if (
    args.length !== 4 ||
    !target ||
    !source ||
    !/^[a-f0-9]{40}$/.test(source) ||
    !version ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) ||
    !output ||
    !isAbsolute(output)
  )
    throw new Error("Native worker requires target, exact source SHA, version and absolute output directory");
  mediaReleaseTarget(target);
  const within = relative(resolve(sourceRoot), resolve(output));
  if (!within || (!within.startsWith("..") && !isAbsolute(within)))
    throw new Error("Native worker products must remain outside the source checkout");
  return { target, source, version, output: resolve(output), root: resolve(sourceRoot) };
}

export function nativeCapacity(input: { freeDisk: number; freeMemory: number; cpus: number }) {
  const required = { disk: 20 * GiB, memory: 6 * GiB, cpus: 2 };
  if (
    !Object.values(input).every(Number.isFinite) ||
    input.freeDisk < required.disk ||
    input.freeMemory < required.memory ||
    input.cpus < required.cpus
  )
    throw new Error(
      `Native capacity insufficient: require ${required.disk / GiB} GiB free disk, 6 GiB free RAM and 2 native CPUs`,
    );
  return { ...input, required, maxJobs: 2 };
}

export function nativeOwnerPrerequisites(target: string, plans?: MediaSDKDescriptor[]) {
  const selected = mediaReleaseTarget(target);
  const descriptors =
    plans ??
    (["ffmpeg", "mpv"] as const).map(component => mediaSDKPlan(component, selected.sdkTarget as MediaSDKTarget));
  const missing: string[] = [];
  for (const [index, plan] of descriptors.entries())
    if (!plan.assets.length)
      missing.push(
        `scripts/aphrody/media-sdk-factory.ts: complete pinned ${index === 0 ? "ffmpeg" : "mpv"} SDK assets absent for ${selected.sdkTarget}`,
      );
  // The existing native asset plugins deliberately reject these platforms.
  if (target !== "windows-x64")
    missing.push("packages/bun-video native Sharp/Remotion library owner currently qualifies Windows x64 only");
  if (selected.os === "darwin")
    missing.push("Native Mach-O closure qualification for the media and runtime SDK owners is not implemented");
  return missing;
}

function workerEnvironment() {
  return {
    ...process.env,
    CARGO_BUILD_JOBS: "2",
    BUN_MEDIA_JOBS: "2",
    OMP_NUM_THREADS: "2",
    RUSTC_WRAPPER: undefined,
    CARGO_BUILD_RUSTC_WRAPPER: undefined,
    TYPESAFE_API_KEY: undefined,
    TYPESAFE_API_KEY_FILE: undefined,
    GH_TOKEN: undefined,
    GITHUB_TOKEN: undefined,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
  };
}

async function command(
  argv: string[],
  cwd: string,
  log: string,
  options: {
    timeout?: number;
    env?: Record<string, string | undefined>;
  } = {},
) {
  const ownerCommand = argv[0];
  if (process.platform === "linux") {
    const taskset = Bun.which("taskset");
    if (!taskset) throw new Error("Native Linux CPU affinity owner is missing: util-linux taskset");
    argv = [taskset, "-c", nativeLinuxCPUs(await Bun.file("/proc/self/status").text()), ...argv];
  }
  const file = Bun.file(log).writer();
  const child = Bun.spawn(argv, {
    cwd,
    env: { ...workerEnvironment(), ...options.env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
    ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
  });
  const capture = async (stream: ReadableStream<Uint8Array>) => {
    let result = "",
      bytes = 0;
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      file.write(chunk);
      bytes += chunk.byteLength;
      if (bytes > 64 * 1024 * 1024) {
        child.kill();
        throw new Error("Native command log exceeded its bound");
      }
      result += decoder.decode(chunk, { stream: true });
    }
    return result + decoder.decode();
  };
  try {
    const [stdout, stderr, code] = await Promise.all([capture(child.stdout), capture(child.stderr), child.exited]);
    if (code !== 0 || child.signalCode)
      throw new Error(`Native owner command failed: ${ownerCommand} (exit ${code}; inspect ${log})`);
    return { stdout, stderr };
  } finally {
    child.kill();
    await file.end();
  }
}

async function sourceIdentity(input: WorkerInput, diagnostics: string) {
  const revision = await command(["git", "rev-parse", "HEAD"], input.root, join(diagnostics, "source.log"), {
    timeout: 30_000,
  });
  if (revision.stdout.trim() !== input.source) throw new Error("Native checkout does not match source SHA");
  const dirty = await command(
    ["git", "status", "--porcelain", "--untracked-files=normal"],
    input.root,
    join(diagnostics, "source-status.log"),
    { timeout: 30_000 },
  );
  if (dirty.stdout.trim()) throw new Error("Native producer checkout contains unpublished source changes");
  if ((await Bun.file(join(input.root, "package.json")).json()).version !== input.version)
    throw new Error("Native producer version differs from committed package.json");
}

async function preflight(input: WorkerInput) {
  const target = mediaReleaseTarget(input.target);
  const diagnostics = join(input.output, "diagnostics");
  await mkdir(diagnostics, { recursive: true });
  if (process.platform !== target.platform || process.arch !== target.runtimeArch)
    throw new Error(`Runner cannot execute native ${input.target}; emulation and cross tests are insufficient`);
  await sourceIdentity(input, diagnostics);
  const disk = await statfs(input.output);
  const capacity = nativeCapacity({
    freeDisk: disk.bavail * disk.bsize,
    freeMemory: freemem(),
    cpus: navigator.hardwareConcurrency,
  });
  const missing = nativeOwnerPrerequisites(input.target);
  const observation = {
    schema: 1,
    source: input.source,
    target: input.target,
    version: input.version,
    platform: process.platform,
    arch: process.arch,
    controlABI: mediaSDKHostTarget(),
    capacity,
    missing,
    passed: missing.length === 0,
    nativeReleaseQualified: false,
  };
  await Bun.write(join(diagnostics, "preflight.json"), JSON.stringify(observation, null, 2) + "\n");
  if (missing.length) throw new Error(`Native owners unavailable:\n${missing.join("\n")}`);
  return diagnostics;
}

async function sdkPrefix(input: WorkerInput, diagnostics: string) {
  const target = mediaReleaseTarget(input.target);
  const prefix = join(input.output, "media-prefix");
  await mkdir(prefix, { recursive: false });
  const members = new Map<string, string>();
  for (const component of ["ffmpeg", "mpv"] as const) {
    const descriptor = mediaSDKPlan(component, target.sdkTarget as MediaSDKTarget);
    const archives = await downloadMediaSDK(
      component,
      target.sdkTarget as MediaSDKTarget,
      join(input.output, "downloads"),
    );
    if (archives.length !== 1) throw new Error(`Native factory needs one complete normalized ${component} SDK asset`);
    const directory = join(input.output, `sdk-${component}`);
    await extractMediaSDKArchive(archives[0]!, directory);
    const receipt = await Bun.file(join(directory, "bun-sdk-receipt.json")).json();
    if (
      receipt.schema !== 1 ||
      receipt.component !== component ||
      receipt.target !== target.sdkTarget ||
      receipt.sourceRevision !== descriptor.sourceRevision ||
      !receipt.files
    )
      throw new Error(`Normalized ${component} SDK source receipt differs`);
    await verifyMediaSDKLayout(component, target.sdkTarget as MediaSDKTarget, directory);
    for (const [name, expected] of Object.entries(receipt.files)) {
      assertPublicMediaPath(name);
      const path = await realpath(join(directory, name));
      const within = relative(await realpath(directory), path);
      if (within.startsWith("..") || isAbsolute(within) || (await hashSDKFile(path)) !== expected)
        throw new Error(`Pinned ${component} SDK member differs: ${name}`);
      const key = name.toLowerCase();
      const prior = members.get(key);
      if (prior && prior !== expected) throw new Error(`Native SDK owners collide: ${name}`);
      if (!prior) {
        const destination = join(prefix, name);
        await mkdir(dirname(destination), { recursive: true });
        await Bun.write(destination, Bun.file(path));
        if (target.os !== "windows") await chmod(destination, name.startsWith("bin/") ? 0o755 : 0o644);
        members.set(key, String(expected));
      }
    }
    await Bun.write(join(diagnostics, `${component}-sdk.json`), JSON.stringify(receipt, null, 2) + "\n");
  }
  const sidecars =
    target.os === "windows"
      ? ["bin/bun-video-native.exe", "bin/bun_video_native.dll"]
      : [
          "bin/bun-video-native",
          target.os === "darwin" ? "lib/libbun_video_native.dylib" : "lib/libbun_video_native.so",
        ];
  for (const path of sidecars)
    if (!(await Bun.file(join(prefix, path)).exists()))
      throw new Error(`Native AVIO sidecar owner absent from pinned complete SDK: ${path}`);
  return prefix;
}

async function produce(input: WorkerInput) {
  const diagnostics = await preflight(input);
  const target = mediaReleaseTarget(input.target);
  if (target.abi === "musl" && !mediaSDKHostTarget().endsWith("-musl")) return produceMusl(input, diagnostics);
  if (mediaSDKHostTarget() !== target.sdkTarget) throw new Error("Native producer ABI differs from requested target");
  const run = async (id: string, argv: string[], timeout = 120_000, cwd = input.root) =>
    command(argv, cwd, join(diagnostics, `${id}.log`), { timeout });
  await run(
    "setup",
    [
      process.execPath,
      "--no-env-file",
      "scripts/aphrody/setup.ts",
      "--dir",
      input.root,
      "--ref",
      input.source,
      "--no-build",
      "--no-update",
      "--no-agent-plugin",
    ],
    1_800_000,
  );
  if (target.os === "windows" && !process.env.BUN_TOOLCHAIN_LLVM && process.env.LOCALAPPDATA)
    process.env.BUN_TOOLCHAIN_LLVM = join(process.env.LOCALAPPDATA, "bun/toolchain", `llvm-${pins.llvm.version}`);
  const toolchain = JSON.parse(
    (
      await run("llvm-pin", [
        process.execPath,
        "--no-env-file",
        "-e",
        `const {resolveLlvmToolchain}=await import('./scripts/build/tools.ts');const t=resolveLlvmToolchain(${JSON.stringify(target.os)},${JSON.stringify(target.arch)});console.log(JSON.stringify({cc:t.cc,version:t.clangVersion}));`,
      ])
    ).stdout,
  );
  if (toolchain.version !== pins.llvm.version) throw new Error(`LLVM must match source pin ${pins.llvm.version}`);
  process.env.BUN_TOOLCHAIN_LLVM = dirname(dirname(toolchain.cc));
  const rust = (await run("rust-pin", ["rustup", "show", "active-toolchain"])).stdout;
  if (!rust.startsWith(pins.rust.channel)) throw new Error("Rust toolchain differs from committed pin");
  const prefix = await sdkPrefix(input, diagnostics);
  process.env.BUN_MEDIA_PREFIX = prefix;
  await run("curl-source", [process.execPath, "--no-env-file", "scripts/aphrody/curl-source.ts"], 300_000);
  const sysroot =
    target.os === "linux"
      ? (target.abi === "musl" ? locations.muslSysroot : locations.glibcSysroot)[target.arch]
      : undefined;
  if (sysroot && !(await Bun.file(join(sysroot, "usr/include/stdio.h")).exists()))
    throw new Error(`Pinned target sysroot missing: ${sysroot}; scripts/build/ci-images/spec.ts owns its provisioning`);
  const buildFlags = [
    ...runtimeFlavorArgs(target),
    "--ci=on",
    "--buildkite=off",
    "--canary=off",
    "--video-native=on",
    "--curl-native=on",
    "--browser-crawl=on",
    "--link-threads=2",
    "-j2",
    ...(sysroot ? [`--linux-sysroot=${sysroot}`] : []),
  ];
  // bun bd owns its build lock; its build is intentionally not terminated by a command timeout.
  await command(
    [process.execPath, "--no-env-file", "bd", ...buildFlags, "--target=bun-profile"],
    input.root,
    join(diagnostics, "runtime-build.log"),
    { env: { GIT_SHA: input.source } },
  );
  const runtime = join(input.root, "build/release", target.os === "windows" ? "bun-profile.exe" : "bun-profile");
  const identity = JSON.parse(
    (
      await run("runtime-identity", [
        runtime,
        "--no-env-file",
        "-e",
        "console.log(JSON.stringify({version:Bun.version,revision:Bun.revision,platform:process.platform,arch:process.arch}))",
      ])
    ).stdout,
  );
  assertMediaRuntimeIdentity(identity, input.source, input.target);
  const spec = `${runtime}.verify.json`;
  const expectations = await Bun.file(spec).json();
  for (const name of ["readobj", "nm", "objdump", "cxxfilt"]) {
    const tool = expectations.tools?.[name];
    if (!tool || !(await Bun.file(tool).exists())) throw new Error(`Required native verifier tool absent: ${name}`);
  }
  if (
    target.abi === "gnu" &&
    (expectations.expect?.maxSymbolVersions?.GLIBC !== "2.17" || expectations.expect?.neededLibs?.exact !== true)
  )
    throw new Error("GNU executable contract must enforce GLIBC <= 2.17 and exact closure");
  await run("runtime-closure", [process.execPath, "--no-env-file", "scripts/build/verify-binary.ts", "binary", spec]);
  const sdkRoot = join(input.root, "packages/bun-runtime-sdk");
  await run(
    "runtime-sdk-build",
    [
      process.execPath,
      "--no-env-file",
      join(input.root, "scripts/build/rust/cargo-serial.ts"),
      ...(target.os === "windows" ? ["--msvc"] : []),
      "build",
      "--manifest-path",
      join(sdkRoot, "Cargo.toml"),
      "--locked",
      "--profile",
      "runtime",
      "-p",
      "yolo-runtime",
      "-j2",
    ],
    1_800_000,
    sdkRoot,
  );
  const sdkBuiltLibrary = join(
    sdkRoot,
    "target/runtime",
    target.os === "windows"
      ? "yolo_runtime.dll"
      : target.os === "darwin"
        ? "libyolo_runtime.dylib"
        : "libyolo_runtime.so",
  );
  if (target.os === "linux") await run("runtime-sdk-rpath", ["patchelf", "--set-rpath", "$ORIGIN", sdkBuiltLibrary]);
  const stagedSDK = await run(
    "runtime-sdk-stage",
    [runtime, "--no-env-file", "scripts/stage.ts", sdkBuiltLibrary],
    120_000,
    sdkRoot,
  );
  const runtimeSDKArtifact = dirname(stagedSDK.stdout.trim());
  const sdkArtifactManifest = await Bun.file(join(runtimeSDKArtifact, "manifest.json")).json();
  const sdkLibraries = Object.keys(sdkArtifactManifest.files).filter(name => /\.(?:dll|so|dylib)$/.test(name));
  if (sdkLibraries.length !== 1) throw new Error("Runtime SDK artifact must own exactly one native module");
  const sdkLibrary = join(runtimeSDKArtifact, sdkLibraries[0]!);
  let sdkClosure: unknown;
  if (target.os === "linux") {
    const directory = join(input.output, "runtime-sdk-closure");
    await mkdir(join(directory, "lib"), { recursive: true });
    await Bun.write(join(directory, "lib", sdkLibraries[0]!), Bun.file(sdkLibrary));
    sdkClosure = await qualifyLinuxMediaSDK(target.sdkTarget as MediaSDKTarget, directory);
  } else if (target.os === "windows") {
    const imports = await binaryImports(sdkLibrary, target.sdkTarget as MediaSDKTarget);
    if (imports.some(name => !isMediaSystemDLL(name)))
      throw new Error("Runtime SDK imports an unbundled native dependency");
    sdkClosure = { target: target.sdkTarget, imports, sha256: await hashSDKFile(sdkLibrary) };
  } else throw new Error("Native Mach-O runtime SDK closure owner is missing");
  const gates: NativePlatformQualification["gates"] = [];
  const products = join(input.output, "products");
  await mkdir(products, { recursive: false });
  const gate = async (
    id: string,
    argv: string[],
    options: { cwd?: string; env?: Record<string, string | undefined> } = {},
  ) => {
    const log = `${target.triplet}-${id}.log`;
    const result = await command(argv, options.cwd ?? input.root, join(products, log), {
      timeout: 300_000,
      env: { ...options.env, BUN_TEST_BOOTSTRAP_RELEASE_PATH: runtime, BUN_EXECUTABLE: runtime },
    });
    if (argv.includes("test") && (!/\b[1-9]\d* pass\b/.test(result.stderr) || !/\b0 fail\b/.test(result.stderr)))
      throw new Error(`Native test gate executed no passing tests: ${id}`);
    gates.push({ id, passed: true, log, sha256: await hashSDKFile(join(products, log)) });
    return id === "native-update" ? result.stdout + result.stderr : result.stdout;
  };
  await gate("runtime-regressions", [
    runtime,
    "--no-env-file",
    "test",
    "--max-concurrency=2",
    "./test/js/bun/image/image.test.ts",
    "./test/js/bun/video/test.ts",
    "./test/cli/video/video.test.ts",
    "./test/js/bun/yolo/yolo.test.ts",
    "./test/js/bun/sqlite/sqlite.test.js",
  ]);
  await gate("transpiler-cache-regressions", [
    runtime,
    "--no-env-file",
    "test",
    "./test/cli/run/transpiler-cache.test.ts",
    "-t",
    "rejects version 35|sourcemap section header is corrupt",
  ]);
  await gate("mcp-jev-fixtures", [
    runtime,
    "--no-env-file",
    "test",
    "./test/cli/mcp/mcp.test.ts",
    "-t",
    "Jev|jev|yolo",
  ]);
  await gate("curl-crawl-fixtures", [
    runtime,
    "--no-env-file",
    "test",
    "./test/internal/browser-cli.test.ts",
    "-t",
    "native (Curl|Crawl)",
  ]);
  const closure =
    target.os === "linux"
      ? await qualifyLinuxMediaSDK(target.sdkTarget as MediaSDKTarget, prefix)
      : await verifyMediaSDKLayout("ffmpeg", target.sdkTarget as MediaSDKTarget, prefix);
  await Bun.write(join(diagnostics, "media-closure.json"), JSON.stringify(closure, null, 2) + "\n");
  await gate(
    "native-runtime-sdk",
    [
      runtime,
      "--no-env-file",
      "-e",
      `const {loadArtifactAsync}=await import('./packages/bun-runtime-sdk/src/artifact.ts');const r=await loadArtifactAsync(process.argv[1]);try{const b=r.buildInfo();if(!process.env.GIT_SHA?.startsWith(b.git_rev)||!b.panic_recovery)throw new Error('SDK source identity differs');console.log(JSON.stringify(b));}finally{r.close();}`,
      runtimeSDKArtifact,
    ],
    { env: { GIT_SHA: input.source } },
  );
  await gate("native-closure", [process.execPath, "--no-env-file", "scripts/build/verify-binary.ts", "binary", spec]);
  const closureGate = gates.find(gate => gate.id === "native-closure")!;
  const closureLog = join(products, closureGate.log);
  await Bun.write(
    closureLog,
    (await Bun.file(closureLog).text()) + JSON.stringify({ media: closure, runtimeSDK: sdkClosure }, null, 2) + "\n",
  );
  closureGate.sha256 = await hashSDKFile(closureLog);
  const executable = join(input.output, target.os === "windows" ? "bun-video.exe" : "bun-video");
  await run("video-executable", [runtime, "--no-env-file", "packages/bun-video/scripts/build.ts", executable], 600_000);
  await run(
    "video-library",
    [runtime, "--no-env-file", "run", "qualify:package"],
    600_000,
    join(input.root, "packages/bun-video"),
  );
  await run(
    "runtime-sdk-pack",
    [runtime, "--no-env-file", "pm", "pack", "--ignore-scripts", "--destination", input.output],
    120_000,
    sdkRoot,
  );
  const videoManifest = await Bun.file(join(input.root, "packages/bun-video/package.json")).json();
  const sdkManifest = await Bun.file(join(sdkRoot, "package.json")).json();
  const assembled = await packageMediaRelease({
    target: input.target,
    source: input.source,
    sourceRoot: input.root,
    runtime,
    executable,
    mediaPrefix: prefix,
    runtimeSDKArtifact,
    output: join(input.output, "assembled"),
    sdkArchives: [
      {
        directory: "packages/bun-video",
        archive: join(
          input.root,
          `build/media/video-package-qualification/aphrody-bun-video-${videoManifest.version}.tgz`,
        ),
      },
      {
        directory: "packages/bun-runtime-sdk",
        archive: join(input.output, `aphrody-bun-runtime-sdk-${sdkManifest.version}.tgz`),
      },
    ],
  });
  const scratch = join(input.output, "install-qualification");
  await mkdir(scratch, { recursive: false });
  const installInput = { ...input, scratch, runtime, archive: assembled.archive, run: gate };
  await qualifyNativeInstall(installInput);
  if (target.os === "windows") await qualifyNativeWinget(installInput);
  await sourceIdentity(input, diagnostics);
  const receipt: NativePlatformQualification = {
    schema: 1,
    kind: "bun-native-platform-gates",
    source: input.source,
    version: input.version,
    target: input.target,
    native: true,
    passed: true,
    execution: "native",
    platform: process.platform,
    arch: process.arch,
    runtimeSHA256: await hashSDKFile(runtime),
    executableSHA256: await hashSDKFile(executable),
    archiveSHA256: assembled.sha256,
    sdkSources: {
      ffmpeg: mediaSDKPlan("ffmpeg", target.sdkTarget as MediaSDKTarget).sourceRevision!,
      mpv: mediaSDKPlan("mpv", target.sdkTarget as MediaSDKTarget).sourceRevision!,
    },
    gates,
  };
  await Bun.write(join(products, `${target.triplet}.zip`), Bun.file(assembled.archive));
  await Bun.write(join(products, `${target.triplet}.qualification.json`), Bun.file(assembled.receipt));
  await Bun.write(join(products, `${target.triplet}.platform-gates.json`), JSON.stringify(receipt, null, 2) + "\n");
}

async function produceMusl(input: WorkerInput, diagnostics: string) {
  const allocation = nativeFullReleasePlan(input.source).targets.find(target => target.target === input.target)!;
  const bootstrap = allocation.bootstrap;
  const response = await fetch(bootstrap.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || Number(response.headers.get("content-length")) !== bootstrap.bytes)
    throw new Error("Pinned native musl bootstrap could not be fetched at its exact size");
  const archive = join(input.output, "musl-bootstrap.zip");
  await Bun.write(archive, response);
  if (Bun.file(archive).size !== bootstrap.bytes || (await hashSDKFile(archive)) !== bootstrap.sha256)
    throw new Error("Native musl bootstrap checksum differs");
  const binary = join(input.output, "musl-bun");
  const members = await new Bun.Archive(await Bun.file(archive).bytes()).files();
  const member = members.get(`bun-${input.target}/bun`);
  if (!member) throw new Error("Pinned musl bootstrap has no matching native Bun member");
  await Bun.write(binary, member);
  await chmod(binary, 0o755);
  const script = [
    "set -eu",
    "apk add --no-cache bash git curl unzip tar xz build-base cmake pkgconf linux-headers sudo util-linux",
    `git config --global --add safe.directory '${input.root.replaceAll("'", "'\\''")}'`,
    `"$BUN_BOOTSTRAP" -e 'if(process.arch!==${JSON.stringify(allocation.arch)}||Bun.revision!==${JSON.stringify(bootstrap.source)}||Bun.version!==${JSON.stringify(bootstrap.tag.replace("aphrody-v", ""))})throw new Error("Native musl bootstrap identity differs")'`,
    'exec "$BUN_BOOTSTRAP" --no-env-file scripts/aphrody/release-native-worker.ts produce "$NATIVE_TARGET" "$NATIVE_SOURCE" "$NATIVE_VERSION" "$NATIVE_OUTPUT"',
  ].join("\n");
  await command(
    [
      "docker",
      "run",
      "--rm",
      "--cpus=2",
      "--mount",
      `type=bind,source=${input.root},target=${input.root}`,
      "--mount",
      `type=bind,source=${input.output},target=${input.output}`,
      "--workdir",
      input.root,
      "--env",
      `BUN_BOOTSTRAP=${binary}`,
      "--env",
      `NATIVE_TARGET=${input.target}`,
      "--env",
      `NATIVE_SOURCE=${input.source}`,
      "--env",
      `NATIVE_VERSION=${input.version}`,
      "--env",
      `NATIVE_OUTPUT=${input.output}`,
      allocation.nativeABIContainer!,
      "sh",
      "-c",
      script,
    ],
    input.root,
    join(diagnostics, "native-musl-container.log"),
  );
}

if (import.meta.main) {
  const [action, ...args] = Bun.argv.slice(2);
  const input = nativeWorkerInput(args);
  try {
    if (action === "preflight") await preflight(input);
    else if (action === "produce") await produce(input);
    else
      throw new Error(
        "Usage: release-native-worker.ts preflight|produce <target> <source-SHA> <version> <absolute-output>",
      );
  } catch (error) {
    const diagnostics = join(input.output, "diagnostics");
    await mkdir(diagnostics, { recursive: true });
    await Bun.write(
      join(diagnostics, "failure.json"),
      JSON.stringify(
        {
          source: input.source,
          target: input.target,
          passed: false,
          nativeReleaseQualified: false,
          error: error instanceof Error ? error.message : "Native producer failed",
        },
        null,
        2,
      ) + "\n",
    );
    throw error;
  }
}
