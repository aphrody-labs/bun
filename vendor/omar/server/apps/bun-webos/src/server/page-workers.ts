// SPDX-License-Identifier: Apache-2.0
/** Page workers served at /dist/workers/<name>, by source path relative to the package. */
export const PAGE_WORKERS: Record<string, string> = {
  "repl.js": "src/os/wasm/repl-worker.ts",
};
