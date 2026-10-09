// SPDX-License-Identifier: Apache-2.0
// Portable Bun FFI driver for the same native host ABI as driver.c.
import { dlopen, FFIType, ptr } from "bun:ffi";

const [mode, hostPath, pythonPath, separator, ...arguments_] = process.argv.slice(2);
if (!hostPath || (mode !== "--probe" && (mode !== "--invoke" || !pythonPath || separator !== "--")))
  throw new Error(
    "usage: driver.ts --probe <host> | --invoke <host> <libpython> -- <python argv...>",
  );
const host = dlopen(hostPath, {
  bun_py_abi_version: { args: [], returns: FFIType.u32 },
  aphrody_py_load: { args: [FFIType.ptr], returns: FFIType.i32 },
  bun_py_main: { args: [FFIType.i32, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
});
const version = host.symbols.bun_py_abi_version();
if (mode === "--probe") {
  console.log(JSON.stringify({ available: version === 1, abi_version: version }));
  host.close();
  process.exit(version === 1 ? 0 : 87);
}
if (version !== 1) process.exit(87);
if (!["x64", "arm64"].includes(process.arch))
  throw new Error("qualified driver needs 64-bit pointers");
const library = Buffer.from(`${pythonPath}\0`);
const loadStatus = host.symbols.aphrody_py_load(ptr(library));
console.error(`BUN_PY_CONFORMANCE phase=load host_status=${loadStatus} python_exit=0`);
if (loadStatus !== 0) process.exit(125);
const strings = arguments_.map((argument) => Buffer.from(`${argument}\0`));
const argv = Buffer.alloc(strings.length * 8);
strings.forEach((argument, index) => argv.writeBigUInt64LE(BigInt(ptr(argument)), index * 8));
const result = new Int32Array(1);
const status = host.symbols.bun_py_main(strings.length, ptr(argv), ptr(result));
console.error(`BUN_PY_CONFORMANCE phase=main host_status=${status} python_exit=${result[0]}`);
// CPython and the host stay mapped until process teardown, matching driver.c.
process.exit(status === 0 ? 0 : 125);
