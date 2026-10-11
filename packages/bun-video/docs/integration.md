# Bun video protocol integration

The package retains its existing Remotion and HyperFrames entry point. Protocol
entry points are explicit so importing a server API does not initialize a player:

| Import | Behavior |
| --- | --- |
| `@aphrody/bun-video/hls` | Fork SDK lifecycle plus the pinned HLS.js browser decoder |
| `@aphrody/bun-video/dash` or `/mpd` | MPD inspection and dash.js browser lifecycle |
| `@aphrody/bun-video/har` | Private HAR inspection and captured response replay |
| `@aphrody/bun-video/bitmovin` | Official player loading and Bun browser bundling |
| `@aphrody/bun-video/crunchyroll` | Migrated native fetch client |

HLS reuses `@aphrody/bun-runtime-sdk/video/hls`, including synchronous listener
registration, URL validation, explicit worker origin checks and cleanup. The
decoder is pinned `hls.js` 1.7.3; no separately owned decoder fork was found in
this checkout. `attachVideoHlsPlayback` loads that decoder in the browser and
defaults workers off; explicit worker configuration remains supported.

MPD parsing, HAR loading, fetch, bundling and loopback serving run in Bun.
Media decoding and DRM run in the browser through its media element, MSE and EME.
These additions do not add a server decoder or duplicate the existing Rust HLS
extractor. Bitmovin remains the official licensed browser distribution; its
implementation is not rewritten into a server player.

The supplied capture contains one encrypted DASH MPD and captured range responses.
Captured media can be inspected and replayed locally, but a capture does not grant
a reusable DRM license. The captured manifest's live request returned HTTP 401
on 2026-10-11. Current OAuth credentials and an authorized license configuration
are still required to qualify Crunchyroll playback. Local lifecycle and transport
tests do not establish live service compatibility.

Run from the checkout with `bun bd test packages/bun-video/test` and
`bun bd run scripts/aphrody/dash-lab.ts --check` or `--open`.
Private cookies remain in the owner's protected cookie store; the ignored
checkout `cookie.json` is a link. HAR files and signed manifests stay ignored.
Publication of npm packages or crates remains conditional on complete real
playback and release gates; `bun-video` remains private.
