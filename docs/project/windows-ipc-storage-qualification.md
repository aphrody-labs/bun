# Windows IPC host and storage qualification

On 2026-10-10, the IPC host retains its configuration result until cleanup has
finished, then checks is_err instead of a wildcard Err pattern. Warnings use
the static warn macro. Queue allocation, deinitialization and channel reset
ordering are preserved. Logical drive queries use explicit raw out pointers;
the zero-capacity/null-buffer sizing call has its safety contract documented.

The changed engine runs through the MSVC 14.44 owner factory:

```
bun msvc --toolset 14.44 exec -- bun bd test test/js/bun/spawn/spawn.ipc.test.ts test/js/bun/spawn/bun-ipc-inherit.test.ts test/js/node/cluster.test.ts test/js/bun/windows/windows.test.ts -t 'ipc mode|ipc|cloneable|round-robin|SCHED|cluster|logical drive capacity'
```

Result: 36 pass, 11 existing skips, 1 existing todo, 0 fail, 94 assertions.
The selected tests cover JSON/advanced IPC, cluster handoff and real Windows
logical drive capacity. Unrelated Windows tests are filtered, and the shared
Windows fixture is used read-only, not included in this commit.

Serialized locked strict runtime Clippy with -D warnings has zero diagnostics
in both owned files on Windows x64/ARM64 and GNU x64/ARM64. Both GNU whole-runtime
checks pass; both Windows targets retain 65 errors elsewhere. Scoped rustfmt
and diff checks pass. The existing documented process-local Windows Clippy cache
opt-out is retained without global configuration changes.

Receipts: tmp/ipc-storage-native-final.log/.exit and
 tmp/ipc-storage-final-<target>.jsonl/.stderr/.exit. This is scoped source and
Windows runtime qualification; complete fork/release/production gates remain
separate requirements.
