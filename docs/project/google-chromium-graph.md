<!-- SPDX-License-Identifier: Apache-2.0 -->

# Google and browser source graph

[google-chromium-graph.ts](../../scripts/aphrody/google-chromium-graph.ts) dispatches
to the existing Bun native graph owners. It adds no source parser or browser engine.

```sh
bun scripts/aphrody/google-chromium-graph.ts plan
bun scripts/aphrody/google-chromium-graph.ts index
bun scripts/aphrody/google-chromium-graph.ts export
```

`index` reuses the fork capability catalog, pins the selected checkout HEAD and
records its dirty state. `bun:graph-index` extracts the Google and Chromium SDKs,
Bun M3 adapter, transferred web package and native browser source domains.
Source reads and native file parsing use the owner's 16 MiB per-file limit,
including files that exceeded the previous 512 KiB parsing limit. Larger files
remain explicitly unqualified; size limits never become fabricated hashes or ASTs.
`bun:graph-native` extracts an
explicit supplementary file list for the Google/Chromium/Obscura builtins, SDK
declarations (including the Chrome compatibility alias), shared browser CLI,
Chromium source commands and GN entry points.
JSON manifests and GN provenance are hashed file facts with unresolved AST coverage.

The source HEAD and each observed source hash are separate evidence. A dirty
snapshot contains current working files; it does not claim they belong to the
recorded commit. The producer version, revision and executable hash identify the
runtime doing extraction independently of the checkout's source revision.

`export` uses the existing bounded `graph-docs.ts` exporter against exact immutable
snapshot IDs. Its manifests report unsupported files, missing hashes, parse errors,
unresolved calls, missing benchmarks and truncated output. Resolution is bounded
to domain chunks or the explicit supplementary file set; cross-domain API edges
are not automatically complete.

Artifacts and the SQLite registry stay under local ignored `tmp/google-chromium-graph`
by default. They are runtime evidence, never source to commit. Protected stores
are outside the selected roots and the native indexer preserves its exclusion rules.

The complete vendor Chromium and GN implementation trees are excluded. GN's
vendor receipt is evidence of its pinned source; it does not establish an AST of
all GN or Chromium. Source graph generation performs no browser launch, session
read, engine compilation, publication, deployment or benchmark.

See [browser command owners](../aphrody/browser-owners.md) for GN compilation and
CDP runtime boundaries, and [native graph](../runtime/graph.mdx) for snapshot coverage.
