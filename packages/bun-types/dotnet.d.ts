/**
 * .NET 10 hosted in the Bun process.
 *
 * The low-level half (`locate`, `initialize`, `functionPointer`, `unmanaged`, `loadAssembly`)
 * runs in Bun's native code through `hostfxr`: it finds the install (`DOTNET_ROOT`, the
 * registered install location, `PATH`), starts the CLR once per process and returns
 * `[UnmanagedCallersOnly]` or delegate entry points callable through `bun:ffi`.
 *
 * The object model (`host`, `load`, `generateTypes`) is node-api-dotnet, shipped by
 * `@aphrody/bun-dotnet` (or the directory named by `BUN_DOTNET_NODE_API`): .NET namespaces
 * become JS properties, `Task` becomes `Promise`, delegates and events map to functions.
 *
 * Only one CLR can run in a process: once it has started, `bun dotnet …` must run in a
 * separate process (`dotnet()` spawns one).
 *
 * @example
 * ```ts
 * import dotnet from "bun:dotnet";
 *
 * const add = dotnet.unmanaged(
 *   { assembly: "./bin/Native.dll", type: "Native.Exports, Native", method: "Add" },
 *   { args: ["i32", "i32"], returns: "i32" },
 * );
 * add(2, 3); // 5
 * ```
 */
declare module "bun:dotnet" {
  type FFITypeOrString = import("bun:ffi").FFITypeOrString;

  export type TargetFramework = "net10.0" | "net9.0" | "net8.0" | "net472";

  /** Where the .NET install was found. */
  export interface DotnetLocation {
    dotnetRoot: string;
    hostfxr: string;
    /** How it was found: `"explicit"`, `"DOTNET_ROOT"`, `"registry"`, `"PATH"`, … */
    source: string;
    /** `dotnet` / `dotnet.exe` in {@link DotnetLocation.dotnetRoot}, or `null` for a runtime-only layout. */
    muxer: string | null;
    /** Installed SDK versions, ascending. */
    sdks: string[];
    /** Installed `Microsoft.NETCore.App` versions, ascending. */
    runtimes: string[];
  }

  export interface FunctionPointerOptions {
    /** Path of the assembly; omitted, the type must be in an assembly already loaded. */
    assembly?: string;
    /** Assembly-qualified type name, e.g. `"Native.Exports, Native"`. */
    type: string;
    method: string;
    /** Assembly-qualified delegate type; omitted, the method must be `[UnmanagedCallersOnly]`. */
    delegateType?: string;
  }

  export interface UnmanagedSignature {
    args?: FFITypeOrString[];
    returns?: FFITypeOrString;
  }

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
    assembly: string | string[];
    output: string;
    framework?: TargetFramework;
    references?: string[];
    module?: "commonjs" | "esm";
  }

  /** The node-api-dotnet host: loaded namespaces are properties of it. */
  export type DotnetHost = {
    load(assemblyNameOrPath: string): void;
    addListener(event: "resolving", listener: (assemblyName: string, version: string) => void): void;
    removeListener(event: "resolving", listener: (assemblyName: string, version: string) => void): void;
    readonly runtimeVersion: string;
    readonly frameworkMoniker: string;
  } & Record<string, any>;

  /** Finds the .NET install, under `dotnetRoot` when given. Throws `ERR_BUN_DOTNET` when none is found. */
  export function locate(dotnetRoot?: string): DotnetLocation;
  /**
   * Starts the CLR with `runtimeConfig` (a `.runtimeconfig.json`), or with a generated config
   * targeting the newest installed `Microsoft.NETCore.App`. Returns 0 when it started here,
   * 1 or 2 when it was already running.
   */
  export function initialize(runtimeConfig?: string): number;
  /** The `.runtimeconfig.json` the CLR started with, or `null` before it starts. */
  export function runtimeConfig(): string | null;
  /** Native address of a static method; starts the CLR on first use. */
  export function functionPointer(options: FunctionPointerOptions): number;
  /** {@link functionPointer} wrapped as a callable `bun:ffi` function. */
  export function unmanaged<T extends (...args: any[]) => any = (...args: any[]) => any>(
    options: FunctionPointerOptions,
    signature?: UnmanagedSignature,
  ): T;
  /** Loads an assembly into the default load context. */
  export function loadAssembly(assemblyPath: string): void;

  /** The node-api-dotnet host for `targetFramework`; the first call decides the runtime. */
  export function host(targetFramework?: TargetFramework): DotnetHost;
  /** Loads an assembly by path or name; its namespaces become properties of the returned host. */
  export function load(assembly: string, targetFramework?: TargetFramework): DotnetHost;
  export function addAssemblyResolver(listener: (assemblyName: string, version: string) => void): void;
  export function removeAssemblyResolver(listener: (assemblyName: string, version: string) => void): void;
  /** TypeScript declarations for .NET assemblies (node-api-dotnet-generator, run by Bun). */
  export function generateTypes(options: TypeDefinitionOptions): Promise<DotnetCommandResult>;

  /** Runs `bun dotnet <args>` (the in-process .NET muxer) in a child process. */
  export function dotnet(args: string[], options?: DotnetCommandOptions): Promise<DotnetCommandResult>;
  export function build(args?: string[], options?: DotnetCommandOptions): Promise<DotnetCommandResult>;
  export function run(args?: string[], options?: DotnetCommandOptions): Promise<DotnetCommandResult>;
  export function newProject(args?: string[], options?: DotnetCommandOptions): Promise<DotnetCommandResult>;
  export function test(args?: string[], options?: DotnetCommandOptions): Promise<DotnetCommandResult>;

  const dotnetModule: {
    locate: typeof locate;
    initialize: typeof initialize;
    runtimeConfig: typeof runtimeConfig;
    functionPointer: typeof functionPointer;
    unmanaged: typeof unmanaged;
    loadAssembly: typeof loadAssembly;
    host: typeof host;
    load: typeof load;
    addAssemblyResolver: typeof addAssemblyResolver;
    removeAssemblyResolver: typeof removeAssemblyResolver;
    generateTypes: typeof generateTypes;
    dotnet: typeof dotnet;
    build: typeof build;
    run: typeof run;
    newProject: typeof newProject;
    test: typeof test;
  };
  export default dotnetModule;
}
declare module "csjs:dotnet" {
  export * from "bun:dotnet";
  export { default } from "bun:dotnet";
}
