/**
 * WebKit prebuilt source selection (scripts/build/deps/webkit.ts): oven-sh/WebKit by default, aphrody-labs/WebKit
 * once it lists the archive for the pinned sha or when $BUN_WEBKIT_REPO forces it. Configure-time logic only.
 */
import { describe, expect, test } from "bun:test";

import { resolveConfig, type Config, type PartialConfig, type Toolchain } from "../../scripts/build/config.ts";
import {
  APHRODY_WEBKIT_PREBUILTS,
  WEBKIT_APHRODY_REPO,
  WEBKIT_UPSTREAM_REPO,
  WEBKIT_VERSION,
  webkit,
  webkitPrebuiltRepo,
  webkitPrebuiltUrl,
} from "../../scripts/build/deps/webkit.ts";

function mockToolchain(): Toolchain {
  return {
    cc: "/fake/llvm/bin/clang",
    cxx: "/fake/llvm/bin/clang++",
    clangVersion: "23.1.1",
    clangResourceDir: "/fake/llvm/lib/clang/23",
    ar: "/fake/llvm/bin/llvm-ar",
    ranlib: "/fake/llvm/bin/llvm-ranlib",
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
    mt: undefined,
    nasm: undefined,
  };
}

function resolveDarwin(partial: PartialConfig = {}): Config {
  return resolveConfig({ os: "darwin", arch: "aarch64", buildType: "Release", ...partial }, mockToolchain());
}

describe("webkitPrebuiltRepo", () => {
  const name = "bun-webkit-linux-amd64-musl-lto";

  test("defaults to oven-sh while no Aphrody release is listed for the sha", () => {
    expect(APHRODY_WEBKIT_PREBUILTS[WEBKIT_VERSION] ?? []).not.toContain("x");
    expect(webkitPrebuiltRepo(name, "f".repeat(40), undefined)).toBe(WEBKIT_UPSTREAM_REPO);
  });

  test("$BUN_WEBKIT_REPO forces aphrody, oven or an explicit repo", () => {
    expect(webkitPrebuiltRepo(name, WEBKIT_VERSION, "aphrody")).toBe(WEBKIT_APHRODY_REPO);
    expect(webkitPrebuiltRepo(name, WEBKIT_VERSION, "oven")).toBe(WEBKIT_UPSTREAM_REPO);
    expect(webkitPrebuiltRepo(name, WEBKIT_VERSION, "someone/WebKit")).toBe("someone/WebKit");
    expect(() => webkitPrebuiltRepo(name, WEBKIT_VERSION, "nonsense")).toThrow(/BUN_WEBKIT_REPO/);
  });
});

describe("webkit prebuilt source", () => {
  test("keeps oven-sh's archive names and tag (macOS arm64 LTO)", () => {
    const cfg = resolveDarwin();
    if (process.env.BUN_WEBKIT_REPO) return; // forced elsewhere: the default is not under test
    expect(webkitPrebuiltUrl(cfg)).toBe(
      `https://github.com/oven-sh/WebKit/releases/download/autobuild-${WEBKIT_VERSION}/bun-webkit-macos-arm64-lto.tar.gz`,
    );
  });

  test("musl and debug lanes use the same suffixes in both repos", () => {
    // linux/musl needs a sysroot to resolve; the source only reads these flags.
    const musl: Config = {
      ...resolveDarwin({ arch: "x64" }),
      darwin: false,
      linux: true,
      unix: true,
      abi: "musl",
    };
    const old = process.env.BUN_WEBKIT_REPO;
    process.env.BUN_WEBKIT_REPO = "aphrody";
    try {
      const source = webkit.source(musl);
      if (source.kind !== "prebuilt") throw new Error(`expected prebuilt, got ${source.kind}`);
      expect(source.url).toBe(
        `https://github.com/aphrody-labs/WebKit/releases/download/autobuild-${WEBKIT_VERSION}/bun-webkit-linux-amd64-musl-lto.tar.gz`,
      );
      // another repo, same sha: its own cache dir and identity
      expect(source.identity).toContain("aphrody_labs_WebKit");
      expect(source.destDir).toContain("aphrody_labs_WebKit");
    } finally {
      if (old === undefined) delete process.env.BUN_WEBKIT_REPO;
      else process.env.BUN_WEBKIT_REPO = old;
    }
  });
});
