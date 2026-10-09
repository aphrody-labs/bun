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

// `bun msvc` on Linux and macOS, `bun msvc cross` on Windows: the cross-compilation sysroot,
// downloaded here from a local mirror of the Visual Studio manifests (written by
// `BUN_MSVC_WRITE_FIXTURES=<dir> cargo test --lib write_fixtures` in vendor/find-msvc-tools).
describe("bun msvc cross sysroot", () => {
  const cross = isWindows ? ["msvc", "cross"] : ["msvc"];
  const mirror = join(import.meta.dir, "fixtures", "vs-mirror");

  test("help", async () => {
    const { stdout, exitCode } = await run([...cross, "help"]);
    expect(stdout).toContain(`Usage: bun ${cross.join(" ")} <command>`);
    expect(stdout).toContain("x86_64/aarch64/i686-pc-windows-msvc");
    expect(exitCode).toBe(0);
  });

  test("setup, env, sync and list from a Visual Studio mirror", async () => {
    using server = Bun.serve({
      port: 0,
      async fetch(req) {
        const file = Bun.file(join(mirror, decodeURIComponent(new URL(req.url).pathname)));
        return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
      },
    });
    using dir = tempDir("msvc-cross", {});
    const cache = join(String(dir), "cache");
    const options = ["--arch", "x64", "--manifest", `${server.url}channel`, "--cache-dir", cache];

    const [refused, plan] = await Promise.all([
      run([...cross, "setup", ...options]),
      run([...cross, "setup", "--dry-run", "--json", ...options]),
    ]);
    expect(refused.stderr).toContain("--accept-license");
    expect(refused.exitCode).toBe(1);
    const planned = JSON.parse(plan.stdout);
    expect(planned).toMatchObject({ crt: "14.44.17.14", crtVersion: "14.44.35220", sdk: "10.0.26100", archs: ["x64"] });
    expect(planned.downloads.map((d: { package: string }) => d.package)).toContain(
      "Microsoft.VC.14.44.17.14.CRT.x64.Store.base",
    );
    expect(plan.exitCode).toBe(0);

    const setup = await run([...cross, "setup", "--accept-license", "--json", ...options]);
    expect(setup.stderr).toContain("extracting Windows SDK Desktop Libs x64-x86_en-us.msi");
    const sysroot = JSON.parse(setup.stdout);
    expect(sysroot).toMatchObject({ msvcVersion: "14.44.35207", sdkVersion: "10.0.26100.0", archs: ["x64"] });
    expect(setup.exitCode).toBe(0);
    const root: string = sysroot.root;
    const kits = join(root, "Windows Kits", "10");
    for (const file of [
      join(root, "VC", "Tools", "MSVC", "14.44.35207", "include", "vcruntime.h"),
      join(root, "VC", "Tools", "MSVC", "14.44.35207", "lib", "x64", "msvcrt.lib"),
      join(kits, "Include", "10.0.26100.0", "um", "Windows.h"),
      join(kits, "Include", "10.0.26100.0", "shared", "winerror.h"),
      join(kits, "Lib", "10.0.26100.0", "um", "x64", "kernel32.Lib"),
      join(kits, "Lib", "10.0.26100.0", "ucrt", "x64", "ucrt.lib"),
    ]) {
      expect(await Bun.file(file).exists()).toBe(true);
    }
    expect(await Bun.file(join(root, "VC", "Tools", "MSVC", "14.44.35207", "lib", "x64", "libcmt.pdb")).exists()).toBe(
      false,
    );
    if (!isWindows) {
      // Case aliases for case-sensitive file systems, behind the space-free `crt` and `sdk` links.
      for (const alias of [
        "crt/include/vcruntime.h",
        "sdk/Lib/10.0.26100.0/um/x64/kernel32.lib",
        "sdk/Include/10.0.26100.0/shared/WinError.h",
        "sdk/Include/10.0.26100.0/um/GL/gl.h",
      ]) {
        expect(await Bun.file(join(root, alias)).exists()).toBe(true);
      }
    }

    const [json, sh, check, list] = await Promise.all([
      run([...cross, "env", "--shell", "json", "--cache-dir", cache]),
      run([...cross, "env", "--shell", "sh", "--cache-dir", cache]),
      run([...cross, "sync", "--check", "--cache-dir", cache]),
      run([...cross, "list", "--json", "--cache-dir", cache]),
    ]);
    const env = JSON.parse(json.stdout);
    expect(env.CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER).toMatch(/lld-link(.exe)?$/);
    expect(env.AR_x86_64_pc_windows_msvc).toMatch(/llvm-lib(.exe)?$/);
    expect(env.CFLAGS_x86_64_pc_windows_msvc).toStartWith("--target=x86_64-pc-windows-msvc /imsvc");
    expect(env.CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS).toContain("-Lnative=");
    expect(env.BUN_MSVC_SDK_VERSION).toBe("10.0.26100.0");
    expect(json.exitCode).toBe(0);
    expect(sh.stdout).toContain("export CC_x86_64_pc_windows_msvc=");
    expect(sh.exitCode).toBe(0);
    expect(check.stdout.trim()).toBe(root);
    expect(check.exitCode).toBe(0);
    expect(JSON.parse(list.stdout).map((s: { root: string }) => s.root)).toEqual([root]);
    expect(list.exitCode).toBe(0);
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
