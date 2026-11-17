// Configuration of the mirror gate: mirror.toml with environment overrides. Nothing here names a host
// or an account that is not in the file or the environment.
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  origin: { url: string; sitemap: string; user_agent: string; asset_extensions: string[]; strip_script_hosts: string[] };
  crawl: { concurrency: number; delay_ms: number; timeout_ms: number; retries: number; max_age_hours: number };
  upstream: { url: string; branch: string; remote: string };
  compare: { docs: string[]; types: string[]; docs_prefix: string; allow_missing_types: string[] };
  site: { host: string; passthrough: boolean };
  store: { dir: string };
  repo: string;
}

export const repoRoot = join(import.meta.dir, "..", "..");

export async function loadConfig(env: Record<string, string | undefined> = Bun.env): Promise<Config> {
  const cfg = Bun.TOML.parse(await Bun.file(join(import.meta.dir, "mirror.toml")).text()) as unknown as Config;
  cfg.origin.url = (env.MIRROR_ORIGIN ?? cfg.origin.url).replace(/\/+$/, "");
  cfg.origin.user_agent = env.MIRROR_USER_AGENT ?? cfg.origin.user_agent;
  cfg.crawl.concurrency = Number(env.MIRROR_CONCURRENCY ?? cfg.crawl.concurrency);
  cfg.upstream.url = env.MIRROR_UPSTREAM_URL ?? cfg.upstream.url;
  cfg.site.host = env.MIRROR_HOST ?? cfg.site.host;
  cfg.store.dir = env.MIRROR_DIR || cfg.store.dir || join(env.BUN_INSTALL ?? join(homedir(), ".bun"), ".cache", "bun-mirror");
  cfg.repo = env.MIRROR_REPO ?? repoRoot;
  return cfg;
}

export const sha256 = (data: string | Uint8Array | ArrayBuffer): string => new Bun.CryptoHasher("sha256").update(data).digest("hex");
