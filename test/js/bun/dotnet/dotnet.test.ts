import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bunEnv, bunExe, tempDir } from "harness";

const hasDotnet = !!(Bun.which("dotnet") || process.env.DOTNET_ROOT);
const nodeApi = resolve(import.meta.dir, "../../../../packages/bun-dotnet/dotnet/out/pkg");
const packed = existsSync(join(nodeApi, "node-api-dotnet", "net10.0.js"));

// No MSBuild/compiler server outlives a build and keeps the test's pipes open.
const env = {
  ...bunEnv,
  DOTNET_CLI_TELEMETRY_OPTOUT: "1",
  DOTNET_NOLOGO: "1",
  DOTNET_CLI_USE_MSBUILD_SERVER: "0",
  MSBUILDDISABLENODEREUSE: "1",
  UseSharedCompilation: "false",
  BUN_DOTNET_NODE_API: nodeApi,
};

async function run(cmd: string[], cwd?: string) {
  await using proc = Bun.spawn({ cmd: [bunExe(), ...cmd], env, cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout: stdout.replaceAll("\r\n", "\n"), stderr, exitCode };
}

const LIBRARY = `using System.Runtime.InteropServices;

namespace Fixture;

public static class Native
{
    [UnmanagedCallersOnly]
    public static int Add(int a, int b) => a + b;

    public delegate int Unary(int x);

    public static int Square(int x) => x * x;
}

public static class Calc
{
    public static int Add(int a, int b) => a + b;

    public static async Task<string> EchoAsync(string text)
    {
        await Task.Delay(10);
        return text + "!";
    }

    public static int Apply(Func<int, int> callback, int value) => callback(value);
}

public class Counter
{
    public Counter(int start) => Value = start;

    public int Value { get; private set; }

    public event EventHandler<int>? Changed;

    public void Increment()
    {
        Value++;
        Changed?.Invoke(this, Value);
    }

    public void OnChanged(Action<int> listener) => Changed += (_, value) => listener(value);
}
`;

const PROJECT = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <OutDir>bin</OutDir>
  </PropertyGroup>
</Project>
`;

describe.skipIf(!hasDotnet)("bun:dotnet", () => {
  const dir = tempDir("bun-dotnet", {
    "Fixture.csproj": PROJECT,
    "Fixture.cs": LIBRARY,
    "Directory.Build.props": "<Project />\n",
    "app.cs": `#:property Nullable=enable\nConsole.WriteLine($"hello {string.Join(",", args)} from {System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription.Split(' ')[0]}");\nreturn 3;\n`,
  });
  const cwd = String(dir);
  const assembly = join(cwd, "bin", "Fixture.dll");

  beforeAll(async () => {
    const result = await run(["dotnet", "build", "-v", "q", "-nologo", "-nodeReuse:false"], cwd);
    if (result.exitCode !== 0) throw new Error(`bun dotnet build failed:\n${result.stdout}${result.stderr}`);
  }, 240_000);
  afterAll(() => dir[Symbol.dispose]());

  test("bun dotnet runs the .NET SDK in the Bun process", async () => {
    const { stdout, exitCode } = await run(["dotnet", "--version"]);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(exitCode).toBe(0);
  });

  test("bun run app.cs runs a file-based C# app", async () => {
    const { stdout, stderr, exitCode } = await run(["run", "app.cs", "a", "b"], cwd);
    expect(stdout).toBe("hello a,b from .NET\n");
    expect(stderr).not.toContain("error");
    expect(exitCode).toBe(3);
  }, 240_000);

  test("locate reports the install", async () => {
    const script = `import { locate } from "bun:dotnet";
const l = locate();
console.log(JSON.stringify({ sdks: l.sdks.length > 0, runtimes: l.runtimes.length > 0, hostfxr: l.hostfxr.startsWith(l.dotnetRoot) }));`;
    const { stdout, exitCode } = await run(["-e", script]);
    expect(JSON.parse(stdout)).toEqual({ sdks: true, runtimes: true, hostfxr: true });
    expect(exitCode).toBe(0);
  });

  test("unmanaged entry points and delegates", async () => {
    const script = `import dotnet from "bun:dotnet";
const assembly = ${JSON.stringify(assembly)};
const add = dotnet.unmanaged({ assembly, type: "Fixture.Native, Fixture", method: "Add" }, { args: ["i32", "i32"], returns: "i32" });
const square = dotnet.unmanaged(
  { assembly, type: "Fixture.Native, Fixture", method: "Square", delegateType: "Fixture.Native+Unary, Fixture" },
  { args: ["i32"], returns: "i32" },
);
let missing;
try { dotnet.functionPointer({ assembly, type: "Fixture.Missing, Fixture", method: "Add" }); } catch (e) { missing = [e.code, e.hresult.toString(16)]; }
console.log(JSON.stringify([add(20, 22), square(12), missing, dotnet.initialize(), typeof dotnet.runtimeConfig()]));`;
    const { stdout, stderr, exitCode } = await run(["-e", script]);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual([42, 144, ["ERR_BUN_DOTNET", "80131522"], 1, "string"]);
    expect(exitCode).toBe(0);
  });

  test(".csts runs as TypeScript and imports csjs:dotnet", async () => {
    using app = tempDir("bun-csts", {
      "main.csts": `import dotnet from "csjs:dotnet";\nconst n: number = 2;\nconsole.log(n * 21, typeof dotnet.locate);\n`,
      "view.cstsx": `export const view = () => <b>{"x"}</b>;\n`,
    });
    const { stdout, exitCode } = await run(["main.csts"], String(app));
    expect(stdout).toBe("42 function\n");
    expect(exitCode).toBe(0);
  });

  describe.skipIf(!packed)("node-api-dotnet object model", () => {
    test("statics, instances, Task, delegates, events", async () => {
      const script = `import dotnet from "bun:dotnet";
const { Fixture } = dotnet.load(${JSON.stringify(assembly)});
const counter = new Fixture.Counter(5);
const seen = [];
counter.OnChanged(v => seen.push(v));
counter.Increment();
console.log(JSON.stringify([Fixture.Calc.Add(20, 22), counter.Value, await Fixture.Calc.EchoAsync("bun"), Fixture.Calc.Apply(x => x * 3, 14), seen]));`;
      const { stdout, exitCode } = await run(["-e", script]);
      expect(JSON.parse(stdout)).toEqual([42, 6, "bun!", 42, [6]]);
      expect(exitCode).toBe(0);
    }, 60_000);

    test("generateTypes writes declarations", async () => {
      const output = join(cwd, "Fixture.d.ts");
      const script = `import { generateTypes } from "bun:dotnet";
const r = await generateTypes({ assembly: ${JSON.stringify(assembly)}, output: ${JSON.stringify(output)} });
process.exitCode = r.exitCode;`;
      const { exitCode } = await run(["-e", script]);
      const dts = readFileSync(output, "utf8").replaceAll("\r\n", "\n");
      expect(dts).toContain("export function EchoAsync(text: string): Promise<string>;");
      expect(exitCode).toBe(0);
    }, 120_000);
  });
});
