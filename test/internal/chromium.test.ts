import { expect, test } from "bun:test";
import {
  batchCommand,
  childEnvironment,
  commandPlan,
  parseArguments,
  withSetupLock,
} from "../../scripts/aphrody/chromium";
import { join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { tempDir } from "harness";

test("Chromium setup resumes configured sources and avoids history or duplicate Git caches", () => {
  const root = resolve("checkout with spaces");
  const options = parseArguments(["setup"]);
  const fresh = commandPlan(options, "linux", false, root);
  expect(fresh.setup[0]!.argv).toEqual([
    join(root, "vendor", "depot_tools", "gclient"),
    "config",
    "--name=src",
    "--unmanaged",
    "--cache-dir=None",
    "https://chromium.googlesource.com/chromium/src.git",
  ]);
  expect(fresh.setup[1]!.argv.slice(1)).toEqual(["sync", "--no-history", "--jobs", "4"]);
  expect(fresh.setup[0]!.cwd).toBe(join(root, "vendor", "chromium"));
  const resume = commandPlan(options, "linux", true, root);
  expect(resume.setup[0]!.argv.slice(1)).toEqual(["sync", "--no-history", "--jobs", "4"]);
  expect(commandPlan(parseArguments(["--depot-tools", "setup"]), "linux", false, root).setup).toEqual([]);
});

test("Chromium fresh setup clones depot_tools once from the official source inside the checkout", () => {
  const root = resolve("bun with spaces");
  const options = parseArguments(["--depot-tools", "setup"]);
  const fresh = commandPlan(options, "win32", false, root, false);
  expect(fresh.setup[0]).toEqual({
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
      join(root, "vendor", "depot_tools"),
    ],
  });
  expect(fresh.setup[1]!.cwd).toBe(join(root, "vendor", "depot_tools"));
  const existing = commandPlan(options, "win32", false, root, true);
  expect(existing.setup).toHaveLength(1);
  expect(existing.setup[0]!.argv[0]).toBe("cmd.exe");
});

test("Chromium Windows commands quote whitespace and reject shell expansion and control operators", () => {
  const argv = [
    "C:\\bun folder\\vendor\\depot_tools\\gn.bat",
    "gen",
    "out/bun",
    "--args=is_debug=false symbol_level=0",
  ];
  expect(batchCommand(argv, "win32")).toEqual([
    "cmd.exe",
    "/d",
    "/s",
    "/v:off",
    "/c",
    '""C:\\bun folder\\vendor\\depot_tools\\gn.bat" "gen" "out/bun" "--args=is_debug=false symbol_level=0""',
  ]);
  for (const value of ["a&b", "a|b", "a>b", "a<b", "a^b", "%PATH%", "!PATH!", 'a"b', "a\nb", "a\rb", "a\0b", ""]) {
    expect(() => batchCommand(["tool.bat", value], "win32")).toThrow("Unsafe Windows batch argument");
  }
  expect(batchCommand(argv, "linux")).toEqual(argv);
});

test("Chromium bounds jobs and output paths and constrains depot tools execution", () => {
  for (const jobs of ["0", "65", "1.5", "4x"]) expect(() => parseArguments(["build", "--jobs", jobs])).toThrow("1..64");
  for (const out of ["..", "out/../src", ".", "././", "-src", "C:outside", resolve("outside")])
    expect(() => parseArguments(["gen", "--out", out])).toThrow("relative output directory");
  expect(() => parseArguments(["--depot-tools", "build"])).toThrow("Use bun chromium");
  expect(() => parseArguments(["exec"])).toThrow("exec needs --");
  expect(() => commandPlan(parseArguments(["exec", "--", "../gclient"]), "linux", true)).toThrow("bare tool name");
  expect(() => parseArguments(["build", "--", "--no-sandbox"])).toThrow("Only exec");
});

test("Chromium uses depot GN and autotools for the full local chrome target with upstream GPU defaults", () => {
  const root = resolve("bun");
  const plan = commandPlan(parseArguments(["build", "--jobs", "2"]), "linux", true, root);
  expect(plan.build[0]!.argv[0]).toBe(join(root, "vendor", "depot_tools", "gn"));
  expect(plan.build[0]!.argv.slice(1)).toEqual([
    "gen",
    "out/bun",
    "--args=is_debug=false is_component_build=true symbol_level=0 blink_symbol_level=0 v8_symbol_level=0 use_remoteexec=false",
  ]);
  expect(plan.build[1]!.argv).toEqual([
    join(root, "vendor", "depot_tools", "autoninja"),
    "-C",
    "out/bun",
    "-j",
    "2",
    "chrome",
  ]);
  expect(plan.build[1]!.cwd).toBe(join(root, "vendor", "chromium", "src"));
  const windows = commandPlan(parseArguments(["setup"]), "win32", false, root);
  expect(windows.setup).toHaveLength(3);
  expect(windows.setup[0]!.argv.at(-1)).toContain("win_tools.bat");
});

test("Chromium child environment preserves host PATH and only changes the child copy", () => {
  const root = resolve("bun");
  const host = {
    Path: "original",
    DEPOT_TOOLS_WIN_TOOLCHAIN: "1",
    DEPOT_TOOLS_UPDATE: "1",
    vs2026_install: "owner VS",
  };
  const env = childEnvironment(root, host);
  expect(env.Path).toStartWith(join(root, "vendor", "depot_tools"));
  expect(env.Path).toEndWith("original");
  expect(env.DEPOT_TOOLS_WIN_TOOLCHAIN).toBe("0");
  expect(env.DEPOT_TOOLS_UPDATE).toBe("0");
  expect(env.vs2026_install).toBe("owner VS");
  expect(env.GIT_CONFIG_COUNT).toBe("2");
  expect(env.GIT_CONFIG_KEY_0).toBe("core.longpaths");
  expect(env.GIT_CONFIG_VALUE_0).toBe("true");
  expect(env.GIT_CONFIG_KEY_1).toBe("core.autocrlf");
  expect(env.GIT_CONFIG_VALUE_1).toBe("false");
  expect(host).toEqual({
    Path: "original",
    DEPOT_TOOLS_WIN_TOOLCHAIN: "1",
    DEPOT_TOOLS_UPDATE: "1",
    vs2026_install: "owner VS",
  });
});

test.skipIf(process.platform !== "win32")(
  "Chromium batch execution preserves spaced paths and argument payloads through Windows",
  () => {
    using dir = tempDir("chromium batch args", {
      "tool with spaces.bat": "@echo off\r\necho [%~1]\r\necho [%~2]\r\necho [%~3]\r\n",
    });
    const command = batchCommand(
      [join(String(dir), "tool with spaces.bat"), "gen", "out/with spaces", "--args=is_debug=false symbol_level=0"],
      "win32",
    );
    const proc = Bun.spawnSync(command, {
      cwd: String(dir),
      windowsVerbatimArguments: true,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(proc.stdout.toString().replace(/\r\n/g, "\n")).toBe(
      "[gen]\n[out/with spaces]\n[--args=is_debug=false symbol_level=0]\n",
    );
    expect(proc.stderr.toString()).toBe("");
    expect(proc.exitCode).toBe(0);
  },
);

test("Chromium setup lock preserves another owner's lock and cleans up on failure", async () => {
  using dir = tempDir("chromium-setup-lock", {});
  const lock = join(String(dir), "setup.lock");
  await withSetupLock(String(dir), async () => {
    const owner = readFileSync(lock, "utf8");
    await expect(withSetupLock(String(dir), async () => {})).rejects.toThrow("owned by another process");
    expect(readFileSync(lock, "utf8")).toBe(owner);
  });
  expect(existsSync(lock)).toBe(false);
  await expect(
    withSetupLock(String(dir), async () => {
      throw new Error("failure");
    }),
  ).rejects.toThrow("failure");
  expect(existsSync(lock)).toBe(false);
});

test("Chromium child Git configuration appends after inherited settings", () => {
  const host = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.version", GIT_CONFIG_VALUE_0: "HTTP/1.1" };
  const env = childEnvironment(resolve("bun"), host);
  expect(env.GIT_CONFIG_COUNT).toBe("3");
  expect(env.GIT_CONFIG_KEY_0).toBe("http.version");
  expect(env.GIT_CONFIG_VALUE_0).toBe("HTTP/1.1");
  expect(env.GIT_CONFIG_KEY_1).toBe("core.longpaths");
  expect(env.GIT_CONFIG_KEY_2).toBe("core.autocrlf");
  expect(host.GIT_CONFIG_COUNT).toBe("1");
  expect(() => childEnvironment(resolve("bun"), { GIT_CONFIG_COUNT: "bad" })).toThrow("Invalid inherited");
});
