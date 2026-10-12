# Native FFmpeg foundation

Official reference: https://www.ffmpeg.org/documentation.html and the Doxygen
API at https://www.ffmpeg.org/doxygen/trunk/index.html. The checked-in headers
in `vendor/ffmpeg` define the exact ABI used here; online trunk can advance.

`@aphrody/bun-video/ffmpeg` exposes typed native symbols for libavutil,
libavcodec, libavformat, libavfilter, libavdevice, libswscale and libswresample.
Pointer arguments are raw native addresses. Struct layouts and callbacks are
not yet exposed as typed Bun objects. This is a partial API binding.

`FFmpeg.open(directory)` validates each library's major ABI and owns its loaded
handles. With no directory it loads libraries beside the executing Bun binary.
Owned inputs, packets and frames are freed before the libraries. `openInput` discovers
stream metadata; `readPacket` distinguishes end-of-file from native errors.
`allocateFrame()` returns a disposable frame with guarded `pointer` and `unref()`
access. Closing the parent invalidates every owned handle. Native symbols also
expose frame and packet references, codec parameters, format iteration, filter
creation, frame scaling and frame resampling. Callers using raw symbols retain
responsibility for objects they allocate themselves.

```ts
import { FFmpeg } from "@aphrody/bun-video/ffmpeg";

using ffmpeg = FFmpeg.open("C:/bun/build/media/bin");
using input = ffmpeg.openInput("C:/media/video.mkv");
using packet = ffmpeg.allocatePacket();
while (ffmpeg.readPacket(input, packet)) {
  // Native codec bindings can consume packet.pointer.
}
```

Run the native FFI ownership and symbol-loading gate with
`BUN_VIDEO_MEDIA_DIR` set to the absolute DLL directory:
`bun bd test packages/bun-video/test/ffmpeg.test.ts`.
Without that explicit artifact directory the native test is skipped.

## libmpv above the FFmpeg foundation

`mpvABI` exports the native client, asynchronous commands, property observation,
hooks, custom read-only stream callbacks and pointer-based render APIs.
`MpvClient.pointer` and `MpvClient.symbols` provide guarded direct access for
integrators; both reject access after disposal. Raw client and render contexts,
callback lifetimes and native node contents remain the caller's responsibility.
Render functions that pass `mpv_render_param` by value require a native bridge
and are not represented as scalar Bun FFI functions.

`bun bd test packages/bun-video/test/mpv.test.ts` uses the same
`BUN_VIDEO_MEDIA_DIR` directory. Its null-output client checks symbol loading
and disposal; it does not qualify on-screen playback or GPU texture sharing.

Build: `bun run ffmpeg build`. Windows uses Clang-CL/MSVC, Git's native Bash
and GNU Make; it does not use WSL. Outputs and headers install in `build/media`.
FFmpeg includes its built-in codecs and Windows D3D11/D3D12 acceleration;
optional external codecs require their own dependencies.

Qualification on the owner Windows host: the built DLLs opened a generated
FFV1 Matroska fixture and yielded its three packets through Bun FFI. Native
error -22 was decoded through av_strerror. The native Rust libav decoder also
produced three RGBA frames (49,152 bytes) identical to FFmpeg CLI output,
SHA-256 f855642a83b0f29aea59326cbdc0729b340500df1236e0da45ac47be01c94bcf.
Encode, GPU texture sharing and Remotion/HyperFrames integration remain
unqualified.
