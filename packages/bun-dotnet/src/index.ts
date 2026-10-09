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
  assembly: string;
  output: string;
  references?: string[];
  framework?: string;
}

let runtimePromise: Promise<Record<string, any>> | undefined;

async function runtime(): Promise<Record<string, any>> {
  runtimePromise ??= import("node-api-dotnet/net10.0.js").then(module => module.default ?? module);
  return runtimePromise;
}

export async function loadAssembly(assemblyPath: string): Promise<Record<string, any>> {
  const host = await runtime();
  host.load(assemblyPath);
  return host;
}

export async function dotnet(args: string[], options: DotnetCommandOptions = {}): Promise<DotnetCommandResult> {
  return runCommand("dotnet", args, options);
}

export const build = (args: string[] = [], options?: DotnetCommandOptions) => dotnet(["build", ...args], options);
export const run = (args: string[] = [], options?: DotnetCommandOptions) => dotnet(["run", ...args], options);
export const newProject = (args: string[] = [], options?: DotnetCommandOptions) => dotnet(["new", ...args], options);
export const test = (args: string[] = [], options?: DotnetCommandOptions) => dotnet(["test", ...args], options);

export async function generateTypes(options: TypeDefinitionOptions): Promise<DotnetCommandResult> {
  const args = ["-a", options.assembly, "-t", options.output, "-f", options.framework ?? "net10.0"];
  for (const reference of options.references ?? []) args.push("-r", reference);
  return invokeGenerator(args, options);
}

async function invokeGenerator(args: string[], options: DotnetCommandOptions): Promise<DotnetCommandResult> {
  return runCommand("node-api-dotnet-generator", args, options);
}

async function runCommand(command: string, args: string[], options: DotnetCommandOptions): Promise<DotnetCommandResult> {
  const proc = Bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: options.env,
    signal: options.signal,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

export async function addAssemblyResolver(listener: (...args: any[]) => void): Promise<void> {
  (await runtime()).addListener("resolving", listener);
}

export async function removeAssemblyResolver(listener: (...args: any[]) => void): Promise<void> {
  (await runtime()).removeListener("resolving", listener);
}

export default { loadAssembly, dotnet, build, run, newProject, test, generateTypes, addAssemblyResolver, removeAssemblyResolver };
