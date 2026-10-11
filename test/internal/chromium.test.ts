import { expect, test } from "bun:test";
import {
  batchCommand,
  childEnvironment,
  commandPlan,
  parseArguments,
  withSetupLock,
  CHROMIUM_REVISION,
  repairUndiciTypes,
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
  expect(fresh.setup[1]!.argv.slice(1)).toEqual([
    "sync",
    "--no-history",
    "--jobs",
    "4",
    "--revision",
    `src@${CHROMIUM_REVISION}`,
  ]);
  expect(fresh.setup[0]!.cwd).toBe(join(root, "vendor", "chromium"));
  const resume = commandPlan(options, "linux", true, root);
  expect(resume.setup[0]!.argv.slice(1)).toEqual([
    "sync",
    "--no-history",
    "--jobs",
    "4",
    "--revision",
    `src@${CHROMIUM_REVISION}`,
  ]);
  expect(commandPlan(parseArguments(["--depot-tools", "setup"]), "linux", false, root).setup).toEqual([]);
});

async function undiciFixture(archiveFiles: Record<string, string>) {
  const bytes = await new Bun.Archive(archiveFiles, { compress: "gzip" }).bytes();
  const pin = {
    version: "7.18.2",
    resolved: "https://registry.npmjs.org/undici-types/-/undici-types-7.18.2.tgz",
    integrity: `sha512-${new Bun.CryptoHasher("sha512").update(bytes).digest("base64")}`,
  };
  return {
    bytes,
    pin,
    files: {
      "third_party/node/package-lock.json": JSON.stringify({ packages: { "node_modules/undici-types": pin } }),
      "third_party/node/node_modules/undici-types/package.json": JSON.stringify({
        name: "undici-types",
        version: "7.18.2",
      }),
      "third_party/node/node_modules/undici-types/LICENSE": "retained license",
    },
  };
}

test("Chromium repairs only missing locked declarations from a verified local archive and keeps metadata", async () => {
  const fixture = await undiciFixture({
    "package/index.d.ts": "export * from './client';",
    "package/client.d.ts": "export interface Client {}",
    "package/LICENSE": "archive license",
    "package/package.json": "unwanted metadata",
    "package/README.md": "unwanted readme",
  });
  using dir = tempDir("chromium-undici-repair", fixture.files);
  using server = Bun.serve({ port: 0, fetch: () => new Response(fixture.bytes) });
  let requested = "";
  const result = await repairUndiciTypes(String(dir), url => {
    requested = url;
    return fetch(server.url);
  });
  const target = join(String(dir), "third_party/node/node_modules/undici-types");
  expect(requested).toBe(fixture.pin.resolved);
  expect(result).toEqual({ version: "7.18.2", restoredFiles: 2 });
  expect(readFileSync(join(target, "index.d.ts"), "utf8")).toBe("export * from './client';");
  expect(readFileSync(join(target, "client.d.ts"), "utf8")).toBe("export interface Client {}");
  expect(readFileSync(join(target, "LICENSE"), "utf8")).toBe("retained license");
  expect(readFileSync(join(target, "package.json"), "utf8")).toBe(
    fixture.files["third_party/node/node_modules/undici-types/package.json"],
  );
  expect(existsSync(join(target, "README.md"))).toBe(false);
  expect(
    await repairUndiciTypes(String(dir), () => {
      throw new Error("Should not fetch twice");
    }),
  ).toEqual({ version: "7.18.2", restoredFiles: 0 });
});

test("Chromium rejects mismatched undici archives and unsafe declarations before writing", async () => {
  const fixture = await undiciFixture({ "package/index.d.ts": "export {};" });
  using dir = tempDir("chromium-undici-integrity", fixture.files);
  await expect(repairUndiciTypes(String(dir), async () => new Response("tampered archive"))).rejects.toThrow(
    "integrity mismatch",
  );
  expect(existsSync(join(String(dir), "third_party/node/node_modules/undici-types/index.d.ts"))).toBe(false);
  const malicious = await undiciFixture({ "package/index.d.ts": "export {};", "outside.d.ts": "unsafe" });
  using unsafe = tempDir("chromium-undici-unsafe", malicious.files);
  await expect(repairUndiciTypes(String(unsafe), async () => new Response(malicious.bytes))).rejects.toThrow(
    "Unsafe Chromium",
  );
  expect(existsSync(join(String(unsafe), "third_party/node/node_modules/undici-types/index.d.ts"))).toBe(false);
});

test("Chromium declaration repair preserves existing differences and rejects untrusted lock URLs", async () => {
  const fixture = await undiciFixture({ "package/index.d.ts": "export {};", "package/client.d.ts": "archive client" });
  using dir = tempDir("chromium-undici-preserve", {
    ...fixture.files,
    "third_party/node/node_modules/undici-types/client.d.ts": "owner client",
  });
  await expect(repairUndiciTypes(String(dir), async () => new Response(fixture.bytes))).rejects.toThrow(
    "Refusing to overwrite",
  );
  expect(readFileSync(join(String(dir), "third_party/node/node_modules/undici-types/client.d.ts"), "utf8")).toBe(
    "owner client",
  );
  expect(existsSync(join(String(dir), "third_party/node/node_modules/undici-types/index.d.ts"))).toBe(false);
  const lock = JSON.stringify({
    packages: { "node_modules/undici-types": { ...fixture.pin, resolved: "https://other.invalid/package.tgz" } },
  });
  using invalid = tempDir("chromium-undici-lock", { ...fixture.files, "third_party/node/package-lock.json": lock });
  await expect(
    repairUndiciTypes(String(invalid), () => {
      throw new Error("Must not fetch");
    }),
  ).rejects.toThrow("official registry tarball");
});

test("Chromium revision overrides remain exact commit pins for setup and sync", () => {
  const revision = "A".repeat(40);
  const options = parseArguments(["sync", "--revision", revision]);
  const plan = commandPlan(options, "linux", true);
  expect(plan.revision).toBe(revision.toLowerCase());
  expect(plan.sync[0]!.argv.slice(-2)).toEqual(["--revision", `src@${revision.toLowerCase()}`]);
  for (const invalid of ["main", "HEAD", "abcd", "g".repeat(40), "a".repeat(41)])
    expect(() => parseArguments(["setup", "--revision", invalid])).toThrow("40-hex");
});

test("Chromium restores Windows architecture detection only in the child when host variables are absent", () => {
  const root = resolve("bun");
  for (const [arch, expected] of [
    ["x64", "AMD64"],
    ["arm64", "ARM64"],
    ["ia32", "x86"],
  ]) {
    const host = { PROCESSOR_ARCHITECTURE: "" };
    expect(childEnvironment(root, host, "win32", arch).PROCESSOR_ARCHITECTURE).toBe(expected);
    expect(host.PROCESSOR_ARCHITECTURE).toBe("");
  }
  expect(childEnvironment(root, { PROCESSOR_ARCHITECTURE: "AMD64" }, "win32", "arm64").PROCESSOR_ARCHITECTURE).toBe(
    "AMD64",
  );
  expect(childEnvironment(root, { PROCESSOR_ARCHITEW6432: "ARM64" }, "win32", "x64").PROCESSOR_ARCHITECTURE).toBe(
    "ARM64",
  );
  expect(childEnvironment(root, {}, "linux", "x64").PROCESSOR_ARCHITECTURE).toBeUndefined();
  expect(() => childEnvironment(root, {}, "win32", "unknown")).toThrow("Unsupported Windows processor");
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
    "--quiet",
    "--heartbeat_period",
    "30s",
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
