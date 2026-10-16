#!/usr/bin/env bun
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { GN_REVISION, verifyGN } from "./vendor-gn";

export { GN_REVISION };
const ROOT = resolve(import.meta.dir, "../..");
const SOURCE = join(ROOT, "vendor", "gn");
const OUTPUT = join(ROOT, "build", "gn");
const HELP = `Usage: bun run gn <command> [options] [-- args...]

  bootstrap    Build the pinned vendored GN and its unit tests incrementally
  exec         Run the built GN with unmodified arguments after --
  verify       Run GN's upstream unit tests and print its version
  doctor       Report GN, native toolchain and selected checkout prerequisites
  plan         Print graph generation and build commands without executing them
  build        Generate and build an already synchronized project checkout

Options:
  --project chromium|v8|skia|chromiumos   Project for plan/doctor
  --checkout <absolute path>             Existing project checkout
  --out <relative directory>             Project output (default out/bun)
  --jobs <1..64>                         Bounded Ninja parallelism (default 4)
  --lto                                 Enable GN bootstrap link-time optimization
  --debug                               Build a debug GN instead of release

Windows commands run through bun msvc exec. Chromium and V8 retain their
checkout's clang-cl, SDK and dependency pins. ChromiumOS needs its Linux SDK
and board build workflow; it cannot be compiled by the Windows MSVC toolchain.
No project checkout, compiler, SDK or dependency is downloaded by this command.
`;

export type Project = "chromium" | "v8" | "skia" | "chromiumos";
export interface Options {
  command: string;
  project?: Project;
  checkout?: string;
  out: string;
  jobs: number;
  lto: boolean;
  debug: boolean;
  rest: string[];
}
export interface Command {
  cwd: string;
  argv: string[];
}

export function parseArguments(argv: string[]): Options {
  const options: Options = {
    command: "help",
    out: "out/bun",
    jobs: 4,
    lto: false,
    debug: false,
    rest: [],
  };
  let commandSet = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      options.rest = argv.slice(i + 1);
      break;
    }
    if (arg === "--help" || arg === "-h") {
      options.command = "help";
      return options;
    }
    if (["--lto", "--debug"].includes(arg)) {
      if (arg === "--lto") options.lto = true;
      if (arg === "--debug") options.debug = true;
      continue;
    }
    if (["--project", "--checkout", "--out", "--jobs"].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      if (arg === "--project") {
        if (!["chromium", "v8", "skia", "chromiumos"].includes(value)) throw new Error(`Unknown project: ${value}`);
        options.project = value as Project;
      }
      if (arg === "--checkout") options.checkout = value;
      if (arg === "--out") options.out = value;
      if (arg === "--jobs") {
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 64) throw new Error("--jobs must be 1..64");
        options.jobs = Number(value);
      }
      continue;
    }
    if (!commandSet && !arg.startsWith("-")) {
      options.command = arg;
      commandSet = true;
    } else {
      throw new Error(`Unknown option: ${arg}; GN arguments follow --`);
    }
  }
  if (!["help", "bootstrap", "exec", "verify", "doctor", "plan", "build"].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}`);
  }
  return options;
}

export function nativeCommand(argv: string[], platform: string, bun = process.execPath): string[] {
  return platform === "win32" ? [bun, "msvc", "exec", "--", ...argv] : argv;
}

export function bootstrapCommands(options: Options, platform: string, root = ROOT, bun = process.execPath): Command[] {
  const source = join(root, "vendor", "gn");
  const output = join(root, "build", "gn");
  const flags = ["--out-path", output];
  if (options.debug) flags.push("--debug");
  if (options.lto) flags.push("--use-lto");
  return [
    {
      cwd: source,
      argv: nativeCommand(
        [
          bun,
          "uv",
          "run",
          "--no-project",
          "--offline",
          "--no-python-downloads",
          join(source, "build", "gen.py"),
          ...flags,
        ],
        platform,
        bun,
      ),
    },
    {
      cwd: source,
      argv: nativeCommand(
        [
          "ninja",
          "-C",
          output,
          "-j",
          String(options.jobs),
          platform === "win32" ? "gn.exe" : "gn",
          platform === "win32" ? "gn_unittests.exe" : "gn_unittests",
        ],
        platform,
        bun,
      ),
    },
  ];
}

export function projectPlan(options: Options, platform: string, root = ROOT, bun = process.execPath) {
  if (!options.project) throw new Error("plan needs --project");
  if (!options.checkout || !isAbsolute(options.checkout)) throw new Error("plan needs an absolute --checkout");
  if (options.project === "chromiumos") {
    throw new Error(
      platform === "win32"
        ? "ChromiumOS requires its Linux SDK and board workflow; Windows MSVC cannot build ChromiumOS"
        : "ChromiumOS uses its Linux SDK and board workflow; GN is only one component, not a full OS builder",
    );
  }
  const checkout = resolve(options.checkout);
  if (
    isAbsolute(options.out) ||
    /^[a-z]:/i.test(options.out) ||
    options.out.split(/[\\/]/).some(part => part === "..") ||
    options.out === "." ||
    options.out === ""
  ) {
    throw new Error("--out must be a relative output directory within the checkout");
  }
  const binary = join(root, "build", "gn", platform === "win32" ? "gn.exe" : "gn");
  const target = { chromium: "chrome", v8: "d8", skia: "skia" }[options.project];
  return {
    project: options.project,
    revision: GN_REVISION,
    prerequisite: "An already synchronized checkout with its project-pinned compiler, SDK and Python dependencies",
    commands: [
      {
        cwd: checkout,
        argv: nativeCommand([binary, "gen", options.out, ...options.rest], platform, bun),
      },
      {
        cwd: checkout,
        argv: nativeCommand(["ninja", "-C", options.out, "-j", String(options.jobs), target], platform, bun),
      },
    ] satisfies Command[],
  };
}

function capture(argv: string[], cwd = ROOT): string {
  const result = Bun.spawnSync({
    cmd: argv,
    cwd,
    env: { ...process.env, BUN_BE_BUN: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0)
    throw new Error(`${argv.slice(1).join(" ")}: ${result.stderr.toString().trim() || `exit ${result.exitCode}`}`);
  return result.stdout.toString();
}

function execute(command: Command, env: Record<string, string | undefined> = process.env): void {
  const result = Bun.spawnSync({
    cmd: command.argv,
    cwd: command.cwd,
    env: { ...env, BUN_BE_BUN: "1" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) throw new Error(`Command failed (exit ${result.exitCode}): ${command.argv.join(" ")}`);
}

export function bootstrapKey(
  identity: unknown,
  options: Options,
  sources: string,
  env: Record<string, string | undefined>,
) {
  return new Bun.CryptoHasher("sha256")
    .update(
      JSON.stringify({
        revision: GN_REVISION,
        identity,
        sources,
        lto: options.lto,
        debug: options.debug,
        platform: process.platform,
        arch: process.arch,
        compilerEnvironment: Object.fromEntries(
          ["CC", "CXX", "AR", "LD", "CFLAGS", "CXXFLAGS", "LDFLAGS", "VSLANG", "GN_BUILD_LAST_COMMIT_POSITION"].map(
            name => [name, env[name] ?? null],
          ),
        ),
      }),
    )
    .digest("hex");
}

function fingerprint(path: string) {
  const stat = statSync(path);
  return { path, size: stat.size, mtimeMs: stat.mtimeMs };
}

export async function withBootstrapLock<T>(output: string, run: () => Promise<T>): Promise<T> {
  mkdirSync(output, { recursive: true });
  const lock = join(output, ".bun-gn.lock");
  let fd: number;
  try {
    fd = openSync(lock, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`GN build is owned by another process (${lock})`);
    throw error;
  }
  try {
    writeFileSync(fd, `${JSON.stringify({ pid: process.pid, revision: GN_REVISION })}\n`);
    return await run();
  } finally {
    closeSync(fd);
    unlinkSync(lock);
  }
}

async function bootstrap(options: Options) {
  await withBootstrapLock(OUTPUT, () => bootstrapOwned(options));
}

async function bootstrapOwned(options: Options) {
  if (!existsSync(join(SOURCE, "build", "gen.py"))) throw new Error("Pinned vendor/gn sources are missing: run `bun run vendor:setup gn`");
  const receipt = await verifyGN();
  if (typeof receipt.position !== "string" || !/^\d+ \([0-9a-f]{12,40}\)$/.test(receipt.position)) {
    throw new Error("GN vendor receipt has an invalid commit position");
  }
  const commands = bootstrapCommands(options, process.platform);
  const identity =
    process.platform === "win32"
      ? JSON.parse(capture([process.execPath, "msvc", "info"]))
      : capture([process.env.CXX || "clang++", "--version"]);
  const sourceHash = new Bun.CryptoHasher("sha256");
  for (const path of [join(SOURCE, "build", "gen.py"), join(SOURCE, "build", "ninja_file.py")])
    sourceHash.update(readFileSync(path));
  const env = {
    ...process.env,
    ...(process.platform === "win32" ? { VSLANG: "1033" } : {}),
    GN_BUILD_LAST_COMMIT_POSITION: process.env.GN_BUILD_LAST_COMMIT_POSITION ?? receipt.position,
  };
  const key = bootstrapKey(identity, options, sourceHash.digest("hex"), env);
  const stamp = join(OUTPUT, "bun-bootstrap.json");
  let previous: { key?: string; tools?: ReturnType<typeof fingerprint>[] } = {};
  try {
    previous = JSON.parse(readFileSync(stamp, "utf8"));
  } catch {}
  const tools: ReturnType<typeof fingerprint>[] = [];
  if (process.platform === "win32") {
    for (const name of ["cl", "link", "lib", "ninja"]) {
      tools.push(fingerprint(capture([process.execPath, "msvc", "which", name]).trim()));
    }
  } else {
    for (const name of [process.env.CXX || "clang++", "ninja"]) {
      const path = Bun.which(name);
      if (!path) throw new Error(`${name} was not found`);
      tools.push(fingerprint(path));
    }
  }
  if (
    previous.key !== key ||
    JSON.stringify(previous.tools) !== JSON.stringify(tools) ||
    !existsSync(join(OUTPUT, "build.ninja"))
  ) {
    mkdirSync(OUTPUT, { recursive: true });
    execute(commands[0]!, env);
    writeFileSync(stamp, `${JSON.stringify({ key, revision: GN_REVISION, tools }, null, 2)}\n`);
  }
  execute(commands[1]!, env);
}

function doctor(options: Options) {
  const binary = join(OUTPUT, process.platform === "win32" ? "gn.exe" : "gn");
  const report: Record<string, unknown> = {
    revision: GN_REVISION,
    binary,
    built: existsSync(binary),
    platform: process.platform,
  };
  if (process.platform === "win32") report.msvc = JSON.parse(capture([process.execPath, "msvc", "info"]));
  if (options.project) {
    report.project = options.project;
    report.checkout = options.checkout ?? null;
    report.chromiumosRequiresLinuxSdk = options.project === "chromiumos";
    report.qualification = "Project build has not been performed by doctor";
    if (options.project === "chromium" && process.platform === "win32") {
      report.requirements = {
        compiler: "The checkout-pinned clang-cl; resolving MSVC alone is insufficient",
        visualStudio: "Match the checkout docs; current Chromium main requires Visual Studio >=18",
        sdk: "Match the checkout docs; current Chromium main requires Windows SDK 10.0.28000.2270",
      };
    }
    if (options.checkout) {
      const compiler = join(
        options.checkout,
        "third_party",
        "llvm-build",
        "Release+Asserts",
        "bin",
        process.platform === "win32" ? "clang-cl.exe" : "clang++",
      );
      report.projectCompiler = { path: compiler, present: existsSync(compiler) };
      report.gnRootPresent = existsSync(join(options.checkout, ".gn"));
    }
  }
  console.log(JSON.stringify(report, null, 2));
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.command === "help") {
    console.log(HELP);
    return;
  }
  if (options.command === "plan") {
    console.log(JSON.stringify(projectPlan(options, process.platform), null, 2));
    return;
  }
  if (options.command === "doctor") {
    doctor(options);
    return;
  }
  if (options.command === "bootstrap") {
    await bootstrap(options);
    return;
  }
  const binary = join(OUTPUT, process.platform === "win32" ? "gn.exe" : "gn");
  if (!existsSync(binary)) throw new Error("GN is not built; run bun run gn bootstrap first");
  if (options.command === "build") {
    const plan = projectPlan(options, process.platform);
    if (!existsSync(join(plan.commands[0]!.cwd, ".gn")))
      throw new Error("Project checkout is missing its .gn root configuration");
    for (const command of plan.commands) execute(command);
    return;
  }
  if (options.command === "verify") {
    await verifyGN();
    execute({
      cwd: SOURCE,
      argv: nativeCommand(
        [join(OUTPUT, process.platform === "win32" ? "gn_unittests.exe" : "gn_unittests")],
        process.platform,
      ),
    });
    execute({ cwd: ROOT, argv: [binary, "--version"] });
    return;
  }
  execute({
    cwd: options.checkout ? resolve(options.checkout) : process.cwd(),
    argv: nativeCommand([binary, ...options.rest], process.platform),
  });
}

if (import.meta.main)
  main().catch(error => {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  });
