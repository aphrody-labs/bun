# Bun adapter for M3 app-ui

`@aphrody/bun-m3/site` serves the existing canonical M3 app-ui build through
Bun.serve. It contains no copy of the M3 framework or UI. Pass an explicit
absolute immutable static artifact root, hostname and port. UI compilation
remains with the canonical app-ui owner.

`createM3Site` returns a request handler; `serveM3Site` creates the listener.
Inject the existing `createGooglePublicSearch` from
`@aphrody/bun-google/search` as `search`. The adapter never reads provider
credentials, browser profiles or cookies. Optional `publicCatalog` delegates
existing public catalog APIs to their capability owner.

The anonymous `/api/search` contract matches the current Rust site: GET,
query up to 1024 UTF-8 bytes, web vertical, SafeSearch active, bounded language
and start 0..90, fixed 10 results. Unknown/duplicate parameters are rejected.
Errors remain 400/429/502/504. Owner cancellation/deadline is 20 seconds;
unavailable real Google transport is reported instead of fabricated results.

Static files preserve MIME types, no-cache, HEAD lengths and nosniff. Inner
symlinks, escaping paths, hidden files and unsafe encodings are refused.
Missing document routes fall back to the SPA; APIs and missing assets do not.
`/health` and `/healthz` return 204. `/api/capabilities` reports configured
anonymous search separately from authenticated Google services and unqualified
embedded Chromium/engine parity.
