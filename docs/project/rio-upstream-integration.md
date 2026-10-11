# Rio source integration

Rio is now part of the Bun source tree at `src/rio`; it is no longer a Git
submodule. The complete 620-file tracked source snapshot was imported from
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

The hosted documentation website is a separate repository,
`https://github.com/raphamorim/rioterm.com`. It currently has no declared
license or `LICENSE` file, so its web-only content is not redistributed.
`https://rioterm.com/docs/install` remains the upstream reference.

## Bun integration

Both the Bun runtime and the browser terminal now depend on the local Rio
`rio-vt` crate at `src/rio/rio-vt`, with default features disabled. Bun exposes
the headless VT parser and grid through `Bun.RioTerminal` and `bun:rio`. This
adapter does not enable Rio's PTY, windowing, clipboard, or GPU-renderer
features. It does not start a shell or access host files. Host processes remain
under Bun's explicit process/terminal APIs.

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
