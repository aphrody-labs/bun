/// <reference path="../../bun-types/index.d.ts" />

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type TableDefinition<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
};

export type FunctionDefinition<Args, Returns> = {
  Args: Args;
  Returns: Returns;
};

export type DatabaseSchema = {
  Tables?: Record<string, { Row: Record<string, unknown>; Insert?: object; Update?: object }>;
  Views?: Record<string, { Row: Record<string, unknown> }>;
  Functions?: Record<string, { Args: unknown; Returns: unknown }>;
  Enums?: Record<string, string>;
  CompositeTypes?: Record<string, unknown>;
};

export type Database = { public: unknown };

type SchemaOf<DB, Schema extends string> = Schema extends keyof DB ? DB[Schema] : never;
type TableMap<DB, Schema extends string> =
  SchemaOf<DB, Schema> extends { Tables?: infer T } ? T : never;
type ViewMap<DB, Schema extends string> =
  SchemaOf<DB, Schema> extends { Views?: infer V } ? V : never;
type FunctionMap<DB, Schema extends string> =
  SchemaOf<DB, Schema> extends { Functions?: infer F } ? F : never;
type Entry<Map, Name extends PropertyKey> = Name extends keyof Map ? Map[Name] : never;

type KnownOrString<Keys> = [Keys] extends [never] ? string : Extract<Keys, string>;
export type TableName<DB, Schema extends string> = KnownOrString<keyof TableMap<DB, Schema>>;
export type ViewName<DB, Schema extends string> = KnownOrString<keyof ViewMap<DB, Schema>>;
export type RelationName<DB, Schema extends string> = KnownOrString<
  keyof TableMap<DB, Schema> | keyof ViewMap<DB, Schema>
>;
export type RowOf<DB, Schema extends string, Name extends string> =
  Entry<TableMap<DB, Schema>, Name> extends { Row: infer R }
    ? R
    : Entry<ViewMap<DB, Schema>, Name> extends { Row: infer R }
      ? R
      : Record<string, unknown>;
export type InsertOf<DB, Schema extends string, Name extends string> =
  Entry<TableMap<DB, Schema>, Name> extends { Insert: infer I }
    ? I
    : Partial<RowOf<DB, Schema, Name>>;
export type UpdateOf<DB, Schema extends string, Name extends string> =
  Entry<TableMap<DB, Schema>, Name> extends { Update: infer U }
    ? U
    : Partial<RowOf<DB, Schema, Name>>;
export type FunctionName<DB, Schema extends string> = Extract<
  keyof FunctionMap<DB, Schema>,
  string
>;
export type FunctionArgs<DB, Schema extends string, Name extends string> =
  Entry<FunctionMap<DB, Schema>, Name> extends { Args: infer A } ? A : Record<string, unknown>;
export type FunctionReturns<DB, Schema extends string, Name extends string> =
  Entry<FunctionMap<DB, Schema>, Name> extends { Returns: infer R } ? R : unknown;

export type SupabaseError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export type SupabaseResult<T> = {
  data: T | null;
  error: SupabaseError | null;
  count: number | null;
  status: number;
  statusText: string;
};

export type QueryResult<T> = SupabaseResult<T> & PromiseLike<SupabaseResult<T>>;

export type NativeSql = {
  unsafe<T extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    parameters?: readonly unknown[],
  ): Promise<T[]>;
  begin<T>(callback: (transaction: NativeSql) => Promise<T>): Promise<T>;
  close(options?: { timeout?: number }): Promise<void>;
};

export type SupabaseClientOptions = {
  connectionString?: string | URL;
  schema?: string;
  max?: number;
  idleTimeout?: number;
  connectionTimeout?: number;
  prepare?: boolean;
  onconnect?: Bun.SQL.Options["onconnect"];
  onclose?: Bun.SQL.Options["onclose"];
  sql?: NativeSql;
};
