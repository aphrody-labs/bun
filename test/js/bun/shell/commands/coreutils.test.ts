import { $ } from "bun";
import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, isWindows } from "harness";

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
});
