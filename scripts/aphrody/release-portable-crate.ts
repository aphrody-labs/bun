import { mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export const portableCrateSelection = "crates/aphrody-jev";
export function isPortableCrateSelection(only: string | undefined): boolean {
  return only === portableCrateSelection;
}
const digest = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
export function portableCrateCommands() {
  const select = ["-p", "aphrody-jev"];
  return [
    ["check", "--locked", "--all-targets", ...select],
    ["test", "--locked", ...select],
    ["check", "--locked", "--all-targets", "--all-features", ...select],
    ["test", "--locked", "--all-features", ...select],
    ["package", "--locked", ...select],
    ["publish", "--locked", "--dry-run", ...select],
  ];
}
type Proof = {
  schema: 1;
  kind: "bun-portable-rust-qualification";
  selection: string;
  source: string;
  version: string;
  lockSHA256: string;
  packageSHA256: string;
  packageBytes: number;
  toolchain: string;
  logs: { name: string; sha256: string }[];
};
async function run(root: string, argv: string[], target?: string, logPath?: string) {
  const child = Bun.spawn(argv, {
    cwd: root,
    env: {
      ...process.env,
      CARGO_REGISTRY_TOKEN: undefined,
      CARGO_BUILD_JOBS: "2",
      ...(target ? { CARGO_TARGET_DIR: target } : {}),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const capture = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader(),
      chunks: Uint8Array[] = [];
    let retained = 0,
      truncated = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = value.subarray(0, Math.max(0, 8 * 1024 ** 2 - retained));
        if (chunk.length) chunks.push(chunk);
        retained += chunk.length;
        truncated ||= chunk.length !== value.length;
      }
    } finally {
      reader.releaseLock();
    }
    const result = new Uint8Array(retained);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(result) + (truncated ? "\n[diagnostics truncated at 8 MiB]\n" : "");
  };
  const [stdout, stderr, status] = await Promise.all([capture(child.stdout), capture(child.stderr), child.exited]);
  if (logPath) await recordPortableCommand(logPath, { stdout, stderr, status });
  if (status !== 0) throw new Error("Portable qualification command failed; inspect retained diagnostic log");
  return stdout + stderr;
}
export async function recordPortableCommand(path: string, result: { stdout: string; stderr: string; status: number }) {
  const redact = (text: string) => {
    for (const [name, secret] of Object.entries(process.env))
      if (/(TOKEN|PASSWORD|SECRET|API_KEY)$/.test(name) && secret && secret.length >= 4)
        text = text.replaceAll(secret, "[redacted]");
    return text;
  };
  await Bun.write(
    path,
    redact("[stdout]\n" + result.stdout + "\n[stderr]\n" + result.stderr + "\n[exit_status:" + result.status + "]\n"),
  );
  if (result.status !== 0) throw new Error("Portable qualification command failed; inspect retained diagnostic log");
}
async function identity(root: string, source: string) {
  if (!/^[a-f0-9]{40}$/.test(source)) throw new Error("Portable qualification requires an exact source SHA");
  if (
    (await run(root, ["git", "rev-parse", "HEAD"])).trim() !== source ||
    (await run(root, ["git", "status", "--porcelain", "--untracked-files=normal"])).trim()
  )
    throw new Error("Portable qualification requires clean exact-source checkout");
}
export function validatePortableProof(proof: Proof, source: string, version: string) {
  if (
    proof.schema !== 1 ||
    proof.kind !== "bun-portable-rust-qualification" ||
    proof.selection !== portableCrateSelection ||
    proof.source !== source ||
    proof.version !== version ||
    !/^[a-f0-9]{40}$/.test(source) ||
    !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version) ||
    !/^[a-f0-9]{64}$/.test(proof.lockSHA256) ||
    !/^[a-f0-9]{64}$/.test(proof.packageSHA256) ||
    !Number.isSafeInteger(proof.packageBytes) ||
    proof.packageBytes < 1 ||
    proof.packageBytes > 64 * 1024 ** 2 ||
    !proof.toolchain.startsWith("rustc ") ||
    proof.logs?.length !== portableCrateCommands().length
  )
    throw new Error("Invalid portable crate qualification");
  for (let i = 0; i < proof.logs.length; i++)
    if (proof.logs[i]?.name !== `gate-${i}.log` || !/^[a-f0-9]{64}$/.test(proof.logs[i]!.sha256))
      throw new Error("Invalid portable crate gate evidence");
}
export async function validatePortableArchive(bytes: Uint8Array, source: string, version: string) {
  if (bytes.length > 64 * 1024 ** 2) throw new Error("Portable crate exceeds archive bound");
  const members = await new Bun.Archive(bytes).files();
  const prefix = `aphrody-jev-${version}/`;
  let expanded = 0;
  for (const [name, file] of members)
    if (!name.startsWith(prefix) || name.split("/").includes("..") || (expanded += file.size) > 128 * 1024 ** 2)
      throw new Error("Portable crate archive escaped its closure");
  const vcs = await members.get(prefix + ".cargo_vcs_info.json")?.json();
  if (vcs?.git?.sha1 !== source || vcs.git.dirty === true || vcs.path_in_vcs !== portableCrateSelection)
    throw new Error("Portable crate source provenance differs");
  for (const required of ["Cargo.toml", "Cargo.toml.orig", "src/lib.rs"])
    if (!members.has(prefix + required)) throw new Error("Portable crate source closure incomplete");
  const normalized = Bun.TOML.parse(await members.get(prefix + "Cargo.toml")!.text()) as Record<string, any>;
  if (normalized.package?.name !== "aphrody-jev" || normalized.package?.version !== version)
    throw new Error("Portable package identity differs");
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if ("path" in value || "workspace" in value || "git" in value)
      throw new Error("Portable package contains unresolved dependencies");
    for (const child of Object.values(value)) visit(child);
  };
  for (const key of ["dependencies", "dev-dependencies", "build-dependencies", "target"]) visit(normalized[key]);
}
export async function qualifyPortableCrate(root: string, output: string, source: string) {
  if (!isAbsolute(output) || relative(root, output).split(/[\\/]/)[0] !== "..")
    throw new Error("Qualification output must be outside the source checkout");
  await identity(root, source);
  const manifest = Bun.TOML.parse(await Bun.file(join(root, portableCrateSelection, "Cargo.toml")).text()) as {
    package: { name: string; version: string };
  };
  if (manifest.package.name !== "aphrody-jev") throw new Error("Wrong portable crate owner");
  const version = manifest.package.version;
  await mkdir(output, { recursive: true });
  if (await Bun.file(join(output, "portable-crate-qualification.json")).exists())
    throw new Error("Immutable portable qualification already exists");
  const lockSHA256 = digest(await Bun.file(join(root, "Cargo.lock")).bytes());
  const toolchain = (
    await run(root, ["rustc", "+stable", "--version", "--verbose"], undefined, join(output, "toolchain.log"))
  ).trim();
  const logs = [];
  for (const [index, args] of portableCrateCommands().entries()) {
    const name = `gate-${index}.log`;
    await run(root, ["cargo", "+stable", ...args], join(output, "cargo"), join(output, name));
    logs.push({ name, sha256: digest(await Bun.file(join(output, name)).bytes()) });
  }
  const packagePath = join(output, "cargo", "package", `aphrody-jev-${version}.crate`);
  const bytes = await Bun.file(packagePath).bytes();
  await validatePortableArchive(bytes, source, version);
  await identity(root, source);
  if (digest(await Bun.file(join(root, "Cargo.lock")).bytes()) !== lockSHA256)
    throw new Error("Portable crate lock changed during qualification");
  await Bun.write(join(output, `aphrody-jev-${version}.crate`), bytes);
  const proof: Proof = {
    schema: 1,
    kind: "bun-portable-rust-qualification",
    selection: portableCrateSelection,
    source,
    version,
    lockSHA256,
    packageSHA256: digest(bytes),
    packageBytes: bytes.length,
    toolchain,
    logs,
  };
  validatePortableProof(proof, source, version);
  await Bun.write(join(output, "portable-crate-qualification.json"), JSON.stringify(proof, null, 2) + "\n");
}
export async function verifyPortableCrate(root: string, output: string, source: string) {
  await identity(root, source);
  const manifest = Bun.TOML.parse(await Bun.file(join(root, portableCrateSelection, "Cargo.toml")).text()) as {
    package: { version: string };
  };
  const file = Bun.file(join(output, "portable-crate-qualification.json"));
  if (file.size > 1024 ** 2) throw new Error("Portable proof exceeds bound");
  const proof: Proof = await file.json();
  validatePortableProof(proof, source, manifest.package.version);
  if (
    digest(await Bun.file(join(root, "Cargo.lock")).bytes()) !== proof.lockSHA256 ||
    (await run(root, ["rustc", "+stable", "--version", "--verbose"])).trim() !== proof.toolchain
  )
    throw new Error("Portable qualification source environment differs");
  for (const log of proof.logs)
    if (digest(await Bun.file(join(output, log.name)).bytes()) !== log.sha256)
      throw new Error("Portable gate evidence changed");
  const bytes = await Bun.file(join(output, `aphrody-jev-${proof.version}.crate`)).bytes();
  if (bytes.length !== proof.packageBytes || digest(bytes) !== proof.packageSHA256)
    throw new Error("Portable crate bytes changed");
  await validatePortableArchive(bytes, source, proof.version);
}
export async function verifyPortablePackageOutput(output: string) {
  const proof = (await Bun.file(join(output, "portable-crate-qualification.json")).json()) as Proof;
  validatePortableProof(proof, proof.source, proof.version);
  const bytes = await Bun.file(join(output, "cargo", "package", `aphrody-jev-${proof.version}.crate`)).bytes();
  if (bytes.length !== proof.packageBytes || digest(bytes) !== proof.packageSHA256)
    throw new Error("Cargo repackaged different bytes from the qualified crate");
}
if (import.meta.main) {
  const [action, output, source] = Bun.argv.slice(2);
  if (!output || !source || !["qualify", "verify"].includes(action!))
    throw new Error("Usage: release-portable-crate.ts qualify|verify <absolute-output> <source-SHA>");
  const root = await realpath(resolve(import.meta.dir, "../.."));
  if (action === "qualify") await qualifyPortableCrate(root, output, source);
  else await verifyPortableCrate(root, output, source);
}
