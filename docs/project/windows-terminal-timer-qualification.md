# Windows ConPTY and timer pointer qualification — 2026-10-10

ConPTY creation now passes its HPCON output through an explicit raw mutable
pointer. The retained pseudoconsole-reference safety contract sits directly
on the unsafe field access. The libuv due-time query uses an explicit raw
const pointer to the initialized timer handle. Handle ownership, cleanup,
EOF handling and overdue-timer scheduling are preserved.

The changed engine ran the terminal construction/spawn, timer-heap race and
setTimeout suites: 140 passed, 14 platform skips, 10 inherited todos, zero
failures and 389 assertions. After the final Rust formatting change, the
terminal-spawn and timer-heap suites passed again: 16 passed, five platform
skips, zero failures and 50 assertions. They cover ConPTY subprocess output
and closure, cross-thread Atomics.waitAsync cancellation, and GC rearming the
RunLoop timer. No test source or timeout was changed in this batch.

The two-file Rust formatting check passes. Exact source hashes and the
serialized strict-Clippy target plan are retained in
`tmp/terminal-timer-plan.json`. Native receipts are
`tmp/terminal-timer-native.log` and
`tmp/terminal-timer-native-formatted.log`.

Serialized strict Clippy (`-- -D warnings`) passes the full runtime dependency
closure on GNU x64/ARM64. Windows x64/ARM64 each drop from 58 to 55 diagnostics,
with zero primary diagnostics in the two owned files on all four targets.
Current Darwin dependency qualification remains separately blocked by the
reserved system-package conversion; it is not claimed here.

This is a scoped source qualification. Full release build, complete target
matrix, installed artifact activation and production deployment require
separate evidence. Existing todos and platform skips are not completed work.
