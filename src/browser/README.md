<!-- SPDX-License-Identifier: Apache-2.0 -->
# Bun browser engine

This directory contains Bun's browser libraries: DOM, JavaScript execution,
HTTP/TLS, SSRF policy, CDP, tool handlers, extraction, layout, paint, crawl,
detection and index. All delivery surfaces use the existing `bun` executable,
CLI, FFI, MCP registry and agent plugin. Libraries here add no separate binary,
server or plugin.

The DOM is connected to the native `Bun.HTML` API. The optional renderer
`bun-css` feature uses Bun's CSS parser and AST. These bindings require native
candidate qualification; moving source files does not establish runtime parity.
The legacy V8 provider remains until the JSC page implementation passes its
behavior, lifetime, permission and performance gates.

The 15 browser crates are members of the single root Bun Cargo workspace.
Root `Cargo.toml` owns dependency resolution and build profiles; root
`Cargo.lock` owns the resolved graph. The intermediate browser `Cargo.toml`,
`Cargo.lock`, `rust-toolchain.toml` and `.cargo/config.toml` have been removed.
Run Cargo from the repository root; do not regenerate a child workspace or lock.
Further native integration and consumer migration are tracked in
[TODO-BUN](../../TODO-BUN.md).

The documented upstream release baseline is Bun 1.4.3. Fork package manifests
use 1.4.4; a manifest version does not qualify a built or installed runtime.

## Qualification

Run heavy gates only on the declared VPS factory, under its resource lease and
serialized Cargo wrapper. Use `bun bd test` to exercise native changes, not the
installed runtime. The root `browser-tests` profile inherits `dev`, with
`debug = 0`, `incremental = false` and `split-debuginfo = "off"`; use this
profile for scoped browser Cargo gates. The browser features are `bun_browser/render`,
`bun_browser_cdp/render`, `bun_browser_mcp/render`, and
`bun_browser_render/bun-css`. Include all targets for check and strict Clippy.

The declared VPS factory allocation for this lot is
`/home/ubuntu/builds/bun-os-factory`: 107 GiB disk and 45 GiB RAM. Check live
resource availability and the factory lease before starting a gate. Allocation
does not replace the build owner's locks or establish successful execution.

`scripts/verify-migration.ts` verifies integrated hashes. `MIGRATION.json` and
`BROWSER-MIGRATION.json` retain immutable source hashes alongside integration
hashes; they distinguish original provenance from adapted code. Historical
audits, patches, licenses and stored-format identities retain their original
names to preserve attribution and data compatibility.

Initial import qualified on Windows before the VPS directive and on Linux
(2,250 passed, 5 skipped; check and strict Clippy passed). Those receipts do not
qualify later native HTML/CSS/JSC additions or the new root workspace graph,
root lockfile and `browser-tests` profile. Their new VPS gates remain open.
Product consumers remain on their qualified provider until the relevant
replacement gates pass.
