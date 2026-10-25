/**
 * Regression tests for ninja ordering of post-link steps (strip, smoke test,
 * dsymutil) in scripts/build/bun.ts.
 *
 * The smoke_test and dsymutil rule commands are wrapped through
 * `cfg.jsRuntime` (= process.execPath). When `bun` on PATH resolves inside the
 * build directory, that path is the strip output itself (build/release/bun),
 * and without an ordering edge ninja will run strip and the wrapper exec
 * concurrently, failing with "Permission denied" on the half-written file.
 *
 * These exercise the ninja-emission logic only (no compiler or ninja needed),
 * so they run on every host.
 */
import { describe, expect, test } from "bun:test";
import { isMacOS, tempDir } from "harness";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { binaryChecksWarnOnly, emitPostLink } from "../../scripts/build/bun.ts";
import { shimExpectations } from "../../scripts/build/binary-expectations.ts";
import { resolveConfig, type Config, type PartialConfig, type Toolchain } from "../../scripts/build/config.ts";
import { Ninja, readManifest } from "../../scripts/build/ninja.ts";

test("Windows launcher console detection keeps the freestanding binary contract", () => {
  const contract = shimExpectations();
  expect(contract.importedSymbols).toContain("GetConsoleWindow");
  expect(contract.neededLibs).toEqual({ names: ["KERNEL32.dll", "ntdll.dll"], exact: true });
  expect(contract.exports).toEqual({ exact: [], patterns: [] });
  expect(contract.maxFileSize).toBe(16 * 1024);
});

/** A fully-populated fake toolchain; resolveConfig never spawns any of these. */
function mockToolchain(overrides: Partial<Toolchain> = {}): Toolchain {
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
    ...overrides,
  };
}

/**
 * Resolve a host-targeted config: no os/arch override, so `canRunOnHost` is
 * true and the smoke_test rule emits the real edge (not the phony short-circuit).
 */
function hostConfig(partial: PartialConfig, buildDir: string): Config {
  return resolveConfig(
    { buildDir, ...partial },
    // jsRuntime = the strip output: what resolveToolchain() produces when
    // `bun` on PATH resolves into build/release/.
    mockToolchain({ jsRuntime: join(buildDir, "bun") }),
  );
}

test("runtime output relocation preserves intermediate paths and debug validation stamps", () => {
  using build = tempDir("build-binary-dir", {});
  using output = tempDir("build-binary-output", {});
  const original = hostConfig({ buildType: "Debug" }, String(build));
  const cfg = hostConfig({ buildType: "Debug", binaryDir: String(output) }, String(build));
  expect(cfg.buildDir).toBe(original.buildDir);
  expect(cfg.codegenDir).toBe(original.codegenDir);
  expect(cfg.cacheDir).toBe(original.cacheDir);
  expect(original.binaryDir).toBe(original.buildDir);
  expect({ ...cfg, binaryDir: original.binaryDir }).toEqual(original);
  const relativeOutput = hostConfig({ buildType: "Debug", binaryDir: "build/runtime-output" }, String(build));
  expect(relativeOutput.binaryDir).toBe(resolve(relativeOutput.cwd, "build/runtime-output"));
  const n = new Ninja({ buildDir: cfg.buildDir });
  const exe = join(cfg.binaryDir, "bun-debug" + cfg.exeSuffix);
  const post = emitPostLink(n, cfg, exe, "bun-debug", [], []);
  expect(post).toEqual({ strippedExe: undefined, dsym: undefined });
  const graph = n.toString();
  expect(graph).toContain(n.rel(exe));
  const smoke = readManifest(graph).edges.filter(edge => edge.rule === "smoke_test");
  expect(smoke.map(({ outputs, inputs }) => ({ outputs, inputs }))).toEqual([
    { outputs: ["bun-debug.smoke-test-passed"], inputs: [n.rel(exe)] },
  ]);
});

test("release strip stays beside its relocated runtime", () => {
  using build = tempDir("build-binary-strip", {});
  using output = tempDir("build-binary-strip-output", {});
  const cfg = hostConfig({ buildType: "Release", binaryDir: String(output) }, String(build));
  const n = new Ninja({ buildDir: cfg.buildDir });
  const exe = join(cfg.binaryDir, "bun-profile" + cfg.exeSuffix);
  const post = emitPostLink(n, cfg, exe, "bun-profile", [], []);
  expect(post.strippedExe).toBe(join(cfg.binaryDir, "bun" + cfg.exeSuffix));
  expect(n.toString()).toContain(n.rel(post.strippedExe!));
  expect(buildEdge(n.toString(), "phony")).toBe(`build bun: phony ${n.rel(post.strippedExe!)}`);
});

test("Buildkite refuses relocating binaries outside its existing archive owner", () => {
  using build = tempDir("build-binary-ci", {});
  expect(() => hostConfig({ buildkite: true, binaryDir: join(String(build), "elsewhere") }, String(build))).toThrow(
    "binaryDir relocation is not supported by Buildkite packaging",
  );
  const previous = process.env.BUILDKITE;
  process.env.BUILDKITE = "true";
  try {
    expect(() => hostConfig({ buildkite: false, binaryDir: join(String(build), "elsewhere") }, String(build))).toThrow(
      "binaryDir relocation is not supported by Buildkite packaging",
    );
  } finally {
    if (previous === undefined) delete process.env.BUILDKITE;
    else process.env.BUILDKITE = previous;
  }
});

/** Find one build-edge line in the generated ninja text (continuations unwrapped). */
/**
 * The `build` line for `rule`, with the absolute-path alias Ninja.build()
 * declares for every build-dir output (`| /abs/build/<out>`) folded away so
 * the expectations read as `build <out>: <rule> <ins>`.
 */
function buildEdge(ninja: string, rule: string): string {
  const flat = ninja.replace(/ \$\n +/g, " ");
  const line = flat.split("\n").find(l => l.startsWith("build ") && l.includes(`: ${rule} `));
  if (line === undefined) throw new Error(`no '${rule}' edge in ninja output:\n${ninja}`);
  return line.replace(new RegExp(` \\| \\S+(?=: ${rule} )`), "");
}

describe("emitPostLink ninja ordering", () => {
  test("release smoke_test is ordered after strip", () => {
    using dir = tempDir("build-post-link", {});
    const buildDir = String(dir);
    const cfg = hostConfig({ buildType: "Release" }, buildDir);
    expect(cfg.canRunOnHost).toBe(true);

    const n = new Ninja({ buildDir });
    const exe = resolve(buildDir, `bun-profile${cfg.exeSuffix}`);
    const { strippedExe } = emitPostLink(n, cfg, exe, "bun-profile", [], [exe + ".o"]);
    const out = n.toString();

    expect(strippedExe).toBe(resolve(buildDir, `bun${cfg.exeSuffix}`));
    // strip writes `bun`; the smoke_test wrapper execs cfg.jsRuntime
    // (= `bun` here). Without `|| bun` ninja schedules them concurrently
    // and the wrapper sees a half-written file.
    expect(buildEdge(out, "smoke_test")).toBe(
      `build bun-profile.smoke-test-passed: smoke_test bun-profile${cfg.exeSuffix} || bun${cfg.exeSuffix}`,
    );
    // A Windows target has nothing to strip: its `bun` is a copy.
    const strip = cfg.windows ? "copy_exe" : "strip";
    const scan = cfg.linux || cfg.freebsd ? " |@ bun.binary-verified" : "";
    // A Windows host adds implicit inputs (copy-executable.ts, lock.ts); compare the edge without them.
    expect(buildEdge(out, strip).replace(/ \| [^|]*(?= \|@|$)/, "")).toBe(
      `build bun${cfg.exeSuffix}: ${strip} bun-profile${cfg.exeSuffix}${scan}`,
    );
  });

  describe.each([
    ["plain", {}, { type: "EXEC", relro: false, bindNow: false }],
    ["--hardened=on", { hardened: true, webkit: "local" }, { type: "DYN", relro: true, bindNow: true }],
  ] as [string, PartialConfig, object][])("the stripped executable of a %s Linux build", (_name, partial, layout) => {
    test.each([
      ["fails the build in CI", true],
      ["only warns elsewhere", false],
    ])("is scanned whenever it is written, which %s", (_outcome, ci) => {
      using dir = tempDir("build-post-link", {});
      const buildDir = String(dir);
      const cfg = resolveConfig(
        {
          os: "linux",
          arch: "x64",
          abi: "gnu",
          buildType: "Release",
          linuxSysroot: buildDir,
          buildDir,
          ci,
          ...partial,
        },
        mockToolchain(),
      );
      const n = new Ninja({ buildDir });
      const exe = resolve(buildDir, "bun-profile");
      const { strippedExe } = emitPostLink(n, cfg, exe, "bun-profile", [], [exe + ".o"]);
      const out = n.toString().replace(/ \$\n +/g, " ");

      expect(buildEdge(out, "strip")).toEndWith(" |@ bun.binary-verified");
      expect(buildEdge(out, "stripped_verify")).toStartWith("build bun.binary-verified: stripped_verify bun | ");
      expect(buildEdge(out, "phony")).toContain(" bun.binary-verified");
      expect(/^rule stripped_verify\n  command = (.*)$/m.exec(out)![1]!.includes("--warn-only")).toBe(!ci);

      const spec = JSON.parse(readFileSync(join(buildDir, "bun.verify.json"), "utf8"));
      expect(spec.exe).toBe(strippedExe);
      expect(spec.expect.elf).toEqual({ ...layout, execStack: false, rwxLoad: false, tlsSegment: true });
      for (const needsSymbols of ["staticInitializers", "forbiddenSymbols", "debugInfo"])
        expect(spec.expect).not.toHaveProperty(needsSymbols);
    });
  });

  // `ci` comes from the config alone (resolveConfig never reads the
  // environment for it), so the local rows hold on a CI agent too.
  describe.each([
    ["CI Release", { ci: true, buildType: "Release" }, false],
    ["CI Release with assertions", { ci: true, buildType: "Release", assertions: true }, false],
    // asan: false, because a Debug build defaults to ASan on some hosts and
    // this row is the one that depends on `debug` alone.
    ["CI Debug without ASan", { ci: true, buildType: "Debug", assertions: true, asan: false }, true],
    ["CI ASan", { ci: true, buildType: "Release", asan: true, assertions: true }, true],
    ["local Release", { buildType: "Release" }, true],
    ["local Release with assertions", { buildType: "Release", assertions: true }, true],
    ["local Debug", { buildType: "Debug", assertions: true }, true],
    ["local ASan", { buildType: "Release", asan: true, assertions: true }, true],
  ] as [string, PartialConfig, boolean][])("the static scans of a %s build", (_name, partial, warnOnly) => {
    test(warnOnly ? "only warn" : "fail the build", () => {
      using dir = tempDir("build-post-link", {});
      const buildDir = String(dir);
      const cfg = hostConfig(partial, buildDir);
      const n = new Ninja({ buildDir });
      const exe = resolve(buildDir, `bun-profile${cfg.exeSuffix}`);
      emitPostLink(n, cfg, exe, "bun-profile", [], [exe + ".o"]);
      const out = n.toString().replace(/ \$\n +/g, " ");
      const command = (rule: string) => new RegExp(`^rule ${rule}\\n  command = (.*)$`, "m").exec(out)![1]!;
      const verify = command("binary_verify");
      const duplicates = command("duplicate_symbols");

      expect(binaryChecksWarnOnly(cfg)).toBe(warnOnly);
      if (warnOnly) {
        expect(verify).toContain("verify-binary.ts --warn-only binary ");
        expect(duplicates).toContain("verify-binary.ts --warn-only duplicates ");
      } else {
        expect(verify).not.toContain("--warn-only");
        expect(duplicates).not.toContain("--warn-only");
      }
    });
  });

  test("debug smoke_test has no strip dep (nothing to order against)", () => {
    using dir = tempDir("build-post-link", {});
    const buildDir = String(dir);
    const cfg = hostConfig({ buildType: "Debug", assertions: true }, buildDir);

    const n = new Ninja({ buildDir });
    const exe = resolve(buildDir, `bun-debug${cfg.exeSuffix}`);
    const { strippedExe, dsym } = emitPostLink(n, cfg, exe, "bun-debug", [], [exe + ".o"]);
    const out = n.toString();

    expect({ strippedExe, dsym }).toEqual({ strippedExe: undefined, dsym: undefined });
    expect(buildEdge(out, "smoke_test")).toBe(
      `build bun-debug.smoke-test-passed: smoke_test bun-debug${cfg.exeSuffix}`,
    );
    expect(buildEdge(out, "phony")).toBe(`build bun: phony bun-debug${cfg.exeSuffix}`);
  });

  // Cross-config path only: on macOS, resolveConfig({ os: "darwin" }) probes
  // xcode-select for the real SDK, which belongs to the native test above.
  // The ordering logic is identical to the smoke_test case.
  test.skipIf(isMacOS)("darwin release dsymutil is ordered after strip", () => {
    using dir = tempDir("build-post-link", {});
    const buildDir = String(dir);
    const cfg = resolveConfig({ os: "darwin", arch: "aarch64", buildType: "Release", buildDir }, mockToolchain());
    expect(cfg.canRunOnHost).toBe(false);

    const n = new Ninja({ buildDir });
    const exe = resolve(buildDir, "bun-profile");
    const { dsym } = emitPostLink(n, cfg, exe, "bun-profile", [], [exe + ".o"]);
    const out = n.toString();

    expect(dsym).toBe(resolve(buildDir, "bun-profile.dSYM"));
    expect(buildEdge(out, "dsymutil")).toBe("build bun-profile.dSYM: dsymutil bun-profile || bun");
    // Cross-compile: smoke_test short-circuits to a `check` phony (the
    // binary can't run on this host), so the strip race can't happen there;
    // the static scans (verify-binary, duplicate
    // definitions) run on any host.
    expect(buildEdge(out, "phony")).toBe(
      "build check: phony bun-profile bun-profile.binary-verified bun-profile.duplicate-symbols-checked",
    );
  });

  test.skipIf(isMacOS)("darwin symbols follow relocated binaries while validation remains in the build tree", () => {
    using build = tempDir("build-relocated-dsym", {});
    using output = tempDir("build-relocated-dsym-output", {});
    const cfg = resolveConfig(
      { os: "darwin", arch: "aarch64", buildType: "Release", buildDir: String(build), binaryDir: String(output) },
      mockToolchain(),
    );
    const n = new Ninja({ buildDir: cfg.buildDir });
    const exe = join(cfg.binaryDir, "bun-profile");
    const post = emitPostLink(n, cfg, exe, "bun-profile", [], []);
    expect(post.dsym).toBe(join(cfg.binaryDir, "bun-profile.dSYM"));
    expect(post.strippedExe).toBe(join(cfg.binaryDir, "bun"));
    expect(buildEdge(n.toString(), "dsymutil")).toContain(n.rel(post.strippedExe!));
    expect(n.toString()).toContain("bun-profile.binary-verified");
  });
});
