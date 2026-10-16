import { mkdir, readdir, symlink, lstat } from "node:fs/promises";
import { dirname, join, resolve, relative, delimiter } from "node:path";
import { generate, inputFiles } from "../../packages/bun-agent-plugin/src/generate.ts";
import { isAphrodyBun } from "../../packages/bun-agent-plugin/src/hooks/common.ts";

const owner = resolve(import.meta.dir, "../..");
const contracts = {
  "bun-supervisor": {
    name: "@aphrody/supervisor",
    tests: ["budget", "notify", "pressure", "supervisor"].map(name => `./test/js/bun/supervisor/${name}.test.ts`),
  },
  "bun-tools": {
    name: "@aphrody/bun-tools",
    tests: ["./packages/bun-tools/test/tools.test.ts", "./packages/bun-tools/test/indexing.test.ts"],
  },
  "bun-tauri": { name: "@aphrody/tauri", tests: ["./test/internal/tauri-package-exports.test.ts"] },
} as const;
type Selection = keyof typeof contracts;
const sha256 = (bytes: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
async function fileSHA256(path: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256");
  for await (const bytes of Bun.file(path).stream()) hash.update(bytes);
  return hash.digest("hex");
}

/** Other selections keep the existing native release qualification route. */
export function portableNpmSelection(only: string | undefined): Selection[] | null {
  if (!only) return null;
  const names = only.split(",");
  if (new Set(names).size !== names.length || names.some(name => !Object.hasOwn(contracts, name))) return null;
  return names.sort() as Selection[];
}

export function npmSourceQualificationRoute(
  only: string | undefined,
): "plugin-source" | "portable-source" | "native-full" {
  return only === "bun-agent-plugin" ? "plugin-source" : portableNpmSelection(only) ? "portable-source" : "native-full";
}

export function npmSelectionIncludesPlugin(only: string | undefined): boolean {
  return !only || only.split(",").includes("bun-agent-plugin");
}

type RuntimeIdentity = { version: string; revision: string; sourceUrl: string };
type ArchiveProof = {
  directory: Selection;
  name: string;
  version: string;
  archiveSHA256: string;
  archiveBytes: number;
  exports: { specifier: string; path: string; sha256: string }[];
};
export type PortableNpmProof = {
  schema: 1;
  kind: "bun-portable-npm-source-qualification";
  source: string;
  lockSHA256: string;
  runtime: RuntimeIdentity;
  selection: Selection[];
  nativePayloadQualified: false;
  standaloneTypesQualified: false;
  packages: ArchiveProof[];
  logs: { name: string; sha256: string }[];
};
function runtimeIdentity(): RuntimeIdentity {
  return { version: Bun.version, revision: Bun.revision, sourceUrl: process.release.sourceUrl ?? "" };
}

export function validatePortableNpmProof(
  proof: Omit<PortableNpmProof, "nativePayloadQualified" | "standaloneTypesQualified"> & {
    nativePayloadQualified: boolean;
    standaloneTypesQualified: boolean;
  },
  source: string,
  only: string,
): void {
  const selected = portableNpmSelection(only);
  const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  if (
    !selected ||
    proof.schema !== 1 ||
    proof.kind !== "bun-portable-npm-source-qualification" ||
    proof.source !== source ||
    !/^[a-f0-9]{40}$/.test(source) ||
    !hash(proof.lockSHA256) ||
    proof.nativePayloadQualified !== false ||
    proof.standaloneTypesQualified !== false ||
    JSON.stringify(proof.selection) !== JSON.stringify(selected) ||
    !proof.runtime ||
    typeof proof.runtime.version !== "string" ||
    !/^[a-f0-9]{40}$/.test(proof.runtime.revision) ||
    !proof.runtime.sourceUrl.startsWith("https://github.com/aphrody-labs/bun/releases/download/") ||
    proof.packages?.length !== selected.length ||
    proof.logs?.length !== selected.length + 1
  )
    throw new Error("Invalid portable npm source qualification");
  for (const [index, directory] of selected.entries()) {
    const pkg = proof.packages[index];
    if (
      !pkg ||
      pkg.directory !== directory ||
      pkg.name !== contracts[directory].name ||
      !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version) ||
      !hash(pkg.archiveSHA256) ||
      !Number.isSafeInteger(pkg.archiveBytes) ||
      pkg.archiveBytes < 1 ||
      pkg.archiveBytes > 32 * 1024 ** 2 ||
      !pkg.exports?.length ||
      pkg.exports.some(file => !safeMember(file.path) || !hash(file.sha256) || typeof file.specifier !== "string")
    )
      throw new Error("Invalid portable npm package evidence");
  }
  for (const [index, log] of proof.logs.entries())
    if (log.name !== `gate-${index}.log` || !hash(log.sha256)) throw new Error("Invalid portable npm gate evidence");
}

function safeMember(path: string): boolean {
  return (
    path.startsWith("package/") &&
    !/[\\:\0]/.test(path) &&
    path
      .split("/")
      .every(
        part =>
          part !== ".." &&
          ![
            ".ssh",
            ".aphrody",
            ".codex",
            ".claude",
            "cookies",
            "sessions",
            "credentials",
            "secrets",
            "captures",
            "corpus",
            "receipts",
            "private",
          ].includes(part) &&
          part !== ".env" &&
          !part.startsWith(".env.") &&
          !/\.(?:pem|key|sqlite|db|node|dll|so(?:\.\d+)*|dylib|exe|wasm|gguf|safetensors)$/i.test(part),
      )
  );
}

/** Checks shipped source exports without claiming any deferred native provider works. */
export async function inspectPortableNpmArchive(
  bytes: Uint8Array,
  directory: Selection,
): Promise<{
  proof: ArchiveProof;
  files: ReadonlyMap<string, Blob>;
}> {
  if (bytes.length > 32 * 1024 ** 2) throw new Error("Portable npm archive exceeds its bound");
  const files = await new Bun.Archive(bytes).files();
  let expanded = 0;
  for (const [name, file] of files) {
    const source =
      /^package\/(?:package\.json|LICENSE[^/]*|README\.md|NOTICE)$/.test(name) ||
      (directory === "bun-supervisor" && /^package\/(?:src|systemd)\//.test(name)) ||
      (directory === "bun-tools" && name.startsWith("package/src/")) ||
      (directory === "bun-tauri" && /^package\/(?:js\/|crates\/tauri-plugin-aphrody\/iife\/)/.test(name));
    if (!source || !safeMember(name) || (expanded += file.size) > 64 * 1024 ** 2)
      throw new Error("Portable npm archive escaped its source closure");
  }
  const pkg = await files.get("package/package.json")?.json();
  if (!pkg || pkg.name !== contracts[directory].name || typeof pkg.version !== "string" || pkg.private === true)
    throw new Error("Portable npm package identity differs");
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    "bundledDependencies",
    "bundleDependencies",
  ])
    if (pkg[field] && Object.keys(pkg[field]).length)
      throw new Error("Portable npm dependency closure is not qualified");
  if (!pkg.exports || typeof pkg.exports !== "object") throw new Error("Portable npm export map is absent");
  const exports = new Map<string, string>();
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    if (
      (subpath !== "." &&
        (!subpath.startsWith("./") ||
          subpath
            .slice(2)
            .split("/")
            .some(part => !part || part === "." || part === ".."))) ||
      /[\\:\0]/.test(subpath)
    )
      throw new Error("Portable npm export subpath is invalid");
    if (typeof target !== "string" || !target.startsWith("./") || target.split("/").includes(".."))
      throw new Error("Portable npm export target is not qualified");
    const path = "package/" + target.slice(2);
    const [prefix, suffix, extra] = path.split("*");
    const matches =
      suffix === undefined
        ? files.has(path)
          ? [path]
          : []
        : [...files.keys()].filter(name => name.startsWith(prefix!) && name.endsWith(suffix));
    if (extra !== undefined || !matches.length || subpath.split("*").length - 1 !== (suffix === undefined ? 0 : 1))
      throw new Error("Portable npm export file is absent");
    for (const name of matches) {
      const capture = suffix === undefined ? "" : name.slice(prefix!.length, name.length - suffix.length);
      const specifier = pkg.name + (subpath === "." ? "" : subpath.slice(1).replace("*", capture));
      if (exports.has(specifier)) throw new Error("Portable npm export subpath conflicts");
      exports.set(specifier, name);
    }
  }
  if (directory === "bun-tauri" && !files.has("package/crates/tauri-plugin-aphrody/iife/aphrody.js"))
    throw new Error("Tauri facade sidecar source is absent");
  return {
    proof: {
      directory,
      name: pkg.name,
      version: pkg.version,
      archiveSHA256: sha256(bytes),
      archiveBytes: bytes.length,
      exports: await Promise.all(
        [...exports]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(async ([specifier, path]) => ({
            specifier,
            path,
            sha256: sha256(await files.get(path)!.bytes()),
          })),
      ),
    },
    files,
  };
}

async function command(
  root: string,
  args: string[],
  log?: string,
  environment: Record<string, string> = {},
  deadline = 600_000,
): Promise<string> {
  const env = { ...process.env, ...environment };
  env.NODE_PATH = "";
  for (const name of Object.keys(env)) if (/(TOKEN|PASSWORD|SECRET|API_KEY)$/.test(name)) delete env[name];
  const child = Bun.spawn(args, {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    signal: AbortSignal.timeout(deadline),
  });
  const escalation = setTimeout(() => child.kill(9), deadline + 10_000);
  const capture = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8 * 1024 ** 2) {
          child.kill(9);
          throw new Error("Portable npm diagnostic bound exceeded");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return new TextDecoder().decode(Bun.concatArrayBuffers(chunks));
  };
  try {
    const [stdout, stderr, status] = await Promise.all([capture(child.stdout), capture(child.stderr), child.exited]);
    if (log) await Bun.write(log, `[stdout]\n${stdout}\n[stderr]\n${stderr}\n[exit_status:${status}]\n`);
    if (status !== 0) throw new Error("Portable npm qualification command failed; inspect retained gate log");
    return stdout;
  } finally {
    clearTimeout(escalation);
    if (child.exitCode === null) child.kill(9);
    await child.exited.catch(() => {});
  }
}

async function identity(root: string, source: string) {
  if (
    !/^[a-f0-9]{40}$/.test(source) ||
    (await command(root, ["git", "rev-parse", "HEAD"])).trim() !== source ||
    (await command(root, ["git", "status", "--porcelain", "--untracked-files=normal"])).trim()
  )
    throw new Error("Portable npm qualification requires a clean exact-source checkout");
}

export async function consumePortableNpmArchive(bytes: Uint8Array, directory: Selection, consumer: string) {
  const { proof, files } = await inspectPortableNpmArchive(bytes, directory);
  await mkdir(dirname(consumer), { recursive: true });
  await mkdir(consumer, { mode: 0o700 });
  for (const [name, file] of files) {
    await mkdir(dirname(join(consumer, name)), { recursive: true });
    await Bun.write(join(consumer, name), file);
  }
  await mkdir(join(consumer, "node_modules", "@aphrody"), { recursive: true });
  await symlink(
    join(consumer, "package"),
    join(consumer, "node_modules", proof.name),
    process.platform === "win32" ? "junction" : "dir",
  );
  const imports = proof.exports.filter(file => !file.path.endsWith(".d.ts"));
  const imported = await command(consumer, [
    process.execPath,
    "--no-install",
    "-e",
    `for(const path of ${JSON.stringify(imports.map(file => file.specifier))}){const module=await import(path);if(!Object.keys(module).length)throw Error("Empty facade export");}console.log("qualified source exports");`,
  ]);
  return { proof, imported };
}

export async function verifyPortableNpmMetadata(
  files: ReadonlyMap<string, Blob>,
  expected: readonly { path: string; mode: string; sha256: string }[],
): Promise<void> {
  for (const item of expected) {
    const file = files.get("package/" + item.path);
    if (
      item.path.includes("/") ||
      !["100644", "100755"].includes(item.mode) ||
      !file ||
      sha256(await file.bytes()) !== item.sha256
    )
      throw new Error("Facade archive omits or changes source license, NOTICE or README metadata");
  }
}

export async function qualifyPortableNpm(
  output: string,
  only: string,
  source: string,
  stable = false,
): Promise<PortableNpmProof> {
  const selected = portableNpmSelection(only);
  if (!selected) throw new Error("Selection requires the existing native release qualification");
  const { validateOutputDirectory, PACKAGES } = await import("./publish-npm.ts");
  output = validateOutputDirectory(output, owner);
  await identity(owner, source);
  const runtime = runtimeIdentity();
  const version = (await Bun.file(join(owner, "package.json")).json()).version;
  if (!isAphrodyBun() || runtime.version.split("-")[0] !== version)
    throw new Error("Portable npm qualification requires the recognized matching Aphrody runtime");
  if (await Bun.file(join(output, "portable-npm-qualification.json")).exists())
    throw new Error("Immutable portable npm qualification exists");
  await mkdir(output, { recursive: true });
  const lockSHA256 = sha256(await Bun.file(join(owner, "bun.lock")).bytes());
  const stage = join(output, "staging");
  await command(
    owner,
    [
      process.execPath,
      "scripts/aphrody/publish-npm.ts",
      "--dry-run",
      "--no-build",
      "--only",
      selected.join(","),
      "--out",
      stage,
      ...(stable ? ["--stable"] : []),
    ],
    join(output, "gate-0.log"),
  );
  const packages: ArchiveProof[] = [];
  for (const [index, directory] of selected.entries()) {
    const archives = (await readdir(join(stage, "tarballs", directory))).filter(name => name.endsWith(".tgz"));
    if (archives.length !== 1) throw new Error("Portable npm staging must produce one exact archive");
    const bytes = await Bun.file(join(stage, "tarballs", directory, archives[0]!)).bytes();
    const receipt = (await Bun.file(join(stage, `${directory}.source.json`)).json()) as {
      files: { path: string; mode: string; sha256: string }[];
      outputs: { path: string; mode: string; sha256: string }[];
    };
    const roots = PACKAGES.find(spec => spec.dir === directory)!.sourcePaths!;
    const metadata = [...receipt.files, ...receipt.outputs].filter(
      file => !file.path.includes("/") && file.path !== "package.json" && !roots.includes(file.path),
    );
    await verifyPortableNpmMetadata((await inspectPortableNpmArchive(bytes, directory)).files, metadata);
    const { proof, imported } = await consumePortableNpmArchive(bytes, directory, join(output, "consumers", directory));
    const ownerLog = join(output, `owner-${index}.log`);
    await command(owner, [process.execPath, "test", ...contracts[directory].tests], ownerLog);
    await Bun.write(
      join(output, `gate-${index + 1}.log`),
      `[isolated consumer]\n${imported}\n[owner tests]\n${await Bun.file(ownerLog).text()}`,
    );
    packages.push(proof);
  }
  await identity(owner, source);
  if (sha256(await Bun.file(join(owner, "bun.lock")).bytes()) !== lockSHA256)
    throw new Error("Portable npm lock changed during qualification");
  const proof: PortableNpmProof = {
    schema: 1,
    kind: "bun-portable-npm-source-qualification",
    source,
    lockSHA256,
    runtime,
    selection: selected,
    nativePayloadQualified: false,
    standaloneTypesQualified: false,
    packages,
    logs: await Promise.all(
      Array.from({ length: selected.length + 1 }, async (_, index) => {
        const name = `gate-${index}.log`;
        return { name, sha256: sha256(await Bun.file(join(output, name)).bytes()) };
      }),
    ),
  };
  validatePortableNpmProof(proof, source, only);
  await Bun.write(join(output, "portable-npm-qualification.json"), JSON.stringify(proof, null, 2) + "\n");
  return proof;
}

/** Binds the tested archive and its evidence immediately before the existing publisher writes. */
export async function verifyPortableNpmPublication(
  receipt: string,
  context: { source: string; only: string; directory: string; archive: string },
): Promise<void> {
  const proof = (await Bun.file(receipt).json()) as PortableNpmProof;
  validatePortableNpmProof(proof, context.source, context.only);
  await identity(owner, context.source);
  if (
    !isAphrodyBun() ||
    JSON.stringify(proof.runtime) !== JSON.stringify(runtimeIdentity()) ||
    proof.lockSHA256 !== sha256(await Bun.file(join(owner, "bun.lock")).bytes())
  )
    throw new Error("Portable npm runtime or lock qualification differs");
  for (const log of proof.logs)
    if (sha256(await Bun.file(join(dirname(receipt), log.name)).bytes()) !== log.sha256)
      throw new Error("Portable npm qualification log differs");
  const pkg = proof.packages.find(pkg => pkg.directory === context.directory);
  if (!pkg) throw new Error("Package is outside portable npm qualification");
  await verifyQualifiedPortableNpmArchive(pkg, await Bun.file(context.archive).bytes());
}

export async function verifyQualifiedPortableNpmArchive(pkg: ArchiveProof, bytes: Uint8Array): Promise<void> {
  const actual = (await inspectPortableNpmArchive(bytes, pkg.directory)).proof;
  if (JSON.stringify(actual) !== JSON.stringify(pkg)) throw new Error("Actual npm archive differs from qualification");
}

const pluginDirectory = "bun-agent-plugin";
const pluginName = "@aphrody/bun-agent-plugin";
const pluginGates = ["generate", "generate-check", "pack", "consumer", "doctor", "owner-tests", "mcp"] as const;
export const pluginQualificationTests = [
  "./test/internal/aphrody-publish-npm.test.ts",
  "./scripts/aphrody/release-portable-npm.test.ts",
  "./packages/bun-agent-plugin/src/input-files.test.ts",
  "./packages/bun-agent-plugin/src/public-decision-docs.test.ts",
  "./packages/bun-agent-plugin/src/install-executable.test.ts",
  ...["agent-plugin", "adapters", "runtime-provenance", "decision-context", "yolo-identity"].map(
    name => `./test/cli/agent-plugin/${name}.test.ts`,
  ),
];
type PluginFile = { path: string; sha256: string };
export type PluginNpmProof = {
  schema: 1;
  kind: "bun-plugin-npm-source-qualification";
  source: string;
  selection: ["bun-agent-plugin"];
  runtime: RuntimeIdentity & { sha256: string };
  lockSHA256: string;
  nativePayloadQualified: false;
  allPlatformsQualified: false;
  inputs: PluginFile[];
  members: PluginFile[];
  archive: { name: string; version: string; bytes: number; sha256: string; integrity: string };
  logs: PluginFile[];
  mcp: { source: string; suiteSHA256: string; passed: true; logSHA256: string };
};

function safePluginInput(path: string): boolean {
  return !!path && !/[\\:\0]/.test(path) && path.split("/").every(part => !!part && part !== "." && part !== "..");
}

export function validatePluginNpmProof(proof: PluginNpmProof, source: string): void {
  const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  const manifest = (files: PluginFile[], member: boolean) =>
    Array.isArray(files) &&
    files.length > 0 &&
    files.length <= 10_000 &&
    files.every(
      (file, index) =>
        typeof file.path === "string" &&
        (member ? safeMember(file.path) : safePluginInput(file.path)) &&
        hash(file.sha256) &&
        (index === 0 || files[index - 1]!.path < file.path),
    );
  if (
    !proof ||
    proof.schema !== 1 ||
    proof.kind !== "bun-plugin-npm-source-qualification" ||
    JSON.stringify(proof.selection) !== JSON.stringify([pluginDirectory]) ||
    !/^[a-f0-9]{40}$/.test(source) ||
    proof.source !== source ||
    proof.runtime?.revision !== source ||
    !/^\d+\.\d+\.\d+$/.test(proof.runtime?.version ?? "") ||
    !hash(proof.runtime?.sha256) ||
    !proof.runtime?.sourceUrl?.startsWith(
      `https://github.com/aphrody-labs/bun/releases/download/bun-v${proof.runtime.version}/`,
    ) ||
    !hash(proof.lockSHA256) ||
    proof.nativePayloadQualified !== false ||
    proof.allPlatformsQualified !== false ||
    !manifest(proof.inputs, false) ||
    !manifest(proof.members, true) ||
    proof.archive?.name !== pluginName ||
    typeof proof.archive.version !== "string" ||
    (proof.archive.version !== proof.runtime.version &&
      (!proof.archive.version.startsWith(proof.runtime.version + "-aphrody.") ||
        !/-aphrody\.[1-9]\d*$/.test(proof.archive.version))) ||
    !hash(proof.archive.sha256) ||
    !Number.isSafeInteger(proof.archive.bytes) ||
    proof.archive.bytes < 1 ||
    proof.archive.bytes > 32 * 1024 ** 2 ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/.test(proof.archive.integrity) ||
    proof.logs?.length !== pluginGates.length ||
    proof.logs.some((file, index) => file.path !== `${pluginGates[index]}.log` || !hash(file.sha256)) ||
    proof.mcp?.source !== source ||
    proof.mcp.passed !== true ||
    !hash(proof.mcp.suiteSHA256) ||
    proof.mcp.logSHA256 !== proof.logs.at(-1)?.sha256
  )
    throw new Error("Invalid plugin npm source qualification: source, runtime, archive or gates differ");
}

async function pluginInputs(root: string): Promise<PluginFile[]> {
  const paths = [
    ...new Set([
      ...inputFiles(root),
      join(root, "LICENSE.md"),
      join(root, "bun.lock"),
      join(root, "scripts/aphrody/publish-npm.ts"),
      join(root, "scripts/aphrody/release-portable-npm.ts"),
      join(root, "scripts/aphrody/scope.ts"),
      join(root, "test/cli/mcp/mcp.test.ts"),
      ...pluginQualificationTests.map(path => join(root, path)),
    ]),
  ].sort();
  return Promise.all(
    paths.map(async path => {
      const name = relative(root, path).replaceAll("\\", "/");
      if (!safePluginInput(name) || !(await lstat(path)).isFile())
        throw new Error("Plugin input is not an owned regular source file");
      return { path: name, sha256: sha256(await Bun.file(path).bytes()) };
    }),
  );
}

async function pluginExpectedFiles(root: string, version: string): Promise<Map<string, string | Uint8Array>> {
  const { PACKAGES, publishManifest } = await import("./publish-npm.ts");
  const spec = PACKAGES.find(spec => spec.dir === pluginDirectory)!;
  const pkgRoot = join(root, "packages", pluginDirectory);
  const pkg = await Bun.file(join(pkgRoot, "package.json")).json();
  const base = (await Bun.file(join(root, "package.json")).json()).version;
  if (pkg.version !== base || pkg.engines?.bun !== `>=${base}`)
    throw new Error("Plugin source version or Bun engine differs");
  const out = new Map<string, string | Uint8Array>();
  const tracked = (await command(root, ["git", "ls-files", "-z", "--", `packages/${pluginDirectory}`]))
    .split("\0")
    .filter(Boolean);
  for (const path of tracked) {
    const name = relative(pkgRoot, join(root, path)).replaceAll("\\", "/");
    if (!/^(?:bin\/|src\/|memory\/|README\.md$|LICENSE[^/]*$|NOTICE$)/.test(name)) continue;
    if (!safeMember("package/" + name) || !(await lstat(join(root, path))).isFile())
      throw new Error("Plugin source member is not a regular public file");
    out.set("package/" + name, await Bun.file(join(root, path)).bytes());
  }
  if (![...out.keys()].some(path => /^package\/licen[cs]e/i.test(path)))
    out.set("package/LICENSE.md", await Bun.file(join(root, "LICENSE.md")).bytes());
  out.set("package/package.json", JSON.stringify(publishManifest(pkg, spec, version, new Map()), null, 2) + "\n");
  for (const [path, bytes] of generate({ root, pkg: pkgRoot })) out.set("package/plugins/" + path, bytes);
  return out;
}

/** Every member must be an exact tracked source, manifest, license or generated output. */
export async function inspectPluginNpmArchive(
  bytes: Uint8Array,
  expected: ReadonlyMap<string, string | Uint8Array>,
  version: string,
) {
  if (!bytes.length || bytes.length > 32 * 1024 ** 2) throw new Error("Plugin npm archive exceeds its bound");
  const files = await new Bun.Archive(bytes).files();
  if (files.size !== expected.size || !expected.size) throw new Error("Plugin npm archive member closure differs");
  const members: PluginFile[] = [];
  let expanded = 0;
  for (const [path, file] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!safeMember(path) || (expanded += file.size) > 64 * 1024 ** 2 || !expected.has(path))
      throw new Error("Plugin npm archive escaped its source closure");
    const digest = sha256(await file.bytes());
    if (digest !== sha256(expected.get(path)!)) throw new Error(`Plugin npm member differs: ${path}`);
    members.push({ path, sha256: digest });
  }
  const pkg = await files.get("package/package.json")?.json();
  if (
    pkg?.name !== pluginName ||
    pkg.version !== version ||
    pkg.engines?.bun !== `>=${version.split("-")[0]}` ||
    pkg.private === true ||
    ["dependencies", "optionalDependencies", "peerDependencies", "bundledDependencies", "bundleDependencies"].some(
      field => pkg[field] && Object.keys(pkg[field]).length,
    )
  )
    throw new Error("Plugin npm manifest identity or dependency closure differs");
  if (
    JSON.stringify(pkg.exports) !==
      JSON.stringify({
        ".": "./src/cli.ts",
        "./rewrite": "./src/hooks/rewrite.ts",
        "./decision": "./src/decision.ts",
        "./package.json": "./package.json",
      }) ||
    JSON.stringify(pkg.bin) !== JSON.stringify({ "bun-agent-plugin": "./bin/bun-agent-plugin.ts" }) ||
    !files.has("package/LICENSE.md") ||
    !files.has("package/README.md") ||
    ![...files.keys()].some(path => path.startsWith("package/plugins/"))
  )
    throw new Error("Plugin npm exports, bin, license or generated tree are absent");
  for (const path of [...Object.values<string>(pkg.exports), ...Object.values<string>(pkg.bin)])
    if (!files.has("package/" + path.slice(2))) throw new Error("Plugin npm export or bin file is absent");
  return {
    files,
    members,
    archive: {
      name: pluginName,
      version,
      bytes: bytes.length,
      sha256: sha256(bytes),
      integrity: `sha512-${new Bun.CryptoHasher("sha512").update(bytes).digest("base64")}`,
    },
  };
}

function pluginEnvironment(home: string): Record<string, string> {
  return {
    HOME: home,
    USERPROFILE: home,
    BUN_INSTALL: join(home, ".bun"),
    CODEX_HOME: join(home, ".codex"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local/share"),
    XDG_CACHE_HOME: join(home, ".cache"),
    BUN_MCP_MEMORY_DB: join(home, "memory.db"),
    BUN_MCP_PROFILE: "generic",
    BUN_FEATURE_FLAG_EXPERIMENTAL_MCP_NATIVE_TOOLS: "0",
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
    NODE_PATH: "",
    CLAUDECODE: "",
    CLAUDE_CODE_ENTRYPOINT: "",
    REDIS_URL: "",
    VALKEY_URL: "",
    BUN_MCP_MAX_TOKENS: "",
    PATH: join(home, "bin") + delimiter + (process.env.PATH ?? ""),
  };
}

export function verifyPluginTestSummary(log: string, suites: readonly string[]): void {
  if (
    !/\b0 fail\b/.test(log) ||
    !/Ran [1-9]\d* tests/.test(log) ||
    !/\b[1-9]\d* pass\b/.test(log) ||
    /\b[1-9]\d* (?:skip|todo)\b/.test(log) ||
    suites.some(path => !log.includes(path.replace(/^\.\//, "") + ":"))
  )
    throw new Error("Plugin qualification did not execute its complete test suites");
}

export async function qualifyPluginNpm(output: string, source: string, stable = false): Promise<PluginNpmProof> {
  if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== source)
    throw new Error("Plugin qualification source differs from GITHUB_SHA");
  const { validateOutputDirectory } = await import("./publish-npm.ts");
  output = validateOutputDirectory(output, owner);
  await identity(owner, source);
  const runtime = { ...runtimeIdentity(), sha256: await fileSHA256(process.execPath) };
  const version = (await Bun.file(join(owner, "package.json")).json()).version;
  if (!isAphrodyBun() || runtime.revision !== source || runtime.version !== version)
    throw new Error("Plugin qualification requires the exact package-source Aphrody runtime");
  await mkdir(output, { mode: 0o700 });
  const inputs = await pluginInputs(owner);
  const env = pluginEnvironment(join(output, "home"));
  await mkdir(env.HOME!, { mode: 0o700 });
  await mkdir(join(env.HOME!, "bin"), { mode: 0o700 });
  await symlink(process.execPath, join(env.HOME!, "bin", process.platform === "win32" ? "bun.exe" : "bun"), "file");
  const gate = (name: (typeof pluginGates)[number], args: string[], cwd = owner, deadline = 600_000) =>
    command(
      cwd,
      args[0] === process.execPath ? [args[0], "--no-env-file", ...args.slice(1)] : args,
      join(output, `${name}.log`),
      env,
      deadline,
    );
  const generated = join(output, "generated");
  const generator = [
    process.execPath,
    "scripts/aphrody/agent-plugin.ts",
    "generate",
    "--root",
    owner,
    "--out",
    generated,
  ];
  await gate("generate", generator);
  await gate("generate-check", [...generator, "--check"]);
  const stage = join(output, "staging");
  await gate("pack", [
    process.execPath,
    "scripts/aphrody/publish-npm.ts",
    "--dry-run",
    "--no-build",
    ...(stable ? ["--stable"] : []),
    "--only",
    pluginDirectory,
    "--out",
    stage,
  ]);
  const archives = (await readdir(join(stage, "tarballs", pluginDirectory))).filter(name => name.endsWith(".tgz"));
  if (archives.length !== 1) throw new Error("Plugin staging must produce exactly one archive");
  const bytes = await Bun.file(join(stage, "tarballs", pluginDirectory, archives[0]!)).bytes();
  const packed = await (await new Bun.Archive(bytes).files()).get("package/package.json")!.json();
  const inspected = await inspectPluginNpmArchive(
    bytes,
    await pluginExpectedFiles(owner, packed.version),
    packed.version,
  );
  const consumer = join(output, "consumer");
  await mkdir(consumer, { mode: 0o700 });
  for (const [name, file] of inspected.files) {
    await mkdir(dirname(join(consumer, name)), { recursive: true });
    await Bun.write(join(consumer, name), file);
  }
  await mkdir(join(consumer, "node_modules", "@aphrody"), { recursive: true });
  await symlink(
    join(consumer, "package"),
    join(consumer, "node_modules", pluginName),
    process.platform === "win32" ? "junction" : "dir",
  );
  await gate(
    "consumer",
    [
      process.execPath,
      "--no-install",
      "-e",
      `for(const path of ${JSON.stringify([pluginName, pluginName + "/rewrite", pluginName + "/decision"])}){if(!Object.keys(await import(path)).length)throw Error("Empty plugin export");}const pkg=await import(${JSON.stringify(pluginName + "/package.json")});if(pkg.default.version!==${JSON.stringify(packed.version)})throw Error("Consumer version differs");console.log("qualified plugin exports");`,
    ],
    consumer,
  );
  const doctor = JSON.parse(
    await gate(
      "doctor",
      ["bun", "--no-env-file", "--no-install", join(consumer, "package/bin/bun-agent-plugin.ts"), "doctor", "--json"],
      consumer,
    ),
  );
  if (
    doctor.aphrody !== true ||
    doctor.bun !== process.execPath ||
    doctor.version !== Bun.version_with_sha ||
    doctor.installed !== null ||
    doctor.mcp !== null
  )
    throw new Error("Plugin doctor did not inspect the isolated exact runtime");
  await gate("owner-tests", [process.execPath, "test", "--max-concurrency", "1", ...pluginQualificationTests]);
  verifyPluginTestSummary(await Bun.file(join(output, "owner-tests.log")).text(), pluginQualificationTests);
  await gate("mcp", [process.execPath, "test", "--max-concurrency", "1", "./test/cli/mcp/mcp.test.ts"], owner, 180_000);
  const mcpLog = await Bun.file(join(output, "mcp.log")).text();
  verifyPluginTestSummary(mcpLog, ["./test/cli/mcp/mcp.test.ts"]);
  await identity(owner, source);
  if (
    (await fileSHA256(process.execPath)) !== runtime.sha256 ||
    JSON.stringify(inputs) !== JSON.stringify(await pluginInputs(owner))
  )
    throw new Error("Plugin source or runtime changed during qualification");
  const logs = await Promise.all(
    pluginGates.map(async name => ({
      path: `${name}.log`,
      sha256: sha256(await Bun.file(join(output, `${name}.log`)).bytes()),
    })),
  );
  const proof: PluginNpmProof = {
    schema: 1,
    kind: "bun-plugin-npm-source-qualification",
    source,
    selection: [pluginDirectory],
    runtime,
    lockSHA256: sha256(await Bun.file(join(owner, "bun.lock")).bytes()),
    nativePayloadQualified: false,
    allPlatformsQualified: false,
    inputs,
    members: inspected.members,
    archive: inspected.archive,
    logs,
    mcp: {
      source,
      suiteSHA256: sha256(await Bun.file(join(owner, "test/cli/mcp/mcp.test.ts")).bytes()),
      passed: true,
      logSHA256: logs.at(-1)!.sha256,
    },
  };
  validatePluginNpmProof(proof, source);
  await Bun.write(join(output, "plugin-npm-qualification.json"), JSON.stringify(proof, null, 2) + "\n");
  return proof;
}

export async function verifyPluginNpmQualification(receipt: string, source: string): Promise<PluginNpmProof> {
  if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== source)
    throw new Error("Plugin publication source differs from GITHUB_SHA");
  const proof = (await Bun.file(receipt).json()) as PluginNpmProof;
  validatePluginNpmProof(proof, source);
  await identity(owner, source);
  const runtime = { ...runtimeIdentity(), sha256: await fileSHA256(process.execPath) };
  if (
    !isAphrodyBun() ||
    JSON.stringify(runtime) !== JSON.stringify(proof.runtime) ||
    proof.lockSHA256 !== sha256(await Bun.file(join(owner, "bun.lock")).bytes()) ||
    JSON.stringify(proof.inputs) !== JSON.stringify(await pluginInputs(owner)) ||
    proof.mcp.suiteSHA256 !== sha256(await Bun.file(join(owner, "test/cli/mcp/mcp.test.ts")).bytes())
  )
    throw new Error("Plugin source, lock, runtime or MCP qualification differs");
  for (const file of proof.logs)
    if (sha256(await Bun.file(join(dirname(receipt), file.path)).bytes()) !== file.sha256)
      throw new Error("Plugin qualification gate log differs");
  return proof;
}

export async function verifyPluginNpmPublication(
  receipt: string,
  context: { source: string; directory: string; archive: string },
): Promise<void> {
  if (context.directory !== pluginDirectory) throw new Error("Plugin qualification cannot authorize another package");
  const proof = await verifyPluginNpmQualification(receipt, context.source);
  const actual = await inspectPluginNpmArchive(
    await Bun.file(context.archive).bytes(),
    await pluginExpectedFiles(owner, proof.archive.version),
    proof.archive.version,
  );
  if (
    JSON.stringify(actual.members) !== JSON.stringify(proof.members) ||
    JSON.stringify(actual.archive) !== JSON.stringify(proof.archive)
  )
    throw new Error("Actual plugin archive differs from qualification");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const value = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  if (args[0] === "route") {
    console.log(npmSourceQualificationRoute(value("--only")));
  } else if (args[0] === "contains-plugin") {
    console.log(npmSelectionIncludesPlugin(value("--only")));
  } else if (args[0] === "qualify-plugin") {
    if (value("--only") !== pluginDirectory || !value("--source") || !value("--out"))
      throw new Error("Expected qualify-plugin --only bun-agent-plugin --source <SHA> --out <private output>");
    await qualifyPluginNpm(value("--out")!, value("--source")!, args.includes("--stable"));
    console.log("Plugin source qualification complete; native payloads and foreign platforms are excluded");
  } else if (args[0] === "qualify") {
    if (!args.includes("--only") || !args.includes("--source") || !args.includes("--out"))
      throw new Error("Expected qualify --only <exact selection> --source <SHA> --out <private output>");
    await qualifyPortableNpm(value("--out")!, value("--only")!, value("--source")!, args.includes("--stable"));
    console.log("Portable npm source qualification complete; native payloads are excluded");
  } else throw new Error("Expected route, contains-plugin, qualify or qualify-plugin");
}
