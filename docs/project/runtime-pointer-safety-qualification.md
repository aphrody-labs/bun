# Runtime pointer and platform predicates — 2026-10-10

Six runtime files remove eight strict Windows diagnostics while retaining
their existing ownership and platform behavior.

Windows pipe acceptance and connection bind the libuv result immediately
after the unsafe call, with its safety contract directly beside the
dereference. The client pipe is initialized and not yet adopted by its
writer during acceptance; connection request storage remains owned until
the callback. Error conversion and unadopted-handle cleanup retain their
order. The two event-loop wakeup conditions keep their short-circuit
evaluation and release the shared loop borrow before wakeup.

Subprocess writable initialization uses `core::ptr::from_mut` instead of
a reference cast. Readable initialization consumes the original `Stdio`
after constructing its result, preserving the prior destructor point.
Linux memfd ownership is still taken before that destructor runs, avoiding
an extra close. Neither the public signature nor caller ownership changes.

The stdio predicate keeps IPC pipe behavior Windows-only. The file-URL
predicate rejects encoded slash on every platform and encoded backslash
only on Windows. The generic Clippy suggestion would lose those platform
differences; both conditions remain explicit in the replacement.

GNU x64/ARM64 strict `bun_runtime` Clippy exits zero on the VPS. Combined
with the separate scanner patch, serialized MSVC x64/ARM64 checks report
zero owned diagnostics and 35 unrelated runtime errors per target,
exiting 101. The original 45-error baseline is retained. No lint threshold
or suppression is changed. Scoped Rust 2024 formatting and diff checks pass.

Receipts: `tmp/runtime-pointer-vps-plan.json`,
`tmp/runtime-pointer-scanner-windows-plan.json`,
`tmp/runtime-pointer-scanner-windows-summary.json`,
`tmp/runtime-pointer-scanner-<target>.jsonl/.stderr/.exit` and
`tmp/runtime-pointer-format.log/.exit`. GNU raw receipts remain under
the VPS checkout's `tmp/owner-linux-qualification/runtime-pointer-*`.

The Windows build checkout is based on `8d20fce4aa9` with these owned
patches and the scanner patch. Revision metadata remains independently
pinned for the debug factory; no shared runtime installation is replaced.

Changed-engine validation: the final eight-file pipe/subprocess/stdin/nexttick run passes 78 tests, ten inherited skips, zero failures, eleven snapshots and 990 assertions (28.75 s). File-URL tests pass two tests with four inherited skips and zero failures. The first combined run has one ECONNREFUSED while fetching the local server, before spawning the child; its receipt remains intact. The exact isolated case passes, and the complete rerun passes without source changes, sleeps or retry logic. A diagnostic fetch reaches localhost, IPv4 and IPv6 successfully. This records an observed transient connection failure rather than claiming its root cause is fixed.

Receipts: tmp/runtime-pointer-scanner-native.log/.exit (initial), tmp/runtime-pointer-http-isolated.log/.exit, tmp/localhost-family-diagnostic.log/.exit, tmp/runtime-pointer-scanner-native-final.log/.exit and tmp/runtime-pointer-file-url-native.log/.exit. The debug executable is 433018880 bytes, SHA256 105a880cc1df784bd4c0b03be1a4de8a89b5625bbc322aa2dd3f2262133184e0; source remains the recorded 8d base plus seven owned files.
