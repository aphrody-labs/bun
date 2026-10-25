/**
 * The native Windows entry of the generated `.cargo/config.toml` (scripts/build/cargo-config.ts):
 * plain `cargo check` from a shell without a developer prompt links with lld-link by absolute path
 * and searches the pinned toolset's libraries, and cc-rs gets the same compilers and INCLUDE/LIB.
 */
import { describe, expect, test } from "bun:test";

import { msvcHostEntry } from "../../scripts/build/cargo-config.ts";

const windowsCfg = {
  host: { os: "windows", arch: "x64" },
  ld: "C:\\LLVM\\bin\\lld-link.exe",
  cc: "C:\\LLVM\\bin\\clang-cl.exe",
  cxx: "C:\\LLVM\\bin\\clang-cl.exe",
  ar: "C:\\LLVM\\bin\\llvm-lib.exe",
} as Parameters<typeof msvcHostEntry>[0];

const env = { LIB: "C:\\VC\\lib\\x64;C:\\SDK\\um\\x64;", INCLUDE: "C:\\VC\\include;C:\\SDK\\ucrt" };

describe("msvcHostEntry", () => {
  test("names lld-link, the pinned library directories and the cc-rs environment", () => {
    const toml = Bun.TOML.parse(msvcHostEntry(windowsCfg, "x86_64-pc-windows-msvc", env)!.join("\n"));
    expect(toml).toEqual({
      target: {
        "x86_64-pc-windows-msvc": {
          linker: "C:\\LLVM\\bin\\lld-link.exe",
          rustflags: ["-C", "link-arg=/LIBPATH:C:\\VC\\lib\\x64", "-C", "link-arg=/LIBPATH:C:\\SDK\\um\\x64"],
        },
      },
      env: {
        CC_x86_64_pc_windows_msvc: { value: "C:\\LLVM\\bin\\clang-cl.exe", force: false },
        CXX_x86_64_pc_windows_msvc: { value: "C:\\LLVM\\bin\\clang-cl.exe", force: false },
        AR_x86_64_pc_windows_msvc: { value: "C:\\LLVM\\bin\\llvm-lib.exe", force: false },
        INCLUDE: { value: "C:\\VC\\include;C:\\SDK\\ucrt", force: false },
        LIB: { value: "C:\\VC\\lib\\x64;C:\\SDK\\um\\x64", force: false },
      },
    });
  });

  test("is left out without an MSVC environment, off Windows, or for another target", () => {
    expect([
      msvcHostEntry(windowsCfg, "x86_64-pc-windows-msvc", {}),
      msvcHostEntry(
        { ...windowsCfg, host: { os: "linux", arch: "x64" } } as typeof windowsCfg,
        "x86_64-pc-windows-msvc",
        env,
      ),
      msvcHostEntry(windowsCfg, "aarch64-linux-android", env),
      msvcHostEntry({ ...windowsCfg, ld: "C:\\VC\\bin\\link.exe" }, "x86_64-pc-windows-msvc", env),
    ]).toEqual([undefined, undefined, undefined, undefined]);
  });
});
