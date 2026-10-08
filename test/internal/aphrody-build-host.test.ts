import { describe, expect, test } from "bun:test";
import {
  buildArgs,
  findTarget,
  provisionScript,
  releaseTargets,
  sectionsFor,
  splitSections,
} from "../../scripts/aphrody/build-host";
import { placeholderNeedsRetiring } from "../../scripts/aphrody/npm-placeholder";
import { runtimePlatforms } from "../../scripts/aphrody/publish-runtime";

describe("aphrody release targets", () => {
  test("upstream's release platforms, with upstream's asset names", () => {
    expect(releaseTargets.map(t => [t.target, t.triplet, t.baselineAlias])).toEqual([
      ["linux-x64", "bun-linux-x64", "bun-linux-x64-baseline"],
      ["linux-aarch64", "bun-linux-aarch64", undefined],
      ["linux-x64-musl", "bun-linux-x64-musl", "bun-linux-x64-musl-baseline"],
      ["linux-aarch64-musl", "bun-linux-aarch64-musl", undefined],
      ["darwin-aarch64", "bun-darwin-aarch64", undefined],
      ["darwin-x64", "bun-darwin-x64", "bun-darwin-x64-baseline"],
      ["windows-x64", "bun-windows-x64", "bun-windows-x64-baseline"],
      ["windows-aarch64", "bun-windows-aarch64", undefined],
    ]);
  });

  test("every target has an npm platform package", () => {
    const assets = new Set(runtimePlatforms.map(p => p.asset));
    for (const t of releaseTargets) expect(assets.has(`${t.triplet}.zip`)).toBe(true);
  });

  test("linux binaries are smoke-tested on an old glibc and on musl", () => {
    expect(findTarget("linux-x64").container).toBe("debian:bullseye");
    expect(findTarget("linux-aarch64-musl").container).toStartWith("alpine:");
    expect(() => findTarget("linux-riscv64")).toThrow(/unknown target/);
  });

  test("build flags", () => {
    expect(buildArgs(findTarget("linux-x64-musl"), { lto: true, versionTag: "aphrody.2" })).toEqual([
      "--profile=release",
      "--os=linux",
      "--arch=x64",
      "--abi=musl",
      "--lto=on",
      "--canary=off",
      "--version-tag=aphrody.2",
    ]);
    expect(buildArgs(findTarget("windows-aarch64"), { lto: false })).toEqual([
      "--profile=release",
      "--os=windows",
      "--arch=aarch64",
      "--lto=off",
      "--canary=off",
    ]);
  });

  test("each target provisions its own sysroot", () => {
    const sysroot = (name: string) => sectionsFor(findTarget(name)).at(-1);
    expect(sysroot("linux-x64")).toBe("glibc-sysroot");
    expect(sysroot("linux-aarch64-musl")).toBe("musl-sysroot");
    expect(sysroot("windows-x64")).toBe("windows-sysroot");
    expect(sysroot("darwin-x64")).toBe("macos-sdk");
  });
});

describe("aphrody build host provisioning", () => {
  test("splitSections", () => {
    const { header, sections } = splitSections("#!/bin/sh\nset -e\n# ---- a\necho a\n# ---- b c\necho b\n");
    expect(header).toBe("#!/bin/sh\nset -e\n");
    expect([...sections]).toEqual([
      ["a", "echo a\n"],
      ["b c", "echo b\n"],
    ]);
  });

  test("the script carries the CI image steps the target needs", () => {
    const script = provisionScript(findTarget("darwin-x64"), "aarch64");
    expect(script).toStartWith("#!/bin/sh\n");
    const { sections } = splitSections(script);
    expect([...sections.keys()]).toEqual(sectionsFor(findTarget("darwin-x64")));
    expect(script).toContain("APHRODY_XMAC_EOF");
  });
});

describe("npm placeholder", () => {
  test("only an undeprecated 0.0.0-stage is retired", () => {
    expect(placeholderNeedsRetiring({ versions: { "0.0.0-stage": {}, "1.0.0": {} } })).toBe(true);
    expect(placeholderNeedsRetiring({ versions: { "0.0.0-stage": { deprecated: "x" } } })).toBe(false);
    expect(placeholderNeedsRetiring({ versions: { "1.0.0": {} } })).toBe(false);
    expect(placeholderNeedsRetiring({})).toBe(false);
  });
});
