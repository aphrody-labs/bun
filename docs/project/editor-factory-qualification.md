# Editor heap scratch and external build directory qualification

2026-10-10, source base ab7de8dd611d5ba0ca9b3029cb8ceb4dc6730bb8.

The spawned editor context owns a directly zero-initialized heap buffer instead of an inline path array. Capacity, argv pointers and asynchronous context lifetime are preserved. Drop releases the buffer on error and completion. No filesystem probe is added; throughput is unmeasured.

Ninja regeneration changes to the configured source checkout before running the build script. The existing build CLI suite exercises the emitted command from an external build directory, with spaces in the source path. Windows invokes the emitted cmd wrapper once with verbatim arguments; POSIX uses its shell command.

Changed MSVC14.44 debug engine, four jobs/link threads and full symbols: 9 passes, 3 existing editor skips, zero failures, 24 assertions across two files in 3.76 seconds. The first two Windows test runs failed because the fixture added a shell wrapper or escaped cmd arguments. Both logs remain retained. The final fixture keeps the expected source path, empty stderr and successful exit assertions. Only the fixture changed between these runs; the compiled engine SHA256 remained identical.

GNU x64 release with ThinLTO: 12 passes, zero failures, 52 assertions across the same suites in 1.36 seconds. This includes real PATH editor discovery, reentrant option getters and GC signal handling. The initial external build invocation failed source-root discovery; its receipt remains retained. The final corrected regeneration succeeds. The release binary is 314436744 bytes, SHA256 8ff69ccf36b3176a442778784b9ead429c13558f812e8923b2cd065a6a9d8e95. This is qualification evidence, not a matched performance or size comparison.

Strict bun_runtime Clippy passes on GNU x64/ARM64. Both MSVC targets retain 13 unrelated runtime errors, zero in the owned editor file. Global strict qualification remains open. Scoped TypeScript, strict oxlint, Rust formatting and diff checks pass.

Receipts: tmp/editor-heap-scratch-*, editor-factory-* and VPS owner-linux-qualification. Retained Windows caches, objects, binaries and symbols were NTFS-compressed under the factory lock with before/after SHA256 checks. No deletion or symbol removal was used. The full-symbol native build started with 8.34 GB free. Publication of this source lot does not establish complete fork release, hardware coverage, performance parity, private delivery or provider activation.
