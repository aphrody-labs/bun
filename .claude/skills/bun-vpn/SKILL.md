---
name: bun-vpn
description: Build, inspect and qualify Bun's native embedded Mullvad VPN daemon and management client.
---

Use the native Bun fork and read the repository's `AGENTS.md`, `PLAN.md`,
`MEMORY.md` and `START-HERE.md` before changing VPN code.

## Scope

The vpn plugin lives in [aphrody-labs/bun-vpn](https://github.com/aphrody-labs/bun-vpn),
mounted as the optional submodule `plugins/vpn`
(`git submodule update --init --checkout --recursive plugins/vpn`). The implementation boundary is `plugins/vpn/bun_vpn`. The complete embedded graph is
under `plugins/vpn/vendor/mullvad`, including the generated management interface, Talpid
networking crates and the Windows native sources under
`plugins/vpn/vendor/mullvad/windows`.

`bun vpn daemon` runs the embedded daemon. `bun vpn status`, `connect` and
`disconnect` use the native Mullvad management IPC client. Do not describe a
successful compile as proof of an active tunnel.

## Build and test

The plugin is its own Cargo workspace (`plugins/vpn/Cargo.toml`, own `Cargo.lock`)
that path-depends on crates of the Bun checkout, so it builds only while mounted
there. Build the executable through the Bun graph, which also compiles the
Windows firewall library (`scripts/build/deps/winfw.ts`, from
`plugins/vpn/vendor/mullvad/windows`):

```sh
git submodule update --init --checkout --recursive plugins/vpn
bun bd --target=plugins          # bun-vpn next to bun; WinFw on Windows
```

For the scoped crate, run cargo inside the plugin workspace. On Windows,
`talpid-core` links the WinFw library that the build above wrote to
`build/<profile>/deps/winfw`; point `WINFW_LIB_DIR` at it and set
`BUN_WINFW_STATIC=1`:

```sh
cd plugins/vpn
cargo check --locked -p bun_vpn
cargo test --locked -p bun_vpn --lib
```

A change to the plugin is committed in aphrody-labs/bun-vpn, then reaches the
runtime when its pin is bumped (skill `bun-add-ons`).

If the shared Cargo target is locked by another authorized build, use a
task-scoped `CARGO_TARGET_DIR` rather than interrupting it. A missing `winfw.lib`
is a native dependency failure; do not hide it with a stub or by removing the
firewall code.

## Graph workflow

Index the complete Bun VPN domain with the native graph indexer:

```powershell
bun scripts\aphrody\graph-index.ts --root C:\bun --profile bun `
  --domains plugins/vpn/bun_vpn --artifact-directory C:\bun\tmp\graph-artifacts-vpn
```

Export bounded, snapshot-pinned evidence with all scope identifiers returned by
the indexer:

```powershell
bun scripts\aphrody\graph-docs.ts `
  --repository <repository> --snapshot <snapshot> `
  --domain plugins/vpn/bun_vpn --source graph:bun:src:bun_vpn --profile bun `
  --workspace C:\bun --out C:\bun\tmp\graph-docs-vpn
```

Report the snapshot SHA, producer hash, coverage, unresolved records, parser
errors and missing benchmark metadata. Generated graph evidence stays in local
staging; owner-maintained docs and this skill are edited separately.

## Delivery

Commit only the relevant VPN, documentation and graph-scope files. Preserve
concurrent M3 work. Before pushing, fetch `origin`, verify that `origin/main`
is an ancestor of the local branch, and push normally. Never force-push.
