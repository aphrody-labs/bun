/**
 * uutils coreutils (MIT) — the applets of `bun_coreutils` (src/coreutils): `bun` run under an
 * applet name (`head`, `sort`, ...) or Bun Shell finding no such command on PATH. A cargo path
 * dep like `lolhtml` (see that file): fetched into `vendor/uutils/`, compiled as rlibs in the
 * workspace crate graph.
 *
 * aphrody-labs/uutils-coreutils is the fork of uutils/coreutils (0.13.0). The patch adds the uucore
 * feature `lazy-startup`, which drops the `.init_array` constructor each utility registers, so
 * `bun` pays nothing at startup for carrying them.
 */

import type { Dependency } from "../source.ts";

export const UUTILS_COMMIT = "ca3e965d688739916016d4fe1a277701b44f3445"; // 0.13.0
export const UUTILS_SOURCE = {
  kind: "github-archive",
  repo: "aphrody-labs/uutils-coreutils",
  commit: UUTILS_COMMIT,
} as const;
export const UUTILS_PATCHES = ["patches/uutils/lazy-startup.patch", "patches/uutils/linux-kernel-timer.patch"];

export const uutils: Dependency = {
  name: "uutils",

  source: () => UUTILS_SOURCE,

  patches: UUTILS_PATCHES,

  build: () => ({ kind: "none" }),

  provides: () => ({
    libs: [],
    includes: [],
  }),
};
