import { CString, FFIType, dlopen, ptr, type Pointer } from "bun:ffi";

type MpvSymbols = {
  mpv_create: { args: []; returns: FFIType.pointer };
  mpv_initialize: { args: [FFIType.pointer]; returns: FFIType.i32 };
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
  mpv_command: { args: [FFIType.pointer, FFIType.pointer], returns: FFIType.i32 },
  mpv_set_property_string: { args: [FFIType.pointer, FFIType.cstring, FFIType.cstring], returns: FFIType.i32 },
  mpv_get_property_string: { args: [FFIType.pointer, FFIType.cstring], returns: FFIType.pointer },
  mpv_free: { args: [FFIType.pointer], returns: FFIType.void },
  mpv_wait_event: { args: [FFIType.pointer, FFIType.double], returns: FFIType.pointer },
  mpv_terminate_destroy: { args: [FFIType.pointer], returns: FFIType.void },
};

export type MpvLibraryOptions = { libraryPath: string };

export class MpvClient {
  readonly #library: ReturnType<typeof dlopen<MpvSymbols>>;
  readonly #handle: Pointer;

  private constructor(library: ReturnType<typeof dlopen<MpvSymbols>>, handle: Pointer) {
    this.#library = library;
    this.#handle = handle;
  }

  static open(options: MpvLibraryOptions): MpvClient {
    if (!options.libraryPath) throw new TypeError("libraryPath is required");
    const library = dlopen(options.libraryPath, symbols);
    const handle = library.symbols.mpv_create();
    if (!handle) throw new Error("mpv_create failed");
    const status = library.symbols.mpv_initialize(handle);
    if (status < 0) {
      library.symbols.mpv_terminate_destroy(handle);
      throw new Error(`mpv_initialize failed: ${status}`);
    }
    return new MpvClient(library, handle as Pointer);
  }

  command(...args: string[]): void {
    if (args.length === 0) throw new TypeError("mpv command requires at least one argument");
    const encoded = args.map(value => Buffer.from(`${value}\0`));
    const argv = new Uint8Array((encoded.length + 1) * 8);
    const pointers = new DataView(argv.buffer);
    for (let index = 0; index < encoded.length; index++)
      pointers.setBigUint64(index * 8, BigInt(ptr(encoded[index])), true);
    const status = this.#library.symbols.mpv_command(this.#handle, ptr(argv));
    if (status < 0) throw new Error(`mpv_command failed: ${status}`);
  }

  setProperty(name: string, value: string): void {
    const status = this.#library.symbols.mpv_set_property_string(this.#handle, name, value);
    if (status < 0) throw new Error(`mpv_set_property_string failed: ${status}`);
  }

  getProperty(name: string): string | null {
    const value = this.#library.symbols.mpv_get_property_string(this.#handle, name);
    if (value === null || value === 0 || value === 0n) return null;
    const pointer = Number(value) as Pointer;
    try {
      return new CString(pointer).toString();
    } finally {
      this.#library.symbols.mpv_free(pointer);
    }
  }

  waitEvent(timeoutSeconds = 0): Pointer | null {
    return this.#library.symbols.mpv_wait_event(this.#handle, timeoutSeconds) as Pointer | null;
  }

  close(): void {
    this.#library.symbols.mpv_terminate_destroy(this.#handle);
  }
}
