import { expect, test } from "bun:test";
import { isPortableCrateSelection, portableCrateCommands, validatePortableProof } from "./release-portable-crate";

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
  for (const value of [undefined, "", "sdk", "crates/aphrody-jev,sdk", " crates/aphrody-jev", "crates/aphrody-jev,"])
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
  expect(steps[qualify].if).toBe("inputs.only == 'crates/aphrody-jev'");
  expect(steps[prepare].if).toBe(steps[qualify].if);
  expect(steps[prepare].run).toContain('from "./scripts/aphrody/native-ci.ts"');
  expect(steps[prepare].run).toContain("await provisionRustDependencies(process.cwd()");
  expect(steps[prepare].run).toContain("return child.exited");
  expect(steps[prepare].run).not.toContain("configureRustDependencies");
  expect(steps[verify].if).toBe("inputs.only == 'crates/aphrody-jev'");
  expect(steps.find((step: any) => step.run?.includes("download-verify")).if).toBe(
    "inputs.dry-run != true && inputs.only != 'crates/aphrody-jev'",
  );
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
  expect(publisher.indexOf("await verifyPortablePackageOutput(qualification.output)")).toBeLessThan(
    publisher.lastIndexOf('cargo(cwd, toolchain, ["publish"'),
  );
  expect(publisher).toContain('qualification ? ["--locked"] : ["--allow-dirty"]');
});

test("portable publication refuses absent qualification before Cargo or registry access", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL("./publish-crates.ts", import.meta.url).pathname,
      "--only",
      "crates/aphrody-jev",
      "--publish",
    ],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, CARGO_REGISTRY_TOKEN: undefined } },
  );
  const [stdout, stderr, status] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  expect(stdout).toBe("");
  expect(stderr).toContain("Portable publication requires exact-source qualification evidence");
  expect(status).not.toBe(0);
});
