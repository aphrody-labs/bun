import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMigrations } from "../src/migrations";
import { createNeonClient } from "../src/index";
import { resolveNeonConnection } from "../src/connection";

test("Neon connections require an explicit PostgreSQL URL and verified TLS", async () => {
  const previous = Bun.env.NEON_DATABASE_URL;
  delete Bun.env.NEON_DATABASE_URL;
  try {
    expect(() => createNeonClient()).toThrow("NEON_DATABASE_URL is required");
    expect(() => resolveNeonConnection("https://example.test/db")).toThrow("postgres://");
    expect(() =>
      resolveNeonConnection("postgres://user:secret@db.test/app?sslmode=disable"),
    ).toThrow("sslmode");
    expect(() => resolveNeonConnection("invalid-secret-value")).toThrow(
      "valid PostgreSQL connection URL",
    );
    expect(() => resolveNeonConnection(undefined)).toThrow("NEON_DATABASE_URL is required");

    const direct = resolveNeonConnection("postgres://user:secret@ep.test.neon.tech/app");
    expect(direct.url.protocol).toBe("postgres:");
    expect(direct.url.searchParams.get("sslmode")).toBe("verify-full");
    expect(direct.pooled).toBe(false);
    const pooler = resolveNeonConnection("postgres://user:secret@ep.test-pooler.neon.tech/app");
    expect(pooler.pooled).toBe(true);
    let error: unknown;
    try {
      resolveNeonConnection("invalid-secret-value");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).not.toContain("invalid-secret-value");
    expect(() =>
      createNeonClient({
        connectionString: "postgres://user:secret@ep.test-pooler.neon.tech/app",
        prepare: true,
      }),
    ).toThrow("Prepared statements");
  } finally {
    if (previous === undefined) delete Bun.env.NEON_DATABASE_URL;
    else Bun.env.NEON_DATABASE_URL = previous;
  }
});

type Seen = { rows: { version: string; name: string; checksum: string }[]; statements: string[] };
type FakeExecutor = {
  begin<T>(callback: (transaction: FakeExecutor) => T | Promise<T>): Promise<T>;
  unsafe<T = unknown>(statement: string, parameters?: readonly unknown[]): PromiseLike<T>;
};

function executor(state: Seen): FakeExecutor {
  const transaction: FakeExecutor = {
    async begin<T>(callback: (transaction: FakeExecutor) => Promise<T>) {
      return callback(transaction);
    },
    async unsafe<T = unknown>(statement: string, parameters: readonly unknown[] = []) {
      state.statements.push(statement);
      if (statement.startsWith("SELECT version")) {
        return state.rows.filter((row) => row.version === parameters[0]) as unknown as T;
      }
      if (statement.startsWith("INSERT INTO") && statement.includes("_bun_neon_migrations")) {
        state.rows.push({
          version: String(parameters[0]),
          name: String(parameters[1]),
          checksum: String(parameters[2]),
        });
      }
      return [] as unknown as T;
    },
  };
  return transaction;
}

test("migrations apply once, skip matching checksums, and reject edited history", async () => {
  const directory = join(tmpdir(), `bun-neon-migrations-${randomUUID()}`);
  try {
    await mkdir(directory);
    const path = join(directory, "20261010120000_create_items.sql");
    await Bun.write(path, "CREATE TABLE items (id integer PRIMARY KEY);");
    const state: Seen = { rows: [], statements: [] };
    const sql = executor(state);

    const applied = await applyMigrations(sql, { directory });
    expect(applied.applied).toHaveLength(1);
    expect(applied.skipped).toHaveLength(0);

    const skipped = await applyMigrations(sql, { directory });
    expect(skipped.applied).toHaveLength(0);
    expect(skipped.skipped).toHaveLength(1);

    await Bun.write(path, "CREATE TABLE items (id bigint PRIMARY KEY);");
    await expect(applyMigrations(sql, { directory })).rejects.toThrow("differs from");
    expect(state.statements).toContain("SELECT pg_advisory_xact_lock(hashtext($1))");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
