# Static route pattern pooled scratch qualification

2026-10-10, source base 8bd1157856c8f7a24743491534771cb0ccea2bfb.

Static generation owns an existing RAII path-pool guard instead of an inline path array. The reverse-writing cursor starts at the same capacity; only bytes written by prepend operations are exposed. The guard returns storage on normal and error exits. No filesystem probe is added; allocation throughput is unmeasured.

Changed MSVC14.44 debug engine, four jobs/link threads and full symbols: production and framework-router suites pass 49 tests, zero failures, 136 assertions in 17.89 seconds. These exercise actual static HTML generation, sourcemaps, route discovery, client components, escaped Flight data and prerendering with a WebSocket. Two initial runs retained 35 router passes and a production import error: missing filenamify, then source-map. Exact locked versions 6.0.0 and 0.7.4 were linked from the installed workspace store without changing manifests, lockfiles, tests or assertions. The qualified engine hash stayed identical across dependency-only reruns: C0FFA03F1D577F57893F8FDB5C3794D364D0345BAEF546DD93B826199898C8EF.

GNU x64/ARM64 strict bun_runtime Clippy passes. Both MSVC targets retain 12 unrelated errors, down from 13; neither modified source has an error. Global strict qualification remains open. Rust formatting and diff checks pass.

The GNU x64 changed release engine passes the production suite: 14 tests, zero failures, 77 assertions in 2.62 seconds. The initial combined release run could not load the debug-only internal testing module required by framework-router. The dedicated debug build stopped with `No space left on device` before tests; its initial and retry logs are retained. Full Linux native qualification remains open.

React, React DOM, React Refresh and React Server DOM Bun are pinned to 0.0.0-experimental-603e6108-20241029 in a private test cache. Dependencies were prepared outside tests; the VPS cache used the same manifest and frozen lockfile. Runtime tests reuse this cache without registry downloads.

Receipts: tmp/static-pattern-* and VPS owner-linux-qualification. Thirty-two retained root-cache archives were NTFS-compressed under the factory lock with unchanged SHA256 checks, restoring 8.59 GB free before the native Windows build. No deletion or symbol removal was used. Full fork release, matched performance, hardware coverage, private delivery, deployment and provider activation remain open.
