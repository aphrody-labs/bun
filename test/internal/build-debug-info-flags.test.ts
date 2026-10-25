/**
 * Pins the order of the debug-info flags in scripts/build/flags.ts.
 *
 * clang takes the debug-info level from the LAST -g flag on the command line,
 * and -glldb (a tuning flag) counts as one: it resets the level to full and,
 * for lldb tuning, to the standalone kind. The tables used to emit `-g1 ...
 * -glldb` for release builds, so `clang -###` showed
 * `-debug-info-kind=standalone` and every release TU (deps included) carried
 * full DWARF instead of the line tables the `-g1` entry asks for. The level
 * flag has to be the last -g flag the tables emit, for bun's own flags and for
 * the flags forwarded to deps.
 *
 * Config evaluation runs on every host. BUN_TEST_THINLTO_CLANG enables a
 * Clang -### response-file probe without compiling or linking anything.
 */
import { $ } from "bun";
import { describe, expect, test } from "bun:test";
import { bunExe, isMacOS, tempDir } from "harness";
import { join } from "node:path";

import { link, registerCompileRules } from "../../scripts/build/compile.ts";
import { resolveConfig, type Config, type PartialConfig, type Toolchain } from "../../scripts/build/config.ts";
import { computeDepFlags, computeFlags, linkerMapOutputs } from "../../scripts/build/flags.ts";
import { Ninja } from "../../scripts/build/ninja.ts";
import { quote, slash } from "../../scripts/build/shell.ts";

/** A fully-populated fake toolchain; resolveConfig never spawns any of these. */
function mockToolchain(): Toolchain {
  return {
    cc: "/fake/llvm/bin/clang",
    cxx: "/fake/llvm/bin/clang++",
    hostCc: undefined,
    hostCxx: undefined,
    clangVersion: "23.1.1",
    clangResourceDir: "/fake/llvm/lib/clang/23",
    ar: "/fake/llvm/bin/llvm-ar",
    ld: "/fake/llvm/bin/ld.lld",
    ld64Lld: "/fake/llvm/bin/ld64.lld",
    rustLlvmVersion: "23.1.1",
    rustSysroot: undefined,
    rustHostTriple: undefined,
    strip: "/fake/bin/strip",
    llvmStrip: "/fake/llvm/bin/llvm-strip",
    nm: "/fake/llvm/bin/llvm-nm",
    readobj: "/fake/llvm/bin/llvm-readobj",
    objdump: "/fake/llvm/bin/llvm-objdump",
    cxxfilt: "/fake/llvm/bin/llvm-cxxfilt",
    dsymutil: "/fake/llvm/bin/dsymutil",
    bun: "/fake/bin/bun",
    jsRuntime: "/fake/bin/bun",
    esbuild: "/fake/bin/esbuild",
    ccache: undefined,
    cmake: "/fake/bin/cmake",
    cargo: undefined,
    cargoHome: undefined,
    rustupHome: undefined,
    msvcLinker: undefined,
    rc: undefined,
    nasm: undefined,
  };
}

/**
 * A linux-x64 target resolves on every host once it is told where its sysroot
 * is (the path is only recorded, never opened).
 */
function linuxConfig(partial: PartialConfig, buildDir: string): Config {
  return resolveConfig(
    { os: "linux", arch: "x64", abi: "gnu", buildDir, linuxSysroot: buildDir, ...partial },
    mockToolchain(),
  );
}

/**
 * The -g flags that set the debug-info level or kind, in command-line order.
 * `-gz=` only selects section compression and is excluded.
 */
function levelFlags(flags: string[]): string[] {
  return flags.filter(f => f.startsWith("-g") && !f.startsWith("-gz"));
}

/** Every flag list a config produces that reaches a compiler: bun's C and C++ flags and the deps' C and C++ flags. */
function allCompileFlagLists(cfg: Config): string[][] {
  const bun = computeFlags(cfg);
  const deps = computeDepFlags(cfg);
  return [bun.cflags, bun.cxxflags, deps.cflags, deps.cxxflags];
}

describe("debug-info flag order", () => {
  test.each(["x64", "aarch64"] as const)("Windows %s linker workers preserve debug symbols", arch => {
    using dir = tempDir("build-link-threads", {});
    const resolve = (partial: PartialConfig) =>
      resolveConfig(
        {
          os: "windows",
          arch,
          buildType: "Debug",
          winsysroot: "/fake/winsysroot",
          buildDir: String(dir),
          ...partial,
        },
        mockToolchain(),
      );
    const defaults = computeFlags(resolve({})).ldflags;
    const bounded = computeFlags(resolve({ linkThreads: 1 })).ldflags;
    expect(defaults.some(flag => flag.startsWith("/threads:"))).toBe(false);
    expect(bounded).toContain("/threads:1");
    expect(computeFlags(resolve({ linkThreads: 4 })).ldflags).toContain("/threads:4");
    expect(bounded).toContain("/DEBUG:FULL");
    expect(bounded.filter(flag => !flag.startsWith("/threads:"))).toEqual(defaults);
    for (const linkThreads of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => resolve({ linkThreads })).toThrow("linkThreads must be a positive integer");
    }
    const linux = computeFlags(linuxConfig({ linkThreads: 1 }, String(dir))).ldflags;
    expect(linux.some(flag => flag.startsWith("/threads:"))).toBe(false);
  });
  test("release + LTO: -g1 is the last -g flag, after -glldb, for bun and for deps", () => {
    using dir = tempDir("build-debug-info", {});
    const cfg = linuxConfig({ buildType: "Release", lto: true }, String(dir));
    for (const flags of allCompileFlagLists(cfg)) {
      expect(levelFlags(flags)).toEqual(["-glldb", "-g1"]);
      // Line tables carry no types, so there is nothing to home.
      expect(flags).not.toContain("-fno-standalone-debug");
    }
  });

  test("release without LTO: full, homed debug info", () => {
    using dir = tempDir("build-debug-info", {});
    for (const partial of [
      { buildType: "Release", lto: false },
      { buildType: "Release", asan: true },
    ] as const) {
      const cfg = linuxConfig(partial, String(dir));
      expect(cfg.lto).toBe(false);
      for (const flags of allCompileFlagLists(cfg)) {
        expect(levelFlags(flags)).toEqual(["-glldb", "-g"]);
        expect(flags.indexOf("-gz=zstd")).toBe(flags.indexOf("-g") + 1);
        expect(flags).toContain("-fno-standalone-debug");
      }
    }
  });

  test("debug: -g3 is the last -g flag, after -glldb, homed, for bun and for deps", () => {
    using dir = tempDir("build-debug-info", {});
    const cfg = linuxConfig({ buildType: "Debug" }, String(dir));
    for (const flags of allCompileFlagLists(cfg)) {
      expect(levelFlags(flags)).toEqual(["-glldb", "-g3"]);
      // The compression flag stays attached to the level flag it belongs to.
      expect(flags.indexOf("-gz=zstd")).toBe(flags.indexOf("-g3") + 1);
      expect(flags).toContain("-fno-standalone-debug");
    }
  });

  test("--debug-info=lines: a release build without LTO gets the line tables of an LTO build", () => {
    using dir = tempDir("build-debug-info", {});
    const cfg = linuxConfig({ buildType: "Release", lto: false, debugInfo: "lines" }, String(dir));
    for (const flags of allCompileFlagLists(cfg)) {
      expect(levelFlags(flags)).toEqual(["-glldb", "-g1"]);
      expect(flags).not.toContain("-fno-standalone-debug");
    }
    expect(computeFlags(cfg).ldflags).toContain("-Wl,--gdb-index");
  });

  test("--debug-info=none: -g0 ends the list and the link drops every debug section", () => {
    using dir = tempDir("build-debug-info", {});
    const cfg = linuxConfig({ buildType: "Release", lto: false, debugInfo: "none" }, String(dir));
    for (const flags of allCompileFlagLists(cfg)) {
      expect(levelFlags(flags)).toEqual(["-glldb", "-g0"]);
      expect(flags).not.toContain("-gz=zstd");
    }
    const { ldflags } = computeFlags(cfg);
    expect(ldflags).toContain("-Wl,--strip-debug");
    expect(ldflags).not.toContain("-Wl,--gdb-index");
    expect(ldflags).not.toContain("-Wl,--compress-debug-sections=zlib");
  });

  test("without --debug-info the link keeps, indexes and compresses the debug sections", () => {
    using dir = tempDir("build-debug-info", {});
    for (const lto of [false, true]) {
      const { ldflags } = computeFlags(linuxConfig({ buildType: "Release", lto }, String(dir)));
      expect(ldflags).toContain("-Wl,--gdb-index");
      expect(ldflags).toContain("-Wl,--compress-debug-sections=zlib");
      expect(ldflags).not.toContain("-Wl,--strip-debug");
    }
  });

  test("--linker-map=off: the link writes no map", () => {
    using dir = tempDir("build-debug-info", {});
    const isMap = (flag: string) => flag.startsWith("-Wl,-Map=");
    expect(computeFlags(linuxConfig({ buildType: "Release" }, String(dir))).ldflags.some(isMap)).toBe(true);
    const cfg = linuxConfig({ buildType: "Release", linkerMap: false }, String(dir));
    expect(computeFlags(cfg).ldflags.some(isMap)).toBe(false);
    expect(linkerMapOutputs(cfg)).toEqual([]);
  });

  // Cross-config path only: on macOS, resolveConfig({ os: "darwin" }) probes
  // xcode-select for the real SDK. The flag tables are the same either way.
  test.skipIf(isMacOS)("darwin release + LTO: the DWARF version flag comes first and -g1 still ends the list", () => {
    using dir = tempDir("build-debug-info", {});
    const cfg = resolveConfig(
      { os: "darwin", arch: "aarch64", buildType: "Release", lto: true, buildDir: String(dir) },
      mockToolchain(),
    );
    for (const flags of allCompileFlagLists(cfg)) {
      expect(levelFlags(flags)).toEqual(["-gdwarf-4", "-glldb", "-g1"]);
    }
    expect(computeFlags(cfg).ldflags.some(flag => flag.includes("--thinlto-cache-"))).toBe(false);
  });
});

describe("Linux ThinLTO cache", () => {
  function cacheArgs(cfg: Config): string[] {
    const flags = computeFlags(cfg).ldflags;
    const index = flags.findIndex(flag => flag.includes("--thinlto-cache-dir="));
    return index < 0 ? [] : flags.slice(index - 1, index + 3);
  }

  test.each([
    ["x64", "gnu"],
    ["aarch64", "gnu"],
    ["x64", "musl"],
    ["aarch64", "musl"],
  ] as const)("%s %s uses the shared cache with explicit pruning bounds", (arch, abi) => {
    // Only sysroot detection reads this config fixture; no compiler links it.
    using dir = tempDir("thinlto-cache", { "usr/lib/libc.so": "" });
    const saved = process.env.LINUX_MUSL_SYSROOT;
    try {
      process.env.LINUX_MUSL_SYSROOT = String(dir);
      const cfg = linuxConfig({ buildType: "Release", arch, abi, cacheDir: String(dir) }, String(dir));
      const path = slash(join(cfg.cacheDir, "thinlto", "lld", "llvm-23.1.1", `linux-${arch}-${abi}`));
      expect(cacheArgs(cfg)).toEqual([
        "-Xlinker",
        quote(`--thinlto-cache-dir=${path}`, cfg.host.os === "windows"),
        "-Xlinker",
        "--thinlto-cache-policy=cache_size=10%:cache_size_bytes=4g:cache_size_files=20000:prune_after=168h:prune_interval=5m",
      ]);
      const flags = computeFlags(cfg);
      expect([...flags.cflags, ...flags.cxxflags].some(flag => flag.includes("--thinlto-cache-"))).toBe(false);
      const deps = computeDepFlags(cfg);
      expect([...deps.cflags, ...deps.cxxflags].some(flag => flag.includes("--thinlto-cache-"))).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.LINUX_MUSL_SYSROOT;
      else process.env.LINUX_MUSL_SYSROOT = saved;
    }
  });

  test("cache survives output-directory and LTO-profile changes but isolates LLVM versions and targets", () => {
    using dir = tempDir("thinlto-cache", {});
    const cfg = linuxConfig({ buildType: "Release", cacheDir: String(dir) }, String(dir));
    const args = cacheArgs(cfg);
    expect(cacheArgs({ ...cfg, buildDir: join(String(dir), "another-output"), lto: false })).toEqual(args);
    expect(cacheArgs({ ...cfg, clangVersion: "23.1.3" })).not.toEqual(args);
    expect(cacheArgs({ ...cfg, abi: "musl" })).not.toEqual(args);
    expect(cacheArgs({ ...cfg, arch: "aarch64", x64: false, arm64: true })).not.toEqual(args);
  });

  test("Rust-only release ThinLTO is cached; ASAN and debug without LTO are not", () => {
    using dir = tempDir("thinlto-cache", {});
    const cfg = linuxConfig({ buildType: "Release", lto: false }, String(dir));
    expect(computeFlags(cfg).ldflags).not.toContain("-flto=thin");
    expect(cacheArgs(cfg)).toHaveLength(4);
    expect(cacheArgs(linuxConfig({ buildType: "Release", asan: true, lto: true }, String(dir)))).toEqual([]);
    expect(cacheArgs(linuxConfig({ buildType: "Debug", lto: false }, String(dir)))).toEqual([]);
    expect(cacheArgs(linuxConfig({ buildType: "Debug", asan: false, lto: true }, String(dir)))).toHaveLength(4);
  });

  test.each(["x64", "aarch64"] as const)("Windows %s never receives ELF cache driver options", arch => {
    using dir = tempDir("thinlto-cache", {});
    const cfg = resolveConfig(
      { os: "windows", arch, buildType: "Release", winsysroot: "/fake/winsysroot", buildDir: String(dir) },
      mockToolchain(),
    );
    expect(cacheArgs(cfg)).toEqual([]);
    expect(computeFlags(cfg).ldflags).not.toContain("-Xlinker");
  });

  test("only the resolved ELF LLD with a known LLVM version enables caching", () => {
    using dir = tempDir("thinlto-cache", {});
    const cfg = linuxConfig({ buildType: "Release" }, String(dir));
    for (const ld of ["/fake/ld.bfd", "/fake/ld.gold", "/fake/lld-link.exe", "/fake/ld64.lld", ""]) {
      expect(cacheArgs({ ...cfg, ld })).toEqual([]);
    }
    for (const ld of ["/fake/ld.lld", "/fake/ld.lld-23", "C:\\LLVM\\bin\\ld.lld.exe"]) {
      expect(cacheArgs({ ...cfg, ld })).toHaveLength(4);
    }
    expect(cacheArgs({ ...cfg, clangVersion: undefined })).toEqual([]);
    expect(cacheArgs({ ...cfg, clangVersion: "../unknown" })).toEqual([]);
  });

  test("POSIX shell forwarding preserves spaces, commas, apostrophes and dollars in cache paths", async () => {
    using dir = tempDir("thinlto-cache", {});
    const cfg = linuxConfig(
      { buildType: "Release", cacheDir: join(String(dir), "space, apostrophe's $cache") },
      String(dir),
    );
    cfg.host = { ...cfg.host, os: "linux" };
    const args = cacheArgs(cfg);
    const source = "process.stdout.write(JSON.stringify(process.argv.slice(1)))";
    const captured = await $`${bunExe()} -e ${source} -- ${{ raw: args.join(" ") }}`.quiet();
    expect(JSON.parse(captured.text())).toEqual([
      "-Xlinker",
      `--thinlto-cache-dir=${slash(join(cfg.cacheDir, "thinlto", "lld", "llvm-23.1.1", "linux-x64-gnu"))}`,
      "-Xlinker",
      "--thinlto-cache-policy=cache_size=10%:cache_size_bytes=4g:cache_size_files=20000:prune_after=168h:prune_interval=5m",
    ]);
  });

  test.each(["linux", "windows"] as const)("Ninja preserves cache dollars on a %s host", host => {
    using dir = tempDir("thinlto-cache", {});
    const cfg = linuxConfig({ buildType: "Release", cacheDir: join(String(dir), "space, $cache") }, String(dir));
    cfg.host = { ...cfg.host, os: host };
    const ninja = new Ninja({ buildDir: cfg.buildDir });
    registerCompileRules(ninja, cfg);
    const flags = cacheArgs(cfg);
    link(ninja, cfg, "unused", [], { flags, libs: [] });
    const generated = ninja.toString();
    expect(generated).toContain(`  ldflags = ${flags.join(" ").replaceAll("$", () => "$$")}`);
    expect(generated).toContain("$$cache");
    expect(generated).not.toContain("/link $ldflags");
    expect(generated).toContain(
      host === "windows"
        ? "rspfile_content = $in_newline $lazy $driverflags $ldflags"
        : "@$out.rsp $lazy $driverflags $ldflags -o $out",
    );
  });

  const clang = process.env.BUN_TEST_THINLTO_CLANG;
  test.skipIf(!clang)("Clang response files preserve the full cache path", async () => {
    using dir = tempDir("thinlto-cache", { "probe.c": "int main(void) { return 0; }\n" });
    const cfg = linuxConfig(
      { buildType: "Release", cacheDir: join(String(dir), "space, apostrophe's $cache") },
      String(dir),
    );
    const rsp = join(String(dir), "driver.rsp");
    await Bun.write(rsp, cacheArgs(cfg).join(" ") + "\n");
    const child = Bun.spawn(
      [
        clang!,
        `@${rsp}`,
        "-###",
        "--target=x86_64-unknown-linux-gnu",
        "-fuse-ld=lld",
        "-nostdlib",
        join(String(dir), "probe.c"),
        "-o",
        join(String(dir), "unused"),
      ],
      { stdout: "pipe", stderr: "pipe", timeout: 5_000 },
    );
    const trace = await new Response(child.stderr).text();
    const expected = `--thinlto-cache-dir=${slash(join(cfg.cacheDir, "thinlto", "lld", "llvm-23.1.1", "linux-x64-gnu"))}`;
    // Clang renders a shell command, escaping dollars inside double quotes.
    expect(trace).toContain(JSON.stringify(expected).replaceAll("$", "\\$"));
    expect(trace).toContain("--thinlto-cache-policy=cache_size=10%:cache_size_bytes=4g:");
    expect(await child.exited).toBe(0);
    expect(await Bun.file(join(String(dir), "unused")).exists()).toBe(false);
  });
});

test("GNU explicit zeroing uses the canonical compatibility owner for both libc entry points", () => {
  using dir = tempDir("build-bzero", {});
  const cfg = linuxConfig({ buildType: "Release" }, String(dir));
  const gnu = computeFlags(cfg).ldflags;
  for (const name of ["explicit_bzero", "__explicit_bzero_chk"]) {
    expect(gnu.filter(flag => flag === `-Wl,--wrap=${name}`)).toHaveLength(1);
    expect(computeFlags({ ...cfg, abi: "musl" }).ldflags).not.toContain(`-Wl,--wrap=${name}`);
  }
});
