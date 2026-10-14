import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import catalogue from "../../packages/bun-video/src/sdk-manifest.json";
import {
  mediaBuildPlan,
  mediaBuildTarget,
  mediaGNUCompatibilityRustFlags,
  validateMediaDependencyReceipt,
  type MediaBuildInput,
} from "./media-sdk-build";
import { qualifyMediaMachOs } from "./media-sdk-abi";
import { mediaSourceTree } from "./media-sdk-source";

const root = resolve(import.meta.dir, "../..");
const digest = "a".repeat(64);
const targets = Object.keys(catalogue.targets) as Array<keyof typeof catalogue.targets>;

test("AVIO and runtime SDK share bounded canonical GNU wrapper link arguments", () => {
  const object = join(root, "build/bun-glibc-compat.o"),
    symbols = ["getrandom", "statx", "fcntl64", "getentropy"];
  const flags = mediaGNUCompatibilityRustFlags(object, symbols);
  expect(flags).toContain(`-C link-arg=${object}`);
  for (const symbol of symbols) expect(flags).toContain(`-Wl,--wrap=${symbol}`);
  for (const invalid of [
    symbols.slice(1),
    [...symbols, "getrandom"],
    [...symbols, "symbol;echo"],
    Array(65).fill("getrandom"),
  ])
    expect(() => mediaGNUCompatibilityRustFlags(object, invalid)).toThrow("bounded wrappers");
  expect(() => mediaGNUCompatibilityRustFlags("relative.o", symbols)).toThrow();
});
function input(target: (typeof targets)[number], component: MediaBuildInput["component"]): MediaBuildInput {
  const output = join(root, "build/media-recipe-fixture", target, component);
  return {
    target,
    component,
    root,
    sources: join(root, "vendor"),
    output,
    prefix: join(output, "prefix"),
    dependencies: {},
  };
}

test("eight source recipes select exact native triples and never attest provider execution", () => {
  expect(targets).toHaveLength(8);
  expect(new Set(targets.map(target => mediaBuildTarget(target).rust)).size).toBe(8);
  for (const target of targets) {
    const avio = mediaBuildPlan(input(target, "avio"));
    const args = avio.commands.find(command => command.argv.includes("filmcraft,libav,mpv"))!.argv;
    expect(args).toContain(mediaBuildTarget(target).rust);
    expect(args).toContain("--locked");
    expect(args).toContain("--offline");
    expect(args).toContain("filmcraft,libav,mpv");
    expect(args).not.toContain("gpu");
    expect(avio.hardwareQualification).toBe(false);
    expect(avio.qualification).toContain("recipe-only");
    expect(avio.missing).toContain(`Qualified ${target} ffmpeg SDK prefix`);
    for (const component of ["ffmpeg", "mpv"] as const) {
      const plan = mediaBuildPlan(input(target, component));
      expect(plan.maxJobs).toBe(2);
      expect(plan.commands.every(command => command.timeout > 0 && command.timeout <= 10_800_000)).toBe(true);
      if (target.startsWith("linux"))
        expect(plan.commands[0]!.argv).toContain(join(root, "scripts/aphrody/media-sdk-linux.sh"));
      else {
        expect(plan.commands.flatMap(command => command.argv)).toContain(
          component === "mpv" ? "--wrap-mode=nodownload" : "--disable-autodetect",
        );
        if (target.startsWith("windows"))
          expect(plan.commands[0]!.argv.slice(1, 5)).toEqual([
            "msvc",
            "exec",
            "--arch",
            target.endsWith("arm64") ? "arm64" : "x64",
          ]);
        if (target.startsWith("darwin")) expect(plan.env.MACOSX_DEPLOYMENT_TARGET).toBe("13.0");
      }
    }
  }
});

test.skipIf(process.platform !== "win32")(
  "Windows source plans refuse the WSL Bash launcher even when PATH selects it",
  () => {
    const previous = Bun.env.BUN_MEDIA_BASH;
    try {
      for (const path of ["C:/Windows/System32/bash.exe", "C:/Windows/SysWOW64/bash.exe"]) {
        Bun.env.BUN_MEDIA_BASH = path;
        expect(() => mediaBuildPlan(input("windows-x64", "ffmpeg"))).toThrow("WSL launchers are refused");
      }
    } finally {
      if (previous === undefined) delete Bun.env.BUN_MEDIA_BASH;
      else Bun.env.BUN_MEDIA_BASH = previous;
    }
  },
);

test("dependency bytes, notices, native target and upstream source all stay bound", () => {
  const target = "linux-x64";
  const receipt = {
    schema: 1,
    component: "ffmpeg",
    target,
    sourceRevision: catalogue.targets[target].ffmpeg.sourceRevision,
    files: { "share/licenses/ffmpeg/LICENSE.md": digest, "bin/ffmpeg": digest },
    licenses: ["share/licenses/ffmpeg/LICENSE.md"],
    nativeQualification: { status: "pass", target },
  };
  expect(validateMediaDependencyReceipt(receipt, "ffmpeg", target).files["bin/ffmpeg"]).toBe(digest);
  for (const patch of [
    { target: "linux-x64-musl" },
    { sourceRevision: "b".repeat(40) },
    { files: { "../private": digest } },
    { licenses: ["unhashed-notice"] },
    { nativeQualification: { status: "pending", target } },
    { nativeQualification: { status: "pass", target: "darwin-x64" } },
  ])
    expect(() => validateMediaDependencyReceipt({ ...receipt, ...patch }, "ffmpeg", target)).toThrow();
});

test("the existing Bun native zlib SDK supplies generated headers and an exact libc profile", () => {
  const receipt = {
    schema: 1,
    kind: "native-sdk",
    component: "zlib",
    target: "linux-x64",
    consumer: "aphrody-bun",
    sourceIdentity: digest,
    sourceRevision: "12731092979c6d07f42da27da673a9f6c7b13586",
    configureSHA256: digest,
    ninjaSHA256: digest,
    buildABI: { os: "linux", arch: "x64", abi: "gnu" },
    includes: ["generated"],
    libraries: ["lib/libzlib.a"],
    files: { "generated/zlib.h": digest, "lib/libzlib.a": digest, "licenses/LICENSE.md": digest },
    licenses: ["licenses/LICENSE.md"],
    gate: {
      schema: 1,
      nativeLink: "passed",
      runtimeQualification: "native-tests-passed",
      configureSHA256: digest,
      ninjaSHA256: digest,
      sourceReceiptSHA256: digest,
      evidence: ["native-zlib-fixture.log"],
    },
  };
  expect(validateMediaDependencyReceipt(receipt, "zlib-ng", "linux-x64").files["generated/zlib.h"]).toBe(digest);
  expect(() => validateMediaDependencyReceipt(receipt, "zlib-ng", "linux-x64-musl")).toThrow();
  expect(() =>
    validateMediaDependencyReceipt({ ...receipt, sourceRevision: "b".repeat(40) }, "zlib-ng", "linux-x64"),
  ).toThrow();
  expect(() => validateMediaDependencyReceipt({ ...receipt, includes: ["include"] }, "zlib-ng", "linux-x64")).toThrow();
  expect(() =>
    validateMediaDependencyReceipt({ ...receipt, libraries: ["lib/foreign.a"] }, "zlib-ng", "linux-x64"),
  ).toThrow();
  expect(
    validateMediaDependencyReceipt(
      { ...receipt, buildABI: { os: "linux", arch: "aarch64", abi: "musl" } },
      "zlib-ng",
      "linux-arm64-musl",
    ).files["generated/zlib.h"],
  ).toBe(digest);
});

function macho(file: string, dependency: string, minimum = "13.0") {
  const library = file.startsWith("lib/");
  return {
    file,
    sha256: digest,
    privateHeaders: `Load command 0\n cmd LC_BUILD_VERSION\n platform macos\n minos ${minimum}\nLoad command 1\n cmd LC_LOAD_DYLIB\n name ${dependency} (offset 24)\nLoad command 2\n cmd LC_RPATH\n path ${library ? "@loader_path" : "@loader_path/../lib"} (offset 12)\n${library ? `Load command 3\n cmd LC_ID_DYLIB\n name @rpath/${file.slice(4)} (offset 24)\n` : ""}`,
  };
}

test("Darwin closure rejects a lone valid image with an unqualified transitively loaded dylib", () => {
  const images = [
    macho("bin/ffmpeg", "@rpath/libavcodec.63.dylib"),
    macho("lib/libavcodec.63.dylib", "/usr/lib/libSystem.B.dylib"),
  ];
  expect(qualifyMediaMachOs("darwin-arm64", images).files).toHaveLength(2);
  expect(() =>
    qualifyMediaMachOs("darwin-arm64", [
      { ...images[0]!, privateHeaders: images[0]!.privateHeaders.replace("platform macos", "platform ios") },
      images[1]!,
    ]),
  ).toThrow("foreign Apple platform");
  expect(() => qualifyMediaMachOs("darwin-arm64", images.slice(0, 1))).toThrow("outside its closure");
  expect(() =>
    qualifyMediaMachOs("darwin-arm64", [images[0]!, macho("lib/libavcodec.63.dylib", "/repo/libprivate.dylib")]),
  ).toThrow("outside its closure");
  expect(() =>
    qualifyMediaMachOs("darwin-arm64", [
      images[0]!,
      macho("lib/libavcodec.63.dylib", "/usr/lib/libSystem.B.dylib", "14.0"),
    ]),
  ).toThrow("release floor");
  expect(() =>
    qualifyMediaMachOs("darwin-arm64", [
      { ...images[0]!, privateHeaders: images[0]!.privateHeaders.replace("@loader_path/../lib", "/repo/lib") },
      images[1]!,
    ]),
  ).toThrow("not relocatable");
});

test("source content receipts change when a real build input changes and exclude Git administration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bun-media-source-fixture-"));
  try {
    await mkdir(join(directory, ".git"));
    await Bun.write(join(directory, ".git/config"), "fixture Git metadata");
    await Bun.write(join(directory, "LICENSE"), "fixture notice");
    await Bun.write(join(directory, "configure"), "fixture compiler input");
    const first = await mediaSourceTree(directory);
    expect(Object.keys(first.files).sort()).toEqual(["LICENSE", "configure"]);
    const expected = new Bun.CryptoHasher("sha256")
      .update(JSON.stringify(Object.entries(first.files).sort(([a], [b]) => a.localeCompare(b))))
      .digest("hex");
    expect(first.sourceTreeSHA256).toBe(expected);
    await Bun.write(join(directory, "configure"), "changed fixture compiler input");
    expect((await mediaSourceTree(directory)).sourceTreeSHA256).not.toBe(expected);
  } finally {
    await rm(directory, { recursive: true });
  }
});
