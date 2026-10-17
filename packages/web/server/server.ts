// Self-hostable Aphrody server: the aphrody.app site plus the same routes as the Worker (createAphrodyHandler).
import { createAphrodyHandler } from "../cloudflare/src/core.ts";
import { loadConfig, type AphrodyConfig } from "./config.ts";
import { createPlatform } from "./platform.ts";
import { diskAssets, mapAssets, serveStatic, type AssetSource } from "./static.ts";

const API = /^\/(?:api\/|v1\/|mcp$|a2a$|message:send$)/;

export function createAphrodyServer(config: AphrodyConfig, embedded: Record<string, string> | null = null) {
  const platform = createPlatform(config);
  const handler = createAphrodyHandler(platform);
  const assets: AssetSource | null = config.APHRODY_ASSETS_DIR
    ? diskAssets(config.APHRODY_ASSETS_DIR)
    : embedded
      ? mapAssets(embedded)
      : null;
  const server = Bun.serve({
    hostname: config.APHRODY_HOST,
    port: Number(config.APHRODY_PORT),
    ...(config.APHRODY_TLS_CERT
      ? { tls: { cert: Bun.file(config.APHRODY_TLS_CERT), key: Bun.file(config.APHRODY_TLS_KEY) } }
      : {}),
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (API.test(pathname)) return handler(request);
      if (!assets)
        return new Response("no site assets: set APHRODY_ASSETS_DIR or use the compiled binary", { status: 404 });
      return serveStatic(assets, request);
    },
  });
  return {
    server,
    stop() {
      server.stop(true);
      platform.close();
    },
  };
}
