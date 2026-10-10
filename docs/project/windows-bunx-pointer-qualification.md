# Windows bunx pointer qualification

On 2026-10-10, bunx passes explicit raw pointers to NtQueryInformationFile's
IO_STATUS_BLOCK and FILE_BASIC_INFORMATION output buffers. Its MiniEventLoop
loader reborrow uses ptr::from_mut while preserving the existing root/lifetime
contract. No cache or install policy is changed.

The existing multiple-bin mock-registry fixture previously failed on native
Windows because it ran external chmod. It now uses the already imported
chmodSync for both files. The owned test file is formatted with oxfmt.

Changed-engine validation through the MSVC 14.44 owner factory:

```
bun msvc --toolset 14.44 exec -- bun bd test test/cli/install/bunx.test.ts -t 'mock registry|should output usage|should print the (version|revision)'
```

The initial run had 8 passes and one chmod fixture failure. After correction
and formatting: 9 pass, 27 filtered out, 0 fail, 44 assertions. The filter
selects the local mock registry and CLI metadata tests; public-registry/GitHub
cases are not qualified by this run. oxfmt, oxlint and diff checks pass.

Scoped TypeScript exits nonzero on dummy.registry.ts:422 because Bun.jest is
absent from the Bun types. A separate run against the unchanged published bunx
test reproduces the identical helper error. The type gate is not declared
passed; receipts retain both failures.

Serialized locked strict runtime Clippy has zero bunx_command.rs diagnostics
on Windows x64/ARM64 and GNU x64/ARM64. GNU whole-runtime checks pass; Windows
retains 72 errors elsewhere. The documented process-local Windows cache
opt-out is retained; global configuration is unchanged.

Receipts: tmp/bunx-pointers-native.log (initial failure),
 tmp/bunx-pointers-native-formatted.log/.exit (final),
 tmp/bunx-pointers-types.log/.exit and baseline-types.log/.exit,
 tmp/bunx-pointers-<target>.jsonl/.stderr/.exit.
Release installation and production activation remain separate gates.
