import { mkdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { mediaSDKHostTarget } from "../../packages/bun-video/src/sdk-platform";
import { hashSDKFile } from "../../packages/bun-video/src/sdk";
import { stageRuntimeSDK } from "../../packages/bun-runtime-sdk/scripts/stage";
import { nativeSDKHash } from "../build/native-sdk";
import { mediaGNUCompatibilityRustFlags, verifyMediaBuildInputs, type MediaBuildInput } from "./media-sdk-build";
import { mediaSDKTool } from "./media-sdk-source";
import { qualifyMediaELFs } from "./media-sdk-abi";

/** Cargo/staging adapter for the existing standalone workspace, not a native dependency component. */
export function runtimeSDKCargoArgs(root: string, target: string, jobs = 1) {
  if (
    !isAbsolute(root) ||
    !/^(?:x86_64|aarch64)-(?:unknown-linux-(?:gnu|musl)|apple-darwin|pc-windows-msvc)$/.test(target) ||
    ![1, 2].includes(jobs)
  )
    throw new Error("Runtime SDK Cargo owner, native target or job budget differs");
  return [
    process.execPath,
    "--no-env-file",
    join(root, "scripts/build/rust/cargo-serial.ts"),
    ...(target.endsWith("-pc-windows-msvc") ? ["--msvc"] : []),
    "build",
    "--locked",
    "--offline",
    "--manifest-path",
    join(root, "Cargo.toml"),
    "--profile",
    "runtime",
    "-p",
    "yolo-runtime",
    "--target",
    target,
    `-j${jobs}`,
  ];
}

export async function buildGNUX64RuntimeSDK(
  avio: MediaBuildInput,
  output: string,
  qualification: { path: string; sha256: string },
) {
  if (
    avio.component !== "avio" ||
    avio.target !== "linux-x64" ||
    mediaSDKHostTarget() !== "linux-x64" ||
    !isAbsolute(output)
  )
    throw new Error("Portable runtime SDK adapter currently requires native GNU x64 and its qualified AVIO owner");
  const { plan } = await verifyMediaBuildInputs(avio);
  if (
    !isAbsolute(qualification.path) ||
    !/^[a-f0-9]{64}$/.test(qualification.sha256) ||
    Bun.file(qualification.path).size > 16 * 1024 * 1024 ||
    (await hashSDKFile(qualification.path)) !== qualification.sha256
  )
    throw new Error("Runtime SDK needs the exact executed AVIO native qualification receipt");
  const nativeQualification = await Bun.file(qualification.path).json();
  if (
    nativeQualification.schema !== 1 ||
    nativeQualification.target !== "linux-x64" ||
    nativeQualification.native !== true ||
    nativeQualification.passed !== true ||
    !Array.isArray(nativeQualification.closure?.files) ||
    !nativeQualification.closure.files.some((file: { file?: string }) => file.file === "lib/libbun_video_native.so")
  )
    throw new Error("Runtime SDK cannot consume an unqualified AVIO build");
  for (const image of nativeQualification.closure.files) {
    if (
      typeof image.file !== "string" ||
      !/^(?:bin|lib)\/[A-Za-z0-9_.+-]+$/.test(image.file) ||
      (await hashSDKFile(join(avio.prefix, image.file))) !== image.sha256
    )
      throw new Error("Qualified AVIO native bytes changed before runtime SDK compilation");
  }
  const receiptPath = join(avio.output, "build-source-receipt.json");
  if (Bun.file(receiptPath).size > 16 * 1024 * 1024) throw new Error("AVIO build receipt exceeded its bound");
  const receipt = await Bun.file(receiptPath).json();
  const compatibility = receipt.dependencies?.["gnu-compatibility"];
  const object = join(avio.output, "bun-glibc-compat.o");
  if (
    receipt.component !== "avio" ||
    receipt.target !== "linux-x64" ||
    compatibility?.owner !== "src/jsc/bindings/workaround-missing-symbols.cpp" ||
    (await hashSDKFile(object)) !== compatibility.objectSHA256 ||
    (await hashSDKFile(join(avio.root, compatibility.owner))) !== compatibility.sourceSHA256
  )
    throw new Error("Runtime SDK must reuse the exact canonical AVIO GNU compatibility object");
  const flags =
    plan.env.RUSTFLAGS + mediaGNUCompatibilityRustFlags(object, compatibility.wrapSymbols) + " -C link-arg=-lrt";
  const sdkRoot = join(avio.root, "packages/bun-runtime-sdk");
  if ((await mediaSDKTool(["git", "status", "--porcelain", "--untracked-files=normal", "--", "."], sdkRoot)).trim())
    throw new Error("Runtime SDK source contains unpublished changes");
  const revision = (await mediaSDKTool(["git", "rev-parse", "HEAD"], sdkRoot)).trim();
  const heavy = process.env.BUN_MEDIA_HEAVY_LOCK;
  if (!heavy || !isAbsolute(heavy)) throw new Error("Runtime SDK requires the shared host heavy.lock");
  const allocation = (await Bun.file("/proc/self/status").text()).match(/^Cpus_allowed_list:\s*(\d+)/m)?.[1];
  if (!allocation) throw new Error("Runtime SDK native CPU allocation is absent");
  await mkdir(output, { recursive: false });
  await mediaSDKTool(
    [
      "flock",
      "-n",
      heavy,
      "timeout",
      "1800",
      "taskset",
      "-c",
      allocation,
      ...runtimeSDKCargoArgs(avio.root, plan.selected.rust),
    ],
    sdkRoot,
    1_810_000,
    {
      ...process.env,
      CARGO_TARGET_DIR: join(output, "cargo"),
      RUSTFLAGS: flags,
      CARGO_BUILD_JOBS: "1",
      OMP_NUM_THREADS: "1",
      RUSTC_WRAPPER: undefined,
      CARGO_BUILD_RUSTC_WRAPPER: undefined,
      LD_LIBRARY_PATH: undefined,
      LD_PRELOAD: undefined,
      LIBRARY_PATH: undefined,
      CPATH: undefined,
      C_INCLUDE_PATH: undefined,
      CPLUS_INCLUDE_PATH: undefined,
      GH_TOKEN: undefined,
      GITHUB_TOKEN: undefined,
      TYPESAFE_API_KEY: undefined,
      TYPESAFE_API_KEY_FILE: undefined,
    },
  );
  const library = join(output, "cargo", plan.selected.rust, "runtime/libyolo_runtime.so");
  const readelf = join(plan.env.BUN_MEDIA_LLVM_BIN!, "llvm-readelf");
  const elf = (flag: string) => mediaSDKTool([readelf, flag, library], sdkRoot);
  const closure = qualifyMediaELFs("linux-x64", [
    {
      file: "lib/libbuv_runtime.so",
      sha256: await hashSDKFile(library),
      header: await elf("--file-header"),
      dynamic: await elf("--dynamic"),
      versions: await elf("--version-info"),
      programHeaders: await elf("--program-headers"),
    },
  ]);
  const staged = await stageRuntimeSDK({ sdkRoot, library, artifactRoot: join(output, "artifact") });
  const provenance = {
    schema: 1,
    kind: "bun-runtime-sdk-cargo-adapter",
    target: "linux-x64",
    source: revision,
    sourceScope: "packages/bun-runtime-sdk",
    owner: "Cargo.toml",
    cargo: runtimeSDKCargoArgs(avio.root, plan.selected.rust),
    compatibility,
    avioReceiptSHA256: await hashSDKFile(receiptPath),
    rustFlagsSHA256: nativeSDKHash(flags),
    closure,
    staged,
    nativeQualificationSHA256: qualification.sha256,
    nativeReleaseQualified: false,
    archivePublished: false,
  };
  await Bun.write(join(output, "runtime-sdk-build-receipt.json"), JSON.stringify(provenance, null, 2) + "\n");
  return { staged, receipt: join(output, "runtime-sdk-build-receipt.json") };
}
