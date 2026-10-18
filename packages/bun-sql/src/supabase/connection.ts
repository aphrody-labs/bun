export type SupabaseConnection = {
  url: URL;
  pooled: boolean;
};

export function resolveSupabaseConnection(input?: string | URL): SupabaseConnection {
  const value = input ?? Bun.env.SUPABASE_DB_URL;
  if (!value) throw new TypeError("Provide a PostgreSQL connectionString or SUPABASE_DB_URL");

  let url: URL;
  try {
    url = value instanceof URL ? new URL(value) : new URL(value);
  } catch {
    throw new TypeError("connectionString must be a valid PostgreSQL connection URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new TypeError(
      "connectionString must be a PostgreSQL URL; Supabase project URLs and API keys are not SQL credentials",
    );
  }
  if (!url.hostname || url.pathname.length < 2) {
    throw new TypeError("connectionString must include a database hostname and name");
  }
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode && sslmode !== "verify-full") {
    throw new TypeError("Supabase connections require sslmode=verify-full");
  }
  url.searchParams.set("sslmode", "verify-full");

  return {
    url,
    pooled: url.hostname.endsWith(".pooler.supabase.com"),
  };
}
