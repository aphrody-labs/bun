import { cpSync } from "fs";
import { bunEnv, bunExe, tempDir } from "harness";
import { join } from "path";

export const nextEnv = {
  ...bunEnv,
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_NO_WARNINGS: "1",
};

/** Copies `files` of `fixture` into a fresh temp dir and installs its dependencies from `bun.lock`. */
export async function installFixture(fixture: string, files: string[]) {
  const dir = tempDir("next-fixture", {});
  for (const file of files) cpSync(join(fixture, file), join(String(dir), file), { recursive: true });
  await using install = Bun.spawn({
    cmd: [bunExe(), "install"],
    cwd: String(dir),
    env: nextEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([install.stdout.text(), install.stderr.text(), install.exited]);
  if (exitCode !== 0) throw new Error(`bun install failed (${exitCode}):\n${stdout}\n${stderr}`);
  return dir;
}

export const nextBin = "node_modules/next/dist/bin/next";

/** The `next-bun` CLI of packages/bun-next (`next-bun build` = `bun --bun next build` with a Bun `node` on PATH). */
export const nextBunBin = join(import.meta.dir, "..", "..", "..", "..", "packages", "bun-next", "bin", "next-bun.js");

/**
 * Runs `bun --bun next build` (or `next-bun build` when `runner` is set) and returns its output;
 * throws with the output when it fails.
 */
export async function nextBuild(
  cwd: string,
  args: string[],
  env: Record<string, string | undefined>,
  runner: "bun" | "next-bun" = "bun",
) {
  await using proc = Bun.spawn({
    cmd:
      runner === "next-bun" ? [bunExe(), nextBunBin, "build", ...args] : [bunExe(), "--bun", nextBin, "build", ...args],
    cwd,
    env: { ...nextEnv, NODE_ENV: "production", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  if (exitCode !== 0) throw new Error(`next build ${args.join(" ")} failed (${exitCode}):\n${stdout}\n${stderr}`);
  return stdout;
}

/** Starts `bun --bun next start -p 0` and resolves once the server prints its URL. */
export async function nextStart(cwd: string, env: Record<string, string | undefined>) {
  const proc = Bun.spawn({
    cmd: [bunExe(), "--bun", nextBin, "start", "-p", "0", "-H", "127.0.0.1"],
    cwd,
    env: { ...nextEnv, NODE_ENV: "production", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = proc.stderr.text();
  let output = "";
  const decoder = new TextDecoder();
  const reader = proc.stdout.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
    const url = output.match(/Local:\s+(http:\/\/\S+)/)?.[1];
    if (url && output.includes("Ready")) {
      // Keep draining stdout so the child never blocks on a full pipe.
      void (async () => {
        while (!(await reader.read().catch(() => ({ done: true }))).done);
      })();
      return {
        url,
        async [Symbol.asyncDispose]() {
          proc.kill();
          await proc.exited;
        },
      };
    }
  }
  throw new Error(`next start exited (${await proc.exited}) before it was ready:\n${output}\n${await stderr}`);
}
