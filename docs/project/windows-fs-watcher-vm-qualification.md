# Windows filesystem watcher VM-reference qualification — 2026-10-10

The Windows watcher VM accessor returned a mutable reference to the whole VM
facade from a shared watcher reference. Both callers only submit owned tasks
through the existing event-loop accessor, which takes a shared VM receiver.
The accessor now returns a shared VM reference; the existing short-lived
event-loop mutation remains at task submission. No exclusive borrow of the
whole VM is manufactured. The watcher userdata conversion also uses a typed
raw-pointer cast, preserving the Windows backend signature.

The final formatted source passes five changed-engine suites: fs.watch,
backend rewrite, close/exit, callback races and deadlock coverage. Results:
49 passed, 11 platform skips, zero failures and 149 assertions. They exercise
abort signals, closure, concurrent callbacks and overlapping watchers. The
initial backend-rewrite run also passed four tests with one platform skip.
No test source, deadline or platform condition changed in this batch.

Rust formatting passes. Exact final source hash and serialized target plan
are in `tmp/fs-watcher-vm-plan.json`; the native receipt is
`tmp/fs-watcher-vm-native-final.log`. This is scoped source qualification;
it does not establish a complete release, physical Linux GPU activation,
Darwin qualification or production consumer cutover.

Serialized strict Clippy (`-- -D warnings`) passes the full runtime dependency
closure on GNU x64/ARM64. Both Windows targets retain 53 unrelated diagnostics,
down from 55 before this batch. The watcher file has zero primary diagnostics
on all four targets. Current Darwin dependency qualification remains blocked
by the separately reserved system-package conversion and is not claimed.
