/**
 * `scripts/build.ts` config flags: every `PartialConfig` field is a `--flag`, parsed by the kind the field's type
 * gives it. Driven through the script itself; each case ends in argument parsing, before anything is configured.
 */
import { expect, test } from "bun:test";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";
import type { CodegenConfig } from "../../scripts/build/config.ts";
import { emitGeneratorRule, resolveJsToolchain } from "../../scripts/build/configure.ts";
import { Ninja } from "../../scripts/build/ninja.ts";
import { quote } from "../../scripts/build/shell.ts";
import { join } from "node:path";
import { existsSync, linkSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { builtRuntimeEnvironment, runtimePathEnvironment, withBuildDirectoryLock } from "../../scripts/build.ts";

const buildScript = join(import.meta.dirname, "..", "..", "scripts", "build.ts");

test("build directory stays locked until the runtime child finishes", async () => {
  using dir = tempDir("build-runtime-lock", {});
  const lock = join(String(dir), ".build.lock");
  const result = await withBuildDirectoryLock(String(dir), async () => {
    await using child = Bun.spawn(
      [bunExe(), "-e", "console.log(require('node:fs').existsSync(Bun.argv.at(-1)))", lock],
      { stdout: "pipe", stderr: "pipe", timeout: 10_000 },
    );
    const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    expect(stdout.trim(), stderr).toBe("true");
    expect(code).toBe(0);
    expect(existsSync(lock)).toBe(true);
    return "runtime completed";
  });
  expect(result).toBe("runtime completed");
  expect(existsSync(lock)).toBe(false);
});

test("build lock is released on configure errors and early returns", async () => {
  using dir = tempDir("build-runtime-lock-errors", {});
  const lock = join(String(dir), ".build.lock");
  await expect(
    withBuildDirectoryLock(String(dir), () => {
      throw new Error("configure failed");
    }),
  ).rejects.toThrow("configure failed");
  expect(existsSync(lock)).toBe(false);
  expect(await withBuildDirectoryLock(String(dir), () => "configure only")).toBe("configure only");
  expect(existsSync(lock)).toBe(false);
});

test("runtime PATH preserves Windows casing and all inherited toolchain entries", () => {
  const inherited = { Path: "C:\\MSVC;C:\\SDK", PATH: "C:\\LLVM", INCLUDE: "headers", LIB: "libraries" };
  const env = runtimePathEnvironment("C:\\build\\runtime", inherited, true);
  expect(env).toEqual({ Path: "C:\\build\\runtime;C:\\MSVC;C:\\SDK;C:\\LLVM", INCLUDE: "headers", LIB: "libraries" });
  expect(inherited.Path).toBe("C:\\MSVC;C:\\SDK");
  expect(inherited.PATH).toBe("C:\\LLVM");
  expect(runtimePathEnvironment("/build/runtime", { PATH: "/tools", Path: "/case-sensitive" }, false)).toEqual({
    PATH: "/build/runtime:/tools",
    Path: "/case-sensitive",
  });
});

test("runtime child resolves bun to the exact built executable and refreshes replaced links", async () => {
  using dir = tempDir("built-runtime-alias", {});
  const exe = join(String(dir), isWindows ? "bun-debug.exe" : "bun-debug");
  linkSync(bunExe(), exe);
  const alias = join(String(dir), ".runtime-bin", isWindows ? "bun.exe" : "bun");
  const env = builtRuntimeEnvironment(exe, bunEnv);
  expect(statSync(alias).ino).toBe(statSync(exe).ino);
  await using proc = Bun.spawn(
    ["bun", "-e", "console.log(JSON.stringify({revision:Bun.revision,exe:process.execPath}))"],
    {
      env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    },
  );
  const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  expect(code).toBe(0);
  const runtime = JSON.parse(stdout);
  expect(runtime.revision, stderr).toBe(Bun.revision);
  expect(runtime.exe.replaceAll("\\", "/")).toBe(alias.replaceAll("\\", "/"));
  unlinkSync(exe);
  writeFileSync(exe, "the next linked executable");
  builtRuntimeEnvironment(exe, bunEnv);
  expect(statSync(alias).ino).toBe(statSync(exe).ino);
  expect(await Bun.file(alias).text()).toBe("the next linked executable");
});

test("the owner factory reuses its executing Bun and rejects npm", () => {
  const toolchain = resolveJsToolchain();
  expect(toolchain.bun).toBe(process.execPath);
  expect(toolchain.jsRuntime).toBe(quote(process.execPath, isWindows));
  expect(toolchain.npm).toBeUndefined();
  expect(() => resolveJsToolchain("npm")).toThrow("requires the Aphrody Bun fork");
});

async function build(...args: string[]): Promise<{ stderr: string; exitCode: number }> {
  await using proc = Bun.spawn({
    cmd: [bunExe(), buildScript, ...args],
    env: bunEnv,
    stdout: "ignore",
    stderr: "pipe",
  });
  const [stderr, exitCode] = await Promise.all([proc.stderr.text(), proc.exited]);
  return { stderr, exitCode };
}

// Each case starts a debug runtime and imports the build graph. Serialize those
// processes so parsing assertions do not compete for the factory CPU budget.
test.each(["abc", "", "-1", "0x1c", "1e1", "2.5"])(
  "a number field takes a non-negative decimal integer, not %j",
  async value => {
    const { stderr, exitCode } = await build(`--android-api-level=${value}`);
    expect(stderr).toBe(`error: --android-api-level takes a non-negative integer, got: ${JSON.stringify(value)}\n`);
    expect(exitCode).toBe(1);
  },
);

test("an unknown field is an error that lists the fields", async () => {
  const { stderr, exitCode } = await build("--ltoo=on");
  expect(stderr).toContain("Unknown config field: --ltoo");
  expect(stderr).toContain("hint: Known fields: ");
  for (const field of ["lto", "androidApiLevel", "freebsdVersion", "nodejsV8Version"]) {
    expect(stderr).toMatch(new RegExp(`Known fields: .*\\b${field}\\b`));
  }
  expect(exitCode).toBe(1);
});

test("every spelling of a field is accepted", async () => {
  // Flags are parsed left to right; `--help` prints the usage and exits 0 once everything before it parsed.
  const { stderr, exitCode } = await build(
    "--freebsd-version=14.3",
    "--nodejsV8Version=13.6.233.10",
    "--android-api-level=28",
    "--link-threads=1",
    "--lto=off",
    "--coreutils=off",
    "--video-native=on",
    "--help",
  );
  expect(stderr).toStartWith("Usage: bun scripts/build.ts");
  expect(exitCode).toBe(0);
});

test("external build directory regeneration discovers the configured source checkout", async () => {
  const configModule = join(import.meta.dirname, "..", "..", "scripts", "build", "config.ts");
  using dir = tempDir("external-build-regen", {
    "source checkout/package.json": JSON.stringify({ name: "bun" }),
    "source checkout/scripts/build.ts": `import { findRepoRoot } from ${JSON.stringify(configModule)}; const configPath = Bun.argv.find(arg => arg.startsWith("--config-file=")).slice("--config-file=".length); const config = await Bun.file(configPath).json(); if (config.profile !== "codegen") throw new Error("wrong configuration input"); console.log(findRepoRoot());`,
    "outside build/.keep": "",
  });
  const source = join(String(dir), "source checkout");
  const buildDir = join(String(dir), "outside build");
  const n = new Ninja({ buildDir });
  emitGeneratorRule(
    n,
    {
      mode: "codegen",
      cwd: source,
      buildDir,
      host: { os: isWindows ? "windows" : "linux" },
      jsRuntime: quote(bunExe(), isWindows),
    } as CodegenConfig,
    { profile: "codegen" },
  );
  const command = n
    .toString()
    .match(/rule regen\r?\n\s+command = ([^\r\n]+)/)![1]
    .replace("$in", quote("configure.json", isWindows));
  await using proc = Bun.spawn({
    cmd: isWindows ? ["cmd.exe", "/d", "/s", "/c", command.slice("cmd /c ".length)] : ["/bin/sh", "-c", command],
    windowsVerbatimArguments: isWindows,
    cwd: buildDir,
    env: bunEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  expect(stdout.trim(), stderr).toBe(source);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});
