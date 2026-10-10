# Native graph registry qualification — 2026-10-10

The native graph job registry now uses `bun_threading::Guarded` instead of the
standard poisoning mutex. A lock guard protects all registry access and releases
the lock on scope exit. The job's active flag is cleared in `ExecuteJob::drop`;
released jobs are removed only when the registry still points to that same job.
The four-job capacity, cancellation flags and deferred release are preserved.

The rebuilt native Windows executable passes five existing graph tests, with
38 assertions and no skips. `BUV_TEST_NATIVE_GRAPH=1` requires the native module
to load. Tests cover extraction, directed paths, domain validation, cancellation,
idempotent release and recovery of all four slots after excess jobs are rejected.
The journal also contains two `WorkerTerminated` error-printing messages; this
batch does not establish their resolution.

Strict whole-runtime Clippy checks remain unsuccessful outside this file.
Linux GNU x64 and ARM64 retain 24 diagnostics, down from 27; no diagnostic points
to `graph_native.rs`. Cross-compilation is not Linux execution evidence.

Receipts: `tmp/graph-guarded-native.log` and
`tmp/graph-guarded-clippy-{linux,windows}-{x64,arm64}.jsonl`.
Release packaging, installed plugin alignment and host activation remain pending.
