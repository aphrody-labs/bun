import { neon } from "@neondatabase/serverless";
import { resolveNeonConnection, type NeonDestination } from "./connection";

/** Edge transport; this entrypoint does not import Bun.SQL or migration tooling. */
export function createNeonHTTPClient(options: NeonDestination & { connectionString: string | URL }) {
  const { url } = resolveNeonConnection(options.connectionString, options);
  if (!url.hostname.endsWith(".neon.tech")) throw new TypeError("Neon HTTP transport requires a Neon endpoint");
  const sql = neon(url.href);
  return {
    async query<T extends Record<string, unknown>>(text: string, parameters: readonly unknown[] = []): Promise<T[]> {
      try {
        return (await sql.query(text, [...parameters], {
          fetchOptions: { signal: AbortSignal.timeout(10_000) },
        })) as T[];
      } catch {
        throw new Error("Neon HTTP query failed");
      }
    },
  };
}
