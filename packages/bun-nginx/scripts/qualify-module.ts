import Nginx from "bun:nginx";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { setImmediate } from "node:timers/promises";
import { readModuleInfo } from "../src/module";
import { hashSDKFile } from "../../bun-video/src/sdk";

/** Requires a real changed Bun runtime, source-built NGINX and a negative ABI fixture. */
export async function qualifyModule(buildReceipt: string, output: string, mismatchLibrary: string) {
  if (![buildReceipt, output, mismatchLibrary].every(isAbsolute)) throw new Error("Module gate paths must be absolute");
  const build = await Bun.file(buildReceipt).json();
  if (
    build.kind !== "bun-nginx-native-provider-build" ||
    build.executable.sha256 !== (await hashSDKFile(build.executable.path)) ||
    build.mismatchFixture?.deliberatelyIncompatible !== true ||
    build.mismatchFixture?.releaseArtifact !== false ||
    build.mismatchFixture?.sha256 !== (await hashSDKFile(mismatchLibrary))
  )
    throw new Error("The selected source-built NGINX differs from its explicit build receipt");
  const root = resolve(dirname(output)),
    prefix = await mkdtemp(join(root, "module-gate-"));
  const configuration = join(prefix, "nginx.conf"),
    path = (value: string) => value.replaceAll("\\", "/");
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("reserve") });
  const port = reservation.port;
  reservation.stop(true);
  const config = (delay = "500", load = "") =>
    `${load} worker_processes 1; error_log stderr; events { worker_connections 32; } http { access_log off; ${["client_body", "proxy", "fastcgi", "uwsgi", "scgi"].map(name => `${name}_temp_path "${path(join(prefix, name + "-temp"))}";`).join(" ")} server { listen 127.0.0.1:${port}; location = /info { bun_nginx; } location = /delay { bun_nginx_delay ${delay}; } } }`;
  const url = `http://127.0.0.1:${port}`;
  let owner: Nginx | undefined;
  const started = performance.now();
  try {
    await Bun.write(configuration, config());
    owner = await Nginx.create({ binary: build.executable.path, prefix, configFile: configuration, timeoutMs: 3000 });
    await owner.validate();
    const initial = await owner.start();
    const information = await readModuleInfo(owner, url + "/info", {
      expectedConfigurationSha256: build.configurationSha256,
    });
    const nginx = build.sources.find((source: { release?: string }) => source.release);
    const ngxRust = build.sources.find((source: { package?: string }) => source.package === "ngx");
    if (information.nginxSourceRevision !== nginx.revision || information.ngxRustRevision !== ngxRust.revision)
      throw new Error("The native module's compiled source pins differ from the selected build");
    const head = await fetch(url + "/info", { method: "HEAD", signal: AbortSignal.timeout(2000) });
    if (head.status !== 200 || (await head.bytes()).length !== 0 || Number(head.headers.get("content-length")) < 100)
      throw new Error("Native module HEAD gate failed");
    const delayedStarted = performance.now();
    const delayed = readModuleInfo(owner, url + "/delay", { timeoutMs: 2000 });
    const instant = await readModuleInfo(owner, url + "/info");
    const instantMilliseconds = performance.now() - delayedStarted;
    const delay = await delayed,
      totalDelayMilliseconds = performance.now() - delayedStarted;
    if (
      instant.delayMilliseconds !== 0 ||
      delay.delayMilliseconds !== 500 ||
      instantMilliseconds >= totalDelayMilliseconds - 100 ||
      totalDelayMilliseconds < 450
    )
      throw new Error("The NGINX worker timer blocked concurrent native requests");
    const abort = new AbortController();
    const pending = fetch(url + "/delay", { signal: abort.signal }).then(
      () => false,
      () => true,
    );
    const abortDeadline = performance.now() + 1500;
    let nativeTimerObserved = false;
    while (performance.now() < abortDeadline) {
      if ((await readModuleInfo(owner, url + "/info")).pendingTimers > 0) {
        nativeTimerObserved = true;
        break;
      }
      await setImmediate();
    }
    if (!nativeTimerObserved) throw new Error("Client abort fixture never reached the native timer");
    abort.abort();
    const clientAborted = await pending;
    if (!clientAborted) throw new Error("Native module client abort did not settle");
    let timerCleanup = false;
    const cleanupDeadline = performance.now() + 1500;
    while (performance.now() < cleanupDeadline) {
      if ((await readModuleInfo(owner, url + "/info")).pendingTimers === 0) {
        timerCleanup = true;
        break;
      }
      await setImmediate();
    }
    if (!timerCleanup) throw new Error("The aborted native timer was not cleaned up before its deadline");
    await Bun.write(configuration, config("1001"));
    let invalidConfigurationRejected = false;
    try {
      await owner.reload();
    } catch (error) {
      invalidConfigurationRejected = (error as { code?: string }).code === "ERR_NGINX_CONFIG";
    }
    if (!invalidConfigurationRejected) throw new Error("Out-of-bounds native timer configuration was accepted");
    const surviving = await readModuleInfo(owner, url + "/info");
    await Bun.write(configuration, config("10"));
    const reloaded = await owner.reload();
    if (reloaded.pid !== initial.pid) throw new Error("Module reload changed its owned NGINX master");
    // Test the real loader: exact ABI signature check precedes duplicate module-name checks.
    await Bun.write(configuration, config("10", `load_module "${path(mismatchLibrary)}";`));
    let abiMismatchRejected = false;
    try {
      await owner.validate();
    } catch (error) {
      abiMismatchRejected =
        (error as { code?: string }).code === "ERR_NGINX_CONFIG" &&
        String((error as Error).message).includes("not binary compatible");
    }
    if (!abiMismatchRejected)
      throw new Error("The deliberately incompatible Rust module did not fail NGINX's ABI gate");
    await Bun.write(configuration, config("10"));
    const stopped = await owner.quit();
    if (stopped.running || stopped.lastExitCode !== 0) throw new Error("Native module lifecycle did not quit cleanly");
    await owner.close();
    const receipt = {
      schema: 1,
      kind: "bun-nginx-native-module-qualification",
      measuredAt: new Date().toISOString(),
      host: { platform: process.platform, arch: process.arch, bunVersion: Bun.version, bunRevision: Bun.revision },
      executable: build.executable,
      sources: build.sources,
      moduleInputs: build.moduleInputs,
      configurationSha256: build.configurationSha256,
      mismatchFixture: { path: mismatchLibrary, sha256: await hashSDKFile(mismatchLibrary) },
      information,
      gates: {
        nativeBunController: true,
        nativeRustModuleHTTP: true,
        head: true,
        timerDoesNotBlockWorker: { instantMilliseconds, totalDelayMilliseconds },
        clientAborted,
        timerCleanup,
        invalidConfigurationRejected,
        originalMasterSurvivesInvalidConfig: surviving.masterPID === information.masterPID,
        reloadSameMaster: true,
        abiMismatchRejected,
        gracefulQuit: true,
      },
      nativeModuleQualified: true,
      allReleasePlatformsQualified: false,
      elapsedMilliseconds: performance.now() - started,
    };
    await Bun.write(output, JSON.stringify(receipt, null, 2) + "\n");
    return receipt;
  } finally {
    if (owner) {
      await Bun.write(configuration, config("10"));
      await owner.close();
    }
    const target = resolve(prefix),
      scoped = relative(root, target);
    if (!scoped || scoped.startsWith("..") || isAbsolute(scoped)) throw new Error("Unsafe module gate cleanup path");
    await rm(target, { recursive: true, force: true });
  }
}
if (import.meta.main) {
  const [build, output, mismatch] = process.argv.slice(2);
  if (!build || !output || !mismatch)
    throw new Error("Usage: bun qualify-module.ts <build-receipt> <gate-receipt> <incompatible-module-library>");
  const receipt = await qualifyModule(build, output, mismatch);
  console.log(
    JSON.stringify({ receipt: output, nativeModuleQualified: receipt.nativeModuleQualified, gates: receipt.gates }),
  );
}
