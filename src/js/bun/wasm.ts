// Hardcoded module "bun:wasm"
//
// Rust crate -> WebAssembly ES module, the job of wasm-pack: cargo build for a wasm32 target,
// wasm-bindgen (the version Cargo.lock pins), wasm-opt, then a package with .js and .d.ts.
// `bun wasm build`, `bun build --target=wasm` (src/js/eval/toolchain.ts) and `plugin()` (imports of
// Cargo.toml and .rs files) all go through `build()`. Tools are found on PATH, else installed once
// into $BUN_INSTALL/tools (wasm-bindgen with cargo, wasm-opt and jco with `bun x`).
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// Pinned fallbacks when the tool is not on PATH. jco transpiles WASI preview 2 components.
const BINARYEN_VERSION = "132.0.0";
const JCO_VERSION = "1.37.0";

const TRIPLES = {
  "unknown": "wasm32-unknown-unknown",
  "p1": "wasm32-wasip1",
  "p2": "wasm32-wasip2",
};

// Never --all-features: stringref/GC imports break JavaScriptCore (Bun/Safari) and older engines.
const WASM_OPT_FEATURES = [
  "--enable-bulk-memory",
  "--enable-nontrapping-float-to-int",
  "--enable-sign-ext",
  "--enable-mutable-globals",
  "--enable-multivalue",
  "--enable-reference-types",
];

const BINDGEN_TARGETS = ["web", "bundler", "nodejs", "deno", "no-modules", "experimental-nodejs-module"];

function exe(name) {
  return process.platform === "win32" ? name + ".exe" : name;
}

function toolsDir() {
  const env = process.env;
  if (env.BUN_WASM_TOOLS_DIR) return env.BUN_WASM_TOOLS_DIR;
  return path.join(env.BUN_INSTALL || path.join(os.homedir(), ".bun"), "tools");
}

async function run(cmd, options = {}) {
  const proc = Bun.spawn({
    cmd,
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdin: "ignore",
    stdout: options.inherit ? "inherit" : "pipe",
    stderr: options.inherit ? "inherit" : "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    options.inherit ? "" : proc.stdout.text(),
    options.inherit ? "" : proc.stderr.text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function checked(cmd, options = {}) {
  let result;
  try {
    result = await run(cmd, options);
  } catch (error) {
    throw new Error(`${cmd[0]} could not be started: ${error?.message ?? error}`);
  }
  if (result.exitCode !== 0) {
    const output = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `${path.basename(cmd[0])} ${cmd[1] ?? ""} failed (exit ${result.exitCode})${output ? "\n" + output : ""}`,
    );
  }
  return result;
}

async function versionOf(bin) {
  try {
    const result = await run([bin, "--version"]);
    return result.exitCode === 0 ? result.stdout.trim() : undefined;
  } catch {
    return undefined;
  }
}

// The directory with Cargo.toml for a crate directory, a Cargo.toml or a .rs file in the crate.
function findManifest(input) {
  let at = path.resolve(input);
  if (path.basename(at) === "Cargo.toml") {
    if (!fs.existsSync(at)) throw new Error(`${at} does not exist`);
    return at;
  }
  let stat;
  try {
    stat = fs.statSync(at);
  } catch {
    throw new Error(`${at} does not exist`);
  }
  if (!stat.isDirectory()) at = path.dirname(at);
  for (;;) {
    const manifest = path.join(at, "Cargo.toml");
    if (fs.existsSync(manifest)) return manifest;
    const parent = path.dirname(at);
    if (parent === at) throw new Error(`No Cargo.toml in ${path.resolve(input)} or above it`);
    at = parent;
  }
}

// `name` selects a member of the workspace of `manifest`; otherwise the package of `manifest` itself.
async function metadata(manifest, name) {
  const { stdout } = await checked([
    "cargo",
    "metadata",
    "--format-version",
    "1",
    "--no-deps",
    "--manifest-path",
    manifest,
  ]);
  const meta = JSON.parse(stdout);
  const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  const pkg = name ? meta.packages.find(p => p.name === name) : meta.packages.find(p => same(p.manifest_path, manifest));
  if (!pkg && name) throw new Error(`${name} is not a package of the workspace ${meta.workspace_root}`);
  if (!pkg) throw new Error(`${manifest} is a virtual workspace manifest: point at a member crate or pass package`);
  const lib = pkg.targets.find(t => t.kind.includes("cdylib"));
  if (!lib) {
    throw new Error(`${pkg.name} has no cdylib target: add [lib] crate-type = ["cdylib"] to ${manifest}`);
  }
  return {
    name: pkg.name,
    manifestPath: pkg.manifest_path,
    version: pkg.version,
    description: pkg.description ?? undefined,
    license: pkg.license ?? undefined,
    libName: lib.name.replaceAll("-", "_"),
    usesBindgen: pkg.dependencies.some(d => d.name === "wasm-bindgen" && d.kind !== "dev"),
    workspaceRoot: meta.workspace_root,
    targetDirectory: meta.target_directory,
  };
}

function pinnedBindgen(workspaceRoot) {
  let lock;
  try {
    lock = fs.readFileSync(path.join(workspaceRoot, "Cargo.lock"), "utf8");
  } catch {
    return undefined;
  }
  return /name = "wasm-bindgen"\r?\nversion = "([^"]+)"/.exec(lock)?.[1];
}

async function ensureTarget(triple) {
  const installed = await run(["rustup", "target", "list", "--installed"]).catch(() => undefined);
  if (!installed || installed.exitCode !== 0) return;
  if (installed.stdout.split(/\r?\n/).includes(triple)) return;
  await checked(["rustup", "target", "add", triple], { inherit: true });
}

// wasm-bindgen must be the exact version of the crate's wasm-bindgen dependency.
async function resolveBindgen(version) {
  const wanted = `wasm-bindgen ${version}`;
  const override = process.env.BUN_WASM_BINDGEN;
  if (override) {
    if ((await versionOf(override)) !== wanted) throw new Error(`BUN_WASM_BINDGEN is not ${wanted}`);
    return override;
  }
  const onPath = Bun.which("wasm-bindgen");
  if (onPath && (await versionOf(onPath)) === wanted) return onPath;
  const root = path.join(toolsDir(), `wasm-bindgen-${version}`);
  const cached = path.join(root, "bin", exe("wasm-bindgen"));
  if ((await versionOf(cached)) === wanted) return cached;
  if (Bun.which("cargo-binstall")) {
    await checked(
      [
        "cargo",
        "binstall",
        "--no-confirm",
        "--locked",
        "--version",
        version,
        "--install-path",
        path.join(root, "bin"),
        "wasm-bindgen-cli",
      ],
      { inherit: true },
    );
  } else {
    await checked(["cargo", "install", "--locked", "--version", `=${version}`, "--root", root, "wasm-bindgen-cli"], {
      inherit: true,
    });
  }
  if ((await versionOf(cached)) !== wanted) throw new Error(`${wanted} (Cargo.lock) could not be installed`);
  return cached;
}

// wasm-opt from PATH, else binaryen's own npm package (wasm-opt compiled to wasm) through `bun x`.
function wasmOptCommand() {
  const override = process.env.BUN_WASM_OPT;
  if (override) return [override];
  const onPath = Bun.which("wasm-opt");
  if (onPath) return [onPath];
  return [process.execPath, "x", "--bun", "--package", `binaryen@${BINARYEN_VERSION}`, "wasm-opt"];
}

/** Optimize `input` into `output` (in place when omitted). Keeps the input if wasm-opt makes it larger. */
async function optimize(input, options = {}) {
  const output = options.output ?? input;
  const level = options.level ?? "Oz";
  if (!/^O[0-4sz]?$/.test(level)) throw new Error(`Unknown wasm-opt level -${level}`);
  const temp = `${output}.bun-opt-${process.pid}.wasm`;
  const flags = [`-${level}`, "--converge", ...WASM_OPT_FEATURES];
  if (options.debug !== true) flags.push("--strip-debug", "--strip-producers");
  try {
    await checked([...wasmOptCommand(), ...flags, input, "-o", temp]);
    const optimized = fs.readFileSync(temp);
    if (!WebAssembly.validate(optimized)) throw new Error("wasm-opt produced an invalid module");
    const before = fs.statSync(input).size;
    if (optimized.byteLength <= before) {
      fs.renameSync(temp, output);
    } else if (output !== input) {
      fs.copyFileSync(input, output);
    }
    return { before, after: Math.min(before, optimized.byteLength) };
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function rawLoader(name, wasi) {
  if (wasi) {
    return {
      js: `const { WASI } = process.getBuiltinModule("node:wasi");

const url = new URL("./${name}.wasm", import.meta.url);

/** Instantiates the WASI preview 1 module; a reactor's _initialize runs, a command's _start does not. */
export default async function init(options = {}) {
  const wasi = new WASI({ version: "preview1", args: options.args ?? [], env: options.env ?? {}, preopens: options.preopens ?? {} });
  const bytes = await (await fetch(url)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, { ...options.imports, ...wasi.getImportObject() });
  if (typeof instance.exports._initialize === "function") wasi.initialize(instance);
  return { instance, exports: instance.exports, wasi };
}
`,
      dts: `export interface InitOptions {
  args?: string[];
  env?: Record<string, string>;
  preopens?: Record<string, string>;
  imports?: WebAssembly.Imports;
}
export default function init(options?: InitOptions): Promise<{
  instance: WebAssembly.Instance;
  exports: WebAssembly.Exports;
  wasi: import("node:wasi").WASI;
}>;
`,
    };
  }
  return {
    js: `const url = new URL("./${name}.wasm", import.meta.url);

/** Instantiates the module and returns its exports. */
export default async function init(imports = {}) {
  const bytes = await (await fetch(url)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, imports);
  return instance.exports;
}
`,
    dts: `export default function init(imports?: WebAssembly.Imports): Promise<WebAssembly.Exports>;
`,
  };
}

function hashFile(file, extra) {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(fs.readFileSync(file));
  hasher.update(extra);
  return hasher.digest("hex");
}

/**
 * Build the crate at `options.crate` (a directory, Cargo.toml or .rs file) into `options.outdir`.
 * The package is staged next to `outdir` and renamed into place only once it is complete and valid.
 */
async function build(options = {}) {
  if (typeof options !== "object" || options === null) throw $ERR_INVALID_ARG_TYPE("options", "object", options);
  const meta = await metadata(findManifest(options.crate ?? process.cwd()), options.package);
  const manifest = meta.manifestPath;
  const crateDir = path.dirname(manifest);
  const wasi = options.wasi ?? undefined;
  if (wasi !== undefined && wasi !== "p1" && wasi !== "p2") throw new Error(`wasi must be "p1" or "p2", got ${wasi}`);
  const triple = options.triple ?? TRIPLES[wasi ?? "unknown"];
  const profile = options.profile ?? "release";
  const profileDir = profile === "dev" ? "debug" : profile;
  const name = options.name ?? meta.libName;
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`Invalid output name ${name}`);
  const target = options.target ?? "web";
  if (!BINDGEN_TARGETS.includes(target)) throw new Error(`target must be one of ${BINDGEN_TARGETS.join(", ")}`);
  const outdir = path.resolve(options.outdir ?? path.join(crateDir, "pkg"));
  if (outdir === path.parse(outdir).root || crateDir.startsWith(outdir + path.sep) || outdir === crateDir) {
    throw new Error(`outdir ${outdir} must be a package directory, not the crate or one of its parents`);
  }
  const log = options.quiet ? () => {} : msg => process.stderr.write(msg + "\n");

  if (options.cargo !== false && !options.artifact) {
    await ensureTarget(triple);
    const cargo = ["cargo", "build", "--lib", "--manifest-path", manifest, "--target", triple];
    if (profile === "release") cargo.push("--release");
    else if (profile !== "dev") cargo.push("--profile", profile);
    if (options.features?.length) cargo.push("--features", options.features.join(","));
    if (options.noDefaultFeatures) cargo.push("--no-default-features");
    if (options.locked) cargo.push("--locked");
    if (options.cargoArgs?.length) cargo.push(...options.cargoArgs);
    await checked(cargo, { cwd: crateDir, inherit: !options.quiet });
  }
  const artifact = options.artifact
    ? path.resolve(options.artifact)
    : path.join(meta.targetDirectory, triple, profileDir, `${meta.libName}.wasm`);
  if (!fs.existsSync(artifact)) throw new Error(`cargo did not produce ${artifact}`);

  const bindgen = triple === TRIPLES.unknown && meta.usesBindgen && options.bindgen !== false;
  const component = triple === TRIPLES.p2;
  // wasm-opt does not read components; `jco opt` would.
  let optimizeLevel = typeof options.optimize === "string" ? options.optimize : "Oz";
  if (options.optimize === false || component || (options.optimize === undefined && profile === "dev")) {
    optimizeLevel = undefined;
  }
  const typescript = options.typescript !== false;
  const key = hashFile(
    artifact,
    JSON.stringify([name, target, triple, optimizeLevel, typescript, bindgen, Bun.version]),
  );
  const keyFile = path.join(outdir, ".bun-wasm");
  if (options.cache && fs.existsSync(keyFile) && fs.readFileSync(keyFile, "utf8") === key) {
    return result(outdir, name, bindgen, component, true);
  }

  fs.mkdirSync(path.dirname(outdir), { recursive: true });
  const stage = fs.mkdtempSync(path.join(path.dirname(outdir), `.${path.basename(outdir)}-stage-`));
  try {
    let wasmFile;
    if (bindgen) {
      const version = pinnedBindgen(meta.workspaceRoot);
      if (!version) throw new Error(`wasm-bindgen is not in ${path.join(meta.workspaceRoot, "Cargo.lock")}`);
      const tool = await resolveBindgen(version);
      const args = [tool, "--target", target, "--out-dir", stage, "--out-name", name];
      if (!typescript) args.push("--no-typescript");
      if (profile === "dev") args.push("--debug", "--keep-debug");
      args.push(artifact);
      await checked(args);
      wasmFile = path.join(stage, `${name}_bg.wasm`);
    } else if (component) {
      wasmFile = path.join(stage, `${name}.component.wasm`);
      fs.copyFileSync(artifact, wasmFile);
    } else {
      wasmFile = path.join(stage, `${name}.wasm`);
      fs.copyFileSync(artifact, wasmFile);
      const loader = rawLoader(name, wasi === "p1");
      fs.writeFileSync(path.join(stage, `${name}.js`), loader.js);
      if (typescript) fs.writeFileSync(path.join(stage, `${name}.d.ts`), loader.dts);
    }
    const rawBytes = fs.statSync(wasmFile).size;
    if (optimizeLevel) {
      const { after } = await optimize(wasmFile, { level: optimizeLevel });
      log(`wasm-opt -${optimizeLevel}: ${rawBytes} -> ${after} bytes`);
    }
    if (component) {
      const jco = process.env.BUN_JCO
        ? [process.env.BUN_JCO]
        : [process.execPath, "x", "--bun", `@bytecodealliance/jco@${JCO_VERSION}`];
      await checked([...jco, "transpile", wasmFile, "--name", name, "--out-dir", stage]);
    } else if (!WebAssembly.validate(fs.readFileSync(wasmFile))) {
      throw new Error(`${wasmFile} is not a valid WebAssembly module`);
    }
    const bytes = fs.statSync(wasmFile).size;
    if (options.maxBytes && bytes > options.maxBytes) {
      throw new Error(`${name}: ${bytes} bytes is over maxBytes ${options.maxBytes}`);
    }
    if (options.packageJson !== false) {
      const files = fs.readdirSync(stage).filter(f => f !== "package.json");
      const pkg = {
        name: options.packageName ?? meta.name,
        version: meta.version,
        description: meta.description,
        license: meta.license,
        type: "module",
        main: `${name}.js`,
        types: typescript ? `${name}.d.ts` : undefined,
        files,
        sideEffects: target === "bundler" ? [`./${name}.js`, `./snippets/*`] : undefined,
      };
      fs.writeFileSync(path.join(stage, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    }
    fs.writeFileSync(path.join(stage, ".bun-wasm"), key);

    const previous = `${stage}-previous`;
    let backedUp = false;
    try {
      fs.renameSync(outdir, previous);
      backedUp = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    try {
      fs.renameSync(stage, outdir);
    } catch (error) {
      if (backedUp) fs.renameSync(previous, outdir);
      throw error;
    }
    if (backedUp) fs.rmSync(previous, { recursive: true, force: true });
    return { ...result(outdir, name, bindgen, component, false), rawBytes, bytes };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

function result(outdir, name, bindgen, component, cached) {
  const wasm = path.join(outdir, bindgen ? `${name}_bg.wasm` : component ? `${name}.component.wasm` : `${name}.wasm`);
  const js = path.join(outdir, `${name}.js`);
  const dts = path.join(outdir, `${name}.d.ts`);
  return { outdir, wasm, js, dts: fs.existsSync(dts) ? dts : undefined, cached, bytes: fs.statSync(wasm).size };
}

/**
 * A Bun plugin that builds the crate when a module imports its `Cargo.toml` or one of its `.rs` files
 * (cached in its Cargo target directory) and loads the generated module.
 */
function plugin(options = {}) {
  return {
    name: "bun:wasm",
    setup(builder) {
      builder.onLoad({ filter: /(^|[\\/])Cargo\.toml$|\.rs$/ }, async args => {
        const manifest = findManifest(args.path);
        const meta = await metadata(manifest);
        const triple = options.triple ?? TRIPLES[options.wasi ?? "unknown"];
        const outdir = path.join(
          meta.targetDirectory,
          "bun-wasm",
          `${meta.libName}-${triple}-${options.profile ?? "release"}`,
        );
        const built = await build({
          ...options,
          crate: manifest,
          outdir,
          packageJson: false,
          cache: true,
          quiet: options.quiet ?? true,
        });
        const js = JSON.stringify(built.js);
        return { contents: `export * from ${js};\nexport { default } from ${js};\n`, loader: "js" };
      });
    },
  };
}

export default {
  build,
  optimize,
  plugin,
};
