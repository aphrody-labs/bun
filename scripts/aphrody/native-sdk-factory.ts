import { mkdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { configOf, type ConfigureInput } from "../build/configure";
import { allDeps } from "../build/deps";
import { readManifest, type Manifest } from "../build/ninja";
import { computeNativeSDKABI, nativeSDKSourceIdentity } from "../build/native-sdk";
import { depSource, depSourceDir } from "../build/source";
import { hashSDKFile } from "../../packages/bun-video/src/sdk";
import type { MediaSDKTarget } from "../../packages/bun-video/src/sdk";
import { mediaSDKHostTarget } from "../../packages/bun-video/src/sdk-platform";
import { mediaSDKTool, mediaSourceTree } from "./media-sdk-source";

const zlibConsumer = `#include <zlib.h>
#include <string.h>
#include <stdio.h>
#ifdef BUN_ZLIB_SHARED_CONSUMER
__attribute__((visibility("default"))) int bun_zlib_sdk_roundtrip(void) {
#else
int main(void) {
#endif
  unsigned char input[4096], compressed[8192], output[4096];
  for (unsigned i=0; i<sizeof(input); i++) input[i]=(unsigned char)(i*31u);
  uLongf compressed_size=sizeof(compressed), output_size=sizeof(output);
  if (strcmp(zlibVersion(), ZLIB_VERSION)) return 1;
  if (compress2(compressed,&compressed_size,input,sizeof(input),9)!=Z_OK) return 2;
  if (uncompress(output,&output_size,compressed,compressed_size)!=Z_OK) return 3;
  if (output_size!=sizeof(input) || memcmp(input,output,sizeof(input))) return 4;
  if (crc32(0,(const Bytef*)"123456789",9)!=0xcbf43926UL) return 5;
  if (adler32(1,(const Bytef*)"123456789",9)!=0x091e01deUL) return 6;
  puts("zlib-roundtrip-crc32-adler32:pass"); return 0;
}
`;

const zlibSharedDriver = `int bun_zlib_sdk_roundtrip(void);
int main(void) { return bun_zlib_sdk_roundtrip(); }
`;

/** The absorbed zlib-rs crate whose `export-symbols` feature is the stock zlib C ABI. */
export const zlibSDKOwner = "src/zlib_rs";
export const zlibSDKRepository = "https://github.com/aphrody-labs/bun";
export const zlibSDKLicense = "share/licenses/zlib-rs/LICENSE";
export const zlibSDKLibrary = (target: MediaSDKTarget) => (target.startsWith("windows-") ? "lib/z.lib" : "lib/libz.a");
const objectId = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const systemLibrary =
  /^(?:-l[A-Za-z0-9_.+-]+|-framework|[A-Za-z0-9_.+-]+\.lib|\/defaultlib:[A-Za-z0-9_.-]+|[A-Z][A-Za-z0-9_]*)$/;

/** Provenance is the committed `src/zlib_rs` tree, clean against HEAD; its headers name the crate version. */
export async function verifyZlibSDKSource(root: string) {
  if (!isAbsolute(root)) throw new TypeError("Zlib source verification root must be absolute");
  const owner = join(root, zlibSDKOwner);
  const git = (argv: string[]) => mediaSDKTool(["git", "--literal-pathspecs", ...argv], owner);
  if ((await git(["status", "--porcelain", "--untracked-files=all", "--ignored=matching", "--", "."])).trim())
    throw new Error("Canonical zlib-rs source contains uncommitted or ignored files");
  const revision = (await git(["rev-parse", "HEAD"])).trim();
  const gitTree = (await git(["rev-parse", `HEAD:${zlibSDKOwner}`])).trim();
  if (!objectId.test(revision) || !objectId.test(gitTree)) throw new Error("Canonical zlib-rs Git identity is invalid");
  const names = (await git(["ls-files", "-z", "--", "."])).split("\0").filter(Boolean);
  const manifest = Bun.TOML.parse(await Bun.file(join(owner, "Cargo.toml")).text()) as {
    package?: { name?: string; version?: string; license?: string };
  };
  const version = manifest.package?.version;
  const zlibVersion = (await Bun.file(join(owner, "include/zlib.h")).text()).match(
    /^#define ZLIB_VERSION "([^"]+)"$/m,
  )?.[1];
  if (
    manifest.package?.name !== "zlib-rs" ||
    manifest.package.license !== "Zlib" ||
    !version ||
    !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version) ||
    zlibVersion !== `1.3.2.zlib-rs-${version}`
  )
    throw new Error("Canonical zlib-rs crate, license or header version differs");
  for (const name of ["LICENSE", "include/zlib.h", "include/zconf.h", "src/c_exports.rs"])
    if (!names.includes(name)) throw new Error(`Canonical zlib-rs source lacks its committed ${name}`);
  const source = await mediaSourceTree(owner, names);
  return {
    schema: 1,
    repository: zlibSDKRepository,
    revision,
    owner: zlibSDKOwner,
    gitTree,
    sourceClean: true,
    package: "zlib-rs",
    version,
    zlibVersion,
    sourceTreeSHA256: source.sourceTreeSHA256,
  };
}

export interface ZlibSDKGate {
  schema: 1;
  nativeLink: "passed";
  runtimeQualification: "native-tests-passed";
  sourceReceiptSHA256: string;
  evidence: string[];
}

export function validateZlibSDKGate(gate: ZlibSDKGate): void {
  if (
    !gate ||
    gate.schema !== 1 ||
    gate.nativeLink !== "passed" ||
    gate.runtimeQualification !== "native-tests-passed" ||
    !/^[a-f0-9]{64}$/.test(gate.sourceReceiptSHA256) ||
    !Array.isArray(gate.evidence) ||
    !gate.evidence.length ||
    gate.evidence.some(value => typeof value !== "string" || !value || value.length > 1024)
  )
    throw new Error("Zlib SDK needs its executed native consumer qualification");
}

/** Static native libraries the Rust standard library needs, as rustc reports them for this staticlib. */
export function zlibSystemLibraries(message: string): string[] {
  const libraries = message
    .replace(/^native-static-libs:/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (
    !message.startsWith("native-static-libs:") ||
    libraries.length > 32 ||
    libraries.some(name => !systemLibrary.test(name))
  )
    throw new Error("Rust staticlib reported unbounded or unsupported native libraries");
  return libraries;
}

/** Relocatable pkg-config file; MSVC consumers translate `-lname` to `name.lib`. */
export function zlibPkgConfig(version: string, systemLibraries: readonly string[]) {
  const libraries = systemLibraries
    .filter(name => !name.startsWith("/defaultlib:"))
    .map(name => (name.endsWith(".lib") ? `-l${name.slice(0, -4)}` : name));
  return (
    "prefix=${pcfiledir}/../..\nlibdir=${prefix}/lib\nincludedir=${prefix}/include\n\n" +
    `Name: zlib\nDescription: zlib-rs ${version} (Bun src/zlib_rs), stock zlib C ABI\nVersion: 1.3.2\n` +
    `Libs: -L\${libdir} -lz ${libraries.join(" ")}\nCflags: -I\${includedir}\n`
  ).replace(" \n", "\n");
}

interface ZlibCargoMessage {
  reason?: string;
  target?: { name?: string };
  filenames?: string[];
  message?: { level?: string; message?: string };
}

/** Builds zlib-rs as a C static library and exercises it through fixed native C consumers. */
export async function qualifyZlibNativeSDK(outputDirectory: string, target: MediaSDKTarget, root: string) {
  if (![outputDirectory, root].every(isAbsolute)) throw new TypeError("Zlib qualification owners must be absolute");
  if (mediaSDKHostTarget() !== target) throw new Error("Zlib consumer requires the native target host ABI");
  const checkout = await realpath(root);
  const path = relative(checkout, outputDirectory);
  if (!path || (path !== ".." && !path.startsWith("../") && !path.startsWith("..\\") && !isAbsolute(path)))
    throw new Error("Zlib qualification output overlaps its source checkout");
  const provenance = await verifyZlibSDKSource(checkout);
  await mkdir(outputDirectory, { recursive: false, mode: 0o700 });
  const sourceReceipt = join(outputDirectory, "source-receipt.json");
  await Bun.write(sourceReceipt, JSON.stringify(provenance, null, 2) + "\n");
  const { mediaBuildTarget } = await import("./media-sdk-build");
  const selected = mediaBuildTarget(target);
  const windows = selected.platform === "win32";
  const native = zlibNativeCommand(windows, selected.arch);
  const cargoTarget = join(outputDirectory, "cargo");
  const messages = (
    await mediaSDKTool(
      native([
        "cargo",
        "rustc",
        "--package",
        "zlib-rs",
        "--release",
        "--locked",
        "--features",
        "export-symbols",
        "--crate-type",
        "staticlib",
        "--target",
        selected.rust,
        "--message-format=json",
        "--",
        "--print",
        "native-static-libs",
      ]),
      checkout,
      1_800_000,
      { ...process.env, CARGO_TARGET_DIR: cargoTarget, RUSTC_WRAPPER: undefined, CARGO_BUILD_RUSTC_WRAPPER: undefined },
    )
  )
    .split("\n")
    .filter(line => line.startsWith("{"))
    .map(line => JSON.parse(line) as ZlibCargoMessage);
  const archives = messages
    .filter(item => item.reason === "compiler-artifact" && item.target?.name === "zlib_rs")
    .flatMap(item => item.filenames ?? [])
    .filter(file => /\.(?:a|lib)$/.test(file));
  const notes = messages
    .filter(item => item.reason === "compiler-message" && item.message?.level === "note")
    .map(item => item.message!.message ?? "")
    .filter(text => text.startsWith("native-static-libs:"));
  if (archives.length !== 1 || notes.length !== 1)
    throw new Error("Cargo did not report exactly one zlib-rs staticlib and its native libraries");
  const archive = await containedFile(cargoTarget, archives[0]!);
  // GNU SDK consumers link libgcc statically (-static-libgcc), so std's unwinder comes from libgcc_eh, not libgcc_s.so.
  const gnu = target.startsWith("linux-") && !target.endsWith("-musl");
  const systemLibraries = zlibSystemLibraries(notes[0]!).map(name => (gnu && name === "-lgcc_s" ? "-lgcc_eh" : name));
  const prefix = join(outputDirectory, "prefix");
  const owner = join(checkout, zlibSDKOwner);
  const members: [string, string][] = [
    [zlibSDKLibrary(target), archive],
    ["include/zlib.h", join(owner, "include/zlib.h")],
    ["include/zconf.h", join(owner, "include/zconf.h")],
    [zlibSDKLicense, join(owner, "LICENSE")],
  ];
  for (const [name, file] of members) {
    await mkdir(dirname(join(prefix, name)), { recursive: true, mode: 0o755 });
    await Bun.write(join(prefix, name), Bun.file(file));
  }
  await mkdir(join(prefix, "lib/pkgconfig"), { recursive: true });
  await Bun.write(join(prefix, "lib/pkgconfig/zlib.pc"), zlibPkgConfig(provenance.version, systemLibraries));
  const files: Record<string, string> = {};
  for (const name of [...members.map(([name]) => name), "lib/pkgconfig/zlib.pc"])
    files[name] = await hashSDKFile(join(prefix, name));
  const consumerEvidence = await qualifyZlibConsumers({
    windows,
    arch: selected.arch === "arm64" ? "aarch64" : "x64",
    cc: windows ? "clang-cl" : (Bun.env.CC ?? "cc"),
    flags: windows ? ["/nologo", "/O2", "/MD"] : ["-O2"],
    includes: [join(prefix, "include")],
    libraries: [join(prefix, zlibSDKLibrary(target))],
    systemLibraries,
    consumer: join(outputDirectory, "zlib-consumer.c"),
    executable: join(outputDirectory, windows ? "zlib-consumer.exe" : "zlib-consumer"),
  });
  const changed = await Promise.all(
    Object.entries(files).map(async ([name, sha256]) => (await hashSDKFile(join(prefix, name))) !== sha256),
  );
  if (
    (await verifyZlibSDKSource(checkout)).sourceTreeSHA256 !== provenance.sourceTreeSHA256 ||
    changed.some(Boolean) ||
    (await Promise.all(consumerEvidence.map(({ path }) => hashSDKFile(path)))).some(
      (sha256, i) => sha256 !== consumerEvidence[i]!.sha256,
    )
  )
    throw new Error("Zlib source or SDK bytes changed during qualification");
  const gate: ZlibSDKGate = {
    schema: 1,
    nativeLink: "passed",
    runtimeQualification: "native-tests-passed",
    sourceReceiptSHA256: await hashSDKFile(sourceReceipt),
    evidence: consumerEvidence.map(({ kind, sha256 }) => `${kind}:${sha256}`),
  };
  const receipt = {
    schema: 1,
    kind: "native-sdk",
    component: "zlib",
    package: "zlib-rs",
    version: provenance.version,
    zlibVersion: provenance.zlibVersion,
    sourceRepository: zlibSDKRepository,
    sourceRevision: provenance.revision,
    sourceOwner: zlibSDKOwner,
    sourceTree: provenance.gitTree,
    sourceTreeSHA256: provenance.sourceTreeSHA256,
    consumer: "aphrody-bun",
    target,
    rustTarget: selected.rust,
    includes: ["include"],
    libraries: [zlibSDKLibrary(target)],
    systemLibraries,
    licenses: [zlibSDKLicense],
    files,
    gate,
    sourceReceiptSHA256: gate.sourceReceiptSHA256,
    qualification: gate.runtimeQualification,
  };
  await Bun.write(join(prefix, "bun-native-sdk.json"), JSON.stringify(receipt, null, 2) + "\n");
  const { validateMediaDependencyReceipt } = await import("./media-sdk-build");
  validateMediaDependencyReceipt(await Bun.file(join(prefix, "bun-native-sdk.json")).json(), "zlib", target);
  return { prefix, sourceReceiptSHA256: gate.sourceReceiptSHA256 };
}

function zlibNativeCommand(windows: boolean, arch: string) {
  const toolset = Bun.env.BUN_MSVC_TOOLSET ? ["--toolset", Bun.env.BUN_MSVC_TOOLSET] : [];
  return (argv: string[]) =>
    windows
      ? [process.execPath, "msvc", "exec", "--arch", arch === "aarch64" ? "arm64" : arch, ...toolset, "--", ...argv]
      : argv;
}

interface ZlibConsumerInput {
  windows: boolean;
  arch: "x64" | "aarch64";
  cc: string;
  flags: string[];
  includes: string[];
  libraries: string[];
  systemLibraries: string[];
  consumer: string;
  executable: string;
}

/** Qualify the actual archive in both executable and (Linux) shared-library consumers. */
export async function qualifyZlibConsumers(input: ZlibConsumerInput) {
  const directory = dirname(input.executable);
  await Bun.write(input.consumer, zlibConsumer);
  const files: [string, string][] = [["source", input.consumer]];
  // Windows keeps its MSVC executable gate; this shared-link gate qualifies Linux only.
  if (!input.windows && process.platform === "linux") {
    const shared = zlibSharedConsumerCommands(input);
    await Bun.write(shared.driver, zlibSharedDriver);
    await mediaSDKTool(shared.compile, directory);
    await mediaSDKTool(shared.link, directory);
    const stdout = await mediaSDKTool(shared.execute, directory, undefined, {
      ...process.env,
      LD_LIBRARY_PATH: undefined,
      LD_PRELOAD: undefined,
    });
    if (stdout !== "zlib-roundtrip-crc32-adler32:pass\n")
      throw new Error("Shared zlib consumer did not qualify its roundtrip and checksums");
    const log = join(directory, "zlib-shared-consumer.log");
    await Bun.write(log, stdout);
    files.push(
      ["linux-shared-library", shared.library],
      ["linux-shared-driver", shared.driver],
      ["linux-shared-consumer", shared.executable],
      ["linux-shared-result", log],
    );
  }
  const commands = zlibConsumerCommands(input);
  await mediaSDKTool(commands.compile, directory);
  const stdout = await mediaSDKTool(commands.execute, directory);
  if ((input.windows ? stdout.replaceAll("\r\n", "\n") : stdout) !== "zlib-roundtrip-crc32-adler32:pass\n")
    throw new Error("Native zlib consumer did not qualify its roundtrip and checksums");
  const log = join(directory, "zlib-consumer.log");
  await Bun.write(log, stdout);
  files.push(["consumer", input.executable], ["result", log]);
  if (
    (await hashSDKFile(input.consumer)) !== new Bun.CryptoHasher("sha256").update(zlibConsumer).digest("hex") ||
    (!input.windows &&
      process.platform === "linux" &&
      (await hashSDKFile(zlibSharedConsumerCommands(input).driver)) !==
        new Bun.CryptoHasher("sha256").update(zlibSharedDriver).digest("hex"))
  )
    throw new Error("Zlib consumer sources changed during qualification");
  return Promise.all(files.map(async ([kind, path]) => ({ kind, path, sha256: await hashSDKFile(path) })));
}

export function zlibConsumerCommands(input: ZlibConsumerInput) {
  const native = zlibNativeCommand(input.windows, input.arch);
  return {
    compile: native([
      input.cc,
      ...input.flags,
      ...input.includes.flatMap(path => (input.windows ? [`/I${path}`] : ["-I", path])),
      input.consumer,
      ...input.libraries,
      ...(input.windows
        ? [`/Fe:${input.executable}`, "/link", ...input.systemLibraries]
        : [...input.systemLibraries, "-o", input.executable]),
    ]),
    execute: native([input.executable]),
  };
}

/** Exercise the same roundtrip from an ELF shared library, not just an executable. */
export function zlibSharedConsumerCommands(input: ZlibConsumerInput) {
  if (input.windows) throw new Error("The shared zlib consumer gate requires a native Linux target");
  const directory = dirname(input.executable),
    library = join(directory, "libzlib-consumer.so"),
    driver = join(directory, "zlib-shared-driver.c"),
    executable = join(directory, "zlib-shared-consumer");
  const flags = [...input.flags, "-fPIC", ...input.includes.flatMap(path => ["-I", path])];
  return {
    library,
    driver,
    executable,
    compile: [
      input.cc,
      ...flags,
      "-DBUN_ZLIB_SHARED_CONSUMER",
      input.consumer,
      ...input.libraries,
      "-shared",
      "-Wl,-z,defs",
      "-Wl,-soname,libzlib-consumer.so",
      ...input.systemLibraries,
      "-o",
      library,
    ],
    link: [input.cc, ...flags, driver, library, "-Wl,-rpath,$ORIGIN", "-o", executable],
    execute: [executable],
  };
}

export function nativeSDKArtifacts(manifest: Manifest, component: string): string[] {
  if (!/^[A-Za-z0-9_-]+$/.test(component)) throw new TypeError("Invalid native SDK component");
  const edges = new Map(manifest.edges.flatMap(edge => edge.outputs.map(output => [output, edge] as const)));
  const root = edges.get(component);
  if (!root) throw new Error(`No compiled dependency target: ${component}`);
  const artifacts = new Set<string>();
  const visited = new Set<string>();
  function visit(path: string, depth: number): void {
    if (depth > 64) throw new Error("Native SDK dependency graph exceeded its depth bound");
    if (visited.has(path)) return;
    visited.add(path);
    if (/\.(?:a|lib|o|obj)$/.test(path)) {
      artifacts.add(path);
      return;
    }
    const edge = edges.get(path);
    if (edge?.rule === "phony") for (const input of edge.inputs) visit(input, depth + 1);
  }
  for (const input of root.inputs) visit(input, 0);
  if (!artifacts.size) throw new Error(`Dependency has no compiled SDK library: ${component}`);
  if (artifacts.size > 10_000) throw new Error("Native SDK object count exceeded its bound");
  return [...artifacts];
}

export interface NativeSDKGate {
  schema: 1;
  nativeLink: "passed";
  runtimeQualification: "native-tests-passed" | "wine-smoke-passed";
  configureSHA256: string;
  ninjaSHA256: string;
  sourceReceiptSHA256: string;
  evidence: string[];
}

export function validateNativeSDKGate(gate: NativeSDKGate, configureSHA256: string, ninjaSHA256: string): void {
  if (
    gate.schema !== 1 ||
    gate.nativeLink !== "passed" ||
    !["native-tests-passed", "wine-smoke-passed"].includes(gate.runtimeQualification) ||
    gate.configureSHA256 !== configureSHA256 ||
    gate.ninjaSHA256 !== ninjaSHA256 ||
    !/^[a-f0-9]{64}$/.test(gate.sourceReceiptSHA256) ||
    !Array.isArray(gate.evidence) ||
    !gate.evidence.length ||
    gate.evidence.some(value => typeof value !== "string" || !value || value.length > 1024)
  )
    throw new Error("Native SDK needs the matching linked build and runtime qualification receipt");
}

async function containedFile(directory: string, file: string): Promise<string> {
  const root = await realpath(directory);
  const actual = await realpath(file);
  const member = relative(root, actual);
  if (!member || member.startsWith("..") || isAbsolute(member) || !(await stat(actual)).isFile())
    throw new Error("Native SDK file escaped its selected owner directory");
  return actual;
}

async function nativeTool(argv: string[], cwd: string): Promise<void> {
  await using child = Bun.spawn(argv, { cwd, stdout: "ignore", stderr: "inherit", timeout: 120_000 });
  if (await child.exited) throw new Error(`Native SDK tool failed: ${basename(argv[0] ?? "native SDK tool")}`);
}

export async function packageNativeSDK(
  component: string,
  buildDirectory: string,
  outputDirectory: string,
  gateFile: string,
) {
  if (process.platform !== "linux" && process.platform !== "win32")
    throw new Error("Native SDK packaging requires its Linux or Windows factory owner");
  if (![buildDirectory, outputDirectory, gateFile].every(isAbsolute))
    throw new TypeError("Factory paths must be absolute");
  const build = await realpath(buildDirectory);
  const configureFile = join(build, "configure.json");
  const ninjaFile = join(build, "build.ninja");
  const configureSHA256 = await hashSDKFile(configureFile);
  const ninjaSHA256 = await hashSDKFile(ninjaFile);
  const gate = (await Bun.file(gateFile).json()) as NativeSDKGate;
  validateNativeSDKGate(gate, configureSHA256, ninjaSHA256);
  const input = (await Bun.file(configureFile).json()) as ConfigureInput;
  const { cfg } = configOf(input);
  if (resolve(cfg.buildDir) !== build) throw new Error("SDK configure receipt belongs to another build directory");
  const dependency = allDeps.find(dep => dep.name === component);
  if (!dependency || dependency.enabled?.(cfg) === false) throw new Error("Unknown or disabled native SDK dependency");
  const source = depSource(cfg, dependency);
  if (source.kind !== "github-archive") throw new Error("This factory exports pinned source dependency SDKs only");
  const sourceDirectory = await realpath(depSourceDir(cfg, dependency.name));
  const manifest = readManifest(await Bun.file(ninjaFile).text());
  const artifacts = nativeSDKArtifacts(manifest, component);
  const libraries: string[] = [];
  const objects: string[] = [];
  for (const artifact of artifacts) {
    const file = await containedFile(build, resolve(build, artifact));
    (/\.(?:o|obj)$/.test(file) ? objects : libraries).push(file);
  }
  await mkdir(outputDirectory, { recursive: false, mode: 0o700 });
  if (objects.length) {
    const archive = join(outputDirectory, cfg.windows ? `${component}.lib` : `lib${component}.a`);
    await nativeTool(
      cfg.windows ? [cfg.ar, `/out:${archive}`, ...objects] : [cfg.ar, "qcsD", archive, ...objects],
      build,
    );
    libraries.push(archive);
  }
  const entries: Record<string, Bun.ArchiveEntry> = {};
  const hashes: Record<string, string> = {};
  let bytes = 0;
  async function add(name: string, file: string): Promise<void> {
    const info = await stat(file);
    bytes += info.size;
    if (bytes > 2 * 1024 * 1024 * 1024 || Object.keys(entries).length >= 100_000)
      throw new Error("Native SDK file budget exceeded");
    if (entries[name]) throw new Error("Native SDK member collision");
    entries[name] = { data: await Bun.file(file).bytes(), mode: info.mode & 0o777, mtime: 0 };
    hashes[name] = await hashSDKFile(file);
  }
  for (const library of libraries) await add(`lib/${basename(library)}`, library);
  const includes: string[] = [];
  for (const include of dependency.provides(cfg).includes) {
    const root = await realpath(resolve(sourceDirectory, include));
    const sourceRelative = relative(sourceDirectory, root);
    const generatedRelative = relative(join(build, "deps", component), root);
    const inside = (path: string) =>
      !isAbsolute(path) && path !== ".." && !path.startsWith("../") && !path.startsWith("..\\");
    const includeName = inside(sourceRelative)
      ? ["source", sourceRelative.replaceAll("\\", "/")].filter(Boolean).join("/")
      : inside(generatedRelative)
        ? ["generated", generatedRelative.replaceAll("\\", "/")].filter(Boolean).join("/")
        : undefined;
    if (!includeName) throw new Error("SDK include root belongs to another source or build owner");
    includes.push(includeName);
    for await (const name of new Bun.Glob("**/*.{h,hh,hpp,hxx,inc,inl}").scan({
      cwd: root,
      onlyFiles: true,
      dot: true,
    })) {
      const member = `${includeName}/${name.replaceAll("\\", "/")}`;
      if (!entries[member]) await add(member, await containedFile(root, join(root, name)));
    }
  }
  if (!includes.length) throw new Error("Native SDK has no public include directories");
  const licenses: string[] = [];
  for await (const name of new Bun.Glob("{COPYING*,LICENSE*,NOTICE*,AUTHORS*}").scan({
    cwd: sourceDirectory,
    onlyFiles: true,
  })) {
    const member = `licenses/${name}`;
    await add(member, await containedFile(sourceDirectory, join(sourceDirectory, name)));
    licenses.push(member);
  }
  if (!licenses.length) throw new Error("Native SDK lacks its source license notices");
  const patches = typeof dependency.patches === "function" ? dependency.patches(cfg) : (dependency.patches ?? []);
  for (const patch of patches)
    await add(`source/patches/${patch.replaceAll("\\", "/")}`, await containedFile(cfg.cwd, resolve(cfg.cwd, patch)));
  const receipt = {
    schema: 1,
    kind: "native-sdk",
    component,
    version: source.commit,
    sourceRevision: source.commit,
    sourceRepository: `https://github.com/${source.repo}`,
    consumer: "aphrody-bun",
    source,
    sourceIdentity: nativeSDKSourceIdentity(cfg, dependency, source),
    sourceRoot: "source",
    gate,
    target: `${cfg.os}-${cfg.arch}`,
    buildABI: computeNativeSDKABI(cfg, dependency),
    includes,
    libraries: libraries.map(file => `lib/${basename(file)}`),
    defines: dependency.provides(cfg).defines ?? [],
    licenses,
    files: hashes,
    configureSHA256,
    ninjaSHA256,
    sourceReceiptSHA256: gate.sourceReceiptSHA256,
    qualification: gate.runtimeQualification,
  };
  entries["bun-native-sdk.json"] = { data: JSON.stringify(receipt, null, 2), mode: 0o644, mtime: 0 };
  const identity = new Bun.CryptoHasher("sha256").update(JSON.stringify(receipt)).digest("hex");
  const filename = `${component}-${cfg.os}-${cfg.arch}-${identity.slice(0, 16)}-sdk.zip`;
  const output = join(outputDirectory, filename);
  await Bun.write(output, await new Bun.Archive(entries, { format: "zip", mtime: 0 }).blob());
  if ((await hashSDKFile(configureFile)) !== configureSHA256 || (await hashSDKFile(ninjaFile)) !== ninjaSHA256)
    throw new Error("Build configuration changed during SDK packaging");
  const asset = {
    url: `https://bun-lib.aphrody.app/native/${filename}`,
    sha256: await hashSDKFile(output),
    bytes: (await stat(output)).size,
    format: "zip",
  };
  await Bun.write(join(outputDirectory, "distribution.json"), JSON.stringify({ ...receipt, asset }, null, 2));
  return { output, asset, qualification: receipt.qualification };
}

if (import.meta.main) {
  const [component, build, output, gate] = process.argv.slice(2);
  if (!component || !build || !output || !gate)
    throw new TypeError("Expected component, existing build, new output directory and qualification receipt");
  console.log(
    JSON.stringify(await packageNativeSDK(component, resolve(build), resolve(output), resolve(gate)), null, 2),
  );
}
