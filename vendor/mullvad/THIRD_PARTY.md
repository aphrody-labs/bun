# Mullvad VPN

This repository is the `aphrody-labs/mullvadvpn-app` fork of the official
`mullvad/mullvadvpn-app` project, pinned by the parent Bun repository.

The source and derived crates retain the upstream `GPL-3.0-or-later` license.
See [`LICENSE.md`](LICENSE.md) and the copyright notices in the source. Bun's
native `bun_vpn` crate uses Mullvad's management IPC client and data types. The
Mullvad daemon remains the owner of privileged routes, DNS, firewall and tunnel
lifecycle. Distribution of a Bun binary that includes these crates must also
include the applicable GPL notices and corresponding source.

The Electron desktop application is not a second Bun desktop application. Bun
uses its existing desktop and UI surfaces to call the native VPN interface.
