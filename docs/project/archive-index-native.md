# Native archive discovery

The optional `--browser-crawl` build flag exposes `bun crawl` and `Bun.Crawl`.
The default runtime reports `Bun.Crawl.available === false` and rejects work
before reading options or opening stores.

```sh
bun crawl archive-cdx --store ./captures.sqlite --seed https://example.org/ --scope domain --max-pages 10
bun crawl archive-media --store ./items.sqlite --query "nature" --mediatype image --max-pages 10
bun crawl run --store ./pages.sqlite --seed https://example.org/ --concurrency 4
```

```ts
const report = await Bun.Crawl.run({
  action: "archive-media",
  store: "/absolute/path/items.sqlite",
  query: "nature",
  mediaType: "movies",
  maxPages: 10,
  signal: AbortSignal.timeout(30_000),
});
```

JS jobs run off the JavaScript thread. A query-specific guard protects matching
archive checkpoints within one process. Independent queries share SQLite WAL
and a bounded busy timeout, while their HTTP requests can run concurrently.
Page crawling uses frontier leases instead of a whole-store job mutex.
Cancellation drops in-flight work; completed page transactions remain resumable.
SQLite operations have a five-second busy timeout and are not interruptible
mid-statement by the JS signal. Each invocation has a bounded deadline.
No private provider cookie store is imported into these clients.

`bun_browser_crawl::archive` reuses the native browser transport and caller-owned
SQLite connection. It acquires public capture indexes and item metadata, without
downloading archived pages, movies or images. No task starts on module import.

`index_wayback` requests CDX plaintext with the seven official fields, including
`urlkey`. It commits records and `resumeKey` in one transaction per page. Repeated
pages are idempotent; malformed pages roll back their records and checkpoint.
Each invocation accepts 1–1,000 pages, 1–10,000 records per page and an 8 MiB
page-body limit. The query includes endpoint, seed, match scope and page size in
its checkpoint key. Continue with identical options to resume.
The encoded CDX token remains opaque in storage and is form-encoded as a
parameter. IA's Java server retrieves the servlet parameter and explicitly
URL-decodes that token again; pre-decoding it in the client would change literal
percent/plus semantics. A fixture reproduces the documented encoded cursor and
both server decoding stages.

`search_media` exposes bounded Advanced Search pages for `image` or `movies`.
For large item indexes, `index_media` uses `/services/search/v1/scrape` and its
opaque cursor, committing selected metadata and continuation atomically.
Its page size is 100–10,000. Advanced Search sorted paging is limited to 10,000
results; it is not the deep-index route. Archive additions and removals mean a
cursor traversal is not an immutable snapshot.

These routes retain one bounded response page at a time; the current transport
returns a buffered body. CDX records are consumed line by line rather than
collecting the whole index. This is not an HTTP streaming claim. The existing
crawler independently schedules up to 128 concurrent futures and maintains its
persistent frontier; archive cursor traversal remains sequential per query.

Sitemap discovery reads at most 32 previously undiscovered seed hosts per run.
Discovery progress is persisted per allowed-host scope, so later hosts are not
forgotten. Reports include pending hosts. Pending sitemap
URLs and entry offsets live in that same frontier's `sitemap_jobs` table; a run
fetches at most 100 sitemaps and processes at most 50,000 entries. Nested work
survives budget exhaustion. Reports expose `sitemaps_pending`,
`sitemap_entries_processed` and `sitemap_budget_exhausted`; continuing with the
same frontier resumes that work. A changed body hash restarts its entry offset,
with page URLs remaining idempotent. Complete jobs remain complete until the
owner explicitly calls `reset_sitemap` to refresh them.

Reports retain at most 32 page/error details and 8 MiB of detail by default;
totals and dropped-detail counters remain accurate. Page content stays in the
persistent corpus instead of accumulating in daemon RAM.

The pinned `quick-xml` 0.42.0 already exists in the workspace lockfile. Its event
reader handles namespaces, comments, character references and CDATA without
building a document tree, validates the complete XML page and rejects DTDs.
`parse_sitemap_page` returns a continuation offset instead of truncating entries.
The native byte transport recognizes actual gzip bytes, including concatenated
members, with a 16 MiB decoded limit and strict UTF-8. The pinned `flate2` 1.1.10
already exists in the workspace lockfile; no additional crawler library is
introduced. URL sets and indexes retain their existing host filters.

Rust Spider and TypeScript Crawlee provide maintained crawler stacks with
concurrency, sitemap and queue features. Bun already owns those primitives;
adding either would duplicate its scheduler and persistence. No comparable
local benchmark has been run, so this does not establish a fastest library.

Archive-specific candidates were also inspected at their primary sources:
`wayback-rs` v0.7.0 uses MPL-2.0, reqwest 0.12, async-std and fantoccini, which
would introduce a second HTTP/browser stack here. `@agntn/archives` 0.7.2 is MIT
and covers multiple archive providers, but declares Node >=26 and has not been
qualified on this Bun fork. Neither is installed or used by the native route.

Source references: [CDX contract](https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md),
[Advanced Search](https://archive.org/advancedsearch.php),
[IA cursor search](https://doc-tools.readthedocs.io/en/ia-test-gsod/item-search-apis.html),
[Spider source](https://github.com/spider-rs/spider),
[Crawlee source](https://github.com/apify/crawlee).
Candidate manifests: [wayback-rs v0.7.0](https://github.com/travisbrown/wayback-rs/blob/v0.7.0/Cargo.toml),
[archives manifest](https://github.com/agntn/archives/blob/main/package.json).

Local fixture tests cover cursor continuation, transaction rollback, idempotent
item ingestion, mediatype filtering, durable sitemap budgets, XML page offsets
and bounded gzip decoding. VPS gates remain
required; no public corpus was crawled during source implementation.
