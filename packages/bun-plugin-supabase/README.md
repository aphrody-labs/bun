# `@aphrody/bun-plugin-supabase`

A typed, server-side PostgreSQL client for Supabase projects, built on Bun's native `Bun.SQL`. It provides a small fluent query builder for tables/views, typed RPC calls, and checksum-verified SQL migrations.

This package is **not** the Supabase JavaScript client, a `Bun.plugin()` module loader, or a replacement for Supabase Auth, Storage, Realtime, Edge Functions, or the PostgREST Data API. It opens a direct PostgreSQL connection. Queries therefore use the PostgreSQL role and privileges in the connection string. PostgREST JWT claims and policies such as `auth.uid()` are not automatically set for a direct connection. Use a least-privilege database role and enforce application authorization on the server; never expose the connection string in browser code.

## Install

```sh
bun add @aphrody/bun-plugin-supabase @aphrody/bun-types
```

## Connect

Use a Supabase PostgreSQL connection string from the project's database settings. The project URL and `anon`/`service_role` API keys are not PostgreSQL credentials.

```ts
import { createClient } from "@aphrody/bun-plugin-supabase";

type Database = {
  public: {
    Tables: {
      items: {
        Row: { id: number; name: string };
        Insert: { name: string };
        Update: { name?: string };
      };
    };
    Functions: {
      item_count: { Args: { category: string }; Returns: number };
    };
  };
};

const db = createClient<Database>({
  connectionString: Bun.env.SUPABASE_DB_URL,
});

const { data, error } = await db
  .from("items")
  .select("id, name")
  .eq("name", "example")
  .order("id")
  .limit(20);

await db.close();
```

`SUPABASE_DB_URL` is the only implicit environment variable. `DATABASE_URL` is intentionally not read, which avoids accidentally connecting this client to a different provider. TLS uses certificate and hostname verification (`sslmode=verify-full`). Supabase pooler connections default to `prepare: false`; prepared statements are rejected when explicitly enabled with a pooler URL.

The result shape (`{ data, error, count, status, statusText }`) is intentionally familiar to Supabase users. It does not imply PostgREST behavior or support every PostgREST filter/representation option. Filters and values are parameterized; table, column, schema, and RPC identifiers are validated and quoted.

## Migrations

```ts
import { applyMigrations } from "@aphrody/bun-plugin-supabase/migrations";

const report = await applyMigrations(db.sql, { directory: "./supabase/migrations" });
console.log(`Applied ${report.applied.length} migrations`);
```

Files must use `YYYYMMDDHHMMSS_name.sql`. Each migration and its ledger update run in a transaction under a PostgreSQL advisory lock. A checksum mismatch for an already applied version fails closed. Review migration SQL before running it against a production database.

## Validation

The test suite uses a fake SQL executor and temporary local migration files; it does not connect to a Supabase project or require credentials.
