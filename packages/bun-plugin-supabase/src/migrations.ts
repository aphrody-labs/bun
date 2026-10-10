import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { NativeSql } from "./types";

export type MigrationOptions = {
  directory: string;
  schema?: string;
  table?: string;
  lockKey?: string;
};

export type MigrationReport = {
  applied: { version: string; name: string; checksum: string }[];
  skipped: { version: string; name: string; checksum: string }[];
};

type MigrationFile = { version: string; name: string; path: string; sql: string; checksum: string };
type MigrationRow = { version: string; name: string; checksum: string };

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const migrationPattern = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/;

function quoteIdentifier(value: string): string {
  if (!identifierPattern.test(value)) throw new TypeError(`Invalid SQL identifier: ${value}`);
  return `"${value}"`;
}

async function discover(directory: string): Promise<MigrationFile[]> {
  const files: string[] = [];
  for await (const path of new Bun.Glob("*.sql").scan({ cwd: directory, absolute: true, onlyFiles: true }))
    files.push(path);
  files.sort((left, right) => left.localeCompare(right));
  const versions = new Set<string>();
  const migrations: MigrationFile[] = [];
  for (const path of files) {
    const filename = basename(path);
    const match = migrationPattern.exec(filename);
    if (!match) throw new TypeError(`Migration filename must use YYYYMMDDHHMMSS_name.sql: ${filename}`);
    const [, version, name] = match;
    if (versions.has(version!)) throw new TypeError(`Duplicate migration version: ${version}`);
    versions.add(version!);
    const sql = await Bun.file(path).text();
    if (!sql.trim()) throw new TypeError(`Migration is empty: ${filename}`);
    migrations.push({
      version: version!,
      name: name!,
      path,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    });
  }
  return migrations;
}

export async function applyMigrations(sql: NativeSql, options: MigrationOptions): Promise<MigrationReport> {
  if (!options.directory.trim()) throw new TypeError("A migrations directory is required");
  const schema = quoteIdentifier(options.schema ?? "public");
  const tableName = quoteIdentifier(options.table ?? "_bun_supabase_migrations");
  const ledger = `${schema}.${tableName}`;
  const lockKey =
    options.lockKey ??
    `@aphrody/bun-plugin-supabase:${options.schema ?? "public"}:${options.table ?? "_bun_supabase_migrations"}`;
  const migrations = await discover(options.directory);
  const report: MigrationReport = { applied: [], skipped: [] };

  for (const migration of migrations) {
    await sql.begin(async transaction => {
      await transaction.unsafe("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [lockKey]);
      await transaction.unsafe(
        `CREATE TABLE IF NOT EXISTS ${ledger} (version text PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`,
      );
      const rows = await transaction.unsafe<MigrationRow>(
        `SELECT version, name, checksum FROM ${ledger} WHERE version = $1`,
        [migration.version],
      );
      const existing = rows[0];
      if (existing) {
        if (existing.name !== migration.name || existing.checksum !== migration.checksum) {
          throw new Error(`Applied migration ${migration.version} differs from ${migration.path}`);
        }
        report.skipped.push({ version: migration.version, name: migration.name, checksum: migration.checksum });
        return;
      }
      await transaction.unsafe(migration.sql);
      await transaction.unsafe(`INSERT INTO ${ledger} (version, name, checksum) VALUES ($1, $2, $3)`, [
        migration.version,
        migration.name,
        migration.checksum,
      ]);
      report.applied.push({ version: migration.version, name: migration.name, checksum: migration.checksum });
    });
  }
  return report;
}
