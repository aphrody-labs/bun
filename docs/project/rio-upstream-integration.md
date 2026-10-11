# Rio upstream integration

The complete upstream Rio source is pinned as `vendor/rio`, a Git submodule that
tracks `main` in the Aphrody fork at `https://github.com/aphrody-labs/rio`.
The fork remains linked to `https://github.com/raphamorim/rio` as its upstream.
At this pin, both upstream and fork `main` resolve to
`59203ccd5fa1e6b760a738c1ad653bb29f2f3465`; no local patches or merge commits
are present. The latest published Rio release observed for this integration is
`v0.5.28` at `37624389e8dde79ba25a8147a5e809c01d16d1c9`.

Rio's root project and documentation are MIT licensed. The upstream license is
preserved in `vendor/rio/LICENSE` and copied to `LICENSES/Rio-MIT.txt` so Bun
source archives retain its notice even when they omit Git submodules. Rio
upstream source, crate READMEs, build files, specifications, and checked-in
project documentation remain available in the pinned submodule.

The hosted documentation site is sourced separately from
`https://github.com/raphamorim/rioterm.com`. That repository currently has no
declared license and no `LICENSE` file, so its website content is not copied
into Bun's public source. The site remains linked at
`https://rioterm.com/docs/install` until its owner publishes a license or grants
permission to redistribute it.

## Existing Bun integration

The browser terminal currently uses Rio `rio-vt` `=0.5.28`, with default
features disabled, through `aphrody-terminal-core` in the isolated
`packages/bun-aphrody-web` Cargo workspace. The browser build uses Rio's VT
parser and grid without its PTY, clipboard, windowing, or GPU renderer. Bun's
runtime separately owns `Bun.Terminal` for explicitly privileged native PTY
access and `Bun.TerminalScreen` for Bun's existing VT implementation.

This submodule and provenance receipt do not by themselves move Rio crates into
Bun's root Cargo workspace or implement the `bun:rio` JavaScript API. The full
Rio application includes a window system, renderer, fonts, and platform-specific
PTY and clipboard integrations. Those features need a deliberate host and
permission contract before they can become part of Bun's runtime. Browser
imports must remain unable to start a host shell or access host files without
an explicit user-authorized bridge.

## Updating the fork

In a fresh submodule checkout, add the upstream remote only if it is absent:

```sh
git -C vendor/rio remote get-url upstream >/dev/null 2>&1 || git -C vendor/rio remote add upstream https://github.com/raphamorim/rio.git
```

Then synchronize the Rio fork and pin the resulting commit in the parent
repository:

```sh
git -C vendor/rio fetch upstream main
git -C vendor/rio switch main
git -C vendor/rio merge --no-edit upstream/main
git -C vendor/rio push origin main
git add vendor/rio
```

Review upstream license and dependency changes before updating the gitlink.
Do not treat a refreshed submodule as proof that Bun's runtime, browser WASM,
native renderer, or `bun:rio` API has been migrated or qualified.
