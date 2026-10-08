import { describe, expect, test } from "bun:test";
import {
  availablePlatforms,
  computeRuntimeVersion,
  launcherTable,
  parseRuntimeVersion,
  platformManifest,
  readBaseVersion,
  releaseTag,
  rootManifest,
  runtimePlatforms,
  versionFromTag,
} from "../../scripts/aphrody/publish-runtime";

describe("aphrody runtime versions", () => {
  test("base version comes from the root package.json", () => {
    expect(readBaseVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("<base>-aphrody.<n>", () => {
    expect(computeRuntimeVersion("1.4.3", 1)).toBe("1.4.3-aphrody.1");
    expect(computeRuntimeVersion("1.4.3", 12)).toBe("1.4.3-aphrody.12");
    expect(() => computeRuntimeVersion("1.4.3-canary.1", 1)).toThrow();
    expect(() => computeRuntimeVersion("1.4.3", 0)).toThrow();
    expect(() => computeRuntimeVersion("1.4.3", 1.5)).toThrow();
  });

  test("tags round-trip", () => {
    expect(releaseTag("1.4.3-aphrody.2")).toBe("aphrody-v1.4.3-aphrody.2");
    expect(versionFromTag("aphrody-v1.4.3-aphrody.2")).toBe("1.4.3-aphrody.2");
    expect(versionFromTag("refs/tags/aphrody-v1.4.3-aphrody.2")).toBe("1.4.3-aphrody.2");
    expect(versionFromTag("1.4.3-aphrody.2")).toBe("1.4.3-aphrody.2");
    expect(parseRuntimeVersion("1.4.3-aphrody.7")).toEqual({ base: "1.4.3", n: 7 });
    expect(() => versionFromTag("bun-v1.4.3")).toThrow();
    expect(() => parseRuntimeVersion("1.4.3-aphrody.01")).toThrow();
  });
});

describe("aphrody runtime platforms", () => {
  test("upstream release zips map to @aphrody/bun-runtime-<platform>", () => {
    const byAsset = Object.fromEntries(runtimePlatforms.map(p => [p.asset, p]));
    expect(byAsset["bun-linux-x64.zip"]).toMatchObject({
      pkg: "@aphrody/bun-runtime-linux-x64",
      key: "linux-x64",
      os: "linux",
      cpu: "x64",
      libc: "glibc",
      exe: "bin/bun",
    });
    expect(byAsset["bun-linux-aarch64.zip"]).toMatchObject({
      pkg: "@aphrody/bun-runtime-linux-aarch64",
      key: "linux-arm64",
    });
    expect(byAsset["bun-linux-x64-musl.zip"]).toMatchObject({ key: "linux-x64-musl", libc: "musl" });
    expect(byAsset["bun-darwin-aarch64.zip"]).toMatchObject({
      pkg: "@aphrody/bun-runtime-darwin-aarch64",
      key: "darwin-arm64",
    });
    expect(byAsset["bun-darwin-aarch64.zip"].libc).toBeUndefined();
    expect(byAsset["bun-windows-x64.zip"]).toMatchObject({
      pkg: "@aphrody/bun-runtime-windows-x64",
      key: "win32-x64",
      exe: "bin/bun.exe",
    });
  });

  test("aliases are dropped and packages/keys are unique", () => {
    expect(runtimePlatforms.some(p => p.asset.includes("baseline"))).toBe(false);
    expect(new Set(runtimePlatforms.map(p => p.pkg)).size).toBe(runtimePlatforms.length);
    expect(new Set(runtimePlatforms.map(p => p.key)).size).toBe(runtimePlatforms.length);
    expect(runtimePlatforms.every(p => p.pkg.startsWith("@aphrody/bun-runtime-"))).toBe(true);
  });

  test("only zips present in the release are packaged", () => {
    const got = availablePlatforms([
      "bun-linux-x64.zip",
      "bun-windows-x64.zip",
      "SHA256SUMS.txt",
      "bun-linux-x64-profile.zip",
    ]);
    expect(got.map(p => p.pkg)).toEqual(["@aphrody/bun-runtime-linux-x64", "@aphrody/bun-runtime-windows-x64"]);
  });

  test("manifests", () => {
    const platforms = availablePlatforms(["bun-linux-x64.zip", "bun-darwin-aarch64.zip"]);
    const root = rootManifest("1.4.3-aphrody.1", platforms);
    expect(root.name).toBe("@aphrody/bun-runtime");
    expect(root.bin).toEqual({ bun: "bin/bun.js", bunx: "bin/bunx.js", "bun-runtime": "bin/bun.js" });
    expect(root.optionalDependencies).toEqual({
      "@aphrody/bun-runtime-darwin-aarch64": "1.4.3-aphrody.1",
      "@aphrody/bun-runtime-linux-x64": "1.4.3-aphrody.1",
    });
    const linux = platformManifest(platforms.find(p => p.os === "linux")!, "1.4.3-aphrody.1");
    expect(linux).toMatchObject({ os: ["linux"], cpu: ["x64"], libc: ["glibc"], files: ["bin"] });
    expect(launcherTable(platforms)).toEqual({
      "darwin-arm64": { pkg: "@aphrody/bun-runtime-darwin-aarch64", exe: "bin/bun" },
      "linux-x64": { pkg: "@aphrody/bun-runtime-linux-x64", exe: "bin/bun" },
    });
  });
});
