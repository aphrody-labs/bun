# @aphrody/bun-video

[![checks](https://github.com/aphrody-labs/bun/actions/workflows/bun-video-release.yml/badge.svg)](https://github.com/aphrody-labs/bun/actions/workflows/bun-video-release.yml)

Source package for Bun with HLS, DASH/MPD, HAR inspection, Bitmovin integration,
an isolated Crunchyroll client, OAuth PKCE, and native OS secret storage. It
also preserves the Remotion and HyperFrames integration API, using official
version-pinned libraries and package-local native capture adapters.

The optional open-source media toolchain is documented in
[Open source media stack](docs/open-source-media-stack.md): yt-dlp handles
authorized downloads and mpv handles local playback. Their executables remain
caller-owned and are never installed implicitly.

The source of [Mediabunny](vendor/mediabunny/README.md) v1.9.3 is vendored and
available through `@aphrody/bun-video/mediabunny`. This export is the media
demuxing, muxing and WebCodecs layer; it does not install a downloader or
desktop player.

```sh
bun add @aphrody/bun-video@next
```

```ts
import {
  interpolate,
  loadRemotionCore,
  loadHyperframesCore,
} from "@aphrody/bun-video";
import { attachVideoHlsPlayback } from "@aphrody/bun-video/hls";
import { createCrunchyrollClient } from "@aphrody/bun-video/crunchyroll";
```

Additional exports: `/dash` (also `/mpd`), `/har`, `/bitmovin`, `/oauth`, `/webgpu`,
`/secrets`, `/mcp`, and `/capabilities`. See the corresponding guides in docs.
Loading a library is lazy; native browser capture requires a separately
qualified provider and explicitly authorized URLs. Native encoding requires
an explicit media executable. The MCP media tool additionally expects the
runtime-provided `bun-video:media-runtime` module.

The package ships seven Bun CLI entry points: `bun-video-hls`, `bun-video-dash`,
`bun-video-har`, `bun-video-keychain`, `bun-video-chrome`, `bun-video-shortcuts`,
and `bun-video-webgpu`. Their sources and local browser assets are in labs
and assets. Use each CLI's `--help` for its configuration. Session cookies,
HAR recordings, signed media URLs and OAuth client secrets are local inputs;
they are not shipped in the npm artifact.

This prerelease qualifies packaged utilities separately from live content
playback. An OAuth provider configuration, authorized Crunchyroll session,
valid Bitmovin license and supported browser/DRM environment remain caller
requirements. A blob video URL cannot establish the underlying media
protocol. No successful authenticated Crunchyroll playback is claimed by
package publication. See THIRD_PARTY_NOTICES.md for dependency terms.

`/webgpu` runs WGSL compute through either Bun-launched Chromium WebGPU or the precompiled native
wgpu/CUDA provider. The `bun-video-webgpu` CLI supports Linux serverless jobs when a GPU-enabled
ABI 1.5 runtime artifact is installed, and can open the native Windows CEF desktop adapter probe.
This compute interface does not yet route Remotion/HyperFrames WebGPU compositions through the
video frame encoder; see [the WebGPU guide](docs/webgpu.md) for runtime requirements and limits.

## React Video Studio

`VideoStudio` fournit une bibliothèque et un lecteur React natif pour fichiers locaux,
URLs HTTP(S), variantes de qualité, sous-titres, chapitres, reprise de position,
Picture-in-Picture, plein écran, Media Session et inspection yt-dlp :

```tsx
import { VideoStudio } from "@aphrody/bun-video/studio";

export function Player() {
  return <VideoStudio storageKey="catalogue" assets={[
    { id: "episode-1", title: "Episode 1", src: "https://cdn.example/video.mp4", poster: "/poster.jpg" },
  ]} />;
}
```

Les raccourcis `Espace`, `←`, `→` et `M` contrôlent lecture, recherche et son.
Les sources distantes doivent autoriser CORS pour les sous-titres et variantes. Le
callback `onStatus` reçoit `loading`, `ready` ou `failed` pour synchroniser l’interface.

The official Remotion renderer 4.0.534 rejects Bun prerelease versions such as
1.4.4-debug and 1.4.3-aphrody.4 at import: its minimum-version check excludes
prereleases. `loadRemotionRenderer()` preserves that upstream check. The three
other library loaders and package utilities are qualified separately; importing
the renderer or rendering a composition is not claimed for those runtimes.

## Native checks and release

```sh
bun install --cwd packages/bun-video --frozen-lockfile
bun run --cwd packages/bun-video check
bun run --cwd packages/bun-video build:library
bun run --cwd packages/bun-video pack
```

The release build embeds only explicitly qualified absolute media assets. Set
`BUN_VIDEO_NATIVE_EXECUTABLE`, `BUN_VIDEO_FFMPEG`, and `BUN_VIDEO_FFPROBE` before
`build:library`. Credentials, cookies, HAR files and signed URLs never belong in
the package or CI logs. Tags `bun-video-v*` and manual dispatch run the checks,
publish the `next` npm tag with `NPM_TOKEN`, and optionally upload the packed
artifact to Cloudflare R2 with `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
and `BUN_VIDEO_R2_BUCKET`.
