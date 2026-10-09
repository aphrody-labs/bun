/**
 * In-process Python through Bun's external `bun-python-host` (`aphrody_py_*`).
 *
 * One CPython per process: the library of the installed `vu` artifact, opened `RTLD_GLOBAL` (process-wide
 * `LoadLibraryW` on Windows) by the Rust host, so Bun and PyO3 extensions share it.
 * The artifact is loaded, never linked; nothing here starts a second interpreter.
 */
import { CString, dlopen, FFIType, ptr, read, type Pointer } from "bun:ffi";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { embeddedNativeLibraryPath } from "./ffi.ts";
import { SUPPORTED_TARGETS } from "./target.ts";

export const PyStatus = {
  Ok: 0,
  Arg: -1,
  Load: -2,
  State: -3,
  Python: -4,
  Panic: -5,
  Unsupported: -6,
} as const;

export class PythonError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PythonError";
    this.status = status;
  }
}

const SYMBOLS = {
  aphrody_py_load: { args: [FFIType.cstring], returns: FFIType.i32 },
  aphrody_py_init: { args: [], returns: FFIType.i32 },
  aphrody_py_run: { args: [FFIType.cstring], returns: FFIType.i32 },
  aphrody_py_eval: { args: [FFIType.cstring, FFIType.ptr], returns: FFIType.i32 },
  aphrody_py_call: {
    args: [FFIType.cstring, FFIType.cstring, FFIType.ptr, FFIType.ptr],
    returns: FFIType.i32,
  },
  aphrody_py_version: { args: [FFIType.ptr], returns: FFIType.i32 },
  aphrody_py_finalize: { args: [], returns: FFIType.i32 },
  aphrody_py_last_error: { args: [], returns: FFIType.ptr },
  aphrody_py_string_free: { args: [FFIType.ptr], returns: FFIType.void },
} as const;

type Symbols = ReturnType<typeof dlopen<typeof SYMBOLS>>["symbols"];

const HOST_ABI_VERSION = 1;
const HOST_SYMBOLS = {
  ...SYMBOLS,
  bun_py_abi_version: { args: [], returns: FFIType.u32 },
} as const;

/** The explicit or embedded Bun Python host; no core runtime library supplies this ABI. */
export function pythonHostLibraryPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env["BUN_PYTHON_HOST_LIBRARY"];
  if (explicit !== undefined && explicit !== "") return explicit;
  const embedded = embeddedNativeLibraryPath("bun_python_host");
  if (embedded !== null) return embedded;
  throw new PythonError(
    PyStatus.Load,
    "Bun Python host unavailable; set BUN_PYTHON_HOST_LIBRARY to the qualified bun_python_host library",
  );
}

const LIBPYTHON = /^(lib)?python3\.?\d+(\.so(\.1\.0)?|\.dylib|\.dll)$/;

/**
 * The libpython of the active `vu` artifact (`$VU_HOME`, default `~/.vu`, `runtime/<target>/current`), or null.
 * `APHRODY_LIBPYTHON` wins when set; `VU_RUNTIME` selects an artifact directly.
 */
export function vuLibpython(env: NodeJS.ProcessEnv = process.env): string | null {
  const bunLibrary = env["BUN_PYTHON_LIBPYTHON"];
  const explicit = bunLibrary !== undefined && bunLibrary !== "" ? bunLibrary : env["APHRODY_LIBPYTHON"];
  if (explicit !== undefined && explicit !== "") return explicit;
  const runtime = env["VU_RUNTIME"];
  if (runtime !== undefined && runtime !== "") return libpythonIn(resolve(runtime));
  const target = SUPPORTED_TARGETS[`${process.platform}-${process.arch}`];
  if (target === undefined) return null;
  const home = env["VU_HOME"] !== undefined && env["VU_HOME"] !== "" ? resolve(env["VU_HOME"]) : join(homedir(), ".vu");
  try {
    return libpythonIn(realpathSync(join(home, "runtime", target, "current")));
  } catch {
    return null;
  }
}

/** The libpython inside a `vu` artifact directory (`lib/` on Unix, the root or `bin/` on Windows), or null. */
export function libpythonIn(current: string): string | null {
  for (const dir of process.platform === "win32" ? [current, join(current, "bin")] : [join(current, "lib")]) {
    if (!existsSync(dir)) continue;
    const name = readdirSync(dir)
      .filter(file => LIBPYTHON.test(file))
      .sort((a, b) => b.length - a.length)[0];
    if (name !== undefined) return join(dir, name);
  }
  return null;
}

function takeString(symbols: Symbols, raw: Pointer | bigint | number | null): string {
  if (raw === null || raw === 0 || raw === 0n) return "";
  try {
    return new CString(raw as Pointer).toString();
  } finally {
    symbols.aphrody_py_string_free(raw as Pointer);
  }
}

const cstr = (text: string): Uint8Array => {
  if (text.includes("\0")) throw new PythonError(PyStatus.Arg, "Python argument contains a NUL character");
  return new TextEncoder().encode(`${text}\0`);
};

/** The shared interpreter. `Python.open()` loads Bun's Python host and initialises (or attaches). */
export class Python implements Disposable {
  readonly #symbols: Symbols;
  readonly #close: () => void;
  #closed = false;
  /** True when this process started the interpreter (and so finalises it on dispose). */
  readonly started: boolean;

  private constructor(symbols: Symbols, close: () => void, started: boolean) {
    this.#symbols = symbols;
    this.#close = close;
    this.started = started;
  }

  static open(options: { libraryPath?: string; libpython?: string | null } = {}): Python {
    const lib =
      options.libraryPath === undefined
        ? dlopen(pythonHostLibraryPath(), HOST_SYMBOLS)
        : dlopen(options.libraryPath, SYMBOLS);
    const symbols = lib.symbols;
    const fail = (status: number): never => {
      const message = takeString(symbols, symbols.aphrody_py_last_error());
      throw new PythonError(status, message || `aphrody_py status ${status}`);
    };
    try {
      if ("bun_py_abi_version" in symbols) {
        if (typeof symbols.bun_py_abi_version !== "function") {
          throw new PythonError(PyStatus.Unsupported, "Bun Python host has no ABI version function");
        }
        const version = symbols.bun_py_abi_version();
        if (version !== HOST_ABI_VERSION) {
          throw new PythonError(
            PyStatus.Unsupported,
            `Bun Python host ABI ${version} is incompatible with SDK ABI ${HOST_ABI_VERSION}`,
          );
        }
      }
      const libpython = options.libpython === undefined ? vuLibpython() : options.libpython;
      const library = libpython === null ? null : cstr(libpython);
      const loaded = symbols.aphrody_py_load(library === null ? null : ptr(library));
      if (loaded !== PyStatus.Ok) fail(loaded);
      const init = symbols.aphrody_py_init();
      if (init < 0) fail(init);
      return new Python(symbols, () => lib.close(), init === 1);
    } catch (error) {
      lib.close();
      throw error;
    }
  }

  #ensureOpen(): void {
    if (this.#closed) throw new PythonError(PyStatus.State, "Python host handle is closed");
  }

  #check(status: number): void {
    if (status !== PyStatus.Ok) {
      throw new PythonError(status, takeString(this.#symbols, this.#symbols.aphrody_py_last_error()));
    }
  }

  #out(call: (out: Pointer) => number): string {
    this.#ensureOpen();
    const slot = new BigUint64Array(1);
    this.#check(call(ptr(slot)));
    const raw = read.ptr(ptr(slot), 0) as Pointer | 0;
    return raw === 0 ? "" : takeString(this.#symbols, raw);
  }

  /** `Py_GetVersion()`. */
  version(): string {
    return this.#out(out => this.#symbols.aphrody_py_version(out));
  }

  /** Runs statements in `__main__`. */
  run(code: string): void {
    this.#ensureOpen();
    const source = cstr(code);
    this.#check(this.#symbols.aphrody_py_run(ptr(source)));
  }

  /** Evaluates an expression in `__main__` and returns `str(result)`. */
  eval(expression: string): string {
    this.#ensureOpen();
    const source = cstr(expression);
    return this.#out(out => this.#symbols.aphrody_py_eval(ptr(source), out));
  }

  /** `module.function(arg)` (no argument when `arg` is undefined), returns `str(result)`. */
  call(module: string, fn: string, arg?: string): string {
    this.#ensureOpen();
    const moduleName = cstr(module);
    const functionName = cstr(fn);
    const argument = arg === undefined ? null : cstr(arg);
    return this.#out(out =>
      this.#symbols.aphrody_py_call(ptr(moduleName), ptr(functionName), argument === null ? null : ptr(argument), out),
    );
  }

  /** Finalises only this handle's owned interpreter, then closes the host library once. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    try {
      if (this.started) this.#check(this.#symbols.aphrody_py_finalize());
    } finally {
      this.#close();
    }
  }

  [Symbol.dispose](): void {
    this.close();
  }
}
