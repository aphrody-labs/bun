# Bun host tools

Public, opt-in orchestration over Bun's native APIs. No module import scans a
volume, reads credential files, starts services or connects to Redis.

```ts
import { startConnectProxy } from "@aphrody/bun-tools/connect-proxy";
import { indexNtfs, syncNtfs, scanPe, persistPe, publishMetadataCache } from "@aphrody/bun-tools/indexing";

const proxy = await startConnectProxy({
  upstream: { hostname: "127.0.0.1", port: 1080 },
  allowedHosts: ["example.com"],
  port: 0,
});
await proxy.stop();
```

`bun-host <command> --config /absolute/path/config.json` supports `proxy`,
`stream`, `ntfs`, `ntfs-sync`, `pe`, `aliases`, `cache`, `graph`, `resources` and `migrate`.
In this checkout use `bun run packages/bun-tools/src/cli.ts --help`.
Pass absolute paths explicitly for databases, artifacts and source roots.
No private account, domain, volume, model or cache table is selected by default.

`migrate` requires absolute `sourceDbPath` and `destinationDbPath`. It creates a
checked independent copy of a legacy index, preserves archived metadata in that
copy and refuses to overwrite an existing destination. The source remains open
read-only. Use `maxDatabaseBytes` and `maxRows` to bound the operation.
`resources` accepts `dbPath` and an explicit `resources` array.

Example proxy configuration:

```json
{
  "upstream": { "hostname": "127.0.0.1", "port": 1080 },
  "allowedHosts": ["example.com"],
  "allowedPorts": [443],
  "port": 0
}
```

The proxy implements CONNECT over a no-auth SOCKS5 endpoint, restricted to
loopback and an explicit destination allowlist. It supports early tunnel bytes,
absolute handshake deadlines and awaited shutdown. It does not choose a VPN,
country, credentials or SSH forward. Configure those transports separately.

For Windows metadata indexing pass `{ "dbPath": "D:/indexes/host.sqlite",
"drive": "D" }` to `ntfs`, then the same configuration to `ntfs-sync`.
Native volume access needs the rights required by Windows. It never creates a
USN journal. Baseline replacement and per-page checkpoints are transactional;
expired or replaced journals require a fresh baseline. File aliases are collected
only for the explicit `paths` list, with incomplete coverage reported.

For PE indexing pass explicit `root`, `dbPath` and optional limits (`maxFiles`,
`maxFileBytes`, `maxReadBytes`) to `pe`. Optional `apiSetFile` supplies the API-set
schema. The scan skips links and bounds bytes; incomplete scans need explicit
`allowIncomplete` to persist. It stores file hashes, parsed metadata and resolved,
ambiguous or missing imports. It reads only the PE candidates in the chosen root.

Cache publication requires `dbPath`, `artifactRoot`, `redisUrl`, `tables` and
`namespace`. Select metadata-only tables explicitly. Use `chunkRows`, `ttlSeconds`,
`maxRows`, `maxRowBytes`, `maxCompressedBytes`, `maxRedisBytes` and
`publishConcurrency` for your budgets. It verifies generated chunks and live TTL
before publishing the manifest; failed publication preserves the prior manifest.
Redis credentials belong in the user's protected configuration, never examples
or source control. Cache failures do not switch database backends.

`graph` uses native `bun:graph-index` domains (`src`, `src/<domain>`, `packages`,
`packages/<domain>`). `namespace` labels the receipt/artifacts. It does not add
unsupported source surfaces or exclusions to the native API.

Add `intervalMs` and optional `healthPort` to an indexing configuration for an
explicit periodic task service. It serializes runs and waits for the active run
during shutdown. Long native calls finish before shutdown completes.

`stream` publishes Windows system snapshots and event records on loopback.
`channels` defaults to System/Application; Security needs explicit selection.
Event IDs retain 64-bit precision as decimal strings. Cross-site requests and
non-loopback request authorities are rejected. `startTaskService` and
`startSystemStream` return handles with `stop()` for embedding applications.

The existing rclone/rsync asset APIs remain available from the root export.
See NOTICE and the source inventory for the preserved Omar provenance.
