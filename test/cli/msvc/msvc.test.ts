import { describe, expect, test } from "bun:test";
import windows from "bun:windows";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";
import { join } from "node:path";

async function run(args: string[], cwd?: string) {
  await using proc = Bun.spawn({
    cmd: [bunExe(), ...args],
    env: bunEnv,
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

const info = isWindows ? JSON.parse((await run(["msvc", "info"])).stdout) : null;
const hasMsvc = info?.msvc != null && info?.sdk != null;

describe.skipIf(isWindows)("bun msvc outside Windows", () => {
  test("fails", async () => {
    const { stderr, exitCode } = await run(["msvc", "doctor"]);
    expect(stderr).toContain("only available on Windows");
    expect(exitCode).toBe(1);
  });
});

describe.skipIf(!isWindows)("bun msvc", () => {
  test("help", async () => {
    const { stdout, exitCode } = await run(["msvc", "--help"]);
    expect(stdout).toContain("Usage: bun msvc");
    expect(exitCode).toBe(0);
  });

  test("info matches bun:windows toolchain()", async () => {
    const tc = windows.toolchain();
    expect(info.arch).toBe(tc.arch);
    expect(info.instances.map((i: { id: string }) => i.id)).toEqual(tc.instances.map(i => i.id));
    expect(info.msvc).toEqual(tc.msvc);
  });

  test("unknown arch and command fail", async () => {
    const [arch, command] = await Promise.all([run(["msvc", "info", "--arch", "sparc"]), run(["msvc", "frobnicate"])]);
    expect(arch.stderr).toContain("unknown architecture: sparc");
    expect(arch.exitCode).toBe(1);
    expect(command.stderr).toContain("unknown command: frobnicate");
    expect(command.exitCode).toBe(1);
  });

  test.skipIf(!hasMsvc)("doctor, which and env", async () => {
    const [doctor, which, env, pwsh, sh] = await Promise.all([
      run(["msvc", "doctor"]),
      run(["msvc", "which", "cl"]),
      run(["msvc", "env", "--json"]),
      run(["msvc", "env", "--format", "pwsh"]),
      run(["msvc", "env", "--format=sh"]),
    ]);
    expect(doctor.stdout).toMatch(/ok +MSVC +\d+\.\d+\.\d+ /);
    expect(doctor.stdout).toContain(`${info.msvc.version} (`);
    expect(doctor.exitCode).toBe(0);
    expect(which.stdout.trim()).toBe(info.tools.cl);
    expect(which.exitCode).toBe(0);
    const vars = JSON.parse(env.stdout);
    expect(vars.VCToolsVersion).toBe(info.msvc.version);
    expect(vars.INCLUDE).toContain(info.msvc.dir);
    expect(pwsh.stdout).toContain(`$env:VCToolsVersion = '${info.msvc.version}'`);
    expect(sh.stdout).toContain(`export VCToolsVersion='${info.msvc.version}'`);
    expect(sh.stdout).toMatch(/^export PATH='\/[a-z]\//m);
  });

  test.skipIf(!hasMsvc)("exec compiles and links a C program with the computed environment", async () => {
    using dir = tempDir("bun-msvc-exec", {
      "main.c": `#include <stdio.h>\n#include <windows.h>\nint main(void) { printf("%u\\n", (unsigned)GetCurrentProcessId() > 0); return 0; }\n`,
    });
    const build = await run(["msvc", "exec", "--", "cl", "/nologo", "main.c", "/link", "kernel32.lib"], String(dir));
    expect(build.stderr).toBe("");
    expect(build.exitCode).toBe(0);
    await using proc = Bun.spawn({ cmd: [join(String(dir), "main.exe")], stdout: "pipe" });
    expect(await proc.stdout.text()).toBe("1\r\n");
    expect(await proc.exited).toBe(0);
  });
});
