// scripts/aphrody/setup.ts: the one-command setup of the fork. Run with the system bun (`bun test`): it only
// spawns setup.ts in dry-run mode and reads the checkout.
import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import {
  collectDependencies,
  cargoDependencyManifests,
  parseOptions,
  windowsProtocInstallation,
  windowsProtocPlan,
} from "../../scripts/aphrody/setup.ts";
import { pins } from "../../scripts/build/ci-images/spec";
import { tempDir } from "harness";

const root = join(import.meta.dir, "..", "..");
const setup = join(root, "scripts/aphrody/setup.ts");

test("Cargo inventory prunes excluded directories before reading them and retains nested package manifests", async () => {
  using directory = tempDir("setup-cargo-prune", {});
  const base = String(directory);
  for (const path of ["packages/one/Cargo.toml", "packages/two/deep/Cargo.toml"])
    await Bun.write(join(base, path), "[package]\nname='inventory-fixture'\n");
  const excluded = ["node_modules", "target", ".git", ".hidden", "fixture", "fixtures", "test", "tests"];
  const blocked = excluded.map(name => join(base, "packages/one", name));
  try {
    for (const path of blocked) {
      mkdirSync(path);
      await Bun.write(join(path, "Cargo.toml"), "must never enter the dependency inventory");
      chmodSync(path, 0);
    }
    if (process.platform !== "win32" && process.getuid?.() !== 0)
      expect(() => readdirSync(blocked[0]!)).toThrow(/EACCES/);
    expect(await cargoDependencyManifests(base)).toEqual(["packages/one/Cargo.toml", "packages/two/deep/Cargo.toml"]);
  } finally {
    for (const path of blocked) chmodSync(path, 0o700);
  }
});

test.skipIf(process.platform === "win32")(
  "Cargo inventory follows literal manifest links, skips directory links and hidden entries",
  async () => {
    using directory = tempDir("setup-cargo-links", {});
    const base = String(directory);
    await Bun.write(join(base, "packages/one/Cargo.toml"), "[package]\n");
    await Bun.write(join(base, "outside/Cargo.toml"), "[package]\n");
    for (const name of ["manifest-link", "broken-link"]) mkdirSync(join(base, "packages", name));
    symlinkSync(join(base, "outside/Cargo.toml"), join(base, "packages/manifest-link/Cargo.toml"));
    symlinkSync(join(base, "missing"), join(base, "packages/broken-link/Cargo.toml"));
    symlinkSync(join(base, "outside"), join(base, "packages/directory-link"), "dir");
    expect(await cargoDependencyManifests(base)).toEqual([
      "packages/manifest-link/Cargo.toml",
      "packages/one/Cargo.toml",
    ]);
  },
);

// The full checkout inventory includes cold filesystem metadata on shared disks.
test("deps.json lists exactly what the checkout pins", async () => {
  const inventory = JSON.parse(readFileSync(join(root, "scripts/aphrody/deps.json"), "utf8"));
  const key = (d: any) => `${d.kind} ${d.repo}@${d.ref} ${d.usedBy.join(",")}`;
  const fresh = await collectDependencies(root);
  expect(inventory.dependencies.map(key).sort()).toEqual(fresh.map(key).sort());
  const repos = fresh.map(d => d.repo);
  expect(repos).toContain("aphrody-labs/uutils-coreutils");
  expect(repos).toContain("aphrody-labs/WebKit");
  expect(repos).toContain("aphrody-labs/pyo3");
  for (const d of fresh.filter(d => d.kind === "github-archive")) expect(d.ref).toMatch(/^[0-9a-f]{40}$/);
}, 15_000);

test("options", () => {
  expect(parseOptions(["--dry-run", "--no-build", "--dir=x", "--ref", "v1"])).toMatchObject({
    dryRun: true,
    build: false,
    ref: "v1",
  });
  expect(parseOptions(["deps", "--check"])).toMatchObject({ command: "deps", check: true });
  expect(() => parseOptions(["--nope"])).toThrow("unknown argument");
});

test("Windows protoc uses the existing pinned x64 host compiler and verified upstream archive", () => {
  const plan = windowsProtocPlan(pins.protoc, "x64", "toolchain-home");
  expect(plan).toMatchObject({
    version: "31.0",
    hostArch: "x64",
    binaryArch: "x64",
    source: {
      assetId: 254644982,
      bytes: 3371703,
      url: "https://github.com/protocolbuffers/protobuf/releases/download/v31.0/protoc-31.0-win64.zip",
      sha256: "d7edee5d0d5d6786c92e77a4f511e4698a5aa922c6390b6d08c3a79935a651b0",
    },
  });
  expect(plan.executable).toBe(join(plan.directory, "bin/protoc.exe"));
  expect(windowsProtocPlan(pins.protoc, "arm64", "toolchain-home").source).toEqual(plan.source);
  expect(() => windowsProtocPlan(pins.protoc, "ia32", "toolchain-home")).toThrow("requires an x64 or ARM64 host");
});

test("Windows protoc reuse checks exact executable bytes, includes and compiler version before use", async () => {
  using dir = tempDir("setup-protoc", {});
  const executable = join(String(dir), "bin/protoc.exe");
  const include = join(String(dir), "include");
  const binary = new TextEncoder().encode("test-only host compiler fixture");
  await Bun.write(executable, binary);
  for (const file of ["descriptor.proto", "empty.proto", "timestamp.proto"])
    await Bun.write(join(include, "google/protobuf", file), "syntax = 'proto3';");
  const pin = {
    ...pins.protoc,
    windows: { ...pins.protoc.windows, binarySHA256: new Bun.CryptoHasher("sha256").update(binary).digest("hex") },
  };
  const plan = windowsProtocPlan(pin, "x64", String(dir));
  const env = { PROTOC: executable, PROTOC_INCLUDE: include };
  const calls: string[][] = [];
  expect(
    await windowsProtocInstallation(plan, env, argv => {
      calls.push(argv);
      return "libprotoc 31.0\r\n";
    }),
  ).toEqual({ executable, include, version: "31.0", binarySHA256: pin.windows.binarySHA256 });
  expect(calls).toEqual([[executable, "--version"]]);
  expect(await windowsProtocInstallation(plan, env, () => "libprotoc 31.1")).toBeUndefined();
  expect(
    await windowsProtocInstallation(
      plan,
      { ...env, PROTOC_INCLUDE: join(String(dir), "missing") },
      () => "libprotoc 31.0",
    ),
  ).toBeUndefined();
  await Bun.write(executable, "tampered compiler");
  let probed = false;
  expect(
    await windowsProtocInstallation(plan, env, () => {
      probed = true;
      return "libprotoc 31.0";
    }),
  ).toBeUndefined();
  expect(probed).toBe(false);
});

test("dry run plans every step and changes nothing", async () => {
  await using proc = Bun.spawn({
    cmd: [process.execPath, setup, "--dry-run", "--json", "--no-system", "--no-update", "--packages"],
    cwd: root,
    // A host protoc that is not the pinned one must not decide the plan.
    env: { ...process.env, PROTOC: undefined, PROTOC_INCLUDE: undefined },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  expect(stderr).toBe("");
  const plan = JSON.parse(stdout);
  const ids = plan.steps.map((s: { id: string }) => s.id);
  expect(ids).toEqual([
    "bun",
    "llvm",
    "rustup",
    "rust-toolchain",
    ...(process.platform === "win32" ? ["protoc"] : []),
    ...(process.platform === "win32" ? ["msvc"] : []),
    "bun-install",
    "vendor",
    "packages",
    "build",
    "agent-plugin",
  ]);
  const agentPlugin = plan.steps.find((s: { id: string }) => s.id === "agent-plugin");
  expect(agentPlugin.commands.at(-1)).toEndWith("scripts/aphrody/agent-plugin.ts install");
  const build = plan.steps.find((s: { id: string }) => s.id === "build");
  expect(build.commands.at(-1)).toEndWith("run bd --version");
  const packages = plan.steps.find((s: { id: string }) => s.id === "packages");
  expect(packages.commands.join("\n")).toContain("packages/bun-webview-core/Cargo.toml");
  expect(exitCode).toBe(0);
});
