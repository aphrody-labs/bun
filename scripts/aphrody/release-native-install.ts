import { hostname, tmpdir } from "node:os";
import { aggregateRuntimeFullRelease, runtimeFullAsset, validateNativeMediaTarget } from "./release-aggregation";
import { fullNativeRuntimeFeatures } from "./release-matrix";
import { assertPublicMediaPath, isolatedMediaEnvironment } from "./media-release";
import { mediaSDKHostTarget } from "../../packages/bun-video/src/sdk-platform";
import {
  chmod,
  mkdir,
  stat,
  lstat,
  realpath,
  readdir,
  open,
  mkdtemp,
  rename,
  symlink,
  readlink,
  unlink,
  rm,
  statfs,
} from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { hashSDKFile } from "../../packages/bun-video/src/sdk";
import { assertMediaRuntimeIdentity, mediaReleaseTarget } from "./media-release";

export type NativeGateRunner = (
  id: string,
  command: string[],
  options?: { cwd?: string; env?: Record<string, string | undefined> },
) => Promise<string>;

/** Exercise the shipped installers and native local updater using only candidate bytes. */
export async function qualifyNativeInstall(input: {
  root: string;
  scratch: string;
  target: string;
  source: string;
  version: string;
  runtime: string;
  archive: string;
  run: NativeGateRunner;
}) {
  const target = mediaReleaseTarget(input.target);
  const windows = target.os === "windows";
  const installedRoot = join(input.scratch, "install");
  await mkdir(installedRoot, { recursive: true });
  const installed = join(installedRoot, "bin", windows ? "bun.exe" : "bun");
  const candidateHash = await hashSDKFile(input.runtime);
  const archiveHash = await hashSDKFile(input.archive);
  const tag = `${input.version.includes("-aphrody.") ? "aphrody-v" : "bun-v"}${input.version}`;
  const archiveName = `${target.triplet}.zip`;
  const env = {
    ...process.env,
    HOME: installedRoot,
    USERPROFILE: installedRoot,
    BUN_INSTALL: installedRoot,
    GH_TOKEN: undefined,
    GITHUB_TOKEN: undefined,
    TYPESAFE_API_KEY: undefined,
    TYPESAFE_API_KEY_FILE: undefined,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === `/${tag}/${archiveName}`) return new Response(Bun.file(input.archive));
      if (path === `/${tag}/SHA256SUMS.txt`) return new Response(`${archiveHash}  ${archiveName}\n`);
      return new Response("No fixture", { status: 404 });
    },
  });
  try {
    const installEnv = { ...env, APHRODY_BUN_DIST: server.url.origin };
    const command = windows
      ? [
          "pwsh",
          "-NoProfile",
          "-NonInteractive",
          "-File",
          join(input.root, "scripts/aphrody/install.ps1"),
          "-Version",
          tag,
          "-Flavor",
          "full",
          "-BinDir",
          join(installedRoot, "bin"),
          "-NoPathUpdate",
        ]
      : ["bash", join(input.root, "scripts/aphrody/install.sh"), tag, "full"];
    await input.run("native-install", command, { cwd: installedRoot, env: installEnv });
    if ((await hashSDKFile(installed)) !== candidateHash) throw new Error("Installer changed candidate bytes");
    if (!windows) await chmod(installed, 0o755);
    const probe =
      "console.log(JSON.stringify({version:Bun.version,revision:Bun.revision,platform:process.platform,arch:process.arch,path:process.execPath}))";
    const pathResult = JSON.parse(
      await input.run("native-path", ["bun", "--no-env-file", "-e", probe], {
        cwd: installedRoot,
        env: { ...env, PATH: `${join(installedRoot, "bin")}${delimiter}${process.env.PATH ?? ""}` },
      }),
    );
    assertMediaRuntimeIdentity(pathResult, input.source, input.target);
    if (
      (windows ? resolve(pathResult.path).toLowerCase() : resolve(pathResult.path)) !==
      (windows ? resolve(installed).toLowerCase() : resolve(installed))
    )
      throw new Error("Fresh PATH lookup did not execute the installed candidate");
    const before = await stat(installed);
    const update = await input.run("native-update", [installed, "upgrade", "--no-env-file", "--local", input.runtime], {
      cwd: installedRoot,
      env,
    });
    if (!update.includes("Installed") || (await hashSDKFile(installed)) !== candidateHash)
      throw new Error("Native local update did not install exact candidate bytes");
    const identity = JSON.parse(
      await input.run("native-update-identity", [installed, "--no-env-file", "-e", probe], { cwd: installedRoot, env }),
    );
    assertMediaRuntimeIdentity(identity, input.source, input.target);
    const after = await stat(installed);
    if (before.ino !== 0 && before.ino === after.ino)
      throw new Error("Native local updater retained the original installation file");
  } finally {
    server.stop(true);
  }
}

/** This changes only a unique candidate package on an ephemeral hosted Windows runner. */
export async function qualifyNativeWinget(input: {
  root: string;
  scratch: string;
  target: string;
  source: string;
  version: string;
  runtime: string;
  archive: string;
  run: NativeGateRunner;
}) {
  const target = mediaReleaseTarget(input.target);
  if (process.platform !== "win32" || target.os !== "windows" || process.arch !== target.runtimeArch)
    throw new Error("Winget qualification requires matching native Windows execution");
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted")
    throw new Error("Winget install fixture belongs to an ephemeral GitHub-hosted runner");
  if (!Bun.which("winget")) throw new Error("Native Winget client is missing from the hosted runner");
  const id = `Aphrody.NativeQualification${input.source.slice(0, 12)}`;
  const location = join(input.scratch, "winget");
  const archiveHash = await hashSDKFile(input.archive);
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(Bun.file(input.archive)) });
  const manifest = {
    PackageIdentifier: id,
    PackageVersion: input.version,
    PackageLocale: "en-US",
    Publisher: "Aphrody",
    PackageName: "Bun native candidate qualification",
    License: "MIT",
    ShortDescription: "Exact source candidate fixture",
    Installers: [
      {
        Architecture: target.runtimeArch,
        InstallerType: "zip",
        NestedInstallerType: "portable",
        NestedInstallerFiles: [
          { RelativeFilePath: `${target.triplet}/bun.exe`, PortableCommandAlias: "bun-native-qualification" },
        ],
        Scope: "user",
        InstallerUrl: `${server.url.origin}/${target.triplet}.zip`,
        InstallerSha256: archiveHash,
      },
    ],
    ManifestType: "singleton",
    ManifestVersion: "1.10.0",
  };
  const path = join(input.scratch, "winget.yaml");
  await Bun.write(path, Bun.YAML.stringify(manifest));
  let attempted = false;
  try {
    await input.run("winget-manifest", ["winget", "validate", "--manifest", path, "--disable-interactivity"]);
    await input.run("winget-local-manifest-enable", [
      "winget",
      "settings",
      "--enable",
      "LocalManifestFiles",
      "--disable-interactivity",
    ]);
    attempted = true;
    await input.run("winget-install", [
      "winget",
      "install",
      "--manifest",
      path,
      "--scope",
      "user",
      "--location",
      location,
      "--silent",
      "--disable-interactivity",
      "--accept-package-agreements",
    ]);
    const files = [...new Bun.Glob("**/bun.exe").scanSync({ cwd: location, onlyFiles: true })];
    if (files.length !== 1 || (await hashSDKFile(join(location, files[0]!))) !== (await hashSDKFile(input.runtime)))
      throw new Error("Winget did not install the exact candidate executable");
    const identity = JSON.parse(
      await input.run("winget-identity", [
        join(location, files[0]!),
        "-e",
        "console.log(JSON.stringify({version:Bun.version,revision:Bun.revision,platform:process.platform,arch:process.arch}))",
      ]),
    );
    assertMediaRuntimeIdentity(identity, input.source, input.target);
  } finally {
    try {
      if (attempted)
        await input.run("winget-uninstall", [
          "winget",
          "uninstall",
          "--id",
          id,
          "--exact",
          "--silent",
          "--disable-interactivity",
        ]);
    } finally {
      server.stop(true);
      await input.run("winget-local-manifest-disable", [
        "winget",
        "settings",
        "--disable",
        "LocalManifestFiles",
        "--disable-interactivity",
      ]);
    }
  }
}

export type BundleComponent = "runtime-full" | "media-full";
type BundleFile = { sha256: string; bytes: number; mode: number };
export type QualifiedBundleInstallPlan = {
  schema: 1;
  kind: "bun-qualified-bundle-install-plan";
  component: BundleComponent;
  source: string;
  version: string;
  target: string;
  hostname: string;
  root: string;
  aliasDirectory: string;
  release: string;
  archive: { path: string; sha256: string; bytes: number };
  receiptSHA256: string;
  triplet: string;
  files: Record<string, BundleFile>;
  activation: "posix-current-link" | "windows-machine-path";
  allComponentsQualified: boolean;
  disk: { requiredBytes: number; availableBytes: number };
  priorCurrent: string | null;
  priorAliases: Record<string, string | null>;
  priorWindowsPath?: WindowsPathSnapshot;
};
const bundleHash = (data: Uint8Array | string) => new Bun.CryptoHasher("sha256").update(data).digest("hex");
export const qualifiedInstallPlanSHA256 = (plan: QualifiedBundleInstallPlan) => bundleHash(JSON.stringify(plan));

/** Native Archive owns decoding; inspect ZIP metadata before it allocates any member bodies. */
export async function qualifiedBundleMembers(bytes: Uint8Array, triplet: string) {
  if (bytes.length < 22 || bytes.length > 2 * 1024 ** 3) throw new Error("Bundle archive exceeds its byte bound");
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--)
    if (data.getUint32(at, true) === 0x06054b50 && at + 22 + data.getUint16(at + 20, true) === bytes.length) {
      end = at;
      break;
    }
  if (end < 0 || data.getUint16(end + 4, true) || data.getUint16(end + 6, true))
    throw new Error("Bundle requires a bounded single-disk ZIP");
  const count = data.getUint16(end + 10, true),
    size = data.getUint32(end + 12, true),
    start = data.getUint32(end + 16, true);
  if (!count || count === 65535 || data.getUint16(end + 8, true) !== count || start + size !== end)
    throw new Error("Bundle ZIP inventory is unsupported");
  const names = new Set<string>(),
    folded = new Set<string>();
  let cursor = start,
    expanded = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || data.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("Invalid bundle ZIP directory");
    const nameBytes = data.getUint16(cursor + 28, true),
      extra = data.getUint16(cursor + 30, true),
      comment = data.getUint16(cursor + 32, true);
    const next = cursor + 46 + nameBytes + extra + comment;
    if (next > end) throw new Error("Bundle ZIP directory escaped its bound");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(cursor + 46, cursor + 46 + nameBytes));
    assertPublicMediaPath(name);
    const attrs = data.getUint32(cursor + 38, true),
      mode = attrs >>> 16,
      kind = mode & 0xf000;
    if (
      !name.startsWith(triplet + "/") ||
      name.endsWith("/") ||
      (kind !== 0 && kind !== 0x8000) ||
      mode & 0o7000 ||
      attrs & 0x10 ||
      data.getUint16(cursor + 8, true) & 1
    )
      throw new Error("Bundle contains a nonregular or unsafe member");
    if (
      name
        .split("/")
        .some(
          part =>
            /[. ]$/.test(part) ||
            /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
            /^(?:\.git|\.aphrody|\.gnupg|\.netrc)$/i.test(part),
        )
    )
      throw new Error("Bundle member is private or a reserved host path");
    const key = name.normalize("NFD").toLowerCase();
    if (names.has(name) || folded.has(key)) throw new Error("Bundle contains colliding member paths");
    names.add(name);
    folded.add(key);
    const length = data.getUint32(cursor + 24, true);
    if (length > 1024 ** 3 || (expanded += length) > 4 * 1024 ** 3)
      throw new Error("Bundle expanded closure exceeds its bound");
    cursor = next;
  }
  if (cursor !== end) throw new Error("Bundle ZIP inventory differs from its directory");
  const files = await new Bun.Archive(bytes).files();
  if (files.size !== names.size || [...files.keys()].some(name => !names.has(name)))
    throw new Error("Bundle regular-file closure differs");
  return files;
}

export async function planQualifiedRuntimeInstall(input: {
  directory: string;
  source: string;
  version: string;
  target: string;
  component: BundleComponent;
  root: string;
  aliasDirectory: string;
  hostname: string;
  windowsMachinePath?: boolean;
  windowsPathSnapshot?: WindowsPathSnapshot;
}): Promise<QualifiedBundleInstallPlan> {
  const target = mediaReleaseTarget(input.target),
    windows = target.os === "windows";
  if (!input.hostname || ![input.root, input.aliasDirectory, input.directory].every(isAbsolute))
    throw new Error("Install plan requires explicit absolute paths and hostname");
  if (windows && (!input.windowsMachinePath || !input.windowsPathSnapshot))
    throw new Error("Windows installation requires explicit machine PATH activation");
  if (!windows && input.windowsMachinePath) throw new Error("Windows PATH activation requires a Windows target");
  if (!["runtime-full", "media-full"].includes(input.component)) throw new Error("Unknown bundle component contract");
  const qualification =
    input.component === "runtime-full"
      ? await aggregateRuntimeFullRelease(input.directory, input.source, input.version, [input.target])
      : await validateNativeMediaTarget(input.directory, input.source, input.version, input.target);
  const asset = input.component === "runtime-full" ? runtimeFullAsset(input.target) : target.triplet;
  const receiptPath = join(input.directory, asset + ".qualification.json");
  const receiptBytes = await Bun.file(receiptPath).bytes(),
    receipt = JSON.parse(new TextDecoder().decode(receiptBytes));
  if (qualification.assets[asset + ".qualification.json"] !== bundleHash(receiptBytes))
    throw new Error("Bundle receipt changed during planning");
  const archivePath = join(input.directory, asset + ".zip"),
    archive = await Bun.file(archivePath).bytes();
  if (qualification.assets[asset + ".zip"] !== bundleHash(archive))
    throw new Error("Bundle archive changed during planning");
  const entries = await qualifiedBundleMembers(archive, target.triplet);
  const manifest = input.component === "runtime-full" ? "bun-runtime-full-release.json" : "bun-media-release.json";
  const files: Record<string, BundleFile> = {};
  for (const [path, file] of entries) {
    const member = path.slice(target.triplet.length + 1);
    const original = receipt.files[member];
    const mode = member === manifest ? 0o644 : (original?.mode ?? (member === "bun" ? 0o755 : 0o644));
    if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) throw new Error("Bundle member has unsafe permissions");
    files[member] = { sha256: bundleHash(await file.bytes()), bytes: file.size, mode };
  }
  const flavor = await entries.get(target.triplet + "/release-flavor.json")?.json();
  if (
    flavor?.schema !== 1 ||
    flavor.flavor !== "full" ||
    flavor.target !== input.target ||
    flavor.revision !== input.source ||
    !Bun.deepEquals(flavor.compiledFeatures, fullNativeRuntimeFeatures)
  )
    throw new Error("Bundle compiled feature manifest differs");
  const disk = {
    requiredBytes: archive.length + Object.values(files).reduce((sum, file) => sum + file.bytes, 0) + 1024 ** 3,
    availableBytes: await installAvailableBytes(input.root),
  };
  requireBundleDiskSpace(disk.requiredBytes, disk.availableBytes);
  const priorCurrent = windows ? null : await optionalLink(join(input.root, "current"));
  const priorAliases: Record<string, string | null> = {};
  if (!windows)
    for (const name of ["bun", "bunx"]) priorAliases[name] = await optionalLink(join(input.aliasDirectory, name));
  return {
    disk,
    priorCurrent,
    priorAliases,
    ...(windows ? { priorWindowsPath: input.windowsPathSnapshot } : {}),
    schema: 1,
    kind: "bun-qualified-bundle-install-plan",
    component: input.component,
    source: input.source,
    version: input.version,
    target: input.target,
    hostname: input.hostname,
    root: resolve(input.root),
    aliasDirectory: resolve(input.aliasDirectory),
    release: `${input.component}-${input.version}-${input.source.slice(0, 12)}-${bundleHash(archive).slice(0, 12)}`,
    archive: { path: archivePath, sha256: bundleHash(archive), bytes: archive.length },
    receiptSHA256: bundleHash(receiptBytes),
    triplet: target.triplet,
    files,
    activation: windows ? "windows-machine-path" : "posix-current-link",
    allComponentsQualified: input.component === "media-full",
  };
}

export type WindowsPathSnapshot = { raw: string; kind: "String" | "ExpandString" };
export type BundleInstallPorts = {
  hostname?: () => string;
  availableBytes?: (path: string) => Promise<number>;
  hostTarget?: () => string;
  probe?: (executable: string, plan: QualifiedBundleInstallPlan) => Promise<void>;
  windowsPath?: {
    read: () => Promise<WindowsPathSnapshot>;
    compareAndSwap: (expected: WindowsPathSnapshot, next: WindowsPathSnapshot) => Promise<void>;
    verifyFresh: (directory: string, plan: QualifiedBundleInstallPlan) => Promise<void>;
  };
};
async function installAvailableBytes(path: string): Promise<number> {
  for (let at = resolve(path); ; at = dirname(at)) {
    try {
      const info = await statfs(at);
      return Number(info.bavail) * Number(info.bsize);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(at) === at) throw error;
    }
  }
}
export function requireBundleDiskSpace(required: number, available: number) {
  if (!Number.isSafeInteger(required) || required < 1 || !Number.isFinite(available) || available < required)
    throw new Error("Insufficient free disk for complete bundle and rollback reserve");
}
async function optionalLink(path: string) {
  try {
    return await readlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Managed install pointer or alias is not a symbolic link");
  }
}
async function plainDirectory(path: string) {
  if (!isAbsolute(path)) throw new Error("Bundle directory must be absolute");
  const parts: string[] = [];
  for (let at = resolve(path); dirname(at) !== at; at = dirname(at)) parts.unshift(at);
  for (const part of parts) {
    try {
      await mkdir(part);
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
    }
    if (
      await lstat(join(part, ".git")).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false;
          throw error;
        },
      )
    )
      throw new Error("Bundle destination is inside a source checkout");
    const info = await lstat(part);
    if (!info.isDirectory() || info.isSymbolicLink() || resolve(await realpath(part)) !== resolve(part))
      throw new Error("Bundle directory redirects or is not regular");
  }
}
async function verifyInstalledFiles(directory: string, plan: QualifiedBundleInstallPlan) {
  const actual: string[] = [];
  const walk = async (root: string, sub = ""): Promise<void> => {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const name = sub ? sub + "/" + entry.name : entry.name;
      if (entry.isDirectory()) await walk(join(root, entry.name), name);
      else if (entry.isFile()) actual.push(name);
      else throw new Error("Installed bundle contains nonregular files");
    }
  };
  await walk(directory);
  if (!Bun.deepEquals(actual.sort(), Object.keys(plan.files).sort()))
    throw new Error("Installed bundle file closure differs");
  for (const [name, identity] of Object.entries(plan.files)) {
    const path = join(directory, name),
      info = await lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size !== identity.bytes ||
      (process.platform !== "win32" && (info.mode & 0o7777) !== identity.mode) ||
      (await hashSDKFile(path)) !== identity.sha256
    )
      throw new Error("Installed bundle member changed");
  }
}
async function probeInstalledRuntime(executable: string, plan: QualifiedBundleInstallPlan) {
  const actual = await realpath(executable),
    directory = dirname(actual),
    temporary = await mkdtemp(join(tmpdir(), "bun-bundle-probe-"));
  const target = mediaReleaseTarget(plan.target),
    env = { ...isolatedMediaEnvironment(directory, temporary, plan.target), BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" };
  const run = async (argv: string[], expected: string) => {
    const child = Bun.spawn(argv, { env, stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => child.kill(), 15000);
    try {
      const [stdout, stderr, status] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
      if (status !== 0 || !stdout.startsWith(expected) || stdout.includes("requires --google-search=on") || stderr)
        throw new Error("Staged native bundle provider probe failed");
    } finally {
      clearTimeout(timer);
      child.kill();
    }
  };
  try {
    const script =
      "const p=JSON.parse(process.argv[1]);if(Bun.version!==p.version||Bun.revision!==p.source||process.platform!==p.platform||process.arch!==p.arch)throw Error('Runtime identity differs');if(!Bun.Curl?.available||!Bun.Crawl?.available||!Bun.VectorIndex?.available||!Bun.Video?.available)throw Error('Native provider unavailable');console.log('qualified-native-bundle')";
    await run(
      [
        actual,
        "--no-env-file",
        "-e",
        script,
        JSON.stringify({
          version: plan.version,
          source: plan.source,
          platform: target.platform,
          arch: target.runtimeArch,
        }),
      ],
      "qualified-native-bundle",
    );
    await run([actual, "search", "--help"], "Usage: bun search");
    const ext = target.os === "windows" ? ".exe" : "";
    await run(
      [join(directory, "lib/media/ffmpeg", target.sdkTarget, "bin/ffmpeg" + ext), "-hide_banner", "-version"],
      "ffmpeg version",
    );
    await run([join(directory, "lib/media/mpv", target.sdkTarget, "bin/mpv" + ext), "--version"], "mpv ");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/** Apply only an externally pinned, already-qualified plan; no downloads, builds or service changes. */
export async function applyQualifiedRuntimeInstall(
  plan: QualifiedBundleInstallPlan,
  expectedPlanSHA256: string,
  ports: BundleInstallPorts = {},
) {
  if (
    qualifiedInstallPlanSHA256(plan) !== expectedPlanSHA256 ||
    plan.schema !== 1 ||
    plan.kind !== "bun-qualified-bundle-install-plan"
  )
    throw new Error("Install plan identity changed");
  if (
    (ports.hostname ?? hostname)() !== plan.hostname ||
    (ports.hostTarget ?? mediaSDKHostTarget)() !== mediaReleaseTarget(plan.target).sdkTarget
  )
    throw new Error("Install host identity or native ABI differs");
  if (!/^[a-z0-9.-]+$/.test(plan.release) || ![plan.root, plan.aliasDirectory, plan.archive.path].every(isAbsolute))
    throw new Error("Invalid versioned install paths");
  requireBundleDiskSpace(plan.disk.requiredBytes, await (ports.availableBytes ?? installAvailableBytes)(plan.root));
  const bytes = await Bun.file(plan.archive.path).bytes();
  if (bytes.length !== plan.archive.bytes || bundleHash(bytes) !== plan.archive.sha256)
    throw new Error("Qualified archive changed before installation");
  const entries = await qualifiedBundleMembers(bytes, plan.triplet);
  const target = mediaReleaseTarget(plan.target);
  if (
    plan.triplet !== target.triplet ||
    !["runtime-full", "media-full"].includes(plan.component) ||
    plan.allComponentsQualified !== (plan.component === "media-full")
  )
    throw new Error("Install component or target contract differs");
  const innerName = plan.component === "runtime-full" ? "bun-runtime-full-release.json" : "bun-media-release.json";
  const inner = await entries.get(plan.triplet + "/" + innerName)?.json();
  const expectedKind = plan.component === "runtime-full" ? "bun-runtime-full-release" : "bun-media-release";
  const flavor = await entries.get(plan.triplet + "/release-flavor.json")?.json();
  if (
    inner?.kind !== expectedKind ||
    inner.source !== plan.source ||
    inner.version !== plan.version ||
    inner.target !== plan.target ||
    inner.native !== true ||
    inner.passed !== true ||
    flavor?.revision !== plan.source ||
    flavor.target !== plan.target ||
    !Bun.deepEquals(flavor.compiledFeatures, fullNativeRuntimeFeatures)
  )
    throw new Error("Install source, version or compiled manifest differs");
  for (const identity of Object.values(plan.files))
    if (!Number.isInteger(identity.mode) || identity.mode < 0 || identity.mode > 0o777)
      throw new Error("Install member permission is unsafe");
  if (entries.size !== Object.keys(plan.files).length) throw new Error("Install plan file closure differs");
  for (const [name, file] of entries) {
    const identity = plan.files[name.slice(plan.triplet.length + 1)];
    if (!identity || file.size !== identity.bytes || bundleHash(await file.bytes()) !== identity.sha256)
      throw new Error("Install plan member differs");
  }
  await plainDirectory(plan.root);
  const lock = await open(join(plan.root, ".install.lock"), "wx", 0o600);
  let stage = "",
    release = join(plan.root, plan.release);
  const rollbacks: (() => Promise<void>)[] = [];
  try {
    const exists = await lstat(release).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (exists) {
      if (!exists.isDirectory() || exists.isSymbolicLink()) throw new Error("Versioned install redirects");
      await verifyInstalledFiles(release, plan);
    } else {
      stage = await mkdtemp(join(plan.root, ".stage-"));
      for (const [path, file] of entries) {
        const name = path.slice(plan.triplet.length + 1);
        assertPublicMediaPath(name);
        const dest = join(stage, name);
        await plainDirectory(dirname(dest));
        await Bun.write(dest, file);
        if (process.platform !== "win32") await chmod(dest, plan.files[name]!.mode);
      }
      await verifyInstalledFiles(stage, plan);
      await (ports.probe ?? probeInstalledRuntime)(join(stage, process.platform === "win32" ? "bun.exe" : "bun"), plan);
      if (process.platform !== "win32") await chmod(stage, 0o755);
      await rename(stage, release);
      stage = "";
    }
    const executable = join(release, process.platform === "win32" ? "bun.exe" : "bun");
    await (ports.probe ?? probeInstalledRuntime)(executable, plan);
    if (plan.activation === "windows-machine-path") {
      if (process.platform !== "win32" || !ports.windowsPath)
        throw new Error("Windows activation requires the qualified native registry and fresh SSH ports");
      const prior = await ports.windowsPath.read();
      if (!Bun.deepEquals(prior, plan.priorWindowsPath)) throw new Error("Machine PATH changed after install plan");
      const next = windowsBundlePathSnapshot(prior, release);
      rollbacks.push(async () => {
        const current = await ports.windowsPath!.read();
        if (Bun.deepEquals(current, next)) await ports.windowsPath!.compareAndSwap(next, prior);
        else if (!Bun.deepEquals(current, prior))
          throw new Error("Machine PATH changed during activation; preserve concurrent edit");
      });
      await ports.windowsPath.compareAndSwap(prior, next);
      await ports.windowsPath.verifyFresh(release, plan);
    } else {
      if (process.platform === "win32") throw new Error("POSIX activation requires a POSIX host");
      await plainDirectory(plan.aliasDirectory);
      const current = join(plan.root, "current"),
        prior = await readlink(current).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined;
          throw error;
        });
      if ((prior ?? null) !== plan.priorCurrent) throw new Error("Current pointer changed after install plan");
      for (const name of ["bun", "bunx"])
        if ((await optionalLink(join(plan.aliasDirectory, name))) !== plan.priorAliases[name])
          throw new Error("Managed alias changed after install plan");
      if (prior && dirname(resolve(plan.root, prior)) !== resolve(plan.root))
        throw new Error("Current bundle pointer is unmanaged");
      const swap = async (path: string, to: string) => {
        const temp = path + ".swap-" + crypto.randomUUID();
        await symlink(to, temp);
        try {
          await rename(temp, path);
        } finally {
          await unlink(temp).catch(() => {});
        }
      };
      await swap(current, plan.release);
      rollbacks.push(async () => {
        if (prior) await swap(current, prior);
        else await unlink(current);
      });
      for (const name of ["bun", "bunx"]) {
        const path = join(plan.aliasDirectory, name),
          desired = join(plan.root, "current", "bun");
        const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined;
          throw error;
        });
        if (info && !info.isSymbolicLink())
          throw new Error("Existing alias is unmanaged; no binary will be overwritten");
        const old = info ? await readlink(path) : undefined;
        if ((old ?? null) !== plan.priorAliases[name]) throw new Error("Managed alias changed before activation");
        if (old === desired) continue;
        await swap(path, desired);
        rollbacks.push(async () => {
          if (old !== undefined) await swap(path, old);
          else await unlink(path);
        });
      }
      await (ports.probe ?? probeInstalledRuntime)(join(plan.aliasDirectory, "bun"), plan);
    }
    await verifyInstalledFiles(release, plan);
    return {
      schema: 1,
      kind: "bun-qualified-bundle-install",
      source: plan.source,
      version: plan.version,
      target: plan.target,
      component: plan.component,
      release,
      planSHA256: expectedPlanSHA256,
      hostname: plan.hostname,
      archiveSHA256: plan.archive.sha256,
      closureSHA256: bundleHash(JSON.stringify(plan.files)),
      fileCount: Object.keys(plan.files).length,
      allComponentsQualified: plan.allComponentsQualified,
    };
  } catch (error) {
    const failures = [];
    for (const undo of rollbacks.reverse())
      try {
        await undo();
      } catch (rollback) {
        failures.push(String(rollback));
      }
    if (failures.length)
      throw new AggregateError([error, ...failures], "Bundle install failed and rollback requires review");
    throw error;
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true });
    await lock.close();
    await unlink(join(plan.root, ".install.lock"));
  }
}

/** Registry writes preserve raw expansion syntax and type; fresh SSH verification stays with Infra. */
export function nativeWindowsMachinePathPort(
  verifyFresh: (directory: string, plan: QualifiedBundleInstallPlan) => Promise<void>,
): NonNullable<BundleInstallPorts["windowsPath"]> {
  const execute = async (body: string) => {
    if (process.platform !== "win32") throw new Error("Native Windows registry activation requires Windows");
    const source = '$ErrorActionPreference="Stop";$ProgressPreference="SilentlyContinue";' + body;
    const child = Bun.spawn(
      [
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(source, "utf16le").toString("base64"),
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const timer = setTimeout(() => child.kill(), 15000);
    try {
      const [out, err, status] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
      if (status !== 0 || err || out.length > 1024 * 1024)
        throw new Error("Native registry activation failed; machine PATH was not qualified");
      return out.trim() ? JSON.parse(out) : undefined;
    } finally {
      clearTimeout(timer);
      child.kill();
    }
  };
  const registry =
    '$key=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey("SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",$true);if(!$key){throw "Machine environment unavailable"};';
  const read =
    '$raw=$key.GetValue("Path",$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);$kind=$key.GetValueKind("Path").ToString();if($kind -notin @("String","ExpandString") -or $raw -isnot [string]){throw "Unsupported machine PATH type"};';
  return {
    read: async () =>
      execute(registry + "try{" + read + "@{raw=$raw;kind=$kind}|ConvertTo-Json -Compress}finally{$key.Close()}"),
    compareAndSwap: async (expected, next) => {
      if (
        !["String", "ExpandString"].includes(expected.kind) ||
        next.kind !== expected.kind ||
        typeof expected.raw !== "string" ||
        typeof next.raw !== "string" ||
        next.raw.includes("\0")
      )
        throw new Error("Invalid raw registry snapshot");
      const payload = Buffer.from(JSON.stringify({ expected, next }), "utf8").toString("base64");
      await execute(
        '$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("' +
          payload +
          '"))|ConvertFrom-Json;$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent());if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw "Machine PATH activation requires administrator"};$mutex=New-Object Threading.Mutex($false,"Global\\AphrodyQualifiedBunPath");if(!$mutex.WaitOne(15000)){throw "Machine PATH owner busy"};try{' +
          registry +
          "try{" +
          read +
          'if($raw -cne $p.expected.raw -or $kind -cne $p.expected.kind){throw "Machine PATH changed"};$key.SetValue("Path",$p.next.raw,([Enum]::Parse([Microsoft.Win32.RegistryValueKind],$kind)));' +
          read +
          'if($raw -cne $p.next.raw -or $kind -cne $p.next.kind){throw "Machine PATH readback differs"}}finally{$key.Close()}}finally{$mutex.ReleaseMutex();$mutex.Dispose()}',
      );
    },
    verifyFresh,
  };
}

export function windowsBundlePathSnapshot(prior: WindowsPathSnapshot, release: string): WindowsPathSnapshot {
  if (
    !["String", "ExpandString"].includes(prior.kind) ||
    typeof prior.raw !== "string" ||
    prior.raw.includes("\0") ||
    release.includes(";") ||
    release.includes("\0")
  )
    throw new Error("Invalid raw machine PATH snapshot");
  return {
    ...prior,
    raw:
      release +
      ";" +
      prior.raw
        .split(";")
        .filter(part => part.toLowerCase() !== release.toLowerCase())
        .join(";"),
  };
}
