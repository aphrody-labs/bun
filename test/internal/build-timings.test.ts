/**
 * `bun scripts/build.ts --timings` (scripts/build/timings.ts) reads a build directory: `build.ninja` for the graph,
 * `.ninja_log` for when each command ran, and the mtime of an output a command released early. The build directory
 * here has a `build.ninja` written by the build's own writer, a log in ninja's format with the properties measured on
 * real ones (every output logged under both spellings, lines in no particular order, a stamp that is the command's
 * start except for a restat rule, taken a little late now and then), and output files stamped the way rust/run.ts
 * stamps them.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { tempDir } from "harness";
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { BuildError } from "../../scripts/build/error.ts";
import { type ManifestEdge, Ninja, readManifest } from "../../scripts/build/ninja.ts";
import {
  nativeSDKArtifacts,
  validateNativeSDKGate,
  type NativeSDKGate,
} from "../../scripts/aphrody/native-sdk-factory";
import {
  mergeNativeSDKIndex,
  nativeSDKTarballURL,
  nativeSDKVersion,
  npmPlatform,
} from "../../scripts/aphrody/native-sdk-registry.ts";
import { rustcPhasesPath } from "../../scripts/build/rust/units.ts";
import {
  assertNativeSDKCompatible,
  compatibleNativeSDK,
  fetchNativeSDK,
  nativeSDKAssetURL,
  nativeSDKHash,
  nativeSDKMember,
  nativeSDKPackageName,
  registerNativeSDKRoot,
  validateNativeSDKAsset,
  verifyNativeSDKDirectory,
  type NativeSDKAsset,
} from "../../scripts/build/native-sdk.ts";
import { depSourceDir } from "../../scripts/build/source.ts";
import type { Config } from "../../scripts/build/config.ts";
import {
  type Build,
  chartData,
  chartHtml,
  criticalPath,
  formatReport,
  loadBuild,
  lowParallelismWindows,
  parseNinjaLog,
  queueTimes,
  totalsByRule,
  waits,
} from "../../scripts/build/timings.ts";

const T0 = Date.UTC(2026, 0, 2, 3, 4, 5);
const T1 = T0 + 3_600_000;

const root = tempDir("build-timings", {});
afterAll(() => root[Symbol.dispose]());
const buildDir = join(String(root), "build");
const out = (name: string) => join(buildDir, name);
/** A build directory under `cwd`, as `Config` describes one; `os` is the host's. */
const at = (dir: string, os = "linux") => ({ buildDir: dir, cwd: String(root), host: { os } });
// Outside the build directory, so the graph names it by a relative path, spelled the way the host spells paths.
const ref = join(String(root), "vendor", "dep", ".ref");
const refName = relative(buildDir, ref);
let build: Build;

function touch(path: string, mtimeMs: number, content = ""): void {
  writeFileSync(path, content);
  utimesSync(path, mtimeMs / 1000, mtimeMs / 1000);
}

beforeAll(async () => {
  mkdirSync(buildDir, { recursive: true });
  const n = new Ninja({ buildDir });
  n.pool("dep", 4);
  n.pool("compile", 2);
  n.rule("dep_fetch", {
    command: "fetch $name $repo $commit $dest $cache $patches",
    description: "fetch $name",
    restat: true,
    pool: "dep",
  });
  n.rule("rust_rustc", { command: "rustc $manifest", description: "rustc $crate $what" });
  n.rule("cxx", { command: "c++ $cxxflags -c $in -o $out", description: "cxx $out" });
  n.rule("link", { command: "ld $driverflags $ldflags $in $lazy -o $out", description: "link $out" });

  n.build({
    outputs: [ref],
    rule: "dep_fetch",
    inputs: [],
    vars: { name: "dep", repo: "o/dep", commit: "abc", dest: "vendor/dep", cache: "cache", patches: "" },
  });
  const crate = (name: string, implicitInputs: string[], what = "") =>
    n.build({
      outputs: what === "" ? [out(`lib${name}.rlib`), out(`lib${name}.rmeta`)] : [out(`lib${name}.a`)],
      rule: "rust_rustc",
      inputs: [],
      implicitInputs,
      orderOnlyInputs: [ref],
      vars: { manifest: `${name}.json`, crate: name, what },
      ...(what === "" ? { earlyOutputPrefix: "@early@" } : {}),
    });
  crate("a", []);
  // A library reads only the metadata of the library it depends on; the root links, so it reads the code too.
  crate("b", [out("liba.rmeta")]);
  crate("root", [out("liba.rlib"), out("liba.rmeta"), out("libb.rlib"), out("libb.rmeta")], "→ libroot.a");
  n.build({
    outputs: [out("x.o")],
    rule: "cxx",
    inputs: [join(String(root), "x.cpp")],
    pool: "compile",
    vars: { cxxflags: "-O2" },
  });
  n.build({
    outputs: [out("exe")],
    rule: "link",
    inputs: [out("x.o"), out("libroot.a")],
    vars: { ldflags: "", lazy: "", driverflags: "" },
  });
  n.phony("all", [out("exe")]);
  await n.write();

  const edges = readManifest(n.toString()).edges;
  const edgeOf = (output: string) => edges.find(e => e.outputs.includes(output))!;
  // ninja logs a command once per output, implicit outputs included, with the same times on every line.
  const logged = (edge: ManifestEdge, start: number, end: number, stampMs: number) =>
    [...edge.outputs, ...edge.implicitOutputs].map(
      o => `${start}\t${end}\t${BigInt(stampMs) * 1_000_000n}\t${o}\tf00d`,
    );
  const log = [
    "# ninja log v7",
    // The second ninja, an hour later: x.cpp was edited. x.o waited two seconds for something outside the graph.
    ...logged(edgeOf("x.o"), 2000, 2050, T1 + 2000),
    ...logged(edgeOf("exe"), 2100, 3400, T1 + 2100),
    // The first ninja built everything. A restat rule's stamp is its output's mtime, not its start.
    ...logged(edgeOf(refName), 5, 105, T0 + 100),
    ...logged(edgeOf("liba.rlib"), 110, 1110, T0 + 110),
    ...logged(edgeOf("x.o"), 110, 160, T0 + 112),
    ...logged(edgeOf("libb.rlib"), 412, 2412, T0 + 412),
    // ninja got to `.ninja_lock` 21 ms after it read its clock.
    ...logged(edgeOf("libroot.a"), 2415, 3415, T0 + 2415 + 21),
    ...logged(edgeOf("exe"), 3420, 3900, T0 + 3420),
    // An output of a graph that is gone.
    `0\t9000\t${BigInt(T0) * 1_000_000n}\tremoved.o\tf00d`,
    "",
  ];
  writeFileSync(out(".ninja_log"), log.join("\n"));

  // rust/run.ts stamps the `.rmeta` when rustc reports it and the `.rlib` when rustc exits.
  touch(out("liba.rmeta"), T0 + 110 + 300);
  touch(out("liba.rlib"), T0 + 1105);
  touch(out("libb.rmeta"), T0 + 412 + 200);
  touch(out("libb.rlib"), T0 + 2410);

  // --time-trace=on: clang's trace beside the object, rustc's passes beside the crate.
  touch(
    out("x.json"),
    T1 + 2050,
    JSON.stringify({
      beginningOfTime: (T1 + 2001) * 1000,
      traceEvents: [
        { ph: "X", name: "ExecuteCompiler", ts: 0, dur: 48_000 },
        { ph: "X", name: "Frontend", ts: 1000, dur: 30_000 },
        { ph: "X", name: "Source", ts: 2000, dur: 20_000, args: { detail: "x.h" } },
        { ph: "X", name: "Backend", ts: 31_000, dur: 15_000 },
        { ph: "X", name: "Total Frontend", ts: 0, dur: 30_000 },
        { ph: "M", name: "process_name", ts: 0 },
      ],
    }),
  );
  const passes = (at: number) => [
    { name: "type_check_crate", startMs: at + 430, endMs: at + 600 },
    // The pass type_check_crate is part of. rustc prints a pass as it ends, with its duration and no clock time, so
    // run.ts dates it by when the line arrived: this one's line was read 2 ms late, and it seems to start after the
    // pass inside it.
    { name: "analysis", startMs: at + 432, endMs: at + 650 },
    { name: "a sliver", startMs: at + 700, endMs: at + 703 },
    { name: "LLVM_passes", startMs: at + 700, endMs: at + 2300 },
    { name: "total", startMs: at + 420, endMs: at + 2400 },
  ];
  writeFileSync(rustcPhasesPath(out("libb.rlib")), JSON.stringify(passes(T0)));
  // A build interrupted while the file was being written leaves part of one.
  writeFileSync(rustcPhasesPath(out("libroot.a")), `[{"name":"total","sta`);
  // Left by a build of `a` that was interrupted the day before: not the execution in the log.
  writeFileSync(rustcPhasesPath(out("liba.rlib")), JSON.stringify(passes(T0 - 86_400_000)));

  build = loadBuild(at(buildDir));
});

describe("native SDK consumer", () => {
  function fixture(): NativeSDKAsset {
    const files = {
      "lib/libfixture.a": "library",
      "source/include/fixture.h": "header",
      "licenses/LICENSE": "license",
    };
    return {
      schema: 1,
      kind: "native-sdk",
      component: "boringssl",
      source: { kind: "github-archive", repo: "fixture/source", commit: "a".repeat(40) },
      sourceIdentity: "b".repeat(64),
      target: "linux-x64",
      sourceRoot: "source",
      buildABI: {
        os: "linux",
        arch: "x64",
        abi: "gnu",
        buildType: "Debug",
        asan: false,
        lto: false,
        baseline: true,
        crossTarget: null,
        osxDeploymentTarget: null,
        pgo: false,
        tools: { cc: "clang version 23.1.1", cxx: "clang version 23.1.1" },
        systemHeaders: {},
        nativeWindowsSDK: null,
        flags: { cflags: ["-march=nehalem"], cxxflags: [] },
        build: { kind: "direct" },
        provides: {},
      },
      includes: ["source/include"],
      libraries: ["lib/libfixture.a"],
      defines: [],
      licenses: ["licenses/LICENSE"],
      files: Object.fromEntries(
        Object.entries(files).map(([name, contents]) => [
          name,
          new Bun.CryptoHasher("sha256").update(contents).digest("hex"),
        ]),
      ),
      qualification: "native-tests-passed",
      asset: {
        url: "https://bun-lib.aphrody.app/native/fixture.zip",
        bytes: 100,
        sha256: "c".repeat(64),
        format: "zip",
      },
    };
  }

  test("requires exact source patches, flags and compiler ABI", () => {
    const asset = fixture();
    expect(() => assertNativeSDKCompatible(asset, asset.sourceIdentity, asset.buildABI)).not.toThrow();
    expect(() => assertNativeSDKCompatible(asset, "d".repeat(64), asset.buildABI)).toThrow("source/patch/ABI mismatch");
    expect(() =>
      assertNativeSDKCompatible(asset, asset.sourceIdentity, {
        ...asset.buildABI,
        flags: { cflags: ["-march=native"] },
      }),
    ).toThrow("source/patch/ABI mismatch");
    expect(() =>
      assertNativeSDKCompatible(asset, asset.sourceIdentity, {
        ...asset.buildABI,
        tools: { cc: "clang version 23.1.2" },
      }),
    ).toThrow("source/patch/ABI mismatch");
    expect(nativeSDKHash({ b: 2, a: 1 })).toBe(nativeSDKHash({ a: 1, b: 2 }));
  });

  test("auto selection retains source acquisition for another compiler; explicit SDK remains strict", () => {
    const asset = fixture();
    const localABI = { ...asset.buildABI, tools: { cc: "clang version 23.1.3", cxx: "clang version 23.1.3" } };
    expect(compatibleNativeSDK([asset], asset.sourceIdentity, localABI, false)).toBeUndefined();
    expect(() => compatibleNativeSDK([asset], asset.sourceIdentity, localABI, true)).toThrow(
      "source/patch/ABI mismatch",
    );
    expect(compatibleNativeSDK([asset], asset.sourceIdentity, asset.buildABI, false)).toBe(asset);
    const corrupt = { ...asset, asset: { ...asset.asset, sha256: "invalid" } };
    expect(() => compatibleNativeSDK([corrupt], asset.sourceIdentity, asset.buildABI, false)).toThrow("checksum pins");
  });

  test("keeps cross-dependency source-relative header paths", () => {
    const cfg = { localDeps: {}, vendorDir: "/fixture/vendor" } as Config;
    registerNativeSDKRoot(cfg, "boringssl", "/fixture/sdk");
    expect(depSourceDir(cfg, "boringssl")).toBe(join("/fixture/sdk", "source"));
    for (const invalid of ["../secret", "source/../secret", "C:/secret", "source\\header", "source//header"])
      expect(nativeSDKMember(invalid)).toBe(false);
    const asset = fixture();
    asset.includes = ["include/0"];
    expect(() => validateNativeSDKAsset(asset)).toThrow("include directory");
    asset.includes = ["source/include"];
    asset.asset.sha256 = "";
    expect(() => validateNativeSDKAsset(asset)).toThrow("checksum pins");
  });

  test("rechecks cached SDK bytes and rejects additional files", async () => {
    const asset = fixture();
    const { asset: _distribution, ...receipt } = asset;
    using dir = tempDir("native-sdk-consumer", {
      "bun-native-sdk.json": JSON.stringify(receipt),
      "lib/libfixture.a": "library",
      "source/include/fixture.h": "header",
      "licenses/LICENSE": "license",
    });
    await verifyNativeSDKDirectory(String(dir), asset);
    writeFileSync(join(String(dir), "source/include/fixture.h"), "modified");
    await expect(verifyNativeSDKDirectory(String(dir), asset)).rejects.toThrow("checksum mismatch");
    writeFileSync(join(String(dir), "source/include/fixture.h"), "header");
    writeFileSync(join(String(dir), "source/include/unregistered.h"), "extra");
    await expect(verifyNativeSDKDirectory(String(dir), asset)).rejects.toThrow("unregistered member");
  });

  test("names registry packages, versions and tarballs per target", () => {
    expect(nativeSDKPackageName("boringssl", "linux", "aarch64", "musl")).toBe(
      "@aphrody/bun-native-sdk-boringssl-linux-arm64-musl",
    );
    expect(nativeSDKPackageName("zlib", "windows", "x64")).toBe("@aphrody/bun-native-sdk-zlib-windows-x64");
    expect(nativeSDKVersion("a".repeat(40), "b".repeat(64))).toBe("0.0.0-caaaaaaaaaaaa.abbbbbbbbbbbbbbbb");
    expect(() => nativeSDKVersion("main", "b".repeat(64))).toThrow("commit and an identity");
    expect(nativeSDKTarballURL("@aphrody/bun-native-sdk-zlib-linux-x64", "0.0.0-c1.a2")).toBe(
      "https://registry.npmjs.org/@aphrody/bun-native-sdk-zlib-linux-x64/-/bun-native-sdk-zlib-linux-x64-0.0.0-c1.a2.tgz",
    );
    expect([
      npmPlatform({ os: "linux", arch: "aarch64", abi: "musl" }),
      npmPlatform({ os: "linux", arch: "x64", abi: "gnu" }),
      npmPlatform({ os: "windows", arch: "x64", abi: undefined }),
    ]).toEqual([
      { os: ["linux"], cpu: ["arm64"], libc: ["musl"] },
      { os: ["linux"], cpu: ["x64"], libc: ["glibc"] },
      { os: ["win32"], cpu: ["x64"] },
    ]);
  });

  test("accepts registry tarballs and mirrors only them", () => {
    const asset = fixture();
    const url = "https://registry.npmjs.org/@aphrody/bun-native-sdk-boringssl-linux-x64/-/fixture.tgz";
    asset.asset = { ...asset.asset, url, format: "npm" };
    expect(() => validateNativeSDKAsset(asset)).not.toThrow();
    expect(nativeSDKAssetURL(asset.asset, "https://mirror.example/npm")).toBe(
      "https://mirror.example/npm/@aphrody/bun-native-sdk-boringssl-linux-x64/-/fixture.tgz",
    );
    expect(nativeSDKAssetURL(asset.asset, "")).toBe(url);
    expect(() => nativeSDKAssetURL(asset.asset, "http://mirror.example")).toThrow("https registry");
    const zip = fixture();
    expect(nativeSDKAssetURL(zip.asset, "https://mirror.example/npm")).toBe(zip.asset.url);
    asset.asset.url = url.replace(".tgz", ".zip");
    expect(() => validateNativeSDKAsset(asset)).toThrow("checksum pins");
  });

  test("a newer pack replaces the index entry of the same component, target and ABI", () => {
    const old = fixture();
    const newer = { ...fixture(), asset: { ...old.asset, sha256: "d".repeat(64) } };
    const zlib = { ...fixture(), component: "zlib" };
    const otherABI = { ...fixture(), buildABI: { ...old.buildABI, lto: true } };
    expect(mergeNativeSDKIndex([zlib, old], [newer, otherABI])).toEqual([newer, otherABI, zlib]);
    expect(() => mergeNativeSDKIndex([], [{ ...newer, asset: { ...newer.asset, bytes: 0 } }])).toThrow("checksum pins");
  });

  test("downloads an npm package from a registry mirror and rejects members outside package/", async () => {
    const asset = fixture();
    const { asset: _distribution, ...receipt } = asset;
    const path = "/@aphrody/bun-native-sdk-boringssl-linux-x64/-/fixture.tgz";
    let tarball = new Uint8Array();
    using server = Bun.serve({
      port: 0,
      fetch: req => (new URL(req.url).pathname === path ? new Response(tarball) : new Response("", { status: 404 })),
    });
    using dir = tempDir("native-sdk-npm", {});
    const descriptor = join(String(dir), "descriptor.json");
    async function fetchPackage(members: Record<string, string>, directory: string) {
      tarball = await new Bun.Archive(members, { compress: "gzip" }).bytes();
      asset.asset = {
        url: `https://registry.npmjs.org${path}`,
        bytes: tarball.byteLength,
        sha256: new Bun.CryptoHasher("sha256").update(tarball).digest("hex"),
        format: "npm",
      };
      await Bun.write(descriptor, JSON.stringify(asset));
      return fetchNativeSDK(descriptor, join(String(dir), directory));
    }
    const members = {
      "package/package.json": JSON.stringify({ name: "fixture", version: "0.0.0" }),
      "package/bun-native-sdk.json": JSON.stringify(receipt),
      "package/lib/libfixture.a": "library",
      "package/source/include/fixture.h": "header",
      "package/licenses/LICENSE": "license",
    };
    const registry = process.env.BUN_NATIVE_SDK_REGISTRY;
    process.env.BUN_NATIVE_SDK_REGISTRY = server.url.href;
    try {
      await fetchPackage(members, "sdk");
      const { "package/package.json": _manifest, ...rest } = members;
      await expect(fetchPackage({ ...rest, "outside/package.json": "{}" }, "escaped")).rejects.toThrow(
        "outside package/",
      );
    } finally {
      if (registry === undefined) delete process.env.BUN_NATIVE_SDK_REGISTRY;
      else process.env.BUN_NATIVE_SDK_REGISTRY = registry;
    }
    const sdk = join(String(dir), "sdk");
    expect({
      header: await Bun.file(join(sdk, "source/include/fixture.h")).text(),
      manifest: existsSync(join(sdk, "package.json")),
      escaped: existsSync(join(String(dir), "escaped")),
    }).toEqual({ header: "header", manifest: false, escaped: false });
  });
});

const labels = (xs: { label: string }[]) => xs.map(x => x.label);

describe("readManifest", () => {
  test("reads back what Ninja writes: outputs under both spellings, each kind of input, bindings, pools", () => {
    const { edges, pools, rules } = build.manifest;
    expect([...pools]).toEqual([
      ["dep", 4],
      ["compile", 2],
    ]);
    expect(rules.get("dep_fetch")).toEqual({
      description: "fetch $name",
      restat: true,
      generator: false,
      pool: "dep",
    });
    const b = edges.find(e => e.bindings.crate === "b")!;
    expect(b).toEqual({
      rule: "rust_rustc",
      outputs: ["libb.rlib", "libb.rmeta"],
      implicitOutputs: [out("libb.rlib"), out("libb.rmeta")],
      inputs: [],
      implicitInputs: ["liba.rmeta"],
      orderOnlyInputs: [refName],
      validations: [],
      bindings: { manifest: "b.json", crate: "b", what: "", early_output_prefix: "@early@" },
    });
    expect(edges.find(e => e.rule === "cxx")!.bindings.pool).toBe("compile");
    expect(edges.find(e => e.rule === "phony")).toMatchObject({ outputs: ["all"], inputs: ["exe"] });
  });

  test("a value that ends in a dollar does not continue onto the next line", () => {
    const n = new Ninja({ buildDir });
    n.rule("codegen", { command: "cd $cwd && run $args", description: "gen $desc" });
    n.build({
      outputs: [out("a.h")],
      rule: "codegen",
      inputs: [],
      vars: { cwd: ".", args: "--match '^a$'$", desc: "a" },
    });
    expect(readManifest(n.toString()).edges[0]!.bindings).toEqual({ cwd: ".", args: "--match '^a$'$", desc: "a" });
  });
});

describe("native SDK artifact selection", () => {
  test("selects the complete dependency object set without adjacent libraries or codegen files", () => {
    const manifest = readManifest(
      "build codec: phony codec-objects\nbuild codec-objects: phony obj/a/same.c.o obj/b/same.c.o codec-ready\nbuild codec-ready: phony generated/config.h\nbuild foreign: phony libforeign.a\n",
    );
    expect(nativeSDKArtifacts(manifest, "codec")).toEqual(["obj/a/same.c.o", "obj/b/same.c.o"]);
    expect(() => nativeSDKArtifacts(manifest, "missing")).toThrow("No compiled dependency target");
    expect(() => nativeSDKArtifacts(manifest, "../codec")).toThrow("Invalid native SDK component");
  });
  test("keeps nested library names and refuses source-only dependencies", () => {
    const manifest = readManifest(
      "build library: phony deps/a/libone.a deps/a/libtwo.a\nbuild headers: phony generated/header.h\n",
    );
    expect(nativeSDKArtifacts(manifest, "library")).toEqual(["deps/a/libone.a", "deps/a/libtwo.a"]);
    expect(() => nativeSDKArtifacts(manifest, "headers")).toThrow("no compiled SDK library");
  });
  test("rejects stale or absent native qualification instead of publishing a compiled-looking file", () => {
    const gate: NativeSDKGate = {
      schema: 1,
      nativeLink: "passed",
      runtimeQualification: "native-tests-passed",
      configureSHA256: "1".repeat(64),
      ninjaSHA256: "2".repeat(64),
      sourceReceiptSHA256: "3".repeat(64),
      evidence: ["native-runtime-gate.json"],
    };
    expect(() => validateNativeSDKGate(gate, "1".repeat(64), "2".repeat(64))).not.toThrow();
    expect(() => validateNativeSDKGate(gate, "4".repeat(64), "2".repeat(64))).toThrow("matching linked build");
    expect(() => validateNativeSDKGate({ ...gate, evidence: [] }, "1".repeat(64), "2".repeat(64))).toThrow(
      "qualification receipt",
    );
  });
});

describe("parseNinjaLog", () => {
  test("accepts only the format the build's ninja writes", () => {
    expect(parseNinjaLog("# ninja log v7\n1\t2\t3000000\ta.o\tbeef\n")).toEqual([
      { start: 1, end: 2, stamp: 3000000n, output: "a.o" },
    ]);
    const otherNinja = () => parseNinjaLog("# ninja log v6\n1\t2\t3\ta.o\tbeef\n");
    expect(otherNinja).toThrow(BuildError);
    expect(otherNinja).toThrow('.ninja_log starts with "# ninja log v6", not "# ninja log v7"');
  });
});

describe("loadBuild", () => {
  test("splits the log into the ninjas that wrote it, whatever order its lines are in", () => {
    expect(build.runs.map(r => [r.epochMs, labels(r.executions)])).toEqual([
      [T0, ["fetch dep", "cxx x.o", "rustc a", "rustc b", "rustc root → libroot.a", "link exe"]],
      [T1, ["cxx x.o", "link exe"]],
    ]);
  });

  test("keeps each edge's last execution", () => {
    const last = [...build.last.values()].map(x => [
      x.label,
      build.runs[1]!.executions.includes(x) ? "second" : "first",
    ]);
    expect(last.sort()).toEqual([
      ["cxx x.o", "second"],
      ["fetch dep", "first"],
      ["link exe", "second"],
      ["rustc a", "first"],
      ["rustc b", "first"],
      ["rustc root → libroot.a", "first"],
    ]);
  });

  test("finds when a command released an output early from the output's mtime", () => {
    const released = [...build.last.values()].map(x => [x.label, [...x.released]]);
    expect(released.filter(([, r]) => r!.length > 0)).toEqual([
      ["rustc a", [[out("liba.rmeta"), 300]]],
      ["rustc b", [[out("libb.rmeta"), 200]]],
    ]);
  });

  test("takes a compiler's report only when it is about the execution in the log", () => {
    const reports = Object.fromEntries([...build.last.values()].map(x => [x.label, x.selfReport.map(p => p.name)]));
    expect(reports).toEqual({
      "cxx x.o": ["ExecuteCompiler", "Frontend", "Source x.h", "Backend"],
      "fetch dep": [],
      "link exe": [],
      "rustc a": [],
      // Without the sliver: a phase under 10 ms is not kept.
      "rustc b": ["type_check_crate", "analysis", "LLVM_passes", "total"],
      "rustc root → libroot.a": [],
    });
  });
});

describe("analysis", () => {
  test("totals by kind of edge", () => {
    expect(totalsByRule(build).map(t => [t.rule, t.edges, t.totalMs, t.slowest.label])).toEqual([
      ["rust_rustc", 3, 4000, "rustc b"],
      ["link", 1, 1300, "link exe"],
      ["dep_fetch", 1, 100, "fetch dep"],
      ["cxx", 1, 50, "cxx x.o"],
    ]);
  });

  test("the critical path counts a crate only up to its .rmeta when the next step reads only that", () => {
    const path = criticalPath(build);
    expect(path.steps.map(s => [s.execution.label, s.blocksNextForMs])).toEqual([
      ["fetch dep", 100],
      // `b` reads liba.rmeta, released 300 ms into `a`'s 1000.
      ["rustc a", 300],
      // The root links libb.rlib: all of `b`.
      ["rustc b", 2000],
      ["rustc root → libroot.a", 1000],
      // From the second run, the last time it ran.
      ["link exe", 1300],
    ]);
    expect(path.totalMs).toBe(4700);
  });

  test("the most recent run: when few commands ran, and how long each waited after its inputs existed", () => {
    const run = build.runs.at(-1)!;
    expect(lowParallelismWindows(run).map(w => [w.from, w.to, labels(w.running)])).toEqual([
      [0, 3400, ["cxx x.o", "link exe"]],
    ]);
    // What each command was waiting on: the command of the run that made the last of its inputs to exist.
    const why = (r: typeof run) => [...waits(build, r)].map(([x, w]) => [x.label, w.blocker?.label, w.readyAt, w.ms]);
    expect(why(run)).toEqual([
      ["cxx x.o", undefined, 0, 2000],
      ["link exe", "cxx x.o", 2050, 50],
    ]);
    expect(why(build.runs[0]!)).toEqual([
      ["fetch dep", undefined, 0, 5],
      ["cxx x.o", undefined, 0, 110],
      ["rustc a", "fetch dep", 105, 5],
      // `b` could start when `a` released liba.rmeta, 300 ms into it, not when `a` ended.
      ["rustc b", "rustc a", 410, 2],
      ["rustc root → libroot.a", "rustc b", 2412, 3],
      ["link exe", "rustc root → libroot.a", 3415, 5],
    ]);
    expect(
      queueTimes(build, run).map(q => [q.pool, q.depth, q.commands, q.totalMs, q.longest.execution.label]),
    ).toEqual([
      // Nothing x.o reads was built by this run, so it could have started at 0.
      ["compile", 2, 1, 2000, "cxx x.o"],
      // exe waited for x.o, which ended at 2050.
      [undefined, undefined, 1, 50, "link exe"],
    ]);
  });
});

describe("a build in which ninja started over", () => {
  // ninja brings build.ninja up to date first; when that rewrote it, ninja starts over and counts from zero again.
  // Every CI build does: the Rust plan does not exist yet, and a new plan reconfigures.
  test("is one run on one clock, and everything else waits on the edge that writes build.ninja", async () => {
    using restarted = tempDir("build-timings-restart", {});
    const dir = join(String(restarted), "build");
    mkdirSync(dir, { recursive: true });
    const where = { buildDir: dir, cwd: String(restarted), host: { os: "linux" } };
    const n = new Ninja({ buildDir: dir });
    n.rule("dep_fetch", {
      command: "fetch $name $repo $commit $dest $cache $patches",
      description: "fetch $name",
      restat: true,
    });
    n.rule("regen", { command: "configure", description: "reconfigure", generator: true });
    n.rule("cxx", { command: "c++ $cxxflags -c $in -o $out", description: "cxx $out" });
    const stamp = join(String(restarted), "vendor", ".ref");
    const vars = { name: "dep", repo: "o/dep", commit: "abc", dest: "vendor", cache: "cache", patches: "" };
    n.build({ outputs: [stamp], rule: "dep_fetch", inputs: [], vars });
    n.build({ outputs: [join(dir, "build.ninja")], rule: "regen", inputs: [], implicitInputs: [stamp] });
    // Nothing in the graph says x.o needs build.ninja.
    n.build({
      outputs: [join(dir, "x.o")],
      rule: "cxx",
      inputs: [join(String(restarted), "x.cpp")],
      vars: { cxxflags: "" },
    });
    await n.write();

    const ns = (ms: number) => BigInt(ms) * 1_000_000n;
    const log = (reconfigure: { start: number; end: number }, xStartedAtMs: number) =>
      writeFileSync(
        join(dir, ".ninja_log"),
        [
          "# ninja log v7",
          // The first process only fetched and reconfigured. The fetch's stamp is not its start: the rule restats, so
          // it is the mtime of what the command wrote.
          `5\t105\t${ns(T0 + 100)}\t${relative(dir, stamp)}\tf00d`,
          // build.ninja's stamp is not the command's at all: every later configure stamps build.ninja and has
          // ninja record it. This one is from a configure the next day.
          `${reconfigure.start}\t${reconfigure.end}\t${ns(T1 + 86_400_000)}\tbuild.ninja\tf00d`,
          `20\t520\t${ns(xStartedAtMs)}\tx.o\tf00d`,
          "",
        ].join("\n"),
      );

    // reconfigure started 5 ms after the fetch it reads ended, so it ran in the fetch's process, and the process
    // that compiled x.o began 3 ms after it ended.
    log({ start: 110, end: 900 }, T0 + 903 + 20);
    const b = loadBuild(where);
    // One build: x.o's 20 → 520 on the second process's clock is 920 → 1420 on the first's.
    expect(b.runs.map(r => r.executions.map(x => [x.label, x.start, x.end]))).toEqual([
      [
        ["fetch dep", 5, 105],
        ["reconfigure", 110, 900],
        ["cxx x.o", 920, 1420],
      ],
    ]);
    expect(criticalPath(b).steps.map(s => [s.execution.label, s.blocksNextForMs])).toEqual([
      ["fetch dep", 100],
      ["reconfigure", 790],
      ["cxx x.o", 500],
    ]);
    expect([...waits(b, b.runs[0]!)].map(([x, w]) => [x.label, w.blocker?.label, w.ms])).toEqual([
      ["fetch dep", undefined, 5],
      ["reconfigure", "fetch dep", 5],
      ["cxx x.o", "reconfigure", 20],
    ]);

    // A reconfigure from some other process, which the log has nothing else of, and a build that began just after
    // the configure that rewrote its stamp: it is in no run, and is not taken for the start of that build.
    log({ start: 4000, end: 4700 }, T1 + 86_400_000 + 50 + 20);
    const later = loadBuild(where);
    expect(later.runs.map(r => r.executions.map(x => [x.label, x.start, x.end]))).toEqual([
      [["fetch dep", 5, 105]],
      [["cxx x.o", 20, 520]],
    ]);
    // A fetch ending right where that reconfigure started is not enough either: the process ninja rewrites
    // build.ninja in runs nothing but what build.ninja needs, and this one compiled x.o.
    writeFileSync(
      join(dir, ".ninja_log"),
      [
        "# ninja log v7",
        `3895\t3995\t${ns(T1 + 3990)}\t${relative(dir, stamp)}\tf00d`,
        `4000\t4700\t${ns(T1 + 86_400_000)}\tbuild.ninja\tf00d`,
        `4000\t4500\t${ns(T1 + 4000)}\tx.o\tf00d`,
        "",
      ].join("\n"),
    );
    expect(loadBuild(where).runs.map(r => r.executions.map(x => x.label))).toEqual([["fetch dep", "cxx x.o"]]);
    log({ start: 4000, end: 4700 }, T1 + 86_400_000 + 50 + 20);

    // It still took what it took: a build of everything waits for it.
    expect(criticalPath(later).steps.map(s => [s.execution.label, s.blocksNextForMs])).toEqual([
      ["fetch dep", 100],
      ["reconfigure", 700],
      ["cxx x.o", 500],
    ]);
  });
});

describe("on a Windows host", () => {
  test("ninja's stamps are 100 ns ticks from its own epoch, 10400 s before 2001, and still line up with file mtimes", async () => {
    using windows = tempDir("build-timings-windows", {});
    const dir = String(windows);
    const n = new Ninja({ buildDir: dir });
    n.rule("rust_rustc", { command: "rustc $manifest", description: "rustc $crate $what" });
    n.build({
      outputs: [join(dir, "liba.rlib"), join(dir, "liba.rmeta")],
      rule: "rust_rustc",
      inputs: [],
      vars: { manifest: "a.json", crate: "a", what: "" },
      earlyOutputPrefix: "@early@",
    });
    await n.write();
    // src/disk_interface.cc TimeStampFromFileTime: FILETIME (100 ns since 1601) less 12622770400 seconds.
    const ticks = (unixMs: number) => (BigInt(unixMs - Date.UTC(1601, 0, 1)) - 12_622_770_400_000n) * 10_000n;
    writeFileSync(join(dir, ".ninja_log"), `# ninja log v7\n110\t1110\t${ticks(T0 + 110)}\tliba.rlib\tf00d\n`);
    touch(join(dir, "liba.rmeta"), T0 + 110 + 300);
    touch(join(dir, "liba.rlib"), T0 + 1105);

    const [a] = [...loadBuild(at(dir, "windows")).last.values()];
    expect([a!.stampMs, [...a!.released.values()]]).toEqual([T0 + 110, [300]]);
  });
});

describe("formatReport", () => {
  test("the whole report", () => {
    const plain = { bold: (s: string) => s, dim: (s: string) => s };
    const report = formatReport(build, plain).replace(/^build timings .*$/m, "build timings  <buildDir>");
    expect(report).toMatchInlineSnapshot(`
      "build timings  <buildDir>
        3.4s total · 6 edges

      by rule                     edges       total     slowest
        rust_rustc                    3        4.0s        2.0s  rustc b
        link                          1        1.3s        1.3s  link exe
        dep_fetch                     1       100ms       100ms  fetch dep
        cxx                           1        50ms        50ms  cxx x.o

      slowest 6 edges
              2.0s  rustc b
                    LLVM_passes 1.6s · analysis 218ms
              1.3s  link exe
              1.0s  rustc a
              1.0s  rustc root → libroot.a
             100ms  fetch dep
              50ms  cxx x.o
                    Frontend 30ms · Backend 15ms

      critical path  how long each step holds up the next
             100ms  fetch dep
             300ms  rustc a  of 1.0s
              2.0s  rustc b
              1.0s  rustc root → libroot.a
              1.3s  link exe

      last build  2026-01-02 04:04:05Z  2 commands · 0.4× parallel

        low parallelism  ≤ 2 commands, ≥ 1s
               0ms –      3.4s  (3.4s)  link exe, cxx x.o

        queued
              2.0s  pool compile (depth 2)          1 command    longest 2.0s  cxx x.o
              50ms  no pool                         1 command    longest 50ms  link exe

      earlier builds
        2026-01-02 03:04:05Z        3.9s · 6 commands
      "
    `);
  });
});

describe("chart", () => {
  test("a lane per sort of command, in build order; the critical path takes the top rows of its lanes", () => {
    const [second, first] = chartData(build).runs;
    // A bar names the bar it waited on by its place in the run, which is what a pinned bar's chain follows.
    const placed = (run: typeof first) =>
      run!.bars.map(b => [b.label, run!.lanes[b.lane]!.name, b.row, b.step, b.blocker]);

    expect(second!.lanes).toEqual([
      { name: "C and C++", color: 0, rows: 1 },
      { name: "link and checks", color: 3, rows: 1 },
    ]);
    expect(placed(second)).toEqual([
      ["cxx x.o", "C and C++", 0, undefined, undefined],
      ["link exe", "link and checks", 0, 4, 0],
    ]);

    expect(first!.lanes).toEqual([
      { name: "dependencies", color: 2, rows: 1 },
      { name: "Rust", color: 1, rows: 2 },
      { name: "C and C++", color: 0, rows: 1 },
      { name: "link and checks", color: 3, rows: 1 },
    ]);
    expect(placed(first)).toEqual([
      ["fetch dep", "dependencies", 0, 0, undefined],
      // Not on the path: x.o was last built by the second run.
      ["cxx x.o", "C and C++", 0, undefined, undefined],
      ["rustc a", "Rust", 0, 1, 0],
      // `a` is still running when `b` starts, so `b` is a row down: the staircase.
      ["rustc b", "Rust", 1, 2, 2],
      ["rustc root → libroot.a", "Rust", 0, 3, 3],
      // Superseded by the second run's link, which is the one on the path.
      ["link exe", "link and checks", 0, undefined, 4],
    ]);
    // The largest whole parts of the command: type_check_crate is inside analysis, so it is not counted again.
    expect(first!.bars.find(b => b.label === "rustc b")!.phases).toEqual([
      ["LLVM_passes", 1600],
      ["analysis", 218],
    ]);
  });

  test("the page carries its data and cannot be broken out of by a label", () => {
    // A label is a rule's description with an edge's variables in it, and a variable can hold anything.
    const hostile = loadBuild(at(buildDir));
    hostile.runs[0]!.executions[0]!.label = "gen </script><script>alert(1)</script>";
    const page = chartHtml(hostile);
    const data = /<script id="data" type="application\/json">(.*?)<\/script>/.exec(page)![1]!;
    expect(data).not.toContain("<");
    expect(JSON.parse(data)).toEqual(JSON.parse(JSON.stringify(chartData(hostile))));
    expect(JSON.parse(data).runs.at(-1).bars[0].label).toBe("gen </script><script>alert(1)</script>");
  });
});
