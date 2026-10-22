import { existsSync } from "node:fs";
import { chmod, lstat, mkdir, realpath, stat, statfs } from "node:fs/promises";
import { availableParallelism, freemem, homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve, posix } from "node:path";
import { pins, locations } from "../build/ci-images/spec";
import {
  downloadMediaSDK,
  hashSDKFile,
  mediaSDKPlan,
  type MediaSDKDescriptor,
  type MediaSDKTarget,
} from "../../packages/bun-video/src/sdk";
import { mediaSDKHostTarget } from "../../packages/bun-video/src/sdk-platform";
import {
  archiveMediaReleaseFiles,
  assertMediaRuntimeIdentity,
  mediaReleaseTarget,
  packageMediaRelease,
} from "./media-release";
import {
  fullNativeRuntimeFeatures,
  nativeFullReleasePlan,
  runtimeFlavorArgs,
  runtimeFlavorManifest,
} from "./release-matrix";
import { materializeMediaSources } from "./media-sdk-source";
import { downloadWithRetry } from "../build/download";
import { qualifyMediaSDKClosure } from "./media-sdk-factory";
import {
  bootstrapNativeMediaInputs,
  prepareNativeMedia,
  qualifyNativeMediaAVIO,
  readNativeMediaInputs,
  type NativeMediaInputs,
} from "./media-sdk-producer";
import { qualifyNativeInstall, qualifyNativeWinget } from "./release-native-install";
import {
  aggregateRuntimeFullRelease,
  runtimeFullAsset,
  runtimeFullComponents,
  type NativeRuntimeFullReceipt,
  type NativePlatformQualification,
} from "./release-aggregation";
import { stageMediaBundle } from "./media-stage";
import { nativeNginxRecipe, readNginxReleaseArtifact, type NginxReleaseManifest } from "./release-native-nginx";
import { qualifyMediaELFs } from "./media-sdk-abi";
import { mediaBuildTarget } from "./media-sdk-build";
import { strippedELFVerificationSpec } from "../build/verify-binary";
import { buildGNUX64RuntimeSDK, runtimeSDKCargoArgs } from "./runtime-sdk-build";
import { windowsProtocInstallation, windowsProtocPlan } from "./setup";
import { plugins } from "../build/plugins";

type WorkerInput = { target: string; source: string; version: string; output: string; root: string };
const root = resolve(import.meta.dir, "../..");
const GiB = 1024 ** 3;

export function nativeLinuxCPUs(status: string, count = 2): string {
  if (!Number.isSafeInteger(count) || count < 1 || count > 1024)
    throw new Error("Native Linux CPU allocation is invalid");
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
    for (let cpu = first; cpu <= last && cpus.length < count; cpu++) {
      if (cpus.includes(cpu)) throw new Error("Native Linux CPU allocation overlaps");
      cpus.push(cpu);
    }
    if (cpus.length === count) break;
  }
  if (cpus.length !== count) throw new Error(`Native Linux producer requires ${count} allocated CPUs`);
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

type MemoryReader = (path: string) => Promise<string | undefined>;
async function readMemoryFile(path: string): Promise<string | undefined> {
  if (path === "vm_stat") {
    try {
      return Bun.spawnSync(["vm_stat"]).stdout.toString();
    } catch {
      return undefined;
    }
  }
  try {
    const text = await Bun.file(path).slice(0, 65_537).text();
    if (text.length > 65_536) throw new Error("Memory observation exceeds limit");
    return text;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Reclaimable Linux cache is available; ancestor cgroup budgets still constrain it. */
export async function nativeAvailableMemory(
  platform: string = process.platform,
  fallback = freemem(),
  read: MemoryReader = readMemoryFile,
): Promise<number> {
  if (!Number.isFinite(fallback) || fallback < 0) throw new Error("Invalid free memory observation");
  if (platform === "darwin") {
    // os.freemem() counts only never-used pages; inactive, speculative and purgeable pages are reclaimable.
    const text = await read("vm_stat");
    const size = text?.match(/page size of (\d+) bytes/)?.[1];
    const counts = new Map(
      [...(text ?? "").matchAll(/^Pages ([a-z ]+):\s+(\d+)\./gm)].map(m => [m[1], Number(m[2])] as const),
    );
    const pages = (label: string) => counts.get(label) ?? 0;
    if (size) {
      const reclaimable = pages("free") + pages("inactive") + pages("speculative") + pages("purgeable");
      if (reclaimable > 0) return Math.max(fallback, reclaimable * Number(size));
    }
    return fallback;
  }
  if (platform !== "linux") return fallback;
  const meminfo = await read("/proc/meminfo");
  const available = meminfo?.match(/^MemAvailable:\s+(\d+)\s+kB$/m);
  let budget = available ? Number(available[1]) * 1024 : fallback;
  if (!Number.isSafeInteger(budget) || budget < 0) throw new Error("Invalid available memory observation");
  const membership = await read("/proc/self/cgroup");
  const mounts = await read("/proc/self/mountinfo");
  if (!membership || !mounts) return budget;
  const unescape = (value: string) =>
    value.replace(/\\([0-7]{3})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 8)));
  for (const line of mounts.trim().split("\n")) {
    const [left, right] = line.split(" - ");
    const fields = left?.split(" ");
    const kind = right?.split(" ")[0];
    if (!fields || fields.length < 5 || (kind !== "cgroup2" && kind !== "cgroup")) continue;
    const unified = kind === "cgroup2";
    const member = membership
      .split("\n")
      .map(value => value.split(":"))
      .find(parts => (unified ? parts[0] === "0" && parts[1] === "" : parts[1]?.split(",").includes("memory")));
    if (!member?.[2] || (!unified && !right?.split(" ")[2]?.split(",").includes("memory"))) continue;
    const mountRoot = unescape(fields[3]!);
    const mountPoint = posix.resolve(unescape(fields[4]!));
    const subpath = posix.relative(mountRoot, unescape(member[2]));
    if (subpath.startsWith("..") || posix.isAbsolute(subpath)) continue;
    let directory = posix.resolve(mountPoint, subpath);
    while (true) {
      // Parent limits constrain the same process even when its leaf has no limit.
      // eslint-disable-next-line no-await-in-loop
      const [limit, current] = await Promise.all([
        read(posix.join(directory, unified ? "memory.max" : "memory.limit_in_bytes")),
        read(posix.join(directory, unified ? "memory.current" : "memory.usage_in_bytes")),
      ]);
      if (limit !== undefined && limit.trim() !== "max") {
        if (!/^\d+$/.test(limit.trim()) || !current || !/^\d+$/.test(current.trim()))
          throw new Error("Invalid cgroup memory observation");
        const remaining = BigInt(limit.trim()) - BigInt(current.trim());
        budget = Math.min(budget, remaining <= 0n ? 0 : Number(remaining));
      }
      if (directory === mountPoint) break;
      directory = posix.dirname(directory);
    }
  }
  return budget;
}

export interface NativeRuntimeResources {
  jobs: number;
  linkThreads: number;
}
export function nativeRuntimeResources(
  env: Readonly<Record<string, string | undefined>> = process.env,
): NativeRuntimeResources {
  const count = (value: string | undefined) => {
    if (value === undefined) return 2;
    if (!/^[1-9]\d{0,3}$/.test(value) || Number(value) > 1024)
      throw Error("Invalid explicit native runtime resource budget");
    return Number(value);
  };
  return { jobs: count(env.BUN_NATIVE_RUNTIME_JOBS), linkThreads: count(env.BUN_NATIVE_RUNTIME_LINK_THREADS) };
}
/** Ninja changes to the physical directory, so emitted relative inputs must use that same base. */
export async function nativeRuntimeBuildDirectory(sourceRoot: string): Promise<string> {
  const logical = join(resolve(sourceRoot), "build/release");
  let info;
  try {
    info = await lstat(logical);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return logical;
    throw error;
  }
  if (!info.isDirectory() && !info.isSymbolicLink()) throw Error("Native runtime build directory is not a directory");
  const physical = await realpath(logical);
  if (!(await stat(physical)).isDirectory()) throw Error("Native runtime build target is not a directory");
  return physical;
}
export function nativeRuntimeBuildFlags(
  target: Parameters<typeof runtimeFlavorArgs>[0],
  sysroot?: string,
  options: Partial<NativeRuntimeResources> & { buildDir?: string } = {},
): string[] {
  if (target.flavor !== "full") throw new Error("Native producer requires the full runtime profile");
  const jobs = options.jobs ?? 2,
    linkThreads = options.linkThreads ?? 2;
  if (
    ![jobs, linkThreads].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 1024) ||
    (options.buildDir !== undefined && !isAbsolute(options.buildDir))
  )
    throw Error("Invalid native runtime build options");
  return [
    ...runtimeFlavorArgs(target),
    "--ci=on",
    "--buildkite=off",
    "--canary=off",
    `--link-threads=${linkThreads}`,
    `-j${jobs}`,
    ...(sysroot ? [`--linux-sysroot=${sysroot}`] : []),
    ...(options.buildDir ? [`--build-dir=${options.buildDir}`] : []),
  ];
}

export function nativeCapacity(
  input: { freeDisk: number; freeMemory: number; cpus: number },
  resources: NativeRuntimeResources = { jobs: 2, linkThreads: 2 },
) {
  const threads = Math.max(2, resources.jobs, resources.linkThreads);
  if (
    ![resources.jobs, resources.linkThreads].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 1024)
  )
    throw Error("Invalid explicit native runtime resource budget");
  const required = { disk: 20 * GiB, memory: 6 * GiB, cpus: threads };
  if (
    !Object.values(input).every(Number.isFinite) ||
    input.freeDisk < required.disk ||
    input.freeMemory < required.memory ||
    input.cpus < required.cpus
  )
    throw Error(
      `Native capacity insufficient: require ${required.disk / GiB} GiB free disk, ${required.memory / GiB} GiB available RAM and ${required.cpus} native CPUs (observed ${Math.floor(input.freeDisk / GiB)} GiB, ${Math.floor(input.freeMemory / GiB)} GiB, ${input.cpus} CPUs)`,
    );
  return { ...input, required, maxJobs: resources.jobs, linkThreads: resources.linkThreads };
}

export function nativeOwnerPrerequisites(
  target: string,
  plans?: MediaSDKDescriptor[],
  component: "media" | "runtime" = "media",
) {
  const selected = mediaReleaseTarget(target);
  const descriptors =
    plans ??
    (["ffmpeg", "mpv"] as const).map(component => mediaSDKPlan(component, selected.sdkTarget as MediaSDKTarget));
  const missing: string[] = [];
  if (component === "media") {
    try {
      nativeNginxRecipe(target);
    } catch (error) {
      missing.push((error as Error).message);
    }
  }
  for (const [index, plan] of descriptors.entries())
    if (
      !plan.assets.length &&
      (plan.buildRecipe?.owner !== "scripts/aphrody/media-sdk-build.ts" ||
        plan.buildRecipe.sourcePins !== "scripts/aphrody/media-sdk-sources.json" ||
        !/^[a-f0-9]{40}$/.test(plan.sourceRevision ?? ""))
    )
      missing.push(
        `scripts/aphrody/media-sdk-factory.ts: pinned ${index === 0 ? "ffmpeg" : "mpv"} SDK recipe or archive absent for ${selected.sdkTarget}`,
      );
  // The existing native asset plugins deliberately reject these platforms.
  if (component === "media" && target !== "windows-x64")
    missing.push("packages/bun-video native Sharp/Remotion library owner currently qualifies Windows x64 only");
  return missing;
}

function workerEnvironment(resources: NativeRuntimeResources = { jobs: 2, linkThreads: 2 }) {
  return {
    ...process.env,
    CARGO_BUILD_JOBS: String(resources.jobs),
    BUN_MEDIA_JOBS: String(resources.jobs),
    OMP_NUM_THREADS: String(resources.jobs),
    RUSTC_WRAPPER: undefined,
    CARGO_BUILD_RUSTC_WRAPPER: undefined,
    TYPESAFE_API_KEY: undefined,
    TYPESAFE_API_KEY_FILE: undefined,
    GH_TOKEN: undefined,
    GITHUB_TOKEN: undefined,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
  };
}

export async function command(
  argv: string[],
  cwd: string,
  log: string,
  options: {
    timeout?: number;
    env?: Record<string, string | undefined>;
    resources?: NativeRuntimeResources;
  } = {},
) {
  const ownerCommand = argv[0];
  const resources = options.resources ?? { jobs: 2, linkThreads: 2 };
  if (process.platform === "linux") {
    const taskset = Bun.which("taskset");
    if (!taskset) throw new Error("Native Linux CPU affinity owner is missing: util-linux taskset");
    argv = [
      taskset,
      "-c",
      nativeLinuxCPUs(await Bun.file("/proc/self/status").text(), Math.max(resources.jobs, resources.linkThreads)),
      ...argv,
    ];
  }
  const file = Bun.file(log).writer();
  const child = Bun.spawn(argv, {
    cwd,
    env: { ...workerEnvironment(resources), ...options.env },
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

async function preflight(input: WorkerInput, component: "media" | "runtime" = "media") {
  const target = mediaReleaseTarget(input.target);
  const diagnostics = join(input.output, "diagnostics");
  await mkdir(diagnostics, { recursive: true });
  if (process.platform !== target.platform || process.arch !== target.runtimeArch)
    throw new Error(`Runner cannot execute native ${input.target}; emulation and cross tests are insufficient`);
  await sourceIdentity(input, diagnostics);
  const disk = await statfs(input.output);
  const capacity = nativeCapacity(
    {
      freeDisk: disk.bavail * disk.bsize,
      freeMemory: await nativeAvailableMemory(),
      cpus: availableParallelism(),
    },
    nativeRuntimeResources(),
  );
  const missing = nativeOwnerPrerequisites(input.target, undefined, component);
  const observation = {
    schema: 1,
    component,
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
  const sdkTarget = target.sdkTarget as MediaSDKTarget;
  let inputs: NativeMediaInputs;
  if (process.env.BUN_MEDIA_SDK_INPUTS) {
    inputs = await readNativeMediaInputs(
      process.env.BUN_MEDIA_SDK_INPUTS,
      process.env.BUN_MEDIA_SDK_INPUTS_SHA256 ?? "",
      sdkTarget,
    );
  } else {
    inputs = { schema: 1, target: sdkTarget, components: {} as NativeMediaInputs["components"] };
    for (const component of ["ffmpeg", "mpv"] as const) {
      const descriptor = mediaSDKPlan(component, sdkTarget);
      if (descriptor.assets.length !== 1)
        throw new Error(
          `Explicit ${component} SDK source/prefix/archive input required via BUN_MEDIA_SDK_INPUTS + BUN_MEDIA_SDK_INPUTS_SHA256; source recipes need no prior publication`,
        );
      const archives = await downloadMediaSDK(component, sdkTarget, join(input.output, "downloads"));
      const asset = descriptor.assets[0]!;
      inputs.components[component] = { kind: "archive", path: archives[0]!, sha256: asset.sha256, bytes: asset.bytes };
    }
  }
  return prepareNativeMedia(inputs, input.root, input.output, diagnostics);
}

async function requireAVIO(prefix: string, input: WorkerInput) {
  const target = mediaReleaseTarget(input.target);
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
}

export function nativeRuntimeRegressionPlan(runtime: string) {
  return {
    command: [
      runtime,
      "--no-env-file",
      "test",
      "--max-concurrency=2",
      "./test/js/bun/vector-index.test.ts",
      "./test/js/bun/curl-aws-sigv4.test.ts",
      "./test/internal/browser-cli.test.ts",
      "./test/cli/search.test.ts",
      "./test/js/bun/yolo/yolo.test.ts",
      "./test/cli/vpn/vpn.test.ts",
      "./test/cli/check/declarations.test.ts",
      "./packages/bun-agent-plugin/src/input-files.test.ts",
    ],
    env: { BUN_TEST_REQUIRE_SEARCH: "1", BUN_TEST_REQUIRE_VECTOR_INDEX: "1", BUN_TEST_REQUIRE_CURL: "1" },
    qualityCommand: [
      runtime,
      "--no-env-file",
      "test",
      "./test/cli/lint/toolchain.test.ts",
      "--test-name-pattern",
      "tracked.*aphrody",
    ],
  };
}

export function nativeRuntimeArtifactPlan(buildDir: string, targetName: string, component: "runtime" | "media") {
  const target = mediaReleaseTarget(targetName);
  const stripped = component === "runtime" && (target.os === "windows" || target.abi === "gnu");
  const executable = (stripped ? "bun" : "bun-profile") + (target.os === "windows" ? ".exe" : "");
  return {
    buildTarget: executable,
    executable: join(buildDir, executable),
    profile: join(buildDir, "bun-profile" + (target.os === "windows" ? ".exe" : "")),
    profileSpec: join(buildDir, "bun-profile.verify.json"),
    strippedELF: stripped && target.os === "linux",
  };
}

export async function assertRuntimeArtifactAbsent(products: string, asset: string) {
  if (!isAbsolute(products) || !/^bun-[a-z0-9-]+-runtime-full$/.test(asset))
    throw new Error("Invalid immutable runtime output");
  for (const name of [asset, `${asset}.zip`, `${asset}.qualification.json`]) {
    try {
      await lstat(join(products, name));
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") continue;
      throw error;
    }
    throw new Error("Immutable runtime artifact already exists");
  }
}

async function packageNativeRuntime(
  input: WorkerInput,
  runtime: string,
  prefix: string,
  diagnostics: string,
  provenance: NativeRuntimeFullReceipt["provenance"],
) {
  const target = mediaReleaseTarget(input.target),
    asset = runtimeFullAsset(input.target);
  const products = join(input.output, "products");
  await mkdir(products, { recursive: true });
  await assertRuntimeArtifactAbsent(products, asset);
  const directory = join(products, asset);
  await mkdir(directory);
  const runtimeName = target.os === "windows" ? "bun.exe" : "bun";
  const builtRuntime = runtime;
  const expectedRuntimeHash = await hashSDKFile(builtRuntime);
  runtime = join(directory, runtimeName);
  await Bun.write(runtime, Bun.file(builtRuntime));
  if ((await hashSDKFile(runtime)) !== expectedRuntimeHash) throw new Error("Runtime changed while staging");
  if (target.os !== "windows") await chmod(runtime, 0o755);
  await Bun.write(join(directory, "LICENSE.md"), Bun.file(join(input.root, "LICENSE.md")));
  await stageMediaBundle(directory, { apply: true, prefix, target: target.sdkTarget });
  await Bun.write(
    join(directory, "release-flavor.json"),
    JSON.stringify(runtimeFlavorManifest(target, input.source), null, 2) + "\n",
  );
  const gates: NativeRuntimeFullReceipt["gates"] = [];
  const gate = async (
    id: string,
    argv: string[],
    options: { cwd?: string; env?: Record<string, string | undefined> } = {},
  ) => {
    const log = `${asset}-${id}.log`;
    const result = await command(argv, options.cwd ?? input.root, join(products, log), {
      timeout: 300_000,
      env: { ...options.env, BUN_TEST_BOOTSTRAP_RELEASE_PATH: runtime, BUN_EXECUTABLE: runtime },
    });
    if (argv.includes("test") && (!/\b[1-9]\d* pass\b/.test(result.stderr) || !/\b0 fail\b/.test(result.stderr)))
      throw new Error(`Runtime test gate executed no passing tests: ${id}`);
    gates.push({ id, passed: true, log, sha256: await hashSDKFile(join(products, log)) });
    return id === "native-update" ? result.stdout + result.stderr : result.stdout;
  };
  for (const id of ["runtime-closure"]) {
    const log = `${asset}-${id}.log`;
    await Bun.write(join(products, log), Bun.file(join(diagnostics, `${id}.log`)));
    gates.push({ id, passed: true, log, sha256: await hashSDKFile(join(products, log)) });
  }
  const stagedIdentity = JSON.parse(
    await gate("runtime-identity", [
      runtime,
      "--no-env-file",
      "-e",
      "console.log(JSON.stringify({version:Bun.version,revision:Bun.revision,platform:process.platform,arch:process.arch,sourceUrl:process.release.sourceUrl}))",
    ]),
  );
  assertMediaRuntimeIdentity(stagedIdentity, input.source, input.target, input.version);
  if (!Bun.deepEquals(stagedIdentity, provenance)) throw new Error("Staged runtime provenance changed");
  const presence = await gate("runtime-features", [
    runtime,
    "--no-env-file",
    "-e",
    "if(!Bun.Curl?.available||!Bun.Crawl?.available||!Bun.VectorIndex?.available||!Bun.Video?.available)throw Error('Required native runtime provider unavailable');console.log('native providers available')",
  ]);
  if (presence.trim() !== "native providers available") throw new Error("Runtime provider gate did not execute");
  const applet = await gate("runtime-coreutils", [
    runtime,
    "--no-env-file",
    "-e",
    'const first="native applet"+String.fromCharCode(10);const r=Bun.spawnSync({cmd:[process.execPath,"-n","1"],argv0:"head",stdin:new TextEncoder().encode(first+"second"+String.fromCharCode(10)),stdout:"pipe",stderr:"pipe"});if(r.exitCode!==0||r.stdout.toString()!==first||r.stderr.length)throw Error("Native coreutils unavailable");console.log("native coreutils available")',
  ]);
  if (applet.trim() !== "native coreutils available") throw new Error("Runtime coreutils gate did not execute");
  const regressions = nativeRuntimeRegressionPlan(runtime);
  await gate("runtime-feature-regressions", regressions.command, { env: regressions.env });
  await gate("runtime-quality-guards", regressions.qualityCommand);
  await gate("runtime-regressions", [
    runtime,
    "--no-env-file",
    "test",
    "--max-concurrency=2",
    "./test/js/bun/image/image.test.ts",
    "./test/js/bun/video/video.test.ts",
    "./test/js/bun/yolo/yolo.test.ts",
    "./test/js/bun/sqlite/sqlite.test.js",
  ]);
  const files: NativeRuntimeFullReceipt["files"] = {};
  for await (const member of new Bun.Glob("**/*").scan({ cwd: directory, onlyFiles: true, dot: true })) {
    files[member] = {
      bytes: Bun.file(join(directory, member)).size,
      sha256: await hashSDKFile(join(directory, member)),
      mode: target.os === "windows" ? 0o644 : (await stat(join(directory, member))).mode & 0o777,
    };
  }
  const sdk = (["ffmpeg", "mpv"] as const).map(component =>
    mediaSDKPlan(component, target.sdkTarget as MediaSDKTarget),
  );
  const manifest: Omit<NativeRuntimeFullReceipt, "archive" | "gates"> = {
    schema: 1,
    kind: "bun-runtime-full-release",
    source: input.source,
    version: input.version,
    target: input.target,
    triplet: target.triplet,
    native: true,
    passed: true,
    execution: "native",
    platform: process.platform,
    arch: process.arch,
    provenance,
    compiledFeatures: fullNativeRuntimeFeatures,
    components: runtimeFullComponents,
    allComponentsQualified: false,
    runtimeSHA256: files[runtimeName]!.sha256,
    sdkSources: { ffmpeg: sdk[0]!.sourceRevision!, mpv: sdk[1]!.sourceRevision! },
    files,
  };
  await Bun.write(join(directory, "bun-runtime-full-release.json"), JSON.stringify(manifest, null, 2) + "\n");
  const archive = join(products, `${asset}.zip`);
  await archiveMediaReleaseFiles(directory, archive, [...Object.keys(files), "bun-runtime-full-release.json"], {
    triplet: target.triplet,
    runtime: { executable: runtime, source: input.source, version: input.version, target: input.target },
    modes: Object.fromEntries(Object.entries(files).map(([name, file]) => [name, file.mode ?? 0o644])),
  });
  const scratch = join(input.output, "runtime-install-qualification");
  await mkdir(scratch);
  const install = { ...input, scratch, runtime, archive, run: gate };
  await qualifyNativeInstall(install);
  if (target.os === "windows") await qualifyNativeWinget(install);
  await sourceIdentity(input, diagnostics);
  const receipt: NativeRuntimeFullReceipt = {
    ...manifest,
    gates,
    archive: { name: `${asset}.zip`, bytes: Bun.file(archive).size, sha256: await hashSDKFile(archive) },
  };
  await Bun.write(join(products, `${asset}.qualification.json`), JSON.stringify(receipt, null, 2) + "\n");
  const qualified = await aggregateRuntimeFullRelease(products, input.source, input.version, [input.target]);
  await Bun.write(join(products, "runtime-full-qualification.json"), JSON.stringify(qualified, null, 2) + "\n");
}

/** Release asset of a plugin, as `plugin_command.rs` (`asset_name`) looks it up: `bun-<name>-<target>[.exe]`. */
export function nativePluginAssets(targetName: string) {
  const target = mediaReleaseTarget(targetName);
  const exe = target.os === "windows" ? ".exe" : "";
  return plugins.map(plugin => ({
    built: `bun-${plugin.name}${exe}`,
    asset: `bun-${plugin.name}-${targetName}${exe}`,
  }));
}

/** Copy every built plugin beside its release asset name; the publisher checksums them into SHA256SUMS.txt. */
export async function stageNativePlugins(buildDir: string, targetName: string, output: string) {
  await mkdir(output, { recursive: true });
  for (const { built, asset } of nativePluginAssets(targetName)) {
    const file = Bun.file(join(buildDir, built));
    if (!file.size) throw new Error(`Plugin executable absent: ${built}`);
    await Bun.write(join(output, asset), file);
    await chmod(join(output, asset), 0o755);
  }
}

/** Shared core build owner; SDK packaging runs only after this candidate exists. */
export async function prepareNativeRuntimeCore(
  input: WorkerInput,
  diagnostics: string,
  component: "media" | "runtime" = "media",
) {
  const target = mediaReleaseTarget(input.target);
  if (mediaSDKHostTarget() !== target.sdkTarget) throw new Error("Native core requires its actual target host ABI");
  const resources = nativeRuntimeResources();
  const logicalBuildDir = join(input.root, "build/release");
  const buildDir = await nativeRuntimeBuildDirectory(input.root);
  const sysroot =
    target.os === "linux"
      ? (target.abi === "musl" ? locations.muslSysroot : locations.glibcSysroot)[target.arch]
      : undefined;
  const run = async (id: string, argv: string[]) =>
    command(argv, input.root, join(diagnostics, id + ".log"), { timeout: 120_000 });
  if ((await nativeRuntimeBuildDirectory(input.root)) !== buildDir)
    throw Error("Native runtime build directory changed");
  const buildFlags = nativeRuntimeBuildFlags(target, sysroot, {
    ...resources,
    ...(buildDir !== logicalBuildDir ? { buildDir } : {}),
  });
  await Bun.write(
    join(diagnostics, "runtime-build-layout.json"),
    JSON.stringify(
      {
        schema: 1,
        source: input.source,
        sourceRoot: input.root,
        logicalBuildDir,
        physicalBuildDir: buildDir,
        resources,
        buildFlags,
      },
      null,
      2,
    ) + "\n",
  );
  const artifact = nativeRuntimeArtifactPlan(buildDir, input.target, component);
  // bun bd owns its build lock; its build is intentionally not terminated by a command timeout.
  await command(
    [process.execPath, "--no-env-file", "bd", ...buildFlags, `--target=${artifact.buildTarget}`],
    input.root,
    join(diagnostics, "runtime-build.log"),
    {
      resources,
      env: { GIT_SHA: input.source, CARGO_BUILD_JOBS: String(resources.jobs), OMP_NUM_THREADS: String(resources.jobs) },
    },
  );
  const runtime = artifact.executable;
  const identity = JSON.parse(
    (
      await run("runtime-identity", [
        runtime,
        "--no-env-file",
        "-e",
        "console.log(JSON.stringify({version:Bun.version,revision:Bun.revision,platform:process.platform,arch:process.arch,sourceUrl:process.release.sourceUrl}))",
      ])
    ).stdout,
  );
  assertMediaRuntimeIdentity(identity, input.source, input.target, input.version);
  await command(
    [process.execPath, "--no-env-file", "bd", ...buildFlags, "--target=plugins"],
    input.root,
    join(diagnostics, "plugins-build.log"),
    {
      resources,
      env: { GIT_SHA: input.source, CARGO_BUILD_JOBS: String(resources.jobs), OMP_NUM_THREADS: String(resources.jobs) },
    },
  );
  await stageNativePlugins(buildDir, input.target, join(input.output, "plugins"));
  return { artifact, runtime, identity, buildDir };
}

export function nativeRuntimeProtocPlan(target: string, hostArch = process.arch) {
  return mediaReleaseTarget(target).os === "windows" ? windowsProtocPlan(pins.protoc, hostArch) : undefined;
}

async function prepareNativeRuntimeToolchain(input: WorkerInput, diagnostics: string) {
  const target = mediaReleaseTarget(input.target);
  const run = async (id: string, argv: string[], timeout = 120_000) =>
    command(argv, input.root, join(diagnostics, id + ".log"), { timeout });
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
  const series = (version: string) => version.split(".").slice(0, 2).join(".");
  // The pinned release series (apt.llvm.org ships the newest patch of it), as findLlvmTool accepts.
  if (series(toolchain.version) !== series(pins.llvm.version))
    throw new Error(`LLVM must match source pin series ${series(pins.llvm.version)}.x (${pins.llvm.version})`);
  process.env.BUN_TOOLCHAIN_LLVM = dirname(dirname(toolchain.cc));
  // setup.ts installs rustup into CARGO_HOME; a container image has no login profile that puts it on PATH.
  const cargoBin = join(process.env.CARGO_HOME ?? join(homedir(), ".cargo"), "bin");
  if (existsSync(cargoBin) && !(process.env.PATH ?? "").split(delimiter).includes(cargoBin))
    process.env.PATH = cargoBin + delimiter + (process.env.PATH ?? "");
  const rust = (await run("rust-pin", ["rustup", "show", "active-toolchain"])).stdout;
  if (!rust.startsWith(pins.rust.channel)) throw new Error("Rust toolchain differs from committed pin");
  const protocPlan = nativeRuntimeProtocPlan(input.target);
  if (protocPlan) {
    const protoc = await windowsProtocInstallation(protocPlan);
    if (!protoc) throw Error(`Pinned host libprotoc ${protocPlan.version} is unavailable after setup`);
    process.env.PROTOC = protoc.executable;
    process.env.PROTOC_INCLUDE = protoc.include;
    const version = (await run("protoc-pin", [protoc.executable, "--version"])).stdout.trim();
    if (version !== `libprotoc ${protoc.version}`) throw Error("Host protoc version changed after setup");
    await Bun.write(
      join(diagnostics, "protoc-pin.json"),
      JSON.stringify(
        {
          schema: 1,
          target: input.target,
          hostArch: process.arch,
          binaryArch: protocPlan.binaryArch,
          ...protoc,
          source: protocPlan.source,
          nativeReleaseQualified: false,
        },
        null,
        2,
      ) + "\n",
    );
  }
  return toolchain;
}

async function produce(input: WorkerInput, component: "media" | "runtime" = "media") {
  const diagnostics = await preflight(input, component);
  const target = mediaReleaseTarget(input.target);
  const resources = nativeRuntimeResources();
  if (target.abi === "musl" && !mediaSDKHostTarget().endsWith("-musl")) {
    if (resources.jobs !== 2 || resources.linkThreads !== 2)
      throw Error("Explicit runtime budget requires a native runner; musl container retains its two-CPU allocation");
    return produceMusl(input, diagnostics, component);
  }
  if (mediaSDKHostTarget() !== target.sdkTarget) throw new Error("Native producer ABI differs from requested target");
  const run = async (id: string, argv: string[], timeout = 120_000, cwd = input.root) =>
    command(argv, cwd, join(diagnostics, `${id}.log`), { timeout });
  const toolchain = await prepareNativeRuntimeToolchain(input, diagnostics);
  const prefix = await sdkPrefix(input, diagnostics);
  await requireAVIO(prefix, input);
  if (!(await Bun.file(join(diagnostics, "avio-qualification.json")).exists()))
    await qualifyNativeMediaAVIO(target.sdkTarget as MediaSDKTarget, input.root, prefix, diagnostics);
  process.env.BUN_MEDIA_PREFIX = prefix;
  await run("curl-source", [process.execPath, "--no-env-file", "scripts/aphrody/curl-source.ts"], 300_000);
  const sysroot =
    target.os === "linux"
      ? (target.abi === "musl" ? locations.muslSysroot : locations.glibcSysroot)[target.arch]
      : undefined;
  if (sysroot && !(await Bun.file(join(sysroot, "usr/include/stdio.h")).exists()))
    throw new Error(`Pinned target sysroot missing: ${sysroot}; scripts/build/ci-images/spec.ts owns its provisioning`);
  const { artifact, runtime, identity } = await prepareNativeRuntimeCore(input, diagnostics, component);
  let spec = artifact.profileSpec;
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
  if (artifact.strippedELF) {
    const subject = strippedELFVerificationSpec(spec, runtime);
    spec = join(diagnostics, "runtime-stripped.verify.json");
    await Bun.write(spec, JSON.stringify(subject, null, 2) + "\n");
  } else if (runtime !== artifact.profile) {
    if ((await hashSDKFile(runtime)) !== (await hashSDKFile(artifact.profile)))
      throw new Error("Canonical Windows runtime copy differs from its profile");
    spec = join(diagnostics, "runtime-copy.verify.json");
    await Bun.write(spec, JSON.stringify({ ...expectations, exe: runtime, name: "bun" }, null, 2) + "\n");
  }
  await run("runtime-closure", [
    process.execPath,
    "--no-env-file",
    "scripts/build/verify-binary.ts",
    artifact.strippedELF ? "stripped-elf" : "binary",
    spec,
  ]);
  if (component === "runtime") return packageNativeRuntime(input, runtime, prefix, diagnostics, identity);
  const sdkRoot = join(input.root, "packages/bun-runtime-sdk");
  let runtimeSDKArtifact: string;
  if (target.sdkTarget === "linux-x64") {
    if (!process.env.BUN_MEDIA_SDK_INPUTS)
      throw new Error(
        "Portable GNU x64 runtime SDK requires the explicit canonical AVIO build owner; host linking is insufficient",
      );
    const inputs = await readNativeMediaInputs(
      process.env.BUN_MEDIA_SDK_INPUTS,
      process.env.BUN_MEDIA_SDK_INPUTS_SHA256 ?? "",
      "linux-x64",
    );
    if (!inputs.avio) throw new Error("Portable GNU x64 runtime SDK requires the canonical AVIO build receipt/object");
    runtimeSDKArtifact = dirname(
      (
        await buildGNUX64RuntimeSDK({ ...inputs.avio.input, prefix }, join(input.output, "runtime-sdk-build"), {
          path: join(diagnostics, "avio-qualification.json"),
          sha256: await hashSDKFile(join(diagnostics, "avio-qualification.json")),
        })
      ).staged,
    );
  } else {
    const sdkTarget = mediaBuildTarget(target.sdkTarget as MediaSDKTarget).rust;
    await run("runtime-sdk-build", runtimeSDKCargoArgs(input.root, sdkTarget, 2), 1_800_000, sdkRoot);
    const sdkBuiltLibrary = join(
      sdkRoot,
      "target",
      sdkTarget,
      "runtime",
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
    runtimeSDKArtifact = dirname(stagedSDK.stdout.trim());
  }
  const sdkArtifactManifest = await Bun.file(join(runtimeSDKArtifact, "manifest.json")).json();
  const sdkLibraries = Object.keys(sdkArtifactManifest.files).filter(name => /\.(?:dll|so|dylib)$/.test(name));
  if (sdkLibraries.length !== 1) throw new Error("Runtime SDK artifact must own exactly one native module");
  const sdkLibrary = join(runtimeSDKArtifact, sdkLibraries[0]!);
  const sdkClosureDirectory = join(input.output, "runtime-sdk-closure");
  await mkdir(join(sdkClosureDirectory, target.os === "windows" ? "bin" : "lib"), { recursive: true });
  await Bun.write(
    join(sdkClosureDirectory, target.os === "windows" ? "bin" : "lib", sdkLibraries[0]!),
    Bun.file(sdkLibrary),
  );
  const sdkClosure = await qualifyMediaSDKClosure(target.sdkTarget as MediaSDKTarget, sdkClosureDirectory);
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
  const nginxRecipe = nativeNginxRecipe(input.target);
  await run("nginx-source", [runtime, "--no-env-file", "packages/bun-nginx/scripts/prepare-sources.ts"], 300_000);
  if (sysroot !== "/opt/linux-sysroot-glibc" || dirname(toolchain.cc) !== "/usr/lib/llvm-23/bin")
    throw new Error(
      "packages/bun-nginx/scripts/portable-sdk.ts requires its proven focal sysroot and LLVM owner paths",
    );
  const nginxZlib = process.env.BUN_NGINX_ZLIB_PREFIX ?? prefix;
  for (const name of ["lib/libz.a", "include/zlib.h", "include/zconf.h", "share/licenses/zlib-rs/LICENSE"])
    if (!(await Bun.file(join(nginxZlib, name)).exists()))
      throw new Error(`Canonical NGINX zlib SDK prerequisite absent: ${name}; supply the qualified SDK owner prefix`);
  const nginxOwner = join(input.root, "build/native-ci-nginx", input.target);
  await command(["bash", join(input.root, nginxRecipe)], input.root, join(diagnostics, "nginx-build.log"), {
    timeout: 3_600_000,
    env: {
      GIT_SHA: input.source,
      BUN_NGINX_OUTPUT: nginxOwner,
      BUN_NGINX_RUNTIME: runtime,
      BUN_NGINX_SYSROOT: sysroot,
      BUN_NGINX_LLVM_BIN: dirname(toolchain.cc),
      BUN_NGINX_ZLIB_PREFIX: nginxZlib,
      BUN_NGINX_HEAVY_LOCK: process.env.BUN_NGINX_HEAVY_LOCK ?? join(input.root, "build/locks/heavy.lock"),
      BUN_NGINX_CPUS: nativeLinuxCPUs(await Bun.file("/proc/self/status").text()),
    },
  });
  const nginxExecutable = join(nginxOwner, "objects/nginx");
  const nginxModuleReceipt = join(nginxOwner, "module-qualification.json");
  await gate("native-nginx-controller", [runtime, "--no-env-file", "test", "./test/js/bun/nginx/test.ts"], {
    env: { BUN_NGINX_TEST_BINARY: nginxExecutable },
  });
  await gate("native-nginx-module", [
    runtime,
    "--no-env-file",
    "packages/bun-nginx/scripts/qualify-module.ts",
    join(nginxOwner, "build-receipt.json"),
    nginxModuleReceipt,
    join(nginxOwner, "objects/ngx_bun_runtime/ngx-release/libngx_http_bun_module.so"),
  ]);
  const elf = async (argument: string) =>
    (await run(`nginx-elf-${argument.slice(2)}`, ["llvm-readelf", argument, nginxExecutable])).stdout;
  const nginxClosure = qualifyMediaELFs("linux-x64", [
    {
      file: "bin/nginx",
      sha256: await hashSDKFile(nginxExecutable),
      header: await elf("--file-header"),
      dynamic: await elf("--dynamic-table"),
      versions: await elf("--version-info"),
      programHeaders: await elf("--program-headers"),
    },
  ]);
  await gate("native-nginx-closure", [
    runtime,
    "--no-env-file",
    "-e",
    "console.log(JSON.stringify(JSON.parse(process.argv[1])))",
    JSON.stringify(nginxClosure),
  ]);
  const nginxArtifact = join(input.output, "nginx-sdk");
  await mkdir(nginxArtifact, { recursive: false });
  const nginxFiles: NginxReleaseManifest["files"] = {};
  const nginxAdd = async (name: string, path: string) => {
    const destination = join(nginxArtifact, name);
    await mkdir(dirname(destination), { recursive: true });
    await Bun.write(destination, Bun.file(path));
    nginxFiles[name] = { bytes: Bun.file(destination).size, sha256: await hashSDKFile(destination) };
  };
  await nginxAdd("bin/nginx", nginxExecutable);
  await chmod(join(nginxArtifact, "bin/nginx"), 0o755);
  await nginxAdd("receipts/build-receipt.json", join(nginxOwner, "build-receipt.json"));
  await nginxAdd("receipts/module-qualification.json", nginxModuleReceipt);
  const closurePath = join(nginxOwner, "closure.json");
  await Bun.write(closurePath, JSON.stringify(nginxClosure, null, 2) + "\n");
  await nginxAdd("receipts/closure.json", closurePath);
  const sourcePins = await Bun.file(join(input.root, "packages/bun-nginx/native/sources.json")).json();
  for (const [component, pin] of Object.entries(sourcePins) as [
    string,
    { path?: string; revision?: string; licensePath?: string },
  ][]) {
    if (!pin.path || !pin.revision || !pin.licensePath) continue;
    await nginxAdd(`share/licenses/${component}/LICENSE`, join(input.root, pin.licensePath));
    const archive = join(nginxArtifact, `sources/${component}.tar`);
    await mkdir(dirname(archive), { recursive: true });
    await run(`nginx-source-${component}`, [
      "git",
      "-C",
      join(input.root, pin.path),
      "archive",
      "--format=tar",
      `--output=${archive}`,
      pin.revision,
    ]);
    nginxFiles[`sources/${component}.tar`] = { bytes: Bun.file(archive).size, sha256: await hashSDKFile(archive) };
  }
  for (const [name, path] of [
    ["boringssl/LICENSE", join(nginxOwner, "dependencies/prefix/share/licenses/boringssl/LICENSE")],
    ["pcre2/copyright", join(nginxOwner, "dependencies/prefix/usr/share/doc/libpcre2-dev/copyright")],
    ["zlib-rs/LICENSE", join(nginxZlib, "share/licenses/zlib-rs/LICENSE")],
    ["gcc-runtime/copyright", join(sysroot!, "usr/share/doc/gcc-13-base/copyright")],
    ["libcrypt/copyright", join(sysroot!, "usr/share/doc/libcrypt1/copyright")],
  ] as const)
    await nginxAdd(`share/licenses/${name}`, path);
  const nginxManifest: NginxReleaseManifest = {
    schema: 1,
    kind: "bun-nginx-native-sdk",
    source: input.source,
    sourceDirty: false,
    target: input.target,
    platform: process.platform,
    arch: process.arch,
    executable: "bin/nginx",
    files: nginxFiles,
  };
  await Bun.write(join(nginxArtifact, "nginx-sdk.json"), JSON.stringify(nginxManifest, null, 2) + "\n");
  await readNginxReleaseArtifact(nginxArtifact, {
    source: input.source,
    target: input.target,
    platform: process.platform,
    arch: process.arch,
  });
  await gate("runtime-regressions", [
    runtime,
    "--no-env-file",
    "test",
    "--max-concurrency=2",
    "./test/js/bun/image/image.test.ts",
    "./test/js/bun/video/video.test.ts",
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
  const closure = await qualifyMediaSDKClosure(target.sdkTarget as MediaSDKTarget, prefix);
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
    nginxArtifact,
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

async function produceMusl(input: WorkerInput, diagnostics: string, component: "media" | "runtime" = "media") {
  const allocation = nativeFullReleasePlan(input.source).targets.find(target => target.target === input.target)!;
  const bootstrap = allocation.bootstrap;
  const response = await fetch(bootstrap.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || Number(response.headers.get("content-length")) !== bootstrap.bytes)
    throw new Error("Pinned native musl bootstrap could not be fetched at its exact size");
  const archive = join(input.output, "musl-bootstrap.zip");
  await Bun.write(archive, response);
  if (Bun.file(archive).size !== bootstrap.bytes || (await hashSDKFile(archive)) !== bootstrap.sha256)
    throw new Error("Native musl bootstrap checksum differs");
  const binary = join(input.output, "musl-bin", "bun");
  await mkdir(dirname(binary), { recursive: true });
  // The host bootstrap may predate zip support in Bun.Archive; unzip is on every runner.
  const extracted = join(input.output, "musl-bootstrap");
  await command(
    ["unzip", "-o", "-q", archive, "-d", extracted],
    input.root,
    join(diagnostics, "native-musl-unzip.log"),
  );
  const member = Bun.file(join(extracted, `bun-${input.target}`, "bun"));
  if (!(await member.exists())) throw new Error("Pinned musl bootstrap has no matching native Bun member");
  await Bun.write(binary, member);
  await chmod(binary, 0o755);
  const script = [
    "set -eu",
    'export PATH="$(dirname "$BUN_BOOTSTRAP"):$PATH"',
    "apk add --no-cache bash git curl unzip tar xz build-base cmake pkgconf linux-headers sudo util-linux",
    `git config --global --add safe.directory '${input.root.replaceAll("'", "'\\''")}'`,
    `"$BUN_BOOTSTRAP" -e 'if(process.arch!==${JSON.stringify(allocation.arch)}||Bun.revision!==${JSON.stringify(bootstrap.source)}||Bun.version!==${JSON.stringify(bootstrap.tag.replace("aphrody-v", "").split("-")[0])})throw new Error("Native musl bootstrap identity differs")'`,
    `exec "$BUN_BOOTSTRAP" --no-env-file scripts/aphrody/release-native-worker.ts ${component === "runtime" ? "produce-runtime" : "produce"} "$NATIVE_TARGET" "$NATIVE_SOURCE" "$NATIVE_VERSION" "$NATIVE_OUTPUT"`,
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

/** This proves executed native capabilities, rather than accepting API names as qualification. */
export const nativeBootstrapProbe = `
import {dlopen, ptr} from 'bun:ffi';
const bytes=await new Bun.Archive({'probe.txt':'native-sdk-bootstrap'}, {format:'zip',mtime:0}).bytes();
if(bytes[0]!==0x50||bytes[1]!==0x4b||bytes[2]!==3||bytes[3]!==4)throw Error('Candidate ZIP writer is unavailable');
const files=await new Bun.Archive(bytes).files();
if(files.size!==1||await files.get('probe.txt')?.text()!=='native-sdk-bootstrap')throw Error('Candidate ZIP readback differs');
let ffi;
if(process.platform==='win32'){
  ffi=dlopen('kernel32.dll',{GetCurrentProcessId:{args:[],returns:'u32'}});
  try{if(ffi.symbols.GetCurrentProcessId()!==process.pid)throw Error('Native FFI process identity differs');}finally{ffi.close();}
}else{
  ffi=dlopen(process.platform==='darwin'?'/usr/lib/libSystem.B.dylib':'libc.so.6',{strlen:{args:['ptr'],returns:'usize'}});
  const text=Buffer.from('native-ffi\\0');
  try{if(Number(ffi.symbols.strlen(ptr(text)))!==10)throw Error('Native FFI readback differs');}finally{ffi.close();}
}
console.log(JSON.stringify({zip:true,ffi:true,revision:Bun.revision,platform:process.platform,arch:process.arch}));
`;

export async function qualifyNativeBootstrapCandidate(
  input: {
    runtime: string;
    sha256: string;
    source: string;
    target: string;
    root: string;
    diagnostics: string;
  },
  run: typeof command = command,
) {
  if (
    !isAbsolute(input.runtime) ||
    !/^[a-f0-9]{64}$/.test(input.sha256) ||
    (await hashSDKFile(input.runtime)) !== input.sha256
  )
    throw new Error("Native bootstrap candidate differs from its immutable pin");
  const target = mediaReleaseTarget(input.target);
  const result = await run(
    [input.runtime, "--no-env-file", "-e", nativeBootstrapProbe],
    input.root,
    join(input.diagnostics, "bootstrap-capabilities.log"),
    { timeout: 120_000 },
  );
  const observed = JSON.parse(result.stdout);
  if (
    observed.zip !== true ||
    observed.ffi !== true ||
    observed.revision !== input.source ||
    observed.platform !== target.platform ||
    observed.arch !== target.runtimeArch ||
    (await hashSDKFile(input.runtime)) !== input.sha256
  )
    throw new Error("Native bootstrap capability readback differs from the source candidate");
  const receipt = {
    schema: 1,
    source: input.source,
    target: input.target,
    runtimeSHA256: input.sha256,
    zip: true,
    ffi: true,
    nativeReleaseQualified: false,
  };
  await Bun.write(join(input.diagnostics, "bootstrap-capabilities.json"), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}

export function nativeMediaSourceArchivePin(env: Record<string, string | undefined>) {
  const url = new URL(env.BUN_MEDIA_SOURCE_ARCHIVE_URL ?? "https://invalid.invalid/");
  const sha256 = env.BUN_MEDIA_SOURCE_ARCHIVE_SHA256 ?? "";
  const bytes = Number(env.BUN_MEDIA_SOURCE_ARCHIVE_BYTES);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      (url.origin === "https://bun-lib.aphrody.app" && url.pathname.startsWith("/media/sources/")) ||
      (url.origin === "https://github.com" && url.pathname.startsWith("/aphrody-labs/bun/releases/download/"))
    ) ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    !Number.isSafeInteger(bytes) ||
    bytes < 1 ||
    bytes > 512 * 1024 ** 2
  )
    throw new Error("Media bootstrap requires an owned source archive URL and exact SHA256/byte pins");
  return { url: url.href, sha256, bytes };
}

async function bootstrapWorkerMedia(input: WorkerInput) {
  const target = mediaReleaseTarget(input.target);
  if (mediaSDKHostTarget() !== target.sdkTarget) throw new Error("SDK bootstrap must execute on its native target ABI");
  const diagnostics = join(input.output, "diagnostics");
  await mkdir(diagnostics, { recursive: true });
  await sourceIdentity(input, diagnostics);
  const preparation = await Bun.file(join(diagnostics, "core-preparation.json")).json();
  const runtime = await realpath(process.execPath);
  if (
    preparation.source !== input.source ||
    preparation.target !== input.target ||
    preparation.nativeReleaseQualified !== false ||
    (await realpath(preparation.runtime)) !== runtime ||
    (await hashSDKFile(runtime)) !== preparation.runtimeSHA256 ||
    preparation.buildDir !== (await nativeRuntimeBuildDirectory(input.root))
  )
    throw new Error("SDK bootstrap is not running under its pinned source candidate");
  await qualifyNativeBootstrapCandidate({
    runtime,
    sha256: preparation.runtimeSHA256,
    source: input.source,
    target: input.target,
    root: input.root,
    diagnostics,
  });
  await prepareNativeRuntimeToolchain(input, diagnostics);
  const pin = nativeMediaSourceArchivePin(process.env);
  const archive = join(input.output, "media-sources.tar.gz");
  await downloadWithRetry(pin.url, archive, "native-media-sources", undefined, undefined, pin);
  const snapshot = await materializeMediaSources({
    ...pin,
    archive,
    output: join(input.output, "media-source-snapshot"),
  });
  process.env.BUN_MEDIA_VULKAN_HEADERS = snapshot.include;
  process.env.BUN_MEDIA_VULKAN_LICENSE = snapshot.notice;
  const result = await bootstrapNativeMediaInputs({
    root: input.root,
    sources: snapshot.sources,
    output: join(input.output, "media-bootstrap"),
    target: target.sdkTarget as MediaSDKTarget,
  });
  if ((await hashSDKFile(runtime)) !== preparation.runtimeSHA256)
    throw new Error("Candidate changed during SDK bootstrap");
  await sourceIdentity(input, diagnostics);
  const receipt = {
    ...result,
    source: input.source,
    target: input.target,
    runtimeSHA256: preparation.runtimeSHA256,
    sourceArchiveSHA256: pin.sha256,
    sourceCatalogueSHA256: snapshot.catalogueSHA256,
    vulkanHeaders: snapshot.include,
    vulkanLicense: snapshot.notice,
    nativeReleaseQualified: false,
  };
  await Bun.write(join(diagnostics, "media-bootstrap.json"), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}

if (import.meta.main) {
  const [action, ...args] = Bun.argv.slice(2);
  const input = nativeWorkerInput(args);
  try {
    if (action === "preflight" || action === "preflight-runtime")
      await preflight(input, action === "preflight-runtime" ? "runtime" : "media");
    else if (action === "bootstrap-media") await bootstrapWorkerMedia(input);
    else if (action === "prepare-core") {
      const diagnostics = join(input.output, "diagnostics");
      await mkdir(diagnostics, { recursive: true });
      await sourceIdentity(input, diagnostics);
      await prepareNativeRuntimeToolchain(input, diagnostics);
      await command(
        [process.execPath, "--no-env-file", "scripts/aphrody/curl-source.ts"],
        input.root,
        join(diagnostics, "curl-source.log"),
        { timeout: 300_000 },
      );
      const result = await prepareNativeRuntimeCore(input, diagnostics);
      await Bun.write(
        join(diagnostics, "core-preparation.json"),
        JSON.stringify({
          schema: 1,
          source: input.source,
          target: input.target,
          runtime: result.runtime,
          runtimeSHA256: await hashSDKFile(result.runtime),
          buildDir: result.buildDir,
          nativeReleaseQualified: false,
        }) + "\n",
      );
    } else if (action === "prepare-media") {
      const diagnostics = join(input.output, "diagnostics");
      await mkdir(diagnostics, { recursive: true });
      await sourceIdentity(input, diagnostics);
      const prefix = await sdkPrefix(input, diagnostics);
      await Bun.write(
        join(diagnostics, "media-preparation.json"),
        JSON.stringify(
          {
            schema: 1,
            source: input.source,
            target: input.target,
            prefix,
            nativeReleaseQualified: false,
            archivePublished: false,
          },
          null,
          2,
        ) + "\n",
      );
    } else if (action === "produce" || action === "produce-runtime")
      await produce(input, action === "produce-runtime" ? "runtime" : "media");
    else
      throw new Error(
        "Usage: release-native-worker.ts preflight|preflight-runtime|prepare-core|bootstrap-media|prepare-media|produce|produce-runtime <target> <source-SHA> <version> <absolute-output>",
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
