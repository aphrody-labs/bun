<!-- SPDX-License-Identifier: Apache-2.0 -->

# Public search stack: Rust and Bun

Verified 2026-10-11 against the local manifests, GitHub repository/release APIs,
crates.io metadata and primary project documentation. This is a selection and
integration contract, not a receipt of deployment, an exhaustive Google index,
or a declaration that every candidate has been installed. No new dependency,
upstream clone, browser engine or service was introduced by this research.

## Selection

Use the existing Bun native crawler, Google and Chromium owners, a single
explicit public index projection, and the existing Workspace/Infra ingress.
The immediate public lexical projection uses Bun SQLite FTS5. Tantivy is the
selected candidate for larger native lexical indexes when measured corpus,
ranking or indexing requirements exceed that projection. Keep the existing
HNSW owner for semantic retrieval; HNSW is not a lexical search engine.

For broader historical coverage, ingest bounded Common Crawl CDX/WARC records
through the same public-document pipeline. This complements fresh permitted
crawls; it does not turn archived observations into real-time information.
Pingora is the preferred evaluated Rust programmable proxy candidate, while
the deployed Infra ingress remains the owner until a replacement is qualified.

Selection criteria are existing ownership, native Rust/Bun integration,
public-source licensing, Windows/Linux support, bounded resource use,
maintainability and reproducible delivery. No universal fastest/best claim is
made without a comparable benchmark and representative multilingual corpus.

## Existing owners inspected

Local source inspected at Bun HEAD `de2e7491cfe5cd3e62b230524ed2bb42be43afb0`.
Concurrent integrations can move HEAD after this observation. The Aphrody
ecosystem catalog is discovery evidence; current manifests establish paths.
The available graph MCP is rooted at `C:/aphrody` and refused a Bun-only path,
so this inventory used bounded manifest and source reads instead of claiming
a fresh graph of the entire monorepo.

| Capability               | Existing source                                                                             | Contract and limit                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recursive crawl/frontier | `src/browser/crates/crawl`; migrated provider `packages/bun-aphrody-web/crates/web-crawl`   | `bun_browser_crawl` and `aphrody-web-crawl` currently coexist during owner integration. Reuse the qualified owner; do not create a third frontier. Persisted URLs, redirects, robots and sitemaps require the same public scope. |
| HTTP/DOM/extraction      | `src/browser/crates/{net,dom,extract}` and migrated Obscura provider                        | Reuse transport, extraction, cancellation and browser lifecycle. Keep public crawl policy before every network hop.                                                                                                              |
| Vector retrieval         | [bun_browser_index](../../src/browser/crates/index/Cargo.toml)                              | HNSW, int8 quantization, mmap persistence; `ffi_api.rs` is a Rust facade, not itself exported `extern "C"`. Embeddings and C ABI packaging require separate qualification.                                                       |
| Google public search     | [Google SDK](../../packages/bun-google/package.json), `src/search.ts`                       | Existing anonymous native-owner adapter; Google refusal/transport failure is an error, not fabricated search results. Google account APIs need explicit credentials/scopes.                                                      |
| Browser control          | [Chromium SDK](../../packages/bun-chromium/package.json), native Chrome/Chromium/CDP owners | Reuse package and builtins. SDK availability does not establish a rebuilt Chromium executable or browser parity.                                                                                                                 |
| Public lexical cache     | Bun Google public snapshot consumer under concurrent implementation                         | One Bun owner validates collection policy, document scope and snapshot integrity, then exposes bounded search/cache. Aphrody delegates HTTP requests; private home/frontier/profile stores are not public datasets.              |
| UI/API/ingress           | Aphrody canonical M3 app-ui and Workspace/Infra                                             | Preserve public route, host catalogs, TLS, health, artifact pin and rollback owners. Do not replace live ingress by installing a research candidate.                                                                             |
| SQL/cache                | Bun SQLite/SQL/Redis and existing Aphrody SQL owners                                        | Explicit database selection and ownership. A configured Redis/Postgres connection is not proof of availability or permission to project private data.                                                                            |

## Evaluated alternatives

Versions below are observations, not new lockfile pins. GitHub latest release
and crates.io latest stable can differ; they are distinguished explicitly.

| Candidate                                                                      | Observed version and license                                                                          | Fit for Rust/Bun and platform limits                                                                                                                                                                                              | Decision                                                                                                                                         |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Tantivy](https://github.com/quickwit-oss/tantivy)                             | [crate 0.26.2](https://crates.io/crates/tantivy/0.26.2), MIT, MSRV 1.86; GitHub latest release 0.26.1 | Embedded Rust BM25, configurable tokenizers; upstream documents Linux/macOS/Windows. Bun consumes a canonical native binding or service, not a TypeScript reimplementation. Browser WASM is not qualified by this native release. | Selected next native lexical engine after measured FTS5 limits.                                                                                  |
| [Meilisearch](https://github.com/meilisearch/meilisearch)                      | GitHub v1.54.3; [MIT AND BUSL-1.1](https://github.com/meilisearch/meilisearch/blob/main/LICENSE)      | Rust server with HTTP client integration. Current repository contains MIT community and BUSL enterprise parts; the whole repository cannot be labeled fully open source/MIT.                                                      | Do not import the complete repository into a fully open-source stack. An explicitly isolated community subset would need feature/license review. |
| [Quickwit](https://github.com/quickwit-oss/quickwit)                           | GitHub v0.9.1; current [Apache-2.0](https://github.com/quickwit-oss/quickwit/blob/main/LICENSE)       | Rust distributed object-storage search aimed at observability. Bun can consume HTTP. Distributed storage, ingest and operational cost exceed the immediate bounded public corpus.                                                 | Consider only when an object-storage/distributed workload is measured; not an immediate second index service.                                    |
| [Sonic](https://github.com/valeriansaliou/sonic)                               | GitHub v1.10.2, MPL-2.0                                                                               | Rust search backend with its own protocol. Introduces another service/protocol and document-store integration. Existing lexical owner provides the immediate public projection.                                                   | Comparison candidate; not an additional search backend now.                                                                                      |
| [Spider](https://github.com/spider-rs/spider)                                  | [crate 2.53.9](https://crates.io/crates/spider/2.53.9), MIT; GitHub latest release v2.52.2            | Rust crawler; selected features and browser dependencies must be audited. A crawler library is not a distributed scheduler or a guarantee of complete web coverage.                                                               | Use as a reference/qualification oracle; retain existing persistent native frontier. Do not activate bypass-oriented features.                   |
| [Crawlee](https://github.com/apify/crawlee)                                    | GitHub v3.18.2, Apache-2.0                                                                            | Upstream identifies JavaScript/Node.js and uses Node/browser packages. Bun-native compatibility is not established by that README or npm availability.                                                                            | Not selected without a pinned Bun compatibility suite; avoid duplicating the native crawler.                                                     |
| [SearXNG](https://github.com/searxng/searxng)                                  | Rolling master, [AGPL-3.0](https://github.com/searxng/searxng/blob/master/LICENSE)                    | Python metasearch service; HTTP can serve Bun clients. Provider engines can refuse traffic; aggregation does not grant Google account/API authority or make upstream results self-owned.                                          | Optional separate metasearch adapter only if required; retain license/source obligations and provider failure semantics.                         |
| [Pingora](https://github.com/cloudflare/pingora)                               | [0.9.0](https://github.com/cloudflare/pingora/releases/tag/0.9.0), Apache-2.0                         | Rust programmable proxy; [Linux tier 1, Windows preliminary](https://github.com/cloudflare/pingora/blob/main/README.md). Native server rather than browser WASM.                                                                  | Preferred Rust proxy candidate for a measured replacement project. Keep qualified Infra ingress now.                                             |
| [Chromiumoxide](https://github.com/mattsse/chromiumoxide)                      | [crate 0.9.1](https://crates.io/crates/chromiumoxide/0.9.1), MIT OR Apache-2.0, MSRV 1.85             | Tokio CDP client launching/connecting to an external Chrome/Chromium executable. It is not a browser engine rewritten in Rust. Generated CDP/runtime/browser versions must be matched.                                            | Compare existing native CDP owner; do not add a competing browser launcher.                                                                      |
| [ungoogled-chromium](https://github.com/ungoogled-software/ungoogled-chromium) | GitHub 155.0.8059.39-1; project BSD-3-Clause, Chromium/dependencies retain their notices              | Chromium patches/build configuration for Linux/macOS/Windows; browser engine remains Chromium with C++ and mixed dependencies. Bun/Rust compatibility comes through CDP or existing bindings.                                     | Possible independently qualified browser artifact; existing Bun Chrome/Chromium fork remains canonical.                                          |
| [Mullvad Browser](https://github.com/mullvad/mullvad-browser)                  | Rolling source; upstream MPL-2.0 browser                                                              | Firefox/Gecko family, not a Chromium fork. Mullvad VPN egress and browser engine are separate capabilities.                                                                                                                       | Reuse the declared VPN egress owner; do not replace Chromium with this browser as if it were CDP compatible.                                     |

Upstream README performance figures are not Aphrody benchmarks. A Rust package
does not automatically expose Bun FFI, WASM or the same server API.

## Web archive path

[Common Crawl CDXJ](https://commoncrawl.org/cdxj-index) records contain the
archive filename, byte offset/length, original URL, timestamp and digest.
Use a bounded CDX query, validated archive key and bounded HTTP Range read to
retrieve records; preserve timestamp/provenance and extraction limits.
The live [collection list](https://index.commoncrawl.org/collinfo.json) returned
`CC-MAIN-2026-39` (September 2026), covering 2026-09-04 through 2026-09-17,
as its newest collection during this audit. This is archived coverage.

| Rust option                                        | Current crate metadata                                                             | Qualification needed                                                                                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [warc](https://github.com/jedireza/warc)           | [0.4.0](https://crates.io/crates/warc/0.4.0), MIT; last repository push 2024-11-27 | Reads/writes WARC; writer and parser candidates. Verify WARC version, gzip-member handling, record limits, malformed/truncated streams and maintained dependency advisories before adoption. |
| [rust_warc](https://github.com/orottier/rust-warc) | [1.2.0](https://crates.io/crates/rust_warc/1.2.0), MIT; last push 2026-02-06       | Upstream describes a reader. Do not infer a writer, network crawler or replay server from its name.                                                                                          |
| [warcat](https://github.com/chfoo/warcat-rs)       | [0.3.4](https://crates.io/crates/warcat/0.3.4), MPL-2.0; last push 2025-06-02      | WARC tooling/verification candidate; MPL notices and interoperability fixtures needed.                                                                                                       |

Select the smallest archive library satisfying tested read/write requirements
under the existing native owner. None is installed by this document. Existing
Markdown snapshots are not WARC files. Archived public availability does not
waive original-content rights, takedowns or the public export policy.

## Single pipeline and scale gates

1. Seeds/collections declare exact public domains, crawl budgets, depth,
   per-host delay, robots policy and source-policy digest. Disallow private
   address targets, credential-bearing URLs and authenticated browser data.
2. The qualified native crawler owns frontier, fetch, extraction and revision
   metadata. Scope applies before every redirect, robots and sitemap request,
   and before reusing persisted pages. Challenges/refusals terminate or pause
   the provider job. VPN routing changes egress, not access authority.
3. A controlled producer writes immutable, hash-named public snapshots and an
   atomic collection pointer. Publication preserves actual attempted/success/
   failure/pending counts, timestamps and source revision. Collection approval
   and exact host policy are checked independently from a JSON `public` flag.
4. One Bun consumer validates the approved export root, pointer/snapshot SHA,
   policy/owner/source and size/document limits, builds lexical retrieval and
   keeps bounded result caches. ETag describes that public snapshot/result;
   it does not prove HTTP conditional fetch of original documents.
5. Aphrody API/site/CLI delegate to the shared search contract. Live provider
   results and public archived/indexed results expose their distinct source,
   observed time and coverage. Missing production input remains unavailable.
6. Grow beyond the bounded snapshot only with measured corpus size, p95 query
   latency, indexing throughput, memory/storage, multilingual relevance,
   deletion behavior and recovery. Add Tantivy under the same owner and API.
   Add partitioned crawl workers only with durable leases, unique URL claims,
   backpressure, per-host rate limits and crash-recovery proof. Publishing many
   packages is not evidence of web-scale capacity.

Search-completeness work still needs measured multilingual ranking/tokenizers,
safe snippets, canonical URL deduplication, spam policy, freshness, removals,
pagination and query behavior. No current implementation or tested corpus is
claimed to match Google's coverage or relevance.

## Delivery matrix

| Surface        | Canonical integration                                        | Evidence required before public release claim                                                                                                                                 |
| -------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust/Bun CLI   | Existing multicall web/search owner and `bun-google` SDK CLI | Scoped native tests plus rebuilt artifact running real corpus queries on target OS.                                                                                           |
| API and site   | Shared Bun search consumer, thin Aphrody HTTP route, M3 UI   | External HTTPS query with real indexed documents, correct source/freshness, ETag/cache behavior, restart/rollback and unavailable/error behavior.                             |
| FFI            | Existing native bridge/handle owner                          | Stable C ABI, ownership/error/cancellation contracts, native consumer tests; Rust facade alone is insufficient.                                                               |
| npm            | Existing Google/Chromium packages with reviewed export map   | Package tarball installation/import from a clean consumer, matching runtime requirement, registry digest, versioned changes. Do not overwrite immutable releases.             |
| crates.io      | Existing publishable owner crates                            | Publishable dependency closure, target check/test/strict Clippy, packaged crate consumer, checksum and non-yanked registry record.                                            |
| GitHub         | Existing authorized repository/release owner                 | Reviewed exact source commit, licenses/notices, tested target artifacts and hashes. SDK source release and runtime/browser release are separate.                              |
| WASM/browser   | Existing WASM/query adapter owner                            | wasm target build and actual browser tests with bounded public data. Native subprocesses, sockets, filesystem mmap and Chromium cannot be presumed available in browser WASM. |
| VPS production | Existing Workspace/Infra catalogs                            | Reviewed plan before apply, pinned source/artifact/config, scoped public export, health/TLS, real queries and rollback receipt.                                               |

Redis/Postgres/R2 may hold declared public corpus state when explicitly
configured and qualified. Do not select the private home index, Chrome user
data or provider session history as an implicit fallback.

## Reproduction and evidence

Discovery used Context7 `/quickwit-oss/tantivy` and `/cloudflare/pingora`
queries, GitHub connector repository fetches, public GitHub REST
`repos/{owner}/{repo}`, `releases/latest`, `commits?per_page=1`, crates.io
`api/v1/crates/{name}`, Common Crawl collection metadata and bounded local
manifest reads. Context7 excerpts explain APIs; live upstream manifests,
licenses and registries determine versions and publication boundaries.

Observed upstream branch tips (not dependency pins):

| Project            | Observed SHA                               |
| ------------------ | ------------------------------------------ |
| Tantivy            | `6783439906636ad99d1afce07b229f4c26b9e219` |
| Meilisearch        | `9d3365c81607e17ec9df1473f97d5dc9109bb1c4` |
| Quickwit           | `d140cfc4bbcc37b73354a9d0e4f4b1a44639bb04` |
| Sonic              | `852389066101b60cadfdaf60efede0b8dd2dd860` |
| Spider             | `fb0f270d77e19442de59350d9dbbacf52f1804b4` |
| Crawlee            | `dc52c6dffd55682ab836b37d2271e4c3dfad9cfe` |
| Pingora            | `4487f7b2ab50f159e4a2cf4f6a6b813f61bb6e19` |
| Chromiumoxide      | `afcc3a4313f2087249b4490d94e54bf8e3bfaccf` |
| ungoogled-chromium | `ffeb45a2bb88bc56a1dfed31410aeb10e9efcd5a` |

All version, maintenance and collection observations are dated; recheck
selected pins/advisories and exact features before an implementation change.
