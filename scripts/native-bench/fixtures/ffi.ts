import { dlopen, FFIType } from "bun:ffi";
const libc = process.platform === "linux" ? "libc.so.6" : "msvcrt.dll";
const { symbols: { abs } } = dlopen(libc, { abs: { args: [FFIType.i32], returns: FFIType.i32 } });
let s = 0;
for (let i = 0; i < 2_000_000; i++) s += abs(-i);
if (s <= 0) throw new Error("ffi");
