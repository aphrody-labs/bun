import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  isPortableCrateSelection,
  portableCrateCommands,
  validatePortableProof,
  portableBrowserSelection,
  portableBrowserCrates,
  portableBrowserCommands,
  browserConsumerSource,
  validateBrowserPortableProof,
  validateBrowserArchive,
  validateBrowserGateOutput,
  verifyBrowserConsumerSources,
  browserConsumerManifest,
} from "./release-portable-crate";

const fixture = () => ({
  schema: 1 as const,
  kind: "bun-portable-rust-qualification" as const,
  selection: "crates/aphrody-jev",
  source: "a".repeat(40),
  version: "1.4.4",
  lockSHA256: "b".repeat(64),
  packageSHA256: "c".repeat(64),
  packageBytes: 123,
  toolchain: "rustc 1.97.0",
  logs: portableCrateCommands().map((_, i) => ({ name: `gate-${i}.log`, sha256: "d".repeat(64) })),
});
test("portable qualification accepts only the exact registered selection", () => {
  expect(isPortableCrateSelection("crates/aphrody-jev")).toBe(true);
  expect(isPortableCrateSelection(portableBrowserSelection)).toBe(true);
  for (const value of [
    undefined,
    "",
    "sdk",
    "crates/aphrody-jev,sdk",
    " crates/aphrody-jev",
    "crates/aphrody-jev,",
    "src/browser/crates/dom",
    "src/browser/crates/ssrf,sdk",
    "crates/aphrody-jev,src/browser/crates/ssrf",
    " src/browser/crates/ssrf",
    "src/browser/crates/ssrf,",
  ])
    expect(isPortableCrateSelection(value)).toBe(false);
});
test("portable gates build default and complete feature closures and verify packaged bytes", () => {
  const commands = portableCrateCommands();
  expect(commands).toHaveLength(6);
  for (const action of ["check", "test"]) {
    const selected = commands.filter(command => command[0] === action);
    expect(selected).toHaveLength(2);
    expect(selected.filter(command => command.includes("--all-features"))).toHaveLength(1);
  }
  expect(commands[4]).toEqual(["package", "--locked", "-p", "aphrody-jev"]);
  expect(commands[5]).toEqual(["publish", "--locked", "--dry-run", "-p", "aphrody-jev"]);
  expect(commands.flat()).not.toContain("--no-verify");
});
test("portable proof rejects native receipt kinds and changed source, package or gate identities", () => {
  const proof = fixture();
  expect(() => validatePortableProof(proof, proof.source, proof.version)).not.toThrow();
  for (const patch of [
    { kind: "bun-media-full-qualification" },
    { source: "e".repeat(40) },
    { selection: "sdk" },
    { packageSHA256: "bad" },
    { packageBytes: 0 },
    { logs: proof.logs.slice(1) },
    { toolchain: "unverified" },
  ])
    expect(() => validatePortableProof({ ...proof, ...patch } as typeof proof, proof.source, proof.version)).toThrow();
});
test("publication isolates portable qualification from all other and mixed selections", async () => {
  const workflow = Bun.YAML.parse(
    await Bun.file(new URL("../../.github/workflows/aphrody-publish-crates.yml", import.meta.url)).text(),
  ) as any;
  const steps = workflow.jobs.publish.steps;
  const prepare = steps.findIndex((step: any) => step.run?.includes("provisionRustDependencies"));
  const qualify = steps.findIndex((step: any) => step.run?.includes("release-portable-crate.ts qualify"));
  const verify = steps.findIndex((step: any) => step.run?.includes("release-portable-crate.ts verify"));
  const publish = steps.findIndex((step: any) => step.name === "Publish");
  expect(prepare).toBeGreaterThanOrEqual(0);
  expect(qualify).toBeGreaterThan(prepare);
  expect(verify).toBeGreaterThan(qualify);
  expect(publish).toBeGreaterThan(verify);
  expect(steps[qualify].if).toBe("inputs.only == 'crates/aphrody-jev' || inputs.only == 'src/browser/crates/ssrf'");
  expect(steps[prepare].if).toBe(steps[qualify].if);
  expect(steps[prepare].run).toContain('from "./scripts/aphrody/native-ci.ts"');
  expect(steps[prepare].run).toContain("await provisionRustDependencies(process.cwd()");
  expect(steps[prepare].run).toContain("return child.exited");
  expect(steps[prepare].run).not.toContain("configureRustDependencies");
  expect(steps[verify].if).toBe(steps[qualify].if);
  expect(steps.find((step: any) => step.run?.includes("download-verify")).if).toBe(
    "inputs.dry-run != true && inputs.only != 'crates/aphrody-jev' && inputs.only != 'src/browser/crates/ssrf' && inputs.only != 'leaf'",
  );
  const evidence = steps.find((step: any) => step.name === "Preserve portable qualification evidence");
  expect(evidence.with["include-hidden-files"]).toBe(true);
  expect(evidence.with.path).toContain("/portable-crate/packages/**");
  expect(evidence.with.path).toContain("/portable-crate/consumer/**");
});

test("verified package closure binds Cargo VCS identity and excludes unresolved dependencies", async () => {
  const { validatePortableArchive } = await import("./release-portable-crate");
  const proof = fixture();
  const prefix = `aphrody-jev-${proof.version}/`;
  const files: Record<string, string> = {
    [prefix + "Cargo.toml"]: `[package]\nname="aphrody-jev"\nversion="${proof.version}"\n[dependencies]\nserde="1"\n`,
    [prefix + "Cargo.toml.orig"]: "original fixture",
    [prefix + "src/lib.rs"]: "pub fn fixture() {}",
    [prefix + ".cargo_vcs_info.json"]: JSON.stringify({
      git: { sha1: proof.source },
      path_in_vcs: "crates/aphrody-jev",
    }),
  };
  const archive = () => new Bun.Archive(files, { format: "tar", compress: "gzip" }).bytes();
  const compressed = await archive();
  expect([...compressed.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
  await expect(validatePortableArchive(compressed, proof.source, proof.version)).resolves.toBeUndefined();
  await expect(validatePortableArchive(await archive(), "e".repeat(40), proof.version)).rejects.toThrow("provenance");
  files[prefix + "Cargo.toml"] += '[dependencies.private]\npath="../../private"\n';
  await expect(validatePortableArchive(await archive(), proof.source, proof.version)).rejects.toThrow("unresolved");
});

test("failed Cargo diagnostics retain stderr and exit status before rejection", async () => {
  const { tempDir } = await import("../../test/harness");
  const { recordPortableCommand } = await import("./release-portable-crate");
  using directory = tempDir("portable-diagnostics", {});
  const path = `${directory}/failure.log`;
  await expect(
    recordPortableCommand(path, {
      stdout: "Checking fixture",
      stderr: "error: fixture dependency missing",
      status: 101,
    }),
  ).rejects.toThrow("retained diagnostic");
  const log = await Bun.file(path).text();
  expect(log).toContain("error: fixture dependency missing");
  expect(log).toContain("[exit_status:101]");
});
test("publisher rejects Cargo archive drift before uploading", async () => {
  const { tempDir } = await import("../../test/harness");
  const { verifyPortablePackageOutput } = await import("./release-portable-crate");
  using directory = tempDir("portable-package-output", {});
  const bytes = new TextEncoder().encode("qualified crate fixture");
  const proof = {
    ...fixture(),
    packageBytes: bytes.length,
    packageSHA256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
  };
  await Bun.write(`${directory}/portable-crate-qualification.json`, JSON.stringify(proof));
  const path = `${directory}/cargo/package/aphrody-jev-${proof.version}.crate`;
  await Bun.write(path, bytes);
  await expect(verifyPortablePackageOutput(String(directory))).resolves.toBeUndefined();
  await Bun.write(path, "Cargo repackaged different fixture");
  await expect(verifyPortablePackageOutput(String(directory))).rejects.toThrow("repackaged different bytes");
  const publisher = await Bun.file(new URL("./publish-crates.ts", import.meta.url)).text();
  expect(publisher.indexOf("await verifyPortablePackageOutput(qualification.output,")).toBeLessThan(
    publisher.lastIndexOf('cargo(cwd, toolchain, ["publish"'),
  );
  expect(publisher).toContain('qualification ? ["--locked"] : ["--allow-dirty"]');
});

test("portable publication refuses absent qualification before Cargo or registry access", async () => {
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "publish-crates.ts"), "--only", "crates/aphrody-jev", "--publish"],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, CARGO_REGISTRY_TOKEN: undefined } },
  );
  const [stdout, stderr, status] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  expect(stdout).toBe("");
  expect(stderr).toContain("Portable publication requires exact-source qualification evidence");
  expect(status).not.toBe(0);
});

const hash = (value: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
const browserProof = (): Parameters<typeof validateBrowserPortableProof>[0] => ({
  schema: 2 as const,
  kind: "bun-portable-rust-qualification" as const,
  selection: portableBrowserSelection,
  source: "a".repeat(40),
  lockSHA256: "b".repeat(64),
  toolchain: "rustc 1.99.1",
  packages: portableBrowserCrates.map(owner => ({
    ...owner,
    version: "1.4.4",
    manifestSHA256: "c".repeat(64),
    dependenciesSHA256: "d".repeat(64),
    packageSHA256: "e".repeat(64),
    packageBytes: 100,
  })),
  consumer: {
    manifestSHA256: "f".repeat(64),
    sourceSHA256: hash(browserConsumerSource),
    lockSHA256: "a".repeat(64),
    platform: "linux",
    arch: "x64",
  },
  logs: portableBrowserCommands("/fixture").map((_, i) => ({ name: `gate-${i}.log`, sha256: "b".repeat(64) })),
  nativeRuntimeQualified: false as const,
  completePlatformMatrix: false as const,
});

test("registered browser commands exercise both Rust libraries and a locked offline consumer", () => {
  const commands = portableBrowserCommands("/private/output");
  expect(commands).toHaveLength(6);
  expect(commands[0]).toEqual([
    "check",
    "--locked",
    "--all-targets",
    "--all-features",
    "-p",
    "bun_browser_ssrf",
    "-p",
    "bun_browser_dom",
  ]);
  expect(commands[1]).toEqual([
    "test",
    "--locked",
    "--all-features",
    "-p",
    "bun_browser_ssrf",
    "-p",
    "bun_browser_dom",
  ]);
  expect(commands[2]?.[0]).toBe("package");
  expect(commands[3]).toContain("--dry-run");
  expect(commands[4]).toEqual([
    "generate-lockfile",
    "--offline",
    "--manifest-path",
    join("/private/output", "consumer", "Cargo.toml"),
  ]);
  expect(commands[5]).toEqual([
    "run",
    "--locked",
    "--offline",
    "--manifest-path",
    join("/private/output", "consumer", "Cargo.toml"),
  ]);
  expect(commands.flat()).not.toContain("--no-verify");
  expect(commands.flat()).not.toContain("--allow-dirty");
  expect(browserConsumerSource).toContain("is_forbidden_ip");
  expect(browserConsumerSource).toContain("tree.query_selector_all");
  expect(browserConsumerSource).toContain("tree.text_content");
});

test("browser source proof binds exact ordered membership and cannot qualify a native release", () => {
  const proof = browserProof();
  expect(() => validateBrowserPortableProof(proof, proof.source)).not.toThrow();
  for (const patch of [
    { schema: 1 },
    { selection: "crates/aphrody-jev" },
    { source: "c".repeat(40) },
    { packages: proof.packages.toReversed() },
    { packages: [proof.packages[0], proof.packages[0]] },
    { packages: proof.packages.slice(1) },
    { logs: proof.logs.slice(1) },
    { lockSHA256: "bad" },
    { nativeRuntimeQualified: true },
    { completePlatformMatrix: true },
    { consumer: { ...proof.consumer, sourceSHA256: "b".repeat(64) } },
  ])
    expect(() => validateBrowserPortableProof({ ...proof, ...patch } as typeof proof, proof.source)).toThrow();
  for (const field of [
    "manifestSHA256",
    "dependenciesSHA256",
    "packageSHA256",
    "packageBytes",
    "path",
    "name",
  ] as const) {
    const changed = structuredClone(proof);
    Object.assign(changed.packages[0]!, { [field]: field === "packageBytes" ? 0 : "bad" });
    expect(() => validateBrowserPortableProof(changed, proof.source)).toThrow();
  }
  expect(() =>
    validatePortableProof(proof as unknown as Parameters<typeof validatePortableProof>[0], proof.source, "1.4.4"),
  ).toThrow();
  expect(() => validateBrowserPortableProof(fixture() as unknown as typeof proof, proof.source)).toThrow();
});

test("browser gates require passing Rust tests and an executed consumer result", () => {
  expect(() => validateBrowserGateOutput(1, "test result: ok. 3 passed; 0 failed;")).not.toThrow();
  expect(() => validateBrowserGateOutput(1, "test result: ok. 0 passed; 0 failed;")).toThrow("no passing Rust tests");
  expect(() => validateBrowserGateOutput(5, "portable-browser-consumer:pass\r\n")).not.toThrow();
  expect(() => validateBrowserGateOutput(5, "Compiling consumer")).toThrow("did not execute");
  expect(() => validateBrowserGateOutput(5, "not-portable-browser-consumer:pass\n")).toThrow("did not execute");
});

async function browserArchiveFixture(index = 0) {
  const owner = portableBrowserCrates[index]!;
  const original = `[package]\nname="${owner.name}"\nversion="1.4.4"\n`;
  const pkg = { ...owner, version: "1.4.4", manifestSHA256: hash(original) };
  const prefix = `${pkg.name}-${pkg.version}/`;
  const files: Record<string, string> = {
    [prefix + "Cargo.toml"]: original,
    [prefix + "Cargo.toml.orig"]: original,
    [prefix + "src/lib.rs"]: "pub fn fixture() {}",
    [prefix + ".cargo_vcs_info.json"]: JSON.stringify({ git: { sha1: "a".repeat(40) }, path_in_vcs: owner.path }),
  };
  return { pkg, prefix, files, bytes: () => new Bun.Archive(files, { format: "tar", compress: "gzip" }).bytes() };
}

test("each browser archive binds VCS, original manifest, package identity and dependency closure", async () => {
  for (const index of [0, 1]) {
    const f = await browserArchiveFixture(index);
    const valid = await validateBrowserArchive(await f.bytes(), "a".repeat(40), f.pkg);
    expect(valid.dependenciesSHA256).toMatch(/^[a-f0-9]{64}$/);
    await expect(validateBrowserArchive(await f.bytes(), "b".repeat(40), f.pkg)).rejects.toThrow("VCS");
    await expect(
      validateBrowserArchive(await f.bytes(), "a".repeat(40), { ...f.pkg, manifestSHA256: "f".repeat(64) }),
    ).rejects.toThrow("original manifest");
    f.files[f.prefix + "Cargo.toml"] += '[dependencies.html5ever]\nversion="0.40"\n';
    expect((await validateBrowserArchive(await f.bytes(), "a".repeat(40), f.pkg)).dependenciesSHA256).not.toBe(
      valid.dependenciesSHA256,
    );
    for (const unsupported of [
      'path="../private"',
      'git="https://example.invalid/private"',
      "workspace=true",
      'registry="private"',
    ]) {
      f.files[f.prefix + "Cargo.toml"] =
        `[package]\nname="${f.pkg.name}"\nversion="1.4.4"\n[target.'cfg(unix)'.dependencies.private]\n${unsupported}\n`;
      await expect(validateBrowserArchive(await f.bytes(), "a".repeat(40), f.pkg)).rejects.toThrow("dependencies");
    }
    f.files[f.prefix + "Cargo.toml"] = `[package]\nname="wrong-owner"\nversion="1.4.4"\n`;
    await expect(validateBrowserArchive(await f.bytes(), "a".repeat(40), f.pkg)).rejects.toThrow("package identity");
  }
});

test("browser archive rejects dirty VCS, wrong source path, missing members and traversal", async () => {
  const f = await browserArchiveFixture();
  for (const vcs of [
    { git: { sha1: "a".repeat(40), dirty: true }, path_in_vcs: f.pkg.path },
    { git: { sha1: "a".repeat(40), dirty: "false" }, path_in_vcs: f.pkg.path },
    { git: { sha1: "a".repeat(40) }, path_in_vcs: "crates/aphrody-jev" },
  ]) {
    f.files[f.prefix + ".cargo_vcs_info.json"] = JSON.stringify(vcs);
    await expect(validateBrowserArchive(await f.bytes(), "a".repeat(40), f.pkg)).rejects.toThrow("VCS");
  }
  f.files[f.prefix + ".cargo_vcs_info.json"] = JSON.stringify({
    git: { sha1: "a".repeat(40) },
    path_in_vcs: f.pkg.path,
  });
  delete f.files[f.prefix + "src/lib.rs"];
  await expect(validateBrowserArchive(await f.bytes(), "a".repeat(40), f.pkg)).rejects.toThrow("incomplete");
  f.files[f.prefix + "src/lib.rs"] = "pub fn fixture() {}";
  f.files[f.prefix + "../outside"] = "escaped";
  await expect(validateBrowserArchive(await f.bytes(), "a".repeat(40), f.pkg)).rejects.toThrow("closure");
});

test("browser publication refuses absent or mixed qualification before Cargo and registry access", async () => {
  for (const args of [
    ["--only", portableBrowserSelection, "--publish"],
    ["--only", `${portableBrowserSelection},sdk`, "--portable-qualification", "/missing", "--publish"],
  ]) {
    const child = Bun.spawn([process.execPath, join(import.meta.dir, "publish-crates.ts"), ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, CARGO_REGISTRY_TOKEN: undefined },
    });
    const [stdout, stderr, status] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    expect(stdout).toBe("");
    expect(stderr).toContain("Portable");
    expect(stderr).not.toContain("ENOENT");
    expect(status).not.toBe(0);
  }
});

test("browser publisher rejects repackaged drift in either crate before upload", async () => {
  const { tempDir } = await import("../../test/harness");
  const { verifyPortablePackageOutput } = await import("./release-portable-crate");
  using directory = tempDir("browser-portable-repackage", {});
  const proof = browserProof();
  for (const pkg of proof.packages) {
    const body = `qualified ${pkg.name}`;
    pkg.packageBytes = body.length;
    pkg.packageSHA256 = hash(body);
    await Bun.write(`${directory}/cargo/package/${pkg.name}-${pkg.version}.crate`, body);
  }
  await Bun.write(`${directory}/portable-crate-qualification.json`, JSON.stringify(proof));
  await expect(verifyPortablePackageOutput(String(directory), portableBrowserSelection)).resolves.toBeUndefined();
  const pkg = proof.packages[1]!;
  await Bun.write(`${directory}/cargo/package/${pkg.name}-${pkg.version}.crate`, "changed");
  await expect(verifyPortablePackageOutput(String(directory), portableBrowserSelection)).rejects.toThrow(
    "repackaged different bytes",
  );
  await expect(verifyPortablePackageOutput(String(directory))).rejects.toThrow("Invalid portable");
});

test("consumer source trees stay exact archive members and refuse edits, extras, missing files and links", async () => {
  const { tempDir } = await import("../../test/harness");
  const { symlink, link, unlink } = await import("node:fs/promises");
  for (const mutation of ["edit", "extra", "missing", "symlink", "extra-symlink", "hardlink", "consumer"]) {
    using directory = tempDir("browser-consumer-source-membership", {});
    const proof = browserProof();
    for (const index of [0, 1]) {
      const f = await browserArchiveFixture(index),
        bytes = await f.bytes();
      const validated = await validateBrowserArchive(bytes, proof.source, f.pkg);
      proof.packages[index] = {
        ...f.pkg,
        packageBytes: bytes.length,
        packageSHA256: hash(bytes),
        dependenciesSHA256: validated.dependenciesSHA256,
      };
      await Bun.write(`${directory}/${f.pkg.name}-${f.pkg.version}.crate`, bytes);
      for (const [name, file] of validated.members)
        await Bun.write(`${directory}/packages/${name}`, await file.bytes());
    }
    await Bun.write(`${directory}/consumer/Cargo.toml`, browserConsumerManifest(proof.packages));
    await Bun.write(`${directory}/consumer/src/main.rs`, browserConsumerSource);
    await expect(
      verifyBrowserConsumerSources(String(directory), proof.source, proof.packages),
    ).resolves.toBeUndefined();
    const pkg = proof.packages[0]!;
    const file = `${directory}/packages/${pkg.name}-${pkg.version}/src/lib.rs`;
    if (mutation === "edit") await Bun.write(file, "changed source");
    if (mutation === "extra")
      await Bun.write(`${directory}/packages/${pkg.name}-${pkg.version}/build.rs`, "fn main() {}");
    if (mutation === "missing") await unlink(file);
    if (mutation === "symlink" || mutation === "extra-symlink") {
      const target = `${directory}/outside.rs`;
      await Bun.write(target, "pub fn fixture() {}");
      if (mutation === "symlink") await unlink(file);
      await symlink(
        target,
        mutation === "symlink" ? file : `${directory}/packages/${pkg.name}-${pkg.version}/extra.rs`,
      );
    }
    if (mutation === "hardlink") await link(file, `${directory}/outside.rs`);
    if (mutation === "consumer") await Bun.write(`${directory}/consumer/src/main.rs`, "fn main() {}");
    await expect(verifyBrowserConsumerSources(String(directory), proof.source, proof.packages)).rejects.toThrow();
  }
});
