import { $ } from "bun";
import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, isWindows, normalizeBunSnapshot, tempDir, tmpdirSync } from "harness";
import { join } from "path";
import { createTestBuilder } from "./test_builder";
const TestBuilder = createTestBuilder(import.meta.path);

const BUN = bunExe();

$.nothrow();
describe("bun exec", () => {
  TestBuilder.command`${BUN} exec ${"echo hi!"}`.env(bunEnv).stdout("hi!\n").runAsTest("it works");
  TestBuilder.command`${BUN} exec sldkfjslkdjflksdjflj`
    .env(bunEnv)
    .exitCode(1)
    .stderr("bun: command not found: sldkfjslkdjflksdjflj\n")
    .runAsTest("it works on command fail");

  TestBuilder.command`${BUN} exec`
    .env(bunEnv)
    .stdout(
      'Usage: bun exec <script>\n\nExecute a shell script directly from Bun.\n\nNote: If executing this from a shell, make sure to escape the string!\n\nExamples:\n  bun exec "echo hi"\n  bun exec "echo \\"hey friends\\"!"\n',
    )
    .runAsTest("no args prints help text");

  TestBuilder.command`${BUN} exec ${{ raw: Bun.$.escape(`echo 'hi "there bud"'`) }}`
    .stdout('hi "there bud"\n')
    .runAsTest("it works2");

  TestBuilder.command`${BUN} exec ${"cat filename"}`
    .file(
      "filename",
      Array(128 * 1024)
        .fill("a")
        .join(""),
    )
    .env(bunEnv)
    .stdout(
      `${Array(128 * 1024)
        .fill("a")
        .join("")}`,
    )
    .runAsTest("write a lot of data");

  describe("--help works", () => {
    // prettier-ignore
    const programs = [
      // ["cat",    1, "", ""],
      ["touch",  1, "touch: illegal option -- help\n", ""],
      ["mkdir",  1, "mkdir: illegal option -- help\n", ""],
      // ["cd",     1, "cd: no such file or directory: --help\n", ""],
      ["echo",   0, "", "--help\n"],
      ["pwd",    1, "pwd: too many arguments\n", ""],
      // ["which",  1, "--help not found\n", ""],
      ["rm",     1, "rm: illegal option -- -\n", ""],
      ["mv",     1, "mv: illegal option -- -\n", ""],
      ["ls",     1, "ls: illegal option -- -\n", ""],
      ["exit",   1, "exit: numeric argument required\n", ""],
      ["true",   0, "", ""],
      ["false",  1, "", ""],
      // ["yes",    1, "", ""],
      ["seq",    1, "seq: invalid argument\n", ""],
    ] as const;
    for (const [item, exitCode, stderr, stdout] of programs) {
      TestBuilder.command`${BUN} exec ${`${item} --help`}`
        .env(bunEnv)
        .exitCode(exitCode)
        .stderr(stderr)
        .stdout(stdout)
        .runAsTest(item);
    }
  });

  TestBuilder.command`${BUN} exec cd`
    .env(bunEnv)
    .exitCode(0)
    .stderr("")
    .stdout("")
    .runAsTest("cd with no arguments works");

  test("bun works even when not in PATH", async () => {
    const val = await $`bun exec 'bun'`.env({ ...bunEnv, PATH: "" }).nothrow();
    expect(val.stderr.toString()).not.toContain("bun: command not found: bun");
    expect(val.stdout.toString()).toContain("Bun is a fast JavaScript runtime");
  });

  test("works with latin1 paths", async () => {
    const tempdir = tmpdirSync();
    const abs = join(tempdir, "Í", "hi");
    await Bun.write(abs, "text");
    const result = await $`${BUN} exec ls`
      .env({ ...(bunEnv as any) })
      .cwd(join(tempdir, "Í"))
      .quiet();
    expect(result.text()).toBe("hi\n");
  });
});

async function bunsh(args: string[], opts: { cwd?: string; env?: Record<string, string>; stdin?: string } = {}) {
  await using proc = Bun.spawn({
    cmd: [BUN, ...args],
    argv0: "bunsh",
    env: { ...bunEnv, ...opts.env },
    cwd: opts.cwd,
    stdin: opts.stdin === undefined ? "ignore" : new Blob([opts.stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

describe("bunsh", () => {
  test.concurrent("-c runs the command and exits with its code", async () => {
    const { stdout, exitCode } = await bunsh(["-c", "echo one; false"]);
    expect(stdout).toBe("one\n");
    expect(exitCode).toBe(1);
  });

  test.concurrent("exit ends the whole script", async () => {
    const { stdout, exitCode } = await bunsh(["-c", "echo before; exit 3; echo after"]);
    expect(stdout).toBe("before\n");
    expect(exitCode).toBe(3);
  });

  test.concurrent("exit after && ends the script", async () => {
    const { stdout, exitCode } = await bunsh(["-c", "true && exit 4; echo after"]);
    expect(stdout).toBe("");
    expect(exitCode).toBe(4);
  });

  test.concurrent("a subshell absorbs exit", async () => {
    const { stdout, exitCode } = await bunsh(["-c", "(exit 2); echo $?; echo $(echo in; exit 5)out"]);
    expect(stdout).toBe("2\ninout\n");
    expect(exitCode).toBe(0);
  });

  test.concurrent("$? is the last exit code", async () => {
    const { stdout, exitCode } = await bunsh(["-c", "false; echo $?; true; echo $?; false || echo $?"]);
    expect(stdout).toBe("1\n0\n1\n");
    expect(exitCode).toBe(0);
  });

  test.concurrent("-c name args sets $0 and $1..", async () => {
    const { stdout, exitCode } = await bunsh(["-c", "echo $0 $1 $2", "myname", "a", "b"]);
    expect(stdout).toBe("myname a b\n");
    expect(exitCode).toBe(0);
  });

  test.concurrent("environment variables and assignments", async () => {
    const { stdout, exitCode } = await bunsh(["-c", "X=local; echo $FROM_ENV $X"], { env: { FROM_ENV: "inherited" } });
    expect(stdout).toBe("inherited local\n");
    expect(exitCode).toBe(0);
  });

  test.concurrent("runs a script file with arguments", async () => {
    using dir = tempDir("bunsh-script", {
      "script.sh": "#!/usr/bin/env bunsh\necho $0 $1\nexit 6\necho unreachable\n",
    });
    const { stdout, exitCode } = await bunsh(["script.sh", "arg"], { cwd: String(dir) });
    expect(stdout).toBe("script.sh arg\n");
    expect(exitCode).toBe(6);
  });

  test.concurrent("a missing script exits 127", async () => {
    const { stdout, exitCode } = await bunsh(["does-not-exist.sh"]);
    expect(stdout).toBe("");
    expect(exitCode).toBe(127);
  });

  test.concurrent("reads the script from stdin when it is not a terminal", async () => {
    const { stdout, exitCode } = await bunsh([], { stdin: "echo from-stdin\nexit 7\necho no\n" });
    expect(stdout).toBe("from-stdin\n");
    expect(exitCode).toBe(7);
  });

  test.concurrent("a parse error exits 2", async () => {
    const { stdout, stderr, exitCode } = await bunsh(["-c", "echo 'unterminated"]);
    expect(stdout).toBe("");
    expect(stderr).toContain("error");
    expect(exitCode).toBe(2);
  });

  test.concurrent("-i keeps cwd, variables and $? between lines", async () => {
    using dir = tempDir("bunsh-interactive", { "sub/marker": "" });
    const { stdout, exitCode } = await bunsh(["-i"], {
      cwd: String(dir),
      env: { HOME: String(dir), USERPROFILE: String(dir) },
      stdin: "cd sub\nX=kept\nexport Y=exported\nfalse\necho $? $X $Y\nls\nexit 9\necho unreachable\n",
    });
    expect(stdout).toContain("1 kept exported");
    expect(stdout).toContain("marker");
    expect(stdout).not.toContain("unreachable");
    expect(exitCode).toBe(9);
    expect(await Bun.file(`${dir}/.bunsh_history`).text()).toContain("echo $? $X $Y");
  });

  test.concurrent("-i exits with the last code on end of input", async () => {
    using dir = tempDir("bunsh-eof", {});
    const { exitCode } = await bunsh(["-i"], {
      env: { HOME: String(dir), USERPROFILE: String(dir) },
      stdin: "false\n",
    });
    expect(exitCode).toBe(1);
  });

  // Unelevated, --root re-executes through sudo -n or UAC, which a test cannot answer.
  test.skipIf(isWindows || process.getuid?.() !== 0)("--root runs in place when already root", async () => {
    const { stdout, exitCode } = await bunsh(["--root", "-c", "echo $0 $1; exit 5", "name", "arg"]);
    expect(stdout).toBe("name arg\n");
    expect(exitCode).toBe(5);
  });

  test.concurrent("is also selected by a login argv0", async () => {
    await using proc = Bun.spawn({
      cmd: [BUN, "-c", "echo login"],
      argv0: "-bunsh",
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([proc.stdout.text(), proc.exited]);
    expect(normalizeBunSnapshot(stdout)).toMatchInlineSnapshot(`"login"`);
    expect(exitCode).toBe(0);
  });
});

// The Aphrody Alpine image keeps busybox ash as /bin/sh until every script below passes under bunsh (the
// `test.todo`s are the remaining switch criteria; run them with `--todo`).
describe.skipIf(isWindows)("bunsh runs apk install scripts", () => {
  const fixtures = join(import.meta.dir, "fixtures", "apk-scripts");

  async function runScript(name: string, args: string[] = ["1.0.0-r0"]) {
    using dir = tempDir("bunsh-apk", { "bin/.keep": "" });
    // An empty PATH: the scripts' addgroup/adduser must fail quietly, never touch the host.
    const result = await bunsh([join(fixtures, name), ...args], {
      cwd: String(dir),
      env: { ROOT: String(dir), PATH: join(String(dir), "bin") },
    });
    const version = await Bun.file(join(String(dir), "var/lib/demo/version"))
      .text()
      .catch(() => null);
    return { ...result, version };
  }

  for (const name of ["nginx.pre-install", "chrony.pre-install"]) {
    test.concurrent(name, async () => {
      const { stdout, exitCode } = await runScript(name);
      expect(stdout).toBe("");
      expect(exitCode).toBe(0);
    });
  }

  test.concurrent("state-dir.post-install", async () => {
    const { stdout, version, exitCode } = await runScript("state-dir.post-install", ["2.4.1-r3"]);
    expect(stdout).toBe("");
    expect(version).toBe("2.4.1-r3\n");
    expect(exitCode).toBe(0);
  });

  test.todo("test-bracket.post-upgrade: needs a [ / test builtin", async () => {
    const { exitCode } = await runScript("test-bracket.post-upgrade");
    expect(exitCode).toBe(0);
  });

  test.todo("for-loop.post-install: needs for/do/done", async () => {
    const { exitCode } = await runScript("for-loop.post-install");
    expect(exitCode).toBe(0);
  });

  test.todo("case.post-upgrade: needs case/esac", async () => {
    const { stdout, exitCode } = await runScript("case.post-upgrade", ["2.0.0-r0", "1.9.0-r0"]);
    expect(stdout).toBe("migrating from 1.9.0-r0\n");
    expect(exitCode).toBe(0);
  });

  test.todo("function.post-install: needs shell functions", async () => {
    const { exitCode } = await runScript("function.post-install");
    expect(exitCode).toBe(0);
  });

  test.todo("set-e.post-install: needs set -e and the : builtin", async () => {
    const { exitCode } = await runScript("set-e.post-install");
    expect(exitCode).toBe(0);
  });
});
