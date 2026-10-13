import { mkdir, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { configOf, type ConfigureInput } from "../build/configure";
import { allDeps } from "../build/deps";
import { readManifest, type Manifest } from "../build/ninja";
import { depSource, depSourceDir } from "../build/source";
import { hashSDKFile } from "../../packages/bun-video/src/sdk";

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
  if (await child.exited) throw new Error(`Native SDK tool failed: ${basename(argv[0])}`);
}

export async function packageNativeSDK(
  component: string,
  buildDirectory: string,
  outputDirectory: string,
  gateFile: string,
) {
  if (process.platform !== "linux") throw new Error("Native SDK packaging belongs to the qualified Linux factory");
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
    entries[name] = { data: Bun.file(file), mode: info.mode & 0o777, mtime: 0 };
    hashes[name] = await hashSDKFile(file);
  }
  for (const library of libraries) await add(`lib/${basename(library)}`, library);
  const includes: string[] = [];
  for (const [index, include] of dependency.provides(cfg).includes.entries()) {
    const root = await realpath(resolve(sourceDirectory, include));
    const includeName = `include/${index}`;
    includes.push(includeName);
    for await (const name of new Bun.Glob("**/*.{h,hpp,hxx,inc,inl}").scan({ cwd: root, onlyFiles: true, dot: true }))
      await add(`${includeName}/${name.replaceAll("\\", "/")}`, await containedFile(root, join(root, name)));
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
    gate,
    target: `${cfg.os}-${cfg.arch}`,
    buildABI: {
      os: cfg.os,
      arch: cfg.arch,
      abi: cfg.abi,
      asan: cfg.asan,
      lto: cfg.lto,
      baseline: cfg.baseline,
      buildType: cfg.buildType,
    },
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
