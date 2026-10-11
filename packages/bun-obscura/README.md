<!-- SPDX-License-Identifier: Apache-2.0 -->
# Obscura in Bun OS

Canonical engine source transferred from `aphrody-labs/aphrody` at
`2d66be8fcd84a87b4ca73124023881ca9d0c204f` on 2026-10-11, on the owner-requested
`obscura` branch of `aphrody-labs/bun-os`.

This independent Cargo workspace owns the complete Obscura family: public Rust
API, browser, DOM, V8/deno_core, HTTP/TLS and SSRF policy, CDP, MCP tool library,
optional layout and paint. It also owns its existing extraction library and
patched Taffy dependency. Package names, library names, features, fixtures,
fonts, notices and upstream patches are preserved.

Aphrody keeps product workflows, CLI, FFI and its single MCP server. It consumes
these crates by an exact Git revision. Obscura remote pages retain their origin,
profile and permission boundaries. V8 stays until measured JSC parity qualifies.

The parent Bun workspace excludes this package. Importing its source does not
link V8 into the Bun executable, add startup work or advertise a `Bun.obscura`
API. A native runtime binding and independently shipped precompiled browser SDK
remain separate qualification work.

## Validation

Run from this directory with the pinned stable Rust toolchain through the
qualified host's serialized Cargo wrapper:

```text
bun scripts/verify-migration.ts
cargo metadata --locked --no-deps --format-version 1
cargo check --locked --workspace --all-targets
cargo nextest run --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
```

For render qualification enable the relevant `render` features and
`obscura-render/paint`. `stealth` remains optional and carries the documented
platform BoringSSL constraints. The migration preserves these limitations.

`MIGRATION.json` pins every transferred file to its source SHA256. Only the
renderer manifest's Taffy relative path changes inside the imported crate trees.
The standalone lockfile is Cargo-generated from the source lockfile to preserve
resolved external versions. `patches/obscura` and `docs/upstream` retain dated
provenance; their historical paths describe the source checkout.

Rollback of the consumer is the previous Aphrody commit, whose source trees and
lockfile remain recoverable in Git. Do not copy this engine back into the product
workspace for routine changes: implement them here, qualify and advance the pin.
