import { describe, expect, test } from "bun:test";
import { isWindows, tempDir } from "harness";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { filteredEnv, filterPath } from "../../scripts/aphrody/win/shell/prove.ts";
import {
  applyChanges,
  releaseChanges,
  sourceChanges,
  validateVersion,
} from "../../scripts/aphrody/win/version-sync.ts";

describe("Windows targeted version synchronization", () => {
  test("refuses concurrent edits before applying any planned file", () => {
    using directory = tempDir("windows-version-sync", { "a.json": "original", "b.json": "concurrent" });
    const root = String(directory);
    const changes = [
      { path: "a.json", before: "original", after: "updated", reason: "test" },
      { path: "b.json", before: "original", after: "updated", reason: "test" },
    ];
    expect(() => applyChanges(root, changes)).toThrow("Concurrent change: b.json");
    expect(readFileSync(join(root, "a.json"), "utf8")).toBe("original");
    writeFileSync(join(root, "b.json"), "original");
    applyChanges(root, changes);
    expect(readFileSync(join(root, "a.json"), "utf8")).toBe("updated");
    expect(readFileSync(join(root, "b.json"), "utf8")).toBe("updated");
  });
  test("updates coupled source declarations without changing dependency versions or line endings", () => {
    const manifests = {
      "package.json":
        '{\r\n  "name": "bun",\r\n  "version": "1.4.3",\r\n  "dependencies": { "other": "1.4.3" }\r\n}\r\n',
      "packages/bun-agent-plugin/package.json":
        '{\n  "name": "bun-agent-plugin",\n  "version": "1.4.3",\n  "engines": {\n    "bun": ">=1.4.3"\n  }\n}\n',
    };
    const changes = sourceChanges(path => manifests[path]);
    expect(changes).toHaveLength(2);
    expect(JSON.parse(changes[0].after)).toMatchObject({ version: "1.4.4", dependencies: { other: "1.4.3" } });
    expect(changes[0].after.split("\r\n")).toHaveLength(6);
    expect(JSON.parse(changes[1].after)).toMatchObject({ version: "1.4.4", engines: { bun: ">=1.4.4" } });
    expect(sourceChanges(path => changes.find(change => change.path === path)!.after)).toEqual([]);
  });

  test("rejects unstable versions and mismatched manifest owners", () => {
    for (const version of ["1.4.4-aphrody.1", "01.4.4", "1.4", "1.4.4\n"])
      expect(() => validateVersion(version)).toThrow();
    expect(() => sourceChanges(() => '{"name":"other","version":"1.4.3"}')).toThrow("owner");
  });

  test("requires complete release checksums before rewriting artifact pins", () => {
    expect(() => releaseChanges(() => "", "1.4.4", "bun-v1.4.3", "")).toThrow("tag");
    expect(() => releaseChanges(() => "", "1.4.4", "bun-v1.4.4", "")).toThrow("checksum");
    const assets = ["bun-linux-x64", "bun-linux-x64-musl", "bun-linux-x64-musl-baseline", "bun-linux-aarch64-musl"];
    const sums = assets.map((asset, index) => `${String(index + 1).repeat(64)}  ${asset}.zip`).join("\n");
    const read = (path: string) =>
      path.endsWith("alpine/runtime.Dockerfile")
        ? `ARG BUN_RELEASE=aphrody-v1.4.3-aphrody.2\n${assets
            .slice(1)
            .map(asset => `asset=${asset} sum=${"0".repeat(64)} ;;`)
            .join("\n")}`
        : "image: ghcr.io/aphrody-labs/bun:1.4.3-aphrody.3\nARG BUN_RELEASE=aphrody-v1.4.3-aphrody.3";
    const changes = releaseChanges(read, "1.4.4", "bun-v1.4.4", sums);
    expect(changes).toHaveLength(6);
    expect(changes[0].after).toContain("ghcr.io/aphrody-labs/bun:1.4.4");
    expect(changes[5].after).toContain(`asset=bun-linux-x64-musl sum=${"2".repeat(64)}`);
    expect(changes[5].after).toContain("ARG BUN_RELEASE=bun-v1.4.4");
  });
});

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
