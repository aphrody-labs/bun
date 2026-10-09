// SPDX-License-Identifier: Apache-2.0
/**
 * Commands of the WebOS: one-shot lines through Bun Shell (`$`, in process, same builtins on every
 * platform), JavaScript through a child `bun -p`, and an interactive terminal on `Bun.Terminal`
 * (`Bun.spawn({ terminal })`) running `bunsh` when this Bun has it, the host shell otherwise.
 */
import { $, type Subprocess } from "bun";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  engine: string;
}

const ms = (start: number) => Math.round((Bun.nanoseconds() - start) / 1e4) / 100;

/** A shell line run by Bun Shell with `cwd`; nothing is simulated, a failing command reports its code. */
export async function runShell(command: string, cwd: string): Promise<CommandResult> {
  const start = Bun.nanoseconds();
  try {
    const out = await $`${{ raw: command }}`.cwd(cwd).nothrow().quiet();
    return {
      stdout: out.stdout.toString(),
      stderr: out.stderr.toString(),
      exitCode: out.exitCode,
      durationMs: ms(start),
      engine: "Bun Shell",
    };
  } catch (error) {
    // Parse errors throw before any process runs.
    return {
      stdout: "",
      stderr: `bun: ${(error as Error).message}\n`,
      exitCode: 2,
      durationMs: ms(start),
      engine: "Bun Shell",
    };
  }
}

/** The running Bun, also when this server is a `bun build --compile` executable. */
function bunCommand(): { cmd: string; env: Record<string, string | undefined> } {
  return { cmd: process.execPath, env: { ...process.env, BUN_BE_BUN: "1" } };
}

/** JavaScript evaluated by a child Bun (`bun -p`), killed after `timeoutMs`. */
export async function evalJs(
  code: string,
  cwd: string,
  track: (p: Subprocess) => void,
  timeoutMs = 15_000,
): Promise<CommandResult> {
  const start = Bun.nanoseconds();
  const { cmd, env } = bunCommand();
  await using proc = Bun.spawn({
    cmd: [cmd, "-p", code],
    cwd,
    env: { ...env, NO_COLOR: "1", FORCE_COLOR: "0" },
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
    windowsHide: true,
  });
  track(proc);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode, durationMs: ms(start), engine: `bun -p (${Bun.version})` };
}

export interface TerminalShell {
  cmd: string[];
  argv0?: string;
  env: Record<string, string | undefined>;
  /** "bunsh" or the host shell used because this Bun has no bunsh. */
  name: string;
  bunsh: boolean;
}

let shellProbe: Promise<TerminalShell> | null = null;

/** bunsh (Bun with argv0 `bunsh`) when this Bun answers `bunsh -c`, else the host's shell. */
export function terminalShell(): Promise<TerminalShell> {
  return (shellProbe ??= (async () => {
    const { cmd, env } = bunCommand();
    const probe = Bun.spawnSync({
      cmd: [cmd, "-c", "echo bunsh-probe"],
      argv0: "bunsh",
      env,
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    });
    if (probe.exitCode === 0 && probe.stdout.toString().trim() === "bunsh-probe") {
      return { cmd: [cmd, "-i"], argv0: "bunsh", env, name: "bunsh", bunsh: true };
    }
    if (process.platform === "win32") {
      const pwsh = Bun.which("pwsh") ?? Bun.which("powershell");
      const shell = pwsh ?? process.env.ComSpec ?? "cmd.exe";
      return { cmd: pwsh ? [shell, "-NoLogo", "-NoProfile"] : [shell], env: process.env, name: shell, bunsh: false };
    }
    const shell = process.env.SHELL || Bun.which("bash") || "/bin/sh";
    return { cmd: [shell, "-i"], env: { ...process.env, TERM: "xterm-256color" }, name: shell, bunsh: false };
  })());
}
