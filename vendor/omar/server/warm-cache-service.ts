import { latestReusableManifest, warmCache } from "./warmCache.ts";

const port = 8803;
const intervalMs = 30 * 60 * 1_000;
let running = false;
let lastRun: Record<string, unknown> | null = null;
let lastError: string | null = null;
let startedAt = new Date().toISOString();

async function runOnce() {
  if (running) return;
  running = true;
  try {
    lastRun = (await latestReusableManifest()) ?? await warmCache();
    lastError = lastRun.complete === true ? null : String(lastRun.publish ?? "cache incomplete");
  } catch (error) {
    lastError = (error instanceof Error ? error.message : String(error))
      .replace(/redis:\/\/[^\s"']+/gi, "redis://[redacted]").slice(0, 500);
  } finally {
    running = false;
  }
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const healthy = !lastError && (running || lastRun?.complete === true);
      return Response.json({
        status: healthy ? "ok" : "degraded",
        service: "warm-cache",
        running,
        startedAt,
        lastGeneration: lastRun?.generation ?? null,
        lastCompletedAt: lastRun?.publishedAt ?? null,
        lastError,
      }, { status: healthy ? 200 : 503 });
    }
    if (url.pathname === "/status") {
      return Response.json({ running, startedAt, lastRun, lastError });
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(JSON.stringify({ service: "warm-cache", state: "listening", address: server.url.href }));
void runOnce();
const timer = setInterval(() => void runOnce(), intervalMs);
process.on("SIGINT", () => { clearInterval(timer); server.stop(); process.exit(0); });
process.on("SIGTERM", () => { clearInterval(timer); server.stop(); process.exit(0); });
