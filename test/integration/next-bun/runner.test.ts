// `next-bun dev|build|start`: the app's next on Bun with a `node` that is Bun first on PATH.
import { describe, expect, test } from "bun:test";
import { bunEnv, isWindows, tempDir } from "harness";
import { existsSync, lstatSync, readlinkSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

const { bunNodeShim, nextBin, nextCommand } = require("../../../packages/bun-next/lib/run.js");

const nodeName = isWindows ? "node.exe" : "node";

function pointsAtBun(dir: string) {
  const shim = join(dir, nodeName);
  if (isWindows) {
    const a = statSync(shim);
    const b = statSync(process.execPath);
    return a.size === b.size && a.mtimeMs === b.mtimeMs;
  }
  return lstatSync(shim).isSymbolicLink() && readlinkSync(shim) === process.execPath;
}

describe("bunNodeShim", () => {
  test("creates a `node` that is this Bun, and is idempotent", () => {
    using dir = tempDir("next-bun-shim", {});
    const shimDir = join(String(dir), "a");
    expect(bunNodeShim(shimDir, process.execPath)).toBe(shimDir);
    expect(pointsAtBun(shimDir)).toBe(true);
    expect(bunNodeShim(shimDir, process.execPath)).toBe(shimDir);
    expect(pointsAtBun(shimDir)).toBe(true);
  });

  test("repairs a shim that points somewhere else", () => {
    using dir = tempDir("next-bun-shim", {});
    const shimDir = join(String(dir), "b");
    bunNodeShim(shimDir, process.execPath);
    unlinkSync(join(shimDir, nodeName));
    if (isWindows) writeFileSync(join(shimDir, nodeName), "stale");
    else symlinkSync("/nonexistent/node", join(shimDir, nodeName));
    expect(pointsAtBun(shimDir)).toBe(false);
    bunNodeShim(shimDir, process.execPath);
    expect(pointsAtBun(shimDir)).toBe(true);
  });

  test("the shim runs scripts as Bun", async () => {
    using dir = tempDir("next-bun-shim", {});
    const shimDir = bunNodeShim(join(String(dir), "c"), process.execPath);
    await using proc = Bun.spawn({
      cmd: [join(shimDir, nodeName), "-e", "console.log(typeof Bun)"],
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([proc.stdout.text(), proc.exited]);
    expect(stdout.trim()).toBe("object");
    expect(exitCode).toBe(0);
  });
});

describe("nextCommand", () => {
  test("runs the app's next with --bun, the shim first on PATH", () => {
    using dir = tempDir("next-bun-app", {
      "package.json": JSON.stringify({ name: "app", dependencies: { next: "*" } }),
      "node_modules/next/package.json": JSON.stringify({ name: "next", version: "16.1.6" }),
      "node_modules/next/dist/bin/next": "",
    });
    const shim = join(String(dir), "shim");
    const { cmd, env } = nextCommand(["build", "--webpack"], String(dir), shim);
    expect(cmd[0]).toBe(process.execPath);
    expect(cmd[1]).toBe("--bun");
    expect(cmd[2]).toBe(nextBin(String(dir)));
    expect(existsSync(cmd[2])).toBe(true);
    expect(cmd.slice(3)).toEqual(["build", "--webpack"]);
    expect(env.PATH.startsWith(`${shim}${delimiter}`)).toBe(true);
    expect(Object.keys(env).filter(key => key.toUpperCase() === "PATH")).toEqual(["PATH"]);
    expect(env.NEXT_TELEMETRY_DISABLED).toBeDefined();
  });

  test("an app without next fails loudly", () => {
    using dir = tempDir("next-bun-app", { "package.json": "{}" });
    expect(() => nextBin(String(dir))).toThrow();
  });
});
