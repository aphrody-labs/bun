# @aphrody/bun-sql

Native PostgreSQL connections use `Bun.SQL`. Provider SDKs retain their official APIs and separate entrypoints.

```ts
import { createNeonClient } from "@aphrody/bun-sql/neon";
import { createNeonHTTPClient } from "@aphrody/bun-sql/neon/http";
import { createClient } from "@aphrody/bun-sql/supabase";
import { createSupabaseSQL } from "@aphrody/bun-sql/supabase/sql";
```

`createNeonClient(options)` and `createSupabaseSQL(options)` return the real `Bun.SQL` client. They require PostgreSQL connection URLs, verify TLS and disable prepared statements by default. Provider transaction poolers reject explicitly enabled prepared statements.

The Supabase entrypoint re-exports the official `@supabase/supabase-js` SDK: `createClient(projectUrl, publicKey, options)` provides PostgREST, Auth, Storage, Realtime and Functions. It does not translate the SDK API into PostgreSQL queries. Direct SQL uses database-role privileges; HTTP authorization and PostgreSQL permissions are distinct.

The Neon HTTP entrypoint uses the official `@neondatabase/serverless` SDK. Native connections and migration tooling do not import either HTTP SDK. Neon management helpers are exported by `./neon/api` and `./neon`.

`./neon` and `./supabase/sql` expose `applyMigrations(sql, options)` with their existing provider-specific ledger tables and advisory lock namespaces. The shared engine is exported by `./migrations` and the root alongside `SQL` from `bun`. Existing checksums and migration history remain authoritative.

SDK versions are pinned exactly in package.json. Supabase 2.118.0 was verified against https://registry.npmjs.org/@supabase/supabase-js/latest on 2026-10-18; Neon retains the existing exact 1.2.0 pin. Tests use local HTTP fixtures and lazy SQL constructors, without production credentials.
