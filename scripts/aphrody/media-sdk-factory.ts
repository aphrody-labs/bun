import { mkdir, realpath, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { qualifyMediaELFs, qualifyMediaMachOs, type MediaELF, type MediaMachO } from "./media-sdk-abi";
import { mediaSDKTool as nativeTool, verifyMediaSourceOwner } from "./media-sdk-source";
import { binaryImports, isMediaSystemDLL } from "./media-stage";
import { loadCommands } from "../build/verify-binary";
import { assertPublicMediaPath } from "./media-release";
import {
  extractMediaSDKArchive,
  hashSDKFile,
  mediaSDKPlan,
  verifyMediaSDKLayout,
  type MediaSDKComponent,
  type MediaSDKTarget,
} from "../../packages/bun-video/src/sdk";

export async function verifyMediaSource(component: MediaSDKComponent, source: string): Promise<void> {
  await verifyMediaSourceOwner(component, source);
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
  if (!target.startsWith("windows") && process.platform !== (target.startsWith("darwin") ? "darwin" : "linux"))
    throw new Error("SDK normalization needs its native binary relocation owner");
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
  const first = roots[0];
  const prefix = roots.length === 1 && first?.isDirectory() ? join(extracted, first.name) : extracted;
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
  const binaryNormalization = await normalizeMediaSDKPrefix(component, target, prefix);
  return archiveMediaSDKPrefix(component, target, prefix, workspace, { upstream: asset, binaryNormalization });
}

export async function normalizeMediaSDKPrefix(component: MediaSDKComponent, target: MediaSDKTarget, prefix: string) {
  mediaSDKPlan(component, target);
  const canonicalPrefix = await realpath(prefix),
    workspace = prefix;
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
    const executables: string[] = [];
    for await (const name of new Bun.Glob("bin/*").scan({ cwd: prefix, onlyFiles: true }))
      executables.push(name.slice(4));
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
  } else if (target.startsWith("darwin")) {
    if (process.platform !== "darwin") throw new Error("Mach-O relocation requires the native Darwin tool owner");
    const installNameTool = Bun.which("install_name_tool"),
      objdump = Bun.which("llvm-objdump"),
      codesign = Bun.which("codesign");
    if (!installNameTool || !objdump || !codesign)
      throw new Error("Mach-O normalization needs install_name_tool, LLVM objdump and codesign");
    const libraryNames = new Set<string>();
    for await (const name of new Bun.Glob("lib/*.dylib").scan({ cwd: prefix, onlyFiles: true }))
      libraryNames.add(name.slice(4));
    const seen = new Set<string>();
    for await (const raw of new Bun.Glob("{bin,lib}/*").scan({ cwd: prefix, onlyFiles: true, followSymlinks: true })) {
      const file = raw.replaceAll("\\", "/");
      if (!file.startsWith("bin/") && !file.endsWith(".dylib")) continue;
      const path = await realpath(join(prefix, file)),
        within = relative(canonicalPrefix, path);
      if (within.startsWith("..") || isAbsolute(within)) throw new Error("SDK Mach-O image escaped its prefix");
      if (seen.has(path)) continue;
      seen.add(path);
      await binaryImports(path, target);
      const commands = loadCommands(await nativeTool([objdump, "--macho", "--private-headers", path], prefix));
      const args: string[] = [];
      if (file.startsWith("lib/")) args.push("-id", `@rpath/${within.replaceAll("\\", "/").slice(4)}`);
      for (const command of commands) {
        if (/^LC_(LOAD|LOAD_WEAK|REEXPORT|LOAD_UPWARD|LAZY_LOAD)_DYLIB$/.test(command.cmd)) {
          const name = command.text.match(/^\s*name (\S+) \(offset \d+\)\s*$/m)?.[1];
          if (name && libraryNames.has(name.slice(name.lastIndexOf("/") + 1))) {
            const replacement = `@rpath/${name.slice(name.lastIndexOf("/") + 1)}`;
            if (name !== replacement) args.push("-change", name, replacement);
          }
        } else if (command.cmd === "LC_RPATH") {
          const path = command.text.match(/^\s*path (\S+) \(offset \d+\)\s*$/m)?.[1];
          if (path) args.push("-delete_rpath", path);
        }
      }
      args.push("-add_rpath", file.startsWith("lib/") ? "@loader_path" : "@loader_path/../lib");
      await nativeTool([installNameTool, ...args, path], prefix);
      await nativeTool([codesign, "--force", "--sign", "-", path], prefix);
    }
    binaryNormalization = {
      tool: "install_name_tool+codesign",
      version: "native Darwin tools",
      libraries: "@rpath",
      executables: "@loader_path/../lib",
    };
  }
  return binaryNormalization;
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
  const binaryClosure = await qualifyMediaSDKClosure(target, prefix);
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
    assertPublicMediaPath(normalized);
    if (normalized === "bun-sdk-receipt.json") continue;
    entries[normalized] = {
      data: await Bun.file(path).bytes(),
      mode: normalized.startsWith("bin/") ? 0o755 : 0o644,
      mtime: 0,
    };
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
    ...(target.startsWith("linux-") ? { linuxABI: binaryClosure } : { binaryClosure }),
    ...(metadata.nativeQualification ? { nativeQualification: metadata.nativeQualification } : {}),
    ...(metadata.dependencies ? { dependencies: metadata.dependencies } : {}),
  };
  entries["bun-sdk-receipt.json"] = { data: JSON.stringify(receipt, null, 2), mode: 0o644, mtime: 0 };
  await Bun.write(join(prefix, "bun-sdk-receipt.json"), JSON.stringify(receipt, null, 2));
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

export async function qualifyMediaSDKClosure(target: MediaSDKTarget, prefix: string) {
  if (target.startsWith("linux")) return qualifyLinuxMediaSDK(target, prefix);
  const canonical = await realpath(prefix);
  const images: Array<{ file: string; path: string; sha256: string }> = [];
  for await (const raw of new Bun.Glob("{bin,lib}/*").scan({ cwd: prefix, onlyFiles: true, followSymlinks: true })) {
    const file = raw.replaceAll("\\", "/");
    if (
      !(target.startsWith("windows") ? /\.(exe|dll)$/i.test(file) : file.startsWith("bin/") || file.endsWith(".dylib"))
    )
      continue;
    const path = await realpath(join(prefix, raw));
    const member = relative(canonical, path);
    if (member.startsWith("..") || isAbsolute(member) || images.length >= 1024)
      throw new Error("Media binary closure escaped its bounded prefix");
    await binaryImports(path, target);
    images.push({ file, path, sha256: await hashSDKFile(path) });
  }
  if (!images.length) throw new Error("Media binary closure is empty");
  if (target.startsWith("darwin")) {
    const objdump = Bun.which("llvm-objdump");
    if (!objdump) throw new Error("Mach-O qualification needs the canonical LLVM objdump owner");
    const inputs: MediaMachO[] = [];
    for (const image of images)
      inputs.push({
        file: image.file,
        sha256: image.sha256,
        privateHeaders: await nativeTool([objdump, "--macho", "--private-headers", image.path], prefix),
      });
    return qualifyMediaMachOs(target, inputs);
  }
  const bundled = new Set(
    images
      .filter(image => image.file.startsWith("bin/") && image.file.endsWith(".dll"))
      .map(image => image.file.slice(4).toLowerCase()),
  );
  const files: Array<{ file: string; sha256: string; needed: string[] }> = [];
  for (const image of images) {
    const needed = await binaryImports(image.path, target);
    if (needed.some(name => !isMediaSystemDLL(name) && !bundled.has(name.toLowerCase())))
      throw new Error(`Media PE dependency is outside its closure: ${image.file}`);
    files.push({ file: image.file, sha256: image.sha256, needed });
  }
  return { schema: 1, target, qualification: "PE-architecture-and-import-closure-only", files };
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
  if (![source, prefix, workspace].every(isAbsolute)) throw new TypeError("Source SDK paths must be absolute");
  const plan = mediaSDKPlan(component, target);
  if (
    metadata.nativeQualification.target !== target ||
    metadata.nativeQualification.sourceRevision !== plan.sourceRevision ||
    metadata.nativeQualification.sourceClean !== true ||
    (metadata.nativeQualification.status !== "pass" && metadata.nativeQualification.passed !== true)
  )
    throw new Error("Native SDK qualification differs from its target or clean source pin");
  const sourceIdentity = await verifyMediaSourceOwner(component, source);
  return archiveMediaSDKPrefix(component, target, prefix, workspace, {
    source: sourceIdentity,
    binaryNormalization: target.startsWith("linux")
      ? { libraries: "$ORIGIN", executables: "$ORIGIN/../lib" }
      : target.startsWith("darwin")
        ? { libraries: "@rpath", executables: "@loader_path/../lib" }
        : { libraries: "adjacent-bin-DLLs" },
    nativeRuntimeABI: "qualified-by-native-source-build-probes",
    ...metadata,
  });
}

export async function runMediaSDKFactory(component: MediaSDKComponent): Promise<boolean> {
  const action = process.argv[2] ?? "sdk-plan";
  if (
    ["plan", "configure", "build", "sdk-build-native", "sdk-build-linux", "sdk-build-avio", "sdk-build-plan"].includes(
      action,
    )
  ) {
    const { mediaBuildPlan, runMediaBuild } = await import("./media-sdk-build");
    const { mediaSDKHostTarget } = await import("../../packages/bun-video/src/sdk-platform");
    const root = resolve(import.meta.dir, "../..");
    const legacy = ["plan", "configure", "build"].includes(action);
    const [targetArg, sourcesArg, outputArg, ffmpegPrefix] = process.argv.slice(3);
    const target = (legacy ? (Bun.env.BUN_MEDIA_TARGET ?? mediaSDKHostTarget()) : targetArg) as MediaSDKTarget;
    const source = resolve(
      (component === "ffmpeg" ? Bun.env.BUN_FFMPEG_SOURCE : Bun.env.BUN_MPV_SOURCE) ?? join(root, "vendor", component),
    );
    const output = resolve(
      legacy
        ? (Bun.env.BUN_MEDIA_OUTPUT ?? join(root, "build", component === "ffmpeg" ? "ffmpeg" : "libmpv"))
        : (outputArg ?? ""),
    );
    if (!legacy && (!targetArg || !sourcesArg || !outputArg))
      throw new Error("sdk-build requires target, existing source owner root and output");
    if (action === "sdk-build-linux" && !target.startsWith("linux-"))
      throw new Error("sdk-build-linux requires a Linux target");
    const dependencies = JSON.parse(Bun.env.BUN_MEDIA_DEPENDENCY_PREFIXES ?? "{}");
    if (ffmpegPrefix) dependencies.ffmpeg = resolve(ffmpegPrefix);
    if (Bun.env.BUN_MEDIA_ZLIB_PREFIX) dependencies["zlib-ng"] = resolve(Bun.env.BUN_MEDIA_ZLIB_PREFIX);
    const input = {
      component: action === "sdk-build-avio" ? ("avio" as const) : component,
      target,
      root,
      sources: legacy ? dirname(source) : resolve(sourcesArg!),
      ...(legacy ? { source } : {}),
      output,
      prefix: resolve(Bun.env.BUN_MEDIA_PREFIX ?? join(output, "prefix")),
      dependencies,
    };
    console.log(
      JSON.stringify(
        action === "plan" || action === "sdk-build-plan"
          ? mediaBuildPlan(input)
          : await runMediaBuild(input, action === "configure"),
        null,
        2,
      ),
    );
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
