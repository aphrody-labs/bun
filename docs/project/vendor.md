# Vendor inventory and re-setup

`vendor/` only commits sources that `bun bd` compiles and that carry Aphrody
patches without a prebuilt. Everything else is fetched at a pinned revision.

## Committed (vital)

| Path                     | Consumer                                                       | Why in-tree                            |
| ------------------------ | -------------------------------------------------------------- | -------------------------------------- |
| `vendor/uv`              | `scripts/build/deps/uv.ts` (in-tree build dependency)          | uv 0.12.24 with Bun Python patches     |
| `vendor/windows-rs`      | `scripts/build/deps/windows-toolchain.ts`, `bun winmd`         | patched winmd/bindgen sources          |
| `vendor/find-msvc-tools` | `bun msvc`, `src/runtime/windows/sys/toolchain.rs`             | MSVC sysroot/cross patches             |
| `vendor/russh-sftp`      | `src/ssh` (Cargo path dependency)                              | patched crate                          |
| `vendor/mullvad`         | `src/bun_vpn` (Cargo path deps), `scripts/build/deps/winfw.ts` | `embedded` daemon feature, winfw build |

## Fetched by the build (gitignored clones)

`scripts/build/deps/*.ts` fetch the native dependencies (boringssl, brotli,
cares, highway, libarchive, libjpeg-turbo, libspng, libuv, libwebp,
lolhtml, lshpack, lsqpack, lsquic, mimalloc, nginx, ngx-rust, picohttpparser,
rust-argon2, tinycc, uutils, zstd, hdrhistogram) as archives at the commits
listed in `scripts/aphrody/deps.json`. zlib is zlib-rs, absorbed in `src/zlib_rs`. WebKit comes as a prebuilt identified by
its release URL (`.identity` stamp), without a checksum pin. A direct C/C++
dependency downloads instead of compiling once a matching registry pack is
indexed (`scripts/build/deps/README.md`, "Qualified native SDKs").
Deleting these directories is safe: the next `bun bd` refetches them.

## Optional source checkouts (`bun run vendor:setup <name|all|list>`)

`scripts/aphrody/vendor-setup.ts` holds the manifest below; it shallow-fetches the
exact revision into the destination and applies the local patch, if any.

| Name             | Repository              | Revision                                                 | Destination                                                 | Patch                                             | Used by                                                                      |
| ---------------- | ----------------------- | -------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| axum             | aphrody-labs/axum       | `c59208c86fded335cd85e388030ad59347b0e5ae` (axum-v0.8.9) | `vendor/axum`                                               | -                                                 | audit only; build uses crates.io `axum`                                      |
| leptos           | aphrody-labs/leptos     | `7ec903d4008ddf7679e771863f7b8b90f5cdebde` (v0.8.22)     | `vendor/leptos`                                             | -                                                 | audit only; build uses crates.io `leptos`                                    |
| gn               | aphrody-labs/gn         | `3f99f58c2568dd267952dcd80696406474f7e2ea`               | `build/sources/gn` then `vendor/gn` via `bun run gn:vendor` | -                                                 | `bun run gn`                                                                 |
| cef              | aphrody-labs/cef        | `7e28cb05af72af8c0cdfafe7facfca97eed139c8`               | `vendor/cef`                                                | -                                                 | `bun cef` (receipt: `docs/chromium/cef-source.json`)                         |
| ffmpeg           | FFmpeg/FFmpeg           | `263f2714221637396d088abe9a2dbe7c98192cc5`               | `vendor/ffmpeg`                                             | -                                                 | ABI reference; media SDK builds use `scripts/aphrody/media-sdk-sources.json` |
| mpv              | mpv-player/mpv          | `88eb9f2e73945d8bc9c133a2f67babaa9af34680`               | `vendor/mpv`                                                | `scripts/aphrody/vendor-patches/mpv.patch`        | libmpv Windows fork                                                          |
| libplacebo       | haasn/libplacebo        | `1dd022687b9ac1dd996855b51433bf770ae76aab`               | `vendor/libplacebo`                                         | `scripts/aphrody/vendor-patches/libplacebo.patch` | `bun run libplacebo`                                                         |
| fluentui         | aphrody-labs/fluentui   | `a2ebcfa86f7df5930fb4c75a4dde5b81c6d24860`               | `vendor/fluentui`                                           | -                                                 | `@aphrody/bun-windows-suite`                                                 |
| powershell       | aphrody-labs/PowerShell | `cf5765391c7c78914d5316f0b8105fa652456cc4`               | `vendor/powershell`                                         | -                                                 | `@aphrody/bun-windows-suite`                                                 |
| roslyn           | aphrody-labs/roslyn     | `c8b2c7a7e2c29fb031f39008e6258a8706dbf6b1`               | `vendor/roslyn`                                             | -                                                 | `@aphrody/bun-windows-suite`                                                 |
| vcpkg            | aphrody-labs/vcpkg      | `e664453ac3e6a07c62c92bedeb562effe662a44b`               | `vendor/vcpkg` (or `VCPKG_ROOT`)                            | -                                                 | `bun msvc vcpkg`, windows suite                                              |
| windows-terminal | aphrody-labs/terminal   | `2304e801074b546b4544f5cd697e98b0e4c94359`               | `vendor/windows-terminal`                                   | -                                                 | `@aphrody/bun-windows-suite`                                                 |

## Submodules still present

`vendor/brave-core` is being absorbed into
workspace crates; they stay pinned submodules until that migration lands
(`git submodule update --init --depth=1 vendor/brave-core`).
