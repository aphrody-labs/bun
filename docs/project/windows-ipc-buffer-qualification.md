# Windows IPC buffer qualification

On 2026-10-10, the Windows named-pipe read allocator takes an exclusive
`&mut SendQueue`, matching the existing libuv StreamReader callback. Its returned
mutable spare-capacity slice no longer escapes from a shared queue reference.
The write completion reads its Box length through an explicit live request
reference before destroying the request. Initialization/read registration keep
safety contracts adjacent to their unsafe calls; socket import passes an explicit
raw error-output pointer.

## Evidence

The changed Windows engine ran through the MSVC 14.44 owner factory:

```
bun msvc --toolset 14.44 exec -- bun bd test test/js/bun/spawn/spawn.ipc.test.ts test/js/bun/spawn/bun-ipc-inherit.test.ts test/js/node/cluster.test.ts
```

Result: 40 pass, 13 existing skips, 1 existing todo, 0 fail, 99 assertions.
Both JSON and advanced IPC serialization and cluster/TLS handoff are exercised.
Skips and todos do not establish qualification.

Serialized strict Clippy runs use the locked runtime package, `--no-deps`, and
`-D warnings`. Windows x64 and ARM64 have zero diagnostics in `ipc.rs`; the
whole runtime retains 83 errors on each Windows target. Linux GNU x64 and
ARM64 complete with zero runtime errors. Windows Clippy retains the previously
documented process-local sccache opt-out; no global cache configuration changes.

Receipts are `tmp/ipc-native.log`, `tmp/ipc-native.exit`, and
`tmp/ipc-final-<target>.jsonl/.stderr/.exit`. This is source and Windows runtime
qualification, not a released installation or Linux hardware qualification.
