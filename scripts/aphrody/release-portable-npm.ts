import { mkdir, readdir, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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

/** Other selections keep the existing native release qualification route. */
export function portableNpmSelection(only: string | undefined): Selection[] | null {
  if (!only) return null;
  const names = only.split(",");
  if (new Set(names).size !== names.length || names.some(name => !Object.hasOwn(contracts, name))) return null;
  return names.sort() as Selection[];
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

async function command(root: string, args: string[], log?: string): Promise<string> {
  const env = { ...process.env };
  env.NODE_PATH = "";
  for (const name of Object.keys(env)) if (/(TOKEN|PASSWORD|SECRET|API_KEY)$/.test(name)) delete env[name];
  const child = Bun.spawn(args, {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
    signal: AbortSignal.timeout(600_000),
  });
  const escalation = setTimeout(() => child.kill(9), 610_000);
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

if (import.meta.main) {
  const args = process.argv.slice(2);
  const value = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const selected = portableNpmSelection(value("--only"));
  if (args[0] === "route") {
    console.log(selected ? "portable-source" : "native-full");
  } else if (args[0] === "qualify") {
    if (!args.includes("--only") || !args.includes("--source") || !args.includes("--out"))
      throw new Error("Expected qualify --only <exact selection> --source <SHA> --out <private output>");
    await qualifyPortableNpm(value("--out")!, value("--only")!, value("--source")!, args.includes("--stable"));
    console.log("Portable npm source qualification complete; native payloads are excluded");
  } else throw new Error("Expected route or qualify");
}
