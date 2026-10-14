---
name: bun-aphrody-graph-memory
description: Provider-neutral native graph and memory workflow with explicit Bun domain scopes and source evidence
metadata:
  type: reference
---

Use the selected checkout, `aphrody graph --help`, `aphrody home --help` and
`aphrody memory --help`. Native CLI interfaces and records are authoritative.
Claude, Codex, Gemini, OpenCode and local models consume the same source facts;
provider credentials, raw sessions, cookies and databases stay isolated.

## Bounded source indexing

Keep each `src/<owner>` and `packages/<owner>` domain separate. For this plugin:

```text
aphrody graph --profile bun --source graph:bun:packages:bun-agent-plugin build packages/bun-agent-plugin
aphrody graph --profile bun --source graph:bun:packages:bun-agent-plugin report
aphrody graph --profile bun --source graph:bun:packages:bun-agent-plugin query "provider installation and generation"
```

Inspect `aphrody home --profile bun status` rather than assuming a machine path.
Index after the final source edits. Incremental hashes determine changed files.
A recorded HEAD commit does not prove a clean checkout. File hashing, extraction,
resolved calls and executable compatibility are separate qualifications. Inspect
errors, unreadable/oversized files, external references and unresolved calls.

The 2026-10-13 pre-edit plugin scan hashed 80 files, extracted 79, had no extraction
errors, and produced 689 nodes and 807 edges; 9 calls were unresolved and 214 were
external. These are a historical baseline, not current post-edit totals. Older
whole-monorepo and Next.js counts are not current evidence. Do not export or load
an entire multi-gigabyte graph for a bounded task.

## Immutable Bun graph evidence and types

`bun:graph`, `bun:graph-index` and `bun:graph-native` are owned by
`src/js/bun/graph*.ts` and `src/graph/api.rs`. Their declarations live in
`packages/bun-types/graph*.d.ts`. Rust Serde defaults allow omitted input metadata;
serialized output includes every metadata field, using null for missing values.
`GraphNodeInput` and `GraphLinkInput` model inputs separately from normalized
`GraphNode` and `GraphLink` outputs. The integration fixture
`test/integration/bun-types/fixture/graph-native.ts` checks both contracts.

For snapshot exports read `docs/runtime/graph.mdx` and exporter help:
`scripts/aphrody/graph-docs.ts` requires repository, snapshot, domain, source and
profile. Native Aphrody home graphs and Bun SQLite snapshots are distinct stores;
an Aphrody report is not a Bun immutable snapshot. Verify manifest hashes and
coverage before claiming an export is current. Changed-runtime tests use `bun bd
test`; declaration-only qualification follows the repository `packages/bun-types` gate.

## Shared project knowledge

Store only project facts through `aphrody memory write --agent-id bun-shared --id
bun-aphrody-graph-memory --content -` (stdin). Reuse the same ID when replacing
the record. Retrieve through `aphrody memory recall --agent-id bun-shared --query
"graph domain source"`. Native home indexing (`aphrody home --profile bun index
<domain> --label <source>`) is an explicit separate operation. Neither operation
synchronizes private provider memories or trains local models.

Related: `bun-core-crate-map`, `bun-os-runtime`, `bun-rust-first`.
