import { describe, expect, test } from "bun:test";
import { isLinux, tempDir } from "harness";
import { mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { link } from "../../scripts/build/compile.ts";
import type { Config } from "../../scripts/build/config.ts";
import { Ninja } from "../../scripts/build/ninja.ts";
import { emitRustNativeLink, nativeLinkArguments, nativeLinkResponse } from "../../scripts/build/rust/native-link.ts";
import { parseBuildScriptOutput } from "../../scripts/build/rust/run.ts";
import type { RustGraph, RustUnit, UnitDep } from "../../scripts/build/rust/units.ts";

function output(directives: string, cwd = "/package") {
  return { ...parseBuildScriptOutput(directives), cwd };
}

test("Windows build-script import libraries reach the final C++ link", () => {
  using directory = tempDir("windows-native-link", {});
  const native = join(String(directory), "native");
  expect(
    nativeLinkArguments(
      [output(`cargo::rustc-link-search=native=${native}\ncargo::rustc-link-lib=dylib=winfw\n`, String(directory))],
      "windows",
    ),
  ).toEqual([`/LIBPATH:${native}`, "winfw.lib"]);
});

test("native directories and dylibs reach the Linux final link in dependency order", () => {
  const gtk = output(
    "cargo:rustc-link-search=native=/usr/lib\ncargo:rustc-link-lib=gtk-3\ncargo:rustc-link-lib=gdk-3\n",
  );
  const transitive = output(
    "cargo:rustc-link-search=dependency=/rust/deps\ncargo:rustc-link-search=/opt/native lib\n" +
      "cargo:rustc-link-lib=dylib=gio-2.0\ncargo:rustc-link-lib=gtk-3\ncargo:rustc-link-arg=DO_NOT_PROPAGATE\n",
  );
  expect(nativeLinkArguments([gtk, transitive])).toEqual([
    "-L/usr/lib",
    "-L/opt/native lib",
    "-lgtk-3",
    "-lgdk-3",
    "-lgio-2.0",
    "-lgtk-3",
  ]);
});

test.each(["linux", "windows"] as const)("the final %s link shares Bun's static SQLite owner", platform => {
  const script = output("cargo:rustc-link-lib=sqlite3\ncargo:rustc-link-lib=dylib=other\n");
  expect(nativeLinkArguments([script], platform, true)).toEqual([platform === "windows" ? "other.lib" : "-lother"]);
  expect(nativeLinkArguments([script], platform)).toEqual(
    platform === "windows" ? ["sqlite3.lib", "other.lib"] : ["-lsqlite3", "-lother"],
  );
  expect(() =>
    nativeLinkArguments([output("cargo:rustc-link-lib=static:-bundle,+whole-archive=sqlite3\n")], platform, true),
  ).toThrow("Unsupported native SQLite owner modifiers");
});

test("relative native search paths belong to their package, not the final link directory", () => {
  expect(nativeLinkArguments([output("cargo:rustc-link-search=native=../lib\n", "/package/sys")])).toEqual([
    `-L${resolve("/package/lib")}`,
  ]);
});

test("bundled archives are not linked twice; external archive selection restores linker state", () => {
  const script = output(
    "cargo:rustc-link-lib=static=bundled\ncargo:rustc-link-lib=static:+bundle=also_bundled\n" +
      "cargo:rustc-link-lib=static:-bundle,+whole-archive,+verbatim=libnative.a\n" +
      "cargo:rustc-link-lib=dylib:-as-needed=gtk-3:renamed\ncargo:rustc-link-lib=m\n",
  );
  expect(nativeLinkArguments([script])).toEqual([
    "-Wl,--push-state",
    "-Wl,-Bstatic",
    "-Wl,--whole-archive",
    "-l:libnative.a",
    "-Wl,--pop-state",
    "-Wl,--push-state",
    "-Wl,--no-as-needed",
    "-lgtk-3",
    "-Wl,--pop-state",
    "-lm",
  ]);
});

test.each([
  ["framework=AppKit", "Unsupported Linux Rust native library"],
  ["static:+whole-archive=packed", "Bundled whole-archive requires rustc final linking"],
  ["dylib:+whole-archive=wrong", "Invalid Rust native library modifiers"],
  ["dylib:+unknown=wrong", "Unsupported Rust native library modifier"],
  ["dylib=", "Invalid Rust native library"],
])("rejects an unsupported native link contract: %s", (spec, error) => {
  expect(() => nativeLinkArguments([{ linkSearch: [], linkLibs: [spec], cwd: "/package" }])).toThrow(error);
});

/** Only the fields read by the real dependency walk are needed for this graph fixture. */
function unit(name: string, platform: string, script?: string, dependencies: RustUnit[] = []): RustUnit {
  return {
    crateName: name,
    kind: "lib",
    platform,
    profile: { panic: "abort" },
    deps: dependencies.map(dependency => ({ unit: dependency, externName: dependency.crateName }) as UnitDep),
    buildScript: script === undefined ? undefined : ({ output: script } as RustUnit),
  } as RustUnit;
}

function fixture(dir: string, linux = true) {
  const script = join(dir, "target-script.json");
  const host = unit("macro", "host", join(dir, "missing-host-script.json"));
  host.kind = "proc-macro";
  const unusedPanic = unit("panic_unwind", "x86_64-unknown-linux-gnu", join(dir, "missing-unwind-script.json"));
  const dependency = unit("gtk_sys", "x86_64-unknown-linux-gnu", script);
  dependency.pkg = { manifest_path: join(dir, "Cargo.toml") } as RustUnit["pkg"];
  const root = unit("bun_runtime", "x86_64-unknown-linux-gnu", undefined, [host, unusedPanic, dependency]);
  const graph = { root, dir } as RustGraph;
  const cfg = {
    linux,
    windows: false,
    buildDir: dir,
    cwd: dir,
    host: { os: "linux" },
    bun: process.execPath,
    cxx: "/fake/clang++",
    ld: "/fake/ld.lld",
    exeSuffix: "",
  } as Config;
  return { script, graph, cfg };
}

describe("Ninja native response edge", () => {
  test.each([false, true])("depends on the canonical SQLite link input with archiveDeps=%s", archiveDeps => {
    using dir = tempDir("rust-native-link-sqlite", {});
    const { graph, cfg } = fixture(String(dir));
    Object.assign(cfg, { staticSqlite: true, archiveDeps, libPrefix: "lib", libSuffix: ".a", objSuffix: ".o" });
    const n = new Ninja({ buildDir: String(dir) });
    emitRustNativeLink(n, cfg, graph);
    const ninja = n.toString().replace(/ \$\n +/g, " ");
    expect(ninja).toContain(" linux static-sqlite");
    const response = ninja
      .split("\n")
      .find(line => line.startsWith("build native-link.rsp"))!
      .replaceAll("\\", "/");
    expect(response).toContain(archiveDeps ? "deps/sqlite3/libsqlite3.a" : "obj/src/jsc/bindings/sqlite/sqlite3.c.o");
    expect(ninja).not.toContain("whole-archive");
  });

  test("the MSVC response depends on the same SQLite archive without adding another library", () => {
    using dir = tempDir("rust-native-link-sqlite-msvc", {});
    const { graph, cfg } = fixture(String(dir));
    Object.assign(cfg, {
      windows: true,
      linux: false,
      staticSqlite: true,
      archiveDeps: true,
      libPrefix: "",
      libSuffix: ".lib",
    });
    const n = new Ninja({ buildDir: String(dir) });
    emitRustNativeLink(n, cfg, graph);
    const ninja = n
      .toString()
      .replace(/ \$\n +/g, " ")
      .replaceAll("\\", "/");
    expect(ninja).toContain(" windows static-sqlite");
    expect(ninja).toContain("deps/sqlite3/sqlite3.lib");
    expect(ninja).not.toContain("WHOLEARCHIVE");
  });

  test("is a final-link dependency and excludes host-only and unselected panic build scripts", () => {
    using dir = tempDir("rust-native-link", {});
    const { script, graph, cfg } = fixture(String(dir));
    const n = new Ninja({ buildDir: String(dir) });
    const rsp = emitRustNativeLink(n, cfg, graph)!;
    n.rule("link", { command: "clang++ $driverflags @$out.rsp $lazy $ldflags -o $out" });
    link(n, cfg, "bun", [], { libs: [], flags: [`@${rsp}`], implicitInputs: [rsp] });
    expect(JSON.parse(readFileSync(join(String(dir), "native-link.json"), "utf8"))).toEqual([
      { output: script, cwd: String(dir) },
    ]);
    const ninja = n.toString().replace(/ \$\n +/g, " ");
    expect(ninja).toMatch(/build native-link\.rsp[^\n]*: rust_native_link target-script\.json/);
    expect(ninja).toMatch(/build bun[^\n]*: link[^\n]*native-link\.rsp/);
    expect(n.toString()).not.toContain("missing-host-script");
    expect(n.toString()).not.toContain("missing-unwind-script");
  });

  test("does not change non-Linux graphs", () => {
    using dir = tempDir("rust-native-link-other", {});
    const { graph, cfg } = fixture(String(dir), false);
    const n = new Ninja({ buildDir: String(dir) });
    expect(emitRustNativeLink(n, cfg, graph)).toBeUndefined();
    expect(n.toString()).not.toContain("rust_native_link");
  });

  test.skipIf(!isLinux || !Bun.which("ninja"))(
    "executes the real response driver, rebuilds changed scripts, and preserves unchanged output",
    () => {
      using dir = tempDir("rust-native-link-run", {});
      const root = String(dir);
      const { script, graph, cfg } = fixture(root);
      const n = new Ninja({ buildDir: root });
      const rsp = emitRustNativeLink(n, cfg, graph)!;
      writeFileSync(join(root, "build.ninja"), n.toString());
      const run = () => Bun.spawnSync(["ninja", "-C", root, "native-link.rsp"], { stdout: "pipe", stderr: "pipe" });
      let revision = 0;
      const update = (directives: string) => {
        writeFileSync(script, JSON.stringify(parseBuildScriptOutput(directives)));
        // Filesystems with coarse timestamps must still see a new input after each completed ninja invocation.
        const changed = new Date(Date.now() + ++revision * 1000);
        utimesSync(script, changed, changed);
      };
      update("cargo:rustc-link-lib=gtk-3\n");
      let result = run();
      expect(result.exitCode).toBe(0);
      expect(readFileSync(rsp, "utf8")).toBe('"-lgtk-3"\n');
      const old = new Date(Date.now() - 10_000);
      utimesSync(rsp, old, old);
      const previousTime = statSync(rsp).mtimeMs;
      update("cargo:rustc-link-lib=gtk-3\ncargo:warning=changed\n");
      result = run();
      expect(result.exitCode).toBe(0);
      expect(statSync(rsp).mtimeMs).toBe(previousTime);
      update("cargo:rustc-link-lib=gdk-3\n");
      result = run();
      expect(result.exitCode).toBe(0);
      expect(readFileSync(rsp, "utf8")).toBe('"-lgdk-3"\n');
      update("cargo:rustc-link-lib=framework=AppKit\n");
      result = run();
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout.toString() + result.stderr.toString()).toContain("Unsupported Linux Rust native library");
    },
  );
});

test("quotes clang response arguments without shell expansion", () => {
  expect(nativeLinkResponse(["-L/path with spaces", '-L/a"b', "-L/a\\b", "-L/$(false)"])).toBe(
    '"-L/path with spaces"\n"-L/a\\"b"\n"-L/a\\\\b"\n"-L/$(false)"\n',
  );
});

const clang = Bun.which("clang++-23") ?? Bun.which("clang++");
const archiver = Bun.which("llvm-ar") ?? Bun.which("ar");
const readelf = Bun.which("llvm-readelf") ?? Bun.which("readelf");
test.skipIf(!isLinux || clang === null || archiver === null || readelf === null)(
  "the real Linux link uses the provided SQLite archive without loading another SQLite",
  () => {
    using dir = tempDir("rust-native-link-sqlite-real", {});
    const root = String(dir);
    const native = join(root, "host-libraries");
    mkdirSync(native);
    const owner = join(root, "owner.cpp");
    const foreign = join(root, "foreign.cpp");
    const consumer = join(root, "consumer.cpp");
    const object = join(root, "owner.o");
    const archive = join(root, "libsqlite3.a");
    writeFileSync(owner, 'extern "C" int sqlite3_libversion_number() { return 3450000; }\n');
    writeFileSync(foreign, 'extern "C" int sqlite3_libversion_number() { return 1; }\n');
    writeFileSync(
      consumer,
      'extern "C" int sqlite3_libversion_number(); int main() { return sqlite3_libversion_number() == 3450000 ? 0 : 1; }\n',
    );
    const run = (argv: string[]) => {
      const result = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" });
      expect(result.stderr.toString()).toBe("");
      expect(result.exitCode).toBe(0);
      return result;
    };
    run([clang!, "-c", owner, "-o", object]);
    run([archiver!, "rcs", archive, object]);
    run([clang!, "-fPIC", "-shared", foreign, "-o", join(native, "libsqlite3.so")]);
    const rsp = join(root, "native.rsp");
    writeFileSync(
      rsp,
      nativeLinkResponse(
        nativeLinkArguments(
          [output(`cargo:rustc-link-search=native=${native}\ncargo:rustc-link-lib=sqlite3\ncargo:rustc-link-lib=m\n`)],
          "linux",
          true,
        ),
      ),
    );
    const exe = join(root, "consumer");
    run([clang!, consumer, archive, "-Wl,--no-as-needed", `@${rsp}`, "-o", exe]);
    const imports = run([readelf!, "--dynamic-table", exe]).stdout.toString();
    expect(imports).toContain("NEEDED");
    expect(imports).not.toContain("libsqlite3.so");
    run([exe]);
  },
);

test.skipIf(!isLinux || clang === null)(
  "the installed Clang driver accepts the response without compiling or linking",
  () => {
    using dir = tempDir("rust-native-link-clang", {});
    const rsp = join(String(dir), "native.rsp");
    writeFileSync(
      rsp,
      nativeLinkResponse(
        nativeLinkArguments([
          output("cargo:rustc-link-search=native=/native lib/$(false)\ncargo:rustc-link-lib=gtk-3\n"),
        ]),
      ),
    );
    // -### prints the selected linker invocation; it neither compiles sources nor loads a native library.
    const result = Bun.spawnSync([clang!, "-###", `@${rsp}`, "-o", join(String(dir), "unused")], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toContain('"-L/native lib/\\$(false)"');
    expect(result.stderr.toString()).toContain('"-lgtk-3"');
  },
);

test.skipIf(!isLinux || clang === null)("links and runs a tiny native dependency with a comma in its name", () => {
  using dir = tempDir("rust-native-link-library", {});
  const root = String(dir);
  const libraryDir = join(root, "native libraries");
  mkdirSync(libraryDir);
  const librarySource = join(root, "library.cpp");
  const consumerSource = join(root, "consumer.cpp");
  writeFileSync(librarySource, 'extern "C" int native_answer() { return 42; }\n');
  writeFileSync(
    consumerSource,
    'extern "C" int native_answer(); int main() { return native_answer() == 42 ? 0 : 1; }\n',
  );
  const library = Bun.spawnSync(
    [clang!, "-fPIC", "-shared", librarySource, "-o", join(libraryDir, "libnative,fixture.so")],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(library.exitCode).toBe(0);
  const rsp = join(root, "native.rsp");
  writeFileSync(
    rsp,
    nativeLinkResponse(
      nativeLinkArguments([
        output(`cargo:rustc-link-search=native=${libraryDir}\ncargo:rustc-link-lib=dylib=native,fixture\n`),
      ]),
    ),
  );
  const exe = join(root, "consumer");
  const consumer = Bun.spawnSync([clang!, consumerSource, `@${rsp}`, "-o", exe], { stdout: "pipe", stderr: "pipe" });
  expect(consumer.exitCode).toBe(0);
  const run = Bun.spawnSync([exe], {
    env: { ...process.env, LD_LIBRARY_PATH: libraryDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(run.exitCode).toBe(0);
});
