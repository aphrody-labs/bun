<!-- SPDX-License-Identifier: Apache-2.0 -->
# Browser capability migration into Bun

Owner directive: 2026-10-11. Source snapshot:
`aphrody-labs/aphrody@2d66be8fcd84a87b4ca73124023881ca9d0c204f`.
Delivery: `aphrody-labs/bun-os`, branch `obscura` (the branch name records the
import history). The product surface is Bun: one `bun` CLI, `bun mcp`, Bun FFI,
and the existing `bun-agent-plugin`. No independent browser product is created.

## What the source actually contains

The retired browser tree is absent from tracked sources. Historical tool aliases
in `crates/ai/mcp/src/bxc_tools.rs` dispatch to native capability owners; they
do not launch a browser process. Legacy names in the provenance ledger describe
where source came from, not a newly created API.

The import ledger records 58 tracked files, 687,717 source bytes and their
SHA256 at the source snapshot: four complete Rust libraries, four pure SDK
modules. All Rust fixtures, examples, benchmark drivers and embedded source
catalogues travel with their library. No cookie, database, HAR recording,
dataset, model, downloaded media or live session is transferred.

`browser-research-inventory.json` inventories 176 tracked documents mentioning
the prior engines. It is a source index, not a claim that each old assertion is
currently true. Material technical sources and missing implementation evidence
are reconciled below.

## Native mechanisms and lazy modules

| Capability | Existing implementation | Bun reuse and target | Closure required before consumer switch |
| --- | --- | --- | --- |
| JavaScript/TypeScript source and evaluation | Bun JSC, parser/printer, bundler; imported page V8 operations | JSC owner `src/jsc`; adapt page bindings to isolated JSC context, Bun parser/resolver for modules | Differential DOM execution, promise/microtask ordering, timers, modules, workers, interruption, exceptions, GC and teardown; no host API in remote context |
| CSS parsing/build | Bun `src/css`; page renderer CSS declarations | Reuse Bun CSS parser/printer in browser layout module; keep layout, painting and computed style in browser owner | Compare supported selectors, cascade, units, fonts, box model, media queries; do not substitute build-time transforms for layout |
| HTML streaming and DOM | Native `HTMLRewriter` backed by lol-html; imported mutable HTML5 DOM | Use HTMLRewriter for streaming extraction/rewrites; reuse DOM arena for mutation, identity and browser query | Malformed HTML, entities, scripts/text chunk boundaries, selectors, serialization; streaming token API cannot replace persistent DOM identity |
| Fetch/cookies/HAR/SSRF | Imported network and SSRF libraries, service profiles | Native fetch/event loop for ordinary HTTP; lazy profile/HAR module keeps guarded resolver and redirect policy | SSRF on resolution and redirects, cookies/profiles isolation, proxy, headers/status, raw bytes, abort, timeout, size limits, stealth/TLS feature negotiation |
| Main-content Markdown/artifact | Imported extraction and `web-service::page_artifact` | Lazy extraction library; native HTML API where identical; one canonical artifact schema | Native profile and extraction fixture parity, scripts resolved without implicit acquisition; exact output/errors |
| Stateful page actions, CDP, screenshots/PDF | Page/CDP/render libraries; pure Bun.WebView client | Browser owner in runtime; `packages/bun-web` internal pure SDK, no subprocess facade | Existing CDP domain/error events, history and target isolation; valid images/PDF, network status, screenshots; JS DOM mutations |
| Continuous crawl/frontier/robots/sitemap/mirror | `web-crawl` plus SQLite WAL queue and OPIC/revisit | Imported lazy library; Bun scheduler/fetch and SQLite may replace adapters after parity | Persistent lease recovery, retries, cancel, per-host budget, robots, sitemap, mirror path containment, content hashes, dedupe, rendered discovery |
| Technology/challenge detection | `web-detect` deterministic rules and bounded response scan | Imported lazy library; Bun HTTP supplies equivalent evidence | Pure detection fixtures, bounded body, strategy recommendation; detection is not CAPTCHA solving |
| Vector index/quantization/mmap | `web-index` HNSW, SIMD dispatch, persistence | Imported optional library; preserve indexed-format ABI and scalar fallback; export through existing Bun FFI owner only | API tests, recall threshold, corrupt-index handling, AVX2/scalar comparison, mmap lifetime and actual benchmark |
| Frame vectors/media acquisition | `web-frames`, extraction media resolvers | Separate lazy Bun module; reuse native spawn owner for ffmpeg, SQLite for metadata after qualification | MPEG-7 8x8 fixture parity, ffmpeg cancellation/ownership, quota, descriptor search, protected-store isolation; trace.moe remains explicit external request |
| X/Twitter/GraphQL/Grok | Rust `crates/web/x`, TS `packages/web/x`, AI tool dispatch | Lazy integration modules; native fetch/SQL reuse; protected cookies remain owner-profile data | Loopback fixtures, GraphQL query catalogues, batch/rate-limit/errors, cancellation, archived ranking; no live mutation implicit in migration |
| Wayback/search/Google/Gemini | Existing public-web, search, Google owners in Aphrody | Lazy integrations using the existing capability owner; do not move private stores | Request/schema parity and scoped authenticated flow; no invented credentials or fake backend |
| Tests/Next instant navigation | Existing browser locators, runner, expectation and Next adapters | Transfer locator/selectors into internal SDK; keep Next/runner consumers until required adapter exists | Offline fixture parity, cookie acquire/release in finally, nested instant guard, console/network diagnostics; layout-backed ARIA/actionability |
| CLI/FFI/MCP | Existing engine dispatch, Aphrody FFI/MCP tools | Merge handlers into existing Bun CLI/FFI/MCP registry/plugin, no second server or executable | Capabilities discoverable from actual built binary, preserved errors/schema, allocation/free contracts, permissions, cancellation, worker shutdown |

## Sources transferred as callable libraries

- `crates/web/web-service` -> `crates/service`: `WebSession`, profile-aware
  fetch, `PageArtifact` and role contracts. It depends only on transferred
  browser/extraction libraries and external crates; no Aphrody product source.
- `crates/web/web-crawl` -> `crates/crawl`: `crawl_bounded`, `crawl_daemon`,
  frontier, robots/sitemap/mirror, deterministic wiki/design/domain adapters.
- `crates/web/web-detect` -> `crates/detect`: `detect_response`, bounded
  `detect_url`, challenge classification and strategy recommendation.
- `crates/web/web-index` -> `crates/index`: public `Index`, quantization,
  persistence, API/recall tests and `examples/index_bench.rs`.
- `packages/web/agent-browser/src/{cdp,types}.ts` and
  `packages/web/aphrody-web-test/src/{locator,selectors}.ts` -> `packages/bun-web/src`:
  direct Bun.WebView CDP transport and lazy locator resolution. Public module
  uses `BrowserPage` and `DEFAULT_BUN_CDP_URL`; imported message strings follow
  Bun naming. No engine binary discovery, runtime-sdk or subprocess launcher.

Integrate the four Rust libraries into their owner workspace before marking
them dependency-qualified. Workspace dependency values come from the exact
source lock; do not select newer crates as a side effect. Additional inherited
dependencies include `blake3`, `chrono`, `futures`, `rusqlite`, `sha2`, `fs4`,
`image`, `webp`, `memmap2`, `parking_lot`; reuse inherited reqwest/Tokio/serde.

## Deferred transfer requiring an existing owner adapter

`web-engine` and `web-frames` call `aphrody_proc::NoWindow`; the engine also
owns legacy CLI scrape workers. Port process ownership into Bun's existing
native spawn/supervisor, preserving stdout limits, hard deadline, abort reason,
descendant shutdown and Windows hidden launch. Do not drag the complete Aphrody
CLI into Bun and do not wrap the old CLI as the replacement engine.

`agent-browser/service`, `engine`, `client` and `runtime` currently depend on
runtime-sdk or legacy process launch; transferring those unchanged would keep
the redundant executable contract. Replace their transport with the qualified
Bun native provider first. The full web-test CDP adapter additionally imports
`@aphrody/bun-webview-page`; the target snapshot has Bun.WebView but no local
source for that package. Keep the consumer until the shared native page adapter
is installed/resolved and qualified rather than inventing a fake shim.

## Research used and evidence limits

1. `docs/reference/workspace/browserTORUST.md`: capability inventory is useful;
   claims of <35 MiB memory, <2 ms calls, full CAPTCHA support and complete
   parity have no paired benchmark/fixture receipts in that document. Do not
   reuse those figures as migration evidence.
2. `docs/plans/ai/plans/bxc-fusion.md` explicitly labels September consolidation
   as historical. The retired source paths cannot be treated as current tasks.
3. `docs/reference/web/web/EXTRACT.md` describes schema learning, selector
   cache, coercion and LLM unresolved-field fallback, but referenced
   `src/extract/*` is absent. Keep this capability open until actual preserved
   source or existing owner implementing the documented schema is identified.
4. `docs/reference/ai/memory/bxc-test-and-next-playwright.md` records static
   no-JS/no-layout caveats, cookie deletion regression and Next instant cookie
   protocol. Port tests from current web-test, not obsolete absent packages.
5. `web-index/BENCHMARKS.md` records 2026-09-17 oversubscribed Haswell VM runs;
   current `examples/index_bench.rs`, `tests/{api,recall}.rs` are reproducible.
   Old rust-bridge command paths must be translated to the current manifest.
6. `docs/reference/web/web/CHROMIUM-RUST.md`, `WEB-SERVICE-CONTRACT.md` and
   `obscura-integration-spec.md` explain transports/features, but contain
   retired paths and source-level claims. Reconcile with current calls before
   setting a parity checkbox.
7. `docs/plans/fusion/bench/*deno*.json` supplies dated Bun/Deno startup/compute
   baseline receipts. `scripts/audit/engine-equivalence.ts` and
   `scripts/tools/web/obscura-v8-deno.ts` enumerate page V8 operations. Static
   operation coverage is input to the differential suite, not JSC equivalence.
8. Bun native references: `docs/runtime/html-rewriter.mdx`,
   `packages/bun-types/{html-rewriter.d.ts,bun.d.ts}`, `src/runtime/api/html_rewriter.rs`,
   `src/css`, `src/js_parser`, `src/jsc`, `packages/bun-inspector-protocol`.
   Build-time CSS/HTML and JSC inspector protocol are not CDP DOM/layout parity.

## Required qualification and consumer switch

All build, test, strict Clippy and benchmark work runs through the qualified
SSH VPS factory. No engine compilation, Cargo or heavy formatting/lint pass
runs on the owner's PC.

- [x] Inventory actual tracked legacy sources and references.
- [x] Transfer four libraries, fixtures and benchmark drivers with exact hashes.
- [x] Transfer pure Bun.WebView SDK modules without subprocess/FFI fallback.
- [ ] Integrate Cargo member/dependency closure and exact Cargo-generated lock.
- [ ] VPS serialized library check/test/strict Clippy, preserved feature matrix.
- [ ] VPS native Bun CDP provider + imported SDK end-to-end fixture parity.
- [ ] VPS historical web-test/Next/CLI/FFI/MCP regressions on the same provider.
- [ ] VPS equal-host baseline/candidate startup, RSS/PSS, cold/warm DOM parse,
  selectors, CSS cascade/layout, JS execution, extraction, crawl throughput,
  cancellation, vector recall/latency and repeated create/destroy measurements.
- [ ] Native registry/provider and lazy plugin closure in the actual `bun`
  binary; installed runtime and consumer acquisition qualification.
- [ ] Switch Aphrody consumers directly to Bun only after the relevant parity
  receipts pass; remove qualified duplicate source in the same owned batch.

Store benchmark host, target, source commit, artifact hash, corpus hash, warmup,
sample counts, percentiles, peak memory and skip/error counts. Compare identical
inputs and limits. A speed claim cannot compensate for changed HTML, omitted
JS, broken cancellation, approximate accessibility or missing permission checks.
