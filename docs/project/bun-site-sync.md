# Bun site synchronization

`packages/bun-ui/packages/web/site/sync.ts` publishes the public Bun site from immutable
`origin/main`. The same source generates documentation, a SQLite source catalog,
native extracted graph snapshots, the public Neon projection and static Worker
assets. The captured upstream homepage retains Bun's components, stylesheets,
fonts and assets, with the Aphrody logo and canonical M3 semantic roles. Fork
capabilities are a separate island outside upstream React hydration. Original
and adapted bytes have separate hashes; analytics from upstream remain inert.
Explicit binary receipts never infer other platforms from the host.

For a fresh homepage capture, use the native Web owner with bounded acquisition:

```sh
aphrody web mirror https://bun.com/ <capture> --max-pages 1 --max-assets 128 --max-depth 0 --concurrency 2 --delay-ms 300 --allowed-domains bun.com --resolve-cdns false --json
```

The first capture does not necessarily include lazy modules. Browser qualification
must exercise search and mobile navigation. Acquire observed missing same-origin
module dependencies with `scripts/aphrody/site-mirror/capture-module-closure.ts`;
it retains the native capture's byte counts and BLAKE3 receipts. Homepage builds
fail closed when the upstream logo component changes, rather than silently
restoring Bun branding after hydration.

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
bun packages/bun-ui/packages/web/site/sync.ts --dry-run --offline
bun packages/bun-ui/packages/web/site/sync.ts
```

The dry run generates and validates artifacts and the Worker bundle without
publishing Neon data or changing Worker secrets. A real run checks the deployed
public snapshot source. The sanitized receipts `last-sync.json` and
`last-deployment.json` retain source hashes without local credential references.
Changed binary receipts trigger a rebuild even when main is unchanged. Runtime
source revisions remain distinct from documentation and graph source revisions.

When provisioned and enabled on a release host, `aphrody-site-publish.timer`
invokes `auto-publish.sh` every fifteen minutes. It fetches main, runs the source-pinned script with existing dependencies,
and uses an exclusive publication lock. No Git checkout is reset or cleaned. Its
configuration and captured public assets must already exist on the host.

## Source-derived guides and blog dossiers

`editorial-generate.ts` uses the existing protected Aphrody inference credential and
read-only public Neon connection. The application SDK owns authentication and
HTTP; the native `bun:yolo.inspect` owner validates every structured response.
Neither the Worker nor static browser assets import that native adapter or keys.
Bun's typed decision layer judges relevance, injection and evidence support, not free-form authorship.
The resulting French dossiers disclose their source-derived assembly and retain
literal excerpts, document hashes and the immutable documentation/graph snapshot.

```sh
bun packages/bun-ui/packages/web/site/editorial-generate.ts --source <published-source-sha> --snapshot <public-snapshot-sha256> --out <new-absolute-directory>
```

Defaults resolve protected references below `APHRODY_HOME` or the current user's
`.aphrody`: `config/bun-site-neon-http.url` and `private/typesafe.api-key`.
Explicit `--database-url-file` and `--api-key-file` select references, never values.
The batch is limited to four topics and sixteen structured requests, with no
model fallback. All topics must pass before any output is created. A stale public
snapshot, invalid response, unsupported citation, cancellation or failed grounding
rejects publication; source assembly does not qualify runtime behavior.

NGINX, codec portability, browser rendering, GPU execution and authenticated media
providers each require their own native receipts. Site publication does not
qualify those layers or promote an incomplete runtime release.
