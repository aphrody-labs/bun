# Glob/router path scratch and strict missing-cwd qualification

## Source and behavior

Qualified on 2026-10-10 from public base `7044c92ac3616d023658fb70c108f375dee1e705` with the owned changes in `src/runtime/api/glob.rs`, `src/runtime/api/filesystem_router.rs`, `src/glob/GlobWalker.rs` and the existing scan test.

The two double-width path buffers are initialized directly in heap allocations. On Windows each retains its original 128 KiB capacity. Path bounds, normalization and copying remain intact; ordinary Rust scope cleanup frees the buffers on success and error. The two affected Windows large-stack-frame diagnostics disappear. This adds scoped heap allocations; throughput improvement is not established.

`Bun.Glob` passes its strict symlink option into the shared walker's missing-cwd policy. Default scans retain empty results for missing cwd. Strict scans propagate `ENOENT` through the existing directory open for both `scan` and `scanSync`. Missing absolute pattern prefixes still yield no results. Generic walker construction retains its previous default. No additional filesystem probe is introduced.

The [Glob page](../runtime/glob.mdx) documents this behavior. Regression coverage remains in the existing [scan suite](../../test/js/bun/glob/scan.test.ts).

## Native engine

The owner factory uses MSVC 14.44, four Ninja jobs, four linker threads and full debug symbols. Ninja's wrapper opt-out is process-local. Source files match the local `tmp/path-scratch-plan.json`; this is a changed debug artifact, not a tagged distribution.

- Final factory receipt: `tmp/path-scratch-policy-native.log/.exit`, exit zero.
- 231 pass, 24 inherited skips, zero failures; 136 snapshots and 21,577 assertions across four files, 34.83 seconds.
- Existing route GC, route reload, invalid filenames and matched-route leak cases pass.
- Executable: `433016320` bytes, SHA256 `D43DFF86C79B02CB135AA86DF19A251FEBF2F16DBD7E38654D38B66886176440`.
- The debug cache reports `d69d5ebe8`; source qualification is the public base plus recorded owned changes, rather than that cached revision alone.

## Compiler and style gates

Serialized strict Clippy checks cover both `bun_runtime` and `bun_glob`:

| Target | Command exit | Owned errors | Remaining runtime errors |
| --- | --- | --- | --- |
| GNU x64 | 0 | 0 | 0 |
| GNU ARM64 | 0 | 0 | 0 |
| MSVC x64 | 101 | 0 | 33 |
| MSVC ARM64 | 101 | 0 | 33 |

GNU receipts are under the VPS owner's `tmp/owner-linux-qualification/path-scratch-policy-*`; Windows receipts are `tmp/path-scratch-policy-*.jsonl/.stderr/.exit` and `tmp/path-scratch-policy-windows-summary.json`. GNU ARM64 uses the previously qualified LLVM23/official Ubuntu cross sysroot. These checks do not establish a linked ARM64 binary, hardware execution or the distribution's glibc floor.

The entire changed scan test type-checks with declared TypeScript 6.0.2 and the fork's types. Strict scoped oxlint 1.70.0, Prettier 3.6.2, Rust formatting and diff checks pass. The installed-runtime control fails both strict missing-cwd regression cases and passes both absolute-pattern controls: `tmp/path-scratch-cwd-controls-system.log/.exit`.

## Retained diagnostic history and capacity

The initial native attempt stopped while loading the missing locked `fast-glob` dependency. The qualification checkout now references the already installed exact version 3.3.1; source manifests and locks are preserved. The subsequent full run exposed the strict missing-cwd defect, also reproduced with `USE_SYSTEM_BUN=1`. An intermediate policy rejected the default empty-result case; the final policy and complete passing suite cover both contracts.

An initial ARM64 wrapper check failed spawning rustc for `uv-install-wheel` with Windows error 206. A documented process-local wrapper opt-out retains the global sccache configuration and cache. The final target checks reach the runtime and report the unrelated 33 errors above.

Build capacity was recovered by exact-file NTFS compression under the canonical Cargo mutex, with SHA256 validation before and after. Archives, metadata, debug symbols, sources and providers remain present. Final symbol-compression receipt validates all 120 planned files unchanged and records free space rising from 3,728,392,192 to 15,661,723,648 bytes.

Global Windows strict qualification, matched performance, distribution tagging and PATH promotion, private video delivery and physical Linux GPU qualification remain open.