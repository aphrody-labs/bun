# Windows memory-pressure VM lifetime — 2026-10-10

The Windows notification thread retains ownership of its moved `VmHandle`
in the closure. Its `thread_main` helper now borrows that handle, matching
the shared `VmHandle::post` API. The handle remains alive for the entire
worker call. No additional Arc clone is created. Notification waiting,
task refusal cleanup, the 30-second holdoff and shutdown/join/handle-close
ordering remain unchanged. The POSIX worker is unaffected.

## Changed-engine validation

The owner Windows debug factory uses MSVC toolset 14.44, four Ninja jobs
and four explicit linker workers, retaining full debug symbols:

```powershell
bun msvc --toolset 14.44 exec -- bun bd --link-threads=4 -j4 test ./test/js/node/process/process-memory-pressure.test.ts ./test/js/bun/supervisor/pressure.test.ts ./test/js/node/process/process-stdin.test.ts
```

The existing three suites complete with 28 passes, nine inherited
platform skips, zero failures, ten snapshots and 64 assertions in 3.79 s.
They cover listener arming/disarming, process termination, pressure-driven
supervision and stdin lifecycle. This does not prove a physical low-memory
Windows notification was induced. No OOM workload is launched.

Strict `bun_runtime` Clippy runs with `--locked`, `--no-deps` and
`-D warnings` on four targets. Both native VPS GNU x64/ARM64 gates exit zero
(50.28 s and 52.27 s). Both serialized Windows MSVC x64/ARM64 gates report
zero diagnostics in the owned file; each retains 50 unrelated runtime
errors and exits 101. Global Windows strict closure remains open. The
GNU checks use the previously qualified LLVM 23 ARM64 sysroot and the
canonical heavy/Cargo locks; Windows uses the native serialized factory.

Scoped rustfmt and diff checks pass. The qualified source SHA256 is
`9f3d8809fb9502affe1a2d592a6d7d68b51bd1f313666d340896b64db6a6a442`.
The build checkout is based on `988d73b430a` with recorded owner patches;
the debug revision remains pinned to `d69d5ebe8b40be626c476871190e2da295325b84`.
It is not a clean release of this source commit.

Local receipts: `tmp/memory-pressure-native.log/.exit`,
`tmp/memory-pressure-windows-strict-summary.json`,
`tmp/memory-pressure-<target>.jsonl/.stderr/.exit` and
`tmp/vps-memory-pressure-plan.json`. Raw GNU JSON diagnostics remain in
the VPS checkout's `tmp/owner-linux-qualification/`.

## Build capacity

Before the four-worker debug build, an owner-only one-worker release link
is stopped to include this correction and retune the measured resource
budget. Its original failed receipts are retained. The debug link reaches
an observed working set of approximately 14.2 GB, completes successfully
and leaves approximately 6 GB free on disk. The allocated pagefile remains
30603 MB. No symbols, source, protected stores or provider DLLs are removed;
optimization flags and the system pagefile configuration are preserved.
Release linkage and performance require separate receipts.
