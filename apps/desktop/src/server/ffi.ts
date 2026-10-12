// SPDX-License-Identifier: Apache-2.0
/**
 * bun:ffi from the WebOS: `dlopen` of the C library of the host (getpid / GetCurrentProcessId, checked
 * against `process.pid`) and `cc`, which compiles C with the TinyCC built into Bun and calls it.
 */
import { cc, dlopen, FFIType, suffix } from "bun:ffi";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type FfiProbe =
  | { ok: true; library: string; symbol: string; value: number; matchesProcessPid: boolean }
  | { ok: false; tried: string[]; error: string };

function libcCandidates(): { library: string; symbol: string }[] {
  if (process.platform === "win32") return [{ library: "kernel32.dll", symbol: "GetCurrentProcessId" }];
  if (process.platform === "darwin") return [{ library: "libc.dylib", symbol: "getpid" }];
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  return [`libc.so.6`, `libc.musl-${arch}.so.1`, `/lib/ld-musl-${arch}.so.1`, `libc.${suffix}`].map(library => ({
    library,
    symbol: "getpid",
  }));
}

export function probeDlopen(): FfiProbe {
  const tried: string[] = [];
  let last = "";
  for (const { library, symbol } of libcCandidates()) {
    tried.push(library);
    try {
      const lib = dlopen(library, { [symbol]: { args: [], returns: FFIType.u32 } });
      try {
        const value = (lib.symbols[symbol] as () => number)();
        return { ok: true, library, symbol, value, matchesProcessPid: value === process.pid };
      } finally {
        lib.close();
      }
    } catch (error) {
      last = (error as Error).message;
    }
  }
  return { ok: false, tried, error: last };
}

export type CcResult =
  | { ok: true; source: string; calls: { args: [number, number]; result: number }[] }
  | { ok: false; error: string };

const C_SOURCE = `/* compiled by bun:ffi cc (TinyCC) */
int webos_gcd(int a, int b) { while (b) { int t = a % b; a = b; b = t; } return a < 0 ? -a : a; }
`;

/** Compiles C_SOURCE with `cc` and calls it on each pair. */
export async function runCc(pairs: [number, number][]): Promise<CcResult> {
  const dir = await mkdtemp(join(tmpdir(), "bun-webos-cc-"));
  try {
    const source = join(dir, "webos.c");
    await Bun.write(source, C_SOURCE);
    const lib = cc({ source, symbols: { webos_gcd: { args: ["int", "int"], returns: "int" } } });
    try {
      return {
        ok: true,
        source: C_SOURCE,
        calls: pairs.map(args => ({ args, result: lib.symbols.webos_gcd(...args) as number })),
      };
    } finally {
      lib.close();
    }
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
