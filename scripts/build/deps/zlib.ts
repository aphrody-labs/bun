/**
 * zlib — headers only. The implementation is zlib-rs, absorbed in src/zlib_rs
 * (`export-symbols` feature), compiled into bun's Rust final link, which
 * exports the stock C ABI (deflateInit_, inflate, crc32, ...). `zlib.h` and
 * `zconf.h` come from src/zlib_rs/include and describe the same ABI, so libarchive,
 * libspng and curl compile against them unchanged.
 */

import type { Dependency } from "../source.ts";

export const zlib: Dependency = {
  name: "zlib",

  source: () => ({ kind: "in-tree", path: "src/zlib_rs/include" }),

  build: () => ({ kind: "none" }),

  provides: () => ({ libs: [], includes: ["."] }),
};
