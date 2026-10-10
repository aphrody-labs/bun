# Windows Node callback qualification — 2026-10-10

Windows watchers snapshot handler keys with to_vec before notifications, keeping
reentrant detach and membership checks intact. The raw watcher borrow's safety
contract is adjacent to its unsafe block and ends before deferred destruction.
Watcher initialization propagates the same error through the native Result.
Cluster socket binding passes explicit raw pointers to live local port/error
outputs on the first bind and IPv4 retry; error translation is unchanged.

The rebuilt Windows executable passes 32 tests across cluster, watcher rewrite
and watcher close/exit suites, with 121 assertions and ten existing skips. These
exercise shared handles, listener addresses, worker IPC, recursive new/renamed
subdirectories, overlapping watchers, detaching one shared watcher and closing
inside a callback before process exit. Skips do not qualify their cases.

Strict Clippy reports no diagnostics in either owned file on Windows/Linux GNU
x64/ARM64. The complete GNU runtime passes; Windows retains 117 diagnostics
elsewhere. These gates do not establish Linux execution, release artifacts,
performance improvements or production deployment.

Receipts: tmp/node-callbacks-native.log and tmp/node-callbacks-<target>.jsonl,
with their exit-code files. Rustfmt and owned diff whitespace checks pass.
