/// <reference types="@aphrody/bun-types" />

import { resolveNeonConnection } from "./connection";
import { applyMigrations, type MigrationOptions, type MigrationReport } from "./migrations";

export { applyMigrations, type MigrationOptions, type MigrationReport };

export type NeonClientOptions = {
  connectionString?: string | URL;
  max?: number;
  idleTimeout?: number;
  connectTimeout?: number;
  prepare?: boolean;
  onconnect?: Bun.SQL.Options["onconnect"];
  onclose?: Bun.SQL.Options["onclose"];
};

export function createNeonClient(options: NeonClientOptions = {}): Bun.SQL {
  const connectionString = options.connectionString ?? Bun.env.NEON_DATABASE_URL;
  const { url, pooled } = resolveNeonConnection(connectionString);
  if (pooled && options.prepare === true) {
    throw new TypeError(
      "Prepared statements are not supported by Neon transaction-pooler endpoints",
    );
  }

  const sqlOptions: Bun.SQL.Options = {
    tls: "verify-full",
    max: options.max ?? 1,
    idleTimeout: options.idleTimeout,
    connectTimeout: options.connectTimeout,
    prepare: options.prepare ?? false,
    onconnect: options.onconnect,
    onclose: options.onclose,
  };
  return new Bun.SQL(url, sqlOptions);
}
