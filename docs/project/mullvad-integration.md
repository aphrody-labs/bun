# Mullvad native integration inventory

This inventory records the official upstream source on 2026-10-11. It proposes
component boundaries for Bun VPN, its CLI and the Aphrody desktop. It does not
qualify a compiled VPN engine or an active Mullvad connection.

The upstream is [mullvad/mullvadvpn-app](https://github.com/mullvad/mullvadvpn-app).
Live `git ls-remote` resolves `refs/heads/main` to
`493198790be1ec34b5cc3cfbfb50d02197264463`. The Aphrody Labs fork was created
from upstream, and this checkout pins its commit without initializing nested components.

## Source and license pins

The pinned [workspace manifest](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/Cargo.toml)
sets Rust edition 2024, Rust version 1.97.1 and `GPL-3.0-or-later`. The inspected
Talpid and Mullvad crates inherit that license. They are not permissively licensed
drop-in components. Preserve the upstream [license](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/LICENSE.md),
copyright notices and exact corresponding sources. Resolve the licensing of the
distributed combined artifact before linking these crates into Bun. Merely
retaining a source submodule does not qualify that distribution.

| Pinned source file | Bytes | SHA-256 |
| --- | ---: | --- |
| `Cargo.toml` | 8418 | `9893f8462cbcc6c72d2212d0d197ddc99782d77bba7f43a0c5353a7dc0334123` |
| `LICENSE.md` | 34913 | `8951bda6e616df7418ff3f80d9699f96da704df64f3bc9f0d5bb75a103680456` |
| `.gitmodules` | 457 | `605d2679ae97a2a2be0a36b3d8fd13dcb05bd21d776397ba806e63504530eed3` |
| `rust-toolchain.toml` | 97 | `75ff34eef98ec85ab89d20ecf182008ccb1bace34b081e5b0688ee0aefc6745c` |

These hashes identify the public raw files fetched at that commit. The existing
Bun toolchain uses `nightly-2026-09-15`; compatibility with upstream's 1.97.1
requirement remains a compilation gate. This inventory changes neither toolchain.

## Candidate components and consumers

The classifications below are integration proposals derived from the manifests.
They do not establish stable library APIs or tested Bun compatibility.

| Component | Concrete consumer | Dependencies and boundary |
| --- | --- | --- |
| [mullvad-management-interface](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/mullvad-management-interface/Cargo.toml) | A native Bun VPN owner communicates with an existing daemon; CLI and desktop call that owner | Generated Protobuf/Tonic interface, Mullvad paths/types and Talpid types. Keep daemon access local and preserve its IPC authorization. |
| [talpid-types](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/talpid-types/Cargo.toml) | Tunnel/network DTO conversion at the native boundary | Includes X25519 secret-key types. Keep key material in the existing protected native store; expose status DTOs separately. |
| [talpid-net](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/talpid-net/Cargo.toml) | Native socket bypass helpers where the existing owner needs them | Socket2, Unix libc/nix and native error helpers. Reuse existing Bun networking for ordinary fetch and DNS. |
| [talpid-routing](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/talpid-routing/Cargo.toml) | Privileged platform tunnel owner | OS-specific routing backends and Windows Talpid helpers. Route changes require restoration and failure tests. |
| [talpid-wireguard](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/talpid-wireguard/Cargo.toml) | Existing native VPN tunnel lifecycle | Depends on routing, tunnel/config clients, types and obfuscation. It is not a standalone generic Rust socket crate. |
| [tunnel-obfuscation](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/tunnel-obfuscation/Cargo.toml) | Optional qualified WireGuard transport | MASQUE proxy and Talpid dependencies. Keep one upstream implementation; do not copy cryptographic primitives. |

`mullvad-api` concerns Mullvad's service, account and device APIs. Its presence
does not provide an account or subscription. `mullvad-tls-client` is service
transport support; Bun's existing TLS owner remains responsible for ordinary
HTTPS. `talpid-core` orchestrates platform firewall, DNS and tunnel state. Keep
those privileges outside public JavaScript and browser interfaces.

The upstream [architecture and build instructions](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/README.md)
separate the daemon, CLI and Electron desktop. Reuse the native daemon contract
and the canonical Aphrody UI rather than adding an Electron application to Bun.
Windows packaging and signed drivers remain platform artifacts, not ordinary
Rust dependencies. Android and iOS frontends are outside this desktop inventory.

## Ordered qualification plan

1. Record the authorized fork URL, exact gitlink, upstream notices and local
   patches. Keep vendor source out of format sweeps. Use the upstream lockfile.
2. Inventory required nested components before initialization. Upstream advises
   one-level submodule initialization because deeper trees can be large and
   unnecessary. The pinned `.gitmodules` lists binaries, libwfp,
   windows-libraries and wireguard-apple; initialize only the target's needs.
3. Select a concrete native consumer and resolve its dependency closure,
   licensing and Rust toolchain. Build selected components through the existing
   serialized factory; run scoped checks, tests and strict Clippy.
4. Test local IPC, cancellation, tunnel teardown, DNS restoration, firewall
   restoration, route leakage and privilege boundaries on each supported OS.
5. Publish exact artifact hashes and connection evidence before claiming an
   internal Bun VPN implementation. Separate source availability, daemon
   connectivity, UI status and actual egress qualification.

A Google crawl also needs an independent per-hop destination allowlist. A VPN
or HTTP CONNECT relay changes egress; it does not enforce the crawl's logical
host and redirect policy.
