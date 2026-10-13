import { expect, test } from "bun:test";
import manifest from "../src/sdk-manifest.json";
import { mediaSDKHostTarget, mediaSDKTargetFor } from "../src/sdk-platform";
import { mediaSDKPlan, validateSDKAsset } from "../src/sdk";

test("media targets distinguish Linux libc and preserve native ARM64 names", () => {
  const cases = [
    [{ platform: "win32", arch: "x64" }, "windows-x64"],
    [{ platform: "win32", arch: "arm64" }, "windows-arm64"],
    [{ platform: "darwin", arch: "x64" }, "darwin-x64"],
    [{ platform: "darwin", arch: "arm64" }, "darwin-arm64"],
    [{ platform: "linux", arch: "x64", glibcVersionRuntime: "2.39" }, "linux-x64"],
    [{ platform: "linux", arch: "arm64", glibcVersionRuntime: "2.39" }, "linux-arm64"],
    [{ platform: "linux", arch: "x64" }, "linux-x64-musl"],
    [{ platform: "linux", arch: "arm64", glibcVersionRuntime: "" }, "linux-arm64-musl"],
  ] as const;
  for (const [host, target] of cases) expect(mediaSDKTargetFor(host)).toBe(target);
  expect(new Set<string>(cases.map(([, target]) => target))).toEqual(new Set(Object.keys(manifest.targets)));
});

test("media target selection rejects unsupported systems and architectures", () => {
  for (const host of [
    { platform: "freebsd", arch: "x64" },
    { platform: "linux", arch: "ia32" },
    { platform: "win32", arch: "aarch64" },
  ])
    expect(() => mediaSDKTargetFor(host)).toThrow("Unsupported media SDK target");
});

test("host media target is a selected SDK target", () => {
  expect(Object.hasOwn(manifest.targets, mediaSDKHostTarget())).toBe(true);
});

test("all selected SDK sources remain pinned and unqualified distributions stay unavailable", () => {
  for (const target of Object.keys(manifest.targets) as (keyof typeof manifest.targets)[]) {
    for (const component of ["ffmpeg", "mpv"] as const) {
      const plan = mediaSDKPlan(component, target);
      expect(plan.sourceRevision).toMatch(/^[a-f0-9]{40}$/);
      expect(plan.assets).toHaveLength(0);
      expect(plan.status).toMatch(/qualification|qualified/);
      for (const asset of plan.upstreamAssets ?? []) expect(() => validateSDKAsset(asset)).not.toThrow();
    }
    const name = mediaSDKPlan("mpv", target).libraryName;
    expect(name).toBe(
      target.startsWith("windows") ? "libmpv-2.dll" : target.startsWith("darwin") ? "libmpv.2.dylib" : "libmpv.so.2",
    );
  }
  for (const target of ["linux-x64-musl", "linux-arm64-musl", "darwin-x64", "darwin-arm64"] as const) {
    expect(mediaSDKPlan("ffmpeg", target).upstreamAssets).toHaveLength(0);
    expect(mediaSDKPlan("mpv", target).upstreamAssets).toHaveLength(0);
  }
});
