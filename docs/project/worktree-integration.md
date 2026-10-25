# Retained worktree integration receipt

Audit date: 2026-10-11. Comparison source: `65f3fa168c084f842bda4fcf5cbfdf42fe581498`.
The checkout has nine registered worktrees: main and eight retained owner trees.
Every local branch tip and the detached npm qualification tip were verified as
ancestors of that source with `git merge-base --is-ancestor`. Ancestry establishes
committed integration; it does not establish integration of dirty files.

| Retained tree                   | Source tip     | Dirty paths audited | Disposition                                                                                                                                         |
| ------------------------------- | -------------- | ------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| bun-sql-supabase-integration    | `1af0a0bf8252` |                  24 | UUID-array changes already integrated; retain current Supabase TLS, pooler and typed API behavior.                                                  |
| buv-native-gate                 | `2ab04a0081ef` |                 109 | Integrate source-backed archive capability declarations and three missing regression tests; preserve newer Windows, graph and compiler protections. |
| neon-plugin                     | `67f218154586` |                  16 | Committed history integrated; retain newer Neon migrations, types and TLS behavior.                                                                 |
| release-1.4.4                   | `5fb1124099cf` |                  24 | Integrate publication confirmation and 16 test-style deltas; preserve actual package versions.                                                      |
| owner-consolidation             | `3b7590b4906c` |                  19 | Route the shared eleven Windows build/runtime deltas to the runtime owner; preserve other drafts and historical qualification notes.                |
| owner-windows-clean-585a09f7e58 | `3b7590b4906c` |                  11 | Same Windows deltas; integrate once through the runtime owner.                                                                                      |
| bun-npm-release4-source         | `41211b56872c` |                   1 | Integrate only registry confirmation; retain current stable-version and build guards.                                                               |
| bun-glibc-integrate-20261010    | `67f218154586` |                   1 | Preserve the legacy `src/cli` deletion draft; do not delete the current directory.                                                                  |

The archive declarations are supported by `plugins/uv/vendor/uv/crates/uv-extract/src/stream.rs`:
bzip2, xz, lzip and lzma dispatch to real decoders; extraction drains the decoder
to EOF. The 256 MiB limit bounds decoder memory, not extracted output size.
Vendored owner and upstream revisions remain distinct and immutable.

Successful upload alone does not qualify npm publication. The publication adapter
now requires the exact registry name, version and SHA-512 integrity to match its
packed artifact. Registry 404 records pending publication; conflicting metadata
and other HTTP errors fail verification. No unavailable package is represented
as published.

The incoming blanket Cargo version bumps are retained as drafts. Existing npm
source contracts remain n2b `0.7.1`, oxc `0.3.0` and native SDK `0.2.0`; no
independent compatibility or publication evidence justifies changing all three
to `1.4.4`.

The alternative Python compiler draft remains preserved. Current main already
contains native Cython/Nuitka compilation, WASI builder routing, artifact receipts
and source/output protection. Replacing it wholesale would discard subsequent
qualification and environment-selection fixes. Duplicate graph registrations and
older Windows/graph implementations are likewise preserved without replacing
their newer owner implementations.

The audit retained binary tracked patches, per-file SHA-256 comparisons and
incoming source snapshots under the local ignored `tmp/worktree-audit/` directory.
Provider settings and protected stores are excluded from source snapshots.
Original worktrees remain registered and dirty; no reset, stash, clean or removal
was performed. These local receipts are review material, not release artifacts.

Publication-adapter TypeScript checking passed. The combined archive-adapter
check encounters three existing `ReadableStream.text()` declaration errors in
`engine-graph.ts` and `pyjs-index.ts`; those dependencies were not changed by this
integration. Runtime regression tests and Windows compilation must pass through
the serialized owner factory before delivery. Historical qualification reports
do not establish qualification of the newly consolidated source.
