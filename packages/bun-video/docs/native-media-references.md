# Native media implementation references

These sources are checked into `vendor` with exact revisions and archive
SHA-256 receipts. They preserve their upstream licenses. The reference crates
are not yet linked into Bun; the running FFI still calls our compiled C engines.

| Source | Role in Bun Video | Starting points |
| --- | --- | --- |
| `vendor/ffmpeg` | Authoritative native engine and ABI | `doc/examples/demux_decode.c`, `hw_decode.c`, `encode_video.c`, `remux.c`, `transcode.c` |
| `vendor/mpv` | Playback engine, client API and render API | `include/mpv/client.h`, `render.h`, `stream_cb.h`, `player/client.c` |
| `vendor/mpv-examples` | Official embedding implementations | `libmpv/simple`, `libmpv/sdl`, `libmpv/streamcb`, `libmpv/qt_opengl` |
| `vendor/ffmpeg-rs` | Typed Rust ownership and codec state transitions | `examples/dump-frames.rs`, `examples/transcode-audio.rs`, `src/codec`, `src/format` |
| `vendor/libmpv-rs` | Rust client, events, rendering and custom protocol lifecycle | `examples/events.rs`, `examples/protocol.rs`, `examples/opengl.rs`, `src` |
| `vendor/libplacebo` | Native D3D11 renderer and FFmpeg frame mapping | `src/d3d11`, `src/include/libplacebo/utils/libav.h` |

The selected FFmpeg Rust source is 9.0.1, aligned with our FFmpeg major 9
development source. Bun Video's native Cargo crate now uses the local FFmpeg Rust fork and its
local ffmpeg-sys-next fork. The libav feature compiles against build/media.

Required integration work is native decode/encode through owned codec and
frame contexts, GPU frame interop, typed libmpv event/render APIs, then direct
use by the absorbed Remotion and HyperFrames pipelines. Fetching these sources
does not prove those integrations.
