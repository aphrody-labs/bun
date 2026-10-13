/** Server-side access to the exact TypeSafe environment name; never searches files or credential targets. */
export async function withTypesafeEnvironment<T>(
  callback: () => Promise<T>,
): Promise<{ source: "process" | "windows-user" | "windows-machine"; result: T } | { source: "unavailable" }> {
  const previous = process.env.TYPESAFE_API_KEY;
  if (previous?.trim()) return { source: "process", result: await callback() };
  if (process.platform !== "win32") return { source: "unavailable" };
  const script = `$ErrorActionPreference='Stop';$key=[Environment]::GetEnvironmentVariable('TYPESAFE_API_KEY','User');$source='windows-user';if([String]::IsNullOrWhiteSpace($key)){$key=[Environment]::GetEnvironmentVariable('TYPESAFE_API_KEY','Machine');$source='windows-machine'};if([String]::IsNullOrWhiteSpace($key)){exit 3};[Console]::Write(($source+[char]10+$key))`;
  const child = Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], {
    stdout: "pipe",
    stderr: "ignore",
    windowsHide: true,
    timeout: 10_000,
  });
  let text = "",
    bytes = 0;
  try {
    const decoder = new TextDecoder();
    for await (const chunk of child.stdout) {
      bytes += chunk.byteLength;
      if (bytes > 8192) {
        child.kill();
        throw new Error("TypeSafe environment value exceeded its bound");
      }
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
    const code = await child.exited;
    if (code === 3) return { source: "unavailable" };
    if (code !== 0) throw new Error("TypeSafe environment owner read failed");
    const newline = text.indexOf("\n"),
      source = text.slice(0, newline),
      key = text.slice(newline + 1).trim();
    if (!["windows-user", "windows-machine"].includes(source) || !key || /[\s\0]/.test(key))
      throw new Error("TypeSafe environment value is invalid");
    process.env.TYPESAFE_API_KEY = key;
    return { source: source as "windows-user" | "windows-machine", result: await callback() };
  } finally {
    text = "";
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
  }
}
