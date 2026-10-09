// SPDX-License-Identifier: Apache-2.0
/** Messages between the WebOS page and its bun_wasm REPL worker. */

/** Served by startWebOS from its wasmDir; bun_wasm is built from C:\bun\src\wasm (wasm32-wasip1-threads). */
export const WASM_BASE = "/dist/wasm";
export const BUN_WASM = `${WASM_BASE}/bun/bun_wasm.wasm`;
/** Page workers, bundled on demand by startWebOS. */
export const WORKER_BASE = "/dist/workers";

export type ReplRequest = { type: "init" } | { type: "eval"; id: number; code: string };

export type ReplResponse =
  | { type: "ready"; bunVersion: string }
  | { type: "failed"; error: string }
  | { type: "log"; id: number; level: "log" | "warn" | "error"; text: string }
  | { type: "result"; id: number; ok: boolean; text: string };
