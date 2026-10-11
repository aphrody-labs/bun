export interface TaskServiceOptions {
  task: (signal: AbortSignal) => Promise<unknown>;
  intervalMs: number;
  port?: number;
}

export async function startTaskService(options: TaskServiceOptions) {
  if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs < 50)
    throw new Error("intervalMs must be at least 50");
  const abort = new AbortController();
  let running: Promise<void> | undefined;
  let completedAt: string | null = null;
  let failed = false;
  let shutdown: Promise<void> | undefined;
  const status = () => ({
    running: running !== undefined,
    completedAt,
    failed,
    stopping: abort.signal.aborted,
  });
  const run = () => {
    if (running || abort.signal.aborted) return running ?? Promise.resolve();
    running = Promise.resolve()
      .then(() => options.task(abort.signal))
      .then(
        () => {
          completedAt = new Date().toISOString();
          failed = false;
        },
        () => {
          failed = true;
        },
      )
      .finally(() => {
        running = undefined;
      });
    return running;
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    fetch(request, server) {
      const url = new URL(request.url);
      const origin = request.headers.get("origin");
      if (
        url.hostname !== "127.0.0.1" ||
        Number(url.port || 80) !== server.port ||
        (origin !== null && origin !== url.origin) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      ) {
        return new Response("Host access refused", { status: 403 });
      }
      if (url.pathname !== "/health") return new Response("Not found", { status: 404 });
      return Response.json(status(), {
        status: failed || !completedAt ? 503 : 200,
        headers: { "Cache-Control": "no-store" },
      });
    },
  });
  const timer = setInterval(() => {
    void run();
  }, options.intervalMs);
  void run();
  return {
    server,
    status,
    run,
    stop() {
      return (shutdown ??= (async () => {
        abort.abort();
        clearInterval(timer);
        await server.stop(true);
        await running;
      })());
    },
  };
}
