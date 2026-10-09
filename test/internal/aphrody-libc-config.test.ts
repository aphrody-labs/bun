/**
 * `--aphrody-libc` / `APHRODY_LIBC`: the aphrody-libc overlay archive (Rust
 * SIMD string functions + qsort over musl, aphrody-labs/c-ward) is linked
 * before `-lc` on linux-musl builds only. Configuration logic only: no
 * compiler, no build.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { tempDir } from "harness";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveConfig, type PartialConfig, type Toolchain } from "../../scripts/build/config.ts";

function mockToolchain(): Toolchain {
  return {
    cc: "/fake/llvm/bin/clang",
    cxx: "/fake/llvm/bin/clang++",
    hostCc: undefined,
    hostCxx: undefined,
    clangVersion: "23.1.1",
    clangResourceDir: "/fake/llvm/lib/clang/23",
    ar: "/fake/llvm/bin/llvm-ar",
    ranlib: "/fake/llvm/bin/llvm-ranlib",
    ld: "/fake/llvm/bin/ld.lld",
    ld64Lld: undefined,
    rustLlvmVersion: "23.1.1",
    rustSysroot: undefined,
    rustHostTriple: undefined,
    strip: "/fake/bin/strip",
    llvmStrip: "/fake/llvm/bin/llvm-strip",
    nm: "/fake/llvm/bin/llvm-nm",
    readobj: "/fake/llvm/bin/llvm-readobj",
    objdump: "/fake/llvm/bin/llvm-objdump",
    cxxfilt: "/fake/llvm/bin/llvm-cxxfilt",
    dsymutil: undefined,
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

const savedEnv = { APHRODY_LIBC: process.env.APHRODY_LIBC, LINUX_MUSL_SYSROOT: process.env.LINUX_MUSL_SYSROOT };
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** A directory that passes detectLinuxMuslSysroot's check, plus an overlay archive. */
function muslFixture(dir: string) {
  mkdirSync(join(dir, "sysroot", "usr", "lib"), { recursive: true });
  writeFileSync(join(dir, "sysroot", "usr", "lib", "libc.so"), "");
  const archive = join(dir, "libaphrody_libc.a");
  writeFileSync(archive, "!<arch>\n");
  process.env.LINUX_MUSL_SYSROOT = join(dir, "sysroot");
  return archive;
}

function musl(partial: PartialConfig = {}) {
  return resolveConfig({ os: "linux", arch: "x64", abi: "musl", buildType: "Release", ...partial }, mockToolchain());
}

describe("aphrody-libc overlay", () => {
  test("off by default", () => {
    using dir = tempDir("aphrody-libc-off", {});
    muslFixture(String(dir));
    delete process.env.APHRODY_LIBC;
    expect(musl().aphrodyLibc).toBeUndefined();
    expect(musl({ aphrodyLibc: "off" }).aphrodyLibc).toBeUndefined();
  });

  test("--aphrody-libc=<path> on musl keeps the absolute archive path", () => {
    using dir = tempDir("aphrody-libc-on", {});
    const archive = muslFixture(String(dir));
    expect(musl({ aphrodyLibc: archive }).aphrodyLibc).toBe(archive);
  });

  test("APHRODY_LIBC enables it too", () => {
    using dir = tempDir("aphrody-libc-env", {});
    const archive = muslFixture(String(dir));
    process.env.APHRODY_LIBC = archive;
    expect(musl().aphrodyLibc).toBe(archive);
  });

  test("a missing archive is a configure error", () => {
    using dir = tempDir("aphrody-libc-missing", {});
    muslFixture(String(dir));
    expect(() => musl({ aphrodyLibc: join(String(dir), "nope.a") })).toThrow(/aphrody-libc overlay not found/);
  });

  test("rejected on glibc targets", () => {
    using dir = tempDir("aphrody-libc-gnu", {});
    const archive = muslFixture(String(dir));
    expect(() =>
      resolveConfig(
        { os: "linux", arch: "x64", abi: "gnu", buildType: "Release", linuxSysroot: "/fake", aphrodyLibc: archive },
        mockToolchain(),
      ),
    ).toThrow(/only applies to linux-musl/);
  });
});
