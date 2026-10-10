# Windows shell copy state qualification

On 2026-10-10, Windows `cp` keeps its large EBUSY post-processing state in a
Box, allocated when execution moves to that phase. This reduces the size of
the State enum without moving or changing its queued task ownership. Deferred
tasks are still reclaimed once, and successful source/target collision matching
retains its existing precedence. Optional paths use is_some_and; the unsafe
reclamation contract is adjacent to the ownership transfer.

The changed engine was built and tested through the MSVC 14.44 owner factory:

```
bun msvc --toolset 14.44 exec -- bun bd test test/js/bun/shell/commands/cp.test.ts
```

Result: 30 pass, 0 fail, 111 assertions, covering normal and subprocess copy
operations. No performance improvement is claimed without measurement.
Serialized locked strict runtime Clippy (`--no-deps`, `-D warnings`) has zero
cp.rs diagnostics on Windows x64/ARM64 and GNU Linux x64/ARM64. GNU completes
with zero whole-runtime errors; Windows retains 77 errors elsewhere.

Receipts: tmp/shell-cp-native.log/.exit and
 tmp/shell-cp-<target>.jsonl/.stderr/.exit. The documented process-local Windows
Clippy cache opt-out remains limited to these checks. This batch does not
establish release installation or production activation.
