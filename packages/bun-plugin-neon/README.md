# @aphrody/bun-plugin-neon

Use Neon PostgreSQL from a Bun server through Bun's native `Bun.SQL` driver.
This package is a Bun database integration library; it does not register a
module loader with `Bun.plugin()` and does not replace Neon's HTTP/WebSocket
serverless driver.

```sh
bun add @aphrody/bun-plugin-neon @aphrody/bun-types
```

Set `NEON_DATABASE_URL` from the Neon Connect panel, or pass the connection
string directly. The helper requires PostgreSQL over TLS with hostname and
certificate verification. It defaults to one pooled connection and disabled
prepared statements, which also works with Neon pooler endpoints.

```ts
import { createNeonClient } from "@aphrody/bun-plugin-neon";

const sql = createNeonClient();

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
use Neon's official `@neondatabase/serverless` driver instead.

## Migrations

`applyMigrations` uses Bun.Glob, SHA-256 checksums, a transaction-scoped
PostgreSQL advisory lock, and a ledger table. Files must be named
`YYYYMMDDHHMMSS_name.sql`; changing an already-applied migration fails closed.

```ts
import { applyMigrations, createNeonClient } from "@aphrody/bun-plugin-neon";

const sql = createNeonClient();
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
