# bun-video

Private source monorepo joining Remotion 4.0.534 and HyperFrames 0.8.144 at the
commits recorded in their `UPSTREAM.json`. Each upstream source tree, documentation,
notice and dependency lock remains traceable. The umbrella is a single Bun package;
the two dependency closures retain their exact locks during migration.

The executable routes **all** upstream CLI commands through `remotion` and
`hyperframes`. It also exposes `capabilities` and stdio `mcp`. Build with
`bun scripts/build.ts <absolute-output>`. Framework commands still have their
actual browser, media and optional cloud dependency requirements; CLI help alone
does not establish complete autonomous rendering.

`packages/bun-video` in the parent fork exports the library. The shared API includes
the real interpolation, easing and oscillator implementations, dynamic upstream
core/renderer/engine entry points, explicit native browser capture, ordered Bun
workers, and streaming media encoding. `captureParallelFrames` preserves frame
order and bounds pending images by worker count. `encodeVideo` streams these PNGs
to `native/`'s Rust encoder with backpressure. Browser compositions must already
be served with their framework render globals; native capture rejects unsupported
media instead of silently producing incorrect frames.

`runBrowserTask` gives local agents an isolated origin restricted browser context,
DOM evaluation and optional PNG screenshot. `registerVideoTools` exports the same
schemas for the canonical capability owner. The stdio endpoint follows
[MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
and [stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
No local MCP configuration or provider cookie store is modified. Local models can
use these tools through their own tool calling adapter; a model runner is not
embedded in this package.

FFV1 is the lossless RGBA encoding path. GPU NVENC/QSV/AMF are explicit H264
options requiring actual device probing and lossy opt-in; alpha is discarded by
these modes. GPU encoding availability is separate from GPU browser rendering.
See `native/README.md` for library choices and codec qualification.

On the initial Windows probe, the installed native provider lacks browser
capabilities and Oxc tooling symbols; native M3's required library is unavailable.
Those stages are blocked. Equal-input CPU benchmarks verified exact function
output parity: Remotion median 1.044/1.025 ms and HyperFrames 36.483/36.023 ms
(upstream/migrated, seven samples, 2026-10-10). These small differences establish
parity; they do not establish faster complete video rendering.
See `video-benchmark/` for reproducible measurements; runtime output remains in
the parent ignored `tmp/` directory.
The sanitized measured samples are retained in
[`docs/benchmark-20261010.json`](docs/benchmark-20261010.json), with gate scope in
[`docs/qualification.md`](docs/qualification.md).

`plugin/skills/bun-video` supplies unified authoring guidance. The original
framework skills, MCP sources, infrastructure and docs stay available in their
source trees; feature dispatch preserves their differing rendering contracts.
`NOTICE.md` identifies the applicable upstream license files. This private
integration does not authorize public redistribution under a new license.
