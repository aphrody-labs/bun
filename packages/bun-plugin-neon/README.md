# @aphrody/bun-plugin-neon

Use Neon PostgreSQL from a Bun server through Bun's native `Bun.SQL` driver.
This package is a Bun database integration library; it does not register a
module loader with `Bun.plugin()` and does not replace Neon's HTTP/WebSocket
serverless driver.

```sh
bun add @aphrody/bun-plugin-neon
```

Set `NEON_DATABASE_URL` from the Neon Connect panel, read it with
`fetchNeonConnectionUri({ database, role })` (uses `NEON_API_KEY` and
`NEON_PROJECT_ID`; database and role are never guessed), or pass the connection
string directly. The helper requires PostgreSQL over TLS with hostname and
certificate verification. It defaults to one pooled connection and disabled
prepared statements, which also works with Neon pooler endpoints.
For deployments with multiple Neon projects, set `expectedHostname` and
`expectedDatabase` to fail closed if a secret points at another product. Set
`requireDirect` for migrations and other session-dependent operations.

In Inagle, pass only its provider-specific configuration and fail closed when
it is missing; do not fall back to RG's Supabase connection:

```ts
import { createNeonClient } from "@aphrody/bun-plugin-neon";

const connectionString = Bun.env.INAGLE_DATABASE_URL ?? Bun.env.NIE_PG_URL;
if (!connectionString)
  throw new Error("Inagle PostgreSQL configuration is required");
const sql = createNeonClient({ connectionString });
```

```ts
import { createNeonClient } from "@aphrody/bun-plugin-neon";

const sql = createNeonClient({
  expectedHostname: "ep-my-app.neon.tech",
  expectedDatabase: "my_app",
});

try {
  const rows = await sql`SELECT now() AS current_time`;
  console.log(rows[0]?.current_time);
} finally {
  await sql.close();
}
```

Use the direct endpoint for migrations and session-dependent work. The helper
keeps credentials out of its errors and never falls back to `DATABASE_URL`.
For serverless and edge runtimes that need Neon HTTP or WebSocket transport,
use the separate HTTP entrypoint backed by Neon's official
`@neondatabase/serverless` driver. It reuses the destination and TLS validation
without importing Bun.SQL or the migration tooling:

```ts
import { createNeonHTTPClient } from "@aphrody/bun-plugin-neon/http";

const sql = createNeonHTTPClient({
  connectionString: env.NEON_DATABASE_URL,
  expectedDatabase: "bun_site",
});
const rows = await sql.query(
  "SELECT id FROM aphrody_site.snapshots WHERE id = $1",
  [id],
);
```

## Migrations

`applyMigrations` uses Bun.Glob, SHA-256 checksums, a transaction-scoped
PostgreSQL advisory lock, and a ledger table. Files must be named
`YYYYMMDDHHMMSS_name.sql`; changing an already-applied migration fails closed.

```ts
import { applyMigrations, createNeonClient } from "@aphrody/bun-plugin-neon";

const sql = createNeonClient({ requireDirect: true });
try {
  const report = await applyMigrations(sql, { directory: "./db/migrations" });
  console.log(`Applied ${report.applied.length} migrations`);
} finally {
  await sql.close();
}
```

Run migrations with a dedicated owner connection. Do not use a public key or
an application role with elevated privileges, and do not run schema changes
from a request handler.
