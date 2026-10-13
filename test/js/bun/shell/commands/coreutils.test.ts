import { $ } from "bun";
import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";
import { join } from "node:path";

// uutils applets linked into bun (src/coreutils): selected by argv0, and run by Bun Shell
// when the command is not on PATH. They are behind bun_runtime's `coreutils` cargo feature.
const hasApplets = /^\d+\n$/.test(
  Bun.spawnSync({ cmd: [bunExe()], argv0: "nproc", env: bunEnv, stdout: "pipe", stderr: "ignore" }).stdout.toString(),
);

describe.skipIf(!hasApplets)("coreutils applets", () => {
  test.concurrent("argv0 selects the applet", async () => {
    await using proc = Bun.spawn({
      cmd: [bunExe(), "-n", "2"],
      argv0: "head",
      env: bunEnv,
      stdin: new Blob(["a\nb\nc\n"]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stderr).toBe("");
    expect(stdout).toBe("a\nb\n");
    expect(exitCode).toBe(0);
  });

  test.concurrent("argv0 applet reports its exit code", async () => {
    await using proc = Bun.spawn({
      cmd: [bunExe(), "1", "+", "2"],
      argv0: isWindows ? "EXPR.exe" : "expr",
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([proc.stdout.text(), proc.exited]);
    expect(stdout).toBe("3\n");
    expect(exitCode).toBe(0);

    await using fails = Bun.spawn({ cmd: [bunExe(), "0"], argv0: "expr", env: bunEnv, stdout: "pipe" });
    const [zero, failCode] = await Promise.all([fails.stdout.text(), fails.exited]);
    expect(zero).toBe("0\n");
    expect(failCode).toBe(1);
  });

  test("Bun Shell runs an applet missing from PATH", async () => {
    const out = await $`printf '%s\n' c a b | sort | tac | head -n 2`
      .env({ ...bunEnv, PATH: "" })
      .nothrow()
      .quiet();
    expect(out.stderr.toString()).toBe("");
    expect(out.stdout.toString()).toBe("c\nb\n");
    expect(out.exitCode).toBe(0);
  });

  test.skipIf(!isWindows)("Bun Shell resolves coreutils with Windows PATH casing", async () => {
    for (const key of ["PATH", "Path", "path"]) {
      const out = await $`printf '%s\n' c a b | sort | tac | head -n 2`
        .env({ [key]: "" })
        .nothrow()
        .quiet();
      expect(out.stderr.toString()).toBe("");
      expect(out.stdout.toString()).toBe("c\nb\n");
      expect(out.exitCode).toBe(0);
    }
  });

  test("compiled applications dispatch native coreutils before their entry point", async () => {
    using dir = tempDir("coreutils-compiled", {
      "entry.js": `console.log("compiled entry");`,
    });
    const executable = join(String(dir), isWindows ? "rio-shell.exe" : "rio-shell");
    await using compiler = Bun.spawn({
      cmd: [bunExe(), "build", "--compile", join(String(dir), "entry.js"), "--outfile", executable],
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [output, errors, compiled] = await Promise.all([
      compiler.stdout.text(),
      compiler.stderr.text(),
      compiler.exited,
    ]);
    if (compiled !== 0) throw new Error(`${output}\n${errors}`);
    await using applet = Bun.spawn({
      cmd: [executable, "--all"],
      argv0: "nproc",
      env: { ...bunEnv, PATH: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([applet.stdout.text(), applet.stderr.text(), applet.exited]);
    expect(stderr).toBe("");
    expect(stdout).toMatch(/^\d+\n$/);
    expect(exitCode).toBe(0);
    await using entry = Bun.spawn({ cmd: [executable], env: bunEnv, stdout: "pipe", stderr: "pipe" });
    const [entryOutput, entryCode] = await Promise.all([entry.stdout.text(), entry.exited]);
    expect(entryOutput).toBe("compiled entry\n");
    expect(entryCode).toBe(0);
  });
});
