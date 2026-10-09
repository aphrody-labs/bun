type Pointer = import("bun:ffi").Pointer;
const { CString, dlopen, FFIType, ptr, read, suffix }: typeof import("bun:ffi") = require("bun:ffi");
const { existsSync, readdirSync, realpathSync }: typeof import("node:fs") = require("node:fs");
const { homedir }: typeof import("node:os") = require("node:os");
const { basename, dirname, isAbsolute, join, resolve }: typeof import("node:path") = require("node:path");
function embeddedNativeLibraryPath(name: string): string | null {
  const stem = process.platform === "win32" ? name : `lib${name}`;
  const matches = Bun.embeddedFiles.flatMap(file => {
    const path = (file as Blob & { name?: string }).name;
    return path &&
      (basename(path) === `${stem}.${suffix}` ||
        (basename(path).startsWith(`${stem}-`) && basename(path).endsWith(`.${suffix}`)))
      ? [path]
      : [];
  });
  if (matches.length > 1) throw new Error(`Multiple embedded native libraries for ${name}`);
  const path = matches[0];
  return path === undefined ? null : isAbsolute(path) ? path : join(dirname(Bun.main), path);
}

const SUPPORTED_TARGETS: Readonly<Record<string, string>> = {
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
  "win32-x64": "x86_64-pc-windows-msvc",
};

const PyStatus = {
  Ok: 0,
  Arg: -1,
  Load: -2,
  State: -3,
  Python: -4,
  Panic: -5,
  Unsupported: -6,
} as const;

class PythonError extends Error {
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
function pythonHostLibraryPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env["BUV_PYTHON_HOST_LIBRARY"] || env["BUN_PYTHON_HOST_LIBRARY"];
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
 * The libpython of the active `buv` artifact (`$BUV_HOME`, default `~/.buv`, `runtime/<target>/current`), or null.
 * `APHRODY_LIBPYTHON` wins when set; `BUV_RUNTIME` selects an artifact directly.
 */
function buvLibpython(env: NodeJS.ProcessEnv = process.env): string | null {
  const bunLibrary = env["BUV_PYTHON_LIBPYTHON"] || env["BUN_PYTHON_LIBPYTHON"];
  const explicit = bunLibrary !== undefined && bunLibrary !== "" ? bunLibrary : env["APHRODY_LIBPYTHON"];
  if (explicit !== undefined && explicit !== "") return explicit;
  const runtime = env["BUV_RUNTIME"] || env["VU_RUNTIME"];
  if (runtime !== undefined && runtime !== "") return libpythonIn(resolve(runtime));
  const target = SUPPORTED_TARGETS[`${process.platform}-${process.arch}`];
  if (target === undefined) return null;
  const selectedHome = env["BUV_HOME"] || env["VU_HOME"];
  const home = selectedHome ? resolve(selectedHome) : join(homedir(), ".buv");
  try {
    return libpythonIn(realpathSync(join(home, "runtime", target, "current")));
  } catch {
    return null;
  }
}

/** The libpython inside a `buv` artifact directory (`lib/` on Unix, the root or `bin/` on Windows), or null. */
function libpythonIn(current: string): string | null {
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
class Python implements Disposable {
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
      const libpython = options.libpython === undefined ? buvLibpython() : options.libpython;
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

  static async(options: { libraryPath?: string; libpython?: string | null } = {}) {
    return PythonAsync.open(options);
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

  exec(source: string | TemplateStringsArray): void {
    if (typeof source === "string") this.run(source);
    else {
      if (source.length !== 1) throw new PythonError(PyStatus.Arg, "Python templates cannot interpolate code");
      this.run(source.raw[0]!);
    }
  }

  /** Evaluates an expression in `__main__` and returns `str(result)`. */
  eval(expression: string): string {
    this.#ensureOpen();
    const source = cstr(expression);
    return this.#out(out => this.#symbols.aphrody_py_eval(ptr(source), out));
  }

  evalJSON<T = unknown>(expression: string): T {
    return JSON.parse(
      this.eval(
        `__import__('json').dumps((${expression}), ensure_ascii=False, allow_nan=False, separators=(',', ':'))`,
      ),
    );
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

type Reply = { id: number; value?: string; error?: { status: number; message: string } };
class PythonAsync implements AsyncDisposable {
  readonly #worker: Worker;
  readonly #pending = new Map<number, { resolve: (value: string) => void; reject: (error: Error) => void }>();
  #next = 0;
  #closing = false;
  #closePromise: Promise<void> | null = null;

  private constructor(worker: Worker) {
    this.#worker = worker;
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data;
      const pending = this.#pending.get(reply.id);
      if (!pending) return;
      this.#pending.delete(reply.id);
      const error = reply.error;
      if (error) pending.reject(new PythonError(error.status, error.message));
      else pending.resolve(reply.value ?? "");
    };
    worker.onerror = event => {
      this.#closing = true;
      for (const pending of this.#pending.values()) pending.reject(new PythonError(PyStatus.State, event.message));
      this.#pending.clear();
      worker.terminate();
    };
  }

  static async open(options: { libraryPath?: string; libpython?: string | null } = {}) {
    const source = `
      import { Python, PythonError } from "bun:python";
      let python;
      self.onmessage = ({ data: { id, operation, args } }) => {
        try {
          let value;
          if (operation === "open") python = Python.open(args[0]);
          else if (!python) throw new Error("Python worker is not open");
          else if (operation === "close") { python.close(); python = undefined; }
          else if (operation === "version") value = python.version();
          else if (operation === "run") python.run(args[0]);
          else if (operation === "eval") value = python.eval(args[0]);
          else if (operation === "call") value = python.call(...args);
          else throw new Error("Unknown Python worker operation");
          self.postMessage({ id, value });
        } catch (error) {
          self.postMessage({ id, error: { status: error instanceof PythonError ? error.status : -3, message: String(error.message ?? error) } });
        }
      };
    `;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    let worker: Worker | undefined;
    try {
      worker = new Worker(url, { name: "buv-python" });
      const python = new PythonAsync(worker);
      await python.#request("open", [options]);
      return python;
    } catch (error) {
      worker?.terminate();
      throw error;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  #request(operation: string, args: unknown[] = []) {
    if (this.#closing) return Promise.reject(new PythonError(PyStatus.State, "Python worker is closed"));
    if (this.#pending.size >= 256)
      return Promise.reject(new PythonError(PyStatus.State, "Python worker queue is full"));
    const id = ++this.#next;
    return new Promise<string>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      try {
        this.#worker.postMessage({ id, operation, args });
      } catch (error) {
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  version() {
    return this.#request("version");
  }
  async run(code: string) {
    await this.#request("run", [code]);
  }
  async exec(source: string | TemplateStringsArray) {
    if (typeof source !== "string" && source.length !== 1)
      throw new PythonError(PyStatus.Arg, "Python templates cannot interpolate code");
    await this.run(typeof source === "string" ? source : source.raw[0]!);
  }
  eval(expression: string) {
    return this.#request("eval", [expression]);
  }
  async evalJSON<T = unknown>(expression: string): Promise<T> {
    return JSON.parse(
      await this.eval(
        `__import__('json').dumps((${expression}), ensure_ascii=False, allow_nan=False, separators=(',', ':'))`,
      ),
    );
  }
  call(module: string, fn: string, arg?: string) {
    return this.#request("call", [module, fn, arg]);
  }
  close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    if (this.#closing) return Promise.resolve();
    const closed = this.#request("close");
    this.#closing = true;
    this.#closePromise = closed
      .then(() => {})
      .finally(() => {
        this.#worker.terminate();
      });
    return this.#closePromise;
  }
  async [Symbol.asyncDispose]() {
    await this.close();
  }
}

export default {
  Python,
  PythonAsync,
  PythonError,
  PyStatus,
  pythonHostLibraryPath,
  buvLibpython,
  vuLibpython: buvLibpython,
  libpythonIn,
};
