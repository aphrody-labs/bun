import { expect, test } from "bun:test";
import { qualifyMediaELFs } from "./media-sdk-abi";

const header = `ELF Header:
  Class:                             ELF64
  Data:                              2's complement, little endian
  Type:                              EXEC (Executable file)
  Machine:                           Advanced Micro Devices X86-64`;
const dynamic = ` 0x0000000000000001 (NEEDED)             Shared library: [libc.so.6]
 0x000000000000001d (RUNPATH)            Library runpath: [$ORIGIN/../lib]`;
const programHeaders = `      [Requesting program interpreter: /lib64/ld-linux-x86-64.so.2]`;
// GNU readelf -V: Rust std's statx, gettid and __cxa_thread_atexit_impl are weak version needs.
const versions = (gettidFlags: string) => `Version needs section '.gnu.version_r' contains 1 entry:
 Addr: 0x0000000000000000  Offset: 0x000000  Link: 7 (.dynstr)
  000000: Version: 1  File: libc.so.6  Cnt: 4
  0x0010:   Name: GLIBC_2.2.5  Flags: none  Version: 2
  0x0020:   Name: GLIBC_2.14  Flags: none  Version: 3
  0x0030:   Name: GLIBC_2.28  Flags: WEAK  Version: 4
  0x0040:   Name: GLIBC_2.30  Flags: ${gettidFlags}  Version: 5`;
const elf = (gettidFlags: string) => ({
  file: "bin/ffmpeg",
  sha256: "a".repeat(64),
  header,
  dynamic,
  versions: versions(gettidFlags),
  programHeaders,
});

test("weak glibc version needs do not raise the release floor", () => {
  const qualification = qualifyMediaELFs("linux-x64", [elf("WEAK")]);
  expect(qualification.maximumGLIBC).toBe("2.14");
  expect(qualification.files[0]!.minimumGLIBC).toBe("2.14");
});

test("a hard glibc version need above 2.17 is still rejected", () => {
  expect(() => qualifyMediaELFs("linux-x64", [elf("none")])).toThrow(
    "SDK requires GLIBC 2.30, above the 2.17 release floor: bin/ffmpeg",
  );
});
