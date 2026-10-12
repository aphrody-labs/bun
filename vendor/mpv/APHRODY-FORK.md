# Bun libmpv source fork

This source tree is owned in the Bun repository, without a nested repository or
submodule. The upstream mpv client and render APIs remain the native ABI.

`bun run libmpv plan` shows the native build command. `bun run libmpv build`
builds the shared libmpv target with the Bun-owned toolchain on Windows and
Meson executed through `bun uv`. Set `BUN_MEDIA_PREFIX` to the installed native
FFmpeg and libass dependency prefix. The CLI player is disabled and build dates
are omitted. Artifacts are produced in `build/libmpv`.

The TypeScript FFI currently consumes the libmpv ABI. Building this target does
not yet wire libmpv into the runtime or ship its dependent DLLs beside bun.exe.
