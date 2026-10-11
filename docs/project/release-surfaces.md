# Release source, graph and cache

`bun run release:surfaces --out <absolute-directory>` reads an immutable Git revision (`--ref`, default `HEAD`). It catalogs every tracked blob in `monorepo.sqlite`, stores readable source text, groups files into domains and resolves relative references between domains. Protected paths and binary files retain metadata only. The snapshot consumed by the plugin and documentation generators is materialized from SQLite, preserving source hashes.

Native `bun:graph-index` extracts symbols and edges from `src` and `packages`. Its per-domain coverage distinguishes parsed inputs, unsupported languages, unresolved calls and metadata-only files. C/C++ and vendored code are catalogued as source text; the native index does not promise a complete C/C++ call graph. Relative-reference edges are file references, not runtime call evidence. Domain Markdown, MDX, HTML, JSON and skills are generated with explicit row limits and truncation metadata. The site exposes this network at `/graph/`.

The output includes the root README, GitHub repository metadata, provider plugin bundles, the static site, SQLite database, graph exports and a SHA-256 artifact manifest. Version and module names come from the source database. Published executable information is captured from actual GitHub releases; `--offline` omits that inventory. A source version is never treated as proof of a released binary. `--apply` updates only README.md and .github/release-source.json. Commit generator changes first, generate from that commit, then commit the generated files with their explicit input revision.

## Redis cache

`scripts/aphrody/deploy/docker/release-cache.yaml` declares a dedicated loopback-only cache on port 6388, with 8 GiB maximum Redis data memory and a 10 GiB container limit. LFU eviction bounds growth; this disposable cache has no AOF or snapshot persistence. SQLite and generated artifacts remain authoritative. It does not replace any existing Redis service or protected store. Configure a different limit only after reviewing host capacity.

Set `BUN_RELEASE_REDIS_URL` in the protected runtime environment and run `bun scripts/aphrody/release-cache.ts <artifact-directory>` to warm source and generated-document keys. Keys include the immutable source SHA and expire after seven days. Credentials are never written into manifests. No FLUSH or global CONFIG mutations are performed. Cached source is restricted to the readable tracked sources recorded by the graph builder.

Redis eviction behavior follows the [official Redis documentation](https://redis.io/docs/latest/develop/reference/eviction/).

`bun scripts/aphrody/release-server.ts <artifact-directory>` serves the generated site, plugin files and graph search through Redis, with a disk/SQLite fallback when Redis is unavailable. It binds only to 127.0.0.1:8798 by default (`BUN_RELEASE_PORT` overrides this port). `/graph/api/status` reports the source revision and `/graph/api/search?q=...` searches the SQLite file inventory with a 100-row ceiling. Configure the existing site reverse proxy only after its host plan and configuration validate.

## Deployment

Inspect host state and render the Compose plan before applying through `aphrody infra ssh exec --host vps|dbfr`. Preserve concurrent work in remote checkouts. Deploy the generated site to a new directory under the configured site's releases, verify hashes, then switch the current symlink atomically. Keep the previous release for rollback. Copy the SQLite graph and plugin bundles to the dedicated release artifact directory, then warm the dedicated cache. Verify HTTP content, graph revision, plugin manifests, Redis readiness and cached-source reads before reporting activation.
