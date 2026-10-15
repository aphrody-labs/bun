import { lstat, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import sources from "./media-sdk-sources.json";
import { hashSDKFile } from "../../packages/bun-video/src/sdk";

export type MediaSource = keyof typeof sources.sources;

export async function mediaSDKTool(
  argv: string[],
  cwd: string,
  timeout = 120_000,
  env?: Record<string, string | undefined>,
): Promise<string> {
  await using child = Bun.spawn(argv, {
    cwd,
    stdout: "pipe",
    stderr: "inherit",
    timeout,
    killSignal: "SIGKILL",
    ...(env ? { env } : {}),
  });
  let text = "",
    bytes = 0;
  const decoder = new TextDecoder();
  for await (const chunk of child.stdout) {
    if ((bytes += chunk.byteLength) > 16 * 1024 * 1024) {
      child.kill();
      throw new Error("Media SDK tool output exceeded its bound");
    }
    text += decoder.decode(chunk, { stream: true });
  }
  if ((await child.exited) !== 0) throw new Error(`Media SDK native tool failed: ${argv[0]}`);
  return text + decoder.decode();
}

/** Same content contract as the portable source receipt; includes notices and build inputs. */
export async function mediaSourceTree(source: string, trackedNames?: string[]) {
  if (!isAbsolute(source)) throw new TypeError("Media source owner must be absolute");
  const canonical = await realpath(source);
  const files: Record<string, { bytes: number; sha256: string }> = {};
  let fileBytes = 0,
    count = 0;
  const names =
    trackedNames ?? new Bun.Glob("**/*").scan({ cwd: canonical, onlyFiles: true, dot: true, followSymlinks: true });
  for await (const raw of names) {
    const name = raw.replaceAll("\\", "/");
    if (name === ".git" || name.startsWith(".git/") || name.startsWith(".pc/")) continue;
    const path = await realpath(join(canonical, raw));
    const member = relative(canonical, path);
    if (member.startsWith("..") || isAbsolute(member)) throw new Error("Media source escaped its existing owner");
    const info = await stat(path);
    if (!info.isFile() || ++count > 100_000 || (fileBytes += info.size) > 512 * 1024 * 1024)
      throw new Error("Media source file or byte budget exceeded");
    files[name] = { bytes: info.size, sha256: await hashSDKFile(path) };
  }
  if (!count) throw new Error("Media source owner is empty");
  const ordered = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
  return {
    files,
    fileBytes,
    sourceTreeSHA256: new Bun.CryptoHasher("sha256").update(JSON.stringify(ordered)).digest("hex"),
  };
}

/** Project only the installed Vulkan header owners, never unrelated system includes. */
export async function mediaVulkanHeaderTree(include: string) {
  if (!isAbsolute(include)) throw new TypeError("Vulkan include owner must be absolute");
  const root = await realpath(include),
    names: string[] = [];
  let bytes = 0,
    entries = 0;
  for (const directory of ["vulkan", "vk_video"]) {
    const path = join(root, directory);
    if (!(await lstat(path)).isDirectory() || (await realpath(path)) !== path)
      throw new Error("Vulkan header directory must be a regular owned directory");
    for await (const name of new Bun.Glob("**/*").scan({
      cwd: path,
      onlyFiles: false,
      dot: true,
      followSymlinks: false,
    })) {
      const relative = `${directory}/${name.replaceAll("\\", "/")}`;
      const file = join(root, relative),
        info = await lstat(file);
      if (++entries > 2048 || (await realpath(file)) !== file || info.isSymbolicLink())
        throw new Error("Vulkan header projection contains an unowned link or too many entries");
      if (info.isDirectory()) continue;
      if (!info.isFile() || names.length >= 1024 || (bytes += info.size) > 64 * 1024 ** 2)
        throw new Error("Vulkan header projection exceeds its regular file or byte bounds");
      names.push(relative);
    }
  }
  if (!names.includes("vulkan/vulkan.h")) throw new Error("Vulkan header projection lacks its public entry header");
  return mediaSourceTree(root, names);
}

export async function verifyMediaVulkanOwner(include: string, notice: string) {
  const tree = await mediaVulkanHeaderTree(include);
  if (tree.sourceTreeSHA256 !== "4425ad64534df71ce409291dbb5239ca600a7dcdbc9bc879abf6474ee6c57ade")
    throw new Error("Vulkan header content differs from the recorded source owner");
  if (
    !isAbsolute(notice) ||
    !(await Bun.file(notice).exists()) ||
    !Bun.file(notice).size ||
    Bun.file(notice).size > 1024 * 1024
  )
    throw new Error("Pinned Vulkan headers require their existing license notice owner");
  const sha256 = await hashSDKFile(notice);
  if (sha256 !== "c579213e28f67944a7e407816b8a8e1d2d2406b3d820e420aa923807c450dc07")
    throw new Error("Vulkan license notice differs from the recorded source owner");
  return {
    headers: { ...tree, version: "libvulkan-dev=1.4.341.0-1", hardwareQualification: false },
    license: { sha256, bytes: Bun.file(notice).size },
  };
}

export async function verifyMediaSourceOwner(name: MediaSource, source: string) {
  const pin = sources.sources[name];
  if (!pin) throw new TypeError("Unknown media source owner");
  if (!isAbsolute(source)) throw new TypeError("Media source owner must be absolute");
  const tree = await mediaSourceTree(source);
  if ("sourceTreeSHA256" in pin && tree.sourceTreeSHA256 !== pin.sourceTreeSHA256)
    throw new Error(`Media dependency source content differs from its pinned tree: ${name}`);
  if (pin.licenses.some(license => !Object.hasOwn(tree.files, license)))
    throw new Error(`Media source lacks retained license notices: ${name}`);
  const gitDirectory = await lstat(join(source, ".git")).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if ("revision" in pin && "sourceTreeSHA256" in pin && !gitDirectory?.isDirectory())
    return {
      name,
      provenance: "pinned-source-tree",
      repository: pin.repository,
      commit: pin.revision,
      ...tree,
      licenses: pin.licenses,
      clean: true as const,
    };
  const git = Bun.which("git");
  let identity: Record<string, unknown>;
  if ("revision" in pin) {
    if (!git) throw new Error("Media source verification needs the installed Git owner");
    const head = (await mediaSDKTool([git, "rev-parse", "HEAD"], source)).trim();
    const embedded = (await mediaSDKTool([git, "rev-parse", "--show-prefix"], source)).trim();
    if ((await mediaSDKTool([git, "status", "--porcelain", "--untracked-files=normal", "--", "."], source)).trim())
      throw new Error(`Media source contains unpublished changes: ${name}`);
    if (!embedded) {
      if (head !== pin.revision) throw new Error(`Media source revision differs from its catalogue pin: ${name}`);
      const remote = (await mediaSDKTool([git, "remote", "get-url", "origin"], source)).trim().replace(/\.git$/, "");
      if (remote !== pin.repository) throw new Error(`Media source repository differs from its catalogue pin: ${name}`);
      identity = { provenance: "clean-upstream-git", repository: pin.repository, commit: head };
    } else {
      const receiptFile = Bun.file(join(source, "UPSTREAM.json"));
      if (receiptFile.size > 1024 * 1024) throw new Error("Vendored source receipt exceeded its bound");
      const receipt = await receiptFile.json();
      if (receipt.repository !== pin.repository || receipt.commit !== pin.revision)
        throw new Error(`Vendored source receipt differs from its catalogue pin: ${name}`);
      identity = {
        provenance: "clean-vendored-upstream-receipt",
        repository: pin.repository,
        commit: pin.revision,
        ownerRevision: head,
        ownerTree: (await mediaSDKTool([git, "rev-parse", `HEAD:${embedded.replace(/\/$/, "")}`], source)).trim(),
        upstreamReceiptSHA256: await hashSDKFile(join(source, "UPSTREAM.json")),
      };
    }
  } else identity = { provenance: "pinned-source-tree", version: pin.version, dscSHA256: pin.dscSHA256 };
  return { name, ...identity, ...tree, licenses: pin.licenses, clean: true as const };
}

const snapshotOwners = [
  "ffmpeg",
  "mpv",
  "libplacebo",
  "fast_float",
  "freetype",
  "fribidi",
  "harfbuzz",
  "libass",
] as const;
const sourcePath = (root: string, name: (typeof snapshotOwners)[number]) =>
  join(root, name === "fast_float" ? "libplacebo/3rdparty/fast_float" : name);
const snapshotCatalogueSHA256 = () => new Bun.CryptoHasher("sha256").update(JSON.stringify(sources)).digest("hex");
interface SnapshotPorts {
  source?: typeof verifyMediaSourceOwner;
  vulkan?: typeof verifyMediaVulkanOwner;
}

/** Export only source-owner-verified bytes; the resulting artifact has no native qualification. */
export async function snapshotMediaSources(
  input: {
    sources: string;
    include: string;
    notice: string;
    output: string;
  },
  ports: SnapshotPorts = {},
) {
  if (![input.sources, input.include, input.notice, input.output].every(isAbsolute))
    throw new TypeError("Source snapshot paths must be absolute");
  for (const owner of [input.sources, input.include]) {
    const local = relative(owner, input.output);
    if (!local || (!local.startsWith("..") && !isAbsolute(local)))
      throw new Error("Source snapshot artifact overlaps its source owner");
  }
  if (await Bun.file(input.output).exists()) throw new Error("Source snapshot artifact already exists");
  const files: Record<string, Bun.ArchiveEntry> = {};
  const members: Record<string, { sha256: string; bytes: number; mode: number }> = {};
  let bytes = 0,
    count = 0;
  const append = async (name: string, path: string, sha256: string, size: number) => {
    if (members[name]) return;
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || ++count > 200_000 || (bytes += size) > 1024 ** 3)
      throw new Error("Source snapshot exceeds its regular-file bounds");
    const data = await Bun.file(path).bytes();
    if (data.byteLength !== size || new Bun.CryptoHasher("sha256").update(data).digest("hex") !== sha256)
      throw new Error("Source snapshot changed after owner verification");
    const mode = info.mode & 0o111 ? 0o755 : 0o644;
    members[name] = { sha256, bytes: size, mode };
    files[name] = { data, mode, mtime: 0 };
  };
  for (const name of snapshotOwners) {
    const owner = sourcePath(input.sources, name);
    const receipt = await (ports.source ?? verifyMediaSourceOwner)(name, owner);
    const relativeOwner = name === "fast_float" ? "libplacebo/3rdparty/fast_float" : name;
    for (const [path, pin] of Object.entries(receipt.files))
      await append(`sources/${relativeOwner}/${path}`, join(owner, path), pin.sha256, pin.bytes);
  }
  const vulkan = await (ports.vulkan ?? verifyMediaVulkanOwner)(input.include, input.notice);
  for (const [path, pin] of Object.entries(vulkan.headers.files))
    await append(`include/${path}`, join(input.include, path), pin.sha256, pin.bytes);
  await append("licenses/vulkan.txt", input.notice, vulkan.license.sha256, vulkan.license.bytes);
  const manifest = {
    schema: "bun-media-source-snapshot/v1",
    catalogueSHA256: snapshotCatalogueSHA256(),
    nativeReleaseQualified: false,
    members,
  };
  files["source-snapshot.json"] = { data: JSON.stringify(manifest), mode: 0o644, mtime: 0 };
  await Bun.write(input.output, await new Bun.Archive(files, { compress: "gzip", mtime: 0 }).blob());
  return {
    path: input.output,
    sha256: await hashSDKFile(input.output),
    bytes: Bun.file(input.output).size,
    files: Object.keys(members).length,
    nativeReleaseQualified: false,
  };
}

if (import.meta.main) {
  const [action, sources, include, notice, output, ...extra] = Bun.argv.slice(2);
  if (action !== "snapshot" || !sources || !include || !notice || !output || extra.length)
    throw new Error(
      "Usage: media-sdk-source.ts snapshot <absolute-sources> <absolute-vulkan-include> <absolute-vulkan-notice> <absolute-output.tar.gz>",
    );
  console.log(JSON.stringify(await snapshotMediaSources({ sources, include, notice, output })));
}

/** Materialize regular files only, then independently requalify every catalogue source owner. */
export async function materializeMediaSources(
  input: {
    archive: string;
    sha256: string;
    bytes: number;
    output: string;
  },
  ports: SnapshotPorts = {},
) {
  if (
    ![input.archive, input.output].every(isAbsolute) ||
    !/^[a-f0-9]{64}$/.test(input.sha256) ||
    !Number.isSafeInteger(input.bytes) ||
    input.bytes < 1 ||
    input.bytes > 512 * 1024 ** 2
  )
    throw new Error("Source snapshot requires a bounded immutable artifact pin");
  if (Bun.file(input.archive).size !== input.bytes || (await hashSDKFile(input.archive)) !== input.sha256)
    throw new Error("Source snapshot archive differs from its content pin");
  const entries = await new Bun.Archive(await Bun.file(input.archive).bytes()).files();
  const manifestFile = entries.get("source-snapshot.json");
  if (!manifestFile || manifestFile.size > 32 * 1024 ** 2)
    throw new Error("Source snapshot manifest missing or oversized");
  const manifest = JSON.parse(await manifestFile.text()) as {
    schema?: unknown;
    catalogueSHA256?: unknown;
    nativeReleaseQualified?: unknown;
    members?: Record<string, { sha256: string; bytes: number; mode: number }>;
  };
  if (
    manifest.schema !== "bun-media-source-snapshot/v1" ||
    manifest.catalogueSHA256 !== snapshotCatalogueSHA256() ||
    manifest.nativeReleaseQualified !== false ||
    !manifest.members ||
    Array.isArray(manifest.members)
  )
    throw new Error("Source snapshot catalogue or schema differs");
  const members = Object.entries(manifest.members);
  if (!members.length || members.length > 200_000 || entries.size !== members.length + 1)
    throw new Error("Source snapshot has missing or extra members");
  let expanded = 0;
  for (const [name, pin] of members) {
    if (
      !/^(?:sources\/(?:ffmpeg|mpv|libplacebo|freetype|fribidi|harfbuzz|libass)\/|include\/(?:vulkan|vk_video)\/|licenses\/vulkan\.txt$)/.test(
        name,
      ) ||
      name.includes("\\") ||
      name.includes(":") ||
      name.split("/").some(part => !part || part === "." || part === "..") ||
      // These byte-pinned submodule pointers are source-tree members, never Git authorities.
      (name.split("/").includes(".git") && !/^sources\/libplacebo\/3rdparty\/(?:fast_float|glad)\/\.git$/.test(name)) ||
      !pin ||
      !/^[a-f0-9]{64}$/.test(pin.sha256) ||
      !Number.isSafeInteger(pin.bytes) ||
      pin.bytes < 0 ||
      (pin.mode !== 0o644 && pin.mode !== 0o755) ||
      (expanded += pin.bytes) > 1024 ** 3
    )
      throw new Error("Source snapshot contains an unsafe member or exceeds its bounds");
    const blob = entries.get(name);
    if (
      !blob ||
      blob.size !== pin.bytes ||
      new Bun.CryptoHasher("sha256").update(await blob.bytes()).digest("hex") !== pin.sha256
    )
      throw new Error("Source snapshot member differs from its pin");
  }
  const { mkdir, chmod } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(input.output, { recursive: false, mode: 0o700 });
  for (const [name, pin] of members) {
    const path = join(input.output, name);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await Bun.write(path, entries.get(name)!);
    await chmod(path, pin.mode);
  }
  const roots = {
    sources: join(input.output, "sources"),
    include: join(input.output, "include"),
    notice: join(input.output, "licenses/vulkan.txt"),
  };
  for (const name of snapshotOwners)
    await (ports.source ?? verifyMediaSourceOwner)(name, sourcePath(roots.sources, name));
  await (ports.vulkan ?? verifyMediaVulkanOwner)(roots.include, roots.notice);
  if ((await hashSDKFile(input.archive)) !== input.sha256)
    throw new Error("Source snapshot changed during materialization");
  return {
    ...roots,
    archiveSHA256: input.sha256,
    catalogueSHA256: snapshotCatalogueSHA256(),
    nativeReleaseQualified: false,
  };
}
