# Bun site synchronization

`packages/web/site/sync.ts` publishes the public Bun site from immutable
`origin/main`. The same source generates documentation, a SQLite source catalog,
native extracted graph snapshots, the public Neon projection and static Worker
assets. The captured upstream homepage uses Bun's real color tokens and explicit
binary qualification receipts; it does not infer other platforms from the host.

Store a configuration at `~/.aphrody/config/bun-site-sync.json`. Every reference
must be absolute. For example, on the release host:

```json
{
  "checkout": "/home/ubuntu/src/bun",
  "captureRoot": "/home/ubuntu/build/bun-site/capture",
  "runtimeFactFiles": [
    "/home/ubuntu/build/bun-site/windows-runtime.json",
    "/home/ubuntu/build/bun-site/linux-runtime.json"
  ],
  "buildRoot": "/home/ubuntu/build/bun-site/work",
  "ownerConnectionFile": "/home/ubuntu/.aphrody/config/bun-site-neon.url",
  "readerConnectionFile": "/home/ubuntu/.aphrody/config/bun-site-neon-http.url",
  "credentialFile": "/home/ubuntu/.aphrody/private/typesafe.api-key"
}
```

Credentials stay in protected files. The owner connection applies the public
schema migration and advances one snapshot transactionally. The Worker receives
only the qualified `bun_site_http` read-only connection and the private inference credential
through Wrangler's standard input. Existing application secrets are preserved;
this path does not run application D1 migrations.

```sh
bun packages/web/site/sync.ts --dry-run --offline
bun packages/web/site/sync.ts
```

The dry run generates and validates artifacts and the Worker bundle without
publishing Neon data or changing Worker secrets. A real run checks the deployed
public snapshot source. The sanitized receipts `last-sync.json` and
`last-deployment.json` retain source hashes without local credential references.
Changed binary receipts trigger a rebuild even when main is unchanged. Runtime
source revisions remain distinct from documentation and graph source revisions.

The existing `aphrody-site-publish.timer` invokes `auto-publish.sh` every fifteen
minutes. It fetches main, runs the source-pinned script with existing dependencies,
and uses an exclusive publication lock. No Git checkout is reset or cleaned. Its
configuration and captured public assets must already exist on the host.

NGINX, codec portability, browser rendering, GPU execution and authenticated media
providers each require their own native receipts. Site publication does not
qualify those layers or promote an incomplete runtime release.
