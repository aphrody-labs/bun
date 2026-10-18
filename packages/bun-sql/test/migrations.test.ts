import { expect, test } from "bun:test";
import { applyMigrations as applyNeonMigrations } from "../src/neon/migrations";
import { applyMigrations as applySupabaseMigrations } from "../src/supabase/migrations";
import type { SqlMigrationExecutor } from "../src/migrations";

for (const [provider, applyMigrations, cast] of [
  ["neon", applyNeonMigrations, ""],
  ["supabase", applySupabaseMigrations, "::bigint"],
] as const) {
  test(`${provider} migrations preserve provider ledger, lock and custom options`, async () => {
    const statements: { query: string; parameters: readonly unknown[] }[] = [];
    const sql: SqlMigrationExecutor = {
      async unsafe<T extends Record<string, unknown>>(query: string, parameters: readonly unknown[] = []) {
        statements.push({ query, parameters });
        return [] as T[];
      },
      async begin(callback) {
        return callback(sql);
      },
    };
    const directory = `${import.meta.dir}/neon/fixtures/migrations`;
    const first = await applyMigrations(sql, { directory });
    expect(first.applied).toHaveLength(1);
    expect(statements[0]).toEqual({
      query: `SELECT pg_advisory_xact_lock(hashtext($1)${cast})`,
      parameters: [`@aphrody/bun-plugin-${provider}:public:_bun_${provider}_migrations`],
    });
    expect(statements[1]!.query).toContain(`CREATE TABLE IF NOT EXISTS "public"."_bun_${provider}_migrations"`);
    statements.length = 0;
    await applyMigrations(sql, { directory, schema: "audit", table: "history", lockKey: "shared-lock" });
    expect(statements[0]!.parameters).toEqual(["shared-lock"]);
    expect(statements[1]!.query).toContain('"audit"."history"');
    statements.length = 0;
    await expect(applyMigrations(sql, { directory, schema: 'public"; DROP SCHEMA public; --' })).rejects.toThrow(
      "Invalid SQL identifier",
    );
    expect(statements).toEqual([]);
  });
}
