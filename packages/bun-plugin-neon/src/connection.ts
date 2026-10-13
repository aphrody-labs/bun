export type NeonDestination = {
  expectedHostname?: string;
  expectedDatabase?: string;
  requireDirect?: boolean;
};

export function resolveNeonConnection(
  value: string | URL | undefined,
  destination: NeonDestination = {},
): {
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
    throw new TypeError("Neon connections must require TLS; sslmode must be require, verify-ca, or verify-full");
  }

  const pooled = url.hostname.includes("-pooler.");
  if (destination.expectedHostname && url.hostname !== destination.expectedHostname.toLowerCase()) {
    throw new TypeError("Neon connection hostname does not match the expected destination");
  }
  if (destination.expectedDatabase && decodeURIComponent(url.pathname.slice(1)) !== destination.expectedDatabase) {
    throw new TypeError("Neon connection database does not match the expected destination");
  }
  if (destination.requireDirect && pooled) {
    throw new TypeError("This operation requires a direct Neon endpoint");
  }

  url.searchParams.set("sslmode", "verify-full");
  return { url, pooled };
}
