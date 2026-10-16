/**
 * uutils coreutils (MIT) — the applets of `bun_coreutils` (src/coreutils): `bun` run under an
 * applet name (`head`, `sort`, ...) or Bun Shell finding no such command on PATH. A cargo path
 * dep like `lolhtml` (see that file): fetched into `vendor/uutils/`, compiled as rlibs in the
 * workspace crate graph.
 *
 * aphrody-labs/uutils-coreutils branch `aphrody` is the fork of uutils/coreutils (0.13.0). It carries
 * the uucore feature `lazy-startup`, which drops the `.init_array` constructor each utility
 * registers, so `bun` pays nothing at startup for carrying them, and the Linux kernel timer fix.
 * Bun OS pins the same commit as the flat submodule `vendor/uutils/coreutils`, shared with
 * `crates/bunos-utils`; `--local-deps uutils=<bun-os>/vendor/uutils/coreutils` builds from it.
 */

import type { Dependency } from "../source.ts";

export const UUTILS_COMMIT = "12d526de6dda957d6faebb0224d1d38cdd64ba15"; // 0.13.0 + aphrody
export const UUTILS_SOURCE = {
  kind: "github-archive",
  repo: "aphrody-labs/uutils-coreutils",
  commit: UUTILS_COMMIT,
} as const;
export const UUTILS_PATCHES: string[] = [];

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
