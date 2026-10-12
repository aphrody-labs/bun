import { CString, FFIType, dlopen, ptr, type Pointer } from "bun:ffi";
import { dirname, join } from "node:path";

type MpvSymbols = {
  mpv_create: { args: []; returns: FFIType.pointer };
  mpv_initialize: { args: [FFIType.pointer]; returns: FFIType.i32 };
  mpv_set_option_string: { args: [FFIType.pointer, FFIType.pointer, FFIType.pointer]; returns: FFIType.i32 };
  mpv_command: { args: [FFIType.pointer, FFIType.pointer]; returns: FFIType.i32 };
  mpv_set_property_string: { args: [FFIType.pointer, FFIType.cstring, FFIType.cstring]; returns: FFIType.i32 };
  mpv_get_property_string: { args: [FFIType.pointer, FFIType.cstring]; returns: FFIType.pointer };
  mpv_free: { args: [FFIType.pointer]; returns: FFIType.void };
  mpv_wait_event: { args: [FFIType.pointer, FFIType.double]; returns: FFIType.pointer };
  mpv_terminate_destroy: { args: [FFIType.pointer]; returns: FFIType.void };
};

const symbols: MpvSymbols = {
  mpv_create: { args: [], returns: FFIType.pointer },
  mpv_initialize: { args: [FFIType.pointer], returns: FFIType.i32 },
  mpv_set_option_string: { args: [FFIType.pointer, FFIType.pointer, FFIType.pointer], returns: FFIType.i32 },
  mpv_command: { args: [FFIType.pointer, FFIType.pointer], returns: FFIType.i32 },
  mpv_set_property_string: { args: [FFIType.pointer, FFIType.cstring, FFIType.cstring], returns: FFIType.i32 },
  mpv_get_property_string: { args: [FFIType.pointer, FFIType.cstring], returns: FFIType.pointer },
  mpv_free: { args: [FFIType.pointer], returns: FFIType.void },
  mpv_wait_event: { args: [FFIType.pointer, FFIType.double], returns: FFIType.pointer },
  mpv_terminate_destroy: { args: [FFIType.pointer], returns: FFIType.void },
};

export type MpvLibraryOptions = { libraryPath?: string; options?: Readonly<Record<string, string>> };

export function mpvLibraryPath(directory = dirname(process.execPath)): string {
  return join(
    directory,
    process.platform === "win32" ? "mpv-2.dll" : process.platform === "darwin" ? "libmpv.2.dylib" : "libmpv.so.2",
  );
}

function cstring(value: string): Uint8Array {
  if (value.includes("\0")) throw new TypeError("mpv strings must not contain NUL");
  return new TextEncoder().encode(`${value}\0`);
}

export class MpvClient {
  readonly #library: ReturnType<typeof dlopen<MpvSymbols>>;
  readonly #handle: Pointer;
  #closed = false;

  #assertOpen(): void {
    if (this.#closed) throw new Error("mpv client is closed");
  }

  private constructor(library: ReturnType<typeof dlopen<MpvSymbols>>, handle: Pointer) {
    this.#library = library;
    this.#handle = handle;
  }

  static open(options: MpvLibraryOptions = {}): MpvClient {
    const libraryPath = options.libraryPath ?? mpvLibraryPath();
    const library = dlopen(libraryPath, symbols);
    const handle = library.symbols.mpv_create();
    if (!handle) {
      library.close();
      throw new Error("mpv_create failed");
    }
    try {
      for (const [name, value] of Object.entries(options.options ?? {})) {
        const status = library.symbols.mpv_set_option_string(handle, ptr(cstring(name)), ptr(cstring(value)));
        if (status < 0) throw new Error(`mpv_set_option_string failed: ${status}`);
      }
      const status = library.symbols.mpv_initialize(handle);
      if (status < 0) throw new Error(`mpv_initialize failed: ${status}`);
      return new MpvClient(library, handle as Pointer);
    } catch (error) {
      library.symbols.mpv_terminate_destroy(handle);
      library.close();
      throw error;
    }
  }

  command(...args: string[]): void {
    this.#assertOpen();
    if (args.length === 0) throw new TypeError("mpv command requires at least one argument");
    const encoded = args.map(cstring);
    const argv = new Uint8Array((encoded.length + 1) * 8);
    const pointers = new DataView(argv.buffer);
    for (let index = 0; index < encoded.length; index++)
      pointers.setBigUint64(index * 8, BigInt(ptr(encoded[index])), true);
    const status = this.#library.symbols.mpv_command(this.#handle, ptr(argv));
    if (status < 0) throw new Error(`mpv_command failed: ${status}`);
  }

  setProperty(name: string, value: string): void {
    this.#assertOpen();
    const status = this.#library.symbols.mpv_set_property_string(this.#handle, ptr(cstring(name)), ptr(cstring(value)));
    if (status < 0) throw new Error(`mpv_set_property_string failed: ${status}`);
  }

  getProperty(name: string): string | null {
    this.#assertOpen();
    const value = this.#library.symbols.mpv_get_property_string(this.#handle, ptr(cstring(name)));
    if (value === null || value === 0 || value === 0n) return null;
    const pointer = Number(value) as Pointer;
    try {
      return new CString(pointer).toString();
    } finally {
      this.#library.symbols.mpv_free(pointer);
    }
  }

  waitEvent(timeoutSeconds = 0): Pointer | null {
    this.#assertOpen();
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 0)
      throw new TypeError("mpv timeout must be finite and nonnegative");
    return this.#library.symbols.mpv_wait_event(this.#handle, timeoutSeconds) as Pointer | null;
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#library.symbols.mpv_terminate_destroy(this.#handle);
    this.#library.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}
