import { expect, test } from "bun:test";
import { hostTargetInfo, linuxABIFor, SUPPORTED_TARGETS, targetFor } from "../src/target";

test("the eight build targets retain distinct native libc triples", () => {
  expect(Object.values(SUPPORTED_TARGETS)).toHaveLength(8);
  for (const arch of ["x64", "arm64"] as const) {
    const machine = arch === "x64" ? "x86_64" : "aarch64";
    expect(targetFor("linux", arch, "gnu")).toBe(`${machine}-unknown-linux-gnu`);
    expect(targetFor("linux", arch, "musl")).toBe(`${machine}-unknown-linux-musl`);
    expect(targetFor("darwin", arch)).toBe(`${machine}-apple-darwin`);
    expect(targetFor("win32", arch)).toBe(`${machine}-pc-windows-msvc`);
  }
  expect(() => targetFor("linux", "x64")).toThrow("qualified GNU/musl");
  expect(() => targetFor("win32", "arm64", "gnu")).toThrow("non-Linux");
});

test("GNU identity comes from the runtime version rather than its compiler or OS", () => {
  expect(linuxABIFor("x64", { glibcVersionRuntime: "2.43", glibcVersionCompiler: "2.31" })).toEqual({
    abi: "gnu",
    version: "2.43",
    source: "process.report.glibcVersionRuntime",
  });
  expect(() => linuxABIFor("x64", { glibcVersionCompiler: "2.31" })).toThrow("Incomplete");
  expect(() => linuxABIFor("x64", { glibcVersionRuntime: "unknown" })).toThrow("Incomplete");
});

test("musl requires a matching loader actually mapped into the process", () => {
  for (const arch of ["x64", "arm64"] as const) {
    const machine = arch === "x64" ? "x86_64" : "aarch64";
    const loader = `/usr/lib/libc.musl-${machine}.so.1`;
    expect(linuxABIFor(arch, { mappedLibraries: `7000-8000 r-xp 0000 00:00 1 ${loader}\n` })).toEqual({
      abi: "musl",
      source: "/proc/self/maps",
      loader,
    });
  }
  expect(() => linuxABIFor("x64", {})).toThrow("could not be qualified");
  expect(() => linuxABIFor("x64", { mappedLibraries: "/etc/alpine-release\n" })).toThrow();
  expect(() =>
    linuxABIFor("x64", { mappedLibraries: "7000-8000 r-xp 0000 00:00 1 /lib/ld-musl-aarch64.so.1\n" }),
  ).toThrow();
});

test("host metadata exposes only reduced observed identity", () => {
  const info = hostTargetInfo();
  expect(info.target).toBe(targetFor(info.platform, info.arch, info.libc?.abi));
  expect(Object.keys(info).sort()).toEqual(
    info.platform === "linux" ? ["arch", "libc", "platform", "target"] : ["arch", "platform", "target"],
  );
  expect(Object.isFrozen(info)).toBe(true);
});
