import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const sources = {
  powershell: join(root, "vendor", "powershell"),
  roslyn: join(root, "vendor", "roslyn"),
  terminal: join(root, "vendor", "windows-terminal"),
  vcpkg: join(root, "vendor", "vcpkg"),
} as const;
export type WindowsSource = keyof typeof sources;

export function buildCommand(name: WindowsSource): string[] {
  switch (name) {
    case "vcpkg":
      return ["cmd.exe", "/d", "/s", "/c", join(sources.vcpkg, "bootstrap-vcpkg.bat"), "-disableMetrics"];
    case "roslyn":
      return [
        process.execPath,
        "dotnet",
        "build",
        join(sources.roslyn, "src", "LanguageServer", "roslyn-language-server", "roslyn-language-server.csproj"),
        "-c",
        "Release",
      ];
    case "powershell":
      return [
        "pwsh",
        "-NoLogo",
        "-NoProfile",
        "-Command",
        "Import-Module ./build.psm1; Start-PSBuild -PSModuleRestore -UseNuGetOrg",
      ];
    case "terminal":
      return [
        process.execPath,
        "msvc",
        "exec",
        "--",
        "msbuild",
        join(sources.terminal, "OpenConsole.slnx"),
        "/restore",
        "/m:1",
        "/p:Configuration=Release",
        "/p:Platform=x64",
      ];
  }
}

async function main(args: string[]) {
  const [command = "status", component, ...rest] = args;
  if (command === "status") {
    for (const [name, path] of Object.entries(sources)) {
      console.log(`${existsSync(path) ? "ready" : "missing"}\t${name}\t${path}`);
    }
    return;
  }
  if (command !== "build" || !component || !(component in sources)) {
    throw new Error("usage: bun scripts/aphrody/windows-suite.ts status | build <powershell|roslyn|terminal|vcpkg> [--dry-run]");
  }
  const name = component as WindowsSource;
  const cmd = buildCommand(name);
  if (rest.includes("--dry-run")) {
    console.log(JSON.stringify({ component: name, cwd: sources[name], cmd }));
    return;
  }
  const env = { ...process.env };
  if (name === "roslyn") {
    const dotnet = (await import("bun:dotnet")).default;
    const report = dotnet.info(sources.roslyn);
    const requested = report.sdk?.requested;
    const install = report.installs.find(candidate => requested && candidate.sdks.includes(requested));
    if (install?.muxer) {
      env.DOTNET_ROOT = install.root;
      env.DOTNET_HOST_PATH = install.muxer;
      env.PATH = `${install.root};${env.PATH ?? ""}`;
    }
    env.DOTNET_CLI_TELEMETRY_OPTOUT = "1";
  }
  const proc = Bun.spawn({ cmd, cwd: sources[name], env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  process.exitCode = await proc.exited;
}

if (import.meta.main) await main(process.argv.slice(2));
