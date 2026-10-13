export interface ToolRunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export async function runTool(executable: string, args: string[], options: ToolRunOptions = {}) {
  const timeout = options.timeoutMs ?? 120_000;
  const maximum = options.maxOutputBytes ?? 8 * 1024 * 1024;
  if (
    !Number.isSafeInteger(timeout) ||
    timeout < 1 ||
    timeout > 86_400_000 ||
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    maximum > 64 * 1024 * 1024
  )
    throw new RangeError("Invalid tool timeout/output bound");
  options.signal?.throwIfAborted();
  await using child = Bun.spawn([executable, ...args], {
    cwd: options.cwd,
    env: options.env,
    signal: options.signal,
    timeout,
    killSignal: "SIGKILL",
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  let bytes = 0;
  async function capture(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const text: string[] = [];
    try {
      while (true) {
        const value = await reader.read();
        if (value.done) break;
        bytes += value.value.byteLength;
        if (bytes > maximum) throw new Error("Tool output exceeded its byte bound");
        text.push(decoder.decode(value.value, { stream: true }));
      }
      text.push(decoder.decode());
      return text.join("");
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  const pending = [capture(child.stdout), capture(child.stderr), child.exited] as const;
  try {
    const [stdout, stderr, exitCode] = await Promise.all(pending);
    options.signal?.throwIfAborted();
    return { stdout, stderr, exitCode };
  } catch (error) {
    try {
      child.kill("SIGKILL");
    } catch {}
    await Promise.allSettled(pending);
    throw error;
  }
}
