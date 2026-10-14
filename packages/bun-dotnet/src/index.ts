/// <reference path="../../bun-types/index.d.ts" />

// The package owns the optional Microsoft node-api-dotnet payload. Bun owns the SDK:
// hosting, resolution, process routing and the public object model stay in bun:dotnet.
import dotnetSdk from "bun:dotnet";
import { join, resolve as resolvePath } from "node:path";

export type {
  DotnetCommandOptions,
  DotnetCommandResult,
  DotnetEnv,
  DotnetHost,
  DotnetInfo,
  DotnetInstall,
  DotnetLocation,
  DotnetResolution,
  FunctionPointerOptions,
  TargetFramework,
  TypeDefinitionOptions,
  UnmanagedSignature,
} from "bun:dotnet";

export const packageRoot = resolvePath(import.meta.dir, "..");
/** Output of `dotnet pack`: node-api-dotnet, its generator and NuGet packages. */
export const packageOutput = join(packageRoot, "dotnet", "out", "pkg");
process.env.BUN_DOTNET_NODE_API ??= packageOutput;

export const locate = dotnetSdk.locate;
export const info = dotnetSdk.info;
export const env = dotnetSdk.env;
export const resolve = dotnetSdk.resolve;
export const initialize = dotnetSdk.initialize;
export const runtimeConfig = dotnetSdk.runtimeConfig;
export const functionPointer = dotnetSdk.functionPointer;
export const unmanaged = dotnetSdk.unmanaged;
/** Compatibility name for the object-model loader historically exposed by this package. */
export const loadAssembly = dotnetSdk.load;
/** Low-level load into the default AssemblyLoadContext without projecting namespaces. */
export const loadNativeAssembly = dotnetSdk.loadAssembly;
export const host = dotnetSdk.host;
export const load = dotnetSdk.load;
export const addAssemblyResolver = dotnetSdk.addAssemblyResolver;
export const removeAssemblyResolver = dotnetSdk.removeAssemblyResolver;
export const dotnet = dotnetSdk.dotnet;
export const build = dotnetSdk.build;
export const run = dotnetSdk.run;
export const newProject = dotnetSdk.newProject;
export const test = dotnetSdk.test;
export const generateTypes = dotnetSdk.generateTypes;

export default { ...dotnetSdk, loadAssembly, loadNativeAssembly };
