import { describe, expect, test } from "bun:test";
import { isWindows } from "harness";
import { filteredEnv, filterPath } from "../../scripts/aphrody/win/shell/prove.ts";

const noRuntime = () => false;

describe("filterPath", () => {
  test("drops the Git Bash and MSYS2 layers, keeps Git\\cmd and System32, puts uutils first", () => {
    const path = [
      "C:\\Program Files\\Git\\usr\\bin",
      "C:\\Program Files\\Git\\mingw64\\bin",
      "C:\\Program Files\\Git\\bin",
      "C:\\Program Files\\Git\\cmd",
      "C:\\Program Files\\Git\\usr\\bin\\vendor_perl",
      "C:\\msys64\\usr\\bin",
      "C:/msys64/ucrt64/bin",
      "C:\\cygwin64\\bin",
      "C:\\Windows\\system32",
      "C:\\Users\\me\\.cargo\\bin",
    ].join(";");
    const { path: out, removed } = filterPath(path, {
      sep: ";",
      prepend: ["C:\\tools\\uutils\\bin"],
      hasPosixRuntime: noRuntime,
    });
    expect(out.split(";")).toEqual([
      "C:\\tools\\uutils\\bin",
      "C:\\Program Files\\Git\\cmd",
      "C:\\Windows\\system32",
      "C:\\Users\\me\\.cargo\\bin",
    ]);
    expect(removed).toHaveLength(7);
  });

  test("drops any directory that ships msys-2.0.dll or cygwin1.dll", () => {
    const { path, removed } = filterPath("C:\\tools\\rsync\\bin;C:\\bin", {
      sep: ";",
      hasPosixRuntime: dir => dir === "C:\\tools\\rsync\\bin",
    });
    expect({ path, removed }).toEqual({ path: "C:\\bin", removed: ["C:\\tools\\rsync\\bin"] });
  });

  test("removes empty entries, quotes and case-insensitive duplicates", () => {
    const { path } = filterPath('C:\\A;;"C:\\B";c:\\a\\;C:/B', {
      sep: ";",
      prepend: ["C:\\a"],
      hasPosixRuntime: noRuntime,
    });
    expect(path).toBe("C:\\a;C:\\B");
  });

  test("does not mistake similarly named directories for the MSYS2 layer", () => {
    const { path } = filterPath("C:\\gitbin;C:\\Projects\\msys64-notes\\bin;C:\\Program Files\\GitHub CLI", {
      sep: ";",
      hasPosixRuntime: noRuntime,
    });
    expect(path).toBe("C:\\gitbin;C:\\Projects\\msys64-notes\\bin;C:\\Program Files\\GitHub CLI");
  });

  test("filteredEnv replaces every PATH spelling and drops MSYS2 shell markers", () => {
    const env = filteredEnv({ Path: "x", PATH: "y", MSYSTEM: "MINGW64", SHELL: "/usr/bin/bash", HOME: "h" }, "z");
    expect(env).toEqual({ PATH: "z", HOME: "h" });
  });
});

describe.skipIf(!isWindows)("filterPath on this machine", () => {
  test("no POSIX tool resolves into Git Bash or MSYS2", () => {
    const { path } = filterPath(process.env.PATH ?? "");
    for (const bin of ["sed", "grep", "awk", "find", "tar", "bash", "sh", "perl"]) {
      const where = Bun.which(bin, { PATH: path }) ?? "";
      expect({ bin, where }).toEqual({
        bin,
        where: expect.not.stringMatching(/[\\/](Git[\\/](usr|bin|mingw64)|msys64)[\\/]/i),
      });
    }
  });
});
