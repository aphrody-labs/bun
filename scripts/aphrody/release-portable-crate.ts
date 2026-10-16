import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export const portableCrateSelection = "crates/aphrody-jev";
export const portableBrowserSelection = "src/browser/crates/ssrf";
export const portableBrowserCrates = [
  { name: "bun_browser_ssrf", path: "src/browser/crates/ssrf" },
  { name: "bun_browser_dom", path: "src/browser/crates/dom" },
] as const;
export function isPortableCrateSelection(only: string | undefined): boolean {
  return only === portableCrateSelection || only === portableBrowserSelection;
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
export async function qualifyPortableCrate(
  root: string,
  output: string,
  source: string,
  selection = portableCrateSelection,
) {
  if (selection === portableBrowserSelection) return qualifyPortableBrowser(root, output, source);
  if (selection !== portableCrateSelection) throw new Error("Unknown portable crate selection");
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
  const logs: Array<{ name: string; sha256: string }> = [];
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
export async function verifyPortableCrate(
  root: string,
  output: string,
  source: string,
  selection = portableCrateSelection,
) {
  if (selection === portableBrowserSelection) return verifyPortableBrowser(root, output, source);
  if (selection !== portableCrateSelection) throw new Error("Unknown portable crate selection");
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
export async function verifyPortablePackageOutput(output: string, selection = portableCrateSelection) {
  if (selection === portableBrowserSelection) {
    const proof = await readBrowserProof(output);
    validateBrowserPortableProof(proof, proof.source);
    for (const pkg of proof.packages) {
      const bytes = await Bun.file(join(output, "cargo", "package", `${pkg.name}-${pkg.version}.crate`)).bytes();
      if (bytes.length !== pkg.packageBytes || digest(bytes) !== pkg.packageSHA256)
        throw new Error("Cargo repackaged different bytes from the qualified browser crate");
    }
    return;
  }
  if (selection !== portableCrateSelection) throw new Error("Unknown portable crate selection");
  const proof = (await Bun.file(join(output, "portable-crate-qualification.json")).json()) as Proof;
  validatePortableProof(proof, proof.source, proof.version);
  const bytes = await Bun.file(join(output, "cargo", "package", `aphrody-jev-${proof.version}.crate`)).bytes();
  if (bytes.length !== proof.packageBytes || digest(bytes) !== proof.packageSHA256)
    throw new Error("Cargo repackaged different bytes from the qualified crate");
}
type BrowserPackage = {
  name: string;
  path: string;
  version: string;
  manifestSHA256: string;
  dependenciesSHA256: string;
  packageSHA256: string;
  packageBytes: number;
};
type BrowserProof = {
  schema: 2;
  kind: "bun-portable-rust-qualification";
  selection: typeof portableBrowserSelection;
  source: string;
  lockSHA256: string;
  toolchain: string;
  packages: BrowserPackage[];
  consumer: { manifestSHA256: string; sourceSHA256: string; lockSHA256: string; platform: string; arch: string };
  logs: { name: string; sha256: string }[];
  nativeRuntimeQualified: false;
  completePlatformMatrix: false;
};
export const browserConsumerSource = `use bun_browser_ssrf::is_forbidden_ip;
use bun_browser_dom::parse_html;
fn main() {
    assert!(is_forbidden_ip("127.0.0.1".parse().unwrap()));
    assert!(is_forbidden_ip("169.254.169.254".parse().unwrap()));
    assert!(!is_forbidden_ip("1.1.1.1".parse().unwrap()));
    let tree = parse_html("<main><a class='card'>Canon</a><p>Other</p></main>");
    let nodes = tree.query_selector_all("main > a.card").unwrap();
    assert_eq!(nodes.len(), 1);
    assert_eq!(tree.text_content(nodes[0]), "Canon");
    println!("portable-browser-consumer:pass");
}
`;
const hashText = (text: string) => digest(new TextEncoder().encode(text));
const validDigest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function portableBrowserCommands(output: string) {
  const select = portableBrowserCrates.flatMap(pkg => ["-p", pkg.name]);
  const consumer = join(output, "consumer", "Cargo.toml");
  return [
    ["check", "--locked", "--all-targets", "--all-features", ...select],
    ["test", "--locked", "--all-features", ...select],
    ["package", "--locked", ...select],
    ["publish", "--locked", "--dry-run", ...select],
    ["generate-lockfile", "--offline", "--manifest-path", consumer],
    ["run", "--locked", "--offline", "--manifest-path", consumer],
  ];
}

export function validateBrowserGateOutput(index: number, text: string) {
  const plain = Bun.stripANSI(text);
  if (index === 1 && !/test result: ok\. [1-9]\d* passed;/.test(plain))
    throw new Error("Browser source gate ran no passing Rust tests");
  if (index === 5 && !plain.split(/\r?\n/).includes("portable-browser-consumer:pass"))
    throw new Error("Browser source consumer did not execute");
}

export function validateBrowserPortableProof(proof: BrowserProof, source: string) {
  if (
    !proof ||
    proof.schema !== 2 ||
    proof.kind !== "bun-portable-rust-qualification" ||
    proof.selection !== portableBrowserSelection ||
    proof.source !== source ||
    !/^[a-f0-9]{40}$/.test(source) ||
    !validDigest(proof.lockSHA256) ||
    !proof.toolchain?.startsWith("rustc ") ||
    proof.nativeRuntimeQualified !== false ||
    proof.completePlatformMatrix !== false ||
    !Array.isArray(proof.packages) ||
    proof.packages.length !== portableBrowserCrates.length ||
    !Array.isArray(proof.logs) ||
    proof.logs.length !== portableBrowserCommands("/proof").length ||
    !proof.consumer ||
    !validDigest(proof.consumer.manifestSHA256) ||
    proof.consumer.sourceSHA256 !== hashText(browserConsumerSource) ||
    !validDigest(proof.consumer.lockSHA256) ||
    !["linux", "darwin", "win32"].includes(proof.consumer.platform) ||
    !["x64", "arm64"].includes(proof.consumer.arch)
  )
    throw new Error("Invalid registered browser source qualification");
  for (const [index, owner] of portableBrowserCrates.entries()) {
    const pkg = proof.packages[index];
    if (
      !pkg ||
      pkg.name !== owner.name ||
      pkg.path !== owner.path ||
      !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version) ||
      !validDigest(pkg.manifestSHA256) ||
      !validDigest(pkg.dependenciesSHA256) ||
      !validDigest(pkg.packageSHA256) ||
      !Number.isSafeInteger(pkg.packageBytes) ||
      pkg.packageBytes < 1 ||
      pkg.packageBytes > 64 * 1024 ** 2
    )
      throw new Error("Browser package membership or identity differs");
  }
  for (const [index, log] of proof.logs.entries())
    if (log.name !== `gate-${index}.log` || !validDigest(log.sha256))
      throw new Error("Invalid browser source gate evidence");
}

export async function validateBrowserArchive(
  bytes: Uint8Array,
  source: string,
  pkg: Pick<BrowserPackage, "name" | "path" | "version" | "manifestSHA256">,
) {
  if (
    !portableBrowserCrates.some(owner => owner.name === pkg.name && owner.path === pkg.path) ||
    !/^[a-f0-9]{40}$/.test(source) ||
    !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version) ||
    !validDigest(pkg.manifestSHA256) ||
    bytes.length < 1 ||
    bytes.length > 64 * 1024 ** 2
  )
    throw new Error("Invalid registered browser archive identity");
  const members = await new Bun.Archive(bytes).files();
  const prefix = `${pkg.name}-${pkg.version}/`;
  let expanded = 0;
  if (!members.size || members.size > 10_000) throw new Error("Browser archive member budget exceeded");
  for (const [name, file] of members) {
    const local = name.slice(prefix.length);
    if (
      !name.startsWith(prefix) ||
      name.includes("\\") ||
      name.includes("\0") ||
      local.split("/").some(part => !part || part === "." || part === ".." || part.includes(":")) ||
      (expanded += file.size) > 128 * 1024 ** 2
    )
      throw new Error("Browser archive escaped its source closure");
  }
  const vcs = await members.get(prefix + ".cargo_vcs_info.json")?.json();
  if (
    vcs?.git?.sha1 !== source ||
    (vcs.git.dirty !== undefined && vcs.git.dirty !== false) ||
    vcs.path_in_vcs !== pkg.path
  )
    throw new Error("Browser archive VCS source differs");
  for (const required of ["Cargo.toml", "Cargo.toml.orig", "src/lib.rs"])
    if (!members.has(prefix + required)) throw new Error("Browser archive source closure incomplete");
  if (digest(await members.get(prefix + "Cargo.toml.orig")!.bytes()) !== pkg.manifestSHA256)
    throw new Error("Browser archive original manifest differs from source");
  const manifest = Bun.TOML.parse(await members.get(prefix + "Cargo.toml")!.text()) as Record<string, any>;
  if (manifest.package?.name !== pkg.name || manifest.package?.version !== pkg.version)
    throw new Error("Browser archive package identity differs");
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (["path", "workspace", "git", "registry", "registry-index"].some(key => key in value))
      throw new Error("Browser archive contains unresolved or alternate registry dependencies");
    for (const child of Object.values(value)) visit(child);
  };
  const dependencies = Object.fromEntries(
    ["dependencies", "dev-dependencies", "build-dependencies", "target"].map(key => [key, manifest[key] ?? null]),
  );
  visit(dependencies);
  return { members, dependenciesSHA256: hashText(JSON.stringify(dependencies)) };
}

export function browserConsumerManifest(packages: BrowserPackage[]) {
  return (
    `[package]\nname = "qualified-browser-consumer"\nversion = "0.0.0"\nedition = "2021"\n\n[workspace]\n\n[dependencies]\n` +
    packages
      .map(
        pkg =>
          `${pkg.name} = { version = ${JSON.stringify(`=${pkg.version}`)}, path = ${JSON.stringify(`../packages/${pkg.name}-${pkg.version}`)} }`,
      )
      .join("\n") +
    "\n"
  );
}

export async function verifyBrowserConsumerSources(output: string, source: string, packages: BrowserPackage[]) {
  for (const pkg of packages) {
    const filename = `${pkg.name}-${pkg.version}`;
    const bytes = await Bun.file(join(output, filename + ".crate")).bytes();
    if (digest(bytes) !== pkg.packageSHA256 || bytes.length !== pkg.packageBytes)
      throw new Error("Consumer browser archive bytes changed");
    const { members } = await validateBrowserArchive(bytes, source, pkg);
    const directory = join(output, "packages", filename);
    const parent = await lstat(join(output, "packages")),
      root = await lstat(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink() || !root.isDirectory() || root.isSymbolicLink())
      throw new Error("Browser consumer package root is not an owned directory");
    const expected = new Map<string, string>(),
      directories = new Set<string>();
    for (const [name, file] of members) {
      const path = name.slice(filename.length + 1);
      expected.set(path, digest(await file.bytes()));
      const parts = path.split("/");
      for (let count = 1; count < parts.length; count++) directories.add(parts.slice(0, count).join("/"));
    }
    const seen = new Set<string>(),
      seenPaths = new Set<string>();
    for await (const path of new Bun.Glob("**/*").scan({
      cwd: directory,
      dot: true,
      onlyFiles: false,
      followSymlinks: false,
    })) {
      const member = path.replaceAll("\\", "/");
      if (seenPaths.has(member)) throw new Error("Browser consumer tree has duplicate normalized members");
      seenPaths.add(member);
      const info = await lstat(join(directory, path));
      if (
        info.isSymbolicLink() ||
        (info.isDirectory() ? !directories.has(member) : !info.isFile() || info.nlink !== 1 || !expected.has(member))
      )
        throw new Error("Browser consumer tree has an unexpected member or link");
      if (info.isFile()) {
        if (digest(await Bun.file(join(directory, path)).bytes()) !== expected.get(member))
          throw new Error("Browser consumer source differs from the qualified archive");
        seen.add(member);
      }
    }
    if (seen.size !== expected.size) throw new Error("Browser consumer source membership is incomplete");
  }
  if (
    digest(await Bun.file(join(output, "consumer", "Cargo.toml")).bytes()) !==
      hashText(browserConsumerManifest(packages)) ||
    digest(await Bun.file(join(output, "consumer", "src", "main.rs")).bytes()) !== hashText(browserConsumerSource)
  )
    throw new Error("Browser consumer inputs changed");
}

async function readBrowserSourcePackages(root: string) {
  return Promise.all(
    portableBrowserCrates.map(async owner => {
      const bytes = await Bun.file(join(root, owner.path, "Cargo.toml")).bytes();
      const manifest = Bun.TOML.parse(new TextDecoder().decode(bytes)) as {
        package: { name: string; version: string };
      };
      if (manifest.package.name !== owner.name) throw new Error("Registered browser source owner differs");
      return { ...owner, version: manifest.package.version, manifestSHA256: digest(bytes) };
    }),
  );
}

async function qualifyPortableBrowser(root: string, output: string, source: string) {
  if (!isAbsolute(output) || relative(root, output).split(/[\\/]/)[0] !== "..")
    throw new Error("Qualification output must be outside the source checkout");
  await identity(root, source);
  const owners = await readBrowserSourcePackages(root);
  await mkdir(output, { mode: 0o700 });
  const lockSHA256 = digest(await Bun.file(join(root, "Cargo.lock")).bytes());
  const toolchain = (
    await run(root, ["rustc", "+stable", "--version", "--verbose"], undefined, join(output, "toolchain.log"))
  ).trim();
  const logs: BrowserProof["logs"] = [],
    packages: BrowserPackage[] = [];
  let consumerLockSHA256 = "";
  for (const [index, args] of portableBrowserCommands(output).entries()) {
    if (index === 4) {
      for (const owner of owners) {
        const filename = `${owner.name}-${owner.version}.crate`;
        const bytes = await Bun.file(join(output, "cargo", "package", filename)).bytes();
        const archive = await validateBrowserArchive(bytes, source, owner);
        packages.push({
          ...owner,
          dependenciesSHA256: archive.dependenciesSHA256,
          packageSHA256: digest(bytes),
          packageBytes: bytes.length,
        });
        await Bun.write(join(output, filename), bytes);
        for (const [name, file] of archive.members) await Bun.write(join(output, "packages", name), await file.bytes());
      }
      await Bun.write(join(output, "consumer", "Cargo.toml"), browserConsumerManifest(packages));
      await Bun.write(join(output, "consumer", "src", "main.rs"), browserConsumerSource);
    }
    if (index === 5) {
      await verifyBrowserConsumerSources(output, source, packages);
      consumerLockSHA256 = digest(await Bun.file(join(output, "consumer", "Cargo.lock")).bytes());
    }
    const name = `gate-${index}.log`;
    const text = await run(root, ["cargo", "+stable", ...args], join(output, "cargo"), join(output, name));
    validateBrowserGateOutput(index, text);
    if (index === 5) {
      await verifyBrowserConsumerSources(output, source, packages);
      if (digest(await Bun.file(join(output, "consumer", "Cargo.lock")).bytes()) !== consumerLockSHA256)
        throw new Error("Browser consumer lock changed during execution");
    }
    logs.push({ name, sha256: digest(await Bun.file(join(output, name)).bytes()) });
  }
  await identity(root, source);
  if (digest(await Bun.file(join(root, "Cargo.lock")).bytes()) !== lockSHA256)
    throw new Error("Browser qualification source lock changed");
  const proof: BrowserProof = {
    schema: 2,
    kind: "bun-portable-rust-qualification",
    selection: portableBrowserSelection,
    source,
    lockSHA256,
    toolchain,
    packages,
    logs,
    consumer: {
      manifestSHA256: hashText(browserConsumerManifest(packages)),
      sourceSHA256: hashText(browserConsumerSource),
      lockSHA256: digest(await Bun.file(join(output, "consumer", "Cargo.lock")).bytes()),
      platform: process.platform,
      arch: process.arch,
    },
    nativeRuntimeQualified: false,
    completePlatformMatrix: false,
  };
  validateBrowserPortableProof(proof, source);
  await verifyBrowserPackages(output, proof);
  await Bun.write(join(output, "portable-crate-qualification.json"), JSON.stringify(proof, null, 2) + "\n");
}

async function verifyBrowserPackages(output: string, proof: BrowserProof) {
  for (const pkg of proof.packages) {
    const bytes = await Bun.file(join(output, `${pkg.name}-${pkg.version}.crate`)).bytes();
    if (bytes.length !== pkg.packageBytes || digest(bytes) !== pkg.packageSHA256)
      throw new Error("Qualified browser archive bytes changed");
    if ((await validateBrowserArchive(bytes, proof.source, pkg)).dependenciesSHA256 !== pkg.dependenciesSHA256)
      throw new Error("Qualified browser dependency closure changed");
    const staged = await Bun.file(join(output, "cargo", "package", `${pkg.name}-${pkg.version}.crate`)).bytes();
    if (digest(staged) !== pkg.packageSHA256) throw new Error("Cargo browser package bytes changed");
  }
  for (const [path, expected] of [
    ["Cargo.toml", proof.consumer.manifestSHA256],
    ["src/main.rs", proof.consumer.sourceSHA256],
    ["Cargo.lock", proof.consumer.lockSHA256],
  ])
    if (digest(await Bun.file(join(output, "consumer", path!)).bytes()) !== expected)
      throw new Error("Qualified browser consumer evidence changed");
  if (proof.consumer.manifestSHA256 !== hashText(browserConsumerManifest(proof.packages)))
    throw new Error("Qualified browser consumer package paths differ");
  await verifyBrowserConsumerSources(output, proof.source, proof.packages);
}

async function verifyPortableBrowser(root: string, output: string, source: string) {
  await identity(root, source);
  const proof = await readBrowserProof(output);
  validateBrowserPortableProof(proof, source);
  const owners = await readBrowserSourcePackages(root);
  for (const [index, owner] of owners.entries()) {
    const pkg = proof.packages[index]!;
    if (owner.version !== pkg.version || owner.manifestSHA256 !== pkg.manifestSHA256)
      throw new Error("Qualified browser source manifest changed");
  }
  if (
    digest(await Bun.file(join(root, "Cargo.lock")).bytes()) !== proof.lockSHA256 ||
    (await run(root, ["rustc", "+stable", "--version", "--verbose"])).trim() !== proof.toolchain
  )
    throw new Error("Browser source qualification environment differs");
  for (const log of proof.logs)
    if (digest(await Bun.file(join(output, log.name)).bytes()) !== log.sha256)
      throw new Error("Browser source gate evidence changed");
  await verifyBrowserPackages(output, proof);
}

async function readBrowserProof(output: string): Promise<BrowserProof> {
  const file = Bun.file(join(output, "portable-crate-qualification.json"));
  if (file.size > 1024 ** 2) throw new Error("Browser source proof exceeds bound");
  return file.json();
}

if (import.meta.main) {
  const [action, output, source, selection = portableCrateSelection] = Bun.argv.slice(2);
  if (!output || !source || !["qualify", "verify"].includes(action!))
    throw new Error(
      "Usage: release-portable-crate.ts qualify|verify <absolute-output> <source-SHA> [registered-selection]",
    );
  const root = await realpath(resolve(import.meta.dir, "../.."));
  if (action === "qualify") await qualifyPortableCrate(root, output, source, selection);
  else await verifyPortableCrate(root, output, source, selection);
}
