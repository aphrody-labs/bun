// SPDX-License-Identifier: Apache-2.0
import { launch } from "bun:chromium";
import { isAbsolute, join } from "node:path";

const root = join(import.meta.dir, "../..");
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--installed") || args.length > 1)
  throw new Error("Usage: chromium-qualify.ts [--installed]");
const installed = args.includes("--installed");
if (installed && process.platform !== "win32") throw new Error("Installed browser qualification requires Windows");
const programFiles = process.env.ProgramFiles;
if (installed && (!programFiles || !isAbsolute(programFiles)))
  throw new Error("Missing absolute ProgramFiles directory");
const executable = installed
  ? join(programFiles!, "BunChromium/Application/chrome.exe")
  : join(root, "vendor/chromium/src/out/bun", process.platform === "win32" ? "chrome.exe" : "chrome");
const receiptPath = join(
  root,
  installed ? "build/chromium/installed-qualification.json" : "build/chromium/qualification.json",
);

async function closeBrowser(browser: Awaited<ReturnType<typeof launch>>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      browser.connection.send("Browser.close").catch(() => {}),
      new Promise<void>(resolve => {
        timer = setTimeout(resolve, 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    browser.connection.close();
    if (browser.process.exitCode === null) browser.process.kill();
    browser.process.unref();
  }
}

async function qualify() {
  if (!(await Bun.file(executable).exists())) throw new Error(`Browser build is incomplete: ${executable}`);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      return new URL(request.url).pathname === "/probe"
        ? Response.json({ runtime: "bun", value: 42 })
        : new Response("<!doctype html><title>Bun Chromium qualification</title><canvas></canvas>", {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
    },
  });
  let browser: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    browser = await launch({
      executable,
      userDataDir: join(root, "build/chromium/qualification-profile", crypto.randomUUID()),
      headless: true,
      timeout: 60000,
    });
    const connection = browser.connection;
    const version = await connection.send<Record<string, unknown>>("Browser.getVersion");
    const { targetId } = await connection.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await connection.send<{ sessionId: string }>("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await connection.send("Page.enable", {}, sessionId);
    await connection.send("Page.setLifecycleEventsEnabled", { enabled: true }, sessionId);
    const loadedIds = new Set<string>();
    let resolveLoaded: (() => void) | undefined;
    let navigationLoader: string | undefined;
    const remove = connection.on("Page.lifecycleEvent", (event, sourceSession) => {
      if (sourceSession !== sessionId || event.name !== "load" || typeof event.loaderId !== "string") return;
      loadedIds.add(event.loaderId);
      if (event.loaderId === navigationLoader) resolveLoaded?.();
    });
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const navigation = await connection.send<{ loaderId?: string; errorText?: string }>(
        "Page.navigate",
        { url: `http://127.0.0.1:${server.port}/` },
        sessionId,
      );
      if (navigation.errorText || !navigation.loaderId) throw new Error("Local page navigation failed");
      navigationLoader = navigation.loaderId;
      if (!loadedIds.has(navigationLoader)) {
        await new Promise<void>((resolve, reject) => {
          resolveLoaded = resolve;
          loadTimer = setTimeout(() => reject(new Error("Local page load timed out")), 30000);
        });
      }
    } finally {
      clearTimeout(loadTimer);
      remove();
    }
    const probe = await connection.send<{ result: { value?: Record<string, unknown> }; exceptionDetails?: unknown }>(
      "Runtime.evaluate",
      {
        expression: `(async () => ({ title: document.title, fetch: await (await fetch('/probe')).json(), canvas: !!document.querySelector('canvas').getContext('2d'), arithmetic: [1, 2, 3].reduce((a, b) => a + b, 0), wasm: WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0])), secureContext: isSecureContext }))()`,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    const value = probe.result.value;
    if (
      probe.exceptionDetails ||
      !value ||
      value.title !== "Bun Chromium qualification" ||
      !value.canvas ||
      !value.wasm ||
      value.arithmetic !== 6 ||
      (value.fetch as { value?: number })?.value !== 42
    )
      throw new Error(`Browser capability probe failed: ${JSON.stringify(probe)}`);
    const gpu = await connection.gpu(sessionId);
    const compute = await connection.send<{
      result: { value?: { available: boolean; values?: number[] } };
      exceptionDetails?: unknown;
    }>(
      "Runtime.evaluate",
      {
        expression: `(async () => {
          if (!navigator.gpu) return { available: false };
          const adapter = await navigator.gpu.requestAdapter();
          if (!adapter) return { available: false };
          const device = await adapter.requestDevice();
          try {
            const storage = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
            const readback = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
            const shader = device.createShaderModule({ code: '@group(0) @binding(0) var<storage, read_write> values: array<u32>; @compute @workgroup_size(4) fn main(@builtin(global_invocation_id) id: vec3<u32>) { values[id.x] = id.x + 10u; }' });
            const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module: shader, entryPoint: 'main' } });
            const bindings = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: storage } }] });
            const commands = device.createCommandEncoder();
            const pass = commands.beginComputePass();
            pass.setPipeline(pipeline); pass.setBindGroup(0, bindings); pass.dispatchWorkgroups(1); pass.end();
            commands.copyBufferToBuffer(storage, 0, readback, 0, 16);
            device.queue.submit([commands.finish()]);
            await readback.mapAsync(GPUMapMode.READ);
            const values = Array.from(new Uint32Array(readback.getMappedRange()));
            readback.unmap(); readback.destroy(); storage.destroy();
            return { available: true, values };
          } finally { device.destroy(); }
        })()`,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    if (
      compute.exceptionDetails ||
      !compute.result.value ||
      !compute.result.value.available ||
      JSON.stringify(compute.result.value.values) !== "[10,11,12,13]"
    )
      throw new Error(`WebGPU compute probe failed: ${JSON.stringify(compute)}`);
    const receipt = {
      date: new Date().toISOString(),
      executable,
      artifact: installed ? "installed-browser" : "compiled-browser",
      executableSha256: new Bun.CryptoHasher("sha256").update(await Bun.file(executable).arrayBuffer()).digest("hex"),
      bun: Bun.version,
      revision: Bun.revision,
      version,
      probe: value,
      gpu,
      compute: compute.result.value,
      limits:
        "Chromium runs as a separate process over CDP. This probe does not establish embedded Bun, engine parity, or browser performance.",
    };
    await connection.send("Target.closeTarget", { targetId });
    await closeBrowser(browser);
    browser = undefined;
    await Bun.write(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt, null, 2));
  } finally {
    if (browser) await closeBrowser(browser);
    server.stop(true);
  }
}

if (import.meta.main) await qualify();
