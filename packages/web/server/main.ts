// Entry point: `bun packages/web/server/main.ts` (assets from APHRODY_ASSETS_DIR) or the binary from build.ts.
import { loadConfig } from "./config.ts";
import { createAphrodyServer } from "./server.ts";

export function main(embedded: Record<string, string> | null = null) {
  const { server, stop } = createAphrodyServer(loadConfig(), embedded);
  console.log(JSON.stringify({ message: "aphrody listening", url: server.url.href }));
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      stop();
      process.exit(0);
    });
}

if (import.meta.main) main();
