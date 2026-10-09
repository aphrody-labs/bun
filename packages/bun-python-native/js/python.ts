// SPDX-License-Identifier: Apache-2.0
import { CString, dlopen, FFIType, ptr, toArrayBuffer } from "bun:ffi";
import { resolve } from "node:path";

const definitions = {
  bun_py_abi_version: { args: [], returns: FFIType.u32 },
  bun_py_capabilities: { args: [], returns: FFIType.u64 },
  aphrody_py_load: { args: [FFIType.ptr], returns: FFIType.i32 },
  aphrody_py_init: { args: [], returns: FFIType.i32 },
  aphrody_py_run: { args: [FFIType.ptr], returns: FFIType.i32 },
  aphrody_py_eval: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  aphrody_py_finalize: { args: [], returns: FFIType.i32 },
  aphrody_py_last_error: { args: [], returns: FFIType.ptr },
  aphrody_py_string_free: { args: [FFIType.ptr], returns: FFIType.void },
  bun_py_buffer_acquire: { args: [FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  bun_py_buffer_release: { args: [FFIType.u64], returns: FFIType.i32 },
  bun_py_buffer_deallocator: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.void },
} as const;
type Library = ReturnType<typeof dlopen<typeof definitions>>;
// Native GC callbacks must retain their code until process teardown.
const libraries = new Map<string, Library>();
const sessions = new Map<string, PythonSession>();
const cstring = (value: string) => {
  if (value.includes("\0")) throw new Error("Python input contains NUL");
  return Buffer.from(`${value}\0`);
};

export interface PythonOptions { hostLibrary: string; libpython: string; }

export class PythonSession {
  #closed = false;
  constructor(private readonly library: Library, readonly libpython: string) {}

  #check(status: number): void {
    if (this.#closed) throw new Error("Python session is closed");
    if (status >= 0) return;
    const error = this.library.symbols.aphrody_py_last_error();
    let message = `Python host status ${status}`;
    if (error !== null) {
      message = String(new CString(error));
      this.library.symbols.aphrody_py_string_free(error);
    }
    throw new Error(message);
  }

  run(code: string): void {
    if (this.#closed) throw new Error("Python session is closed");
    const input = cstring(code);
    this.#check(this.library.symbols.aphrody_py_run(ptr(input)));
  }

  /** Historical scalar/string evaluator. buffer() shares native storage. */
  eval(expression: string): string {
    if (this.#closed) throw new Error("Python session is closed");
    const input = cstring(expression);
    const output = new BigUint64Array(1);
    this.#check(this.library.symbols.aphrody_py_eval(ptr(input), ptr(output)));
    const address = Number(output[0]);
    try { return String(new CString(address)); }
    finally { this.library.symbols.aphrody_py_string_free(address); }
  }

  /** Writable contiguous bytes; exporter and storage stay pinned through JS GC. */
  buffer(expression: string): ArrayBuffer {
    if (this.#closed) throw new Error("Python session is closed");
    const input = cstring(expression);
    const descriptor = Buffer.alloc(32);
    descriptor.writeUInt32LE(32, 0);
    this.#check(this.library.symbols.bun_py_buffer_acquire(ptr(input), 1, ptr(descriptor)));
    const address = descriptor.readBigUInt64LE(8);
    const length = descriptor.readBigUInt64LE(16);
    const lease = descriptor.readBigUInt64LE(24);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
      this.library.symbols.bun_py_buffer_release(lease);
      throw new Error("Python buffer exceeds JavaScript's safe length");
    }
    if (length === 0n) {
      this.#check(this.library.symbols.bun_py_buffer_release(lease));
      return new ArrayBuffer(0);
    }
    try {
      return toArrayBuffer(address, 0, Number(length), lease,
        this.library.symbols.bun_py_buffer_deallocator.ptr);
    } catch (error) {
      this.library.symbols.bun_py_buffer_release(lease);
      throw error;
    }
  }

  /** Refuses to destroy Python while JS still owns any shared storage. */
  close(): void {
    if (this.#closed) return;
    this.#check(this.library.symbols.aphrody_py_finalize());
    this.#closed = true;
  }
}

export function openPython(options: PythonOptions): PythonSession {
  if (!["x64", "arm64"].includes(process.arch)) throw new Error("Python JS bridge requires 64-bit pointers");
  const path = resolve(options.hostLibrary);
  const selectedPython = resolve(options.libpython);
  const existing = sessions.get(path);
  if (existing) {
    if (existing.libpython !== selectedPython) throw new Error("a different CPython already owns this host");
    return existing;
  }
  const library = libraries.get(path) ?? dlopen(path, definitions);
  libraries.set(path, library);
  if (library.symbols.bun_py_abi_version() !== 1 || !(BigInt(library.symbols.bun_py_capabilities()) & 1n))
    throw new Error("Python host lacks ABI 1 writable buffer capability");
  const input = cstring(selectedPython);
  const session = new PythonSession(library, selectedPython);
  const load = library.symbols.aphrody_py_load(ptr(input));
  if (load < 0) throw new Error(`CPython load failed: ${load}`);
  const initialize = library.symbols.aphrody_py_init();
  if (initialize < 0) throw new Error(`CPython initialization failed: ${initialize}`);
  sessions.set(path, session);
  return session;
}
