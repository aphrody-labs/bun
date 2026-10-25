# Mullvad native integration inventory

This inventory records the official upstream source on 2026-10-11 and the
integration into Bun's single Cargo workspace. The native `bun_vpn` client and
`bun vpn status|connect|disconnect` use Mullvad's management IPC and data types.
It does not compile or qualify
the privileged daemon, desktop, or an active Mullvad connection.

The upstream is [mullvad/mullvadvpn-app](https://github.com/mullvad/mullvadvpn-app).
Live `git ls-remote` resolves `refs/heads/main` to
`493198790be1ec34b5cc3cfbfb50d02197264463`. The Aphrody Labs fork adds the
third-party notice at `464d28812ac863ef75362b8fb85bcbdff961b9f9`.

The VPS release plan now builds a separate `bun-vpn-linux-x86_64.tar.gz`
sidecar from the pinned Mullvad submodule. It packages the headless daemon,
CLI, setup/exclude/problem-report helpers, relay and CA resources, both
upstream systemd units, the Mullvad license and third-party notices, plus an
exact source-revision pointer. The release verifier requires a native sidecar
receipt whenever the Linux x86_64 Bun release is selected. This sidecar is not
linked into `bun` and is not yet a claim that a public release asset has been
built or published.

This profile uses Mullvad's optimized upstream release settings with cgroup v2
support enabled. No comparative benchmark or memory qualification has been
recorded. It targets x86_64 Linux/glibc only. A working tunnel still needs
`/dev/net/tun`, network-administration privileges (normally root), suitable
firewall/routing access and, for boot-time blocking, systemd. Serverless
platforms that withhold those privileges cannot run a Mullvad tunnel. The
archive includes service files but does not install or enable them; review the
host's policy before installing the payload at filesystem root.

> Note (2026-10-25): `bun_vpn` and the Mullvad tree have since left this workspace for the `vpn`
> plugin, [aphrody-labs/bun-vpn](https://github.com/aphrody-labs/bun-vpn), mounted here as
> `plugins/vpn` with Mullvad at `plugins/vpn/vendor/mullvad` ([Add-ons](add-ons.mdx)).
> This inventory keeps its 2026-10-11 paths.

## Source and license pins

The pinned [workspace manifest](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/Cargo.toml)
sets Rust edition 2024, Rust version 1.97.1 and `GPL-3.0-or-later`. The inspected
Talpid and Mullvad crates inherit that license. They are not permissively licensed
drop-in components. Preserve the upstream [license](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/LICENSE.md),
copyright notices and exact corresponding sources. Resolve the licensing of the
distributed combined artifact before linking these crates into Bun. Merely
retaining a source submodule does not qualify that distribution.

| Pinned source file    | Bytes | SHA-256                                                            |
| --------------------- | ----: | ------------------------------------------------------------------ |
| `Cargo.toml`          |  8418 | `9893f8462cbcc6c72d2212d0d197ddc99782d77bba7f43a0c5353a7dc0334123` |
| `LICENSE.md`          | 34913 | `8951bda6e616df7418ff3f80d9699f96da704df64f3bc9f0d5bb75a103680456` |
| `.gitmodules`         |   457 | `605d2679ae97a2a2be0a36b3d8fd13dcb05bd21d776397ba806e63504530eed3` |
| `rust-toolchain.toml` |    97 | `75ff34eef98ec85ab89d20ecf182008ccb1bace34b081e5b0688ee0aefc6745c` |

These hashes identify the public raw files fetched at that commit. The existing
Bun toolchain uses `nightly-2026-09-15`; compatibility with upstream's 1.97.1
requirement remains a compilation gate. This inventory changes neither toolchain.

## Candidate components and consumers

The Bun `bun_vpn` crate depends on Mullvad's management interface and types.
The following platform crates remain part of the vendored upstream workspace;
they are not yet linked into Bun's runtime.

| Component                                                                                                                                                       | Concrete consumer                                                                             | Dependencies and boundary                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [mullvad-management-interface](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/mullvad-management-interface/Cargo.toml) | `bun_vpn::VpnClient` reads state and requests connect/disconnect through the installed daemon | Generated Protobuf/Tonic interface, Mullvad paths/types and Talpid types. Keep daemon access local and preserve its IPC authorization. |
| [talpid-types](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/talpid-types/Cargo.toml)                                 | Tunnel/network DTO conversion at the native boundary                                          | Includes X25519 secret-key types. Keep key material in the existing protected native store; expose status DTOs separately.             |
| [talpid-net](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/talpid-net/Cargo.toml)                                     | Native socket bypass helpers where the existing owner needs them                              | Socket2, Unix libc/nix and native error helpers. Reuse existing Bun networking for ordinary fetch and DNS.                             |
| [talpid-routing](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/talpid-routing/Cargo.toml)                             | Privileged platform tunnel owner                                                              | OS-specific routing backends and Windows Talpid helpers. Route changes require restoration and failure tests.                          |
| [talpid-wireguard](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/talpid-wireguard/Cargo.toml)                         | Existing native VPN tunnel lifecycle                                                          | Depends on routing, tunnel/config clients, types and obfuscation. It is not a standalone generic Rust socket crate.                    |
| [tunnel-obfuscation](https://github.com/mullvad/mullvadvpn-app/blob/493198790be1ec34b5cc3cfbfb50d02197264463/tunnel-obfuscation/Cargo.toml)                     | Optional qualified WireGuard transport                                                        | MASQUE proxy and Talpid dependencies. Keep one upstream implementation; do not copy cryptographic primitives.                          |

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

## Remaining integration gates

Windows setup fetches the two gitlinks needed by WinFw before configuring its
71-source static library. GitHub's parent archive omits their contents. The
recipe in `scripts/build/deps/winfw.ts` uses the existing archive fetch owner
and its commit/patch `.ref` identity; the libwfp compatibility patch is preserved.

| Windows source archive      | Gitlink at the upstream pin                |
| --------------------------- | ------------------------------------------ |
| `mullvad/libwfp`            | `94415c7a85ea0ef728dedc6778457395185d8925` |
| `mullvad/windows-libraries` | `0267555ea4a8ae6bcfd59930ce454b8614510875` |

These source archives do not qualify a Windows build, signed drivers or an
active VPN connection. Setup does not recursively clone the upstream tree.

1. The native client uses the platform's installed Mullvad daemon. Build and
   qualify the daemon and CLI through the existing native owner on Windows and
   Linux. Upstream advises
   one-level submodule initialization because deeper trees can be large and
   unnecessary. The pinned `.gitmodules` lists binaries, libwfp,
   windows-libraries and wireguard-apple; initialize only the target's needs.
2. `bun vpn status|connect|disconnect` is implemented through this native
   client. The Rust API is available to Bun's native runtime; a JavaScript
   binding and the canonical Aphrody desktop integration still need their
   existing shared FFI/UI paths wired to these same operations.
3. Test local IPC, cancellation, tunnel teardown, DNS restoration, firewall
   restoration, route leakage and privilege boundaries on each supported OS.
4. Publish exact artifact hashes and connection evidence before claiming an
   active native VPN implementation. Source integration alone does not prove
   daemon connectivity or actual egress.

A Google crawl also needs an independent per-hop destination allowlist. A VPN
or HTTP CONNECT relay changes egress; it does not enforce the crawl's logical
host and redirect policy.
