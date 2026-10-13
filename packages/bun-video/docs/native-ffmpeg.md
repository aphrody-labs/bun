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

## Media pipeline

`openInput(url, options?)` passes string options directly to the native demuxer
through an owned `AVDictionary`. For example, network protocols supporting
`rw_timeout` accept its value in microseconds. Protocol-specific support still
depends on FFmpeg; this is not an asynchronous JavaScript cancellation hook.
The dictionary and failed input contexts are released on every error path.

`FFmpeg.openDecoder(name, codecParameters?)` owns an opened native decoder.
The optional parameters pointer must reference valid `AVCodecParameters` from
the matching FFmpeg ABI for the duration of the call; FFmpeg copies them into
the context. `sendPacket(packet)` returns `ok`, `again`, or `eof`. On `again`,
receive pending frames before retrying the same packet. Send `null` to drain
the decoder, receive frames until `eof`, and call `flush()` before restarting
after a seek. `receiveFrame(frame)` reports the same states and clears the
previous frame reference. Disposal releases the codec before unloading its DLL.
Codec configuration and packet/frame native pointers remain directly accessible.

`openVideoPipeline` opens the normalized media source with the owned FFmpeg
demuxer and exposes it as `pipeline.input`. Closing the pipeline stops its mpv
client and releases the input before unloading FFmpeg. With `playback: true`,
mpv receives the same selected media URL through `loadfile`.

With the native GPU backend enabled, `pipeline.gpuRuntime` retains the SDK GPU
provider and directly exposes its WGSL/CUDA operations. `pipeline.gpu` contains
the adapter report. Closing the pipeline stops mpv, closes the GPU runtime and
releases FFmpeg, including when another cleanup step fails. This compute access
does not establish shared FFmpeg/mpv/wgpu textures. Chromium GPU probing remains
a separate browser API, not this native runtime provider.

`findStream(input, "video" | "audio" | "subtitle")` selects the native best
stream index and throws FFmpeg's error when no matching stream exists.
`seek(input, timestampMicroseconds)` seeks backward to a suitable keyframe
using a signed 64-bit integer timestamp in the global microsecond time base.
Flush attached decoders after seeking; decoding forward establishes the exact
requested frame. Demuxer seeking alone is not frame-accurate rendering.

Direct file paths and native media URLs bypass yt-dlp. Set `ytDlp` options
explicitly to extract a website into a playable URL. Arrays, Blob objects,
Request objects and Response streams use the native custom AVIO adapter through
`FFmpeg.openMemory`. The bridge owns a copy of the bytes, so JavaScript buffer
detachment or collection cannot invalidate its callbacks. Inputs are bounded
to 512 MiB, and response ingestion is also bounded by chunk count and cancellable.
Memory-source playback through mpv still requires its pending custom-stream
adapter and returns an unsupported error.

Build the AVIO bridge with the native crate's `libav` feature. Its shared library
(`bun_video_native.dll` on Windows) must accompany the seven FFmpeg libraries.

## libmpv above the FFmpeg foundation

`mpvABI` exports the native client, asynchronous commands, property observation,
hooks, custom read-only stream callbacks and pointer-based render APIs.
`MpvClient.pointer` and `MpvClient.symbols` provide guarded direct access for
integrators; both reject access after disposal. Raw client and render contexts,
callback lifetimes and native node contents remain the caller's responsibility.
Render functions that pass `mpv_render_param` by value require a native bridge
and are not represented as scalar Bun FFI functions.

`MpvClient.commandAsync(requestId, ...arguments)` queues a native command with
an unsigned 64-bit `bigint` identifier. Queue rejection throws immediately;
execution errors arrive in the `command-reply` event's `error` field.
`nextEvent(timeoutSeconds)` copies the event ID, name, error and request ID
before libmpv reuses its event structure. It does not expose event payload
pointers. A zero timeout polls; a positive timeout blocks the calling thread.
Drain events regularly to avoid overflowing the native event queue, and use
unique request identifiers when multiple commands are outstanding.

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
