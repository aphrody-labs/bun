// SPDX-License-Identifier: MIT
import { beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { DotnetHost } from "../js/dotnet.ts";

const root = resolve(import.meta.dir, "..");
const fixture = join(import.meta.dir, "fixture");
const assembly = join(fixture, "bin", "Native.dll");
const name =
  process.platform === "win32"
    ? "bun_dotnet_host.dll"
    : process.platform === "darwin"
      ? "libbun_dotnet_host.dylib"
      : "libbun_dotnet_host.so";
const libraryPath = process.env.BUN_DOTNET_HOST_LIBRARY || join(root, "target", "debug", name);

let host: DotnetHost;

beforeAll(async () => {
  for (const cmd of [
    ["cargo", "build", "-p", "bun-dotnet-host"],
    ["dotnet", "build", "-v", "q", "-nologo"],
  ]) {
    if (cmd[0] === "cargo" && process.env.BUN_DOTNET_HOST_LIBRARY) continue;
    await using proc = Bun.spawn({ cmd, cwd: cmd[0] === "cargo" ? root : fixture, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    if (exitCode !== 0) throw new Error(`${cmd.join(" ")} failed:\n${stdout}${stderr}`);
  }
  host = new DotnetHost(libraryPath);
}, 300_000);

test("locates hostfxr in the .NET install", () => {
  const { dotnetRoot, hostfxr } = host.locate();
  expect(existsSync(hostfxr)).toBe(true);
  expect(hostfxr.startsWith(dotnetRoot)).toBe(true);
});

test("explicit root without hostfxr is a clear error", () => {
  expect(() => host.locate(fixture)).toThrow(/no (lib)?hostfxr/);
});

test("binds [UnmanagedCallersOnly] methods from a built assembly", () => {
  expect(host.initialize()).toBeGreaterThanOrEqual(0);
  const add = host.function(
    { assembly, type: "Fixture.Native, Native", method: "Add" },
    { args: ["i32", "i32"], returns: "i32" },
  );
  const scale = host.function(
    { assembly, type: "Fixture.Native, Native", method: "Scale" },
    { args: ["f64"], returns: "f64" },
  );
  expect(add(20, 22)).toBe(42);
  expect(scale(4)).toBe(10);
});

test("binds a method through an explicit delegate type", () => {
  const square = host.function(
    { assembly, type: "Fixture.Native, Native", method: "Square", delegateType: "Fixture.Native+Unary, Native" },
    { args: ["i32"], returns: "i32" },
  );
  expect(square(12)).toBe(144);
});

test("missing types surface the CLR status", () => {
  expect(() => host.functionPointer({ assembly, type: "Fixture.Missing, Native", method: "Add" })).toThrow(
    /0x80131522: type not found/,
  );
});

test("the muxer refuses to start once the CLR runs in the process", () => {
  expect(host.main(["--version"])).not.toBe(0);
});

test("runs the dotnet muxer in a fresh process", async () => {
  const script = `import { DotnetHost } from ${JSON.stringify(join(root, "js", "dotnet.ts"))};
process.exitCode = new DotnetHost(${JSON.stringify(libraryPath)}).main(["--version"]);`;
  await using proc = Bun.spawn({ cmd: [process.execPath, "-e", script], stdout: "pipe", stderr: "pipe" });
  const [stdout, exitCode] = await Promise.all([proc.stdout.text(), proc.exited]);
  expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  expect(exitCode).toBe(0);
});
