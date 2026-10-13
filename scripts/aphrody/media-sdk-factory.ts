import { mkdir, realpath, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { qualifyMediaELFs, type MediaELF } from "./media-sdk-abi";
import {
  extractMediaSDKArchive,
  hashSDKFile,
  mediaSDKPlan,
  verifyMediaSDKLayout,
  type MediaSDKComponent,
  type MediaSDKTarget,
} from "../../packages/bun-video/src/sdk";

async function nativeTool(argv: string[], cwd: string): Promise<string> {
  await using child = Bun.spawn(argv, {
    cwd,
    stdout: "pipe",
    stderr: "inherit",
    timeout: 120_000,
    killSignal: "SIGKILL",
  });
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  for await (const chunk of child.stdout) {
    bytes += chunk.byteLength;
    if (bytes > 16 * 1024 * 1024) {
      child.kill();
      throw new Error("SDK archive listing exceeded its bound");
    }
    text += decoder.decode(chunk, { stream: true });
  }
  if ((await child.exited) !== 0) throw new Error(`SDK factory native tool failed: ${argv[0]}`);
  return text + decoder.decode();
}

export async function verifyMediaSource(component: MediaSDKComponent, source: string): Promise<void> {
  const plan = mediaSDKPlan(component, "linux-x64");
  if (!plan.sourceRevision || !plan.sourceRepository) throw new Error("Media source lacks an exact upstream pin");
  const git = Bun.which("git");
  if (!git) throw new Error("Media factory needs the installed native Git owner");
  if ((await nativeTool([git, "rev-parse", "HEAD"], source)).trim() !== plan.sourceRevision)
    throw new Error("Media factory source does not match its pinned revision");
  if ((await nativeTool([git, "status", "--porcelain", "--untracked-files=normal"], source)).trim())
    throw new Error("Media factory source contains unpublished changes");
}

export async function bootstrapMediaSource(component: MediaSDKComponent, source: string): Promise<void> {
  if (!isAbsolute(source)) throw new TypeError("Media source directory must be absolute");
  const plan = mediaSDKPlan(component, "linux-x64");
  if (!plan.sourceRevision || !plan.sourceRepository) throw new Error("Media source lacks an exact upstream pin");
  const git = Bun.which("git");
  if (!git) throw new Error("Media factory needs the installed native Git owner");
  await mkdir(source, { recursive: false });
  await nativeTool([git, "init", source], source);
  await nativeTool([git, "remote", "add", "origin", plan.sourceRepository], source);
  await nativeTool([git, "fetch", "--depth=1", "origin", plan.sourceRevision], source);
  await nativeTool([git, "checkout", "--detach", "FETCH_HEAD"], source);
  await verifyMediaSource(component, source);
}

export async function normalizeMediaSDK(
  component: MediaSDKComponent,
  target: MediaSDKTarget,
  archive: string,
  workspace: string,
  options: { reuseExtracted?: boolean } = {},
) {
  if (process.platform !== "linux") throw new Error("SDK normalization belongs to the qualified Linux factory");
  if (!isAbsolute(archive) || !isAbsolute(workspace)) throw new TypeError("Factory paths must be absolute");
  const plan = mediaSDKPlan(component, target);
  const sha256 = await hashSDKFile(archive);
  const asset = plan.upstreamAssets?.find(asset => asset.sha256 === sha256);
  if (!asset || (await stat(archive)).size !== asset.bytes)
    throw new Error("Factory input does not match its upstream pin");
  const extracted = join(workspace, "extracted");
  if (!options.reuseExtracted) {
    await mkdir(workspace, { recursive: false, mode: 0o700 });
    await mkdir(extracted, { mode: 0o700 });
  }
  if (!options.reuseExtracted && asset.format === "zip") await extractMediaSDKArchive(archive, extracted);
  else if (!options.reuseExtracted) {
    const tool = Bun.which("bsdtar") ?? Bun.which("tar");
    if (!tool) throw new Error("SDK factory needs installed bsdtar or tar to normalize upstream XZ");
    const names = (await nativeTool([tool, "-tf", archive], workspace)).split(/\r?\n/).filter(Boolean);
    if (
      names.length > 100_000 ||
      names.some(
        name => name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.replaceAll("\\", "/").split("/").includes(".."),
      )
    )
      throw new Error("Upstream archive contains unsafe paths or too many members");
    await nativeTool([tool, "-xf", archive, "-C", extracted, "--no-same-owner", "--no-same-permissions"], workspace);
  }
  const roots = await readdir(extracted, { withFileTypes: true });
  const prefix = roots.length === 1 && roots[0].isDirectory() ? join(extracted, roots[0].name) : extracted;
  const canonicalPrefix = await realpath(prefix);
  if (options.reuseExtracted) {
    const previous = await Bun.file(join(workspace, "distribution.json")).json();
    if (previous.sourceRevision !== plan.sourceRevision || previous.upstream?.sha256 !== asset.sha256)
      throw new Error("Existing SDK extraction differs from its pinned source");
    for (const [name, expected] of Object.entries(previous.files as Record<string, string>)) {
      const path = await realpath(join(prefix, name));
      const member = relative(canonicalPrefix, path);
      if (member.startsWith("..") || isAbsolute(member) || (await hashSDKFile(path)) !== expected)
        throw new Error("Existing SDK extraction changed since its previous receipt");
    }
  }
  for await (const name of new Bun.Glob("lib/pkgconfig/*.pc").scan({ cwd: prefix, onlyFiles: true })) {
    const path = await realpath(join(prefix, name));
    const member = relative(canonicalPrefix, path);
    if (member.startsWith("..") || isAbsolute(member)) throw new Error("SDK pkg-config file escaped its prefix");
    const file = Bun.file(path);
    if (file.size > 1024 * 1024) throw new Error("SDK pkg-config file exceeded its bound");
    const original = await file.text();
    if (!/^prefix=/m.test(original)) throw new Error("SDK pkg-config file has no relocatable prefix");
    const content = original
      .replace(/^prefix=.*$/m, "prefix=${pcfiledir}/../..")
      .replace(/^exec_prefix=.*$/m, "exec_prefix=${prefix}")
      .replace(/^libdir=.*$/m, "libdir=${prefix}/lib")
      .replace(/^includedir=.*$/m, "includedir=${prefix}/include");
    await Bun.write(path, content);
  }
  let binaryNormalization: { tool: string; version: string; libraries: string; executables: string } | undefined;
  if (target.startsWith("linux")) {
    const patcher = Bun.which("patchelf");
    if (!patcher) throw new Error("Linux SDK normalization needs patchelf for relocatable shared libraries");
    const libraries = new Set<string>();
    for await (const name of new Bun.Glob("lib/*.so*").scan({ cwd: prefix, onlyFiles: true, followSymlinks: true })) {
      const path = await realpath(join(prefix, name));
      const member = relative(canonicalPrefix, path);
      if (member.startsWith("..") || isAbsolute(member)) throw new Error("SDK library escaped its prefix");
      libraries.add(path);
    }
    for (const path of libraries) {
      if ((await nativeTool([patcher, "--print-rpath", path], workspace)).trim() !== "$ORIGIN")
        await nativeTool([patcher, "--set-rpath", "$ORIGIN", path], workspace);
    }
    const executables = component === "ffmpeg" ? ["ffmpeg", "ffprobe"] : ["mpv"];
    for (const executable of executables) {
      const path = await realpath(join(prefix, "bin", executable));
      const member = relative(canonicalPrefix, path);
      if (member.startsWith("..") || isAbsolute(member)) throw new Error("SDK executable escaped its prefix");
      if ((await nativeTool([patcher, "--print-rpath", path], workspace)).trim() !== "$ORIGIN/../lib")
        await nativeTool([patcher, "--set-rpath", "$ORIGIN/../lib", path], workspace);
    }
    binaryNormalization = {
      tool: "patchelf",
      version: (await nativeTool([patcher, "--version"], workspace)).trim(),
      libraries: "$ORIGIN",
      executables: "$ORIGIN/../lib",
    };
  }
  return archiveMediaSDKPrefix(component, target, prefix, workspace, { upstream: asset, binaryNormalization });
}

async function archiveMediaSDKPrefix(
  component: MediaSDKComponent,
  target: MediaSDKTarget,
  prefix: string,
  workspace: string,
  metadata: Record<string, unknown>,
) {
  const plan = mediaSDKPlan(component, target);
  const layout = await verifyMediaSDKLayout(component, target, prefix);
  const linuxABI = target.startsWith("linux-") ? await qualifyLinuxMediaSDK(target, prefix) : undefined;
  const entries: Record<string, Bun.ArchiveEntry> = {};
  const fileHashes: Record<string, string> = {};
  const canonical = await realpath(prefix);
  let expanded = 0;
  let count = 0;
  for await (const name of new Bun.Glob("**/*").scan({
    cwd: prefix,
    onlyFiles: true,
    followSymlinks: true,
    dot: true,
  })) {
    const file = join(prefix, name);
    const path = await realpath(file);
    const member = relative(canonical, path);
    if (member.startsWith("..") || isAbsolute(member)) throw new Error("SDK symlink escaped the factory prefix");
    const info = await stat(path);
    if (!info.isFile()) throw new Error("SDK member is not a regular file");
    expanded += info.size;
    if (++count > 100_000 || expanded > 2 * 1024 * 1024 * 1024) throw new Error("SDK expanded file budget exceeded");
    const normalized = name.replaceAll("\\", "/");
    entries[normalized] = { data: await Bun.file(path).bytes(), mode: info.mode & 0o777, mtime: 0 };
    fileHashes[normalized] = await hashSDKFile(path);
  }
  const filename = `${component}-${plan.version}-${target}-sdk.zip`;
  const output = join(workspace, filename);
  const receipt = {
    schema: 1,
    component,
    target,
    version: plan.version,
    sourceRevision: plan.sourceRevision,
    ...(metadata.source ? { source: metadata.source } : { upstream: metadata.upstream }),
    qualification: layout.qualification,
    licenses: layout.licenses,
    files: fileHashes,
    symlinks: "materialized-contained-files",
    binaryNormalization: metadata.binaryNormalization,
    nativeRuntimeABI: metadata.nativeRuntimeABI ?? "not-yet-qualified",
    ...(linuxABI ? { linuxABI } : {}),
    ...(metadata.nativeQualification ? { nativeQualification: metadata.nativeQualification } : {}),
    ...(metadata.dependencies ? { dependencies: metadata.dependencies } : {}),
  };
  entries["bun-sdk-receipt.json"] = { data: JSON.stringify(receipt, null, 2), mode: 0o644, mtime: 0 };
  await Bun.write(output, await new Bun.Archive(entries, { format: "zip", mtime: 0 }).blob());
  const distribution = {
    url: `https://bun-lib.aphrody.app/media/${filename}`,
    sha256: await hashSDKFile(output),
    bytes: (await stat(output)).size,
    format: "zip",
  };
  await Bun.write(join(workspace, "distribution.json"), JSON.stringify({ ...receipt, asset: distribution }, null, 2));
  return { output, distribution, qualification: receipt.qualification };
}

export async function qualifyLinuxMediaSDK(target: MediaSDKTarget, prefix: string) {
  if (process.platform !== "linux") throw new Error("SDK ELF inspection belongs to the Linux factory");
  const readelf = Bun.which("llvm-readelf") ?? Bun.which("readelf");
  if (!readelf) throw new Error("SDK ELF inspection requires the installed readelf owner");
  const canonical = await realpath(prefix);
  const inputs: MediaELF[] = [];
  for await (const name of new Bun.Glob("{bin,lib}/*").scan({ cwd: prefix, onlyFiles: true, followSymlinks: true })) {
    const path = await realpath(join(prefix, name));
    const member = relative(canonical, path);
    if (member.startsWith("..") || isAbsolute(member)) throw new Error("SDK ELF member escaped its prefix");
    const magic = await Bun.file(path).slice(0, 4).bytes();
    if (magic.length !== 4 || magic[0] !== 0x7f || magic[1] !== 0x45 || magic[2] !== 0x4c || magic[3] !== 0x46)
      continue;
    if (inputs.length >= 1024) throw new Error("SDK ELF inventory exceeds its bound");
    inputs.push({
      file: name.replaceAll("\\", "/"),
      sha256: await hashSDKFile(path),
      header: await nativeTool([readelf, "--file-header", path], prefix),
      dynamic: await nativeTool([readelf, "--dynamic", path], prefix),
      versions: await nativeTool([readelf, "--version-info", path], prefix),
      programHeaders: await nativeTool([readelf, "--program-headers", path], prefix),
    });
  }
  return qualifyMediaELFs(target, inputs);
}

/** Package a native source build without inventing a prebuilt upstream asset. */
export async function packageBuiltMediaSDK(
  component: MediaSDKComponent,
  target: MediaSDKTarget,
  source: string,
  prefix: string,
  workspace: string,
  metadata: { nativeQualification: Record<string, unknown>; dependencies: Record<string, unknown> },
) {
  if (process.platform !== "linux") throw new Error("Source SDK packaging belongs to the qualified Linux factory");
  if (![source, prefix, workspace].every(isAbsolute)) throw new TypeError("Source SDK paths must be absolute");
  const plan = mediaSDKPlan(component, target);
  if (
    metadata.nativeQualification.target !== target ||
    metadata.nativeQualification.sourceRevision !== plan.sourceRevision ||
    metadata.nativeQualification.sourceClean !== true
  )
    throw new Error("Native SDK qualification differs from its target or clean source pin");
  await verifyMediaSource(component, source);
  const sourceFiles: Record<string, { sha256: string; bytes: number }> = {};
  const canonicalSource = await realpath(source);
  const names = (await nativeTool(["git", "ls-files", "-z"], source)).split("\0").filter(Boolean);
  let bytes = 0;
  for (const name of names) {
    const path = await realpath(join(source, name));
    const member = relative(canonicalSource, path);
    if (member.startsWith("..") || isAbsolute(member)) throw new Error("SDK source escaped its owner checkout");
    const info = await stat(path);
    bytes += info.size;
    if (!info.isFile() || names.length > 100_000 || bytes > 512 * 1024 * 1024)
      throw new Error("SDK source byte or file budget exceeded");
    sourceFiles[name] = { sha256: await hashSDKFile(path), bytes: info.size };
  }
  return archiveMediaSDKPrefix(component, target, prefix, workspace, {
    source: {
      repository: plan.sourceRepository,
      commit: plan.sourceRevision,
      tree: (await nativeTool(["git", "rev-parse", "HEAD^{tree}"], source)).trim(),
      files: sourceFiles,
      fileBytes: bytes,
      clean: true,
    },
    binaryNormalization: { libraries: "$ORIGIN", executables: "$ORIGIN/../lib" },
    nativeRuntimeABI: "qualified-by-native-source-build-probes",
    ...metadata,
  });
}

export async function runMediaSDKFactory(component: MediaSDKComponent): Promise<boolean> {
  if (process.argv[2] === "sdk-build-linux") {
    if (process.platform !== "linux") throw new Error("Portable SDK builds belong to the Linux factory");
    const [target, sources, output, ffmpegPrefix] = process.argv.slice(3);
    if (!target || !/^linux-(?:x64|arm64)(?:-musl)?$/.test(target) || !sources || !output)
      throw new TypeError(
        "sdk-build-linux requires Linux target, source owner root, output and optional FFmpeg prefix",
      );
    const bash = Bun.which("bash");
    if (!bash) throw new Error("Portable SDK builds require the native Bash build owner");
    await using child = Bun.spawn(
      [
        bash,
        join(import.meta.dir, "media-sdk-linux.sh"),
        target,
        component,
        resolve(sources),
        resolve(output),
        ...(ffmpegPrefix ? [resolve(ffmpegPrefix)] : []),
      ],
      { stdout: "inherit", stderr: "inherit", timeout: 10_800_000, killSignal: "SIGTERM" },
    );
    if ((await child.exited) !== 0) throw new Error("Portable SDK build failed; inspect its bounded factory log");
    return true;
  }
  if (process.argv[2] === "sdk-source") {
    const source = process.argv[3];
    if (!source) throw new TypeError("sdk-source requires a new source directory");
    await bootstrapMediaSource(component, resolve(source));
    return true;
  }
  if (process.argv[2] !== "sdk-normalize") return false;
  const [target, archive, workspace] = process.argv.slice(3);
  if (!target || !archive || !workspace)
    throw new TypeError("sdk-normalize requires target, pinned archive and new workspace");
  console.log(
    JSON.stringify(
      await normalizeMediaSDK(component, target as MediaSDKTarget, resolve(archive), resolve(workspace)),
      null,
      2,
    ),
  );
  return true;
}
