import { randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, open, opendir, readlink, realpath, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { scheduler } from "node:timers/promises";
import { parseArgs } from "node:util";
import { receiptsRoot, runRecorded } from "../../../scripts/aphrody/pyjs-runs.ts";
import { BunPython, registryPath } from "../../../scripts/aphrody/pyjs-store.ts";

export type PatchManifest = {
  schemaVersion: 1;
  component: "cpython";
  version: string;
  revision: string;
  upstream: string;
  license: { path: string; sha256: string };
  patch: { path: string; sha256: string; strip: number };
  files: { path: string; preimageSHA256: string; postimageSHA256: string }[];
  validation?: { binaries?: { patched?: { executableSHA256: string; librarySHA256: string } } };
};
export type LoadedPatch = { manifest: PatchManifest; path: string; sha256: string; patch: string };
export type PatchState = { path: string; state: "pending" | "applied" };
type Command = { argv: string[]; cwd: string };
export type Options = {
  source: string;
  platform?: NodeJS.Platform | undefined;
  arch?: string | undefined;
  buildDir?: string | undefined;
  prefix?: string | undefined;
  jobs?: number | undefined;
  libc?: "gnu" | "musl" | undefined;
  bootstrap?: string | undefined;
  externals?: string | undefined;
  buildReceipt?: string | undefined;
  msbuild?: string | undefined;
};
type FileEntry = { sha256: string; bytes: number; mode: number };
export type PythonBuildReceipt = {
  schema: "aphrody.cpython-build/1";
  id: string;
  version: string;
  revision: string;
  target: string;
  source: string;
  output: string;
  prefix?: string | undefined;
  executable: string;
  library: string;
  executableSHA256: string;
  librarySHA256: string;
  abi: Record<string, unknown>;
  patches: { manifestSHA256: string; patchSHA256: string }[];
  commands: Command[];
  sourceDiffSHA256: string;
  sourceDiff: string;
  environment: Record<string, string>;
  qualified: boolean;
  createdAt: string;
};
export type PythonRuntimeReceipt = {
  schema: "aphrody.cpython-runtime/1";
  id: string;
  version: string;
  revision: string;
  target: string;
  prefix: string;
  executable: string;
  library: string;
  include: string;
  libdir: string;
  stdlib: string;
  extensions: string;
  abi: Record<string, unknown>;
  patches: { manifestSHA256: string; patchSHA256: string }[];
  qualification: { kind: "manifest" | "build"; sha256: string; path: string };
  sourceDiffSHA256: string;
  files: Record<string, FileEntry>;
  links: Record<string, string>;
  treeSHA256: string;
  createdAt: string;
};
const manifests = ["cpython-json-ascii.json", "cpython-ssl-winerror.json"];
const digest = (value: unknown) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const shaText = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
const outside = (root: string, path: string) => {
  const scoped = relative(root, path);
  return isAbsolute(scoped) || scoped === ".." || scoped.startsWith("../") || scoped.startsWith("..\\");
};
const patchProofs = (patches: LoadedPatch[]) =>
  patches.map(item => ({ manifestSHA256: item.sha256, patchSHA256: item.manifest.patch.sha256 }));

export function scopedPath(root: string, path: string) {
  if (!path || isAbsolute(path) || path.includes("\\") || path.includes(":") || path.includes("\0"))
    throw new Error(`Invalid relative source path: ${path}`);
  const absolute = resolve(root, path),
    scoped = relative(root, absolute);
  if (scoped === ".." || scoped.startsWith("../") || scoped.startsWith("..\\") || isAbsolute(scoped))
    throw new Error(`Path escapes source root: ${path}`);
  return absolute;
}

export function validateManifest(value: unknown): asserts value is PatchManifest {
  if (!value || typeof value !== "object") throw new Error("Invalid CPython patch manifest");
  const m = value as PatchManifest;
  if (
    m.schemaVersion !== 1 ||
    m.component !== "cpython" ||
    !/^\d+\.\d+\.\d+$/.test(m.version) ||
    !/^[0-9a-f]{40}$/.test(m.revision)
  )
    throw new Error("Invalid CPython source pin");
  if (!m.patch || !digest(m.patch.sha256) || m.patch.strip !== 1 || !m.license || !digest(m.license.sha256))
    throw new Error("Invalid CPython patch/license digest");
  scopedPath(resolve("."), m.patch.path);
  scopedPath(resolve("."), m.license.path);
  if (!Array.isArray(m.files) || !m.files.length)
    throw new Error("CPython patch requires file preimages and postimages");
  const paths = new Set<string>();
  for (const file of m.files) {
    scopedPath(resolve("."), file.path);
    if (
      paths.has(file.path) ||
      !digest(file.preimageSHA256) ||
      !digest(file.postimageSHA256) ||
      file.preimageSHA256 === file.postimageSHA256
    )
      throw new Error("Invalid CPython file proof");
    paths.add(file.path);
  }
}

export async function fileSHA256(path: string) {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
}

async function contained(root: string, path: string) {
  const actual = await realpath(path),
    scoped = relative(root, actual);
  if (isAbsolute(scoped) || scoped === ".." || scoped.startsWith("../") || scoped.startsWith("..\\"))
    throw new Error(`Symlink escapes source root: ${path}`);
  return actual;
}

export async function loadManifests(directory = resolve(import.meta.dir, "../patches")): Promise<LoadedPatch[]> {
  const root = await realpath(directory),
    loaded: LoadedPatch[] = [];
  for (const name of manifests) {
    const path = await contained(root, scopedPath(root, name)),
      value: unknown = await Bun.file(path).json();
    validateManifest(value);
    const patch = await contained(root, scopedPath(root, value.patch.path));
    const license = await contained(root, scopedPath(root, value.license.path));
    if ((await fileSHA256(patch)) !== value.patch.sha256 || (await fileSHA256(license)) !== value.license.sha256)
      throw new Error(`Patch/license SHA256 mismatch: ${name}`);
    if (
      loaded.length &&
      (loaded[0]!.manifest.revision !== value.revision || loaded[0]!.manifest.version !== value.version)
    )
      throw new Error("CPython manifests disagree on source pin");
    loaded.push({ manifest: value, path, patch, sha256: await fileSHA256(path) });
  }
  return loaded;
}

async function command(
  registry: BunPython,
  kind: string,
  argv: string[],
  cwd: string,
  env: Record<string, string | undefined> = {},
) {
  const output = join(receiptsRoot(registry), `${randomUUID()}.output`);
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const code = await runRecorded(registry, kind, argv, cwd, output);
    if (code !== 0) throw new Error(`${kind} failed with exit ${code}; recorded output ${output}`);
    return output;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const git = async (registry: BunPython, root: string, ...args: string[]) =>
  (await Bun.file(await command(registry, "cpython-git", ["git", "-C", root, ...args], root)).text()).trim();
async function sourceHash(path: string) {
  const bytes = await Bun.file(path).bytes();
  return shaText(new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/\r\n/g, "\n"));
}

export async function verifySource(registry: BunPython, source: string, patches: LoadedPatch[]): Promise<PatchState[]> {
  if (!patches.length) throw new Error("CPython patch manifests are required");
  const root = await realpath(source);
  if ((await realpath(await git(registry, root, "rev-parse", "--show-toplevel"))) !== root)
    throw new Error("CPython source must be its Git checkout root");
  const revision = await git(registry, root, "rev-parse", "HEAD");
  if (revision !== patches[0]!.manifest.revision)
    throw new Error(`CPython HEAD ${revision} does not match pinned revision`);
  const version = /#define PY_VERSION\s+"([^"]+)"/.exec(await Bun.file(join(root, "Include/patchlevel.h")).text())?.[1];
  if (version !== patches[0]!.manifest.version) throw new Error("CPython patchlevel does not match pinned version");
  const states: PatchState[] = [];
  for (const item of patches) {
    const files: ("pending" | "applied")[] = [];
    for (const proof of item.manifest.files) {
      const baseline = await command(
        registry,
        "cpython-preimage",
        ["git", "-C", root, "show", `${revision}:${proof.path}`],
        root,
      );
      if ((await fileSHA256(baseline)) !== proof.preimageSHA256)
        throw new Error(`Pinned preimage SHA256 mismatch: ${proof.path}`);
      const path = await contained(root, scopedPath(root, proof.path)),
        actual = await sourceHash(path);
      if (actual !== proof.preimageSHA256 && actual !== proof.postimageSHA256)
        throw new Error(`Owned CPython file has unrelated changes: ${proof.path}`);
      files.push(actual === proof.postimageSHA256 ? "applied" : "pending");
    }
    if (new Set(files).size !== 1) throw new Error(`Partially applied CPython patch: ${item.manifest.patch.path}`);
    states.push({ path: item.patch, state: files[0]! });
  }
  return states;
}

export async function applyPatches(registry: BunPython, source: string, patches: LoadedPatch[]) {
  const root = await realpath(source),
    lock = join(root, ".cpython-factory.lock");
  const handle = await open(lock, "wx");
  try {
    const states = await verifySource(registry, root, patches);
    for (let index = 0; index < patches.length; index++) {
      const item = patches[index]!,
        state = states[index]!;
      if (
        (await fileSHA256(item.path)) !== item.sha256 ||
        (await fileSHA256(item.patch)) !== item.manifest.patch.sha256
      )
        throw new Error("Patch changed after loading its manifest");
      await command(
        registry,
        "cpython-patch-check",
        ["git", "-C", root, "apply", ...(state.state === "applied" ? ["--reverse"] : []), "--check", "-p1", item.patch],
        root,
      );
      if (state.state === "pending")
        await command(registry, "cpython-patch-apply", ["git", "-C", root, "apply", "-p1", item.patch], root);
    }
    const after = await verifySource(registry, root, patches);
    if (after.some(item => item.state !== "applied"))
      throw new Error("CPython postimages failed after patch application");
    registry.event("cpython-patches-applied", {
      root,
      revision: patches[0]!.manifest.revision,
      patches: patches.map(item => ({
        manifestSHA256: item.sha256,
        patchSHA256: item.manifest.patch.sha256,
      })),
      states,
    });
    return states;
  } finally {
    await handle.close();
    await unlink(lock);
  }
}

export function hostTarget(platform: NodeJS.Platform, arch: string, libc?: "gnu" | "musl") {
  if (arch !== "x64" && arch !== "arm64") throw new Error(`Unsupported native CPython architecture: ${arch}`);
  const cpu = arch === "x64" ? "x86_64" : "aarch64";
  if (platform === "win32") return `${cpu}-pc-windows-msvc`;
  if (platform === "darwin") return `${cpu}-apple-darwin`;
  if (platform === "linux" && libc) return `${cpu}-unknown-linux-${libc}`;
  throw new Error("Select a qualified native host; Linux requires explicit --libc gnu|musl");
}

export function buildCommands(options: Options): Command[] {
  const platform = options.platform ?? process.platform,
    arch = options.arch ?? process.arch,
    jobs = options.jobs ?? 4;
  hostTarget(platform, arch, options.libc);
  if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 32) throw new Error("CPython jobs must be between 1 and 32");
  const source = resolve(options.source);
  if (platform === "win32")
    return [
      {
        argv: [
          "cmd.exe",
          "/d",
          "/c",
          join(source, "PCbuild/build.bat"),
          "-p",
          arch === "x64" ? "x64" : "ARM64",
          "-c",
          "Release",
          "-e",
          "-M",
          "-q",
          `"/p:CL_MPCount=${jobs}"`,
        ],
        cwd: source,
      },
    ];
  if (!options.buildDir || !options.prefix) throw new Error("POSIX builds require explicit --build-dir and --prefix");
  return [
    {
      argv: [
        join(source, "configure"),
        `--prefix=${resolve(options.prefix)}`,
        "--enable-shared",
        "--with-ensurepip=install",
      ],
      cwd: resolve(options.buildDir),
    },
    { argv: ["make", `-j${jobs}`], cwd: resolve(options.buildDir) },
  ];
}

const buildLocation = (options: Options) =>
  (options.platform ?? process.platform) === "win32"
    ? join(options.source, "PCbuild", (options.arch ?? process.arch) === "x64" ? "amd64" : "arm64")
    : resolve(options.buildDir!);
const executable = (options: Options) =>
  (options.platform ?? process.platform) === "win32"
    ? join(buildLocation(options), "python.exe")
    : join(buildLocation(options), "python");
const loaderEnv = (options: Options, libdir = buildLocation(options)): Record<string, string | undefined> => {
  const platform = options.platform ?? process.platform;
  const key = platform === "linux" ? "LD_LIBRARY_PATH" : platform === "darwin" ? "DYLD_LIBRARY_PATH" : undefined;
  return key ? { [key]: `${libdir}${process.env[key] ? `:${process.env[key]}` : ""}` } : {};
};

type VisualStudioInstallation = {
  installationPath: string;
  isComplete?: boolean;
  isLaunchable?: boolean;
};

export function qualifiedVisualStudio(installations: VisualStudioInstallation[], msbuild?: string) {
  const qualified = installations.filter(
    item => item.isComplete === true && item.isLaunchable === true && typeof item.installationPath === "string",
  );
  return msbuild ? qualified.filter(item => !outside(resolve(item.installationPath), resolve(msbuild))) : qualified;
}

async function visualStudio(registry: BunPython, source: string, selected?: string) {
  const installer = process.env["ProgramFiles(x86)"];
  const vswhere =
    Bun.which("vswhere") ?? (installer ? join(installer, "Microsoft Visual Studio/Installer/vswhere.exe") : undefined);
  if (!vswhere || !(await Bun.file(vswhere).exists()))
    throw new Error("Official Visual Studio Installer/vswhere is required for PCbuild");
  const path = await command(
    registry,
    "cpython-vswhere",
    [
      vswhere,
      "-all",
      "-prerelease",
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-format",
      "json",
    ],
    source,
  );
  const installations = (await Bun.file(path).json()) as VisualStudioInstallation[];
  const explicit = selected ?? process.env.MSBUILD;
  const msbuild = explicit ? await realpath(explicit.replace(/^"(.*)"$/, "$1")) : undefined;
  for (const item of qualifiedVisualStudio(installations, msbuild)) {
    for (const candidate of msbuild
      ? [msbuild]
      : [
          join(item.installationPath, "MSBuild/Current/Bin/amd64/MSBuild.exe"),
          join(item.installationPath, "MSBuild/Current/Bin/MSBuild.exe"),
        ]) {
      if (await Bun.file(candidate).exists()) return await contained(await realpath(item.installationPath), candidate);
    }
  }
  throw new Error(
    "No complete Visual Studio installation qualifies the selected MSBuild; restore the owner toolchain before PCbuild",
  );
}

export async function build(registry: BunPython, options: Options, patches: LoadedPatch[]) {
  const msbuild =
    process.platform === "win32" ? await visualStudio(registry, options.source, options.msbuild) : undefined;
  const commands = buildCommands(options);
  if (process.platform !== "win32") {
    await freshPrefix(options.prefix!, options.source);
    const directory = await freshPrefix(options.buildDir!, options.source);
    if (!outside(directory, resolve(options.prefix!)) || !outside(resolve(options.prefix!), directory))
      throw new Error("Build output and install prefix must be disjoint");
    await mkdir(directory, { recursive: true });
  }
  const temporary = join(receiptsRoot(registry), `${randomUUID()}.cpython-tmp`);
  await mkdir(temporary, { recursive: true });
  const env: Record<string, string | undefined> =
    process.platform === "win32" ? { TEMP: temporary, TMP: temporary } : {};
  if (msbuild) env.MSBUILD = msbuild;
  if (options.bootstrap) {
    env.PYTHON = await realpath(options.bootstrap);
    env.PYTHON_FOR_BUILD = env.PYTHON;
  }
  if (options.externals) env.EXTERNALS_DIR = await realpath(options.externals);
  for (const item of commands) await command(registry, "cpython-factory-build", item.argv, item.cwd, env);
  if ((await verifySource(registry, options.source, patches)).some(item => item.state !== "applied"))
    throw new Error("Source changed during CPython build");
  const abi = await probe(registry, executable(options), options.source, loaderEnv(options));
  verifyABI(abi, patches[0]!.manifest.version);
  const library = await buildLibrary(options, abi, patches[0]!.manifest.version);
  const sourceDiff = await command(
    registry,
    "cpython-source-diff",
    ["git", "-C", options.source, "diff", "--binary", "--no-ext-diff", "HEAD", "--"],
    options.source,
  );
  const environment = Object.fromEntries(
    [
      "PYTHON",
      "PYTHON_FOR_BUILD",
      "EXTERNALS_DIR",
      "CC",
      "CXX",
      "CFLAGS",
      "CPPFLAGS",
      "LDFLAGS",
      "CONFIG_SITE",
      "MSBUILD",
    ].flatMap(key => {
      const value = key in env ? env[key] : process.env[key];
      return value === undefined ? [] : [[key, value]];
    }),
  );
  const receipt: PythonBuildReceipt = {
    schema: "aphrody.cpython-build/1",
    id: randomUUID(),
    version: patches[0]!.manifest.version,
    revision: patches[0]!.manifest.revision,
    target: hostTarget(process.platform, process.arch, options.libc),
    source: options.source,
    output: buildLocation(options),
    prefix: options.prefix,
    executable: executable(options),
    library,
    executableSHA256: await fileSHA256(executable(options)),
    librarySHA256: await fileSHA256(library),
    abi,
    patches: patchProofs(patches),
    commands,
    sourceDiff,
    sourceDiffSHA256: await fileSHA256(sourceDiff),
    environment,
    qualified: false,
    createdAt: new Date().toISOString(),
  };
  return await saveBuild(registry, receipt);
}

const probeProgram = `import ctypes, json, platform, ssl, sqlite3, tkinter, bz2, lzma, zlib, sys, sysconfig\ntcl=tkinter.Tcl()\nprint(json.dumps(dict(version=platform.python_version(),implementation=sys.implementation.name,prefix=sys.prefix,SOABI=sysconfig.get_config_var('SOABI'),EXT_SUFFIX=sysconfig.get_config_var('EXT_SUFFIX'),LDLIBRARY=sysconfig.get_config_var('LDLIBRARY'),LIBDIR=sysconfig.get_config_var('LIBDIR'),shared=sysconfig.get_config_var('Py_ENABLE_SHARED'),gilDisabled=sysconfig.get_config_var('Py_GIL_DISABLED'),compiler=platform.python_compiler(),openssl=ssl.OPENSSL_VERSION,tcl=tcl.eval('info patchlevel'),tclLibrary=tcl.eval('info library'))))`;
async function probe(registry: BunPython, path: string, cwd: string, env: Record<string, string | undefined> = {}) {
  return (await Bun.file(
    await command(registry, "cpython-runtime-probe", [path, "-I", "-B", "-c", probeProgram], cwd, env),
  ).json()) as Record<string, unknown>;
}

export function verifyABI(abi: Record<string, unknown>, version: string) {
  if (
    abi.version !== version ||
    abi.implementation !== "cpython" ||
    abi.gilDisabled === 1 ||
    !abi.EXT_SUFFIX ||
    (process.platform !== "win32" && abi.shared !== 1)
  )
    throw new Error("Built CPython version/ABI does not match selected runtime");
}

async function buildLibrary(options: Options, abi: Record<string, unknown>, version: string) {
  const name =
    process.platform === "win32" ? `python${version.split(".").slice(0, 2).join("")}.dll` : String(abi.LDLIBRARY);
  return await contained(await realpath(buildLocation(options)), join(buildLocation(options), name));
}

async function saveBuild(registry: BunPython, receipt: PythonBuildReceipt) {
  const path = join(receiptsRoot(registry), `${receipt.id}.cpython-build.json`);
  await Bun.write(path, JSON.stringify(receipt, null, 2) + "\n");
  const sha256 = await registry.artifact(path, "cpython-build-receipt", undefined, {
    target: receipt.target,
    qualified: receipt.qualified,
  });
  registry.event("cpython-build-recorded", { path, sha256, qualified: receipt.qualified });
  return path;
}

export async function verifyBuild(
  registry: BunPython,
  path: string,
  options: Options,
  patches: LoadedPatch[],
  qualified = true,
) {
  const receipt = (await Bun.file(path).json()) as PythonBuildReceipt;
  const statement = registry.db.query<{ sha256: string }, [string]>(
    "SELECT sha256 FROM artifacts WHERE path=? AND kind='cpython-build-receipt' ORDER BY rowid DESC LIMIT 1",
  );
  const registered = statement.get(resolve(path));
  if (!registered || registered.sha256 !== (await fileSHA256(path)))
    throw new Error("Build receipt is not the immutable artifact recorded in this registry");
  if (
    receipt.schema !== "aphrody.cpython-build/1" ||
    receipt.version !== patches[0]!.manifest.version ||
    receipt.revision !== patches[0]!.manifest.revision ||
    receipt.target !== hostTarget(process.platform, process.arch, options.libc) ||
    JSON.stringify(receipt.patches) !== JSON.stringify(patchProofs(patches)) ||
    (qualified && receipt.qualified !== true)
  )
    throw new Error("CPython build receipt does not qualify this source/target");
  if (
    (await realpath(receipt.source)) !== (await realpath(options.source)) ||
    (await realpath(receipt.output)) !== (await realpath(buildLocation(options))) ||
    (await realpath(receipt.executable)) !== (await realpath(executable(options)))
  )
    throw new Error("CPython build receipt has different source/output paths");
  if (process.platform !== "win32" && resolve(receipt.prefix ?? "") !== resolve(options.prefix ?? ""))
    throw new Error("Configured install prefix differs from build receipt");
  verifyABI(receipt.abi, receipt.version);
  const sourceDiff = await command(
    registry,
    "cpython-source-diff",
    ["git", "-C", options.source, "diff", "--binary", "--no-ext-diff", "HEAD", "--"],
    options.source,
  );
  if (!digest(receipt.sourceDiffSHA256) || (await fileSHA256(sourceDiff)) !== receipt.sourceDiffSHA256)
    throw new Error("Source differs from the qualified CPython build");
  if (
    !digest(receipt.executableSHA256) ||
    !digest(receipt.librarySHA256) ||
    (await fileSHA256(receipt.executable)) !== receipt.executableSHA256 ||
    (await fileSHA256(receipt.library)) !== receipt.librarySHA256
  )
    throw new Error("CPython build binary digest changed after qualification");
  return receipt;
}

export async function testRuntime(registry: BunPython, options: Options, version: string, patches: LoadedPatch[]) {
  const path = executable(options),
    env = loaderEnv(options);
  const abi = await probe(registry, path, options.source, env);
  verifyABI(abi, version);
  const before = options.buildReceipt
    ? await verifyBuild(registry, options.buildReceipt, options, patches, false)
    : undefined;
  await command(
    registry,
    "cpython-factory-test",
    [
      path,
      "-B",
      "-m",
      "test",
      "test_json",
      "test_ctypes",
      "test_ssl",
      "test_sqlite3",
      "test_bz2",
      "test_lzma",
      "test_zlib",
      "test_decimal",
      "test_tcl",
    ],
    options.source,
    env,
  );
  if (before) {
    await verifyBuild(registry, options.buildReceipt!, options, patches, false);
    return await saveBuild(registry, {
      ...before,
      id: randomUUID(),
      abi,
      qualified: true,
      createdAt: new Date().toISOString(),
    });
  }
  return abi;
}

export async function freshPrefix(prefix: string, source: string) {
  let destination = resolve(prefix),
    parent = dirname(destination);
  const suffix: string[] = [basename(destination)];
  while (true) {
    try {
      parent = await realpath(parent);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      suffix.unshift(basename(parent));
      const next = dirname(parent);
      if (next === parent) throw error;
      parent = next;
    }
  }
  destination = join(parent, ...suffix);
  const root = await realpath(source);
  if (!outside(root, destination)) throw new Error("Runtime prefix cannot overwrite the source checkout");
  if (/(?:^|[\\/])(?:\.codex|\.claude|\.aphrody)(?:[\\/]|$)/i.test(destination))
    throw new Error("Runtime prefix cannot use protected provider/product stores");
  try {
    await lstat(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return destination;
    throw error;
  }
  throw new Error("Runtime prefix already exists; select a new versioned prefix to preserve toolchains and receipts");
}

async function* files(root: string): AsyncGenerator<string> {
  const entries = await opendir(root);
  for await (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

async function copyTree(sourceRoot: string, from: string, to: string) {
  for await (const file of files(from)) {
    await contained(sourceRoot, file);
    const destination = join(to, relative(from, file));
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file, destination);
    await scheduler.yield();
  }
}

export async function stageWindowsLaunchers(buildDir: string, prefix: string) {
  const source = await realpath(buildDir);
  const target = join(prefix, "Lib", "venv", "scripts", "nt");
  const launchers = ["venvlauncher.exe", "venvwlauncher.exe"];
  const qualified = await Promise.all(launchers.map(name => contained(source, join(source, name))));
  for (const file of qualified) {
    if (!(await Bun.file(file).exists())) throw new Error(`Official PCbuild venv launcher is missing: ${file}`);
  }
  await mkdir(target, { recursive: true });
  for (const file of qualified) await copyFile(file, join(target, basename(file)));
}

export function windowsBinaryPath(prefix: string, file: string) {
  const name = basename(file);
  if (/\.lib$/i.test(name)) return join(prefix, "libs", name);
  if (/\.pyd$/i.test(name) || (/\.dll$/i.test(name) && !/^(?:python\d*(?:_d)?|vcruntime[\w.-]*)\.dll$/i.test(name)))
    return join(prefix, "DLLs", name);
  return join(prefix, name);
}

export async function inventory(prefix: string) {
  const root = await realpath(prefix),
    entries: Record<string, FileEntry> = {},
    links: Record<string, string> = {};
  for await (const path of files(root)) {
    const name = relative(root, path).replaceAll("\\", "/");
    if (name === "cpython.receipt.json") continue;
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      await contained(root, path);
      links[name] = await readlink(path);
    } else entries[name] = { sha256: await fileSHA256(path), bytes: stat.size, mode: stat.mode & 0o777 };
    await scheduler.yield();
  }
  const orderedFiles = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    orderedLinks = Object.fromEntries(Object.entries(links).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return {
    files: orderedFiles,
    links: orderedLinks,
    treeSHA256: shaText(JSON.stringify({ files: orderedFiles, links: orderedLinks })),
  };
}

export async function stage(
  registry: BunPython,
  options: Options,
  patches: LoadedPatch[],
): Promise<PythonRuntimeReceipt> {
  if (!options.prefix) throw new Error("stage requires explicit --prefix");
  const prefix = await freshPrefix(options.prefix, options.source),
    platform = options.platform ?? process.platform;
  const version = patches[0]!.manifest.version,
    short = version.split(".").slice(0, 2).join(".");
  const before = await probe(registry, executable(options), options.source, loaderEnv(options));
  verifyABI(before, version);
  let qualification: PythonRuntimeReceipt["qualification"];
  if (options.buildReceipt) {
    await verifyBuild(registry, options.buildReceipt, options, patches);
    qualification = {
      kind: "build",
      path: await realpath(options.buildReceipt),
      sha256: await fileSHA256(options.buildReceipt),
    };
  } else {
    const known = patches[0]!.manifest.validation?.binaries?.patched;
    const library = await buildLibrary(options, before, version);
    if (
      platform !== "win32" ||
      !known ||
      (await fileSHA256(executable(options))) !== known.executableSHA256 ||
      (await fileSHA256(library)) !== known.librarySHA256
    )
      throw new Error(
        "Binary is outside the qualified patch receipt; provide --build-receipt after factory build/test",
      );
    qualification = { kind: "manifest", path: patches[0]!.path, sha256: patches[0]!.sha256 };
  }
  if (platform === "win32") {
    await mkdir(prefix, { recursive: true });
    const tracked = (await git(registry, options.source, "ls-files", "-z", "--", "Lib", "Include"))
      .split("\0")
      .filter(Boolean);
    for (const file of tracked) {
      const from = await contained(options.source, scopedPath(options.source, file));
      const destination = file.startsWith("Lib/")
        ? join(prefix, file)
        : join(prefix, "include", file.slice("Include/".length));
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(from, destination);
      await scheduler.yield();
    }
    await copyFile(join(buildLocation(options), "pyconfig.h"), join(prefix, "include/pyconfig.h"));
    for await (const file of files(buildLocation(options))) {
      if (dirname(file) !== buildLocation(options) || !/\.(exe|dll|pyd|lib)$/i.test(file)) continue;
      const target = windowsBinaryPath(prefix, file);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(file, target);
    }
    await stageWindowsLaunchers(buildLocation(options), prefix);
    const tclLibrary = await realpath(String(before.tclLibrary));
    const tcl = dirname(tclLibrary);
    if (options.externals) await contained(await realpath(options.externals), tcl);
    await copyTree(tcl, tcl, join(prefix, "tcl"));
    await copyFile(join(options.source, "LICENSE"), join(prefix, "LICENSE.txt"));
  } else {
    await command(registry, "cpython-factory-install", ["make", "install"], options.buildDir!, loaderEnv(options));
  }
  const path = platform === "win32" ? join(prefix, "python.exe") : join(prefix, "bin", `python${short}`);
  const libdir = join(prefix, platform === "win32" ? "libs" : "lib");
  const abi = await probe(registry, path, prefix, loaderEnv(options, join(prefix, "lib")));
  verifyABI(abi, version);
  if ((await realpath(String(abi.prefix))) !== (await realpath(prefix)))
    throw new Error("Staged CPython is not relocatable to the selected prefix");
  await contained(await realpath(prefix), String(abi.tclLibrary));
  await command(
    registry,
    "cpython-staged-subprocess-venv",
    [
      path,
      "-I",
      "-B",
      "-c",
      `import json, os, subprocess, sys, tempfile, venv
assert subprocess.check_output([sys.executable, '-I', '-B', '-c', 'print(42)'], text=True).strip() == '42'
with tempfile.TemporaryDirectory(prefix='cpython-sdk-venv-') as root:
    venv.EnvBuilder(with_pip=False).create(root)
    exe = os.path.join(root, 'Scripts', 'python.exe') if os.name == 'nt' else os.path.join(root, 'bin', 'python')
    result = json.loads(subprocess.check_output([exe, '-I', '-B', '-c', 'import json, ssl, sys; print(json.dumps(dict(prefix=sys.prefix,base_prefix=sys.base_prefix,openssl=ssl.OPENSSL_VERSION)))'], text=True))
    assert os.path.normcase(os.path.realpath(result['prefix'])) == os.path.normcase(os.path.realpath(root)), result
    assert os.path.normcase(os.path.realpath(result['base_prefix'])) == os.path.normcase(os.path.realpath(sys.prefix)), result
print(json.dumps(dict(subprocess=True,venv=True)))`,
    ],
    prefix,
    loaderEnv(options, join(prefix, "lib")),
  );
  const library =
    platform === "win32"
      ? join(prefix, `python${short.replace(".", "")}.dll`)
      : await realpath(join(prefix, "lib", String(abi.LDLIBRARY)));
  const receipt: PythonRuntimeReceipt = {
    schema: "aphrody.cpython-runtime/1",
    id: randomUUID(),
    version,
    revision: patches[0]!.manifest.revision,
    target: hostTarget(platform, options.arch ?? process.arch, options.libc),
    prefix,
    executable: path,
    library,
    include: join(prefix, platform === "win32" ? "include" : `include/python${short}`),
    libdir,
    stdlib: join(prefix, platform === "win32" ? "Lib" : `lib/python${short}`),
    extensions: join(prefix, platform === "win32" ? "DLLs" : `lib/python${short}/lib-dynload`),
    abi,
    patches: patchProofs(patches),
    qualification,
    sourceDiffSHA256: await fileSHA256(
      await command(
        registry,
        "cpython-source-diff",
        ["git", "-C", options.source, "diff", "--binary", "--no-ext-diff", "HEAD", "--"],
        options.source,
      ),
    ),
    ...(await inventory(prefix)),
    createdAt: new Date().toISOString(),
  };
  if (
    !(await Bun.file(join(receipt.include, "Python.h")).exists()) ||
    !Object.keys(receipt.files).some(
      name => name.startsWith(platform === "win32" ? "libs/" : "lib/") && /python.*\.(lib|a|so|dylib)/.test(name),
    )
  )
    throw new Error("Staged compiler headers/import libraries are incomplete");
  const receiptPath = join(prefix, "cpython.receipt.json");
  await Bun.write(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  const sha256 = await registry.artifact(receiptPath, "cpython-runtime-receipt", undefined, {
    target: receipt.target,
    treeSHA256: receipt.treeSHA256,
  });
  await registry.artifact(receipt.library, "cpython-staged-library", undefined, {
    receiptSHA256: sha256,
  });
  registry.event("cpython-runtime-staged", {
    receipt: receiptPath,
    sha256,
    prefix,
    target: receipt.target,
    version,
    treeSHA256: receipt.treeSHA256,
  });
  return receipt;
}

async function main() {
  const action = process.argv[2] ?? "verify";
  const { values } = parseArgs({
    args: process.argv.slice(3),
    strict: true,
    options: {
      source: { type: "string" },
      db: { type: "string", default: registryPath },
      manifests: { type: "string" },
      prefix: { type: "string" },
      "build-dir": { type: "string" },
      "build-receipt": { type: "string" },
      bootstrap: { type: "string" },
      externals: { type: "string" },
      msbuild: { type: "string" },
      jobs: { type: "string", default: "4" },
      libc: { type: "string" },
    },
  });
  using registry = new BunPython(values.db);
  const configured =
    values.source ??
    process.env.BUN_CPYTHON_SOURCE ??
    registry.db.query<{ root: string }, [string]>("SELECT root FROM repositories WHERE id=?").get("source:cpython")
      ?.root;
  if (!configured) throw new Error("Select --source or register source:cpython in the native graph registry");
  if (values.libc && values.libc !== "gnu" && values.libc !== "musl") throw new Error("--libc must be gnu or musl");
  const options: Options = {
    source: await realpath(resolve(configured)),
    prefix: values.prefix ? resolve(values.prefix) : undefined,
    buildDir: values["build-dir"] ? resolve(values["build-dir"]) : undefined,
    jobs: Number(values.jobs),
    libc: values.libc as "gnu" | "musl" | undefined,
    bootstrap: values.bootstrap,
    externals: values.externals,
    buildReceipt: values["build-receipt"],
    msbuild: values.msbuild,
  };
  const patches = await loadManifests(values.manifests);
  if (action === "verify") {
    console.log(JSON.stringify(await verifySource(registry, options.source, patches)));
    return;
  }
  if (!["apply", "build", "test", "stage", "all"].includes(action))
    throw new Error(`Unknown CPython factory action ${action}`);
  await applyPatches(registry, options.source, patches);
  if (action === "build" || action === "all") {
    options.buildReceipt = await build(registry, options, patches);
    console.log(JSON.stringify({ buildReceipt: options.buildReceipt }));
  }
  if (action === "test" || action === "all") {
    const result = await testRuntime(registry, options, patches[0]!.manifest.version, patches);
    if (typeof result === "string") options.buildReceipt = result;
    console.log(JSON.stringify({ qualification: result }));
  }
  if (action === "stage" || action === "all") {
    const receipt = await stage(registry, options, patches);
    console.log(
      JSON.stringify({
        receipt: join(receipt.prefix, "cpython.receipt.json"),
        prefix: receipt.prefix,
        executable: receipt.executable,
        library: receipt.library,
        include: receipt.include,
        libdir: receipt.libdir,
        target: receipt.target,
        treeSHA256: receipt.treeSHA256,
      }),
    );
  }
}

if (import.meta.main) await main();
