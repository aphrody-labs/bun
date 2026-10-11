// Cloudflare REST API through the official `cloudflare` SDK, with credentials read from the environment.
import Cloudflare, { type ClientOptions } from "cloudflare";

export { Cloudflare };

export type Credentials = { apiToken?: string; apiKey?: string; apiEmail?: string; accountId?: string };

/** Reads CLOUDFLARE_API_TOKEN, or CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL, and CLOUDFLARE_ACCOUNT_ID. */
export function credentialsFromEnv(env: Record<string, string | undefined> = process.env): Credentials {
  return {
    apiToken: env.CLOUDFLARE_API_TOKEN || undefined,
    apiKey: env.CLOUDFLARE_API_KEY || undefined,
    apiEmail: env.CLOUDFLARE_EMAIL || undefined,
    accountId: env.CLOUDFLARE_ACCOUNT_ID || undefined,
  };
}

export function hasCredentials(credentials: Credentials = credentialsFromEnv()): boolean {
  return Boolean(credentials.apiToken || (credentials.apiKey && credentials.apiEmail));
}

/** A REST client; throws when no credentials are configured rather than sending unauthenticated requests. */
export function createClient(options: ClientOptions & { credentials?: Credentials } = {}): Cloudflare {
  const { credentials = credentialsFromEnv(), ...rest } = options;
  if (!rest.apiToken && !rest.apiKey && !hasCredentials(credentials))
    throw new Error(
      "Cloudflare credentials missing: set CLOUDFLARE_API_TOKEN (or CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL)",
    );
  return new Cloudflare({
    apiToken: credentials.apiToken ?? null,
    apiKey: credentials.apiKey ?? null,
    apiEmail: credentials.apiEmail ?? null,
    ...rest,
  });
}

/** Verifies the configured API token (`GET /user/tokens/verify`). */
export async function verifyToken(client: Cloudflare = createClient()) {
  return client.user.tokens.verify();
}
