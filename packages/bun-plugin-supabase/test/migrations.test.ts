import { describe, expect, test } from "bun:test";
import { applyMigrations } from "../src/migrations";
import type { NativeSql } from "../src/types";

class MigrationSql implements NativeSql {
  readonly ledger = new Map<string, { version: string; name: string; checksum: string }>();
  readonly executed: string[] = [];

  async unsafe<T extends Record<string, unknown>>(query: string, parameters?: readonly unknown[]): Promise<T[]> {
    if (query.startsWith("SELECT version, name, checksum FROM")) {
      const row = this.ledger.get(String(parameters?.[0]));
      return (row ? [row] : []) as unknown as T[];
    }
    if (query.startsWith("INSERT INTO") && query.includes("_bun_supabase_migrations")) {
      const [version, name, checksum] = parameters as [string, string, string];
      this.ledger.set(version, { version, name, checksum });
      return [];
    }
    if (query.startsWith("CREATE TABLE public.todos") || query.startsWith("ALTER TABLE public.todos"))
      this.executed.push(query);
    return [];
  }

  async begin<T>(callback: (transaction: NativeSql) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async close(): Promise<void> {}
}

describe("SQL migrations", () => {
  test("applies sorted migrations once and verifies their checksums", async () => {
    const sql = new MigrationSql();
    const directory = `${import.meta.dir}/fixtures/migrations`;
    const first = await applyMigrations(sql, { directory });
    const again = await applyMigrations(sql, { directory });

    expect(first.applied.map(({ version }) => version)).toEqual(["20260101000000", "20260101000100"]);
    expect(first.skipped).toEqual([]);
    expect(again.applied).toEqual([]);
    expect(again.skipped).toHaveLength(2);
    expect(sql.executed).toHaveLength(2);
    expect(first.applied.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum))).toBe(true);
  });

  test("rejects a changed file after its version has been recorded", async () => {
    const sql = new MigrationSql();
    sql.ledger.set("20260101000000", { version: "20260101000000", name: "create_todos", checksum: "wrong" });
    await expect(applyMigrations(sql, { directory: `${import.meta.dir}/fixtures/migrations` })).rejects.toThrow(
      "differs",
    );
  });
});
