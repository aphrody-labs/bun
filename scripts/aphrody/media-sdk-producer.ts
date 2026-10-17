import { chmod, mkdir, realpath, statfs } from "node:fs/promises";
import { freemem } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import {
  extractMediaSDKArchive,
  hashSDKFile,
  mediaSDKPlan,
  verifyMediaSDKLayout,
  type MediaSDKComponent,
  type MediaSDKTarget,
} from "../../packages/bun-video/src/sdk";
import { mediaSDKHostTarget } from "../../packages/bun-video/src/sdk-platform";
import { assertPublicMediaPath } from "./media-release";
import {
  mediaBuildPlan,
  runMediaBuild,
  validateMediaDependencyReceipt,
  type MediaBuildInput,
  type MediaBuildComponent,
} from "./media-sdk-build";
import { packageBuiltMediaSDK, qualifyMediaSDKClosure } from "./media-sdk-factory";
import { verifyMediaSourceOwner } from "./media-sdk-source";

type LocalSDK =
  | { kind: "prefix"; path: string; receiptSHA256: string }
  | { kind: "archive"; path: string; sha256: string; bytes: number }
  | { kind: "source"; input: MediaBuildInput; build: boolean; qualification?: { path: string; sha256: string } };
export interface NativeMediaInputs {
  schema: 1;
  target: MediaSDKTarget;
  components: Record<MediaSDKComponent, LocalSDK>;
  avio?: { input: MediaBuildInput };
}

export interface NativeMediaBootstrapInput {
  root: string;
  sources: string;
  output: string;
  target: MediaSDKTarget;
}

/** Source recipes remain plans until the existing owners execute their native gates. */
export function nativeMediaBootstrapPlan(input: NativeMediaBootstrapInput): NativeMediaInputs {
  if (![input.root, input.sources, input.output].every(isAbsolute))
    throw new TypeError("Native media bootstrap owners must be absolute");
  for (const source of [input.root, input.sources]) {
    const overlaps = (left: string, right: string) => {
      const local = relative(left, right);
      return !local || (local !== ".." && !local.startsWith("../") && !local.startsWith("..\\") && !isAbsolute(local));
    };
    if (overlaps(source, input.output) || overlaps(input.output, source))
      throw new Error("Native media bootstrap output overlaps an existing source or build owner");
  }
  const recipe = (component: MediaBuildComponent): MediaBuildInput => ({
    root: input.root,
    sources: input.sources,
    output: join(input.output, component),
    prefix: join(input.output, component, "prefix"),
    component,
    target: input.target,
    dependencies:
      component === "ffmpeg"
        ? { zlib: join(input.output, "zlib", "prefix") }
        : { ffmpeg: join(input.output, "ffmpeg", "prefix") },
  });
  const plan: NativeMediaInputs = {
    schema: 1,
    target: input.target,
    components: {
      ffmpeg: { kind: "source", input: recipe("ffmpeg"), build: true },
      mpv: { kind: "source", input: recipe("mpv"), build: true },
    },
    avio: { input: recipe("avio") },
  };
  return nativeMediaInputs(plan, input.target);
}

interface NativeMediaBootstrapPorts {
  hostTarget?: typeof mediaSDKHostTarget;
  capacity?: (parent: string) => Promise<void>;
  sources?: (input: NativeMediaBootstrapInput) => Promise<unknown>;
  zlib?: (output: string, target: MediaSDKTarget) => Promise<{ prefix: string; sourceReceiptSHA256: string }>;
  prepare?: typeof prepareNativeMedia;
}

/** Executes existing source, SDK and native consumer owners; never accepts qualification assertions. */
export async function bootstrapNativeMediaInputs(
  input: NativeMediaBootstrapInput,
  ports: NativeMediaBootstrapPorts = {},
) {
  const plan = nativeMediaBootstrapPlan(input);
  if ((ports.hostTarget ?? mediaSDKHostTarget)() !== input.target)
    throw new Error("Native media bootstrap requires the actual target host ABI");
  await (
    ports.capacity ??
    (async parent => {
      const disk = await statfs(parent);
      if (disk.bavail * disk.bsize < 20 * 1024 ** 3 || freemem() < 6 * 1024 ** 3)
        throw new Error("Native media bootstrap requires 20 GiB free disk and 6 GiB free RAM");
    })
  )(dirname(input.output));
  const sources = await (
    ports.sources ??
    (async value => {
      const owners = await Promise.all(
        (["ffmpeg", "mpv", "libplacebo", "fast_float", "freetype", "fribidi", "harfbuzz", "libass"] as const).map(
          name =>
            verifyMediaSourceOwner(
              name,
              name === "fast_float" ? join(value.sources, "libplacebo/3rdparty/fast_float") : join(value.sources, name),
            ),
        ),
      );
      return owners;
    })
  )(input);
  await mkdir(input.output, { recursive: false, mode: 0o700 });
  const diagnostics = join(input.output, "diagnostics");
  await mkdir(diagnostics, { recursive: false, mode: 0o700 });
  await Bun.write(join(diagnostics, "sources.json"), JSON.stringify(sources, null, 2) + "\n");
  const zlib = await (
    ports.zlib ??
    (async (output, target) => {
      const { qualifyZlibNativeSDK } = await import("./native-sdk-factory");
      return qualifyZlibNativeSDK(output, target, input.root);
    })
  )(join(input.output, "zlib"), input.target);
  if (zlib.prefix !== join(input.output, "zlib", "prefix") || !digest(zlib.sourceReceiptSHA256))
    throw new Error("Canonical zlib owner returned a foreign or unpinned prefix");
  const buildInputPath = join(input.output, "native-media-build-inputs.json");
  await Bun.write(buildInputPath, JSON.stringify(plan, null, 2) + "\n");
  const buildInputSHA256 = await hashSDKFile(buildInputPath);
  const prepared = join(input.output, "prepared");
  await mkdir(prepared, { recursive: false, mode: 0o700 });
  const prefix = await (ports.prepare ?? prepareNativeMedia)(plan, input.root, prepared, diagnostics);
  if ((await hashSDKFile(buildInputPath)) !== buildInputSHA256)
    throw new Error("Native media build input changed during qualification");
  const components = {} as NativeMediaInputs["components"];
  for (const component of ["ffmpeg", "mpv"] as const) {
    const owner = join(prepared, `sdk-${component}-pack`);
    const distribution = await Bun.file(join(owner, "distribution.json")).json();
    const expected = `${component}-${mediaSDKPlan(component, input.target).version}-${input.target}-sdk.zip`;
    const url = new URL(distribution.asset.url);
    if (url.origin !== "https://bun-lib.aphrody.app" || url.pathname !== `/media/${expected}`)
      throw new Error("Qualified media archive distribution differs from its canonical owner");
    const path = join(owner, basename(url.pathname));
    if (
      !digest(distribution.asset.sha256) ||
      Bun.file(path).size !== distribution.asset.bytes ||
      (await hashSDKFile(path)) !== distribution.asset.sha256
    )
      throw new Error("Qualified media archive differs from its producer receipt");
    components[component] = {
      kind: "archive",
      path,
      sha256: distribution.asset.sha256,
      bytes: distribution.asset.bytes,
    };
  }
  const qualified = nativeMediaInputs({ schema: 1, target: input.target, components, avio: plan.avio }, input.target);
  const inputPath = join(input.output, "native-media-inputs.json");
  await Bun.write(inputPath, JSON.stringify(qualified, null, 2) + "\n");
  return {
    schema: 1 as const,
    inputPath,
    inputSHA256: await hashSDKFile(inputPath),
    buildInputPath,
    buildInputSHA256,
    prefix,
    zlibSourceReceiptSHA256: zlib.sourceReceiptSHA256,
  };
}
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Explicit owner inputs, independent of whether the resulting archive has been published. */
export function nativeMediaInputs(value: unknown, target: MediaSDKTarget): NativeMediaInputs {
  if (!value || typeof value !== "object") throw new Error("Native media input document is missing");
  const result = value as NativeMediaInputs;
  if (result.schema !== 1 || result.target !== target || !result.components)
    throw new Error("Native media input schema or target differs");
  for (const component of ["ffmpeg", "mpv"] as const) {
    const input = result.components[component];
    if (!input) throw new Error(`Explicit ${component} source/prefix/archive input is required`);
    if (input.kind === "source") {
      if (typeof input.build !== "boolean" || input.input.component !== component || input.input.target !== target)
        throw new Error("Native source recipe differs from its component or target");
      mediaBuildPlan(input.input);
      if (
        !input.build &&
        (!input.qualification || !isAbsolute(input.qualification.path) || !digest(input.qualification.sha256))
      )
        throw new Error("An existing source prefix requires its pinned native qualification receipt");
    } else if (input.kind === "prefix") {
      if (!isAbsolute(input.path) || !digest(input.receiptSHA256))
        throw new Error("Local SDK prefix receipt is unpinned");
    } else if (input.kind === "archive") {
      if (
        !isAbsolute(input.path) ||
        !digest(input.sha256) ||
        !Number.isSafeInteger(input.bytes) ||
        input.bytes < 1 ||
        input.bytes > 2 ** 31
      )
        throw new Error("Local SDK archive requires its exact bounded size and SHA-256");
    } else throw new Error("Unknown native media input owner");
  }
  if (result.avio) {
    if (result.avio.input.component !== "avio" || result.avio.input.target !== target)
      throw new Error("Native AVIO recipe differs from the target");
    mediaBuildPlan(result.avio.input);
  }
  return result;
}

export async function readNativeMediaInputs(path: string, sha256: string, target: MediaSDKTarget) {
  if (!isAbsolute(path) || !digest(sha256) || Bun.file(path).size > 1024 * 1024 || (await hashSDKFile(path)) !== sha256)
    throw new Error("Native media input document requires its exact SHA-256 and bounded absolute path");
  return nativeMediaInputs(await Bun.file(path).json(), target);
}

export async function verifyNativeMediaPrefix(
  component: MediaSDKComponent,
  target: MediaSDKTarget,
  directory: string,
  receiptSHA256?: string,
) {
  const receiptFile = join(directory, "bun-sdk-receipt.json");
  if (
    Bun.file(receiptFile).size > 16 * 1024 * 1024 ||
    (receiptSHA256 && (await hashSDKFile(receiptFile)) !== receiptSHA256)
  )
    throw new Error("Normalized SDK receipt identity differs");
  const receipt = validateMediaDependencyReceipt(await Bun.file(receiptFile).json(), component, target);
  const qualification = (receipt as Record<string, unknown>).nativeQualification as Record<string, unknown>;
  if (
    qualification.sourceRevision !== mediaSDKPlan(component, target).sourceRevision ||
    qualification.sourceClean !== true
  )
    throw new Error("Normalized SDK native qualification does not bind its clean source pin");
  const canonical = await realpath(directory);
  let bytes = 0;
  if (Object.keys(receipt.files).length > 100_000) throw new Error("Normalized SDK file inventory exceeds its bound");
  for (const [name, expected] of Object.entries(receipt.files)) {
    assertPublicMediaPath(name);
    const file = await realpath(join(directory, name));
    const member = relative(canonical, file);
    bytes += Bun.file(file).size;
    if (member.startsWith("..") || isAbsolute(member) || bytes > 2 ** 31 || (await hashSDKFile(file)) !== expected)
      throw new Error(`Normalized ${component} SDK member differs: ${name}`);
  }
  for await (const raw of new Bun.Glob("**/*").scan({
    cwd: directory,
    dot: true,
    onlyFiles: true,
    followSymlinks: true,
  })) {
    const name = raw.replaceAll("\\", "/");
    if (name !== "bun-sdk-receipt.json" && !Object.hasOwn(receipt.files, name))
      throw new Error(`Normalized SDK contains an unreceipted member: ${name}`);
  }
  await verifyMediaSDKLayout(component, target, directory);
  await qualifyMediaSDKClosure(target, directory);
  return receipt;
}

async function nativeCommand(argv: string[], cwd: string, log: string, stdin?: Uint8Array) {
  const child = Bun.spawn(argv, {
    cwd,
    stdin: stdin ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
    windowsHide: true,
    env: {
      ...process.env,
      LD_LIBRARY_PATH: undefined,
      LD_PRELOAD: undefined,
      DYLD_LIBRARY_PATH: undefined,
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
      TYPESAFE_API_KEY: undefined,
      TYPESAFE_API_KEY_FILE: undefined,
      GH_TOKEN: undefined,
      GITHUB_TOKEN: undefined,
    },
  });
  const capture = async (stream: ReadableStream<Uint8Array>) => {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of stream) {
      bytes += chunk.byteLength;
      if (bytes > 16 * 1024 * 1024) {
        child.kill();
        throw new Error("Native media gate output exceeded its bound");
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };
  try {
    const [stdout, stderr, code] = await Promise.all([capture(child.stdout), capture(child.stderr), child.exited]);
    await Bun.write(log, stderr);
    if (code !== 0 || child.signalCode) throw new Error(`Native media gate failed; inspect ${log}`);
    return { stdout, stderr: stderr.toString() };
  } finally {
    child.kill();
  }
}

export function assertNativeMediaTests(output: string, minimum: number) {
  const pass = output.match(/\b(\d+) pass\b/),
    fail = output.match(/\b(\d+) fail\b/),
    skip = output.match(/\b(\d+) skip\b/);
  if (!pass || Number(pass[1]) < minimum || !fail || Number(fail[1]) !== 0 || (skip && Number(skip[1]) !== 0))
    throw new Error("Native media gate did not execute its required tests without skips");
}

async function qualifySourcePrefix(input: MediaBuildInput, diagnostics: string) {
  if (mediaSDKHostTarget() !== input.target) throw new Error("Native SDK gates require the actual target host ABI");
  const component = input.component as MediaSDKComponent;
  const source = await verifyMediaSourceOwner(component, input.source ?? join(input.sources, component));
  const commit = "commit" in source ? source.commit : undefined;
  if (commit !== mediaSDKPlan(component, input.target).sourceRevision)
    throw new Error("Native source owner does not bind the catalogue commit");
  const before = await qualifyMediaSDKClosure(input.target, input.prefix);
  const libraries = join(input.prefix, process.platform === "win32" ? "bin" : "lib");
  const prior = process.env.BUN_VIDEO_MEDIA_DIR;
  const priorMPV = process.env.BUN_VIDEO_MPV_LIBRARY;
  try {
    process.env.BUN_VIDEO_MEDIA_DIR = libraries;
    if (component === "mpv")
      process.env.BUN_VIDEO_MPV_LIBRARY = join(libraries, mediaSDKPlan("mpv", input.target).libraryName!);
    const result = await nativeCommand(
      [
        process.execPath,
        "--no-env-file",
        "test",
        "--max-concurrency=1",
        `./packages/bun-video/test/${component}.test.ts`,
        "-t",
        component === "mpv" ? "native libmpv" : "owns decoder contexts|loads every declared symbol",
      ],
      input.root,
      join(diagnostics, `${component}-native-abi.log`),
    );
    assertNativeMediaTests(result.stderr, 2);
    if (component === "ffmpeg") {
      const ffmpeg = join(input.prefix, "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
      const pixels = Uint8Array.from({ length: 8 * 8 * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i * 31) % 256));
      const fixture = join(diagnostics, `ffv1-${crypto.randomUUID()}.mkv`);
      await nativeCommand(
        [
          ffmpeg,
          "-nostdin",
          "-v",
          "error",
          "-f",
          "rawvideo",
          "-pixel_format",
          "rgba",
          "-video_size",
          "8x8",
          "-framerate",
          "1",
          "-i",
          "pipe:0",
          "-frames:v",
          "1",
          "-c:v",
          "ffv1",
          "-threads",
          "1",
          "-n",
          fixture,
        ],
        input.root,
        join(diagnostics, "ffmpeg-encode.log"),
        pixels,
      );
      const decoded = await nativeCommand(
        [
          ffmpeg,
          "-nostdin",
          "-v",
          "error",
          "-threads",
          "1",
          "-i",
          fixture,
          "-frames:v",
          "1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgba",
          "pipe:1",
        ],
        input.root,
        join(diagnostics, "ffmpeg-decode.log"),
      );
      if (!decoded.stdout.equals(Buffer.from(pixels)))
        throw new Error("Native FFV1 fixture did not preserve exact RGBA bytes");
      await Bun.file(fixture).unlink();
    }
    if (JSON.stringify(before) !== JSON.stringify(await qualifyMediaSDKClosure(input.target, input.prefix)))
      throw new Error("Native SDK bytes changed while their gates were executing");
    return {
      schema: 1,
      component,
      target: input.target,
      sourceRevision: commit,
      sourceClean: true,
      passed: true,
      host: { platform: process.platform, arch: process.arch, abi: mediaSDKHostTarget() },
      gates: {
        nativeABI: await hashSDKFile(join(diagnostics, `${component}-native-abi.log`)),
        ...(component === "ffmpeg" ? { FFV1RGBA: 256 } : { client: "CPU/null async events; hardware unqualified" }),
      },
    };
  } finally {
    if (prior === undefined) delete process.env.BUN_VIDEO_MEDIA_DIR;
    else process.env.BUN_VIDEO_MEDIA_DIR = prior;
    if (priorMPV === undefined) delete process.env.BUN_VIDEO_MPV_LIBRARY;
    else process.env.BUN_VIDEO_MPV_LIBRARY = priorMPV;
  }
}

export async function existingMediaQualification(
  component: MediaSDKComponent,
  target: MediaSDKTarget,
  prefix: string,
  qualification: { path: string; sha256: string },
) {
  if (
    !isAbsolute(qualification.path) ||
    !digest(qualification.sha256) ||
    Bun.file(qualification.path).size > 16 * 1024 * 1024 ||
    (await hashSDKFile(qualification.path)) !== qualification.sha256
  )
    throw new Error("Existing source qualification receipt identity differs");
  const q = await Bun.file(qualification.path).json();
  if (
    q.schema !== 1 ||
    q.component !== component ||
    q.target !== target ||
    q.sourceRevision !== mediaSDKPlan(component, target).sourceRevision ||
    q.sourceClean !== true ||
    q.passed !== true
  )
    throw new Error("Existing native SDK qualification source or target differs");
  const hashes: Record<string, string> = { ...q.layout?.files, ...q.licenses };
  const binaries = q.linuxABI?.files ?? q.binaryClosure?.files;
  if (
    !Array.isArray(binaries) ||
    !binaries.length ||
    !Object.keys(q.licenses ?? {}).length ||
    !Object.keys(hashes).length
  )
    throw new Error("Existing native qualification lacks pinned layout, license or binary evidence");
  for (const image of binaries) hashes[image.file] = image.sha256;
  const canonical = await realpath(prefix);
  for (const [name, expected] of Object.entries(hashes)) {
    assertPublicMediaPath(name);
    const path = await realpath(join(prefix, name)),
      member = relative(canonical, path);
    if (!digest(expected) || member.startsWith("..") || isAbsolute(member) || (await hashSDKFile(path)) !== expected)
      throw new Error("Existing native qualification bytes have changed");
  }
  return { ...q, qualificationReceiptSHA256: qualification.sha256 } as Record<string, unknown>;
}

/** Merge only receipted bytes, then execute AVIO gates if a source sidecar is explicitly requested. */
export async function prepareNativeMedia(inputs: NativeMediaInputs, root: string, output: string, diagnostics: string) {
  nativeMediaInputs(inputs, inputs.target);
  await mkdir(diagnostics, { recursive: true });
  if (inputs.avio || Object.values(inputs.components).some(input => input.kind === "source" && input.build)) {
    if (mediaSDKHostTarget() !== inputs.target) throw new Error("Native SDK build requires its actual target host ABI");
    const disk = await statfs(output);
    if (disk.bavail * disk.bsize < 20 * 1024 ** 3 || freemem() < 6 * 1024 ** 3)
      throw new Error("Native SDK build requires 20 GiB free disk and 6 GiB free RAM before acquiring heavy.lock");
  }
  const prefix = join(output, "media-prefix");
  await mkdir(prefix, { recursive: false });
  const members = new Map<string, string>();
  const owners: Partial<Record<MediaSDKComponent, string>> = {};
  for (const component of ["ffmpeg", "mpv"] as const) {
    const input = inputs.components[component];
    let directory: string, receiptSHA256: string | undefined;
    if (input.kind === "prefix") {
      directory = input.path;
      receiptSHA256 = input.receiptSHA256;
    } else if (input.kind === "archive") {
      if (Bun.file(input.path).size !== input.bytes || (await hashSDKFile(input.path)) !== input.sha256)
        throw new Error("Local SDK archive differs from its exact pin");
      directory = join(output, `sdk-${component}`);
      await extractMediaSDKArchive(input.path, directory);
    } else {
      if ((await realpath(input.input.root)) !== (await realpath(root)))
        throw new Error("Media source build root differs from native producer");
      if (input.build) {
        if (component === "mpv" && !input.input.dependencies.ffmpeg) {
          if (!owners.ffmpeg) throw new Error("The source MPV recipe requires its qualified FFmpeg owner");
          input.input.dependencies.ffmpeg = owners.ffmpeg;
        }
        await runMediaBuild(input.input);
      }
      directory = input.input.prefix;
      const provenance = input.build
        ? {}
        : await existingMediaQualification(component, inputs.target, directory, input.qualification!);
      const nativeQualification = { ...provenance, ...(await qualifySourcePrefix(input.input, diagnostics)) };
      const workspace = join(output, `sdk-${component}-pack`);
      await mkdir(workspace, { recursive: false });
      await packageBuiltMediaSDK(
        component,
        inputs.target,
        input.input.source ?? join(input.input.sources, component),
        directory,
        workspace,
        { nativeQualification, dependencies: input.input.dependencies },
      );
    }
    const receipt = await verifyNativeMediaPrefix(component, inputs.target, directory, receiptSHA256);
    owners[component] = directory;
    for (const [name, expected] of Object.entries(receipt.files)) {
      const key = name.toLowerCase(),
        prior = members.get(key);
      if (prior && prior !== expected) throw new Error(`Native SDK owners collide: ${name}`);
      if (!prior) {
        const destination = join(prefix, name);
        await mkdir(dirname(destination), { recursive: true });
        await Bun.write(destination, Bun.file(join(directory, name)));
        if (process.platform !== "win32") await chmod(destination, name.startsWith("bin/") ? 0o755 : 0o644);
        members.set(key, expected);
      }
    }
    await Bun.write(join(diagnostics, `${component}-sdk.json`), JSON.stringify(receipt, null, 2) + "\n");
  }
  if (inputs.avio) {
    const input = {
      ...inputs.avio.input,
      prefix,
      dependencies: { ...inputs.avio.input.dependencies, ffmpeg: owners.ffmpeg! },
    };
    if ((await realpath(input.root)) !== (await realpath(root)))
      throw new Error("AVIO source root differs from native producer");
    await runMediaBuild(input);
    await qualifyNativeMediaAVIO(inputs.target, root, prefix, diagnostics);
    const avioQualification = await Bun.file(join(diagnostics, "avio-qualification.json")).json();
    const avioSource = await Bun.file(join(input.output, "build-source-receipt.json")).json();
    for (const component of ["ffmpeg", "mpv"] as const) {
      const owner = inputs.components[component];
      if (owner.kind !== "source") continue;
      const receipt = await Bun.file(join(diagnostics, `${component}-sdk.json`)).json();
      await packageBuiltMediaSDK(
        component,
        inputs.target,
        owner.input.source ?? join(owner.input.sources, component),
        prefix,
        join(output, `sdk-${component}-pack`),
        {
          nativeQualification: { ...receipt.nativeQualification, avio: avioQualification, avioSource },
          dependencies: { ...receipt.dependencies, avio: avioSource.source },
        },
      );
    }
  }
  await qualifyMediaSDKClosure(inputs.target, prefix);
  return prefix;
}

export async function qualifyNativeMediaAVIO(
  target: MediaSDKTarget,
  root: string,
  prefix: string,
  diagnostics: string,
) {
  if (mediaSDKHostTarget() !== target) throw new Error("Native AVIO gates require the actual target host ABI");
  const directory = join(prefix, process.platform === "win32" ? "bin" : "lib");
  const before = await qualifyMediaSDKClosure(target, prefix);
  const prior = process.env.BUN_VIDEO_MEDIA_DIR,
    priorMPV = process.env.BUN_VIDEO_MPV_LIBRARY;
  try {
    process.env.BUN_VIDEO_MEDIA_DIR = directory;
    process.env.BUN_VIDEO_MPV_LIBRARY = join(directory, mediaSDKPlan("mpv", target).libraryName!);
    const log = join(diagnostics, "avio-native-abi.log");
    const result = await nativeCommand(
      [
        process.execPath,
        "--no-env-file",
        "test",
        "--max-concurrency=1",
        "./packages/bun-video/test/ffmpeg.test.ts",
        "./packages/bun-video/test/mpv.test.ts",
        "-t",
        "native FFmpeg ownership|native libmpv",
      ],
      root,
      log,
    );
    assertNativeMediaTests(result.stderr, 6);
    const after = await qualifyMediaSDKClosure(target, prefix);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error("Native AVIO bytes changed while their gates were executing");
    await Bun.write(
      join(diagnostics, "avio-qualification.json"),
      JSON.stringify(
        {
          schema: 1,
          target,
          native: true,
          passed: true,
          gateSHA256: await hashSDKFile(log),
          closure: after,
          graphics: "not-qualified",
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    if (prior === undefined) delete process.env.BUN_VIDEO_MEDIA_DIR;
    else process.env.BUN_VIDEO_MEDIA_DIR = prior;
    if (priorMPV === undefined) delete process.env.BUN_VIDEO_MPV_LIBRARY;
    else process.env.BUN_VIDEO_MPV_LIBRARY = priorMPV;
  }
}
