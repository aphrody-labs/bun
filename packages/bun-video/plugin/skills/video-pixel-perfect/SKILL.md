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
canonical plugin target; do not interpret `..` relative to the home installation.
Resolve the checkout
and Aphrody home from the current context rather than a historical machine path.
Use `createUnifiedVideoPipeline` from `src/video-workflow.ts` for application
integration: `.apis()` describes the current registered families, `.api(family)` loads their
existing owners, `.render()` uses the subprocess pool and `.catalog` stores
evidence. Close owned resources with `.close()` or async disposal.

## Acquire a usable reference

For a file, inspect dimensions, rational FPS, duration, rotation, color range,
audio streams and sample rate before authoring. For a page URL, distinguish the
page from its media source. Open `labs/network-window.tsx` when a browser session
is required; select the player and correlate `currentSrc`, request initiators,
frame IDs and HLS/DASH manifests. A `blob:` URL is not a downloadable stream.
Choose a variant explicitly and retain the source timestamps and aspect ratio.
For a fractional-rate source, pass `fps: {num, den}` to the task CLI and retain
reference timestamps. The task owner preserves the rate through renderer arguments
and checks the produced file with FFprobe. Never silently round or substitute
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
Use the owner `src/pixel-verify.ts`: `compareRGBAFrames` for decoded bytes or
`verifyPixelFrames` for selected frame files with explicit FFmpeg/FFprobe paths.
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

Use lossless FFV1 for exact RGBA verification. GPU H264 encoders require explicit
lossy opt-in and qualified device support; they drop alpha and cannot substantiate
a lossless claim. Verify the produced file's actual dimensions, frame count,
duration and audio, then register the artifact and measurements in SQLite.
The worker's `.mkv` output selects actual renderer PNG sequences followed by
native FFmpeg FFV1 BGRA encoding. It validates complete consecutive frame files
and preserves the renderer's composed audio; custom Remotion compositions may
include an enforced silent audio track. This establishes lossless preservation
of rendered pixels, not equality to reference pixels. Verify the decoded MKV
against real reference frames with the default zero-difference threshold.

Deliver the source composition, qualified output, SQLite receipt and short
qualification result. Do not include protected source captures in Git. Native
Windows is the workstation target; do not start WSL. On other qualified targets,
probe their own browser/media providers and permissions separately.
