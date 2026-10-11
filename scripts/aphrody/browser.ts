#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0

export const HELP = `Usage: bun run chrome|obscura help|connect|launch [options]

  connect <ws://loopback/endpoint>   Probe an existing CDP endpoint, then disconnect
  launch                           Run the selected browser until it exits or Ctrl+C

Common: --executable <path> --timeout <milliseconds>
Chrome launch: --headless --no-webgpu --url <HTTP(S)|about:blank>
               --user-data-dir <path> --extension <path> (repeatable)
Obscura launch: --workers <1..64> (Windows supports one worker)

Runtime owners: bun:chromium and bun:obscura. Chrome is visible with WebGPU by default.
Build owners: bun run gn and bun run chromium; those commands compile sources.
`;

type Engine = "chrome" | "obscura";
export interface Options {
  engine: Engine;
  command: "help" | "connect" | "launch";
  endpoint?: string;
  launch: import("bun:chromium").LaunchOptions & import("bun:obscura").LaunchOptions;
}

export function parseArguments(args: string[]): Options {
  const engine = args[0];
  if (engine !== "chrome" && engine !== "obscura") throw new Error("Select chrome or obscura");
  const options: Options = { engine, command: "help", launch: {} };
  if (args.slice(1).some((arg) => arg === "--help" || arg === "-h")) return options;
  const command = args[1] ?? "help";
  if (command === "help" || command === "--help" || command === "-h") return options;
  if (command !== "connect" && command !== "launch") throw new Error(`Unknown command: ${command}`);
  options.command = command;
  let index = 2;
  if (command === "connect") {
    const endpoint = args[index++];
    if (!endpoint || endpoint.startsWith("--"))
      throw new Error("connect needs a WebSocket endpoint");
    options.endpoint = endpoint;
  }
  for (; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === "--help" || flag === "-h") return { ...options, command: "help" };
    if (flag === "--headless" || flag === "--no-webgpu") {
      if (engine !== "chrome" || command !== "launch")
        throw new Error(`${flag} requires chrome launch`);
      if (flag === "--headless") options.launch.headless = true;
      else options.launch.webgpu = false;
      continue;
    }
    const shared = flag === "--timeout";
    const commonLaunch = flag === "--executable";
    const chromeLaunch = ["--url", "--user-data-dir", "--extension"].includes(flag);
    const obscuraLaunch = flag === "--workers";
    if (
      !shared &&
      !(
        command === "launch" &&
        (commonLaunch ||
          (chromeLaunch && engine === "chrome") ||
          (obscuraLaunch && engine === "obscura"))
      )
    )
      throw new Error(`Unsupported option for ${engine} ${command}: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    if (shared || obscuraLaunch) {
      const maximum = shared ? 2147483647 : 64;
      if (
        !/^\d+$/.test(value) ||
        !Number.isSafeInteger(Number(value)) ||
        Number(value) < 1 ||
        Number(value) > maximum
      )
        throw new Error(`${flag} must be an integer from 1 to ${maximum}`);
      if (shared) options.launch.timeout = Number(value);
      else options.launch.workers = Number(value);
    } else if (flag === "--executable") options.launch.executable = value;
    else if (flag === "--url") options.launch.url = value;
    else if (flag === "--user-data-dir") options.launch.userDataDir = value;
    else (options.launch.extensions ??= []).push(value);
  }
  return options;
}

export interface Connection {
  send(method: string): Promise<unknown>;
  close(): void;
}
export interface Browser {
  process: { exited: Promise<number> };
  close(): Promise<void>;
}
export interface Owner {
  connect(
    endpoint: string,
    options: { timeout?: number; signal?: AbortSignal },
  ): Promise<Connection>;
  launch(options: Options["launch"]): Promise<Browser>;
}

async function loadOwner(engine: Engine): Promise<Owner> {
  return engine === "chrome" ? await import("bun:chromium") : await import("bun:obscura");
}

export async function runBrowser(
  options: Options,
  load: (engine: Engine) => Promise<Owner> = loadOwner,
  report: (value: string) => void = console.log,
): Promise<number> {
  if (options.command === "help") {
    report(HELP);
    return 0;
  }
  const owner = await load(options.engine);
  if (options.command === "connect") {
    const connection = await owner.connect(options.endpoint!, {
      timeout: options.launch.timeout,
      signal: options.launch.signal,
    });
    try {
      report(JSON.stringify(await connection.send("Browser.getVersion")));
      return 0;
    } finally {
      connection.close();
    }
  }
  const browser = await owner.launch(options.launch);
  try {
    report(`${options.engine} ready; stop with Ctrl+C`);
    return await browser.process.exited;
  } finally {
    await browser.close();
  }
}

if (import.meta.main) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const options = parseArguments(Bun.argv.slice(2));
    options.launch.signal = controller.signal;
    process.exitCode = await runBrowser(options);
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
