import { lstat, mkdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { configOf, type ConfigureInput } from "../build/configure";
import { allDeps } from "../build/deps";
import { readManifest, type Manifest } from "../build/ninja";
import { computeNativeSDKABI, nativeSDKSourceIdentity } from "../build/native-sdk";
import { depSource, depSourceDir } from "../build/source";
import { hashSDKFile } from "../../packages/bun-video/src/sdk";
import type { MediaSDKTarget } from "../../packages/bun-video/src/sdk";
import { mediaSourceTree } from "./media-sdk-source";
import { computeDepFlags } from "../build/flags";
import { computeSourceIdentity } from "../build/fetch-cli";
import { mediaSDKTool } from "./media-sdk-source";
import { ensureNinja } from "../build/ninja-release";

const zlibConsumer = `#include <zlib.h>
#include <string.h>
#include <stdio.h>
int main(void) {
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

interface GitSourceTree {
  sha: string;
  truncated: boolean;
  tree: { path: string; mode: string; type: string; sha: string; size?: number }[];
}
interface ZlibSourceInput {
  source: string;
  archive: string;
  repository: string;
  commit: string;
  patches: readonly string[];
  fixture: string;
}
interface ZlibSourcePorts {
  tree?: (url: string) => Promise<GitSourceTree>;
  patch?: (directory: string, path: string, body: string) => void;
}

/** Authenticate cached bytes against GitHub's pinned Git object inventory, not its cache filename. */
export async function verifyZlibSDKSource(input: ZlibSourceInput, ports: ZlibSourcePorts = {}) {
  if (![input.source, input.archive, input.fixture, ...input.patches].every(isAbsolute))
    throw new TypeError("Zlib source verification paths must be absolute");
  if (input.patches.length > 16 || Bun.file(join(input.source, ".ref")).size > 128)
    throw new Error("Canonical zlib source metadata exceeds its bound");
  const within = (left: string, right: string) => {
    const path = relative(left, right);
    return !path || (path !== ".." && !path.startsWith("../") && !path.startsWith("..\\") && !isAbsolute(path));
  };
  if (within(input.source, input.fixture) || within(input.fixture, input.source))
    throw new Error("Zlib patch fixture overlaps its existing source owner");
  if (input.repository !== "zlib-ng/zlib-ng" || input.commit !== "12731092979c6d07f42da27da673a9f6c7b13586")
    throw new Error("Zlib source differs from its canonical pin");
  const url = `https://api.github.com/repos/${input.repository}/git/trees/${input.commit}?recursive=1`;
  const tree = await (
    ports.tree ??
    (async value => {
      const response = await fetch(value, {
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: { accept: "application/vnd.github+json" },
      });
      if (!response.ok || !response.body) throw new Error("Pinned GitHub source inventory is unavailable");
      const parts: Uint8Array[] = [];
      let size = 0;
      for await (const part of response.body) {
        if ((size += part.byteLength) > 4 * 1024 ** 2)
          throw new Error("Pinned GitHub source inventory exceeds its bound");
        parts.push(part);
      }
      return JSON.parse(new TextDecoder().decode(Buffer.concat(parts))) as GitSourceTree;
    })
  )(url);
  if (
    tree.sha !== input.commit ||
    tree.truncated !== false ||
    !Array.isArray(tree.tree) ||
    tree.tree.length < 1 ||
    tree.tree.length > 10_000
  )
    throw new Error("Pinned GitHub source inventory is incomplete");
  const expected = new Map<string, { mode: string; sha: string; size: number }>();
  let expandedBytes = 0;
  for (const entry of tree.tree) {
    if (entry.type === "tree") continue;
    if (
      entry.type !== "blob" ||
      !["100644", "100755"].includes(entry.mode) ||
      !/^[a-f0-9]{40}$/.test(entry.sha) ||
      !entry.path ||
      entry.path.split("/").some(part => !part || part === "." || part === "..") ||
      /[\\:\0]/.test(entry.path) ||
      expected.has(entry.path) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size! < 0 ||
      entry.size! > 16 * 1024 ** 2 ||
      (expandedBytes += entry.size!) > 512 * 1024 ** 2
    )
      throw new Error("Pinned GitHub source inventory has an unsupported member");
    expected.set(entry.path, { mode: entry.mode, sha: entry.sha, size: entry.size! });
  }
  // This pinned .gitattributes excludes /.github, .gitattributes and .gitignore from git archive.
  // https://github.com/zlib-ng/zlib-ng/blob/12731092979c6d07f42da27da673a9f6c7b13586/.gitattributes
  const attributes = expected.get(".gitattributes");
  if (
    attributes?.sha !== "38fd673cc9e488e364d27a71102599fcc237bbc4" ||
    attributes.size !== 288 ||
    attributes.mode !== "100644"
  )
    throw new Error("Pinned zlib archive export policy differs");
  const excludedMembers: string[] = [];
  for (const name of expected.keys()) {
    if (name.startsWith(".github/") || [".gitattributes", ".gitignore"].includes(basename(name))) {
      excludedMembers.push(name);
      expected.delete(name);
    }
  }
  if (!expected.has("LICENSE.md") || Bun.file(input.archive).size > 64 * 1024 ** 2)
    throw new Error("Pinned zlib source archive or notice is missing");
  const archiveBytes = await Bun.file(input.archive).bytes();
  const archiveSHA256 = new Bun.CryptoHasher("sha256").update(archiveBytes).digest("hex");
  const archive = await new Bun.Archive(archiveBytes).files();
  const prefix = `zlib-ng-${input.commit}/`;
  if (archive.size !== expected.size) throw new Error("Cached zlib archive has missing or unexpected members");
  const pristine = new Map<string, Uint8Array>();
  for (const [name, entry] of expected) {
    const file = archive.get(prefix + name);
    if (!file || file.size !== entry.size) throw new Error("Cached zlib archive member is absent or oversized");
    const bytes = await file.bytes();
    const sha = new Bun.CryptoHasher("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
    if (sha !== entry.sha) throw new Error("Cached zlib archive differs from its authenticated Git blob");
    pristine.set(name, bytes);
  }
  const patches = await Promise.all(
    input.patches.map(async path => {
      if (Bun.file(path).size > 1024 ** 2) throw new Error("Canonical zlib patch exceeds its byte bound");
      const bytes = await Bun.file(path).bytes();
      return {
        path,
        body: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
      };
    }),
  );
  if (
    (await Bun.file(join(input.source, ".ref")).text()).trim() !==
    computeSourceIdentity(
      input.commit,
      patches.map(patch => patch.body),
    )
  )
    throw new Error("Canonical zlib source stamp differs from its pinned patches");
  const targets = new Set<string>();
  for (const patch of patches)
    for (const match of patch.body.matchAll(/^\+\+\+ b\/(.+)$/gm)) {
      const path = match[1]!;
      if (!pristine.has(path)) throw new Error("Zlib patch target is not an authenticated source member");
      targets.add(path);
    }
  if (targets.size > 16) throw new Error("Zlib patch fixture exceeds its member bound");
  await mkdir(input.fixture, { recursive: false, mode: 0o700 });
  for (const path of targets) {
    await mkdir(dirname(join(input.fixture, path)), { recursive: true });
    await Bun.write(join(input.fixture, path), pristine.get(path)!);
  }
  const patchOwner = ports.patch ?? (await import("../build/fetch-cli")).applyPatch;
  for (const patch of patches) patchOwner(input.fixture, patch.path, patch.body);
  const source = await mediaSourceTree(input.source);
  const actualNames = Object.keys(source.files).filter(path => path !== ".ref");
  if (actualNames.length !== expected.size) throw new Error("Canonical zlib source has missing or unexpected files");
  for (const name of actualNames) {
    const entry = expected.get(name),
      info = await lstat(join(input.source, name));
    if (
      !entry ||
      !info.isFile() ||
      (process.platform !== "win32" && !!(info.mode & 0o111) !== (entry.mode === "100755"))
    )
      throw new Error("Canonical zlib source member mode differs");
    const bytes = targets.has(name) ? await Bun.file(join(input.fixture, name)).bytes() : pristine.get(name)!;
    if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== source.files[name]!.sha256)
      throw new Error("Canonical zlib source contains changes outside its pinned patches");
  }
  if (
    (await hashSDKFile(input.archive)) !== archiveSHA256 ||
    (await Promise.all(patches.map(patch => hashSDKFile(patch.path)))).some((sha, i) => sha !== patches[i]!.sha256)
  )
    throw new Error("Zlib archive or patches changed during source verification");
  return {
    schema: 1,
    repository: input.repository,
    commit: input.commit,
    sourceClean: true,
    gitTree: tree.sha,
    gitInventorySHA256: new Bun.CryptoHasher("sha256").update(JSON.stringify(tree)).digest("hex"),
    exportPolicy: { attributesGitBlob: attributes.sha, excludedMembers: excludedMembers.sort() },
    archiveSHA256,
    sourceTreeSHA256: source.sourceTreeSHA256,
    patches: patches.map(({ path, sha256 }) => ({ path, sha256 })),
  };
}

/** Derives the SDK gate from a linked, executed fixed consumer; no caller-supplied pass receipt. */
export async function qualifyZlibNativeSDK(
  buildDirectory: string,
  outputDirectory: string,
  target: MediaSDKTarget,
  root: string,
) {
  if (![buildDirectory, outputDirectory].every(isAbsolute))
    throw new TypeError("Zlib qualification owners must be absolute");
  const build = await realpath(buildDirectory);
  const configureFile = join(build, "configure.json"),
    ninjaFile = join(build, "build.ninja");
  const configureSHA256 = await hashSDKFile(configureFile),
    ninjaSHA256 = await hashSDKFile(ninjaFile);
  const { cfg } = configOf(await Bun.file(configureFile).json());
  const actualTarget = `${cfg.os}-${cfg.arch === "aarch64" ? "arm64" : cfg.arch}${cfg.abi === "musl" ? "-musl" : ""}`;
  if (
    (!cfg.linux && !cfg.windows) ||
    !cfg.canRunOnHost ||
    cfg.asan ||
    actualTarget !== target ||
    resolve(cfg.buildDir) !== build ||
    (await realpath(cfg.cwd)) !== (await realpath(root))
  )
    throw new Error("Zlib consumer requires the matching native Linux or Windows ABI and unsanitized existing build");
  const dependency = allDeps.find(dep => dep.name === "zlib")!;
  for (const owner of [cfg.cwd, build, depSourceDir(cfg, "zlib")]) {
    const path = relative(owner, outputDirectory);
    if (!path || (path !== ".." && !path.startsWith("../") && !path.startsWith("..\\") && !isAbsolute(path)))
      throw new Error("Zlib qualification output overlaps an existing owner");
  }
  const ninja = await ensureNinja(cfg);
  if ((await mediaSDKTool([ninja, "-n", "zlib"], build)).trim() !== "ninja: no work to do.")
    throw new Error("Canonical zlib build is not up to date; run its existing build owner first");
  const source = depSource(cfg, dependency);
  if (source.kind !== "github-archive") throw new Error("Zlib bootstrap requires its canonical pinned archive source");
  const url = `https://github.com/${source.repo}/archive/${source.commit}.tar.gz`;
  const urlHash = new Bun.CryptoHasher("sha256").update(url).digest("hex").slice(0, 16);
  const patchPaths = (
    typeof dependency.patches === "function" ? dependency.patches(cfg) : (dependency.patches ?? [])
  ).map(path => resolve(cfg.cwd, path));
  await mediaSDKTool(["git", "--literal-pathspecs", "diff", "--exit-code", "HEAD", "--", ...patchPaths], cfg.cwd);
  await mkdir(outputDirectory, { recursive: false, mode: 0o700 });
  const provenance = await verifyZlibSDKSource({
    source: await realpath(depSourceDir(cfg, "zlib")),
    archive: join(cfg.cacheDir, "tarballs", `zlib-${urlHash}.tar.gz`),
    repository: source.repo,
    commit: source.commit,
    patches: patchPaths,
    fixture: join(outputDirectory, "patch-fixture"),
  });
  const sourceReceipt = join(outputDirectory, "source-receipt.json");
  await Bun.write(sourceReceipt, JSON.stringify(provenance, null, 2) + "\n");
  const artifacts = nativeSDKArtifacts(readManifest(await Bun.file(ninjaFile).text()), "zlib");
  const libraries = await Promise.all(artifacts.map(file => containedFile(build, resolve(build, file))));
  const hashes = await Promise.all(libraries.map(hashSDKFile));
  const include = dependency.provides(cfg).includes.map(path => resolve(depSourceDir(cfg, "zlib"), path));
  const headers: string[] = [];
  for (const directory of include)
    for (const name of ["zlib.h", "zconf.h", "zlib_name_mangling.h"])
      if (await Bun.file(join(directory, name)).exists()) headers.push(join(directory, name));
  const headerHashes = await Promise.all(headers.map(hashSDKFile));
  const consumer = join(outputDirectory, "zlib-consumer.c"),
    executable = join(outputDirectory, cfg.windows ? "zlib-consumer.exe" : "zlib-consumer");
  await Bun.write(consumer, zlibConsumer);
  const consumerSHA256 = new Bun.CryptoHasher("sha256").update(zlibConsumer).digest("hex");
  const commands = zlibConsumerCommands({
    windows: cfg.windows,
    arch: cfg.arch,
    cc: cfg.cc,
    flags: computeDepFlags(cfg).cflags,
    includes: include,
    libraries,
    consumer,
    executable,
  });
  await mediaSDKTool(commands.compile, build);
  const stdout = await mediaSDKTool(commands.execute, outputDirectory);
  if ((cfg.windows ? stdout.replaceAll("\r\n", "\n") : stdout) !== "zlib-roundtrip-crc32-adler32:pass\n")
    throw new Error("Native zlib consumer did not qualify its roundtrip and checksums");
  const log = join(outputDirectory, "zlib-consumer.log");
  await Bun.write(log, stdout);
  const sourceTree = await mediaSourceTree(depSourceDir(cfg, "zlib"));
  if (
    sourceTree.sourceTreeSHA256 !== provenance.sourceTreeSHA256 ||
    JSON.stringify(await Promise.all(libraries.map(hashSDKFile))) !== JSON.stringify(hashes) ||
    JSON.stringify(await Promise.all(headers.map(hashSDKFile))) !== JSON.stringify(headerHashes) ||
    (await hashSDKFile(consumer)) !== consumerSHA256 ||
    (await hashSDKFile(configureFile)) !== configureSHA256 ||
    (await hashSDKFile(ninjaFile)) !== ninjaSHA256 ||
    (await Promise.all(patchPaths.map(hashSDKFile))).some((hash, i) => hash !== provenance.patches[i]!.sha256)
  )
    throw new Error("Zlib source, patches, library or build changed during qualification");
  const gate: NativeSDKGate = {
    schema: 1,
    nativeLink: "passed",
    runtimeQualification: "native-tests-passed",
    configureSHA256,
    ninjaSHA256,
    sourceReceiptSHA256: await hashSDKFile(sourceReceipt),
    evidence: [
      `consumer:${await hashSDKFile(executable)}`,
      `source:${await hashSDKFile(consumer)}`,
      `result:${await hashSDKFile(log)}`,
    ],
  };
  const gateFile = join(outputDirectory, "native-gate.json");
  await Bun.write(gateFile, JSON.stringify(gate, null, 2) + "\n");
  const packaged = await packageNativeSDK("zlib", build, join(outputDirectory, "package"), gateFile);
  if (
    JSON.stringify(await Promise.all(libraries.map(hashSDKFile))) !== JSON.stringify(hashes) ||
    JSON.stringify(await Promise.all(headers.map(hashSDKFile))) !== JSON.stringify(headerHashes)
  )
    throw new Error("Zlib consumer inputs changed during SDK packaging");
  const prefix = join(outputDirectory, "prefix");
  await mkdir(prefix, { recursive: false, mode: 0o700 });
  const { extractMediaSDKArchive } = await import("../../packages/bun-video/src/sdk");
  await extractMediaSDKArchive(packaged.output, prefix);
  const { validateMediaDependencyReceipt } = await import("./media-sdk-build");
  validateMediaDependencyReceipt(await Bun.file(join(prefix, "bun-native-sdk.json")).json(), "zlib-ng", target);
  return { prefix, sourceReceiptSHA256: gate.sourceReceiptSHA256 };
}

export function zlibConsumerCommands(input: {
  windows: boolean;
  arch: "x64" | "aarch64";
  cc: string;
  flags: string[];
  includes: string[];
  libraries: string[];
  consumer: string;
  executable: string;
}) {
  const native = (argv: string[]) =>
    input.windows
      ? [process.execPath, "msvc", "exec", "--arch", input.arch === "aarch64" ? "arm64" : "x64", "--", ...argv]
      : argv;
  return {
    compile: native([
      input.cc,
      ...input.flags,
      ...input.includes.flatMap(path => (input.windows ? [`/I${path}`] : ["-I", path])),
      input.consumer,
      ...input.libraries,
      ...(input.windows
        ? [`/Fe:${input.executable}`]
        : [
            "-fuse-ld=lld",
            // Match the dependency objects' explicitly non-PIE code model.
            ...(input.flags.includes("-fno-pie") ? ["-Wl,-no-pie"] : []),
            "-lm",
            "-o",
            input.executable,
          ]),
    ]),
    execute: native([input.executable]),
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
