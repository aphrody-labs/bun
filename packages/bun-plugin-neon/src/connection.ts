/// <reference types="@aphrody/bun-types" />

export function resolveNeonConnection(value: string | URL | undefined): {
  url: URL;
  pooled: boolean;
} {
  if (!value) throw new Error("NEON_DATABASE_URL is required");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("NEON_DATABASE_URL must be a valid PostgreSQL connection URL");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new TypeError("NEON_DATABASE_URL must use postgres:// or postgresql://");
  }
  if (!url.hostname || url.pathname.length < 2) {
    throw new TypeError("NEON_DATABASE_URL must include a database hostname and name");
  }

  const sslmode = url.searchParams.get("sslmode")?.toLowerCase();
  if (sslmode && !["require", "verify-ca", "verify-full"].includes(sslmode)) {
    throw new TypeError(
      "Neon connections must require TLS; sslmode must be require, verify-ca, or verify-full",
    );
  }

  url.searchParams.set("sslmode", "verify-full");
  return { url, pooled: url.hostname.includes("-pooler.") };
}
