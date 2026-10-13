import { mkdir, realpath, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
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
) {
  if (process.platform !== "linux") throw new Error("SDK normalization belongs to the qualified Linux factory");
  if (!isAbsolute(archive) || !isAbsolute(workspace)) throw new TypeError("Factory paths must be absolute");
  const plan = mediaSDKPlan(component, target);
  const sha256 = await hashSDKFile(archive);
  const asset = plan.upstreamAssets?.find(asset => asset.sha256 === sha256);
  if (!asset || (await stat(archive)).size !== asset.bytes)
    throw new Error("Factory input does not match its upstream pin");
  await mkdir(workspace, { recursive: false, mode: 0o700 });
  const extracted = join(workspace, "extracted");
  await mkdir(extracted, { mode: 0o700 });
  if (asset.format === "zip") await extractMediaSDKArchive(archive, extracted);
  else {
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
  const layout = await verifyMediaSDKLayout(component, target, prefix);
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
    upstream: asset,
    qualification: layout.qualification,
    licenses: layout.licenses,
    files: fileHashes,
    symlinks: "materialized-contained-files",
    nativeRuntimeABI: "not-yet-qualified",
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

export async function runMediaSDKFactory(component: MediaSDKComponent): Promise<boolean> {
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
