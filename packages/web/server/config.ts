// Configuration: environment variables over an optional JSON file (APHRODY_CONFIG, default ./aphrody.json).
import { existsSync, readFileSync } from "node:fs";

const defaults = {
  APHRODY_HOST: "0.0.0.0",
  APHRODY_PORT: "8080",
  APHRODY_TLS_CERT: "",
  APHRODY_TLS_KEY: "",
  APHRODY_DATA_DIR: "./aphrody-data",
  /** Serve the site from this directory instead of the embedded assets. */
  APHRODY_ASSETS_DIR: "",
  APHRODY_VERSION_TAG: "self-hosted",
  PUBLIC_ORIGIN: "",
  APP_SECRET: "",
  NEON_DATABASE_URL: "",
  TYPESAFE_API_KEY: "",
  /** Another host serving /api/bun/search (for example https://aphrody.app); empty disables the route. */
  BUN_SEARCH_UPSTREAM: "",
  /** OpenAI-compatible endpoint for /api/ai and grounded site answers; empty disables them. */
  AI_BASE_URL: "",
  AI_API_KEY: "",
  AI_MODEL: "",
  YOLO_ENABLED: "false",
  YOLO_QUOTA_QUALIFIED: "false",
  YOLO_ORIGIN_URL: "",
  YOLO_NATIVE_SOURCE: "",
  YOLO_MODEL: "clef-flash",
  YOLO_API_TOKEN: "",
  YOLO_ORIGIN_TOKEN: "",
};
export type AphrodyConfig = typeof defaults;

export function loadConfig(env: Record<string, string | undefined> = process.env): AphrodyConfig {
  const path = env.APHRODY_CONFIG || "aphrody.json";
  let file: Record<string, unknown> = {};
  if (existsSync(path)) file = JSON.parse(readFileSync(path, "utf8"));
  else if (env.APHRODY_CONFIG) throw new Error(`APHRODY_CONFIG ${path} does not exist`);
  const config = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof AphrodyConfig)[]) {
    const value = env[key] ?? file[key];
    if (value !== undefined && value !== null) config[key] = String(value);
  }
  if (!Number.isInteger(Number(config.APHRODY_PORT)) || Number(config.APHRODY_PORT) < 0)
    throw new Error("APHRODY_PORT must be a port number");
  if (!!config.APHRODY_TLS_CERT !== !!config.APHRODY_TLS_KEY)
    throw new Error("APHRODY_TLS_CERT and APHRODY_TLS_KEY must be set together");
  return config;
}
