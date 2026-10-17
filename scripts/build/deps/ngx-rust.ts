/**
 * ngx-rust (Apache-2.0) — the `ngx` and `nginx-sys` crates of the NGINX module in
 * `packages/bun-nginx/native`. A cargo path dep like `lolhtml` (see that file): fetched into
 * `vendor/ngx-rust/` so cargo can load the workspace on a fresh checkout. The revision is the one
 * `packages/bun-nginx/native/sources.json` pins.
 */

import type { Dependency } from "../source.ts";

export const NGX_RUST_COMMIT = "cf58b5270dc5e9b855dab765e9f13ba2a12c7709";
export const NGX_RUST_SOURCE = {
  kind: "github-archive",
  repo: "nginx/ngx-rust",
  commit: NGX_RUST_COMMIT,
} as const;

export const ngxRust: Dependency = {
  name: "ngx-rust",

  source: () => NGX_RUST_SOURCE,

  build: () => ({ kind: "none" }),

  provides: () => ({
    libs: [],
    includes: [],
  }),
};
