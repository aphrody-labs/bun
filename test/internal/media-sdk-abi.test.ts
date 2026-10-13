import { describe, expect, test } from "bun:test";
import { qualifyMediaELFs, type MediaELF } from "../../scripts/aphrody/media-sdk-abi";

function elf(file: string, overrides: Partial<MediaELF> = {}): MediaELF {
  return {
    file,
    sha256: "a".repeat(64),
    header:
      "Class: ELF64\nData: 2's complement, little endian\nType: DYN (Shared object file)\nMachine: Advanced Micro Devices X86-64",
    dynamic: "(NEEDED) Shared library: [libc.so.6]\n(RUNPATH) Library runpath: [$ORIGIN]",
    versions: "Name: GLIBC_2.2.5\nName: GLIBC_2.17",
    programHeaders: "",
    ...overrides,
  };
}

describe("portable media SDK ELF qualification", () => {
  test("qualifies all bundled members at the release floor", () => {
    const dependency = elf("lib/libavutil.so.61");
    const root = elf("lib/libmpv.so.2", {
      dynamic: "(NEEDED) Shared library: [libavutil.so.61]\n(RUNPATH) Library runpath: [$ORIGIN]",
      versions: "GLIBC_2.14 GLIBC_2.9",
    });
    const result = qualifyMediaELFs("linux-x64", [root, dependency]);
    expect(result.maximumGLIBC).toBe("2.17");
    expect(result.files[0].needed).toEqual(["libavutil.so.61"]);
    expect(result.files[0].minimumGLIBC).toBe("2.14");
  });

  test("rejects a newer ABI anywhere in the closure", () => {
    expect(() =>
      qualifyMediaELFs("linux-x64", [elf("lib/libmpv.so.2"), elf("lib/libass.so.9", { versions: "GLIBC_2.38" })]),
    ).toThrow("above the 2.17");
    expect(() => qualifyMediaELFs("linux-x64", [elf("lib/libavutil.so.61", { versions: "GLIBC_PRIVATE" })])).toThrow(
      "private libc",
    );
  });

  test("rejects unresolved host libraries and absolute dependency names", () => {
    for (const dependency of ["libass.so.9", "/usr/lib/libass.so.9", "libstdc++.so.6"]) {
      expect(() =>
        qualifyMediaELFs("linux-x64", [
          elf("lib/libmpv.so.2", { dynamic: `(NEEDED) [${dependency}]\n(RUNPATH) [$ORIGIN]` }),
        ]),
      ).toThrow("outside its qualified closure");
    }
  });

  test("rejects wrong architecture, system libc bundling and host paths", () => {
    expect(() => qualifyMediaELFs("linux-arm64", [elf("lib/libmpv.so.2")])).toThrow("architecture");
    expect(() => qualifyMediaELFs("linux-x64", [elf("lib/libc.so.6")])).toThrow("system libc");
    expect(() =>
      qualifyMediaELFs("linux-x64", [
        elf("lib/libmpv.so.2", { dynamic: "(NEEDED) [libc.so.6]\n(RUNPATH) [/usr/lib]" }),
      ]),
    ).toThrow("not relocatable");
    expect(() =>
      qualifyMediaELFs("linux-x64", [
        elf("bin/mpv", {
          dynamic: "(NEEDED) [libc.so.6]\n(RUNPATH) [$ORIGIN/../lib]",
          programHeaders: "[Requesting program interpreter: /tmp/ld.so]",
        }),
      ]),
    ).toThrow("loader");
  });

  test("musl has no GNU libc requirement", () => {
    const input = elf("lib/libmpv.so.2", {
      versions: "",
      dynamic: "(NEEDED) [libc.musl-x86_64.so.1]\n(RUNPATH) [$ORIGIN]",
    });
    expect(qualifyMediaELFs("linux-x64-musl", [input]).maximumGLIBC).toBeNull();
    expect(() => qualifyMediaELFs("linux-x64-musl", [{ ...input, versions: "GLIBC_2.2.5" }])).toThrow("GNU libc");
  });

  test("rejects GNU loader extensions independently of numeric symbol versions", () => {
    expect(() => qualifyMediaELFs("linux-x64", [elf("lib/libmpv.so.2", { versions: "GLIBC_ABI_DT_RELR" })])).toThrow(
      "unsupported libc ABI tag",
    );
    expect(() => qualifyMediaELFs("linux-x64", [elf("lib/libmpv.so.2", { dynamic: "(RELR) 0x1000" })])).toThrow(
      "GNU loader floor",
    );
  });
});
