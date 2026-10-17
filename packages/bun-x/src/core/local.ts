// SPDX-License-Identifier: Apache-2.0
//
// Synchronous calls of the local operations that need no network: parsers, catalog, ranking,
// store. `client` is 0 for the ones that need no session. The reference implementation is
// bun_x (src/x/src/ops.rs) behind the native library; when that library is absent the
// operations with a Bun-native twin (./bun-local) run in-process instead. The native library is
// opened on the first call, never on import.

import { resolveNativeLibraryPath } from "@aphrody/bun/src/library";
import { xCall } from "@aphrody/bun/x";
import { bunLocal } from "./bun-local";
import { xErrorFromInfo } from "./error";

let native: boolean | undefined;

export function nativeAvailable(): boolean {
  if (native === undefined) {
    try {
      native = resolveNativeLibraryPath() !== undefined;
    } catch {
      native = false;
    }
  }
  return native;
}

/** Run a local operation and return its data, or throw its failure as an `XError`. */
export function local<T = unknown>(op: string, args: Record<string, unknown> = {}, client = 0): T {
  if (!nativeAvailable() && client === 0) {
    const run = bunLocal(op, args);
    if (run.handled) return run.data as T;
  }
  const envelope = xCall<T>(client, op, args);
  if (!envelope.ok) throw xErrorFromInfo(envelope.error);
  return envelope.data;
}

/** Drop the undefined entries of an argument object (JSON would drop them anyway; this is explicit). */
export function defined(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));
}
