---
name: video-pixel-perfect
description: Create and measure reference-matched React Remotion or HTML HyperFrames videos from an authorized URL, captured stream, or local video using Bun Video worker pools and SQLite evidence.
---

# Video from a reference

Work in the selected Bun checkout and load its applicable guidance. The package
owner is `packages/bun-video`; use its pinned Remotion and HyperFrames sources,
not another renderer copy. Read `packages/bun-video/docs/video-workers.md` from
the selected checkout for acquisition, worker commands and capability routing.
When this skill is discovered through a home-directory junction, resolve its
canonical repository target; do not interpret `..` relative to the home installation.
Resolve the checkout
and Aphrody home from the current context rather than a historical machine path.
Use `createUnifiedVideoPipeline` from `src/video-workflow.ts` for application
integration: `.apis()` describes the current registered families, `.api(family)` loads their
existing owners, `.render()` uses the subprocess pool and `.catalog` stores
evidence. Close owned resources with `.close()` or async disposal.

## Acquire a usable reference

For a file, inspect dimensions, rational FPS, duration, rotation, color range,
audio streams and sample rate before authoring. For a page URL, distinguish the
page from its media source. Open `src/apps/network-window.tsx` when a browser session
is required; select the player and correlate `currentSrc`, request initiators,
frame IDs and HLS/DASH manifests. A `blob:` URL is not a downloadable stream.
Choose a variant explicitly and retain the source timestamps and aspect ratio.
For a fractional-rate source, pass `fps: {num, den}` to the task CLI and retain
reference timestamps. The task owner preserves the rate through renderer arguments
and checks the produced file with native `Bun.Video.metadata`. Never silently round or substitute
resampling for an exact timing match; document resampling if it is requested.

Use only authorized acquisition: a direct accessible file, selected yt-dlp
extractor, an owner-supplied HAR, or the user's active Chrome browser session.
For site qualification, use the real URLs selected by the user, including
`https://www.crunchyroll.com/`. Attach the active Chrome profile and its original
`userDataDir`; do not create a guest profile, copy profile data, or relocate
cookies. If active-profile attachment is unavailable, record that concrete
failure instead of qualifying an isolated replacement session.
Keep cookies, signed URLs, HAR contents and provider tokens in the protected
Aphrody store. SQLite catalog entries are metadata and qualification evidence;
do not put raw authentication or captured request headers into the catalog.
Record unavailable bodies, authentication, CORS and DRM as concrete limitations.
Do not claim that an extractor listing proves successful playback or extraction
on every site; do not attempt DRM key recovery or license bypass.
For a newly supplied Crunchyroll HAR, use `import-capture <har>` and preserve
the original. DASH CENC declarations and partial 206 responses are inspection
evidence; ciphertext is not decoded reference footage. Record acquisition or
decode as blocked when a usable frame source is absent. Do not silently replace
that live source with unit fixtures or claim a successful full-media render.

## Author the composition

Use React Remotion for a React deliverable. Reuse `VideoStudio` for interactive
preview and `StudioRemotionComposition` for source-video placement. Keep the
reference's crop, object fit, rotation and audio trim explicit. Define the
Remotion composition ID, width, height, FPS and duration; serve the renderable
composition, rather than passing a streaming site page to the renderer.
The composition renderer may own a separate local render profile; site acquisition
still uses the user's active profile. Never copy its cookies into render workers.

Use HyperFrames for an existing HTML/CSS timeline or a requested HTML output.
Read the pinned engine's authoring documentation before writing its timeline
adapter. Both renderers must seek deterministically to the requested frame;
wall-clock animation, randomness and live streaming are unsuitable for repeatable
frame comparisons. Pin fonts, wait for assets and media seek completion, and
freeze dates and seeds where the design depends on them.

## Render and verify

Start with a short representative frame range. Use the bounded worker pool and
its frame ordering/backpressure; configure cancellation, per-operation deadline
and a modest worker count for the current host. A failed worker must fail the
job, release the browser and encoder, and retain the failure evidence.
Release only processes owned by the render job, not the user's existing Chrome
session. Unit fixtures establish deterministic protocol behavior only. Live site
and real-media render qualification must use accessible captures or sources from
the selected Crunchyroll session, with actual availability and decoder results.

Compare decoded RGBA frames to reference frames at identical timestamps,
dimensions and color conversion. Save representative pairs and difference
images; measure differing pixels, maximum channel error and mean channel error.
Use `Bun.Image.rgba` for reference image files and `Bun.Video.frame(t).rgba` for
media frames, then the owner `src/pixel-verify.ts` function `compareRGBAFrames`.
The current workflow invokes no external media executable.
The default comparison is exact; any tolerance must be explicit. Check `exact`
separately from tolerance-based `passed` and retain the selected frame scope.
Hash encoded PNGs only to check file identity, not perceptual or decoded-pixel
equality. Check the first/last frame, scene transitions, motion, text and crops;
also inspect audio offset, duration and stream presence separately.

Claim pixel-perfect only when the chosen decoded reference frames have zero
pixel differences under the documented comparison conditions. If interpolation,
font rasterization, codecs or a browser differ, report the measured tolerance
and the failed frames instead. A composition that merely embeds the input video
is source placement, not a reconstructed scene.

For source preservation, use `Bun.Video.remux` and compare every decoded frame
and PCM window with the native owner. For independent compositions, retain the
PNG/WebP sequence and its measured receipt until a native sequence encoder is
qualified. The current Bun.Video API has no arbitrary RGBA-video encoder;
do not invent one or route a current job through the historical external encode
path. Lossy H264/GIF outputs cannot establish exact RGBA preservation.
Verify dimensions, frame count, duration and audio separately, then register
the artifact and measurements in SQLite.

Deliver the source composition, qualified output, SQLite receipt and short
qualification result. Do not include protected source captures in Git. Native
Windows is the workstation target; do not start WSL. On other qualified targets,
probe their own browser/media providers and permissions separately.

For sources unsupported by the pinned compositor, use bounded native
`Bun.Video.frames` and real React `Img`/`useCurrentFrame`/`staticFile` composition
only when the native provider actually supports that source. Preserve audio
through `Bun.Video.audio` WAV windows and `Audio` when present. Report
source placement and sampled frames accurately; this is not creative scene
reconstruction or proof of a complete movie. The qualified artwork source has
no audio; zero RGBA differences apply only to its measured frames 0, 3 and 5.

## Reproduce a complete local episode

Read `docs/episode-pixel-perfect.md` from the resolved Bun Video package for the
frame-by-frame workflow and the executable replay contract. Use
`scripts/episode-assets.ts` for source analysis, frame extraction, compact
zero-loss packet remuxing, GIF previews and evidence. Keep local episode assets
in the package's ignored `.local/episodes/<id>/` directory; keep provider
authentication in the protected Aphrody store. Retain every decoded frame at
native dimensions with a manifest containing rational FPS, source frame count
and independently measured audio/container duration.

Use `packages/bun-video/scripts/episode-replay.ts` to preserve the original encoded
source through `Bun.Video.remux` into MP4. It does not encode the PNG/WebP
sequence or independently authored scenes. The selected native FilmCraft owner
preserves access units and timing; no external command is invoked. Keep one
native media operation at a time and run long commands in a background task with a
bounded deadline. Start with a tiny fixture before the full episode.

Distinguish an exact replay of extracted source pixels from authored scene
reconstruction. Replaying the complete reference can preserve its decoded RGB
pixels; independently generating its animation cannot be called pixel-perfect
without the same measurements. A full reconstruction must replace reference
frames with a deterministic composition using the existing Remotion/HyperFrames
owner, then compare every output frame against the reference at identical
timestamps. Preserve original audio, crop, colors and typography. Report edits
such as new character artwork, subtitle overlays or retimed cuts as differences.

Avoid burning another subtitle track over hardcoded source subtitles. Acquire
provider subtitle sidecars only through a successfully authenticated authorized
source; retain language, episode identity and timing evidence. Treat OCR as OCR,
never as official Crunchyroll subtitles. GIFs reduce palette and often resolution
and FPS; use them as previews, not evidence for exact reconstruction.

Require a passing `verification/episode-replay.json` before claiming complete
source/remux fidelity: every decoded RGBA frame equal, native resolution,
consecutive frame count, rational FPS, complete native PCM16 WAV comparison,
and measured timeline/duration bounds. The native remux guarantees access-unit
preservation separately from measured PCM equality. Prior extraction by a
different decoder is not automatically qualified by this proof. Keep the
encoded source and existing qualified artifacts; never rewrite their provenance.
