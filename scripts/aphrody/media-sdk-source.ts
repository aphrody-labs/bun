import { realpath, stat } from "node:fs/promises";
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

export async function verifyMediaSourceOwner(name: MediaSource, source: string) {
  const pin = sources.sources[name];
  if (!pin) throw new TypeError("Unknown media source owner");
  if (!isAbsolute(source)) throw new TypeError("Media source owner must be absolute");
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
  const tree = await mediaSourceTree(source);
  if ("sourceTreeSHA256" in pin && tree.sourceTreeSHA256 !== pin.sourceTreeSHA256)
    throw new Error(`Media dependency source content differs from its pinned tree: ${name}`);
  if (pin.licenses.some(license => !Object.hasOwn(tree.files, license)))
    throw new Error(`Media source lacks retained license notices: ${name}`);
  return { name, ...identity, ...tree, licenses: pin.licenses, clean: true as const };
}
