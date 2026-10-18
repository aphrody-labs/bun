export { resolveSupabaseConnection, type SupabaseConnection } from "./connection";
export { applyMigrations, type MigrationOptions, type MigrationReport } from "./migrations";
import { resolveSupabaseConnection } from "./connection";

export type SupabaseSQLOptions = Bun.SQL.PostgresOrMySQLOptions & { connectionString?: string | URL };

export function createSupabaseSQL(options: SupabaseSQLOptions = {}): Bun.SQL {
  const { connectionString, ...pool } = options;
  const connection = resolveSupabaseConnection(connectionString);
  if (connection.pooled && options.prepare === true) {
    throw new TypeError("Prepared statements must be disabled with Supabase connection poolers");
  }
  return new Bun.SQL(connection.url, { ...pool, tls: "verify-full", max: options.max ?? 1, prepare: options.prepare ?? false });
}
