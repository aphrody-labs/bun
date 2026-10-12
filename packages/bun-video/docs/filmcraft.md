# FilmCraft and the native video engine

Source inspected: [storytold/filmcraft](https://github.com/storytold/filmcraft/tree/71438c627b5cbcfb550526c3971f4d0037733c5c),
revision `71438c627b5cbcfb550526c3971f4d0037733c5c`, version 0.7.2,
MIT OR Apache-2.0. Inspection does not qualify its behavior in Bun Video.

FilmCraft's codecs and containers are implemented in Rust. Its runtime does not
depend on FFmpeg: FFmpeg is an external test oracle. This is an independent
native media engine, including decoding, encoding, editing and composition.
Both its GPU crate and our current native video backend use wgpu 30.

The Bun Video integration must expose this engine directly. Our FFmpeg/libmpv
route remains separately selectable; it must not become a required dependency
of FilmCraft's decode or export paths. An optional frame adapter can connect
the engines when explicitly requested.

| Source | Integration target |
| --- | --- |
| `crates/time` | Shared rational frame rates, integer timeline ticks and audio alignment |
| `crates/edit`, `crates/project` | Timeline edits and the common studio project model |
| `crates/render`, `crates/gpu` | Shared frame plans, WGSL effects and linear-light composition |
| `crates/scopes`, `crates/color` | Grading controls and scopes derived from rendered frames |
| `crates/automation` | Native editor commands exposed through Bun Video |

The GPU source uploads YUV planes and RGBA layers, caches uploads by pixel-buffer
identity, composites into a floating-point accumulator, and compares results
with a CPU reference. Connecting external decoded frames and
Remotion/HyperFrames frame plans requires an explicit adapter; matching the wgpu major
version alone does not establish texture interoperability.

The inspected time model uses 254,016,000,000 ticks per second, with saturating
integer arithmetic and rational conversions. Its fallback for invalid frame
rates must not weaken Bun Video's explicit input validation.

The [upstream architecture and codec documentation](https://github.com/storytold/filmcraft/blob/71438c627b5cbcfb550526c3971f4d0037733c5c/README.md#formats-and-codecs)
states the runtime/test boundary explicitly.

No FilmCraft code or dependency is integrated yet. The pinned GPU and time source
files were fetched through the native Aphrody GitHub API into the local build
reference cache for the next native integration batch.
