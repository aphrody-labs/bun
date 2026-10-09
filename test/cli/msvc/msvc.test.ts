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

  test.skipIf(!hasMsvc)("list and toolset selection", async () => {
    const instance = info.instance;
    const toolsets: { version: string }[] = instance.toolsets;
    const prefix = (version: string) => version.split(".").slice(0, 2).join(".");
    const [list, listJson, ...selected] = await Promise.all([
      run(["msvc", "list"]),
      run(["msvc", "list", "--json"]),
      ...toolsets.map(t => run(["msvc", "info", "--toolset", prefix(t.version)])),
    ]);
    expect(list.stdout).toContain(instance.path);
    expect(list.exitCode).toBe(0);
    expect(JSON.parse(listJson.stdout).instances.map((i: { path: string }) => i.path)).toContain(instance.path);
    toolsets.forEach((toolset, i) => {
      const report = JSON.parse(selected[i].stdout);
      expect(report.msvc.version).toBe(toolset.version);
      expect(report.env.VCToolsVersion).toBe(toolset.version);
      expect(report.env.VSCMD_ARG_VCVARS_VER).toBe(prefix(toolset.version));
      expect(windows.toolchain({ toolset: toolset.version }).msvc!.version).toBe(toolset.version);
    });
    const missing = await run(["msvc", "env", "--toolset", "13.99"]);
    expect(missing.stderr).toContain("no MSVC toolset matching 13.99");
    expect(missing.exitCode).toBe(1);
    expect(windows.toolchain({ toolset: "13.99" }).error).toContain("13.99");
  });

  test.skipIf(!hasMsvc)("sync caches the environment until the toolchain changes", async () => {
    using dir = tempDir("bun-msvc-sync", {});
    const first = await run(["msvc", "sync", "--json", "--cache-dir", String(dir)]);
    expect(first.exitCode).toBe(0);
    const synced = JSON.parse(first.stdout);
    expect(synced.hit).toBe(false);
    const envJson = await Bun.file(synced.files.json).json();
    expect(envJson.set.VCToolsVersion).toBe(info.msvc.version);
    expect(envJson.prepend.PATH[0]).toBe(info.msvc.bin);
    expect(envJson.fingerprint.length).toBeGreaterThan(2);
    expect(await Bun.file(synced.files.cmd).text()).toContain(`@set "VCToolsVersion=${info.msvc.version}"`);
    expect(await Bun.file(synced.files.ps1).text()).toContain("$env:INCLUDE = ");
    expect(await Bun.file(synced.files.sh).text()).toMatch(/^export PATH='\/[a-z]\//m);
    const [second, check] = await Promise.all([
      run(["msvc", "sync", "--json", "--cache-dir", String(dir)]),
      run(["msvc", "sync", "--check", "--cache-dir", String(dir)]),
    ]);
    expect(JSON.parse(second.stdout).hit).toBe(true);
    expect(check.exitCode).toBe(0);
    envJson.fingerprint[0].mtimeMs = 1;
    await Bun.write(synced.files.json, JSON.stringify(envJson));
    const stale = await run(["msvc", "sync", "--check", "--cache-dir", String(dir)]);
    expect(stale.exitCode).toBe(1);
  });

  test("setup --dry-run plans the installer commands, msi lists orphans", async () => {
    const [setup, repair, msi] = await Promise.all([
      run(["msvc", "setup", "--dry-run", "--add", "Microsoft.VisualStudio.Component.Bun.NotInstalled"]),
      run(["msvc", "setup", "--dry-run", "--repair"]),
      run(["msvc", "msi", "--json"]),
    ]);
    expect(setup.exitCode).toBe(0);
    if (info.instances.length === 0) {
      expect(setup.stdout).toContain("Microsoft.VisualStudio.BuildTools");
    } else {
      expect(setup.stdout).toContain("setup.exe");
      expect(repair.stdout).toContain(" repair --installPath ");
    }
    expect(repair.exitCode).toBe(0);
    expect(Array.isArray(JSON.parse(msi.stdout).orphans)).toBe(true);
    expect(msi.exitCode).toBe(0);
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
