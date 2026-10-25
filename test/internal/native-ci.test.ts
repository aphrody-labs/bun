// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { tempDir } from "../harness";
import {
  gateEnvironment,
  configureRustDependencies,
  gates,
  main,
  provisionRustDependencies,
  qualification,
  rustDependencyPlan,
  testOutputQualified,
  validateIdentity,
} from "../../scripts/aphrody/native-ci.ts";
import { computeSourceIdentity } from "../../scripts/build/fetch-cli.ts";

async function dependencyFixture() {
  const checkout = resolve(import.meta.dir, "../..");
  return tempDir("native-ci-dependencies", {
    "Cargo.toml":
      '[workspace]\n[workspace.dependencies]\nfixture = { path = "src/fixture" }\nuu_cat = { path = "vendor/uutils/src/uu/cat" }\n',
    vendor: { ".keep": "" },
    src: { fixture: { "Cargo.toml": '[package]\nname = "fixture"\nversion = "0.0.0"\n' } },
    patches: {
      "rust-argon2": {
        "legacy-low-memory.patch": await Bun.file(join(checkout, "patches/rust-argon2/legacy-low-memory.patch")).text(),
      },
      uutils: {
        "lazy-startup.patch": await Bun.file(join(checkout, "patches/uutils/lazy-startup.patch")).text(),
        "linux-kernel-timer.patch": await Bun.file(join(checkout, "patches/uutils/linux-kernel-timer.patch")).text(),
      },
    },
  });
}

test("native CI rejects symbolic revisions and unsafe job identifiers", () => {
  expect(() => validateIdentity("main", "job")).toThrow();
  expect(() => validateIdentity("a".repeat(40), "../../secret")).toThrow();
  expect(() => validateIdentity("a".repeat(40), "native-1")).not.toThrow();
});
test("missing, failed and duplicate qualifications remain closed", () => {
  const results = gates.map(gate => ({ id: gate.id, exitCode: 0 }));
  expect(qualification(results)).toBe(true);
  expect(qualification(results.slice(1))).toBe(false);
  expect(qualification([...results, results[0]!])).toBe(false);
  expect(qualification(results.map((result, index) => ({ ...result, exitCode: index ? 0 : 1 })))).toBe(false);
});
test("native CI only accepts its explicit owner operations", async () => {
  await expect(main(["publish", "--revision", "a".repeat(40), "--id", "job"])).rejects.toThrow();
  await expect(main(["plan", "--command", "rm"])).rejects.toThrow();
  expect(gates.some(gate => gate.command.includes("-D"))).toBe(true);
  expect(gates.find(gate => gate.id === "provenance")!.command).toEqual([
    "bun",
    "bd",
    "-j1",
    "test",
    "./scripts/aphrody/fusion-sources.test.ts",
  ]);
  expect(gates.filter(gate => gate.command.includes("bd")).every(gate => gate.command.includes("-j1"))).toBe(true);
});

test("toolchain gates use the canonical Cargo wrapper and the changed native binary", () => {
  const cargo = ["bun", "scripts/build/rust/cargo-serial.ts", ...(process.platform === "win32" ? ["--msvc"] : [])];
  for (const gate of gates.filter(gate => gate.id.startsWith("rust-") && gate.id !== "rust-dependencies")) {
    expect(gate.command.slice(0, cargo.length)).toEqual(cargo);
    expect(gate.command).not.toContain("bash");
    expect(gate.command.some(argument => argument.startsWith("../aphrody/"))).toBe(false);
  }
  const rust = gates.findIndex(gate => gate.id === "rust-toolchain-test");
  const native = gates.findIndex(gate => gate.id === "native-toolchain-test");
  expect(rust).toBe(gates.findIndex(gate => gate.id === "rust-dependencies") + 1);
  expect(native).toBeGreaterThan(gates.findIndex(gate => gate.id === "rust-web-clippy"));
  expect(native).toBeLessThan(gates.findIndex(gate => gate.id === "google-chromium"));
  expect(gates[rust]!.command).toEqual([
    ...cargo,
    "test",
    "-p",
    "bun_ecma_api",
    "-p",
    "bun_quality",
    "-p",
    "bun_migrate",
    "--lib",
    "--tests",
    "--locked",
    "--jobs",
    "1",
  ]);
  expect(gates[native]!.command).toEqual([
    "bun",
    "bd",
    "--ci=on",
    "-j1",
    "test",
    "test/cli/lint/toolchain.test.ts",
    "test/cli/just/just.test.ts",
    "test/cli/just/compat.test.ts",
    "test/cli/run/exec-nounset.test.ts",
    "test/js/bun/shell/exec.test.ts",
    "--test-name-pattern=^(?!bunsh\\b)",
    "--max-concurrency=1",
  ]);
  expect(gates.filter(gate => gate.nativeShell).map(gate => gate.id)).toEqual([
    "rust-toolchain-test",
    "native-toolchain-test",
  ]);
  expect(gates.filter(gate => gate.allowedSkippedTests).map(gate => gate.id)).toEqual(["native-toolchain-test"]);
  expect(gates[native]!.allowedSkippedTests).toEqual(
    process.platform === "win32"
      ? []
      : [
          "embedded just > windows-shell takes precedence over shell",
          "embedded just > Bun shebang recipes execute without a Unix interpreter",
        ],
  );
});

test("toolchain shell environment selects native Git on Windows without changing other gates", () => {
  const checkout = resolve(import.meta.dir, "../..");
  const inherited = { Path: "operator-search-path", CARGO_BUILD_JOBS: "1" };
  for (const gate of gates.filter(gate => gate.nativeShell)) {
    const environment = gateEnvironment(gate, checkout, inherited);
    if (process.platform === "win32") {
      const gitBin = join("C:\\Program Files", "Git", "usr", "bin");
      expect(environment.PATH).toBe(`${gitBin}${delimiter}${inherited.Path}`);
      expect(environment.Path).toBeUndefined();
      expect(Bun.which("bash", { PATH: environment.PATH })?.toLowerCase()).toBe(join(gitBin, "bash.exe").toLowerCase());
    } else {
      expect(environment).toEqual(inherited);
    }
    expect(environment.CARGO_BUILD_JOBS).toBe("1");
  }
  expect(gateEnvironment(gates[0]!, checkout, inherited)).toEqual(inherited);
  expect(inherited.Path).toBe("operator-search-path");
  if (process.platform === "win32") {
    using absent = tempDir("native-ci-missing-git", {});
    expect(() =>
      gateEnvironment(
        gates.find(gate => gate.nativeShell)!,
        checkout,
        {
          ...inherited,
          ProgramFiles: String(absent),
        },
      ),
    ).toThrow("native Git for Windows");
  }
});

test("native output qualification rejects unexpected, unnamed, duplicate skips and every todo", () => {
  const gate = { id: "native-toolchain-test", command: [], allowedSkippedTests: ["allowed test"] };
  const output = "(skip) allowed test\n 1 pass\n 1 skip\n 0 fail\n";
  expect(testOutputQualified(gate, output)).toBe(true);
  expect(testOutputQualified(gate, " 1 pass\n 0 fail\n")).toBe(true);
  expect(testOutputQualified(gate, output.replace("allowed test", "unexpected test"))).toBe(false);
  expect(testOutputQualified(gate, output.replace("(skip) allowed test\n", ""))).toBe(false);
  expect(testOutputQualified(gate, output.replace("1 pass", "0 pass"))).toBe(false);
  expect(testOutputQualified(gate, output + " 1 todo\n")).toBe(false);
  expect(testOutputQualified(gate, "(todo) future test\n" + output)).toBe(false);
  expect(testOutputQualified(gate, output + " 1 fail\n")).toBe(false);
  expect(testOutputQualified(gate, "(skip) allowed test\n" + output.replace("1 skip", "2 skip"))).toBe(false);
  expect(testOutputQualified({ id: "existing-gate", command: [] }, output)).toBe(false);
  expect(testOutputQualified({ ...gate, allowedSkippedTests: [] }, output)).toBe(false);
});

test("the native toolchain filter runs bun exec and other owners while excluding bunsh APK work", () => {
  using dir = tempDir("native-ci-toolchain-filter", {
    "filter.test.ts": `import { describe, test } from "bun:test";
describe("bun exec", () => test("kept", () => {}));
describe("bunsh", () => test("excluded", () => { throw Error("wrong suite"); }));
describe("bunsh runs apk install scripts", () => test.todo("excluded todo"));
test("other owner", () => {});
`,
  });
  const gate = gates.find(gate => gate.id === "native-toolchain-test")!;
  const filter = gate.command.find(argument => argument.startsWith("--test-name-pattern="))!;
  const child = Bun.spawnSync(
    [process.execPath, "test", join(String(dir), "filter.test.ts"), filter, "--max-concurrency=1"],
    {
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: undefined },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10000,
      windowsHide: true,
    },
  );
  const log = child.stdout.toString() + child.stderr.toString();
  expect(log).toContain("bun exec > kept");
  expect(log).toContain("other owner");
  expect(log).toContain("2 filtered out");
  expect(log).not.toContain("(skip)");
  expect(log).not.toContain("(todo)");
  expect(testOutputQualified(gate, log)).toBe(true);
  expect(child.exitCode).toBe(0);
});

test("installer tests use the linked native binary after its existing build phase", async () => {
  const native = gates.findIndex(gate => gate.id === "google-chromium");
  const installer = gates.findIndex(gate => gate.id === "native-install-test");
  expect(native).toBeGreaterThan(-1);
  expect(installer).toBe(native + 1);
  expect(gates).toHaveLength(16);
  expect(gates.some(gate => gate.id === "rust-install-test")).toBe(false);
  expect(gates[installer]!.command.slice(0, 4)).toEqual(["bun", "bd", "-j1", "test"]);
  for (const file of gates[installer]!.command.slice(4)) {
    const source = await Bun.file(resolve(import.meta.dir, "../..", file)).text();
    expect(source).toContain("bunExe()");
    // Platform guards (`skipIf`) stay allowed; unconditional skips and todos are not.
    expect(source).not.toMatch(/\b(?:test|it)\.(?:skip|todo)\b/);
  }
  expect(qualification(gates.map(gate => ({ id: gate.id, exitCode: gate.id === "native-install-test" ? 1 : 0 })))).toBe(
    false,
  );
});

test("Clippy selects each source owner's configuration without changing strict warnings", async () => {
  const checkout = resolve(import.meta.dir, "../..");
  const inherited = { CLIPPY_CONF_DIR: "/foreign/config", CARGO_BUILD_JOBS: "1" };
  const directories = {
    "rust-google-clippy": "src/browser",
    "rust-browser-clippy": "src/browser",
    "rust-install-clippy": ".",
  };
  for (const [id, directory] of Object.entries(directories)) {
    const gate = gates.find(candidate => candidate.id === id)!;
    const environment = gateEnvironment(gate, checkout, inherited);
    expect(environment.CLIPPY_CONF_DIR).toBe(resolve(checkout, directory));
    expect(environment.CARGO_BUILD_JOBS).toBe("1");
    expect(gate.command.slice(-3)).toEqual(["--", "-D", "warnings"]);
    const config = Bun.TOML.parse(await Bun.file(resolve(checkout, directory, "clippy.toml")).text());
    if (directory === ".") {
      expect(config["disallowed-methods"]).toContainEqual({
        path: "std::env::var",
        reason: "use bun_core::env_var",
      });
    } else {
      expect(config).toEqual({});
    }
  }
  expect(inherited.CLIPPY_CONF_DIR).toBe("/foreign/config");
  expect(gates.filter(gate => gate.env).map(gate => gate.id)).toEqual([
    "rust-google-clippy",
    "rust-install-clippy",
    "rust-browser-clippy",
  ]);
  expect(gateEnvironment(gates[0]!, checkout, inherited)).toEqual(inherited);
});

test("all dependency destinations preflight before a fetch and preserve unknown sources", async () => {
  using directory = await dependencyFixture();
  const foreign = join(directory, "vendor/uutils");
  await mkdir(foreign);
  await Bun.write(join(foreign, ".ref"), "foreign-source\n");
  let calls = 0;
  await expect(
    provisionRustDependencies(String(directory), async () => {
      calls++;
      return 0;
    }),
  ).rejects.toThrow("preserved");
  expect(calls).toBe(0);
  expect(await Bun.file(join(foreign, ".ref")).text()).toBe("foreign-source\n");
  expect(await Bun.file(join(directory, "vendor/lolhtml/.ref")).exists()).toBe(false);
});

test("the pinned fetch owner receives all Rust sources and stamps are checked after fetch", async () => {
  using directory = await dependencyFixture();
  const plans = await rustDependencyPlan(String(directory));
  const commands: string[][] = [];
  await provisionRustDependencies(String(directory), async command => {
    commands.push(command);
    const plan = plans.find(dependency => dependency.name === command[3])!;
    await mkdir(dirname(join(plan.destination, plan.manifest)), { recursive: true });
    await Bun.write(join(plan.destination, ".ref"), plan.identity + "\n");
    await Bun.write(join(plan.destination, plan.manifest), `[package]\nname = "${plan.package}"\nversion = "0.0.0"\n`);
    if (plan.name === "uutils") {
      const secondary = join(plan.destination, "src/uu/cat/Cargo.toml");
      await mkdir(dirname(secondary), { recursive: true });
      await Bun.write(secondary, '[package]\nname = "uu_cat"\nversion = "0.0.0"\n');
    }
    return 0;
  });
  expect(commands.map(command => command[3])).toEqual(["lolhtml", "rust-argon2", "ngx-rust", "uutils"]);
  for (const [index, plan] of plans.entries()) {
    expect(commands[index]).toEqual([
      "bun",
      join(String(directory), "scripts/build/fetch-cli.ts"),
      "dep",
      plan.name,
      plan.source.repo,
      plan.source.commit,
      plan.destination,
      join(String(directory), "build/native-ci-downloads"),
      ...plan.patches,
    ]);
  }
  expect((await rustDependencyPlan(String(directory))).every(dependency => dependency.present)).toBe(true);
  expect(gates.findIndex(gate => gate.id === "rust-dependencies")).toBeLessThan(
    gates.findIndex(gate => gate.id === "rust-install-check"),
  );
  expect(gates).toHaveLength(16);
});

test("a missing first-party Cargo prerequisite fails before any source fetch", async () => {
  using directory = await dependencyFixture();
  await Bun.write(
    join(directory, "Cargo.toml"),
    '[workspace]\n[workspace.dependencies]\nmissing = { path = "packages/missing" }\n',
  );
  let calls = 0;
  await expect(
    provisionRustDependencies(String(directory), async () => {
      calls++;
      return 0;
    }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});

test("dependency junctions and failed fetch stamps cannot overwrite foreign sources", async () => {
  using directory = await dependencyFixture();
  using foreign = tempDir("native-ci-foreign-source", { ".ref": "foreign-source" });
  await symlink(String(foreign), join(directory, "vendor/lolhtml"), process.platform === "win32" ? "junction" : "dir");
  let calls = 0;
  await expect(
    provisionRustDependencies(String(directory), async () => {
      calls++;
      return 0;
    }),
  ).rejects.toThrow("canonical");
  expect(calls).toBe(0);
  expect(await Bun.file(join(String(foreign), ".ref")).text()).toBe("foreign-source");
  using incomplete = await dependencyFixture();
  await expect(
    provisionRustDependencies(String(incomplete), async () => {
      calls++;
      return 0;
    }),
  ).rejects.toThrow();
  expect(calls).toBe(1);
});

test("present stamped sources preflight secondary manifests before any fetch", async () => {
  using directory = await dependencyFixture();
  const plan = (await rustDependencyPlan(String(directory))).find(dependency => dependency.name === "uutils")!;
  await mkdir(dirname(join(plan.destination, plan.manifest)), { recursive: true });
  await Bun.write(join(plan.destination, ".ref"), plan.identity);
  await Bun.write(join(plan.destination, plan.manifest), '[package]\nname = "uucore"\nversion = "0.0.0"\n');
  let calls = 0;
  const fetch = async () => {
    calls++;
    return 0;
  };
  await expect(provisionRustDependencies(String(directory), fetch)).rejects.toThrow();
  expect(calls).toBe(0);
  using foreign = tempDir("native-ci-secondary-source", {
    "Cargo.toml": '[package]\nname = "uu_cat"\nversion = "0.0.0"\n',
  });
  await mkdir(join(plan.destination, "src/uu"), { recursive: true });
  await symlink(
    String(foreign),
    join(plan.destination, "src/uu/cat"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(provisionRustDependencies(String(directory), fetch)).rejects.toThrow("canonical");
  expect(calls).toBe(0);
  expect(await Bun.file(join(String(foreign), "Cargo.toml")).exists()).toBe(true);
});

test("post-fetch qualification checks every generated Cargo path without exemptions", async () => {
  using directory = await dependencyFixture();
  const plans = await rustDependencyPlan(String(directory));
  const commands: string[][] = [];
  await expect(
    provisionRustDependencies(String(directory), async command => {
      commands.push(command);
      const plan = plans.find(dependency => dependency.name === command[3])!;
      await mkdir(dirname(join(plan.destination, plan.manifest)), { recursive: true });
      await Bun.write(join(plan.destination, ".ref"), plan.identity);
      await Bun.write(
        join(plan.destination, plan.manifest),
        `[package]\nname = "${plan.package}"\nversion = "0.0.0"\n`,
      );
      return 0;
    }),
  ).rejects.toThrow();
  expect(commands.map(command => command[3])).toEqual(["lolhtml", "rust-argon2", "ngx-rust", "uutils"]);
  const secondary = join(String(directory), "vendor/uutils/src/uu/cat/Cargo.toml");
  await mkdir(dirname(secondary), { recursive: true });
  await Bun.write(secondary, '[package]\nname = "wrong_package"\nversion = "0.0.0"\n');
  await expect(
    provisionRustDependencies(String(directory), async command => {
      commands.push(command);
      return 0;
    }),
  ).rejects.toThrow("package differs");
  expect(commands).toHaveLength(4);
});

test("configure refuses foreign archive identities and unknown Cargo config before invoking the owner", async () => {
  using directory = tempDir("native-ci-configure-foreign", {
    vendor: { foreign: { ".ref": "foreign" } },
  });
  const checkout = String(directory);
  const revision = "a".repeat(40);
  let calls = 0;
  const invoke = async () => {
    calls++;
    return 0;
  };
  await expect(
    configureRustDependencies(
      checkout,
      revision,
      [
        {
          name: "foreign",
          destination: join(checkout, "vendor/foreign"),
          commit: revision,
          patches: [],
        },
      ],
      invoke,
    ),
  ).rejects.toThrow("identity differs");
  await mkdir(join(checkout, ".cargo"));
  await Bun.write(join(checkout, ".cargo/config.toml"), "operator-owned");
  using backup = tempDir("native-ci-configure-backup", {});
  await expect(configureRustDependencies(checkout, revision, [], invoke, String(backup))).rejects.toThrow(
    "Unknown Cargo",
  );
  expect(calls).toBe(0);
  expect(await Bun.file(join(checkout, ".cargo/config.toml")).text()).toBe("operator-owned");
  expect(await Array.fromAsync(new Bun.Glob("*.toml").scan(String(backup)))).toHaveLength(1);
});

test("configure pins the native debug owner command and rejects stale generated options", async () => {
  using directory = tempDir("native-ci-configure", {
    vendor: { matched: { ".ref": computeSourceIdentity("a".repeat(40), []) } },
  });
  const checkout = String(directory);
  const revision = "a".repeat(40);
  const sources = [
    {
      name: "matched",
      destination: join(checkout, "vendor/matched"),
      commit: revision,
      patches: [],
    },
  ];
  let calls = 0;
  const invoke = async (command: string[], env: Record<string, string>) => {
    calls++;
    expect(command).toEqual([
      "bun",
      "bd",
      "-j1",
      "--profile=debug",
      "--ci=true",
      "--cache-dir=build/native-ci-downloads",
      "--configure-only",
    ]);
    expect(env).toEqual({ BUILDKITE_COMMIT: revision, GITHUB_SHA: revision, GIT_SHA: revision });
    await mkdir(join(checkout, "build/debug/codegen"), { recursive: true });
    await mkdir(join(checkout, ".cargo"), { recursive: true });
    await Bun.write(join(checkout, ".cargo/config.toml"), "fixture-owner-config");
    await Bun.write(
      join(checkout, "build/debug/codegen/build_options.rs"),
      `pub const SHA: &str = "${calls === 1 ? revision : "b".repeat(40)}";`,
    );
    return 0;
  };
  await configureRustDependencies(checkout, revision, sources, invoke);
  await expect(configureRustDependencies(checkout, revision, sources, invoke)).rejects.toThrow("immutable source pin");
  expect(calls).toBe(2);
});

test("configure rejects escaping vendor allocation and missing patches even for absent archives", async () => {
  using directory = tempDir("native-ci-configure-escape", {});
  using foreign = tempDir("native-ci-configure-external", {});
  const checkout = String(directory);
  await symlink(String(foreign), join(checkout, "vendor"), process.platform === "win32" ? "junction" : "dir");
  let calls = 0;
  const invoke = async () => {
    calls++;
    return 0;
  };
  await expect(configureRustDependencies(checkout, "a".repeat(40), [], invoke)).rejects.toThrow("canonical");
  using missing = tempDir("native-ci-configure-patch", { vendor: { ".keep": "" } });
  await expect(
    configureRustDependencies(
      String(missing),
      "a".repeat(40),
      [
        {
          name: "absent",
          destination: join(String(missing), "vendor/absent"),
          commit: "a".repeat(40),
          patches: [join(String(missing), "missing.patch")],
        },
      ],
      invoke,
    ),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});

test("configure guards generated output and identity paths before any owner writes", async () => {
  using foreign = tempDir("native-ci-configure-protected", { protected: "preserve" });
  let calls = 0;
  const invoke = async () => {
    calls++;
    return 0;
  };
  for (const relative of ["build/debug", "build/debug/codegen"]) {
    using directory = tempDir("native-ci-configure-parent", { vendor: { ".keep": "" } });
    await mkdir(dirname(join(String(directory), relative)), { recursive: true });
    await symlink(
      String(foreign),
      join(String(directory), relative),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(configureRustDependencies(String(directory), "a".repeat(40), [], invoke)).rejects.toThrow("canonical");
  }
  for (const relative of ["build/debug/codegen/build_options.rs", "build/native-ci-downloads/cargo-config.sha256"]) {
    using directory = tempDir("native-ci-configure-output", { vendor: { ".keep": "" } });
    // A junction is also an invalid output file, without needing Windows symlink privilege.
    await mkdir(dirname(join(String(directory), relative)), { recursive: true });
    await symlink(
      String(foreign),
      join(String(directory), relative),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(configureRustDependencies(String(directory), "a".repeat(40), [], invoke)).rejects.toThrow("canonical");
  }
  expect(calls).toBe(0);
  expect(await Bun.file(join(String(foreign), "protected")).text()).toBe("preserve");
});
