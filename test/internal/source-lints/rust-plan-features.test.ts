import { expect, test } from "bun:test";
import { metadataFeatureArgs } from "../../../scripts/build/rust/plan.ts";

test("metadata resolves optional runtime dependencies selected by the build", () => {
  expect(
    metadataFeatureArgs([
      "-p",
      "bun_runtime",
      "--lib",
      "--target",
      "x86_64-pc-windows-msvc",
      "--profile",
      "dev",
      "--locked",
      "--features",
      "coreutils,video_native",
      "-Zbuild-std=core,alloc,std",
    ]),
  ).toEqual(["--features", "bun_runtime/coreutils,bun_runtime/video_native"]);
});

test("metadata preserves explicit package features and feature selection flags", () => {
  expect(
    metadataFeatureArgs([
      "--package=bun_runtime@0.1.0",
      "--no-default-features",
      "-Fvideo_native",
      "--features=other/codec native",
    ]),
  ).toEqual(["--no-default-features", "--features", "bun_runtime/video_native,other/codec,bun_runtime/native"]);
  expect(metadataFeatureArgs(["-pbun_runtime", "--all-features"])).toEqual(["--all-features"]);
  expect(metadataFeatureArgs(["--lib", "--target-dir", "build/rust-target"])).toEqual([]);
});

test("metadata refuses a missing Cargo selector value instead of consuming another flag", () => {
  for (const selector of ["-p", "--package", "-F", "--features"])
    for (const suffix of [[], ["--all-features"]])
      expect(() => metadataFeatureArgs([selector, ...suffix])).toThrow(`Missing value for Cargo ${selector}`);
});
