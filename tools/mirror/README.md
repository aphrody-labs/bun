# Mirror gate

One tool, run by the installed `bun` alone (no npm dependency), that:

1. describes the Bun installation that is running: binary, revision, install directory, package cache, global
   packages, and whether `bun.lock` covers every workspace;
2. compares the fork's docs (`md`, `mdx`) and TypeScript declarations with upstream, file by file, and checks the
   fork's docs for broken internal links and bad frontmatter;
3. crawls the origin site from its sitemap into a persistent store, resumably;
4. serves or builds a mirror of that site from the store.

The gate (1 + 2, plus docs coverage against the sitemap once one has been read) runs before `bun bd`,
`bun run rust:check` and `bun run rust:clippy`. It fails on what the fork must fix: a workspace missing from the
lockfile, an upstream declaration the fork's types no longer carry, a broken link or bad frontmatter in a docs file
the fork added or changed. Its report is keyed by the hash of everything it read, so an unchanged tree answers from
the cache.

```sh
bun test ./tools/mirror              # the whole system against a local origin (hermetic)
bun run mirror:gate                  # the gate on this checkout
bun run mirror:gate --live --json    # also read the origin's sitemap; full report
bun run mirror:crawl                 # crawl the sitemap (resumes; revalidates with ETag after 24 h)
bun run mirror:crawl --limit=500 --match='/docs/**'
bun tools/mirror/cli.ts status | search <words> | serve --port=3000 | build <dir> | publish <dir>
```

## Store

| Tier | When | Holds |
| --- | --- | --- |
| SQLite (`bun:sqlite`) | always | page index and crawl journal, key-value cache, runs, full-text search (FTS5) |
| disk | always | content-addressed blobs (`sha256`), zstd-compressed, verified on read |
| S3 or R2 (`Bun.S3Client`) | `MIRROR_S3_BUCKET` | the same blobs, shared between machines; the published site |
| Postgres (`Bun.SQL`) | `MIRROR_POSTGRES_URL` | the page index, so another machine resumes the same crawl |
| Redis (`Bun.RedisClient`) | `MIRROR_REDIS_URL` | hot key-value cache and the crawl lock |

S3 credentials and endpoint come from the usual `S3_*` / `AWS_*` variables. The store directory is `MIRROR_DIR`, by
default `<BUN_INSTALL>/.cache/bun-mirror`. A tier that is not configured is absent; `status` lists the live ones.

## Reproducibility

- The sitemap is reduced to sorted, unique, normalized same-origin URLs.
- A crawl is identified by its manifest: every stored URL with the `sha256` of its content, sorted, then hashed.
  Interrupting and resuming a crawl, or crawling from another machine, ends on the same manifest for the same origin
  content.
- `build` writes the same bytes for the same manifest (the test builds twice and compares the tree hash).
- Pages are rewritten when served or built, never when stored: the store keeps the origin's bytes.

## Mirror host

`mirror.toml` `[site] host` (or `MIRROR_HOST`) is empty by default: origin links become root-relative, so the mirror
works under any host name. With a host, links and the canonical URL point at it. No DNS record is created by this
tool.

## Files

`config.ts` configuration · `store.ts` tiers · `sitemap.ts` sitemap reader · `crawl.ts` + `crawl.worker.ts` crawler
(Workers) · `html.ts` HTMLRewriter passes · `install.ts` installation inventory · `docs.ts` fork versus upstream ·
`gate.ts` the gate · `site.ts` server, static build, publish · `cli.ts` commands · `mirror.test.ts` the test.
