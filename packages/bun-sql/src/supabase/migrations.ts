import { applySqlMigrations, type MigrationOptions, type MigrationReport, type SqlMigrationExecutor } from "../migrations";

export type { MigrationOptions, MigrationReport };

export function applyMigrations(sql: SqlMigrationExecutor, options: MigrationOptions): Promise<MigrationReport> {
  return applySqlMigrations(sql, options, {
    table: "_bun_supabase_migrations",
    lockPrefix: "@aphrody/bun-plugin-supabase",
    advisoryLockSql: "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
  });
}
