/**
 * `scripts/build.ts` config flags: every `PartialConfig` field is a `--flag`, parsed by the kind the field's type
 * gives it. Driven through the script itself; each case ends in argument parsing, before anything is configured.
 */
import { expect, test } from "bun:test";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";
import type { CodegenConfig } from "../../scripts/build/config.ts";
import { emitGeneratorRule } from "../../scripts/build/configure.ts";
import { Ninja } from "../../scripts/build/ninja.ts";
import { quote } from "../../scripts/build/shell.ts";
import { join } from "node:path";

const buildScript = join(import.meta.dirname, "..", "..", "scripts", "build.ts");

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

test.concurrent.each(["abc", "", "-1", "0x1c", "1e1", "2.5"])(
  "a number field takes a non-negative decimal integer, not %j",
  async value => {
    const { stderr, exitCode } = await build(`--android-api-level=${value}`);
    expect(stderr).toBe(`error: --android-api-level takes a non-negative integer, got: ${JSON.stringify(value)}\n`);
    expect(exitCode).toBe(1);
  },
);

test.concurrent("an unknown field is an error that lists the fields", async () => {
  const { stderr, exitCode } = await build("--ltoo=on");
  expect(stderr).toContain("Unknown config field: --ltoo");
  expect(stderr).toContain("hint: Known fields: ");
  for (const field of ["lto", "androidApiLevel", "freebsdVersion", "nodejsV8Version"]) {
    expect(stderr).toMatch(new RegExp(`Known fields: .*\\b${field}\\b`));
  }
  expect(exitCode).toBe(1);
});

test.concurrent("every spelling of a field is accepted", async () => {
  // Flags are parsed left to right; `--help` prints the usage and exits 0 once everything before it parsed.
  const { stderr, exitCode } = await build(
    "--freebsd-version=14.3",
    "--nodejsV8Version=13.6.233.10",
    "--android-api-level=28",
    "--link-threads=1",
    "--lto=off",
    "--help",
  );
  expect(stderr).toStartWith("Usage: bun scripts/build.ts");
  expect(exitCode).toBe(0);
});

test("external build directory regeneration discovers the configured source checkout", async () => {
  const configModule = join(import.meta.dirname, "..", "..", "scripts", "build", "config.ts");
  using dir = tempDir("external-build-regen", {
    "source checkout/package.json": JSON.stringify({ name: "bun" }),
    "source checkout/scripts/build.ts": `import { findRepoRoot } from ${JSON.stringify(configModule)}; console.log(findRepoRoot());`,
    "outside build/.keep": "",
  });
  const source = join(String(dir), "source checkout");
  const buildDir = join(String(dir), "outside build");
  const n = new Ninja({ buildDir });
  emitGeneratorRule(n, {
    mode: "codegen",
    cwd: source,
    buildDir,
    host: { os: isWindows ? "windows" : "linux" },
    jsRuntime: quote(bunExe(), isWindows),
  } as CodegenConfig, { profile: "codegen" });
  const command = n.toString().match(/rule regen\r?\n\s+command = ([^\r\n]+)/)![1].replace("$in", quote(join(buildDir, "configure.json"), isWindows));
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
