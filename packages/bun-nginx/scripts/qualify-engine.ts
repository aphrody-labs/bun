// This gate invokes the selected real NGINX engine; the native Bun controller is separate.
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { setImmediate } from "node:timers/promises";

export async function qualifyEngine(binary: string, receiptPath: string) {
  if (!isAbsolute(binary) || !isAbsolute(receiptPath)) throw new Error("Engine and receipt paths must be absolute");
  const file = Bun.file(binary);
  if (file.size > 64 << 20) throw new Error("NGINX executable exceeds its qualification bound");
  const bytes = await file.bytes();
  const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: string, architecture: string;
  if (bytes.length >= 64 && bytes[0] === 77 && bytes[1] === 90) {
    const pe = view.getUint32(0x3c, true);
    if (pe + 6 > bytes.length || view.getUint32(pe, true) !== 0x4550) throw new Error("Invalid NGINX PE image");
    const machine = view.getUint16(pe + 4, true);
    format = "PE";
    architecture = machine === 332 ? "x86" : machine === 34404 ? "x64" : machine === 43620 ? "arm64" : "unknown";
  } else if (bytes.length >= 20 && bytes[0] === 127 && bytes[1] === 69 && bytes[2] === 76 && bytes[3] === 70) {
    const machine = view.getUint16(18, bytes[5] === 1);
    format = "ELF";
    architecture = machine === 62 ? "x64" : machine === 183 ? "arm64" : machine === 3 ? "x86" : "unknown";
  } else throw new Error("This engine gate accepts PE and ELF providers");
  const store = resolve(dirname(receiptPath)),
    prefix = await mkdtemp(join(store, "engine-gate-"));
  const config = join(prefix, "nginx.conf"),
    pidFile = join(prefix, "bun-nginx.pid"),
    forward = (path: string) => path.replaceAll("\\", "/");
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("reserve") });
  const port = reservation.port;
  reservation.stop(true);
  const configuration = (text: string) =>
    `worker_processes 1; error_log stderr; lock_file "${forward(join(prefix, "nginx.lock"))}"; events { worker_connections 32; } http { access_log off; ${["client_body", "proxy", "fastcgi", "uwsgi", "scgi"].map(name => `${name}_temp_path "${forward(join(prefix, name + "-temp"))}";`).join(" ")} server { listen 127.0.0.1:${port}; location = /version { return 200 "${text}"; } location = /payload { alias "${forward(join(prefix, "payload.txt"))}"; } } }`;
  const args = [
    "-p",
    forward(prefix),
    "-c",
    forward(config),
    "-e",
    "stderr",
    "-g",
    `daemon off; pid "${forward(pidFile)}";`,
  ];
  const commands: { flags: string[]; stdout: string; stderr: string; exitCode: number }[] = [];
  async function command(flags: string[], expected = 0, configured = true) {
    await using child = Bun.spawn([binary, ...(configured ? args : []), ...flags], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      timeout: 3000,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      Bun.readableStreamToText(child.stdout),
      Bun.readableStreamToText(child.stderr),
      child.exited,
    ]);
    const result = { flags, stdout, stderr, exitCode };
    commands.push(result);
    if (exitCode !== expected) throw new Error(stderr || `Unexpected NGINX tool exit ${exitCode}`);
    return result;
  }
  let child: Bun.Subprocess<"pipe", "pipe", "ignore"> | undefined, output: Promise<string[]> | undefined;
  const started = performance.now();
  try {
    const information = await command(["-V"], 0, false);
    const version = (information.stdout + information.stderr).match(/nginx version: nginx\/([^\s]+)/)?.[1];
    if (!version) throw new Error("The executable does not identify itself as NGINX");
    async function response(expected: string) {
      const deadline = performance.now() + 2500;
      let last: unknown;
      while (performance.now() < deadline) {
        try {
          const result = await fetch(`http://127.0.0.1:${port}/version`, { signal: AbortSignal.timeout(1000) });
          const body = await result.text();
          last = { status: result.status, body, server: result.headers.get("server") };
          if (result.status === 200 && body === expected && result.headers.get("server") === `nginx/${version}`)
            return last;
        } catch (error) {
          last = String(error);
        }
        await setImmediate();
      }
      throw new Error(`NGINX HTTP deadline: ${JSON.stringify(last)}`);
    }
    await Bun.write(join(prefix, "payload.txt"), "NGINX_RANGE_BYTES");
    await Bun.write(config, configuration("first"));
    await command(["-t"]);
    child = Bun.spawn([binary, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore", timeout: 15_000 });
    output = Promise.all([Bun.readableStreamToText(child.stdout), Bun.readableStreamToText(child.stderr)]);
    const http = await response("first"),
      masterPID = Number((await Bun.file(pidFile).text()).trim());
    if (masterPID !== child.pid) throw new Error("NGINX pid does not match the owned child");
    const range = await fetch(`http://127.0.0.1:${port}/payload`, {
      headers: { Range: "bytes=0-4" },
      signal: AbortSignal.timeout(1000),
    });
    const rangeBody = await range.text(),
      contentRange = range.headers.get("content-range");
    if (range.status !== 206 || contentRange !== "bytes 0-4/17" || rangeBody !== "NGINX")
      throw new Error("NGINX native Range gate failed");
    await Bun.write(config, configuration("second"));
    await command(["-s", "reload"]);
    const reload = await response("second");
    if (Number((await Bun.file(pidFile).text()).trim()) !== masterPID)
      throw new Error("Reload changed the owned master PID");
    await Bun.write(config, "this is invalid;");
    const invalid = await command(["-t"], 1);
    if (!invalid.stderr.includes("unknown directive")) throw new Error("Invalid configuration was not rejected");
    const originalMasterSurvivesInvalidConfig = await response("second");
    await Bun.write(config, configuration("second"));
    await command(["-s", "quit"]);
    const exitCode = await child.exited;
    if (exitCode !== 0) throw new Error("NGINX graceful quit failed");
    const [stdout, stderr] = await output;
    const receipt = {
      schema: 1,
      kind: "nginx-native-engine-qualification",
      measuredAt: new Date().toISOString(),
      version,
      executable: { path: binary, bytes: bytes.length, sha256, format, architecture },
      host: { platform: process.platform, arch: process.arch, bunVersion: Bun.version, bunRevision: Bun.revision },
      nativeBunController: false,
      gates: {
        configuration: true,
        http,
        masterPID,
        range: { status: range.status, contentRange, body: rangeBody },
        reload,
        invalidConfigurationRejected: true,
        originalMasterSurvivesInvalidConfig,
        quit: true,
        exitCode,
      },
      commands,
      stdout,
      stderr,
      elapsedMilliseconds: performance.now() - started,
    };
    await Bun.write(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    return receipt;
  } finally {
    if (child && child.exitCode === null) {
      await Bun.write(config, configuration("second"));
      if ((await Bun.file(pidFile).exists()) && Number((await Bun.file(pidFile).text()).trim()) === child.pid) {
        await command(["-s", "quit"]);
        await child.exited;
      } else {
        child.kill();
        await child.exited;
      }
    }
    if (output) await output;
    const target = resolve(prefix),
      scoped = relative(store, target);
    if (!scoped || scoped.startsWith("..") || isAbsolute(scoped))
      throw new Error("Unsafe engine qualification cleanup path");
    await rm(target, { recursive: true, force: true });
  }
}
if (import.meta.main) {
  const [binary, output] = process.argv.slice(2);
  if (!binary || !output) throw new Error("Usage: bun qualify-engine.ts <absolute-nginx> <absolute-receipt>");
  const receipt = await qualifyEngine(binary, output);
  console.log(
    JSON.stringify({
      receipt: output,
      nativeBunController: false,
      executable: receipt.executable,
      gates: receipt.gates,
    }),
  );
}
