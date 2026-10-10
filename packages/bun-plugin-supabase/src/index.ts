import type {
  Database,
  FunctionArgs,
  FunctionName,
  FunctionReturns,
  InsertOf,
  NativeSql,
  QueryResult,
  RelationName,
  RowOf,
  SupabaseClientOptions,
  SupabaseError,
  SupabaseResult,
  UpdateOf,
} from "./types";
import { resolveSupabaseConnection } from "./connection";

export type {
  Database,
  DatabaseSchema,
  FunctionDefinition,
  FunctionName,
  FunctionArgs,
  FunctionReturns,
  InsertOf,
  Json,
  NativeSql,
  QueryResult,
  RelationName,
  RowOf,
  SupabaseClientOptions,
  SupabaseError,
  SupabaseResult,
  TableDefinition,
  TableName,
  UpdateOf,
  ViewName,
} from "./types";
export { applyMigrations, type MigrationOptions, type MigrationReport } from "./migrations";
export { resolveSupabaseConnection, type SupabaseConnection } from "./connection";

type Operation =
  | { kind: "select"; columns: string }
  | {
      kind: "insert";
      values: Record<string, unknown>[];
      returning: string | false;
      conflict?: string;
      ignoreDuplicates: boolean;
    }
  | { kind: "update"; values: Record<string, unknown>; returning: string | false }
  | { kind: "delete"; returning: string | false };

type Filter = { column: string; operator: string; value: unknown };

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_$]*$/;

function quoteIdentifier(identifier: string): string {
  if (!identifierPattern.test(identifier))
    throw new TypeError(`Invalid SQL identifier: ${identifier}`);
  return `"${identifier}"`;
}

function quoteColumns(columns: string): string {
  if (columns.trim() === "*") return "*";
  return columns
    .split(",")
    .map((column) => {
      const name = column.trim();
      if (name === "*") return name;
      return quoteIdentifier(name);
    })
    .join(", ");
}

function errorFrom(error: unknown): SupabaseError {
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    return {
      message: typeof candidate.message === "string" ? candidate.message : String(error),
      ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
      ...(typeof candidate.detail === "string" ? { details: candidate.detail } : {}),
      ...(typeof candidate.hint === "string" ? { hint: candidate.hint } : {}),
    };
  }
  return { message: String(error) };
}

class Builder<
  Row extends Record<string, unknown>,
  Insert = Partial<Row>,
  Update = Partial<Row>,
> implements PromiseLike<SupabaseResult<Row[] | Row | null>> {
  private operation?: Operation;
  private readonly filters: Filter[] = [];
  private readonly orders: { column: string; ascending: boolean; nullsFirst?: boolean }[] = [];
  private rowLimit?: number;
  private rowOffset?: number;
  private cardinality: "many" | "single" | "maybeSingle" = "many";

  constructor(
    private readonly sql: NativeSql,
    private readonly relation: string,
    private readonly schema: string,
  ) {}

  select(columns = "*"): this {
    if (!this.operation) this.operation = { kind: "select", columns };
    else if (this.operation.kind !== "select") this.operation.returning = columns;
    quoteColumns(columns);
    if (this.operation.kind === "select") this.operation.columns = columns;
    return this;
  }

  insert(values: Insert | Insert[]): this {
    const rows = (Array.isArray(values) ? values : [values]) as unknown as Record<
      string,
      unknown
    >[];
    if (rows.length === 0) throw new TypeError("insert() requires at least one row");
    this.operation = { kind: "insert", values: rows, returning: false, ignoreDuplicates: false };
    return this;
  }

  upsert(
    values: Insert | Insert[],
    options: { onConflict: string; ignoreDuplicates?: boolean },
  ): this {
    if (!options.onConflict.trim()) throw new TypeError("upsert() requires an onConflict column");
    const rows = (Array.isArray(values) ? values : [values]) as unknown as Record<
      string,
      unknown
    >[];
    if (rows.length === 0) throw new TypeError("upsert() requires at least one row");
    this.operation = {
      kind: "insert",
      values: rows,
      returning: false,
      conflict: options.onConflict,
      ignoreDuplicates: options.ignoreDuplicates ?? false,
    };
    return this;
  }

  update(values: Update): this {
    this.operation = {
      kind: "update",
      values: values as Record<string, unknown>,
      returning: false,
    };
    return this;
  }

  delete(): this {
    this.operation = { kind: "delete", returning: false };
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.filter(column, value === null ? "IS" : "=", value);
  }
  neq(column: string, value: unknown): this {
    return this.filter(column, value === null ? "IS NOT" : "<>", value);
  }
  gt(column: string, value: unknown): this {
    return this.filter(column, ">", value);
  }
  gte(column: string, value: unknown): this {
    return this.filter(column, ">=", value);
  }
  lt(column: string, value: unknown): this {
    return this.filter(column, "<", value);
  }
  lte(column: string, value: unknown): this {
    return this.filter(column, "<=", value);
  }
  like(column: string, value: string): this {
    return this.filter(column, "LIKE", value);
  }
  ilike(column: string, value: string): this {
    return this.filter(column, "ILIKE", value);
  }
  is(column: string, value: null | boolean): this {
    return this.filter(column, value === null ? "IS" : "=", value);
  }

  in(column: string, values: readonly unknown[]): this {
    if (values.length === 0)
      this.filters.push({ column: quoteIdentifier(column), operator: "FALSE", value: undefined });
    else this.filters.push({ column: quoteIdentifier(column), operator: "IN", value: [...values] });
    return this;
  }

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}): this {
    this.orders.push({
      column: quoteIdentifier(column),
      ascending: options.ascending ?? true,
      nullsFirst: options.nullsFirst,
    });
    return this;
  }

  limit(count: number): this {
    this.rowLimit = this.integer(count, "limit");
    return this;
  }

  range(from: number, to: number): this {
    this.rowOffset = this.integer(from, "range start");
    this.rowLimit = this.integer(to - from + 1, "range end") || 0;
    if (to < from) throw new RangeError("range end must be greater than or equal to start");
    return this;
  }

  single(): QueryResult<Row> {
    this.cardinality = "single";
    return this as unknown as QueryResult<Row>;
  }

  maybeSingle(): QueryResult<Row | null> {
    this.cardinality = "maybeSingle";
    return this as unknown as QueryResult<Row | null>;
  }

  throwOnError(): Promise<Row[] | Row | null> {
    return this.execute().then((result) => {
      if (result.error) throw Object.assign(new Error(result.error.message), result.error);
      return result.data;
    });
  }

  then<TResult1 = SupabaseResult<Row[] | Row | null>, TResult2 = never>(
    onfulfilled?:
      | ((value: SupabaseResult<Row[] | Row | null>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private filter(column: string, operator: string, value: unknown): this {
    if (value === undefined) throw new TypeError("undefined cannot be used as a filter value");
    this.filters.push({ column: quoteIdentifier(column), operator, value });
    return this;
  }

  private integer(value: number, label: string): number {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new RangeError(`${label} must be a non-negative safe integer`);
    return value;
  }

  private async execute(): Promise<SupabaseResult<Row[] | Row | null>> {
    try {
      if (!this.operation)
        throw new TypeError(
          "Choose select(), insert(), update(), or delete() before awaiting the query",
        );
      const { query, parameters } = this.buildQuery();
      const rows = await this.sql.unsafe<Row>(query, parameters);
      let data: Row[] | Row | null = rows;
      let status = 200;
      if (this.cardinality !== "many") {
        if (rows.length === 1) data = rows[0]!;
        else if (rows.length === 0 && this.cardinality === "maybeSingle") data = null;
        else {
          data = null;
          status = rows.length === 0 ? 406 : 406;
          return {
            data,
            error: { message: rows.length === 0 ? "No rows found" : "Expected at most one row" },
            count: null,
            status,
            statusText: "Not Acceptable",
          };
        }
      } else if (this.operation.kind !== "select" && !this.operation.returning) {
        data = null;
      }
      return { data, error: null, count: null, status, statusText: "OK" };
    } catch (error) {
      return {
        data: null,
        error: errorFrom(error),
        count: null,
        status: 400,
        statusText: "Bad Request",
      };
    }
  }

  private buildQuery(): { query: string; parameters: unknown[] } {
    const operation = this.operation!;
    const relation = `${quoteIdentifier(this.schema)}.${quoteIdentifier(this.relation)}`;
    const parameters: unknown[] = [];
    const bind = (value: unknown): string => {
      parameters.push(value);
      return `$${parameters.length}`;
    };
    let query: string;
    if (operation.kind === "select") {
      query = `SELECT ${quoteColumns(operation.columns)} FROM ${relation}`;
    } else if (operation.kind === "insert") {
      const columns = [...new Set(operation.values.flatMap((row) => Object.keys(row)))].sort();
      if (!columns.length) throw new TypeError("insert() rows must contain at least one column");
      for (const row of operation.values) {
        for (const key of Object.keys(row)) quoteIdentifier(key);
        if (
          Object.keys(row).length !== columns.length ||
          columns.some((column) => !Object.hasOwn(row, column))
        ) {
          throw new TypeError("insert() rows must use the same columns");
        }
      }
      const columnSql = columns.map(quoteIdentifier).join(", ");
      const valueSql = operation.values
        .map((row) => `(${columns.map((column) => bind(row[column])).join(", ")})`)
        .join(", ");
      query = `INSERT INTO ${relation} (${columnSql}) VALUES ${valueSql}`;
      if (operation.conflict) {
        const conflict = operation.conflict
          .split(",")
          .map((column) => quoteIdentifier(column.trim()))
          .join(", ");
        query += ` ON CONFLICT (${conflict}) ${operation.ignoreDuplicates ? "DO NOTHING" : `DO UPDATE SET ${columns.map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(", ")}`}`;
      }
    } else if (operation.kind === "update") {
      const columns = Object.keys(operation.values).sort();
      if (!columns.length) throw new TypeError("update() requires at least one column");
      query = `UPDATE ${relation} SET ${columns.map((column) => `${quoteIdentifier(column)} = ${bind(operation.values[column])}`).join(", ")}`;
    } else {
      query = `DELETE FROM ${relation}`;
    }

    if (this.filters.length) {
      if (operation.kind === "insert")
        throw new TypeError("Filters cannot be used with insert() or upsert()");
      const predicates = this.filters.map((filter) => {
        if (filter.operator === "FALSE") return "FALSE";
        if (filter.operator === "IS" || filter.operator === "IS NOT")
          return `${filter.column} ${filter.operator} ${filter.value === null ? "NULL" : bind(filter.value)}`;
        if (filter.operator === "IN")
          return `${filter.column} IN (${(filter.value as unknown[]).map(bind).join(", ")})`;
        return `${filter.column} ${filter.operator} ${bind(filter.value)}`;
      });
      query += ` WHERE ${predicates.join(" AND ")}`;
    }
    if (this.orders.length) {
      if (operation.kind !== "select")
        throw new TypeError("order() is supported only for select queries");
      query += ` ORDER BY ${this.orders.map((order) => `${order.column} ${order.ascending ? "ASC" : "DESC"}${order.nullsFirst === undefined ? "" : order.nullsFirst ? " NULLS FIRST" : " NULLS LAST"}`).join(", ")}`;
    }
    if (
      (this.rowLimit !== undefined || this.rowOffset !== undefined) &&
      operation.kind !== "select"
    ) {
      throw new TypeError("limit() and range() are supported only for select queries");
    }
    if (this.rowLimit !== undefined) query += ` LIMIT ${bind(this.rowLimit)}`;
    if (this.rowOffset !== undefined) query += ` OFFSET ${bind(this.rowOffset)}`;
    if (operation.kind !== "select" && operation.returning)
      query += ` RETURNING ${quoteColumns(operation.returning)}`;
    return { query, parameters };
  }
}

export class SupabaseClient<DB extends Database = Database, Schema extends string = "public"> {
  readonly sql: NativeSql;
  readonly schema: Schema;

  constructor(options: SupabaseClientOptions & { schema?: Schema }) {
    this.schema = (options.schema ?? "public") as Schema;
    quoteIdentifier(this.schema);
    if (options.sql) this.sql = options.sql;
    else {
      const connection = resolveSupabaseConnection(options.connectionString);
      if (connection.pooled && options.prepare === true) {
        throw new TypeError(
          "Prepared statements must be disabled with Supabase connection poolers",
        );
      }
      const pool: Bun.SQL.Options = {
        tls: "verify-full",
        max: options.max ?? 1,
        idleTimeout: options.idleTimeout,
        connectionTimeout: options.connectionTimeout,
        prepare: options.prepare ?? false,
        onconnect: options.onconnect,
        onclose: options.onclose,
      };
      const native = new Bun.SQL(connection.url, pool);
      this.sql = native as unknown as NativeSql;
    }
  }

  from<Name extends RelationName<DB, Schema> & string>(relation: Name) {
    quoteIdentifier(relation);
    type Row = RowOf<DB, Schema, Name> & Record<string, unknown>;
    type Insert = InsertOf<DB, Schema, Name>;
    type Update = UpdateOf<DB, Schema, Name>;
    return new Builder<Row, Insert, Update>(this.sql, relation, this.schema);
  }

  rpc<Name extends FunctionName<DB, Schema> & string>(
    name: Name,
    args: FunctionArgs<DB, Schema, Name>,
    options: { setof?: boolean } = {},
  ): QueryResult<
    FunctionReturns<DB, Schema, Name> extends unknown[]
      ? FunctionReturns<DB, Schema, Name>[number][]
      : FunctionReturns<DB, Schema, Name>
  > {
    quoteIdentifier(name);
    const argumentEntries = Object.entries(args as Record<string, unknown>);
    const argsSql = argumentEntries
      .map(([key], index) => `${quoteIdentifier(key)} := $${index + 1}`)
      .join(", ");
    const query = `SELECT ${quoteIdentifier(this.schema)}.${quoteIdentifier(name)}(${argsSql}) AS "result"`;
    const result = this.sql
      .unsafe(
        query,
        argumentEntries.map(([, value]) => value),
      )
      .then(
        (rows) => ({
          data: (options.setof
            ? rows.map((row) => row.result)
            : (rows[0]?.result ?? null)) as never,
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        }),
        (error) => ({
          data: null,
          error: errorFrom(error),
          count: null,
          status: 400,
          statusText: "Bad Request",
        }),
      );
    return result as unknown as QueryResult<
      FunctionReturns<DB, Schema, Name> extends unknown[]
        ? FunctionReturns<DB, Schema, Name>[number][]
        : FunctionReturns<DB, Schema, Name>
    >;
  }

  close(options?: { timeout?: number }): Promise<void> {
    return this.sql.close(options);
  }
}

export function createClient<DB extends Database = Database, Schema extends string = "public">(
  options: SupabaseClientOptions & { schema?: Schema },
): SupabaseClient<DB, Schema> {
  return new SupabaseClient<DB, Schema>(options);
}
