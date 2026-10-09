// SPDX-License-Identifier: Apache-2.0
// Windows directory links need FileRenameInfoEx: MoveFileEx cannot replace them.
// Layout and flags follow the installed Windows SDK's FILE_RENAME_INFO.
import type { dlopen as Dlopen } from "bun:ffi";
import { resolve } from "node:path";

export function replaceDirectoryLink(source: string, destination: string): void {
  if (process.platform !== "win32" || !["x64", "arm64"].includes(process.arch))
    throw new Error("Windows directory-link replacement requires a 64-bit Windows host");
  // Lazy: ordinary imports and non-Windows installers never load kernel32.
  const { dlopen, FFIType, ptr } = require("bun:ffi") as {
    dlopen: typeof Dlopen;
    FFIType: typeof import("bun:ffi").FFIType;
    ptr: typeof import("bun:ffi").ptr;
  };
  const library = dlopen("kernel32.dll", {
    CreateFileW: {
      args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u64],
      returns: FFIType.u64,
    },
    SetFileInformationByHandle: {
      args: [FFIType.u64, FFIType.u32, FFIType.ptr, FFIType.u32],
      returns: FFIType.i32,
    },
    GetLastError: { args: [], returns: FFIType.u32 },
    CloseHandle: { args: [FFIType.u64], returns: FFIType.i32 },
  });
  const path = Buffer.from(`${resolve(source)}\0`, "utf16le");
  const name = Buffer.from(resolve(destination), "utf16le");
  const info = Buffer.alloc(20 + name.length + 2);
  info.writeUInt32LE(3, 0); // REPLACE_IF_EXISTS | POSIX_SEMANTICS
  info.writeUInt32LE(name.length, 16); // RootDirectory is NULL at offset 8.
  name.copy(info, 20);
  let handle: bigint | undefined;
  try {
    handle = BigInt(library.symbols.CreateFileW(ptr(path), 0x00010000, 7, null, 3, 0x02200000, 0n)); // DELETE access; share read/write/delete; OPEN_REPARSE_POINT | BACKUP_SEMANTICS.
    if (handle === 0xffffffffffffffffn) {
      handle = undefined;
      throw new Error(`open runtime link failed: Windows error ${library.symbols.GetLastError()}`);
    }
    if (!library.symbols.SetFileInformationByHandle(handle, 22, ptr(info), info.length))
      throw new Error(`replace runtime link failed: Windows error ${library.symbols.GetLastError()}`);
  } finally {
    if (handle !== undefined) library.symbols.CloseHandle(handle);
    library.close();
  }
}
