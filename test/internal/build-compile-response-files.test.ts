import { describe, expect, test } from "bun:test";

import { registerCompileRules } from "../../scripts/build/compile.ts";
import type { Config } from "../../scripts/build/config.ts";
import { Ninja } from "../../scripts/build/ninja.ts";

function rules(host: "windows" | "linux", windows: boolean) {
  const buildDir = "C:/build";
  const cfg = {
    buildDir,
    host: { os: host },
    windows,
    darwin: false,
    cxx: "clang-cl",
    cc: "clang-cl",
    ar: "llvm-lib",
    ld: "C:/llvm/bin/lld-link.exe",
  } as Config;
  const ninja = new Ninja({ buildDir });
  registerCompileRules(ninja, cfg);
  return ninja.toString();
}

describe("Windows-host compiler response files", () => {
  test("keep compile and link flags out of CreateProcess command lines", () => {
    const generated = rules("windows", true);

    expect(generated).toContain("command = clang-cl /nologo /showIncludes @$out.rsp /c $in /Fo$out");
    expect(generated).toContain("rspfile_content = $cxxflags");
    expect(generated).toContain("command = clang-cl /nologo -fuse-ld=lld /clang:-BC:/llvm/bin /Fe$out @$out.rsp");
    expect(generated).toContain("rspfile_content = $in_newline $lazy $driverflags /link $ldflags");
  });

  test("keep non-Windows target linker flags in a response file on a Windows host", () => {
    const generated = rules("windows", false);

    expect(generated).toContain("command = clang-cl @$out.rsp -o $out");
    expect(generated).toContain("rspfile_content = $in_newline $lazy $driverflags $ldflags");
  });

  test("leave POSIX-host command generation unchanged", () => {
    const generated = rules("linux", false);

    expect(generated).toContain("command = clang-cl $cxxflags -MMD -MT $out -MF $out.d -c $in -o $out");
    expect(generated).toContain("rspfile_content = $in_newline");
    expect(generated).toContain("command = clang-cl @$out.rsp $lazy $driverflags $ldflags -o $out");
  });

  test("keep driver options before the linker separator on a POSIX Windows cross-build", () => {
    expect(rules("linux", true)).toContain("@$out.rsp $lazy $driverflags /Fe$out /link $ldflags");
  });
});
