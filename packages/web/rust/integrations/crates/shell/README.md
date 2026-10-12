<!-- SPDX-License-Identifier: Apache-2.0 -->

# Bun shell and terminal crates

This workspace owns the local Rust implementation consumed by Bun's browser OS:

- `web` — WASM bindings, local shell, OPFS VFS, and Rio-backed terminal surface.
- `session` — transport-neutral shell session and engine traits.
- `vfs` — byte-path virtual filesystem and conformance contract.
- `terminal-core` — renderer-neutral VT state using `rio-vt`.

The three dependency crates were initially copied byte-for-byte from `aphrody/crates/shell/{session,vfs,terminal-core}` at source revision `14da235cd69fb51c79ec0ef4e91bac0a37de0cb0`, with SHA-256 comparison after transfer. Rust formatting and the UTF-8 input fix are local provider changes since that import. The provider workspace now resolves the crates by local path; it no longer fetches them from the Aphrody Git repository. Rio `rio-vt` 0.5.28 now resolves from Bun's in-tree `src/rio/rio-vt` source with default features disabled, shared with the native runtime.

The browser shell now buffers incomplete UTF-8 code points across input frames; a split-frame WASM smoke test round-tripped French, Japanese, Arabic and emoji text. The release WASM build completed on Windows and the Bun `wasm-opt -Oz` packager reduced the module from 5,301,468 to 4,056,374 bytes (SHA-256 `DA174131142322D4CFC1B8461E2C006D16D7E16AB05554F1A7F065FEE1229623`). The generated package is a local qualification artifact, not a published or activated release.

The web target consumes Rio's terminal VT parser, screen/grid, cursor, SGR styling and reply handling through `terminal-core`. Rio's optional PTY, clipboard, windowing and GPU renderer features are deliberately disabled for WASM; a browser cannot host those native capabilities. Native PTYs are supplied only by an explicit Bun host transport.

The canonical M3 interface and product behavior remain in Aphrody. This Bun integration contains the runtime implementation and its WASM bridge; it does not grant browser pages access to the host shell. The public terminal uses the browser-local WASM/OPFS implementation. Native `Bun.Terminal` PTYs remain an explicitly privileged server/desktop capability.

Run from the Bun checkout through the host's configured serialized Cargo owner:

```powershell
cargo check --manifest-path packages/web/rust/Cargo.toml -p aphrody-shell-web --locked
cargo test --manifest-path packages/web/rust/Cargo.toml -p aphrody-shell-web -p aphrody-shell-session -p aphrody-shell-vfs -p aphrody-terminal-core --locked
cargo clippy --manifest-path packages/web/rust/Cargo.toml -p aphrody-shell-web -p aphrody-shell-session -p aphrody-shell-vfs -p aphrody-terminal-core --locked --no-deps -- -D warnings
```

For the browser artifact, also build `aphrody-webos-wasm` for `wasm32-unknown-unknown` and run the consumer's real-browser persistence and terminal checks. Native crate checks alone do not qualify a published or deployed WASM artifact. Route the commands through the configured serialized Cargo owner for the selected host.
