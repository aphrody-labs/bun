// R1, runtime lane: 100 000 calls of libc abs() through bun:ffi / Deno.dlopen.
import { existsSync } from "node:fs";
import process from "node:process";
import { measureSync, report, runtime } from "./common.mjs";

const candidates =
  process.platform === "win32"
    ? ["msvcrt.dll"]
    : process.platform === "darwin"
      ? ["/usr/lib/libSystem.B.dylib"]
      : [
          "/lib/x86_64-linux-gnu/libc.so.6",
          "/lib/aarch64-linux-gnu/libc.so.6",
          "/usr/lib/x86_64-linux-gnu/libc.so.6",
          "/usr/lib/aarch64-linux-gnu/libc.so.6",
          "/lib/ld-musl-x86_64.so.1",
          "/lib/ld-musl-aarch64.so.1",
          "/lib64/libc.so.6",
        ];
const lib = candidates.find(p => !p.startsWith("/") || existsSync(p));
if (!lib) throw new Error("libc not found");

let abs, close;
if (runtime === "bun") {
  const { dlopen, FFIType } = await import("bun:ffi");
  const h = dlopen(lib, { abs: { args: [FFIType.i32], returns: FFIType.i32 } });
  abs = h.symbols.abs;
  close = () => h.close();
} else {
  const h = Deno.dlopen(lib, { abs: { parameters: ["i32"], result: "i32" } });
  abs = h.symbols.abs;
  close = () => h.close();
}

const CALLS = 100000;
const r = measureSync("calls", () => {
  let s = 0;
  for (let i = 0; i < CALLS; i++) s = (s + abs(i - 50000)) >>> 0;
  return s;
});
close();
report("ffi", "runtime", { calls: r }, { lib, calls: CALLS });
