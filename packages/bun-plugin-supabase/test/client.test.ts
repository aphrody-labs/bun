import { describe, expect, test } from "bun:test";
import { createClient, type Database, type NativeSql } from "../src";

type TestDatabase = Database & {
  public: {
    Tables: {
      todos: {
        Row: { id: number; title: string; done: boolean };
        Insert: { id?: number; title: string; done?: boolean };
        Update: { title?: string; done?: boolean };
      };
    };
    Views: {};
    Functions: { open_todos: { Args: Record<string, never>; Returns: { id: number }[] } };
  };
};

class FakeSql implements NativeSql {
  readonly calls: { query: string; parameters?: readonly unknown[] }[] = [];
  rows: Record<string, unknown>[] = [];

  async unsafe<T extends Record<string, unknown>>(query: string, parameters?: readonly unknown[]): Promise<T[]> {
    this.calls.push({ query, parameters });
    return this.rows as T[];
  }

  async begin<T>(callback: (transaction: NativeSql) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async close(): Promise<void> {}
}

describe("Supabase PostgreSQL facade", () => {
  test("does not select a generic DATABASE_URL as the Supabase connection", () => {
    const previousSupabaseUrl = process.env.SUPABASE_DB_URL;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.SUPABASE_DB_URL;
    process.env.DATABASE_URL = "postgres://user:password@shared.test/app";
    try {
      expect(() => createClient()).toThrow("Provide a PostgreSQL connectionString or SUPABASE_DB_URL");
    } finally {
      if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_DB_URL;
      else process.env.SUPABASE_DB_URL = previousSupabaseUrl;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  test("builds a parameterized, schema-qualified select and returns Supabase result shape", async () => {
    const sql = new FakeSql();
    sql.rows = [{ id: 7, title: "ship", done: false }];
    const client = createClient<TestDatabase>({ sql, schema: "public" });
    const result = await client
      .from("todos")
      .select("id, title")
      .eq("title", "x' OR TRUE --")
      .order("id", { ascending: false })
      .range(2, 4);

    expect(result.data).toEqual([{ id: 7, title: "ship", done: false }]);
    expect(result.error).toBeNull();
    expect(sql.calls[0]).toEqual({
      query: 'SELECT "id", "title" FROM "public"."todos" WHERE "title" = $1 ORDER BY "id" DESC LIMIT $2 OFFSET $3',
      parameters: ["x' OR TRUE --", 3, 2],
    });
  });

  test("supports typed writes, returning columns, empty IN and maybeSingle", async () => {
    const sql = new FakeSql();
    sql.rows = [{ id: 2, title: "new", done: false }];
    const client = createClient<TestDatabase>({ sql });

    // @ts-expect-error generated Insert requires a title.
    client.from("todos").insert({ done: true });
    // @ts-expect-error generated Update does not contain this field.
    client.from("todos").update({ completed: true });
    // @ts-expect-error only generated table and view names are accepted.
    client.from("missing_table");

    const inserted = await client.from("todos").insert({ title: "new" }).select("id, title").single();
    expect(inserted.data).toEqual({ id: 2, title: "new", done: false });
    expect(sql.calls[0]).toEqual({
      query: 'INSERT INTO "public"."todos" ("title") VALUES ($1) RETURNING "id", "title"',
      parameters: ["new"],
    });

    sql.rows = [];
    const absent = await client.from("todos").select().eq("id", 10).maybeSingle();
    expect(absent.data).toBeNull();
    expect(absent.error).toBeNull();

    await client.from("todos").select().in("id", []);
    expect(sql.calls[2]?.query).toContain("WHERE FALSE");
  });

  test("rejects unsafe identifiers and reports database failures", async () => {
    const sql = new FakeSql();
    const client = createClient<TestDatabase>({ sql });
    expect(() => client.from('todos"; DROP TABLE todos;--' as "todos")).toThrow("Invalid SQL identifier");
    expect(() => client.from("todos").select("id; DROP TABLE todos")).toThrow("Invalid SQL identifier");

    sql.unsafe = async () => {
      throw Object.assign(new Error("permission denied"), { code: "42501", detail: "role has no grant" });
    };
    const result = await client.from("todos").select();
    expect(result.error).toEqual({ message: "permission denied", code: "42501", details: "role has no grant" });
  });

  test("calls PostgreSQL RPC with bound named arguments", async () => {
    const sql = new FakeSql();
    sql.rows = [{ result: { id: 1 } }, { result: { id: 2 } }];
    const client = createClient<TestDatabase>({ sql });
    const result = await client.rpc("open_todos", {}, { setof: true });
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(sql.calls[0]).toEqual({ query: 'SELECT "public"."open_todos"() AS "result"', parameters: [] });
  });
});
