const { connect } = require("bun:chromium");

function findExecutable(): string | null {
  const configured = process.env.BUN_OBSCURA_PATH;
  if (configured) return Bun.which(configured);
  return Bun.which("aphrody-web");
}

type LaunchOptions = {
  executable?: string;
  timeout?: number;
  signal?: AbortSignal;
  workers?: number;
};

async function launch(options: LaunchOptions = {}) {
  const timeout = options.timeout ?? 10000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2147483647)
    throw new RangeError("timeout must be an integer from 1 to 2147483647 milliseconds");
  const workers = options.workers ?? 1;
  if (!Number.isSafeInteger(workers) || workers < 1 || workers > 64)
    throw new RangeError("workers must be an integer from 1 to 64");
  if (process.platform === "win32" && workers !== 1)
    throw new RangeError(
      "Windows Obscura supports one worker until process-tree shutdown is qualified",
    );
  const { signal } = options;
  signal?.throwIfAborted();
  const executable = options.executable ?? findExecutable();
  if (!executable) throw new Error("Obscura executable not found; set BUN_OBSCURA_PATH");
  const deadline = performance.now() + timeout;
  // The owner CLI requires an explicit port; only a successful CDP handshake establishes readiness.
  const reservation = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      return new Response(null, { status: 404 });
    },
  });
  const port = reservation.port;
  await reservation.stop(true);
  signal?.throwIfAborted();
  const endpoint = `ws://127.0.0.1:${port}/devtools/browser`;
  let proc: Bun.Subprocess<"ignore", "ignore", "ignore"> | undefined;
  let connection: import("bun:chromium").ChromiumConnection | undefined;
  let closing: Promise<void> | undefined;
  let closed = false;
  const close = () =>
    (closing ??= (async () => {
      closed = true;
      signal?.removeEventListener("abort", abort);
      connection?.close();
      if (proc && proc.exitCode === null && proc.signalCode === null) proc.kill();
      if (proc) await proc.exited;
    })());
  const backgroundClose = async () => {
    try {
      await close();
    } catch (error) {
      reportError(error);
    }
  };
  const abort = () => {
    void backgroundClose();
  };
  try {
    proc = Bun.spawn(
      [
        executable,
        "launch",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--workers",
        String(workers),
      ],
      { stdin: "ignore", stdout: "ignore", stderr: "ignore" },
    );
    const child = proc;
    signal?.addEventListener("abort", abort, { once: true });
    signal?.throwIfAborted();
    while (true) {
      signal?.throwIfAborted();
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error("Obscura exited before its CDP endpoint became ready");
      const remaining = deadline - performance.now();
      if (remaining < 1) throw new Error("Obscura CDP endpoint timed out");
      try {
        connection = await connect(endpoint, {
          timeout: Math.max(1, Math.min(250, Math.ceil(remaining))),
          signal,
        });
        break;
      } catch {
        signal?.throwIfAborted();
        const delay = Math.min(10, deadline - performance.now());
        if (delay > 0) await Bun.sleep(delay);
      }
    }
    connection?.close();
    connection = undefined;
    const remaining = Math.floor(deadline - performance.now());
    if (remaining < 1) throw new Error("Obscura CDP endpoint timed out");
    connection = await new Promise<import("bun:chromium").ChromiumConnection>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(new Error("Obscura CDP endpoint timed out"));
      }, remaining);
      const establish = async () => {
        try {
          const value = await connect(endpoint, { timeout, signal });
          if (settled) {
            value.close();
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(value);
        } catch (error) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      };
      void establish();
    });
    signal?.throwIfAborted();
    if (closed || child.exitCode !== null || child.signalCode !== null)
      throw new Error("Obscura exited during its CDP connection handshake");
    const exited = async () => {
      try {
        await child.exited;
        if (!closed) await backgroundClose();
      } catch (error) {
        reportError(error);
      }
    };
    void exited();
    return { connection: connection!, process: child, endpoint, close };
  } catch (error) {
    connection?.close();
    try {
      await close();
    } catch (cleanupError) {
      reportError(cleanupError);
    }
    throw error;
  }
}

export default { connect, findExecutable, launch };
