# packages/os

Standalone Cargo workspace (own `[workspace]`, own `Cargo.lock`, excluded from the root workspace) with the Aphrody-only units of the Bun runtime that were restored from their published legacy crates. Nothing here is published (`publish = false`).

| Crate | Legacy name | Purpose |
| --- | --- | --- |
| `bun-pkg` | `bun_pkg` | package contracts, metadata parsers, verified blob store, bounded HTTP ingestion |
| `bun-git` | `bun_git` | native Git (gix) and GitHub (octocrab) integration |
| `bun-native` | `bun_native` | host hardware topology and monotonic clock probes |
| `bun-vt` | `bun_vt` | headless VT/ANSI screen behind `Bun.TerminalScreen` |
| `bun-x` | `bun_x` | X / Twitter GraphQL and REST client with cookie auth |
| `bun-host` | `bun_host` | host resource inventory and signed host registry |
| `bun-env-cookie` | `bun_env_cookie` | `bun env` and `bun cookie` |
| `bun-python-host` | `bun-python-host` | lazy shared CPython host and C ABI |
| `bun-dotnet-host` | `bun-dotnet-host` | CLR host (hostfxr) |
| `bun-emu-host-sys` | `bun-emu-host-sys` | runtime-loaded bindings to the emulator host C ABI |
| `bun-emu-host` | `bun-emu-host` | safe API over the emulator host |
| `bun-windows-winclean` | `bun-windows-winclean` | Windows automation and diagnostics SDK |

```sh
cd packages/os
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

`bun-emu-host-sys` generates its bindings with bindgen and needs libclang.
