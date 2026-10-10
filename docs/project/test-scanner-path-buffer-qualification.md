# Test scanner path-buffer ownership — 2026-10-10

The test scanner now stores `PoolGuard<PathBuffer>` from the fork's
existing per-thread path-buffer pool instead of an inline `PathBuffer`.
A Windows path buffer occupies 64 KiB. Returning a scanner with that
inline field inflated both its constructor frame and the test-command
caller frame. Their strict Windows `large_stack_frames` diagnostics
disappear with this change; no frame-size threshold or lint allowance
is modified.

The guard owns a boxed buffer and returns it to the existing bounded pool
on drop. Fresh allocation is zeroed; reused scratch storage is not assumed
to be zero. Checked path joins write the returned range and retain the
same capacity and error behavior. File paths are copied into the filename
store before being retained as `Interned`, so results do not borrow the
reusable scratch buffer. Directory entry paths retain their existing
resolver ownership. No file-discovery, ignore, filter or bounds rule changes.

GNU x64 and ARM64 strict `bun_runtime` checks both exit zero. Combined
with the six-file runtime pointer lot, MSVC x64/ARM64 checks each report
zero owned diagnostics, with 35 unrelated runtime errors remaining.
Scoped Rust 2024 formatting and diff checks pass.

Receipts: `tmp/scanner-path-buffer-vps-plan.json`,
`tmp/scanner-path-buffer-format.log/.exit`,
`tmp/runtime-pointer-scanner-windows-plan.json` and
`tmp/runtime-pointer-scanner-windows-summary.json`.
GNU receipts remain under the VPS checkout's
`tmp/owner-linux-qualification/scanner-path-buffer-*`.

This change is source and target-check qualification of scratch-buffer
ownership, not a matched-source latency/RSS benchmark or global runtime
strict closure. The Windows owner build checkout remains based on
`8d20fce4aa9` with the two recorded owned patches.

Changed-engine discovery gates pass 67 tests, three inherited skips, zero failures and 228 assertions across five existing CLI suites (10.07 s): path-ignore patterns, pass-with-no-tests, sharding, concurrent globs and changed-test selection. These exercise real child CLI discovery and retained file paths. The constructor and test-command caller large-stack diagnostics are absent on both MSVC targets; test_command retains only its unrelated question-mark diagnostic. Receipt: tmp/scanner-discovery-native.log/.exit. The combined changed-engine pointer/file-URL suites and the separately completed clean 8d release have their own receipts.
