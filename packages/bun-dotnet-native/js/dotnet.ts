// SPDX-License-Identifier: MIT
// bun:ffi binding of the bun_dotnet_host cdylib (include/bun_dotnet_host.h, ABI 1).
import { CFunction, CString, dlopen, FFIType, ptr, type FFIFunction, type Pointer } from "bun:ffi";

const definitions = {
  bun_dotnet_abi_version: { args: [], returns: FFIType.u32 },
  bun_dotnet_locate: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  bun_dotnet_main: { args: [FFIType.i32, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  bun_dotnet_initialize: { args: [FFIType.ptr], returns: FFIType.i32 },
  bun_dotnet_function_pointer: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.i32,
  },
  bun_dotnet_load_assembly: { args: [FFIType.ptr], returns: FFIType.i32 },
  bun_dotnet_last_error: { args: [], returns: FFIType.ptr },
  bun_dotnet_string_free: { args: [FFIType.ptr], returns: FFIType.void },
} as const;

type Library = ReturnType<typeof dlopen<typeof definitions>>;

const cstring = (value: string | null | undefined) => {
  if (value == null) return null;
  if (value.includes("\0")) throw new Error(".NET host input contains NUL");
  return Buffer.from(`${value}\0`);
};
const pointer = (buffer: Buffer | null) => (buffer === null ? null : ptr(buffer));

export class DotnetHost {
  readonly library: Library;

  constructor(readonly libraryPath: string) {
    this.library = dlopen(libraryPath, definitions);
    const abi = this.library.symbols.bun_dotnet_abi_version();
    if (abi !== 1) throw new Error(`unsupported bun_dotnet_host ABI ${abi}; expected 1`);
  }

  #take(raw: Pointer | number | bigint | null): string {
    if (raw === null || raw === 0 || raw === 0n) return "";
    try {
      return new CString(Number(raw) as Pointer).toString();
    } finally {
      this.library.symbols.bun_dotnet_string_free(Number(raw) as Pointer);
    }
  }

  #check(status: number): number {
    if (status >= 0) return status;
    const message = this.#take(this.library.symbols.bun_dotnet_last_error());
    throw new Error(message || `.NET host status ${status}`);
  }

  locate(dotnetRoot?: string): { dotnetRoot: string; hostfxr: string } {
    const root = cstring(dotnetRoot);
    const out = new BigUint64Array(2);
    this.#check(this.library.symbols.bun_dotnet_locate(pointer(root), ptr(out), ptr(out, 8)));
    return { dotnetRoot: this.#take(out[0]), hostfxr: this.#take(out[1]) };
  }

  /** Runs the dotnet muxer in this process; unavailable once the CLR runs here. */
  main(args: string[]): number {
    const buffers = args.map(arg => cstring(arg)!);
    const argv = new BigUint64Array(Math.max(buffers.length, 1));
    buffers.forEach((buffer, i) => (argv[i] = BigInt(ptr(buffer))));
    const exit = new Int32Array(1);
    this.#check(this.library.symbols.bun_dotnet_main(buffers.length, ptr(argv), ptr(exit)));
    return exit[0]!;
  }

  /** 0: the CLR started here; 1 or 2: it was already running. */
  initialize(runtimeConfig?: string): number {
    return this.#check(this.library.symbols.bun_dotnet_initialize(pointer(cstring(runtimeConfig))));
  }

  functionPointer(options: { assembly?: string; type: string; method: string; delegateType?: string }): Pointer {
    const out = new BigUint64Array(1);
    const assembly = cstring(options.assembly);
    const type = cstring(options.type);
    const method = cstring(options.method);
    const delegate = cstring(options.delegateType);
    this.#check(
      this.library.symbols.bun_dotnet_function_pointer(
        pointer(assembly),
        pointer(type),
        pointer(method),
        pointer(delegate),
        ptr(out),
      ),
    );
    return Number(out[0]) as Pointer;
  }

  /** A callable for a static .NET method (`[UnmanagedCallersOnly]` unless `delegateType`). */
  function<const Fn extends Omit<FFIFunction, "ptr">>(
    options: { assembly?: string; type: string; method: string; delegateType?: string },
    signature: Fn,
  ) {
    return CFunction({ ...signature, ptr: this.functionPointer(options) });
  }

  loadAssembly(assembly: string): void {
    this.#check(this.library.symbols.bun_dotnet_load_assembly(pointer(cstring(assembly))));
  }
}
