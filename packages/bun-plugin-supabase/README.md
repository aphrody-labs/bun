# `@aphrody/bun-plugin-supabase`

A typed PostgreSQL data client for Supabase projects, implemented directly on Bun's native `Bun.SQL` pool. It provides a small `from()` query builder, PostgreSQL function calls, and a transaction-based SQL migration runner.

## Install and connect

```sh
bun add @aphrody/bun-plugin-supabase
```

Use a PostgreSQL connection string from the Supabase dashboard (direct or pooler connection):

```ts
import { createClient } from "@aphrody/bun-plugin-supabase";

type Database = {
  public: {
    Tables: {
      todos: {
        Row: { id: number; title: string; done: boolean };
        Insert: { id?: number; title: string; done?: boolean };
        Update: { title?: string; done?: boolean };
      };
    };
    Views: {};
    Functions: {};
  };
};

const supabase = createClient<Database>({
  connectionString: process.env.SUPABASE_DB_URL!,
  schema: "public",
});

const { data, error } = await supabase
  .from("todos")
  .select("id, title, done")
  .eq("done", false)
  .order("id")
  .limit(50);

if (error) throw new Error(error.message);
await supabase.close();
```

`SUPABASE_DB_URL` may be set instead of passing `connectionString`. The Supabase project URL, anon key, and service-role key are not PostgreSQL credentials and are not accepted as a database connection. Keep connection strings in the application's secret store or environment; never commit them.

## Supported database operations

`from(table)` supports `select`, `insert`, `upsert`, `update`, `delete`, `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is`, `in`, `order`, `limit`, `range`, `single`, and `maybeSingle`. Values are sent as bound parameters. Table, schema, selected-column, filter, ordering, conflict, and RPC identifiers are validated before SQL is generated. Since generated database types do not carry PostgreSQL primary-key metadata, `upsert` requires an explicit `onConflict` column list.

```ts
const inserted = await supabase
  .from("todos")
  .insert({ title: "Review release" })
  .select("id, title")
  .single();
const updated = await supabase
  .from("todos")
  .update({ done: true })
  .eq("id", 3)
  .select()
  .maybeSingle();
const removed = await supabase.from("todos").delete().in("id", [7, 8]).select();
```

Results use `{ data, error, count, status, statusText }`; `count` is `null` because this client does not issue a separate exact-count query. Call `.throwOnError()` when a rejected promise is preferred.

RPC calls execute a PostgreSQL function by name with bound named arguments:

```ts
const { data, error } = await supabase.rpc("complete_todo", { todo_id: 3 });
```

For a set-returning function, pass `{ setof: true }` as the third argument so the result is returned as an array:

```ts
const { data } = await supabase.rpc("open_todos", {}, { setof: true });
```

## SQL migrations

Name files `YYYYMMDDHHMMSS_description.sql`; the runner sorts them, hashes their contents, and records versions in a schema-qualified ledger. Each migration and its ledger entry run in one PostgreSQL transaction under a transaction-scoped advisory lock. Applied files are checked for name and checksum drift.

```ts
import { applyMigrations } from "@aphrody/bun-plugin-supabase/migrations";

const report = await applyMigrations(supabase.sql, {
  directory: `${import.meta.dir}/migrations`,
  schema: "public",
});
console.log(`Applied ${report.applied.length} migrations`);
```

Use a database role with migration privileges for this runner. Store migrations as source controlled SQL and review them as database changes.

## Compatibility boundary

This package talks PostgreSQL directly. It does not implement the Supabase REST/PostgREST protocol, auth, storage, realtime, edge functions, generated REST filters, or Supabase client session behavior. A direct database role does not inherit the JWT claims or role switching that Supabase's API applies to requests; configure PostgreSQL roles and row-level security for the actual direct connection. This package deliberately does not accept or store provider keys.

The package uses Bun's native PostgreSQL SQL client and requires Bun 1.4 or newer. It is not a drop-in replacement for `@supabase/supabase-js`.
