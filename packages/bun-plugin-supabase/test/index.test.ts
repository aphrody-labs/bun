import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSupabaseConnection } from "../src/connection";
import { createClient } from "../src/index";
import { applyMigrations } from "../src/migrations";
import type { NativeSql } from "../src/types";

test("Supabase connections require a direct PostgreSQL URL and verified TLS", () => {
  const previous = Bun.env.SUPABASE_DB_URL;
  delete Bun.env.SUPABASE_DB_URL;
  try {
    expect(() => createClient({})).toThrow("SUPABASE_DB_URL");
    expect(() => resolveSupabaseConnection("https://example.supabase.co")).toThrow(
      "PostgreSQL URL",
    );
    expect(() =>
      resolveSupabaseConnection("postgres://user:secret@db.test/app?sslmode=disable"),
    ).toThrow("sslmode=verify-full");

    const direct = resolveSupabaseConnection("postgres://user:secret@db.test/app");
    expect(direct.url.searchParams.get("sslmode")).toBe("verify-full");
    expect(direct.pooled).toBe(false);
    const pooler = resolveSupabaseConnection(
      "postgres://user:secret@aws-0-eu-central-1.pooler.supabase.com/app",
    );
    expect(pooler.pooled).toBe(true);
    expect(() =>
      createClient({
        connectionString: "postgres://user:secret@aws-0-eu-central-1.pooler.supabase.com/app",
        prepare: true,
      }),
    ).toThrow("Prepared statements");
  } finally {
    if (previous === undefined) delete Bun.env.SUPABASE_DB_URL;
    else Bun.env.SUPABASE_DB_URL = previous;
  }
});

type Database = {
  public: {
    Tables: {
      items: {
        Row: { id: number; name: string };
        Insert: { name: string };
        Update: { name?: string };
      };
    };
    Functions: { item_count: { Args: { category: string }; Returns: number } };
  };
};

type Query = { statement: string; parameters: readonly unknown[] };

function fakeSql(onQuery: (query: Query) => Record<string, unknown>[] = () => []) {
  const queries: Query[] = [];
  const sql = {
    async unsafe<T extends Record<string, unknown> = Record<string, unknown>>(
      statement: string,
      parameters: readonly unknown[] = [],
    ): Promise<T[]> {
      queries.push({ statement, parameters });
      return onQuery({ statement, parameters }) as T[];
    },
    async begin<T>(callback: (transaction: NativeSql) => Promise<T>): Promise<T> {
      return callback(sql as unknown as NativeSql);
    },
    async close(): Promise<void> {},
  };
  return { sql: sql as unknown as NativeSql, queries };
}

test("typed fluent queries parameterize values and preserve result envelopes", async () => {
  const fake = fakeSql(() => [{ id: 3, name: "Aphrody" }]);
  const db = createClient<Database>({ sql: fake.sql });
  const result = await db
    .from("items")
    .select("id, name")
    .eq("name", "Aphrody")
    .order("id")
    .limit(5);

  expect(result.error).toBeNull();
  expect(result.data).toEqual([{ id: 3, name: "Aphrody" }]);
  expect(fake.queries[0]?.statement).toContain('WHERE "name" = $1 ORDER BY "id" ASC LIMIT $2');
  expect(fake.queries[0]?.parameters).toEqual(["Aphrody", 5]);
});

test("single cardinality and RPC calls report data without interpolation", async () => {
  const fake = fakeSql(({ statement }) =>
    statement.startsWith('SELECT "public"."item_count"')
      ? [{ result: 7 }]
      : [{ id: 2, name: "item" }],
  );
  const db = createClient<Database>({ sql: fake.sql });
  const item = await db.from("items").select().eq("id", 2).single();
  const count = await db.rpc("item_count", { category: "not interpolated" });

  expect(item.data).toEqual({ id: 2, name: "item" });
  expect(count.data).toBe(7);
  expect(fake.queries[1]?.statement).toBe(
    'SELECT "public"."item_count"("category" := $1) AS "result"',
  );
  expect(fake.queries[1]?.parameters).toEqual(["not interpolated"]);
});

test("migration ledger applies once and rejects edited history", async () => {
  const directory = join(tmpdir(), `bun-supabase-migrations-${randomUUID()}`);
  const applied = new Map<string, { name: string; checksum: string }>();
  const fake = fakeSql(({ statement, parameters }) => {
    if (statement.startsWith("SELECT version")) {
      const row = applied.get(String(parameters[0]));
      return row ? [{ version: parameters[0], ...row }] : [];
    }
    if (statement.startsWith("INSERT INTO") && statement.includes("_bun_supabase_migrations")) {
      applied.set(String(parameters[0]), {
        name: String(parameters[1]),
        checksum: String(parameters[2]),
      });
    }
    return [];
  });

  try {
    await mkdir(directory);
    const migrationPath = join(directory, "20261010120000_create_items.sql");
    await Bun.write(migrationPath, "CREATE TABLE items (id integer PRIMARY KEY);");

    const first = await applyMigrations(fake.sql, { directory });
    const second = await applyMigrations(fake.sql, { directory });
    expect(first.applied).toHaveLength(1);
    expect(second.skipped).toHaveLength(1);

    await Bun.write(migrationPath, "CREATE TABLE items (id bigint PRIMARY KEY);");
    await expect(applyMigrations(fake.sql, { directory })).rejects.toThrow("differs from");
    expect(fake.queries.map((query) => query.statement)).toContain(
      "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
