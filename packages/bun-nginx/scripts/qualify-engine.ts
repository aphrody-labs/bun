// This gate invokes the selected real NGINX engine; the native Bun controller is separate.
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { setImmediate } from "node:timers/promises";
import { hashSDKFile } from "../../bun-video/src/sdk";

export interface NativeModuleEngineOptions {
  configurationSha256: string;
  nginxSourceRevision: string;
  ngxRustRevision: string;
  mismatchLibrary: string;
  mismatchLibrarySha256: string;
}
async function captureOutput(stream: ReadableStream<Uint8Array>) {
  const maximum = 64 << 20,
    retained = 64 << 10,
    hash = new Bun.CryptoHasher("sha256"),
    reader = stream.getReader();
  let bytes = 0,
    tail: Uint8Array = new Uint8Array(0);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) throw new Error("NGINX diagnostic stream exceeds its qualification bound");
      hash.update(value);
      if (value.byteLength >= retained) tail = value.slice(-retained);
      else {
        const combined = new Uint8Array(Math.min(retained, tail.byteLength + value.byteLength));
        const previous = Math.min(tail.byteLength, retained - value.byteLength);
        combined.set(tail.subarray(tail.byteLength - previous));
        combined.set(value, previous);
        tail = combined;
      }
    }
  } finally {
    await reader.cancel();
  }
  return { text: new TextDecoder().decode(tail), bytes, sha256: hash.digest("hex"), truncated: bytes > retained };
}
export async function qualifyEngine(binary: string, receiptPath: string, module?: NativeModuleEngineOptions) {
  if (!isAbsolute(binary) || !isAbsolute(receiptPath)) throw new Error("Engine and receipt paths must be absolute");
  if (
    module &&
    (!isAbsolute(module.mismatchLibrary) ||
      ['"', "\0", "\r", "\n"].some(character => module.mismatchLibrary.includes(character)) ||
      !/^[a-f0-9]{64}$/.test(module.mismatchLibrarySha256) ||
      module.mismatchLibrarySha256 !== (await hashSDKFile(module.mismatchLibrary)))
  )
    throw new Error("The negative ABI fixture differs from its selected source-build receipt");
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
  const target = resolve(prefix),
    scoped = relative(store, target);
  if (!scoped || scoped.startsWith("..") || isAbsolute(scoped))
    throw new Error("Unsafe engine qualification cleanup path");
  const config = join(prefix, "nginx.conf"),
    pidFile = join(prefix, "bun-nginx.pid"),
    forward = (path: string) => path.replaceAll("\\", "/");
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("reserve") });
  const port = reservation.port;
  reservation.stop(true);
  const configuration = (text: string) =>
    `worker_processes 1; error_log stderr${module ? " debug" : ""}; lock_file "${forward(join(prefix, "nginx.lock"))}"; events { worker_connections 32; } http { access_log off; ${["client_body", "proxy", "fastcgi", "uwsgi", "scgi"].map(name => `${name}_temp_path "${forward(join(prefix, name + "-temp"))}";`).join(" ")} server { listen 127.0.0.1:${port}; location = /version { return 200 "${text}"; } location = /payload { alias "${forward(join(prefix, "payload.txt"))}"; } ${module ? "location = /info { bun_nginx; } location = /delay { bun_nginx_delay 500; }" : ""} } }`;
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
      captureOutput(child.stdout),
      captureOutput(child.stderr),
      child.exited,
    ]);
    const { text: stdoutText, ...stdoutEvidence } = stdout,
      { text: stderrText, ...stderrEvidence } = stderr;
    const result = {
      flags,
      stdout: stdoutText,
      stderr: stderrText,
      output: { stdout: stdoutEvidence, stderr: stderrEvidence },
      exitCode,
    };
    commands.push(result);
    if (exitCode !== expected) throw new Error(stderr.text || `Unexpected NGINX tool exit ${exitCode}`);
    return result;
  }
  let child: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined,
    output: Promise<Awaited<ReturnType<typeof captureOutput>>[]> | undefined;
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
    output = Promise.all([captureOutput(child.stdout), captureOutput(child.stderr)]);
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
    let nativeModule: Record<string, unknown> | undefined;
    if (module) {
      async function info() {
        const response = await fetch(`http://127.0.0.1:${port}/info`, { signal: AbortSignal.timeout(1000) });
        const body = await response.text();
        if (response.status !== 200 || body.length > 4096) throw new Error("Native Rust module HTTP gate failed");
        const value = JSON.parse(body);
        if (
          value.schema !== 1 ||
          value.module !== "ngx_http_bun_module" ||
          value.masterPID !== masterPID ||
          value.nginxSourceRevision !== module!.nginxSourceRevision ||
          value.ngxRustRevision !== module!.ngxRustRevision ||
          value.configurationSha256 !== module!.configurationSha256 ||
          value.eventLoop !== "nginx-worker" ||
          value.allocationOwner !== "request-pool"
        )
          throw new Error("Native Rust module source/configuration/owner metadata differed from its selected build");
        return value;
      }
      async function pending(expected: (count: number) => boolean) {
        const deadline = performance.now() + 1500;
        while (performance.now() < deadline) {
          const value = await info();
          if (expected(value.pendingTimers)) return value;
          await setImmediate();
        }
        throw new Error("Native timer lifecycle did not settle before its deadline");
      }
      const information = await info();
      const head = await fetch(`http://127.0.0.1:${port}/info`, { method: "HEAD", signal: AbortSignal.timeout(1000) });
      if (head.status !== 200 || (await head.bytes()).length || Number(head.headers.get("content-length")) < 100)
        throw new Error("Native Rust module HEAD failed");
      const begin = performance.now();
      const delay = fetch(`http://127.0.0.1:${port}/delay`, { signal: AbortSignal.timeout(2000) }).then(response =>
        response.json(),
      );
      await pending(count => count > 0);
      const instantMilliseconds = performance.now() - begin;
      const delayed = await delay,
        elapsedMilliseconds = performance.now() - begin;
      if (
        typeof delayed !== "object" ||
        delayed === null ||
        !("delayMilliseconds" in delayed) ||
        delayed.delayMilliseconds !== 500 ||
        elapsedMilliseconds < 450 ||
        instantMilliseconds >= elapsedMilliseconds - 100
      )
        throw new Error("Native Rust timer blocked the NGINX worker event loop");
      const abort = new AbortController();
      const aborted = fetch(`http://127.0.0.1:${port}/delay`, { signal: abort.signal }).then(
        () => false,
        () => true,
      );
      await pending(count => count > 0); // Evidence the request reached the real native module.
      abort.abort();
      if (!(await aborted)) throw new Error("Native module client abort did not reject");
      await pending(count => count === 0);
      await Bun.write(config, configuration("first").replace("bun_nginx_delay 500", "bun_nginx_delay 1001"));
      const invalid = await command(["-t"], 1);
      if (!invalid.stderr.includes("integer between 1 and 1000"))
        throw new Error("Native Rust config callback did not reject its bound");
      await info();
      await Bun.write(config, `load_module "${forward(module.mismatchLibrary)}";\n` + configuration("first"));
      const mismatch = await command(["-t"], 1);
      if (!mismatch.stderr.includes("not binary compatible"))
        throw new Error(`Real NGINX ABI rejection differed from its signature gate: ${mismatch.stderr}`);
      await Bun.write(config, configuration("first"));
      nativeModule = {
        information,
        head: true,
        nativeEventLoopTimer: { instantMilliseconds, elapsedMilliseconds },
        clientAbortAfterNativeTimerObserved: true,
        timerCleanup: true,
        invalidRustConfigurationRejected: true,
        abiMismatchRejected: true,
        mismatchFixture: { path: module.mismatchLibrary, sha256: module.mismatchLibrarySha256, releaseArtifact: false },
        nativeRustModuleQualified: true,
      };
    }
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
    const { text: stdoutText, ...stdoutEvidence } = stdout,
      { text: stderrText, ...stderrEvidence } = stderr;
    const receipt = {
      schema: 1,
      kind: "nginx-native-engine-qualification",
      measuredAt: new Date().toISOString(),
      version,
      executable: { path: binary, bytes: bytes.length, sha256, format, architecture },
      host: { platform: process.platform, arch: process.arch, bunVersion: Bun.version, bunRevision: Bun.revision },
      nativeBunController: false,
      ...(nativeModule ? { nativeModule } : {}),
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
      stdout: stdoutText,
      stderr: stderrText,
      diagnosticOutput: { stdout: stdoutEvidence, stderr: stderrEvidence },
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
    await rm(target, { recursive: true, force: true });
  }
}
/** Engine/module gate usable before the Bun controller's changed binary is available. */
export async function qualifySourceModuleEngine(buildReceipt: string, output: string) {
  if (!isAbsolute(buildReceipt)) throw new Error("The source-build receipt must be absolute");
  const build = await Bun.file(buildReceipt).json();
  if (
    build.kind !== "bun-nginx-native-provider-build" ||
    !isAbsolute(build.executable.path) ||
    build.executable.sha256 !== (await hashSDKFile(build.executable.path)) ||
    build.mismatchFixture?.deliberatelyIncompatible !== true ||
    build.mismatchFixture?.releaseArtifact !== false
  )
    throw new Error("The selected source-build executable or negative fixture receipt is invalid");
  const nginx = build.sources.find((source: { release?: string }) => source.release);
  const ngxRust = build.sources.find((source: { package?: string }) => source.package === "ngx");
  return qualifyEngine(build.executable.path, output, {
    configurationSha256: build.configurationSha256,
    nginxSourceRevision: nginx.revision,
    ngxRustRevision: ngxRust.revision,
    mismatchLibrary: build.mismatchFixture.path,
    mismatchLibrarySha256: build.mismatchFixture.sha256,
  });
}
if (import.meta.main) {
  const [binary, output, moduleOutput] = process.argv.slice(2);
  if (!binary || !output)
    throw new Error(
      "Usage: bun qualify-engine.ts <absolute-nginx> <absolute-receipt> | --module-build <absolute-build-receipt> <absolute-gate-receipt>",
    );
  if (binary === "--module-build" && !moduleOutput) throw new Error("A module engine gate needs an output receipt");
  const receipt =
    binary === "--module-build"
      ? await qualifySourceModuleEngine(output, moduleOutput!)
      : await qualifyEngine(binary, output);
  console.log(
    JSON.stringify({
      receipt: binary === "--module-build" ? moduleOutput : output,
      nativeBunController: false,
      executable: receipt.executable,
      gates: receipt.gates,
      ...(receipt.nativeModule ? { nativeModule: receipt.nativeModule } : {}),
    }),
  );
}
