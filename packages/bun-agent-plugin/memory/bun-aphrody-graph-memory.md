---
name: bun-aphrody-graph-memory
description: Native aphrody code graph (source graph:bun) and aphrody memory store (agent-id bun) covering the full <bun> monorepo — how to query and rebuild
metadata:
 type: reference
---

Built 2026-10-08 from `<bun>` (respects .gitignore: vendor/, build/, node_modules excluded).

**Code graph** — source `graph:bun` in the global aphrody home DB: 19 500 files, 114 065 nodes, 304 039 edges, 6 028 communities (683 extraction errors, 6 oversized files skipped). Exports: `~\.aphrody\graphs\bun\graph.json` (~112 MB) + `GRAPH_REPORT.md`. God nodes: JSValue, JSGlobalObject, JsResult, TypeId (sema), bun_test.rs, FileId, bunExe (harness).
- Query: `aphrody graph --source graph:bun query "<question>"` · `explain <node>` · `path <a> <b>` · `report`.
- Rebuild (incremental, ~30 s): `aphrody graph --source graph:bun build <bun> --json ~/.aphrody/graphs/bun/graph.json --report ~/.aphrody/graphs/bun/GRAPH_REPORT.md`. Re-run after upstream merges.
- `--source` is mandatory: the DB holds several graphs. A stray empty source `claude-memory-bun` exists (Markdown is not extracted; ignore it).

**Memory store** — every `bun-*.md` file of this directory is mirrored as a record in `aphrody memory` with `--agent-id bun`, `--id <name>`, tags `bun`, `<area>` (build/core/runtime/toolchain/install/tests/docs/fork/review…), `<type>`, metadata `{file, description}`.
- Recall: `aphrody memory recall --agent-id bun --query "<words>" [--tag toolchain]` (lexical score).
- Re-sync after editing a file: `aphrody memory write --agent-id bun --id <name> --content - < <name>.md` (same id replaces).

Related: `bun-core-crate-map`, `bun-fork-aphrody`.

**Next.js graph** — source `graph:nextjs`, built 2026-10-08 from `<bun>\vendor\next.js` (shallow clone, v16.5.0-canary.4 @7549879a, gitignored): 31 942 files, 65 989 nodes, 171 550 edges, 4 274 extraction errors. Exports in `~\.aphrody\graphs\nextjs\`. Same limits as graph:bun (Rust calls resolve same-file only; use node ids for `explain`)..
