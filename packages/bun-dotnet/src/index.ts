/// <reference path="../dotnet/out/pkg/node-api-dotnet/index.d.ts" />
// .NET 10 in Bun through node-api-dotnet (dotnet/, MIT, Copyright (c) Microsoft Corporation).
// `bun run build` packs dotnet/ with `dotnet pack`; the npm packages land in dotnet/out/pkg and
// are loaded from there, so nothing here comes from the npm registry.
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);

export const packageRoot = resolve(import.meta.dir, "..");
/** Output of `dotnet pack` in dotnet/: node-api-dotnet, node-api-dotnet-generator and the NuGet packages. */
export const packageOutput = join(packageRoot, "dotnet", "out", "pkg");

export type TargetFramework = "net10.0" | "net9.0" | "net8.0" | "net472";

/** The node-api-dotnet host: `load`, the `resolving` event, and the loaded namespaces as properties. */
export type DotnetHost = typeof import("node-api-dotnet") & Record<string, any>;

export interface DotnetCommandOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
}

export interface DotnetCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface TypeDefinitionOptions extends DotnetCommandOptions {
  /** Assemblies to describe. */
  assembly: string | string[];
  /** Output .d.ts file. */
  output: string;
  references?: string[];
  framework?: TargetFramework;
  module?: "commonjs" | "esm";
}

/**
 * Loads the CLR (only one version per process) and returns the host. Later calls return the same
 * host; the first call decides the .NET version, which may roll forward to a newer installed one.
 */
export function host(targetFramework: TargetFramework = "net10.0"): DotnetHost {
  return require(join(packageOutput, "node-api-dotnet", `${targetFramework}.js`));
}

/** Loads an assembly by path or name; its namespaces become properties of the returned host. */
export function loadAssembly(assembly: string, targetFramework?: TargetFramework): DotnetHost {
  const dotnet = host(targetFramework);
  dotnet.load(assembly);
  return dotnet;
}

export function addAssemblyResolver(listener: (assemblyName: string, version: string) => void): void {
  host().addListener("resolving", listener);
}

export function removeAssemblyResolver(listener: (assemblyName: string, version: string) => void): void {
  host().removeListener("resolving", listener);
}

/** Runs the `dotnet` CLI. */
export function dotnet(args: string[], options: DotnetCommandOptions = {}): Promise<DotnetCommandResult> {
  return runCommand(["dotnet", ...args], options);
}

export const build = (args: string[] = [], options?: DotnetCommandOptions) => dotnet(["build", ...args], options);
export const run = (args: string[] = [], options?: DotnetCommandOptions) => dotnet(["run", ...args], options);
export const newProject = (args: string[] = [], options?: DotnetCommandOptions) => dotnet(["new", ...args], options);
export const test = (args: string[] = [], options?: DotnetCommandOptions) => dotnet(["test", ...args], options);

/** TypeScript declarations for .NET assemblies, written by node-api-dotnet-generator running in Bun. */
export function generateTypes(options: TypeDefinitionOptions): Promise<DotnetCommandResult> {
  const assemblies = Array.isArray(options.assembly) ? options.assembly : [options.assembly];
  const args = ["-a", assemblies.join(";"), "-t", options.output, "-f", options.framework ?? "net10.0"];
  if (options.references?.length) args.push("-r", options.references.join(";"));
  if (options.module) args.push("-m", options.module);
  const generator = join(packageOutput, "node-api-dotnet-generator", "index.js");
  const env = { ...process.env, ...options.env };
  env.DOTNET_ROLL_FORWARD ??= "Major";
  return runCommand([process.execPath, generator, ...args], { ...options, env });
}

async function runCommand(cmd: string[], options: DotnetCommandOptions): Promise<DotnetCommandResult> {
  await using proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    env: options.env,
    signal: options.signal,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    Bun.readableStreamToText(proc.stdout),
    Bun.readableStreamToText(proc.stderr),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

export default {
  host,
  loadAssembly,
  addAssemblyResolver,
  removeAssemblyResolver,
  dotnet,
  build,
  run,
  newProject,
  test,
  generateTypes,
};
