# FilmCraft and the native video engine

Source inspected: [storytold/filmcraft](https://github.com/storytold/filmcraft/tree/71438c627b5cbcfb550526c3971f4d0037733c5c),
revision `71438c627b5cbcfb550526c3971f4d0037733c5c`, version 0.7.2,
MIT OR Apache-2.0. Inspection does not qualify its behavior in Bun Video.

The useful integration boundary is its editor and compositor above our FFmpeg
foundation. Both its GPU crate and our current native video backend use wgpu 30.
Its independent codec implementations need separate qualification before use.

| Source | Integration target |
| --- | --- |
| `crates/time` | Shared rational frame rates, integer timeline ticks and audio alignment |
| `crates/edit`, `crates/project` | Timeline edits and the common studio project model |
| `crates/render`, `crates/gpu` | Shared frame plans, WGSL effects and linear-light composition |
| `crates/scopes`, `crates/color` | Grading controls and scopes derived from rendered frames |
| `crates/automation` | Native editor commands exposed through Bun Video |

The GPU source uploads YUV planes and RGBA layers, caches uploads by pixel-buffer
identity, composites into a floating-point accumulator, and compares results
with a CPU reference. Connecting it requires an explicit adapter from decoded
FFmpeg frames and from Remotion/HyperFrames frame plans; matching the wgpu major
version alone does not establish texture interoperability.

The inspected time model uses 254,016,000,000 ticks per second, with saturating
integer arithmetic and rational conversions. Its fallback for invalid frame
rates must not weaken Bun Video's explicit input validation.

No FilmCraft code or dependency is integrated yet. The pinned GPU and time source
files were fetched through the native Aphrody GitHub API into the local build
reference cache for the next native integration batch.
