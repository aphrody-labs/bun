# Bun upstream PR radar — 2026-10-28

This is a dated snapshot of upstream `oven-sh/bun`, checked against GitHub on 2026-10-28. It records notable changes for the upstream migration; it is not a complete or continuously updated list. Live lists: [open PRs updated since Oct 27](https://github.com/oven-sh/bun/pulls?q=is%3Aopen+updated%3A%3E%3D2026-10-27) and [recently merged PRs](https://github.com/oven-sh/bun/pulls?q=is%3Amerged+merged%3A%3E%3D2026-10-27).

## Current upstream baseline

The official [canary release](https://github.com/oven-sh/bun/releases/tag/canary) resolves to commit `11c367163a4baa77d3627d14764c376c856a630a`, which is also the latest commit found by the repository's GitHub commit search during this check. `Bun.revision` and `process.release.sourceUrl` must still be checked on each host; a matching version string is not provenance evidence.

## AOT

- [#45631](https://github.com/oven-sh/bun/pull/45631), **merged Oct 27**: adds experimental `bun build --compile --aot` (also `bun compile`) to emit machine code for JavaScript and TypeScript ahead of time. It remains JavaScript and retains dynamic semantics where the compiler cannot prove a specialization. The PR includes a detailed benchmark and explicitly documents workloads where AOT loses; do not generalize its best-case gains to all applications.
- [#47129](https://github.com/oven-sh/bun/pull/47129), **open**: follow-up fixes for modules, classes and Workers, along with a WebKit update and additional fixes that also affect ordinary non-AOT use. Treat those changes as unavailable until a canary built from a commit containing them is verified.
- [#47202](https://github.com/oven-sh/bun/pull/47202), **open**: proposes shrinking zero-filled data to avoid a 2 MiB transparent-huge-page RSS jump observed by AOT performance checks. The author reports a small HPACK instruction-count increase as the tradeoff.
- [#47186](https://github.com/oven-sh/bun/pull/47186), **open**: changes a CSS modules `composes` conflict into a counted warning; its description says the old behavior failed AOT builds.

The older measurements and reproducible scripts remain in [aot-preview.md](aot-preview.md). They describe a preview build at a specific older commit and must not be presented as measurements of today's canary.

## Recently merged work

The recent merged search returned these notable areas:

- **WebKit/JSC:** [#47125](https://github.com/oven-sh/bun/pull/47125), [#47057](https://github.com/oven-sh/bun/pull/47057) and [#47035](https://github.com/oven-sh/bun/pull/47035) advance the WebKit pin. [#45631](https://github.com/oven-sh/bun/pull/45631) integrates the AOT engine work.
- **Memory safety and Rust ports:** [#47037](https://github.com/oven-sh/bun/pull/47037) replaces bytemuck with in-tree `bun_pod`; [#46638](https://github.com/oven-sh/bun/pull/46638) replaces libarchive with a safe-Rust tar reader/writer; [#46650](https://github.com/oven-sh/bun/pull/46650) replaces HdrHistogram and fixes `node:perf_hooks` histograms; [#46834](https://github.com/oven-sh/bun/pull/46834) and [#46825](https://github.com/oven-sh/bun/pull/46825) address source/path lifetime use-after-free bugs.
- **CSS and tooling:** [#47025](https://github.com/oven-sh/bun/pull/47025) consolidates a large batch of CSS parser fixes; [#46001](https://github.com/oven-sh/bun/pull/46001) improves `bun check` speed; [#47008](https://github.com/oven-sh/bun/pull/47008) quiets `.env` install noise unless verbose output is requested.
- **Runtime compatibility and hardening:** [#46678](https://github.com/oven-sh/bun/pull/46678) broadens `bun check` type inference; [#46542](https://github.com/oven-sh/bun/pull/46542) adjusts `--use-openssl-ca`; [#46456](https://github.com/oven-sh/bun/pull/46456) hardens HTTP handling; [#46480](https://github.com/oven-sh/bun/pull/46480) adds a hardlink fallback.

## Open work to watch

GitHub's open PR search updated since Oct 27 included (selection by relevance/recency, not a claim that every item was opened that day):

- **AOT and startup memory:** [#47202](https://github.com/oven-sh/bun/pull/47202), [#47129](https://github.com/oven-sh/bun/pull/47129), [#47187](https://github.com/oven-sh/bun/pull/47187).
- **Safe Rust codecs:** [#47079](https://github.com/oven-sh/bun/pull/47079) ports zstd; [#47074](https://github.com/oven-sh/bun/pull/47074) is a draft JPEG codec replacement. Both need performance and compatibility qualification before adoption.
- **Node compatibility:** [#47191](https://github.com/oven-sh/bun/pull/47191) routes `node:net` server hosts through `dns.lookup`; [#47218](https://github.com/oven-sh/bun/pull/47218) preserves `node:dgram` bind errors; [#47216](https://github.com/oven-sh/bun/pull/47216) allows `.js` extension handlers to choose a loader; [#47184](https://github.com/oven-sh/bun/pull/47184) adjusts `require.resolve({ paths })`; [#47215](https://github.com/oven-sh/bun/pull/47215) fixes linked `node:vm` module handling.
- **Bundler/compiler:** [#46092](https://github.com/oven-sh/bun/pull/46092) changes output-slot handling for hashed entry/plugin assets; [#47199](https://github.com/oven-sh/bun/pull/47199) fixes optional chaining on `import.meta.hot`; [#47209](https://github.com/oven-sh/bun/pull/47209) fixes a React Compiler scope/store issue; [#47206](https://github.com/oven-sh/bun/pull/47206) resolves `FileSystemRouter` precedence at load time.
- **Checker and parser:** [#46383](https://github.com/oven-sh/bun/pull/46383) tracks TypeScript 7.1 for `bun check`; [#46311](https://github.com/oven-sh/bun/pull/46311) fixes a parser nested-arrow case.

## Migration implications

- Use the official canary for migration gates and record revision plus source URL. Avoid describing the fork's additions as upstream features; extraction and Bun OS modules remain separate work.
- AOT is now present in the current upstream baseline, but still experimental. Check the actual binary's `bun build --help` and qualify the target app before adopting `--aot` in release builds.
- Upstream `Bun.spawn` still lacks the fork's Job Object handle/assignment API required by `scripts/factory/factory.ts --windows-locks`. Upstream [#42272](https://github.com/oven-sh/bun/pull/42272) is only a draft for `windowsKeepAlive`, which has different semantics. Keep that specific path gated until a suspended native launcher or an upstream equivalent is available; don't substitute `taskkill /T`.

## Evidence and freshness

This snapshot used GitHub search/API metadata and PR descriptions, plus Context7's upstream Bun docs. Context7 currently documents ordinary `--compile` but did not return the new AOT option, so the AOT status above is based on the upstream PR and commit, not that docs index. Refresh this page before making release or compatibility claims.
