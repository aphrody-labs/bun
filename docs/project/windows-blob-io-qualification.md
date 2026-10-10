# Windows Blob file-I/O qualification — 2026-10-10

The POSIX work-pool run methods and their retained completion-token aliases are
compiled only for their backend. Windows keeps its explicit unsupported-pool
guard at the JobContext boundary and continues to use ReadFileUV/WriteFileWindows.
No completion obligation is discarded to satisfy a diagnostic. Linux retains
the same ownership transfer into io_task and asynchronous completion path.

Windows fstat/read/write/cleanup calls pass explicit raw request pointers.
Directory read errors retain the same BunString values without identity
conversions. Blob file sinks cast native event-loop pointers directly, and the
promise read documents the live boxed handler. Windows unsigned stat sizes avoid
a meaningless clamp; POSIX signed sizes retain their clamp to zero.

Four existing suites pass on the rebuilt Windows executable: 109 tests and 1550
assertions normally, then 108 tests and 1545 assertions with the copyfile fallback
enabled. Each run has eleven existing skips. Coverage includes actual file reads,
file sizes, copies, missing-file errors, destination creation and streamed writes.
Skipped fd and platform cases remain unqualified. Test sources were not changed.

Strict Clippy has no diagnostic in the three owned files on Windows/Linux GNU
x64/ARM64. The complete runtime passes GNU strict checks; Windows retains 98
errors elsewhere. Rustfmt and owned whitespace gates pass. A preliminary build
caught two unused task aliases after the backend split; those aliases now use
the matching platform guard and the final rebuilt-binary tests pass.

Receipts: tmp/blob-io-native-final.log, tmp/blob-io-fallback-native-final.log and
tmp/blob-io-final-<target>.jsonl with exit-code files. These are Windows runtime
and cross-compilation evidence, not Linux execution or release/deployment proof.
