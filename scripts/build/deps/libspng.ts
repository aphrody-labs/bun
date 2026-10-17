/**
 * libspng — simple, fast PNG codec. Backs Bun.Image PNG decode/encode.
 *
 * Single-TU library; the only external dep is zlib for the deflate stream.
 * <zlib.h> comes from src/zlib_rs/include (zlib-rs, same ABI as stock zlib).
 *
 * SPNG_STATIC drops the dllexport/visibility decoration; SPNG_SSE controls
 * the x86 filter SIMD level (4=SSE4.1, within our nehalem x64 floor).
 */

import type { Dependency } from "../source.ts";
import { resolve } from "node:path";

const LIBSPNG_COMMIT = "fb768002d4288590083a476af628e51c3f1d47cd"; // v0.7.4

export const libspng: Dependency = {
  name: "libspng",

  source: () => ({
    kind: "github-archive",
    repo: "randy408/libspng",
    commit: LIBSPNG_COMMIT,
  }),

  // spng.c includes <zlib.h>, provided by src/zlib_rs/include.
  fetchDeps: ["zlib"],

  build: cfg => ({
    kind: "direct",
    sources: ["spng/spng.c"],
    includes: ["spng"],
    defines: {
      SPNG_STATIC: true,
      // 4 = SSE4.1 defilter paths (pabsw/pblendvb); our x64 floor is nehalem. No-op on arm64 (NEON is auto-detected).
      ...(cfg.x64 ? { SPNG_SSE: 4 } : {}),
    },
    cflags: [`-I${resolve(cfg.cwd, "src/zlib_rs/include")}`],
  }),

  provides: () => ({
    libs: [],
    includes: ["spng"],
  }),
};
