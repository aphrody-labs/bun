# Rio source integration

Rio is now part of the Bun source tree at `src/rio`; it is no longer a Git
submodule. The complete 620-file source snapshot was imported from
`aphrody-labs/rio` commit `59203ccd5fa1e6b760a738c1ad653bb29f2f3465`, which is
identical to `raphamorim/rio` upstream `main` at import time. The upstream fork
is `https://github.com/aphrody-labs/rio`, with `https://github.com/raphamorim/rio`
as its source. The latest release observed during migration is `v0.5.28` at
`37624389e8dde79ba25a8147a5e809c01d16d1c9`.

The import includes Rio's workspace, all 17 Cargo packages, build scripts,
workflow files, specifications, README files, and checked-in documentation.
The upstream MIT notice is kept at `src/rio/LICENSE` and copied to
`LICENSES/Rio-MIT.txt` for Bun source archives. The imported snapshot was
verified against the pinned checkout before removing `vendor/rio`. The local
Rio workspace manifest pins `serde` to Bun's compatible `1.0.228` version;
Cargo's unified lockfile resolves shared dependencies once.

On 2026-10-13, the live GitHub `main` branch still resolved to the imported
commit above. Its complete recursive tree contains 620 blobs. All are present
locally; 607 match upstream and 13 carry Bun's manifest, SIMDUTF, grid and memory
accounting adaptations. Eight upstream-identical files were excluded from Git
by the root `.cargo`, `.envrc` and `core` ignore patterns: Rio's Cargo/direnv
configuration and the six `sugarloaf/src/components/core` source files. These
files are now explicitly tracked so source archives and fresh clones retain
the full snapshot. The Cargo configuration belongs to standalone Rio builds;
the direnv file is opt-in and does not launch Nix in Bun's native Windows build.
See the immutable GitHub tree and per-file hashes in
[`rio-upstream-source.json`](rio-upstream-source.json).

The hosted documentation website is a separate repository,
`https://github.com/raphamorim/rioterm.com`. Its web-only content is not part of
the Rio source snapshot and is not redistributed here.
`https://rioterm.com/docs/install` remains the upstream reference.

## Bun integration

| Component | Source in this repository | Exposed by `bun:rio` |
| --- | --- | --- |
| VT parsing, Unicode graphemes, grid and scrollback | `rio-vt`, `rio-unicode`, `rio-grapheme-width`, `rio-grid` | Text, cell snapshots, resize, reset, cursor, title, alternate screen and query replies |
| Selection, search and damage tracking | `rio-vt` | No JavaScript methods for these operations |
| PTY and process management | `teletypewriter`, `corcovado`, `rio-vt` PTY feature | Use `Bun.Terminal` and `Bun.spawn` separately |
| GPU rendering and font shaping | `sugarloaf`, `libsugarloaf`, `rio-fonts` | No renderer or window |
| Native application and platform integration | `frontends`, `rio-backend`, `rio-window`, `rio-notifier` | No application, clipboard or window integration |
| C and browser embedding | `librio`, `librio-wasm` | Bun uses Rust bindings directly; these separate ABIs are retained as source |
| Image protocols | `rio-graphics`, `rio-vt` | No image-event or image-rendering API |

These boundaries follow upstream's separation between the
[`rio-vt` core](https://github.com/raphamorim/rio/tree/main/rio-vt),
[`librio` C ABI](https://github.com/raphamorim/rio/tree/main/librio) and
[`librio-wasm` browser ABI](https://github.com/raphamorim/rio/tree/main/librio-wasm).
Source availability does not mean that every Rio application feature is linked
or exposed to JavaScript.

Both the Bun runtime and the browser terminal now depend on the local Rio
`rio-vt` crate at `src/rio/rio-vt`, with default features disabled. Bun exposes
the headless VT parser and grid through `Bun.RioTerminal` and `bun:rio`. This
adapter does not enable Rio's PTY, windowing, clipboard, or GPU-renderer
features. It does not start a shell or access host files. Host processes remain
under Bun's explicit process/terminal APIs.

Host-backed Kitty image transfers are guarded by the local `host-graphics`
feature. The native `pty` feature enables it to preserve Rio application
behavior; standalone embedders can opt in explicitly. Bun enables neither:
file, temporary-file and shared-memory transfers return an unsupported-medium
response before any host access. Direct image payloads remain part of the VT
core, but Bun exposes no image rendering or image-event API.

The Bun runtime enables the `bun-simdutf` feature to reuse Bun's existing native
SIMDUTF implementation. Standalone and browser-workspace builds leave that
feature off and use Rio's scalar UTF-8/base64 fallbacks, including for
`wasm32-unknown-unknown`; they do not need Bun's native C++ shim at link time.

The full Rio workspace is retained under `src/rio` so its crates and build
infrastructure remain available as source. The Bun runtime currently links the
VT core; the remaining Rio application crates are preserved intact and are not
all linked into Bun's executable. Upstream CI files are preserved with the
source but have not been rewritten as Bun root CI workflows. The public API is
documented in [`Terminal APIs`](../runtime/terminal.mdx), which is part of the
Bun documentation site navigation.

## Updating the imported snapshot

Update the Aphrody fork from upstream, then refresh the source snapshot from
that reviewed commit. Do not make a submodule or registry dependency from Rio:

```sh
git clone https://github.com/aphrody-labs/rio.git "$RIO_SYNC_DIR"
git -C "$RIO_SYNC_DIR" remote add upstream https://github.com/raphamorim/rio.git
git -C "$RIO_SYNC_DIR" fetch upstream main
git -C "$RIO_SYNC_DIR" switch main
git -C "$RIO_SYNC_DIR" merge --ff-only upstream/main
git -C "$RIO_SYNC_DIR" push origin main
```

Review upstream code, licenses, Cargo manifests, and workflow changes before
replacing `src/rio`. Update the imported commit recorded above and run the Bun
Rio tests and Rust gates before publishing the change.
