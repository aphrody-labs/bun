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

/** Private owner configuration; callers must never log this result. Environment values override the file. */
export async function loadCloudflareEnvironment(file?: string): Promise<Record<string, string | undefined>> {
  const home = Bun.env.APHRODY_HOME ?? `${Bun.env.USERPROFILE ?? Bun.env.HOME}/.aphrody`;
  const source = Bun.file(file ?? Bun.env.APHRODY_CLOUDFLARE_ENV ?? `${home}/config/cloudflare.env`);
  const parsed: Record<string, string | undefined> = {};
  if (await source.exists()) {
    for (const line of (await source.text()).split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match) parsed[match[1]!] = match[2]!.replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return { ...parsed, ...Bun.env };
}

/** R2 object data plane uses Bun's native S3 implementation; REST SDK remains the control plane. */
export function createR2Client(options: { bucket: string; env: Record<string, string | undefined> }): Bun.S3Client {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(options.bucket)) throw new TypeError("Invalid R2 bucket");
  const { env } = options;
  const endpoint = env.R2_ENDPOINT;
  const accessKeyId = env.R2_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("R2 object credentials are unavailable");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".r2.cloudflarestorage.com") || url.username || url.password)
    throw new TypeError("R2 endpoint must be the HTTPS Cloudflare object service");
  return new Bun.S3Client({
    endpoint,
    accessKeyId,
    secretAccessKey,
    sessionToken: env.R2_SESSION_TOKEN ?? env.AWS_SESSION_TOKEN ?? env.S3_SESSION_TOKEN,
    bucket: options.bucket,
    region: "auto",
    queueSize: 1,
    retry: 0,
  });
}
