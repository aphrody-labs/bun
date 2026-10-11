# Aphrody web source transfer

Owner directive, 2026-10-11: move Aphrody's web, Google and Chromium sources
directly to the existing Bun checkout. `transfer-receipt.json` records source
HEAD, original paths, destinations and SHA-256 values verified after each move.
Source ownership transfer is separate from consumer and runtime qualification.

`crates/` and `packages/` contain the former Aphrody web owners.
`integrations/` contains transferred integrations with their original relative
paths. Google owners live under `../bun-google/aphrody/`.
Documentation and scripts are under `../../docs/aphrody-source/` and
`../../scripts/aphrody-source/`.

The source directories have moved. Cargo inheritance now resolves in the Google
and Web provider workspaces. Remaining Aphrody Rust module declarations import
the provider's original integration sources through `aphrody-web-source`, keeping
their consumer crate context. No-dependency Cargo metadata passes for both
providers and Aphrody. Complete offline dependency resolution also passes in the
current Aphrody checkout after unifying eleven application contracts through root
Cargo source patches. The provider library passes serialized Cargo check and
strict Clippy in that resolved graph. The source SDK passes tests and all-target strict Clippy, including text-source embedding and three canonical Bun SSRF policy tests. TypeScript adapters pass their scoped checks and runtime tests; complete product/engine consumer builds remain pending.
Do not publish or deploy this transfer as a qualified runtime. Do not remove
existing Bun browser implementations: integration must preserve the currently
tested engine and its API contracts. The separate Chromium build stays active.

Protected sessions, credentials, cookies, datasets, databases, model weights,
assets, build outputs and the pinned upstream reference mirror remain in their
existing stores. No authentication was copied or changed.

The DOM and SSRF compatibility packages now reexport the canonical Bun browser owners. Native DOM qualification passes 93 tests and strict Clippy; two compatibility tests preserve old selector/element names and type identity. Chrome aliases Chromium; Obscura shares its CDP transport. This unifies these qualified owners while the remaining V8/render engine migration retains its compatibility sources.
