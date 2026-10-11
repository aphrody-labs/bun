# @aphrody/bun-video

Source package for Bun with HLS, DASH/MPD, HAR inspection, Bitmovin integration,
an isolated Crunchyroll client, OAuth PKCE, and native OS secret storage. It
also preserves the Remotion and HyperFrames integration API, using official
version-pinned libraries and package-local native capture adapters.

```sh
bun add @aphrody/bun-video@next
```

```ts
import { interpolate, loadRemotionCore, loadHyperframesCore } from "@aphrody/bun-video";
import { attachVideoHlsPlayback } from "@aphrody/bun-video/hls";
import { createCrunchyrollClient } from "@aphrody/bun-video/crunchyroll";
```

Additional exports: `/dash` (also `/mpd`), `/har`, `/bitmovin`, `/oauth`,
`/secrets`, `/mcp`, and `/capabilities`. See the corresponding guides in docs.
Loading a library is lazy; native browser capture requires a separately
qualified provider and explicitly authorized URLs. Native encoding requires
an explicit media executable. The MCP media tool additionally expects the
runtime-provided `bun-video:media-runtime` module.

The package ships six Bun CLI entry points: `bun-video-hls`, `bun-video-dash`,
`bun-video-har`, `bun-video-keychain`, `bun-video-chrome`, and
`bun-video-shortcuts`. Their sources and local browser assets are in labs
and assets. Use each CLI's `--help` for its configuration. Session cookies,
HAR recordings, signed media URLs and OAuth client secrets are local inputs;
they are not shipped in the npm artifact.

This prerelease qualifies packaged utilities separately from live content
playback. An OAuth provider configuration, authorized Crunchyroll session,
valid Bitmovin license and supported browser/DRM environment remain caller
requirements. A blob video URL cannot establish the underlying media
protocol. No successful authenticated Crunchyroll playback is claimed by
package publication. See THIRD_PARTY_NOTICES.md for dependency terms.

The official Remotion renderer 4.0.534 rejects Bun prerelease versions such as
1.4.4-debug and 1.4.3-aphrody.4 at import: its minimum-version check excludes
prereleases. `loadRemotionRenderer()` preserves that upstream check. The three
other library loaders and package utilities are qualified separately; importing
the renderer or rendering a composition is not claimed for those runtimes.
