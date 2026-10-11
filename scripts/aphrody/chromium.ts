#!/usr/bin/env bun
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const GN_ARGS =
  "is_debug=false is_component_build=true symbol_level=0 blink_symbol_level=0 v8_symbol_level=0 use_remoteexec=false";
const HELP = `Usage: bun chromium <command> [--jobs 1..64] [--out out/bun] [-- args...]
  setup    Bootstrap depot_tools and fetch Chromium without Git history; resume existing configuration
  sync     Synchronize the existing Chromium configuration and run dependency hooks
  doctor   Report local source, toolchain, depot_tools and browser artifact readiness
  plan     Print the setup, generation and build commands without executing them
  gen      Generate Chromium's build graph with its pinned GN
  build    Generate and build the complete chrome target with local Siso/autoninja
  exec     Run a depot_tools command, e.g. exec -- gclient --version

Usage: bun depots_tools setup|doctor|exec [-- args...]
All sources stay in vendor/depot_tools and vendor/chromium/src in this checkout.
PATH and toolchain variables apply only to child processes. No global settings change.
Chromium keeps its dependency pins and WebGPU defaults. Windows SDK and ATL/MFC
must already satisfy Chromium's current build requirements.
`;

export interface Options {
  command: "help" | "setup" | "sync" | "doctor" | "plan" | "gen" | "build" | "exec";
  depotTools: boolean;
  jobs: number;
  out: string;
  rest: string[];
}
export interface Command {
  cwd: string;
  argv: string[];
}

export function parseArguments(args: string[]): Options {
  const options: Options = { command: "help", depotTools: false, jobs: 4, out: "out/bun", rest: [] };
  let commandSet = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") {
      options.rest = args.slice(i + 1);
      break;
    }
    if (arg === "--help" || arg === "-h") {
      options.command = "help";
      return options;
    }
    if (arg === "--depot-tools") {
      options.depotTools = true;
      continue;
    }
    if (arg === "--jobs" || arg === "--out") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      if (arg === "--jobs") {
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 64) throw new Error("--jobs must be 1..64");
        options.jobs = Number(value);
      } else options.out = value;
    } else if (!commandSet && ["help", "setup", "sync", "doctor", "plan", "gen", "build", "exec"].includes(arg)) {
      options.command = arg as Options["command"];
      commandSet = true;
    } else throw new Error(`Unknown argument: ${arg}; tool arguments follow --`);
  }
  if (
    !options.out ||
    options.out.startsWith("-") ||
    isAbsolute(options.out) ||
    /^[a-z]:/i.test(options.out) ||
    options.out.split(/[\\/]/).some(part => part === "..") ||
    options.out.split(/[\\/]/).every(part => part === "." || part === "")
  ) {
    throw new Error("--out must be a relative output directory within Chromium");
  }
  if (options.depotTools && ["sync", "gen", "build"].includes(options.command))
    throw new Error("Use bun chromium for Chromium source and build commands");
  if (options.command === "exec" && !options.rest.length)
    throw new Error("exec needs -- followed by a depot_tools command");
  if (options.command !== "exec" && options.rest.length) throw new Error("Only exec accepts tool arguments after --");
  return options;
}

export function batchCommand(argv: string[], platform: string, commandProcessor = "cmd.exe"): string[] {
  if (platform !== "win32") return argv;
  for (const value of argv) {
    if (!value || /["&|<>^%!\r\n\x00]/.test(value)) throw new Error("Unsafe Windows batch argument");
  }
  // /s removes the outer pair; each token inside remains quoted for the batch file.
  return [commandProcessor, "/d", "/s", "/v:off", "/c", `"${argv.map(value => `"${value}"`).join(" ")}"`];
}

export function childEnvironment(root: string, current: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...current };
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === "path") ?? "PATH";
  env[pathKey] = `${join(root, "vendor", "depot_tools")}${delimiter}${env[pathKey] ?? ""}`;
  env.DEPOT_TOOLS_WIN_TOOLCHAIN = "0";
  env.DEPOT_TOOLS_UPDATE = "0";
  const countText = env.GIT_CONFIG_COUNT ?? "0";
  if (!/^\d+$/.test(countText) || Number(countText) > 1024) throw new Error("Invalid inherited GIT_CONFIG_COUNT");
  const count = Number(countText);
  env[`GIT_CONFIG_KEY_${count}`] = "core.longpaths";
  env[`GIT_CONFIG_VALUE_${count}`] = "true";
  env[`GIT_CONFIG_KEY_${count + 1}`] = "core.autocrlf";
  env[`GIT_CONFIG_VALUE_${count + 1}`] = "false";
  env.GIT_CONFIG_COUNT = String(count + 2);
  return env;
}

function toolCommand(name: string, args: string[], cwd: string, root: string, platform: string): Command {
  if (!/^[a-z][a-z0-9_]*$/i.test(name)) throw new Error("A depot_tools command must be a bare tool name");
  return {
    cwd,
    argv: batchCommand(
      [join(root, "vendor", "depot_tools", platform === "win32" ? `${name}.bat` : name), ...args],
      platform,
    ),
  };
}

export function commandPlan(options: Options, platform: string, configured: boolean, root = ROOT, depotPresent = true) {
  const sourceRoot = join(root, "vendor", "chromium");
  const source = join(sourceRoot, "src");
  const depot = join(root, "vendor", "depot_tools");
  const clone = depotPresent
    ? []
    : [
        {
          cwd: join(root, "vendor"),
          argv: [
            "git",
            "-c",
            "core.longpaths=true",
            "-c",
            "core.autocrlf=false",
            "clone",
            "--depth",
            "1",
            "https://chromium.googlesource.com/chromium/tools/depot_tools.git",
            depot,
          ],
        },
      ];
  const bootstrap =
    platform === "win32"
      ? [{ cwd: depot, argv: batchCommand([join(depot, "bootstrap", "win_tools.bat")], platform) }]
      : [];
  const sync = [
    toolCommand("gclient", ["sync", "--no-history", "--jobs", String(options.jobs)], sourceRoot, root, platform),
  ];
  const configure = toolCommand(
    "gclient",
    ["config", "--name=src", "--unmanaged", "--cache-dir=None", "https://chromium.googlesource.com/chromium/src.git"],
    sourceRoot,
    root,
    platform,
  );
  const setup = options.depotTools
    ? [...clone, ...bootstrap]
    : [...clone, ...bootstrap, ...(configured ? [] : [configure]), ...sync];
  const gen = [toolCommand("gn", ["gen", options.out, `--args=${GN_ARGS}`], source, root, platform)];
  const build = [
    ...gen,
    toolCommand("autoninja", ["-C", options.out, "-j", String(options.jobs), "chrome"], source, root, platform),
  ];
  const exec =
    options.command === "exec"
      ? [toolCommand(options.rest[0]!, options.rest.slice(1), options.depotTools ? depot : sourceRoot, root, platform)]
      : [];
  return { source, sourceRoot, depot, configured, jobs: options.jobs, out: options.out, setup, sync, gen, build, exec };
}

async function run(command: Command, env: NodeJS.ProcessEnv) {
  const proc = Bun.spawn(command.argv, {
    cwd: command.cwd,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    windowsVerbatimArguments: process.platform === "win32" && command.argv[0] === "cmd.exe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(`Command failed (${exitCode}): ${command.argv[0]}`);
}

export async function withSetupLock<T>(output: string, callback: () => Promise<T>): Promise<T> {
  mkdirSync(output, { recursive: true });
  const lock = join(output, "setup.lock");
  let fd: number;
  try {
    fd = openSync(lock, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`Chromium setup is owned by another process (${lock})`);
    throw error;
  }
  try {
    writeFileSync(fd, `${JSON.stringify({ pid: process.pid })}\n`);
    return await callback();
  } finally {
    closeSync(fd);
    unlinkSync(lock);
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.command === "help") {
    console.log(HELP);
    return;
  }
  const configured = existsSync(join(ROOT, "vendor", "chromium", ".gclient"));
  const plan = commandPlan(
    options,
    process.platform,
    configured,
    ROOT,
    existsSync(join(ROOT, "vendor", "depot_tools", "gclient.py")),
  );
  if (options.command === "plan") {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (options.command === "doctor") {
    const toolchain = Bun.spawnSync([process.execPath, "msvc", "info", "--json"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    console.log(
      JSON.stringify(
        {
          ...plan,
          depotToolsPresent: existsSync(join(plan.depot, "gclient.py")),
          sourcePresent: existsSync(join(plan.source, ".gn")),
          clangPresent: existsSync(
            join(
              plan.source,
              "third_party",
              "llvm-build",
              "Release+Asserts",
              "bin",
              process.platform === "win32" ? "clang-cl.exe" : "clang",
            ),
          ),
          browserPresent: existsSync(
            join(plan.source, options.out, process.platform === "win32" ? "chrome.exe" : "chrome"),
          ),
          toolchain:
            toolchain.exitCode === 0 ? JSON.parse(toolchain.stdout.toString()) : { error: toolchain.stderr.toString() },
        },
        null,
        2,
      ),
    );
    return;
  }
  if (options.command !== "setup" && !existsSync(join(plan.depot, "gclient.py")))
    throw new Error(`Missing depot_tools checkout at ${plan.depot}; run bun depots_tools setup first`);
  if (options.command === "sync" && !configured)
    throw new Error("No .gclient configuration; run bun chromium setup first");
  if (["gen", "build"].includes(options.command) && !existsSync(join(plan.source, ".gn")))
    throw new Error("Chromium source is absent; run bun chromium setup first");
  const env = childEnvironment(ROOT);
  if (process.platform === "win32" && !env.vs2026_install) {
    const inventory = Bun.spawnSync([process.execPath, "msvc", "info", "--json"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (inventory.exitCode === 0) {
      const info = JSON.parse(inventory.stdout.toString());
      const install = info.instances?.find(
        (instance: { year?: number; path?: string }) => instance.year === 2026,
      )?.path;
      if (typeof install === "string") env.vs2026_install = install;
    }
  }
  const commands =
    options.command === "setup"
      ? plan.setup
      : options.command === "sync"
        ? plan.sync
        : options.command === "gen"
          ? plan.gen
          : options.command === "build"
            ? plan.build
            : plan.exec;
  await withSetupLock(join(ROOT, "build", "chromium"), async () => {
    let ownedCommands = commands;
    if (options.command === "setup") {
      const depotPresent = existsSync(join(plan.depot, "gclient.py"));
      if (!depotPresent && existsSync(plan.depot) && readdirSync(plan.depot).length) {
        throw new Error(`Refusing to clone depot_tools into a nonempty directory: ${plan.depot}`);
      }
      mkdirSync(join(ROOT, "vendor"), { recursive: true });
      const currentConfigured = existsSync(join(plan.sourceRoot, ".gclient"));
      if (
        !options.depotTools &&
        !currentConfigured &&
        existsSync(plan.sourceRoot) &&
        readdirSync(plan.sourceRoot).length
      ) {
        throw new Error(`Refusing a fresh setup into an unconfigured nonempty directory: ${plan.sourceRoot}`);
      }
      if (!options.depotTools) mkdirSync(plan.sourceRoot, { recursive: true });
      ownedCommands = commandPlan(options, process.platform, currentConfigured, ROOT, depotPresent).setup;
    }
    for (const command of ownedCommands) await run(command, env);
  });
}

if (import.meta.main)
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
