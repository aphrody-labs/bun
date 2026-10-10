# Parallel worker API-lock qualification — 2026-10-10

On native Windows, the existing JUnit integration ran all worker test cases
but never wrote its report or exited. Its normal five-second deadline failed;
a separate diagnostic with a 90-second deadline confirmed the hang.

CDB attached to an owned worker and showed the main thread inside the Windows
CRT error dialog following `WTFCrashWithInfo`,
`JSC::VM::finalizeSynchronousJSExecution`, `JSC__VM__releaseWeakRefs`,
`EventLoop::tick`, and `run_as_worker`. The local C++ binding calls
`finalizeSynchronousJSExecution`. The final IPC backpressure drain ticked the
VM after leaving the API-lock scope used by the worker loop. Windows' async
pipe writes exercise this drain; successful synchronous writes can skip it.

The drain now uses `run_with_api_lock`, matching the worker loop and exit
path. It retains the queued frames, completion checks and EOF behavior.
No timeout, crash accounting or JUnit assertion was weakened. The existing
integration fails before this change and passes afterwards in 486 ms.

The changed engine passes five JUnit tests (nine assertions) and 40 parallel
runner/startup tests (276 assertions, eight platform skips). The focused
Rust formatter passes. Diagnostic logs are retained under
`tmp/junit-native-worker-stack.log`, `tmp/junit-api-lock-native.log` and
`tmp/junit-api-lock-parallel-native.log`. Qualification scope and source hash
are recorded in `tmp/junit-api-lock-qualification-plan.json`.

The complete changed-engine internal suite then passes: 886 passed, 33 skipped,
zero failures, 146131 assertions and five snapshots across 91 files. This
replaces the earlier three-failure receipt. The inherited 33 skips are
unchanged; no new skip was added. Receipt: `tmp/owner-internal-consolidated.log`.

Serialized strict Clippy (`-- -D warnings`) passes the full bun_runtime
dependency closure on Linux GNU x64 and ARM64. Windows x64 and ARM64 each
retain 58 diagnostics outside the owned runner file; its primary-diagnostic
count is zero on all four targets. Current Darwin qualification is blocked
by the separately reserved system-package conversion and is not claimed.

This document is scoped source qualification. Whole-runtime strict Windows
Clippy, the complete target matrix, clean release artifacts and production
activation are separate gates; the Linux candidate delivered earlier remains
pinned to 4e3ddd04da10d7db3e8a903ec8d352898094fd58.
