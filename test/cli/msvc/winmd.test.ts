import { describe, expect, test } from "bun:test";
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

const inputs = isWindows ? JSON.parse((await run(["winmd", "inputs", "--json"])).stdout) : null;

describe("bun winmd", () => {
  test("help", async () => {
    const { stdout, exitCode } = await run(["winmd", "--help"]);
    expect(stdout).toContain("Usage: bun winmd");
    expect(exitCode).toBe(0);
  });

  test("bindgen errors are reported, not crashes", async () => {
    using dir = tempDir("bun-winmd-error", {});
    const { stderr, exitCode } = await run(
      ["winmd", "--out", "x.rs", "--in", "missing.winmd", "--filter", "X"],
      String(dir),
    );
    expect(stderr).toStartWith("error: ");
    expect(exitCode).toBe(1);
  });
});

describe.concurrent.skipIf(!isWindows)("bun winmd with the embedded metadata", () => {
  test("inputs", () => {
    expect(inputs.embedded.map((e: { name: string }) => e.name)).toEqual(["Windows.Win32.winmd", "Windows.winmd"]);
    expect(inputs.embedded.every((e: { compressedSize: number }) => e.compressedSize > 0)).toBe(true);
  });

  test("--lang rust (default) generates windows-sys style bindings", async () => {
    using dir = tempDir("bun-winmd-rust", {});
    const { stderr, exitCode } = await run(
      ["winmd", "--out", "bindings.rs", "--filter", "GetTickCount", "--sys", "--flat"],
      String(dir),
    );
    expect(stderr).toBe("");
    expect(await Bun.file(join(String(dir), "bindings.rs")).text()).toContain(
      '"kernel32.dll" "system" fn GetTickCount() -> u32',
    );
    expect(exitCode).toBe(0);
  });

  test("--out *.ts generates a bun:ffi module that calls Win32", async () => {
    using dir = tempDir("bun-winmd-ts", {
      "main.ts": `import { open } from "./kernel32.ts";\nconst lib = open("kernel32.dll");\nconsole.log(lib.symbols.GetCurrentProcessId() === process.pid);\n`,
    });
    const gen = await run(
      ["winmd", "--out", "kernel32.ts", "--filter", "GetCurrentProcessId", "--filter", "GetTickCount"],
      String(dir),
    );
    expect(gen.stderr).toBe("");
    expect(gen.exitCode).toBe(0);
    const { stdout, exitCode } = await run(["main.ts"], String(dir));
    expect(stdout).toBe("true\n");
    expect(exitCode).toBe(0);
  });

  test("--out *.json describes signatures and struct layouts", async () => {
    using dir = tempDir("bun-winmd-json", {});
    const gen = await run(
      ["winmd", "--out", "api.json", "--filter", "GetTickCount", "--filter", "RECT", "--arch", "x86"],
      String(dir),
    );
    expect(gen.stderr).toBe("");
    expect(gen.exitCode).toBe(0);
    const api = await Bun.file(join(String(dir), "api.json")).json();
    expect(api.arch).toBe("x86");
    expect(api.functions["kernel32.dll"].GetTickCount.returns.ffi).toBe("u32");
    expect(api.structs.RECT).toMatchObject({ size: 16, align: 4, union: false });
    expect(api.structs.RECT.fields.map((f: { offset: number }) => f.offset)).toEqual([0, 4, 8, 12]);
  });

  test.skipIf(!inputs?.sdk)("--in sdk reads the SDK's Windows.winmd", async () => {
    using dir = tempDir("bun-winmd-sdk", {});
    const { stderr, exitCode } = await run(
      ["winmd", "--in", "sdk", "--out", "uri.rs", "--filter", "Windows.Foundation.IUriRuntimeClass", "--minimal"],
      String(dir),
    );
    expect(stderr).toBe("");
    expect(await Bun.file(join(String(dir), "uri.rs")).text()).toContain("IUriRuntimeClass");
    expect(exitCode).toBe(0);
  });
});
