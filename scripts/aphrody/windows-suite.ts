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
  if (command !== "build" || !(component in sources)) {
    throw new Error("usage: bun scripts/aphrody/windows-suite.ts status | build <powershell|roslyn|terminal|vcpkg> [--dry-run]");
  }
  const name = component as WindowsSource;
  const cmd = buildCommand(name);
  if (rest.includes("--dry-run")) {
    console.log(JSON.stringify({ component: name, cwd: sources[name], cmd }));
    return;
  }
  const proc = Bun.spawn({ cmd, cwd: sources[name], stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  process.exitCode = await proc.exited;
}

if (import.meta.main) await main(process.argv.slice(2));
