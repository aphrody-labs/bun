# Windows file-copy qualification — 2026-10-10

The Windows Bun.write file-copy path passes explicit raw pointers to libuv's
read, write, copyfile and chmod requests. Error translation borrows the owned
error through JavaScript conversion, retaining its path until the call returns.
Event-loop pointers use explicit provenance and constness conversions. Directory
completion stores the result's error directly, and truncation keeps the native
u64 size without a redundant conversion.

The changed Windows executable passes the existing Bun.write suite twice in
serialized invocations: 98 tests and 1492 assertions with normal copying, then
97 tests and 1487 assertions with BUN_FEATURE_FLAG_DISABLE_UV_FS_COPYFILE=1.
Each run has eight Windows skips. Cases include real file copies, missing source
errors and paths, creation of missing destination directories, byte counts,
truncation, slices and streamed writes. No test assertion or skip was changed.

An earlier overlapping build/test run failed four child spawns with EBUSY.
Those receipts are retained; final qualification uses the serialized passes.

Strict Clippy reports zero diagnostics in copy_file.rs on Windows/Linux GNU
x64/ARM64. The complete runtime passes strict GNU checks; Windows retains 126
diagnostics elsewhere. Linux execution, release qualification and deployment
remain separate pending gates.

Receipts: tmp/copy-file-native-serialized.log,
tmp/copy-file-fallback-native-serialized.log and
 tmp/copy-file-final-<target>.jsonl with their exit-code files.
