# CEF on the owned Chromium source

The source fork is [aphrody-labs/cef](https://github.com/aphrody-labs/cef/tree/aphrody-chromium157).
Its only source owner in this checkout is `vendor/cef`. `bun cef link` exposes
that directory as `vendor/chromium/src/cef` through a Windows junction or a Unix
directory symlink. A conflicting directory is rejected rather than overwritten.

The imported upstream revision targets Chromium 156.0.8078.0. The adaptation
targets the current Chromium 157.0.8099.0 source at
`ce0615a76d6347f1914d673f1da66285b328d494`, including the owned M3 changes above
upstream `e20c553087353010f4b71143841c189447ac1628`. Source provenance and per-file
Git blob/SHA-256 receipts are recorded in `cef-source.json`.

```sh
bun cef plan
bun cef link
bun cef gen
bun cef build
bun cef package
```

The upstream generation pipeline runs through `bun uv` and patches the same
Chromium source owner before generating `out/Release_GN_x64` or its arm64
equivalent. The source port must pass all patch and GN gates before native
compilation. Source translation produced the real Chromium 157 version header
and API version 15600; the API version is read from the generated headers rather
than invented from Chromium's major version.

Windows may explicitly provision the pinned official SDK with `bun cef sdk
--plan` and `bun cef sdk --setup`. The provider uses NuGet's published SHA-512
catalog hashes for SDK 10.0.28000.2270, extracts only its `c/` payload into
`build/cef-sdk`, and never installs globally. Generation activates that SDK only
when its exact receipt exists. MSVC discovery still comes from the native Bun
owner; separate x64/x86 environment files contain only compiler paths and SDK
metadata. No SDK download happens during ordinary startup or generation.

The native distribution selected by `CEF_PATH` must be built from these sources.
`bun cef receipt` loads its own libcef, probes `cef_version_info` and
`cef_api_hash`, checks the generated header hash, then writes
`.bun-cef-build.json` with the binary checksum. `bun cef doctor` rejects absent
or mismatched receipts. Source headers use `.bun-cef-headers.json`; cef-rs
generates its bindings from these headers without downloading another CEF. The
cef-rs fork is owned by Bun OS (`vendor/cef-rs` in `aphrody-labs/bun-os`, `docs/cef-rs.md`).

These source and API receipts do not establish a successful CEF native build.
CEF binary compilation, cef-rs ABI qualification and browser integration remain
separate gates. Upstream build requirements and patch semantics are described
by [CEF's build guide](https://chromiumembedded.github.io/cef/branches_and_building).
