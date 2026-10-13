import { chmod, mkdir, realpath, readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { hashSDKFile } from "../../packages/bun-video/src/sdk";
import { mp4 } from "../../test/js/bun/video/fixture";
import { stageMediaBundle } from "./media-stage";
import { runtimeFlavorManifest, runtimeReleaseMatrix, vpsRuntimeReleasePlan } from "./release-matrix";
import mediaSDKManifest from "../../packages/bun-video/src/sdk-manifest.json";
import { mediaSDKHostTarget } from "../../packages/bun-video/src/sdk-platform";
import { verifyArtifactAsync } from "../../packages/bun-runtime-sdk/src/artifact";
import type { HostPlatform, HostArch } from "../../packages/bun-runtime-sdk/src/target";

export interface MediaReleaseInput {
  target?: string;
  source: string;
  sourceRoot: string;
  runtime: string;
  executable: string;
  mediaPrefix: string;
  output: string;
  sdkArchives: { directory: string; archive: string }[];
  runtimeSDKArtifact?: string;
}

export function mediaReleaseTarget(name: string) {
  const target = runtimeReleaseMatrix([name]).find(target => target.flavor === "full")!;
  const sdkTarget = `${target.os}-${target.arch === "aarch64" ? "arm64" : "x64"}${target.abi === "musl" ? "-musl" : ""}`;
  return {
    ...target,
    sdkTarget,
    platform: (target.os === "windows" ? "win32" : target.os) as HostPlatform,
    runtimeArch: (target.arch === "aarch64" ? "arm64" : "x64") as HostArch,
  };
}

export interface MediaRuntimeIdentity {
  version: string;
  revision: string;
  platform: string;
  arch: string;
}

export interface MediaReleasePlanInput {
  source: string;
  sourceRoot: string;
  platforms?: Record<
    string,
    {
      runtime?: string;
      executable?: string;
      mediaPrefix?: string;
      nativeQualification?: string;
      sdkArchives?: { directory: string; archive: string }[];
    }
  >;
}

/** Inventory and commands only: a partial platform never establishes a complete release. */
export async function planMediaRelease(input: MediaReleasePlanInput) {
  if (!/^[a-f0-9]{40}$/.test(input.source) || !isAbsolute(input.sourceRoot))
    throw new Error("Media matrix plan needs exact source SHA and absolute source root");
  const targets = runtimeReleaseMatrix().filter(target => target.flavor === "full");
  for (const target of Object.keys(input.platforms ?? {}))
    if (!targets.some(candidate => candidate.target === target))
      throw new Error(`Unknown media release target: ${target}`);
  const factory = vpsRuntimeReleasePlan(input.source);
  const platforms = [];
  for (const target of targets) {
    const supplied = input.platforms?.[target.target];
    const missing: string[] = [];
    const files: Record<string, { path: string; bytes: number; sha256: string }> = {};
    for (const key of ["runtime", "executable", "nativeQualification"] as const) {
      const path = supplied?.[key];
      if (
        !path ||
        !isAbsolute(path) ||
        !(await Bun.file(path).exists()) ||
        !Bun.file(path).size ||
        Bun.file(path).size > maximumFileBytes
      )
        missing.push(`Exact-source ${key} artifact`);
      else files[key] = { path, bytes: Bun.file(path).size, sha256: await hashSDKFile(path) };
    }
    if (
      !supplied?.mediaPrefix ||
      !isAbsolute(supplied.mediaPrefix) ||
      !(await stat(supplied.mediaPrefix).catch(() => undefined))?.isDirectory()
    )
      missing.push("Complete media prefix with native binaries, headers, libraries and licenses");
    if (
      !supplied?.sdkArchives?.some(entry => entry.directory === "packages/bun-video") ||
      !supplied.sdkArchives.some(entry => entry.directory === "packages/bun-runtime-sdk")
    )
      missing.push("Packed Bun Video and runtime SDK sources");
    for (const entry of supplied?.sdkArchives ?? [])
      if (
        !/^packages\/[^/]+$/.test(entry.directory) ||
        !isAbsolute(entry.archive) ||
        !(await Bun.file(entry.archive).exists()) ||
        !Bun.file(entry.archive).size
      )
        missing.push(`Existing SDK archive for ${entry.directory}`);
    const sdkTarget = `${target.os === "windows" ? "windows" : target.os}-${target.arch === "aarch64" ? "arm64" : "x64"}${target.abi === "musl" ? "-musl" : ""}`;
    const sdk = mediaSDKManifest.targets[sdkTarget as keyof typeof mediaSDKManifest.targets];
    if (!sdk) missing.push(`Pinned complete FFmpeg/mpv SDK owner for ${sdkTarget}`);
    else
      for (const component of ["ffmpeg", "mpv"] as const)
        if (!sdk[component].assets.length)
          missing.push(`Normalized and native-qualified ${component} SDK for ${sdkTarget}`);
    if (files.nativeQualification) {
      try {
        const qualification = await Bun.file(files.nativeQualification.path).json();
        if (
          qualification.source !== input.source ||
          qualification.version !== version ||
          qualification.target !== target.target ||
          qualification.native !== true ||
          qualification.passed !== true ||
          qualification.runtimeSHA256 !== files.runtime?.sha256 ||
          qualification.executableSHA256 !== files.executable?.sha256
        )
          missing.push("Matching native artifact-bound platform gate receipt");
      } catch {
        missing.push("Readable native platform gate receipt");
      }
    }
    platforms.push({
      target: target.target,
      triplet: target.triplet,
      asset: `${target.triplet}.zip`,
      source: input.source,
      nativeRunner: target.runner,
      ...(target.container ? { nativeABIContainer: target.container } : {}),
      runtimeFactory: factory.steps.find(step => step.target.target === target.target && step.target.flavor === "full"),
      files,
      assemblyImplemented: true,
      ready: missing.length === 0,
      missing,
    });
  }
  return {
    schema: 1,
    kind: "bun-media-release-plan",
    source: input.source,
    sourceRoot: input.sourceRoot,
    requestedTargets: targets.map(target => target.target),
    complete: platforms.every(platform => platform.ready),
    platforms,
    execution: "Serialized native build factory; run each artifact on its native platform before packaging/publication",
    qualification: "Plan only; no compilation, dispatch, publication or runtime qualification performed",
  };
}

const version = "1.4.4";
const triplet = "bun-windows-x64-full";
const maximumFileBytes = 2 * 1024 * 1024 * 1024;

export function assertMediaStableVersion(output: string) {
  if (output.trim() !== version) throw new Error("Media release requires the stable 1.4.4 embedded version");
}

export function assertMediaRuntimeIdentity(identity: MediaRuntimeIdentity, source: string, targetName = "windows-x64") {
  const target = mediaReleaseTarget(targetName);
  if (
    !/^[a-f0-9]{40}$/.test(source) ||
    identity.version !== version ||
    identity.revision !== source ||
    identity.platform !== target.platform ||
    identity.arch !== target.runtimeArch
  )
    throw new Error(`Media release needs native ${targetName} Bun 1.4.4 at the exact source revision`);
}

export function assertPublicMediaPath(path: string) {
  // Archive members cannot contain control characters or Windows drive syntax.
  if (
    !path ||
    // eslint-disable-next-line no-control-regex
    /[:\\\x00-\x1f\x7f]/.test(path) ||
    path.startsWith("/") ||
    path.split("/").some(part => !part || part === "." || part === "..") ||
    /(^|\/)(?:\.env(?:\.[^/]*)?|\.ssh|\.codex|\.claude|cookies?|sessions?|node_modules|__pycache__)(\/|$)/i.test(
      path,
    ) ||
    /(?:^|\/)(?:cookie(?:s)?\.json|hls\.json|cookie-reference\.json)$/i.test(path) ||
    /\.(?:har|sqlite(?:3)?|db|key|p12|safetensors|gguf|bak)$/i.test(path)
  )
    throw new Error(`Unsafe or protected media release member: ${path}`);
}

/** Child processes receive only Windows essentials and the assembled payload. */
export function isolatedMediaEnvironment(
  directory: string,
  temporary: string,
  targetName = "windows-x64",
): Record<string, string> {
  if (![directory, temporary].every(isAbsolute)) throw new Error("Isolation paths must be absolute");
  const target = mediaReleaseTarget(targetName);
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const ffmpeg = join(directory, "lib/media/ffmpeg", target.sdkTarget, "bin");
  const mpv = join(directory, "lib/media/mpv", target.sdkTarget, "bin");
  if (target.os !== "windows")
    return {
      PATH: [directory, ffmpeg, mpv, "/usr/bin", "/bin"].join(":"),
      HOME: temporary,
      TEMP: temporary,
      TMP: temporary,
      TMPDIR: temporary,
      BUN_VIDEO_MEDIA_DIR: join(directory, "lib/media/ffmpeg", target.sdkTarget, "lib"),
      BUN_VIDEO_FFMPEG: join(ffmpeg, "ffmpeg"),
      BUN_VIDEO_FFPROBE: join(ffmpeg, "ffprobe"),
    };
  return {
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    COMSPEC: join(systemRoot, "System32/cmd.exe"),
    PATH: [directory, ffmpeg, mpv, join(systemRoot, "System32")].join(";"),
    TEMP: temporary,
    TMP: temporary,
    HOME: temporary,
    USERPROFILE: temporary,
    APPDATA: temporary,
    LOCALAPPDATA: temporary,
    BUN_VIDEO_MEDIA_DIR: ffmpeg,
    BUN_VIDEO_FFMPEG: join(ffmpeg, "ffmpeg.exe"),
    BUN_VIDEO_FFPROBE: join(ffmpeg, "ffprobe.exe"),
  };
}

async function command(argv: string[], cwd: string, env: Record<string, string>, timeout = 60_000, stdin?: Uint8Array) {
  const child = Bun.spawn(argv, {
    cwd,
    env,
    stdin: stdin ? new Blob([new Uint8Array(stdin)]) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeout);
  try {
    const [stdout, stderr, code] = await Promise.all([
      Bun.readableStreamToText(child.stdout),
      Bun.readableStreamToText(child.stderr),
      child.exited,
    ]);
    if (timedOut) throw new Error(`Media release command timed out: ${basename(argv[0]!)}`);
    if (code !== 0) throw new Error(`Media release command failed (${code}): ${basename(argv[0]!)}\n${stderr}`);
    if (stdout.length + stderr.length > 4 * 1024 * 1024) throw new Error("Media gate output exceeds 4 MiB");
    return { stdout, stderr };
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) {
      child.kill();
      await child.exited;
    }
  }
}

async function assertSource(root: string, source: string) {
  const git = Bun.which("git");
  if (!git || !/^[a-f0-9]{40}$/.test(source)) throw new Error("Media release needs native Git and an exact source SHA");
  const identity = await command([git, "rev-parse", "HEAD"], root, process.env as Record<string, string>, 30_000);
  if (identity.stdout.trim() !== source) throw new Error("Media release source differs from checkout HEAD");
  await command([git, "diff", "--quiet", "HEAD", "--"], root, process.env as Record<string, string>, 30_000);
}

export async function verifyMediaSDKArchive(archive: string, sourceDirectory: string) {
  if (![archive, sourceDirectory].every(isAbsolute)) throw new Error("SDK archive and source paths must be absolute");
  const packed = Bun.file(archive);
  if (packed.size === 0 || packed.size > maximumFileBytes) throw new Error("SDK archive exceeds its file budget");
  const files = await new Bun.Archive(await packed.bytes()).files();
  const manifestFile = files.get("package/package.json");
  if (!manifestFile) throw new Error("SDK archive lacks package/package.json");
  const manifest = await manifestFile.json();
  const source = await Bun.file(join(sourceDirectory, "package.json")).json();
  const canonicalSource = await realpath(sourceDirectory);
  if (!Bun.deepEquals(manifest, source) || manifest.private === true || !manifest.name || !manifest.version)
    throw new Error("Packed SDK manifest differs from its public committed source");
  const destinations = (value: unknown): string[] =>
    typeof value === "string"
      ? [value]
      : value && typeof value === "object"
        ? Object.values(value).flatMap(destinations)
        : [];
  for (const entry of [...destinations(manifest.exports), ...destinations(manifest.bin)]) {
    if (!entry.startsWith("./")) throw new Error("SDK exports must resolve within their source package");
    const name = entry.slice(2);
    assertPublicMediaPath(name);
    if (name.includes("*")) continue;
    if (!files.has(`package/${name}`)) throw new Error(`Packed SDK entry point absent: ${name}`);
  }
  let bytes = 0;
  for (const [path, file] of files) {
    assertPublicMediaPath(path);
    if (!path.startsWith("package/")) throw new Error("SDK tarball contains a member outside package/");
    bytes += file.size;
    if (files.size > 100_000 || bytes > 3 * maximumFileBytes) throw new Error("Expanded SDK exceeds its file budget");
    // Bun pm pack normalizes JSON formatting; its complete manifest was compared above.
    if (path === "package/package.json") continue;
    const localPath = join(sourceDirectory, path.slice(8));
    const sourceMember = relative(canonicalSource, await realpath(localPath));
    if (sourceMember.startsWith("..") || isAbsolute(sourceMember))
      throw new Error(`SDK source member escaped its source package: ${path}`);
    const local = Bun.file(localPath);
    if (
      !(await local.exists()) ||
      local.size !== file.size ||
      (await hashSDKFile(join(sourceDirectory, path.slice(8)))) !==
        new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex")
    )
      throw new Error(`SDK member differs from source: ${path}`);
  }
  return {
    name: manifest.name as string,
    version: manifest.version as string,
    archive: basename(archive),
    sha256: await hashSDKFile(archive),
    bytes: packed.size,
    files: files.size,
    dependencies: manifest.dependencies ?? {},
  };
}

const imageProbe = `
const chunk=(type,data)=>{const payload=Buffer.concat([Buffer.from(type),data]);const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length,0);payload.copy(out,4);out.writeUInt32BE(Bun.hash.crc32(payload),out.length-4);return out;};
const header=Buffer.alloc(13);header.writeUInt32BE(2,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',Bun.deflateSync(new Uint8Array([0,255,0,0,255,0,0,255,255]))),chunk('IEND',new Uint8Array())]);
if(typeof Bun.Image!=='function'||typeof Bun.Video!=='function'||!Bun.Video.available)throw new Error('Native Image/Video APIs missing');
const rgba=await new Bun.Image(png).rgba();if(rgba.width!==2||rgba.height!==1||!Bun.deepEquals([...rgba.data],[255,0,0,255,0,0,255,255]))throw new Error('Image RGBA mismatch');
const encoded=await new Bun.Image(png).webp({lossless:true}).bytes();const back=await new Bun.Image(encoded).rgba();if(!Bun.deepEquals([...back.data],[...rgba.data]))throw new Error('Image WebP roundtrip mismatch');
await Bun.write('image.png',png);
const metadata=await new Bun.Video('container.mp4').metadata();if(metadata.width!==64||metadata.frameCount!==3)throw new Error('FilmCraft MP4 timing mismatch');
console.log(JSON.stringify({version:Bun.version,revision:Bun.revision,platform:process.platform,arch:process.arch,image:'lossless-webp-rgba',video:'filmcraft-mp4-metadata',frameCount:metadata.frameCount}));`;

function libraryProbe(targetName: string) {
  const target = mediaReleaseTarget(targetName);
  const windows = target.os === "windows";
  return `
import {dlopen} from 'bun:ffi';
import {join} from 'node:path';
const root=process.cwd();
const ffmpeg=join(root,'lib/media/ffmpeg',${JSON.stringify(target.sdkTarget)},${JSON.stringify(windows ? "bin" : "lib")});
const mpv=join(root,'lib/media/mpv',${JSON.stringify(target.sdkTarget)},${JSON.stringify(windows ? "bin" : "lib")});
const majors={avutil:61,avcodec:63,avformat:63,avfilter:12,swscale:10,swresample:7,avdevice:63};
const libraryName=${windows ? "(name,major)=>name+'-'+major+'.dll'" : target.os === "darwin" ? "(name,major)=>'lib'+name+'.'+major+'.dylib'" : "(name,major)=>'lib'+name+'.so.'+major"};
for(const [name,major] of Object.entries(majors)){using lib=dlopen(join(ffmpeg,libraryName(name,major)),{[name+'_version']:{args:[],returns:'u32'}});if((lib.symbols[name+'_version']()>>>16)!==major)throw new Error(name+' ABI mismatch');}
using player=dlopen(join(mpv,${JSON.stringify(windows ? "libmpv-2.dll" : target.os === "darwin" ? "libmpv.2.dylib" : "libmpv.so.2")}),{mpv_client_api_version:{args:[],returns:${JSON.stringify(windows ? "u32" : "u64")}}});const api=player.symbols.mpv_client_api_version();if((typeof api==='bigint'?Number(api>>16n):api>>>16)!==2)throw new Error('mpv API mismatch');
console.log(JSON.stringify({ffmpeg:majors,mpvApiMajor:2}));`;
}

export async function archiveMediaReleaseFiles(
  directory: string,
  output: string,
  members: string[],
  options: { triplet?: string; modes?: Record<string, number> } = {},
) {
  if (![directory, output].every(isAbsolute)) throw new Error("Media archive paths must be absolute");
  if (!members.length || new Set(members).size !== members.length)
    throw new Error("Media archive inventory is empty or duplicated");
  const entries: Record<string, Bun.ArchiveEntry> = {};
  const archiveTriplet = options.triplet ?? triplet;
  assertPublicMediaPath(archiveTriplet);
  const canonicalDirectory = await realpath(directory);
  let bytes = 0;
  for (const member of members.toSorted()) {
    assertPublicMediaPath(member);
    const path = join(directory, member);
    if (resolve(path) === resolve(output)) throw new Error("Media archive would overwrite an input member");
    const actual = await realpath(path);
    const within = relative(canonicalDirectory, actual);
    if (within.startsWith("..") || isAbsolute(within)) throw new Error("Media archive member escaped its payload");
    const file = Bun.file(path);
    if (!(await file.exists()) || file.size > maximumFileBytes)
      throw new Error(`Media archive input absent or exceeds file budget: ${member}`);
    bytes += file.size;
    if (members.length > 100_000 || bytes > 2 * maximumFileBytes)
      throw new Error("Media archive exceeds its expanded file budget");
    entries[`${archiveTriplet}/${member}`] = {
      data: await file.bytes(),
      mode: options.modes?.[member] ?? 0o644,
      mtime: 0,
    };
  }
  await Bun.write(output, await new Bun.Archive(entries, { format: "zip", mtime: 0 }).blob());
}

export async function packageMediaRelease(input: MediaReleaseInput) {
  const sdkHost = mediaSDKHostTarget();
  const host = runtimeReleaseMatrix().find(
    target => target.flavor === "full" && mediaReleaseTarget(target.target).sdkTarget === sdkHost,
  )!;
  const target = mediaReleaseTarget(input.target ?? host.target);
  if (target.sdkTarget !== sdkHost)
    throw new Error(`Media release assembly requires native ${target.target} execution`);
  const windows = target.os === "windows";
  const runtimeName = windows ? "bun.exe" : "bun";
  const videoName = windows ? "bun-video.exe" : "bun-video";
  for (const key of ["sourceRoot", "runtime", "executable", "mediaPrefix", "output"] as const)
    if (!isAbsolute(input[key])) throw new Error(`Media release ${key} must be absolute`);
  await assertSource(input.sourceRoot, input.source);
  const output = resolve(input.output);
  const sourceRoot = await realpath(input.sourceRoot);
  const withinSource = relative(sourceRoot, output).replaceAll("\\", "/");
  if (
    !withinSource ||
    (!withinSource.startsWith("../") && !isAbsolute(withinSource) && !/^(tmp|artifacts)\//.test(withinSource))
  )
    throw new Error("Release output may only use checkout tmp/artifacts or a separate output directory");
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new Error("Media release output must be empty");
  const directory = join(output, target.triplet);
  await mkdir(directory);
  const modes: Record<string, number> = {};
  const copy = async (from: string, member: string, mode = 0o644) => {
    assertPublicMediaPath(member);
    const file = Bun.file(from);
    if (!(await file.exists()) || file.size === 0 || file.size > maximumFileBytes)
      throw new Error(`Media release input missing or exceeds file budget: ${member}`);
    const destination = join(directory, member);
    await mkdir(dirname(destination), { recursive: true });
    await Bun.write(destination, file);
    if (!windows) await chmod(destination, mode);
    modes[member] = mode;
  };
  await copy(input.runtime, runtimeName, windows ? 0o644 : 0o755);
  await copy(input.executable, videoName, windows ? 0o644 : 0o755);
  await Bun.write(
    join(directory, "release-flavor.json"),
    JSON.stringify(runtimeFlavorManifest(target, input.source), null, 2) + "\n",
  );
  if (input.runtimeSDKArtifact) {
    if (!isAbsolute(input.runtimeSDKArtifact)) throw new Error("Runtime SDK artifact must be absolute");
    const artifact = await verifyArtifactAsync(input.runtimeSDKArtifact);
    const manifest = await Bun.file(join(input.runtimeSDKArtifact, "manifest.json")).json();
    if (
      manifest.sources?.bun?.rev !== input.source ||
      manifest.sources?.bun?.dirty !== false ||
      manifest.build?.panicRecovery !== true ||
      !/^[a-z0-9_-]+$/.test(artifact.target)
    )
      throw new Error("Runtime SDK source or panic recovery receipt differs from the release");
    const destination = `lib/runtime-sdk/${artifact.target}/current`;
    for (const name of [...Object.keys(artifact.files), "manifest.json"])
      await copy(join(input.runtimeSDKArtifact, name), `${destination}/${name}`);
  }
  const media = await stageMediaBundle(directory, { apply: true, prefix: input.mediaPrefix, target: target.sdkTarget });
  for (const file of media.files) if (file.mode !== undefined) modes[file.name] = file.mode;
  const sdk: Awaited<ReturnType<typeof verifyMediaSDKArchive>>[] = [];
  for (const entry of input.sdkArchives) {
    if (!/^packages\/[^/]+$/.test(entry.directory))
      throw new Error("SDK source directory must name a first-party package");
    const receipt = await verifyMediaSDKArchive(entry.archive, join(sourceRoot, entry.directory));
    if (sdk.some(item => item.name === receipt.name)) throw new Error("Duplicate SDK package");
    await copy(entry.archive, `sdk/${receipt.archive}`);
    sdk.push(receipt);
  }
  if (
    !sdk.some(item => item.name === "@aphrody/bun-video") ||
    !sdk.some(item => item.name === "@aphrody/bun-runtime-sdk")
  )
    throw new Error("Media release requires packed Bun Video and runtime SDK sources");
  const videoSDK = sdk.find(item => item.name === "@aphrody/bun-video")!;
  if (
    videoSDK.dependencies["@aphrody/bun-runtime-sdk"] !==
    sdk.find(item => item.name === "@aphrody/bun-runtime-sdk")!.version
  )
    throw new Error("Bun Video SDK dependency version differs from packed runtime SDK");
  for (const member of [
    "LICENSE.md",
    "packages/bun-video/LICENSE",
    "packages/bun-video/THIRD_PARTY_NOTICES.md",
    "packages/bun-video/packages/remotion/LICENSE.md",
    "packages/bun-video/packages/remotion/packages/core/THIRD_PARTY_LICENSES.md",
    "packages/bun-video/packages/hyperframes/LICENSE",
    "packages/bun-video/packages/mediabunny/LICENSE",
    "packages/bun-video/packages/yt-dlp/LICENSE",
    "packages/bun-video/packages/yt-dlp/THIRD_PARTY_LICENSES.txt",
  ])
    await copy(join(sourceRoot, member), `licenses/${member}`);
  const gates: { id: string; passed: true; log: string; sha256: string }[] = [];
  const scratch = join(directory, ".qualification");
  const scratchTarget = resolve(scratch);
  if (dirname(scratchTarget) !== resolve(directory) || basename(scratchTarget) !== ".qualification")
    throw new Error("Unsafe qualification cleanup path");
  await mkdir(scratch);
  const env = isolatedMediaEnvironment(directory, scratch, target.target);
  const gate = async (
    id: string,
    argv: string[],
    check: (stdout: string) => void,
    stdin?: Uint8Array,
    extraEnvironment: Record<string, string> = {},
  ) => {
    const result = await command(argv, directory, { ...env, ...extraEnvironment }, 60_000, stdin);
    check(result.stdout);
    const log = `qualification/${id}.log`;
    await mkdir(join(directory, "qualification"), { recursive: true });
    await Bun.write(join(directory, log), `${result.stdout}${result.stderr}`);
    gates.push({ id, passed: true, log, sha256: await hashSDKFile(join(directory, log)) });
  };
  const runtime = join(directory, runtimeName);
  const videoExecutable = join(directory, videoName);
  const assertIdentity = (identity: MediaRuntimeIdentity) =>
    assertMediaRuntimeIdentity(identity, input.source, target.target);
  try {
    await gate("runtime-channel", [runtime, "--version"], assertMediaStableVersion);
    await gate("video-channel", [videoExecutable, "--version"], assertMediaStableVersion, undefined, {
      BUN_BE_BUN: "1",
    });
    await gate(
      "runtime-identity",
      [
        runtime,
        "-e",
        "console.log(JSON.stringify({version:Bun.version,revision:Bun.revision,platform:process.platform,arch:process.arch}))",
      ],
      stdout => assertIdentity(JSON.parse(stdout)),
    );
    await gate("video-identity", [videoExecutable, "capabilities"], stdout =>
      assertIdentity(JSON.parse(stdout).runtime),
    );
    await Bun.write(join(directory, "container.mp4"), mp4());
    await gate("image-video", [runtime, "-e", imageProbe], stdout => assertIdentity(JSON.parse(stdout)));
    await gate("media-library-abi", [runtime, "-e", libraryProbe(target.target)], stdout => {
      if (JSON.parse(stdout).mpvApiMajor !== 2) throw new Error("Native media library ABI gate did not run");
    });
    await gate("video-cli", [videoExecutable, "--help"], stdout => {
      for (const name of ["remotion", "hyperframes", "ytdlp", "encode", "workers"])
        if (!stdout.includes(`bun-video ${name}`)) throw new Error(`Compiled Bun Video command absent: ${name}`);
    });
    const mediaBin = join(directory, "lib/media/ffmpeg", target.sdkTarget, "bin");
    const native = join(mediaBin, windows ? "bun-video-native.exe" : "bun-video-native");
    const frame = await Bun.file(join(directory, "image.png")).bytes();
    await gate(
      "native-encode",
      [native, "encode", "ffv1", "1/1", "1", "1", join(directory, "encoded.mkv")],
      () => {},
      frame,
    );
    await gate(
      "native-decode",
      [
        join(mediaBin, windows ? "ffmpeg.exe" : "ffmpeg"),
        "-v",
        "error",
        "-i",
        join(directory, "encoded.mkv"),
        "-frames:v",
        "1",
        "-y",
        join(directory, "decoded.png"),
      ],
      () => {},
    );
    await gate(
      "native-pixels",
      [
        runtime,
        "-e",
        "const a=await new Bun.Image('image.png').rgba();const b=await new Bun.Image('decoded.png').rgba();if(a.width!==b.width||a.height!==b.height||!Bun.deepEquals([...a.data],[...b.data]))throw new Error('Native encode/decode pixels differ');console.log('exact RGBA roundtrip');",
      ],
      stdout => {
        if (stdout.trim() !== "exact RGBA roundtrip") throw new Error("Native pixel gate did not run");
      },
    );
  } finally {
    await rm(scratchTarget, { recursive: true, force: true });
    for (const name of ["container.mp4", "image.png", "decoded.png", "encoded.mkv"])
      await rm(join(directory, name), { force: true });
  }
  const files: Record<string, { bytes: number; sha256: string; mode: number }> = {};
  for await (const entry of new Bun.Glob("**/*").scan({ cwd: directory, onlyFiles: true, dot: true })) {
    const member = entry.replaceAll("\\", "/");
    assertPublicMediaPath(member);
    const path = join(directory, member);
    const actual = await realpath(path);
    const inside = relative(await realpath(directory), actual);
    if (inside.startsWith("..") || isAbsolute(inside)) throw new Error("Release file escaped the assembled payload");
    files[member] = { bytes: Bun.file(path).size, sha256: await hashSDKFile(path), mode: modes[member] ?? 0o644 };
  }
  const manifest = {
    schema: 1,
    kind: "bun-media-release",
    source: input.source,
    version,
    target: target.target,
    triplet: target.triplet,
    channel: "candidate",
    qualification: `native-${target.target}-media-executable-and-sdk`,
    native: true,
    passed: true,
    runtimeSHA256: files[runtimeName]!.sha256,
    executableSHA256: files[videoName]!.sha256,
    completeFactoryReleaseQualified: false,
    sdk,
    media,
    gates,
    files,
    limits: [
      `Native ${target.target} only; complete release requires all eight matching platform receipts`,
      "GPU/browser/DRM/remote-service behavior requires separate qualification",
      "SDK external npm dependencies retain their declared registry contract",
      "FilmCraft gate checks MP4 metadata; native FFV1 encode/decode is qualified separately",
    ],
  };
  await Bun.write(join(directory, "bun-media-release.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const archive = join(output, `${target.triplet}.zip`);
  await archiveMediaReleaseFiles(directory, archive, [...Object.keys(files), "bun-media-release.json"], {
    triplet: target.triplet,
    modes,
  });
  for (const [member, identity] of Object.entries(files))
    if ((await hashSDKFile(join(directory, member))) !== identity.sha256)
      throw new Error(`Release member changed while archiving: ${member}`);
  await assertSource(sourceRoot, input.source);
  const sha256 = await hashSDKFile(archive);
  await Bun.write(join(output, "SHA256SUMS.txt"), `${sha256}  ${basename(archive)}\n`);
  const receipt = { ...manifest, archive: { name: basename(archive), sha256, bytes: Bun.file(archive).size } };
  await Bun.write(join(output, "media-release-qualification.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  return { archive, sha256, bytes: receipt.archive.bytes, receipt: join(output, "media-release-qualification.json") };
}

export function packageWindowsMediaRelease(input: MediaReleaseInput) {
  return packageMediaRelease({ ...input, target: "windows-x64" });
}

if (import.meta.main) {
  const action = Bun.argv[2] === "plan" ? "plan" : "package";
  const configuration = Bun.argv[action === "plan" ? 3 : 2];
  if (!configuration)
    throw new Error("Usage: bun scripts/aphrody/media-release.ts [plan] <absolute-release-input.json>");
  if (!isAbsolute(configuration)) throw new Error("Media release configuration path must be absolute");
  const input = await Bun.file(configuration).json();
  console.log(
    JSON.stringify(action === "plan" ? await planMediaRelease(input) : await packageMediaRelease(input), null, 2),
  );
}
