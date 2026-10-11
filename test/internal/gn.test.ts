import { expect, test } from "bun:test";
import {
  bootstrapCommands,
  bootstrapKey,
  nativeCommand,
  parseArguments,
  projectPlan,
  withBootstrapLock,
} from "../../scripts/aphrody/gn";
import { join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { tempDir } from "harness";

test("GN passes project arguments as separate unchanged process arguments", () => {
  const checkout = resolve("checkout with spaces");
  const options = parseArguments([
    "plan",
    "--project",
    "chromium",
    "--checkout",
    checkout,
    "--",
    "--args=is_debug=false symbol_level=1",
    "--check",
  ]);
  const plan = projectPlan(options, "win32", resolve("bun fork"), "bun.exe");
  expect(plan.commands[0]!.cwd).toBe(checkout);
  expect(plan.commands[0]!.argv.slice(-4)).toEqual([
    "gen",
    "out/bun",
    "--args=is_debug=false symbol_level=1",
    "--check",
  ]);
  expect(plan.commands[1]!.argv.slice(-3)).toEqual(["-j", "4", "chrome"]);
});

test("GN bounded parallelism and output validation reject unsafe plans", () => {
  for (const jobs of ["0", "65", "1.5", "4x"])
    expect(() => parseArguments(["bootstrap", "--jobs", jobs])).toThrow("1..64");
  for (const out of ["..", "out/../source", ".", "C:outside", resolve("outside")]) {
    const options = parseArguments(["plan", "--project", "v8", "--checkout", resolve("v8"), "--out", out]);
    expect(() => projectPlan(options, "win32")).toThrow("relative output directory");
  }
  expect(() =>
    projectPlan(parseArguments(["plan", "--project", "chromiumos", "--checkout", resolve("os")]), "win32"),
  ).toThrow("Windows MSVC cannot build ChromiumOS");
});

test("GN bootstrap uses Bun Python routing and preserves release optimizations", () => {
  const commands = bootstrapCommands(
    parseArguments(["bootstrap", "--jobs", "2", "--lto"]),
    "win32",
    resolve("fork"),
    "bun.exe",
  );
  expect(commands[0]!.argv.slice(0, 9)).toEqual([
    "bun.exe",
    "msvc",
    "exec",
    "--",
    "bun.exe",
    "uv",
    "run",
    "--no-project",
    "--offline",
  ]);
  expect(commands[0]!.argv).toContain("--no-python-downloads");
  expect(commands[0]!.argv.at(-1)).toBe("--use-lto");
  expect(commands[1]!.argv.slice(-4)).toEqual(["-j", "2", "gn.exe", "gn_unittests.exe"]);
  expect(nativeCommand(["gn", "gen", "out"], "linux", "bun")).toEqual(["gn", "gen", "out"]);
});

test("GN bootstrap lock refuses another owner and cleans up after failure", async () => {
  using dir = tempDir("gn-build-lock", {});
  const output = String(dir);
  const lock = join(output, ".bun-gn.lock");
  await withBootstrapLock(output, async () => {
    const owner = readFileSync(lock, "utf8");
    await expect(
      withBootstrapLock(output, async () => {
        throw new Error("Must not run");
      }),
    ).rejects.toThrow("owned by another process");
    expect(readFileSync(lock, "utf8")).toBe(owner);
  });
  expect(existsSync(lock)).toBe(false);
  await expect(
    withBootstrapLock(output, async () => {
      throw new Error("Build failed");
    }),
  ).rejects.toThrow("Build failed");
  expect(existsSync(lock)).toBe(false);
});

test("GN bootstrap cache invalidates on compiler environment, source and options", () => {
  const options = parseArguments(["bootstrap"]);
  const key = bootstrapKey({ compiler: "v1" }, options, "sources", {});
  expect(bootstrapKey({ compiler: "v1" }, { ...options, jobs: 2 }, "sources", {})).toBe(key);
  expect(bootstrapKey({ compiler: "v2" }, options, "sources", {})).not.toBe(key);
  expect(bootstrapKey({ compiler: "v1" }, options, "changed sources", {})).not.toBe(key);
  expect(bootstrapKey({ compiler: "v1" }, { ...options, lto: true }, "sources", {})).not.toBe(key);
  expect(bootstrapKey({ compiler: "v1" }, options, "sources", { CXXFLAGS: "/DCHANGED" })).not.toBe(key);
});
