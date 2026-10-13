export async function run(argv, options = {}) {
  if (!Bun.Curl.available) {
    const error = new Error("The native curl provider is not enabled in this build");
    error.code = "ERR_CURL_PROVIDER_UNAVAILABLE";
    throw error;
  }
  if (!Array.isArray(argv) || argv.some(value => typeof value !== "string" || value.includes("\0")))
    throw new TypeError("Curl.run argv must be strings without NUL bytes");
  if (options === null || typeof options !== "object") throw new TypeError("Curl.run options must be an object");
  const limit = options.maxOutputBytes ?? 64 * 1024 * 1024;
  const timeout = options.timeout ?? 30_000;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256 * 1024 * 1024)
    throw new RangeError("maxOutputBytes must be between 1 and 268435456");
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2147483647)
    throw new RangeError("timeout must be between 1 and 2147483647 milliseconds");
  for (const key of Object.keys(options)) {
    if (!["maxOutputBytes", "timeout", "signal", "cwd", "env", "stdin"].includes(key))
      throw new TypeError(`Unsupported Curl.run option: ${key}`);
  }
  await using child = Bun.spawn({
    cmd: [process.execPath, "--bun-internal-curl", ...argv],
    stdin: options.stdin ?? "ignore", stdout: "pipe", stderr: "pipe",
    cwd: options.cwd, env: options.env, signal: options.signal, timeout, killSignal: "SIGKILL",
  });
  let total = 0;
  async function collect(stream) {
    const reader = stream.getReader();
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        total += result.value.byteLength;
        if (total > limit) {
          child.kill("SIGKILL");
          const error = new Error("Curl output exceeded maxOutputBytes");
          error.code = "ERR_CURL_OUTPUT_LIMIT";
          throw error;
        }
        chunks.push(result.value);
        length += result.value.byteLength;
      }
      const output = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
      return output;
    } finally { reader.releaseLock(); }
  }
  const results = await Promise.allSettled([collect(child.stdout), collect(child.stderr), child.exited]);
  for (const result of results) if (result.status === "rejected") throw result.reason;
  return { stdout: results[0].value, stderr: results[1].value, exitCode: results[2].value, signalCode: child.signalCode };
}
