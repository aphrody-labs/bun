// Artifact emission uses the TypeScript SDK; source checking belongs to `bun check`.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type * as TypeScript from "typescript";

export function loadEmissionSdk(): typeof TypeScript {
  const owner = createRequire(import.meta.url);
  const expected = owner("../../package.json").devDependencies.typescript;
  const metadataPath = owner.resolve("typescript/package.json");
  const metadata = owner(metadataPath);
  if (metadata.version !== expected) {
    throw new Error(
      `TypeScript emission SDK mismatch: expected ${expected}, found ${metadata.version} at ${metadataPath}`,
    );
  }
  const sdk = owner("typescript");
  if (sdk.version !== expected) {
    throw new Error(`TypeScript emission SDK mismatch: expected ${expected}, loaded ${sdk.version}`);
  }
  for (const name of [
    "parseCommandLine",
    "getParsedCommandLineOfConfigFile",
    "createProgram",
    "createCompilerHost",
    "createIncrementalProgram",
    "createSolutionBuilder",
    "createWatchCompilerHost",
  ]) {
    if (typeof sdk[name] !== "function") throw new Error(`TypeScript ${expected} emission SDK is missing ${name}`);
  }
  if (!sdk.sys) throw new Error(`TypeScript ${expected} emission SDK is missing its filesystem host`);
  return sdk;
}

export function emitTypeScript(args: string[], cwd = process.cwd(), sdk?: typeof TypeScript): number | undefined {
  args = args.filter(arg => arg !== "--singleThreaded");
  const ts = sdk ?? loadEmissionSdk();
  const system = { ...ts.sys, getCurrentDirectory: () => cwd };
  const report = (diagnostic: TypeScript.Diagnostic) => {
    process.stderr.write(
      ts.formatDiagnosticsWithColorAndContext([diagnostic], {
        getCurrentDirectory: () => cwd,
        getCanonicalFileName: path => path,
        getNewLine: () => system.newLine,
      }),
    );
  };
  if (args.includes("-b") || args.includes("--build")) {
    const options: TypeScript.BuildOptions = {};
    const projects: string[] = [];
    let watch = false;
    let clean = false;
    for (const arg of args) {
      if (arg === "-b" || arg === "--build") continue;
      if (arg === "-w" || arg === "--watch") watch = true;
      else if (arg === "--clean") clean = true;
      else if (arg === "-v" || arg === "--verbose") options.verbose = true;
      else if (arg === "-f" || arg === "--force") options.force = true;
      else if (arg === "--dry") options.dry = true;
      else if (arg === "--stopBuildOnErrors") options.stopBuildOnErrors = true;
      else if (arg.startsWith("-")) throw new Error(`Unsupported SDK build option: ${arg}`);
      else projects.push(resolve(cwd, arg));
    }
    if (!projects.length) projects.push(resolve(cwd, "tsconfig.json"));
    if (watch && clean) throw new Error("SDK build --clean cannot be combined with --watch");
    const builder = watch
      ? ts.createSolutionBuilderWithWatch(
          ts.createSolutionBuilderWithWatchHost(system, undefined, report),
          projects,
          options,
        )
      : ts.createSolutionBuilder(ts.createSolutionBuilderHost(system, undefined, report), projects, options);
    const status = clean ? builder.clean() : builder.build();
    return watch ? undefined : status;
  }
  let parsed = ts.parseCommandLine(args);
  if (parsed.errors.length) {
    parsed.errors.forEach(report);
    return 2;
  }
  for (const key of ["outDir", "rootDir", "declarationDir", "outFile", "tsBuildInfoFile", "baseUrl"] as const) {
    const value = parsed.options[key];
    if (value) parsed.options[key] = resolve(cwd, value);
  }
  for (const key of ["typeRoots", "rootDirs"] as const) {
    const value = parsed.options[key];
    if (value) parsed.options[key] = value.map(path => resolve(cwd, path));
  }
  const config = parsed.options.project
    ? resolve(cwd, parsed.options.project)
    : parsed.fileNames.length
      ? undefined
      : ts.findConfigFile(cwd, system.fileExists);
  let configFile: string | undefined;
  if (config) {
    const filename = system.directoryExists(config) ? resolve(config, "tsconfig.json") : config;
    configFile = filename;
    const loaded = ts.getParsedCommandLineOfConfigFile(filename, parsed.options, {
      ...system,
      onUnRecoverableConfigFileDiagnostic: report,
    });
    if (!loaded) return 2;
    parsed = loaded;
  } else parsed.fileNames = parsed.fileNames.map(path => resolve(cwd, path));
  if (!parsed.fileNames.length && !parsed.projectReferences?.length) throw new Error("No TypeScript emission inputs");
  if (parsed.errors.length) {
    parsed.errors.forEach(report);
    return 2;
  }
  if (parsed.options.watch) {
    const host = configFile
      ? ts.createWatchCompilerHost(configFile, parsed.options, system, undefined, report)
      : ts.createWatchCompilerHost(
          parsed.fileNames,
          parsed.options,
          system,
          undefined,
          report,
          undefined,
          parsed.projectReferences,
        );
    ts.createWatchProgram(host);
    return;
  }
  const incremental = parsed.options.incremental || parsed.options.composite;
  const host = incremental ? ts.createIncrementalCompilerHost(parsed.options) : ts.createCompilerHost(parsed.options);
  host.getCurrentDirectory = () => cwd;
  const options = {
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
    host,
  };
  const program = incremental ? ts.createIncrementalProgram(options) : ts.createProgram(options);
  const diagnostics = ts.getPreEmitDiagnostics("getProgram" in program ? program.getProgram() : program);
  const emitted = program.emit();
  const all = [...diagnostics, ...emitted.diagnostics];
  all.forEach(report);
  return all.some(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error) ? 1 : 0;
}

if (import.meta.main) {
  try {
    process.exitCode = emitTypeScript(process.argv.slice(2));
  } catch (error) {
    console.error(String(error));
    process.exitCode = 2;
  }
}
