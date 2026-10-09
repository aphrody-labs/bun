// Hardcoded module "bun:dotnet"
//
// .NET 10 hosted in the Bun process. The native side (src/runtime/dotnet/, crate
// packages/bun-dotnet-native) locates the install, starts the CLR through hostfxr and
// returns [UnmanagedCallersOnly] / delegate entry points; the object model (types,
// statics, instances, Task -> Promise, delegates, events, .d.ts generation) is
// node-api-dotnet, shipped by @aphrody/bun-dotnet (packages/bun-dotnet).
const { validateString, validateObject, validateArray } = require("internal/validators");

const locateNative = $newRustFunction("dotnet/host.rs", "jsLocate", 1);
const initializeNative = $newRustFunction("dotnet/host.rs", "jsInitialize", 1);
const functionPointerNative = $newRustFunction("dotnet/host.rs", "jsFunctionPointer", 4);
const loadAssemblyNative = $newRustFunction("dotnet/host.rs", "jsLoadAssembly", 1);
const runtimeConfigNative = $newRustFunction("dotnet/host.rs", "jsRuntimeConfig", 0);
const infoNative = $newRustFunction("dotnet/host.rs", "jsInfo", 1);
const envNative = $newRustFunction("dotnet/host.rs", "jsEnv", 2);
const resolveNative = $newRustFunction("dotnet/host.rs", "jsResolve", 2);

const TARGET_FRAMEWORKS = ["net10.0", "net9.0", "net8.0", "net472"];

function optionalString(value, name) {
  if (value !== undefined && value !== null) validateString(value, name);
  return value ?? undefined;
}

function locate(dotnetRoot) {
  return JSON.parse(locateNative(optionalString(dotnetRoot, "dotnetRoot")));
}

function info(cwd) {
  return JSON.parse(infoNative(optionalString(cwd, "cwd")));
}

function env(cwd, refresh = false) {
  return JSON.parse(envNative(optionalString(cwd, "cwd"), !!refresh));
}

function resolve(runtimeConfig, cwd) {
  runtimeConfig = optionalString(runtimeConfig, "runtimeConfig");
  if (runtimeConfig !== undefined) runtimeConfig = require("node:path").resolve(runtimeConfig);
  return JSON.parse(resolveNative(runtimeConfig, optionalString(cwd, "cwd")));
}

function initialize(runtimeConfig) {
  return initializeNative(optionalString(runtimeConfig, "runtimeConfig"));
}

function runtimeConfig() {
  return runtimeConfigNative();
}

function functionPointer(options) {
  validateObject(options, "options");
  validateString(options.type, "options.type");
  validateString(options.method, "options.method");
  return functionPointerNative(
    optionalString(options.assembly, "options.assembly"),
    options.type,
    options.method,
    optionalString(options.delegateType, "options.delegateType"),
  );
}

function unmanaged(options, signature = {}) {
  validateObject(signature, "signature");
  const { args, returns } = signature;
  if (args !== undefined) validateArray(args, "signature.args");
  const { CFunction } = require("bun:ffi");
  return CFunction({ args: args ?? [], returns: returns ?? "void", ptr: functionPointer(options) });
}

function loadAssembly(assemblyPath) {
  validateString(assemblyPath, "assemblyPath");
  loadAssemblyNative(require("node:path").resolve(assemblyPath));
}

function resolveFrom(specifier) {
  const path = require("node:path");
  const bases = [path.join(process.cwd(), "noop.js")];
  const main = Bun.main;
  if (typeof main === "string" && path.isAbsolute(main)) bases.push(main);
  for (const base of bases) {
    try {
      return Bun.resolveSync(specifier, base);
    } catch {}
  }
  return undefined;
}

function notFound(what) {
  const error = new Error(
    `bun:dotnet: ${what} not found. Install @aphrody/bun-dotnet (bun add @aphrody/bun-dotnet) or set BUN_DOTNET_NODE_API to its dotnet/out/pkg directory`,
  );
  error.code = "ERR_BUN_DOTNET_NODE_API_NOT_FOUND";
  return error;
}

// Directory holding node-api-dotnet/ and node-api-dotnet-generator/.
function packageOutput() {
  const { existsSync } = require("node:fs");
  const path = require("node:path");
  const explicit = process.env.BUN_DOTNET_NODE_API;
  if (explicit) {
    const root = path.resolve(explicit);
    return existsSync(path.join(root, "node-api-dotnet")) ? root : path.dirname(root);
  }
  const bunDotnet = resolveFrom("@aphrody/bun-dotnet/package.json");
  if (bunDotnet !== undefined) return path.join(path.dirname(bunDotnet), "dotnet", "out", "pkg");
  const nodeApi = resolveFrom("node-api-dotnet/package.json");
  if (nodeApi !== undefined) return path.dirname(path.dirname(nodeApi));
  return undefined;
}

function nodeApiModule(relative, what) {
  const path = require("node:path");
  const output = packageOutput();
  const file = output === undefined ? undefined : path.join(output, relative);
  if (file === undefined || !require("node:fs").existsSync(file)) throw notFound(what);
  return file;
}

function validateFramework(targetFramework) {
  if (!TARGET_FRAMEWORKS.includes(targetFramework)) {
    throw $ERR_INVALID_ARG_VALUE("targetFramework", targetFramework, `must be one of ${TARGET_FRAMEWORKS.join(", ")}`);
  }
}

let hostModule;
function host(targetFramework = "net10.0") {
  validateFramework(targetFramework);
  if (hostModule !== undefined) return hostModule;
  const file = nodeApiModule(require("node:path").join("node-api-dotnet", `${targetFramework}.js`), "node-api-dotnet");
  hostModule = require("node:module").createRequire(file)(file);
  return hostModule;
}

function load(assembly, targetFramework) {
  validateString(assembly, "assembly");
  const dotnet = host(targetFramework);
  const path = require("node:path");
  dotnet.load(path.isAbsolute(assembly) || !/[\\/]|\.dll$/i.test(assembly) ? assembly : path.resolve(assembly));
  return dotnet;
}

function addAssemblyResolver(listener) {
  host().addListener("resolving", listener);
}

function removeAssemblyResolver(listener) {
  host().removeListener("resolving", listener);
}

async function spawnCollect(cmd, options = {}) {
  validateObject(options, "options");
  const env = { ...(options.env ?? process.env), BUN_BE_BUN: "1" };
  const proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    env,
    signal: options.signal,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

function dotnet(args, options) {
  validateArray(args, "args");
  return spawnCollect([process.execPath, "dotnet", ...args], options);
}

function generateTypes(options) {
  validateObject(options, "options");
  const assemblies = Array.isArray(options.assembly) ? options.assembly : [options.assembly];
  for (const assembly of assemblies) validateString(assembly, "options.assembly");
  validateString(options.output, "options.output");
  const framework = options.framework ?? "net10.0";
  validateFramework(framework);
  const args = ["-a", assemblies.join(";"), "-t", options.output, "-f", framework];
  const { references, module } = options;
  if (references?.length) args.push("-r", references.join(";"));
  if (module) args.push("-m", module);
  const generator = nodeApiModule(
    require("node:path").join("node-api-dotnet-generator", "index.js"),
    "node-api-dotnet-generator",
  );
  return spawnCollect([process.execPath, generator, ...args], options);
}

export default {
  locate,
  info,
  env,
  resolve,
  initialize,
  runtimeConfig,
  functionPointer,
  unmanaged,
  loadAssembly,
  host,
  load,
  addAssemblyResolver,
  removeAssemblyResolver,
  dotnet,
  build: (args = [], options) => dotnet(["build", ...args], options),
  run: (args = [], options) => dotnet(["run", ...args], options),
  newProject: (args = [], options) => dotnet(["new", ...args], options),
  test: (args = [], options) => dotnet(["test", ...args], options),
  generateTypes,
};
