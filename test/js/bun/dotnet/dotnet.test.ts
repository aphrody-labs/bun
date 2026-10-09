import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
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
    using app = tempDir("bun-dotnet-app", {
      "app.cs": `#:property Nullable=enable\nConsole.WriteLine($"hello {string.Join(",", args)} from {System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription.Split(' ')[0]}");\nreturn 3;\n`,
    });
    const { stdout, stderr, exitCode } = await run(["run", "app.cs", "a", "b"], String(app));
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

describe("bun dotnet setup/env/info/resolve", () => {
  const hostfxr =
    process.platform === "win32" ? "hostfxr.dll" : process.platform === "darwin" ? "libhostfxr.dylib" : "libhostfxr.so";
  const muxer = process.platform === "win32" ? "dotnet.exe" : "dotnet";

  function fakeEnv(root: string, cache: string, extra: Record<string, string> = {}) {
    const result: Record<string, string | undefined> = {
      ...bunEnv,
      DOTNET_ROOT: root,
      BUN_DOTNET_CACHE_DIR: cache,
      ...extra,
    };
    for (const key of [
      "DOTNET_ROOT_X64",
      "DOTNET_ROOT_X86",
      "DOTNET_ROOT_ARM64",
      "BUN_DOTNET_HOSTFXR",
      "BUN_DOTNET_NETHOST",
      "DOTNET_ROLL_FORWARD",
    ]) {
      if (!(key in extra)) delete result[key];
    }
    return result;
  }

  async function bunDotnet(args: string[], env: Record<string, string | undefined>, cwd?: string) {
    await using proc = Bun.spawn({ cmd: [bunExe(), "dotnet", ...args], env, cwd, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    return { stdout: stdout.replaceAll("\r\n", "\n"), stderr, exitCode };
  }

  function layout() {
    return tempDir("bun-dotnet-layout", {
      [`root/host/fxr/10.0.1/${hostfxr}`]: "",
      [`root/${muxer}`]: "",
      "root/sdk/10.0.100/dotnet.dll": "",
      "root/sdk/10.0.105/dotnet.dll": "",
      "root/sdk/10.0.200/dotnet.dll": "",
      "root/shared/Microsoft.NETCore.App/10.0.1/Microsoft.NETCore.App.deps.json": "{}",
      "root/shared/Microsoft.NETCore.App/10.0.3/Microsoft.NETCore.App.deps.json": "{}",
      "root/shared/Microsoft.NETCore.App/11.0.0-preview.1/Microsoft.NETCore.App.deps.json": "{}",
      "pinned/global.json": JSON.stringify({ sdk: { version: "10.0.100", rollForward: "latestPatch" } }),
      "app/app.runtimeconfig.json": JSON.stringify({
        runtimeOptions: { framework: { name: "Microsoft.NETCore.App", version: "10.0.0" } },
      }),
      "cache/.keep": "",
    });
  }

  test.concurrent("resolve follows global.json and runtimeconfig roll-forward", async () => {
    using dir = layout();
    const env = fakeEnv(join(String(dir), "root"), join(String(dir), "cache"));
    const [free, pinned, app, disabled] = await Promise.all([
      bunDotnet(["resolve"], env, String(dir)),
      bunDotnet(["resolve"], env, join(String(dir), "pinned")),
      bunDotnet(["resolve", "app.runtimeconfig.json"], env, join(String(dir), "app")),
      bunDotnet(
        ["resolve", "app.runtimeconfig.json"],
        { ...env, DOTNET_ROLL_FORWARD: "Disable" },
        join(String(dir), "app"),
      ),
    ]);
    expect([free.stdout, pinned.stdout, app.stdout, disabled.stdout]).toEqual([
      "10.0.200\n",
      "10.0.105\n",
      "Microsoft.NETCore.App 10.0.0 -> 10.0.3\n",
      "Microsoft.NETCore.App 10.0.0 -> not found (rollForward Disable)\n",
    ]);
    expect([free.exitCode, pinned.exitCode, app.exitCode, disabled.exitCode]).toEqual([0, 0, 0, 1]);
  });

  test.concurrent("info lists the install without starting .NET", async () => {
    using dir = layout();
    const root = realpathSync(join(String(dir), "root"));
    const { stdout, exitCode } = await bunDotnet(
      ["info", "--json"],
      fakeEnv(root, join(String(dir), "cache")),
      String(dir),
    );
    const info = JSON.parse(stdout);
    const install = info.installs.find((i: any) => i.root === info.primary);
    expect({
      primary: realpathSync(info.primary),
      source: info.primarySource,
      sdks: install.sdks,
      frameworks: install.frameworks,
      hostfxr: install.hostfxr.map((c: any) => c.version),
      selected: info.sdk.selected.version,
    }).toEqual({
      primary: root,
      source: "DOTNET_ROOT",
      sdks: ["10.0.100", "10.0.105", "10.0.200"],
      frameworks: { "Microsoft.NETCore.App": ["10.0.1", "10.0.3", "11.0.0-preview.1"] },
      hostfxr: ["10.0.1"],
      selected: "10.0.200",
    });
    expect(exitCode).toBe(0);
  });

  test.concurrent("env is cached and recomputed when an install changes", async () => {
    using dir = layout();
    const root = join(String(dir), "root");
    const cache = join(String(dir), "cache");
    const env = fakeEnv(root, cache);
    const first = await bunDotnet(["env", "--shell", "json"], env, String(dir));
    expect(JSON.parse(first.stdout).sdk.version).toBe("10.0.200");
    expect(readdirSync(cache).filter(name => name.startsWith("env-"))).toHaveLength(1);
    mkdirSync(join(root, "sdk", "10.0.300"));
    writeFileSync(join(root, "sdk", "10.0.300", "dotnet.dll"), "");
    const [second, sh, ps1] = await Promise.all([
      bunDotnet(["env", "--shell", "json"], env, String(dir)),
      bunDotnet(["env", "--shell", "sh"], env, String(dir)),
      bunDotnet(["env", "--shell", "ps1"], env, String(dir)),
    ]);
    const dotnetRoot = JSON.parse(second.stdout).dotnetRoot;
    expect(JSON.parse(second.stdout).sdk.version).toBe("10.0.300");
    expect(sh.stdout.split("\n")[0]).toBe(`export DOTNET_ROOT='${dotnetRoot}'`);
    expect(ps1.stdout.split("\n")[0]).toBe(`$env:DOTNET_ROOT = '${dotnetRoot}'`);
    expect([first.exitCode, second.exitCode, sh.exitCode, ps1.exitCode]).toEqual([0, 0, 0, 0]);
  });

  test.concurrent("bun:dotnet exposes info, env and resolve", async () => {
    using dir = layout();
    const env = fakeEnv(join(String(dir), "root"), join(String(dir), "cache"));
    const script = `import { info, env, resolve } from "bun:dotnet";
console.log(JSON.stringify([
  info().sdk.selected.version,
  env().sdk.version,
  resolve(undefined, "pinned").sdk.version,
  resolve("app/app.runtimeconfig.json").frameworks[0].resolved.version,
]));`;
    await using proc = Bun.spawn({
      cmd: [bunExe(), "-e", script],
      env,
      cwd: String(dir),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual(["10.0.200", "10.0.200", "10.0.105", "10.0.3"]);
    expect(exitCode).toBe(0);
  });

  test.concurrent("setup downloads, checks sha512 and extracts", async () => {
    using dir = tempDir("bun-dotnet-setup", {});
    const archive = await new Bun.Archive(
      {
        "LICENSE.txt": "MIT",
        [`host/fxr/10.0.3/${hostfxr}`]: "fxr",
        "shared/Microsoft.NETCore.App/10.0.3/Microsoft.NETCore.App.deps.json": "{}",
      },
      { compress: "gzip" },
    ).bytes();
    const hash = new Bun.CryptoHasher("sha512").update(archive).digest("hex");
    const rids = ["win-x64", "win-arm64", "linux-x64", "linux-arm64", "linux-musl-x64", "linux-musl-arm64", "osx-x64", "osx-arm64"];
    const files = (version: string, sha: string) =>
      rids.map(rid => ({
        name: `dotnet-runtime-${rid}.${rid.startsWith("win") ? "zip" : "tar.gz"}`,
        rid,
        url: `${server.url}runtime-${version}`,
        hash: sha.toUpperCase(),
      }));
    await using server = Bun.serve({
      port: 0,
      fetch(req) {
        const { pathname } = new URL(req.url);
        if (pathname === "/releases-index.json") {
          return Response.json({
            "releases-index": [
              {
                "channel-version": "10.0",
                "release-type": "lts",
                "support-phase": "active",
                "releases.json": `${server.url}10.0/releases.json`,
              },
            ],
          });
        }
        if (pathname === "/10.0/releases.json") {
          return Response.json({
            releases: [
              { "release-version": "10.0.3", runtime: { version: "10.0.3", files: files("10.0.3", hash) } },
              { "release-version": "10.0.2", runtime: { version: "10.0.2", files: files("10.0.2", "00".repeat(64)) } },
            ],
          });
        }
        if (pathname.startsWith("/runtime-")) return new Response(archive);
        return new Response("not found", { status: 404 });
      },
    });
    const installDir = join(String(dir), "dotnet");
    const env = { ...bunEnv, BUN_DOTNET_FEED: server.url.href.replace(/\/$/, ""), NO_PROXY: "*", no_proxy: "*" };
    const args = ["setup", "--runtime", "dotnet", "--channel", "LTS", "--install-dir", installDir, "--json"];
    const first = await bunDotnet(args, env);
    const second = await bunDotnet(args, env);
    const tampered = await bunDotnet([...args, "--version", "10.0.2"], env);
    expect(JSON.parse(first.stdout)).toMatchObject({
      product: "dotnet",
      version: "10.0.3",
      sha512: hash,
      status: "installed",
    });
    expect(readFileSync(join(installDir, "host", "fxr", "10.0.3", hostfxr), "utf8")).toBe("fxr");
    expect(
      existsSync(join(installDir, "shared", "Microsoft.NETCore.App", "10.0.3", "Microsoft.NETCore.App.deps.json")),
    ).toBe(true);
    expect(JSON.parse(second.stdout).status).toBe("already installed");
    expect(tampered.stderr).toContain("integrity check failed");
    expect([first.exitCode, second.exitCode, tampered.exitCode]).toEqual([0, 0, 1]);
  });
});
