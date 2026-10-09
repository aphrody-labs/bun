import { describe, expect, it } from "bun:test";
import { ptr, suffix } from "bun:ffi";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultLibraryPath, libraryFile, Runtime, SYMBOLS } from "../src/index.ts";
import { hostTarget } from "../src/target.ts";
import { NativeTooling } from "../src/tooling.ts";
import { libpythonIn, Python, PythonError, pythonHostLibraryPath, vuLibpython } from "../src/python.ts";
import {
  nativeLibrary,
  embeddedNativeLibraryPath,
  readNativeBytes,
  readNativeString,
  readOwnedBytes,
  readOwnedString,
  toCString,
} from "../src/ffi";

describe("runtime SDK ffi helpers", () => {
  const provider = process.env.YOLO_TOOLING_LIB;
  it.skipIf(!provider || !existsSync(provider))(
    "loads the same installed provider for runtime and tooling without explicit library variables",
    () => {
      const home = mkdtempSync(join(tmpdir(), "yolo-shared-installed-"));
      const current = join(home, "runtime", hostTarget(), "current");
      mkdirSync(current, { recursive: true });
      const path = join(current, libraryFile());
      symlinkSync(provider!, path, "file");
      const keys = ["YOLO_HOME", "YOLO_RUNTIME_HOME", "YOLO_RUNTIME_LIB", "YOLO_TOOLING_LIB"] as const;
      const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
      try {
        for (const key of keys) delete process.env[key];
        process.env.YOLO_HOME = home;
        expect(defaultLibraryPath()).toBe(path);
        using tooling = new NativeTooling();
        const runtime = Runtime.load();
        expect(tooling.probe().libraryPath).toBe(path);
        expect(runtime.systemStats().os).toBe(
          process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform,
        );
        runtime.close();
        expect(tooling.analyzeModule("export const retained = 1;", "retained.ts").exports).toContain("retained");
      } finally {
        for (const key of keys) {
          if (previous[key] === undefined) delete process.env[key];
          else process.env[key] = previous[key];
        }
        rmSync(home, { recursive: true, force: true });
      }
    },
  );
  it("selects the sole embedded provider and ignores unrelated assets", () => {
    const stem = process.platform === "win32" ? "aphrody_ffi" : "libaphrody_ffi";
    const path = `/virtual/${stem}.${suffix}`;
    expect(embeddedNativeLibraryPath("aphrody_ffi", [])).toBeNull();
    expect(embeddedNativeLibraryPath("aphrody_ffi", [new File([], "unrelated.so"), new File([], path)])).toBe(path);
  });

  it("rejects competing embedded providers before any library load", () => {
    const stem = process.platform === "win32" ? "aphrody_ffi" : "libaphrody_ffi";
    expect(() =>
      embeddedNativeLibraryPath("aphrody_ffi", [
        new File([], `${stem}.${suffix}`),
        new File([], `${stem}-other.${suffix}`),
      ]),
    ).toThrow("Multiple embedded native libraries");
  });
  it("toCString appends a NUL", () => {
    expect([...toCString("ab")]).toEqual([97, 98, 0]);
  });

  it("readNativeBytes copies and frees", () => {
    const src = new Uint8Array([1, 2, 3]);
    let freed = 0;
    const out = readNativeBytes(ptr(src), 3, a => (freed = a));
    expect([...out]).toEqual([1, 2, 3]);
    expect(freed).toBe(Number(ptr(src)));
  });

  it("readOwnedBytes returns null for an empty slot", () => {
    expect(readOwnedBytes(new Uint8Array(24), () => {})).toBeNull();
  });

  it("readOwnedString decodes the borrowed bytes and releases (data, len, cap) once", () => {
    const source = new TextEncoder().encode("héllo 🐈");
    const slot = new Uint8Array(24);
    const view = new DataView(slot.buffer);
    const data = BigInt(ptr(source));
    view.setBigUint64(0, data, true);
    view.setBigUint64(8, BigInt(source.length), true);
    view.setBigUint64(16, BigInt(source.length + 4), true);
    const calls: bigint[][] = [];
    expect(readOwnedString(slot, (...args) => calls.push(args))).toBe("héllo 🐈");
    expect(calls).toEqual([[data, BigInt(source.length), BigInt(source.length + 4)]]);
  });

  it("readNativeString copies UTF-8 and releases exactly once", () => {
    const source = toCString('{"value":"🐈"}');
    let releases = 0;
    const value = readNativeString(ptr(source), address => {
      expect(address).toBe(Number(ptr(source)));
      releases++;
    });
    expect(JSON.parse(value)).toEqual({ value: "🐈" });
    expect(releases).toBe(1);
  });

  it("close before load is terminal and idempotent", () => {
    const library = nativeLibrary({ name: "x", path: import.meta.path, symbols: {} });
    library.close();
    library.close();
    expect(library.closed).toBe(true);
    expect(library.load()).toBeNull();
    expect(library.loadError()).toContain("closed");
  });

  it("nativeLibrary resolves an explicit path", () => {
    const lib = nativeLibrary({ name: "x", path: import.meta.path, symbols: {} });
    expect(lib.resolvePath()).toBe(import.meta.path);
  });

  it("nativeLibrary reports a diagnostic and honours fileNames", () => {
    const lib = nativeLibrary({ name: "nope", fileNames: ["Nope.Ffi.so"], symbols: {} });
    expect(lib.isAvailable()).toBe(false);
    expect(lib.loadError()).toContain("Nope.Ffi.so");
  });
});

describe("Bun Python host SDK", () => {
  it("selects the dedicated host without consulting core runtime variables", () => {
    const library = join(import.meta.dir, "qualified-bun-python-host");
    expect(
      pythonHostLibraryPath({
        BUN_PYTHON_HOST_LIBRARY: library,
        YOLO_RUNTIME_LIB: import.meta.path,
        YOLO_RUNTIME_HOME: import.meta.dir,
      }),
    ).toBe(library);
  });

  it.skipIf(embeddedNativeLibraryPath("bun_python_host") !== null)(
    "reports a missing Python host instead of loading the core runtime",
    () => {
      const env = { BUN_PYTHON_HOST_LIBRARY: "", YOLO_RUNTIME_LIB: import.meta.path };
      expect(() => pythonHostLibraryPath(env)).toThrow(PythonError);
      expect(() => pythonHostLibraryPath(env)).toThrow("BUN_PYTHON_HOST_LIBRARY");
    },
  );

  it("preserves explicit CPython selection and reports missing artifacts", () => {
    const explicit = join(import.meta.dir, "selected-libpython");
    expect(vuLibpython({ BUN_PYTHON_LIBPYTHON: explicit, APHRODY_LIBPYTHON: "ignored" })).toBe(explicit);
    expect(vuLibpython({ BUN_PYTHON_LIBPYTHON: "", APHRODY_LIBPYTHON: explicit })).toBe(explicit);
    expect(
      vuLibpython({
        APHRODY_LIBPYTHON: explicit,
        VU_RUNTIME: import.meta.dir,
        VU_HOME: import.meta.dir,
      }),
    ).toBe(explicit);
    expect(libpythonIn(join(import.meta.dir, "missing-python-artifact"))).toBeNull();
    expect(vuLibpython({ VU_RUNTIME: join(import.meta.dir, "missing-python-artifact") })).toBeNull();
  });

  it("uses the selected CPython artifact before the installed artifact", async () => {
    const module = Bun.pathToFileURL(join(import.meta.dir, "../src/python.ts")).href;
    const harness = Bun.pathToFileURL(join(import.meta.dir, "../../../test/harness.ts")).href;
    await using proc = Bun.spawn({
      cmd: [
        process.execPath,
        "-e",
        `
        import { join } from "node:path";
        import { tempDir } from ${JSON.stringify(harness)};
        import { hostTarget } from ${JSON.stringify(Bun.pathToFileURL(join(import.meta.dir, "../src/target.ts")).href)};
        import { libpythonIn, vuLibpython } from ${JSON.stringify(module)};
        const name = process.platform === "win32" ? "python313.dll"
          : process.platform === "darwin" ? "libpython3.13.dylib" : "libpython3.13.so.1.0";
        const folder = process.platform === "win32" ? "bin" : "lib";
        using direct = tempDir("bun-python-direct", { [folder]: { [name]: "" } });
        using installed = tempDir("bun-python-installed", {
          runtime: { [hostTarget()]: { current: { [folder]: { [name]: "" } } } },
        });
        const selected = join(String(direct), folder, name);
        const active = join(String(installed), "runtime", hostTarget(), "current", folder, name);
        console.log(JSON.stringify({
          direct: libpythonIn(String(direct)) === selected,
          selected: vuLibpython({ VU_RUNTIME: String(direct), VU_HOME: String(installed) }) === selected,
          installed: vuLibpython({ VU_HOME: String(installed) }) === active,
        }));
      `,
      ],
      env: { ...process.env, BUN_DEBUG_QUIET_LOGS: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stdout).toBe('{"direct":true,"selected":true,"installed":true}\n');
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  });

  it("honours an explicit historical host path before the configured default", () => {
    expect(() => Python.open({ libraryPath: import.meta.path })).toThrow(import.meta.path);
  });

  it("matches the shared native host header, including ABI negotiation", async () => {
    const header = await Bun.file(join(import.meta.dir, "../../bun-python-native/include/bun_python_host.h")).text();
    const source = await Bun.file(join(import.meta.dir, "../src/python.ts")).text();
    const declared = new Map<string, number>();
    for (const match of header.matchAll(/\b((?:aphrody_py_|bun_py_)\w+)\s*\(([^;{]*)\)\s*;/g)) {
      const params = match[2]!.trim();
      declared.set(match[1]!, params === "void" ? 0 : params.split(",").length);
    }
    const bound = [...source.matchAll(/^ {2}((?:aphrody_py_|bun_py_)\w+): \{\s*args: \[([^\]]*)\]/gm)];
    expect(bound).toHaveLength(10);
    expect(
      bound
        .map(match => ({
          name: match[1]!,
          arity: match[2]!.split(",").filter(arg => arg.trim()).length,
        }))
        .filter(({ name, arity }) => declared.get(name) !== arity),
    ).toEqual([]);
    expect(source.match(/const HOST_ABI_VERSION = (\d+);/)?.[1]).toBe(
      header.match(/#define BUN_PYTHON_HOST_ABI_VERSION (\d+)u/)?.[1],
    );
  });

  const host = process.env.BUN_PYTHON_HOST_LIBRARY;
  const libpython = process.env.APHRODY_LIBPYTHON;
  // Native qualification requires the separately built host and a complete CPython installation.
  it.skipIf(!host || !libpython || !existsSync(host) || !existsSync(libpython))(
    "negotiates the real host, shares the interpreter and releases owned handles safely",
    async () => {
      const module = Bun.pathToFileURL(join(import.meta.dir, "../src/python.ts")).href;
      await using proc = Bun.spawn({
        cmd: [
          process.execPath,
          "-e",
          `
          import assert from "node:assert/strict";
          import { dlopen, FFIType } from "bun:ffi";
          import { Python, PythonError, PyStatus } from ${JSON.stringify(module)};
          const probe = dlopen(process.env.BUN_PYTHON_HOST_LIBRARY, {
            bun_py_abi_version: { args: [], returns: FFIType.u32 },
          });
          try { assert.equal(probe.symbols.bun_py_abi_version(), 1); }
          finally { probe.close(); }
          assert.throws(() => Python.open({ libpython: process.env.BUN_TEST_MISSING_LIBPYTHON }),
            error => error instanceof PythonError && error.status === PyStatus.Load);
          const owner = Python.open();
          try {
            assert.equal(owner.started, true);
            assert.match(owner.version(), /^3\\./);
            owner.run("sdk_value = 'élève 🐈'");
            for (const call of [
              () => owner.run("sdk_value = 'truncated'" + String.fromCharCode(0)),
              () => owner.eval("42" + String.fromCharCode(0)),
              () => owner.call("sys" + String.fromCharCode(0), "getdefaultencoding"),
              () => owner.call("sys", "getdefaultencoding" + String.fromCharCode(0)),
              () => owner.call("json", "loads", "[]" + String.fromCharCode(0)),
            ]) assert.throws(call, error => error instanceof PythonError && error.status === PyStatus.Arg);
            assert.equal(owner.eval("sdk_value"), "élève 🐈");
            using attached = Python.open();
            assert.equal(attached.started, false);
            assert.equal(attached.eval("sdk_value"), "élève 🐈");
            attached.close();
            attached.close();
            assert.equal(owner.eval("sdk_value"), "élève 🐈");
            assert.equal(owner.call("json", "loads", "[1,2]"), "[1, 2]");
            assert.equal(owner.call("sys", "getdefaultencoding"), "utf-8");
            assert.throws(() => owner.eval("1 / 0"),
              error => error instanceof PythonError && error.status === PyStatus.Python
                && error.message.includes("division by zero"));
            assert.equal(owner.eval("40 + 2"), "42");
          } finally { owner.close(); }
          owner.close();
          for (const call of [
            () => owner.run("pass"), () => owner.eval("42"),
            () => owner.call("sys", "getdefaultencoding"), () => owner.version(),
            () => owner.eval(String.fromCharCode(0)),
            () => owner.call(String.fromCharCode(0), "function"),
          ]) assert.throws(call, error => error instanceof PythonError
            && error.status === PyStatus.State && error.message === "Python host handle is closed");
          const python = dlopen(process.env.APHRODY_LIBPYTHON, {
            Py_IsInitialized: { args: [], returns: FFIType.i32 },
          });
          try { assert.equal(python.symbols.Py_IsInitialized(), 0); }
          finally { python.close(); }
          console.log("abi=1 shared=true owned-finalize=true closed=true");
        `,
        ],
        env: {
          ...process.env,
          BUN_DEBUG_QUIET_LOGS: "1",
          BUN_TEST_MISSING_LIBPYTHON: join(import.meta.dir, "missing-libpython"),
          YOLO_RUNTIME_LIB: import.meta.path,
          VU_RUNTIME: join(import.meta.dir, "missing-python-artifact"),
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
      expect(stdout).toBe("abi=1 shared=true owned-finalize=true closed=true\n");
      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
    },
  );
});

describe("yolo_runtime.h contract", () => {
  it("declares every yolo_* symbol the SDK binds, with the same arity", async () => {
    const header = (await Bun.file(join(import.meta.dir, "../include/yolo_runtime.h")).text()).replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const declared = new Map<string, number>();
    for (const m of header.matchAll(/\b(yolo_\w+)\s*\(([^;{]*)\)\s*;/g)) {
      const params = m[2]!.trim();
      declared.set(m[1]!, params === "" || params === "void" ? 0 : params.split(",").length);
    }
    const drift = Object.entries(SYMBOLS)
      .filter(([name, def]) => declared.get(name) !== def.args.length)
      .map(([name, def]) => `${name}: sdk ${def.args.length}, header ${declared.get(name)}`);
    expect(drift).toEqual([]);

    // Optional browser/gpu ABI: own dlopen tables, never in the core SYMBOLS.
    const bound = new Map<string, number>(Object.entries(SYMBOLS).map(([name, def]) => [name, def.args.length]));
    for (const file of ["browser.ts", "gpu.ts"]) {
      const source = await Bun.file(join(import.meta.dir, "../src", file)).text();
      for (const m of source.matchAll(/^ {2}(yolo_\w+): \{\s*args: \[([^\]]*)\]/gm)) {
        const arity = m[2]!.split(",").filter(a => a.trim()).length;
        bound.set(m[1]!, arity);
        if (declared.get(m[1]!) !== arity) drift.push(`${m[1]}: ${file} ${arity}, header ${declared.get(m[1]!)}`);
      }
    }
    expect(drift).toEqual([]);
    expect([...declared.keys()].filter(name => !bound.has(name)).toSorted()).toEqual([]);
    for (const name of [
      "yolo_browser_create",
      "yolo_browser_call_start",
      "yolo_browser_close",
      "yolo_gpu_call_start",
    ]) {
      expect(name in SYMBOLS).toBe(false);
    }
  });
});
