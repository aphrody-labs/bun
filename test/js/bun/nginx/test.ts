import { describe, expect, test } from "bun:test";
import Nginx from "bun:nginx";
import Alias from "bun:Nginixx";
import { bunExe, tempDir } from "harness";
import { mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setImmediate } from "node:timers/promises";

const fixture = join(import.meta.dir, "fixture.ts");
const binary = bunExe();
const probe = Nginx.probe;
function isolated(mode?: string) {
  const prefix = mkdtempSync(join(tmpdir(), "bun-nginx-"));
  const configFile = join(prefix, "nginx.conf");
  writeFileSync(configFile, JSON.stringify({ body: "first" }));
  return {
    prefix,
    configFile,
    options: {
      prefix,
      configFile,
      binary,
      binaryArguments: [fixture, ...(mode ? [`--fixture-mode=${mode}`] : [])],
      timeoutMs: 2000,
    },
    [Symbol.dispose]() {
      rmSync(prefix, { recursive: true, force: true });
    },
  };
}
async function body(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  expect(response.status).toBe(200);
  return response.text();
}
async function waitForBody(url: string, expected: string) {
  const deadline = performance.now() + 2000;
  let actual: string | undefined;
  let failure: unknown;
  while (performance.now() < deadline) {
    try {
      actual = await body(url);
      if (actual === expected) return;
    } catch (error) {
      failure = error;
    }
    await setImmediate();
  }
  if (actual === undefined && failure) throw failure;
  expect(actual).toBe(expected);
}
async function eventually<T>(read: () => Promise<T>, accept: (value: T) => boolean, milliseconds = 3000) {
  const deadline = performance.now() + milliseconds;
  while (performance.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await setImmediate();
  }
  throw new Error("NGINX lifecycle event did not arrive before its deadline");
}
function fixtureSignal(prefix: string, signal: string) {
  const path = join(prefix, "fixture-signal.json");
  writeFileSync(path + ".tmp", JSON.stringify({ signal }));
  renameSync(path + ".tmp", path);
}
async function ready(prefix: string, name = "fixture-ready.json") {
  const path = join(prefix, name);
  await eventually(() => Bun.file(path).exists(), Boolean);
  return Bun.file(path).json();
}
async function assertStopped(url: string) {
  await eventually(async () => {
    try {
      await fetch(url, { signal: AbortSignal.timeout(200) });
      return false;
    } catch {
      return true;
    }
  }, Boolean);
}

describe("native NGINX controller with explicit process-protocol fixture", () => {
  test("default class, named helpers and alias expose the same owner", async () => {
    const module = await import("bun:nginx");
    expect(module.default).toBe(Nginx);
    expect(module.Nginx).toBe(Nginx);
    expect(module.probe).toBe(Nginx.probe);
    expect(module.create).toBe(Nginx.create);
    expect(Alias).toBe(Nginx);
  });
  test("both module spellings share the owner; unavailable provider is explicit", async () => {
    expect(Alias).toBe(Nginx);
    const directory = String(tempDir("bun-nginx-missing-", {}));
    const missing = join(directory, "does-not-exist-nginx");
    try {
      expect(await probe({ binary: missing })).toMatchObject({
        available: false,
        code: "ERR_NGINX_PROVIDER_UNAVAILABLE",
        binary: missing,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("version and compile capabilities are measured from the selected executable", async () => {
    const info = await probe({ binary, binaryArguments: [fixture] });
    expect(info.available).toBe(true);
    if (!info.available) throw new Error("fixture executable missing");
    expect(info.version).toBe("0.0.0-bun-process-fixture");
    expect(info.capabilities).toMatchObject({
      http: true,
      httpTLS: true,
      http2: true,
      http3: false,
      threads: true,
      windowsBeta: process.platform === "win32",
      effectiveWorkersMaximum: process.platform === "win32" ? 1 : null,
    });
  });

  test("validate, start, reload, quit and restart keep one owned child", async () => {
    using scope = isolated();
    await using nginx = await Nginx.create(scope.options);
    expect(nginx instanceof Nginx).toBe(true);
    expect(await nginx.validate()).toMatchObject({ valid: true, exitCode: 0 });
    const initial = await nginx.status();
    expect(initial).toMatchObject({ running: false, pid: null, closed: false });
    const started = await nginx.start();
    const ready = await Bun.file(join(scope.prefix, "fixture-ready.json")).json();
    expect(started).toMatchObject({ running: true, pid: ready.pid, prefix: scope.prefix });
    expect(await body(ready.url)).toBe("first");
    const info = await nginx.probe();
    expect(info.available && info.version).toBe("0.0.0-bun-process-fixture");
    writeFileSync(scope.configFile, JSON.stringify({ body: "second" }));
    const reloaded = await nginx.reload();
    expect(reloaded.pid).toBe(started.pid);
    await waitForBody(ready.url, "second");
    expect(await nginx.quit()).toMatchObject({ running: false, pid: null, lastExitCode: 0 });
    expect(await nginx.start()).toMatchObject({ running: true });
    expect(await nginx.close()).toEqual({ closed: true, forced: false });
    expect((await nginx.status()).closed).toBe(true);
  });

  test("two controllers cannot claim the same prefix and owner files disappear on close", async () => {
    using scope = isolated();
    await using first = await Nginx.create(scope.options);
    await expect(Nginx.create(scope.options)).rejects.toMatchObject({ code: "ERR_NGINX_OWNER" });
    await first.close();
    expect(await Bun.file(join(scope.prefix, ".bun-nginx-owner")).exists()).toBe(false);
    await using next = await Nginx.create(scope.options);
    expect((await next.status()).running).toBe(false);
  });

  test("configuration validation isolates and removes NGINX's empty test PID", async () => {
    using scope = isolated("test-pidfile");
    await using nginx = await Nginx.create(scope.options);
    expect(await nginx.validate()).toMatchObject({ valid: true });
    expect(await Bun.file(join(scope.prefix, "bun-nginx.pid")).exists()).toBe(false);
    expect(readdirSync(scope.prefix).filter(name => name.startsWith(".bun-nginx-validate-"))).toEqual([]);
    const started = await nginx.start();
    expect(started.running).toBe(true);
    const master = await ready(scope.prefix);
    expect(started.pid).toBe(master.pid);
    expect(await body(master.url)).toBe("first");
    expect((await nginx.quit()).running).toBe(false);
    expect(readdirSync(scope.prefix).filter(name => name.endsWith(".pid"))).toEqual([]);
  });

  test("invalid config blocks startup and reload without changing the live child", async () => {
    using scope = isolated();
    await using nginx = await Nginx.create(scope.options);
    writeFileSync(scope.configFile, "invalid");
    await expect(nginx.start()).rejects.toMatchObject({ code: "ERR_NGINX_CONFIG" });
    expect((await nginx.status()).running).toBe(false);
    writeFileSync(scope.configFile, JSON.stringify({ body: "first" }));
    const started = await nginx.start();
    writeFileSync(scope.configFile, "invalid");
    await expect(nginx.reload()).rejects.toMatchObject({ code: "ERR_NGINX_CONFIG" });
    expect((await nginx.status()).pid).toBe(started.pid);
    writeFileSync(scope.configFile, JSON.stringify({ body: "first" }));
  });

  test("changed pid or prefix ownership refuses signals", async () => {
    using scope = isolated();
    await using nginx = await Nginx.create(scope.options);
    const started = await nginx.start();
    const pidFile = join(scope.prefix, "bun-nginx.pid");
    writeFileSync(pidFile, "1\n");
    await expect(nginx.reload()).rejects.toMatchObject({ code: "ERR_NGINX_OWNER" });
    expect(await Bun.file(join(scope.prefix, "fixture-signal.json")).exists()).toBe(false);
    writeFileSync(pidFile, `${started.pid}\n`);
    await nginx.quit();
    const owner = join(scope.prefix, ".bun-nginx-owner");
    const original = await Bun.file(owner).bytes();
    writeFileSync(owner, "changed");
    await expect(nginx.status()).rejects.toMatchObject({ code: "ERR_NGINX_OWNER" });
    writeFileSync(owner, original);
  });

  test("escaping configuration and an existing pid cannot be adopted", async () => {
    using scope = isolated();
    const external = mkdtempSync(join(tmpdir(), "bun-nginx-external-"));
    try {
      writeFileSync(join(external, "nginx.conf"), "{}");
      await expect(Nginx.create({ ...scope.options, configFile: join(external, "nginx.conf") })).rejects.toMatchObject({
        code: "ERR_INVALID_ARG_VALUE",
      });
      writeFileSync(join(scope.prefix, "bun-nginx.pid"), "1\n");
      await expect(Nginx.create(scope.options)).rejects.toMatchObject({ code: "ERR_NGINX_OWNER" });
    } finally {
      rmSync(external, { recursive: true, force: true });
    }
  });

  test("deadlines, output bounds and pre-aborted signals settle", async () => {
    await expect(
      probe({ binary, binaryArguments: [fixture, "--fixture-mode=hang-probe"], timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: "ERR_NGINX_TIMEOUT" });
    await expect(probe({ binary, binaryArguments: [fixture], maxOutputBytes: 1 })).rejects.toMatchObject({
      code: "ERR_NGINX_OUTPUT_LIMIT",
    });
    await expect(probe({ binary, binaryArguments: [fixture], signal: AbortSignal.abort() })).rejects.toMatchObject({
      code: "ABORT_ERR",
    });
    for (const timeoutMs of [0, -1, 30_001, 1.5, NaN, Infinity]) {
      await expect((async () => probe({ binary, binaryArguments: [fixture], timeoutMs }))()).rejects.toMatchObject({
        code: "ERR_INVALID_ARG_VALUE",
      });
    }
  });

  test("startup deadline terminates its owned child and releases the prefix", async () => {
    using scope = isolated("hang-start");
    await using nginx = await Nginx.create(scope.options);
    await expect(nginx.start({ timeoutMs: 300 })).rejects.toMatchObject({ code: "ERR_NGINX_TIMEOUT" });
    expect((await nginx.status()).running).toBe(false);
    const ready = await Bun.file(join(scope.prefix, "fixture-ready.json")).json();
    await expect(fetch(ready.url, { signal: AbortSignal.timeout(300) })).rejects.toThrow();
    await nginx.close();
    expect(await Bun.file(join(scope.prefix, ".bun-nginx-owner")).exists()).toBe(false);
  });

  test("master crash releases keepalive and terminates its owned worker group", async () => {
    using scope = isolated("with-worker");
    await using nginx = await Nginx.create(scope.options);
    await nginx.start();
    const worker = await ready(scope.prefix, "worker-ready.json");
    expect(await body(worker.url)).toBe("worker");
    fixtureSignal(scope.prefix, "crash");
    const stopped = await eventually(
      () => nginx.status(),
      value => !value.running,
    );
    expect(stopped).toMatchObject({ running: false, lastExitCode: 23 });
    await assertStopped(worker.url);
  });

  test("close forces only its owned tree when graceful quit exceeds its deadline", async () => {
    using scope = isolated("hang-quit");
    await using nginx = await Nginx.create(scope.options);
    await nginx.start();
    const master = await ready(scope.prefix);
    expect(await nginx.close({ timeoutMs: 100 })).toEqual({ closed: true, forced: true });
    await assertStopped(master.url);
    expect(await Bun.file(join(scope.prefix, "bun-nginx.pid")).exists()).toBe(false);
  });

  test("an in-flight operation settles after AbortSignal cancellation", async () => {
    const controller = new AbortController();
    const pending = probe({
      binary,
      binaryArguments: [fixture, "--fixture-mode=hang-probe"],
      signal: controller.signal,
    });
    queueMicrotask(() => controller.abort());
    await expect(pending).rejects.toMatchObject({ code: "ABORT_ERR" });
  });

  test("a live master keeps a Bun subprocess alive until its actual exit", async () => {
    using scope = isolated();
    const script = `import Nginx from 'bun:nginx'; globalThis.nginx = await Nginx.create(${JSON.stringify(scope.options)}); await globalThis.nginx.start();`;
    await using child = Bun.spawn([binary, "-e", script], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      timeout: 5000,
    });
    const output = Promise.all([Bun.readableStreamToText(child.stdout), Bun.readableStreamToText(child.stderr)]);
    const master = await ready(scope.prefix);
    expect(await body(master.url)).toBe("first");
    expect(child.exitCode).toBeNull();
    fixtureSignal(scope.prefix, "quit");
    expect(await child.exited).toBe(0);
    const [, stderr] = await output;
    expect(stderr).toBe("");
    await assertStopped(master.url);
  });

  test("GC stops a discarded controller and its worker without pinning the JS wrapper", async () => {
    using scope = isolated("with-worker");
    const script = `import Nginx from 'bun:nginx'; import { setImmediate } from 'node:timers/promises';
      await (async () => { const nginx = await Nginx.create(${JSON.stringify(scope.options)}); await nginx.start(); globalThis.reference = new WeakRef(nginx); })();
      await setImmediate(); Bun.gc(true); await setImmediate(); Bun.gc(true);
      if (globalThis.reference.deref()) throw new Error('NGINX wrapper retained after its scope ended');`;
    await using child = Bun.spawn([binary, "-e", script], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      timeout: 5000,
    });
    const output = Promise.all([Bun.readableStreamToText(child.stdout), Bun.readableStreamToText(child.stderr)]);
    expect(await child.exited).toBe(0);
    const [, stderr] = await output;
    expect(stderr).toBe("");
    const master = await ready(scope.prefix);
    const workerFile = Bun.file(join(scope.prefix, "worker-ready.json"));
    await assertStopped(master.url);
    // The worker may be terminated before reaching its own readiness write.
    if (await workerFile.exists()) await assertStopped((await workerFile.json()).url);
    expect(await Bun.file(join(scope.prefix, ".bun-nginx-owner")).exists()).toBe(false);
    expect(await Bun.file(join(scope.prefix, "bun-nginx.pid")).exists()).toBe(false);
  });

  test("Bun VM exit terminates its live owned master and worker", async () => {
    using scope = isolated("with-worker");
    const script = `import Nginx from 'bun:nginx'; import { setImmediate } from 'node:timers/promises';
      globalThis.nginx = await Nginx.create(${JSON.stringify(scope.options)}); await globalThis.nginx.start();
      const worker = Bun.file(${JSON.stringify(join(scope.prefix, "worker-ready.json"))});
      const deadline = performance.now() + 2000;
      while (!await worker.exists()) { if (performance.now() >= deadline) throw new Error('Worker not ready'); await setImmediate(); }
      process.exit(0);`;
    await using child = Bun.spawn([binary, "-e", script], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      timeout: 5000,
    });
    const output = Promise.all([Bun.readableStreamToText(child.stdout), Bun.readableStreamToText(child.stderr)]);
    expect(await child.exited).toBe(0);
    const [, stderr] = await output;
    expect(stderr).toBe("");
    await assertStopped((await ready(scope.prefix)).url);
    await assertStopped((await ready(scope.prefix, "worker-ready.json")).url);
  });
});

const realBinary = process.env.BUN_NGINX_TEST_BINARY || Bun.which("nginx");
// Optional native provider: absence is explicit; controller/fixture tests above still run.
test.skipIf(!realBinary)("real NGINX serves bytes and Range and reloads the same owned master", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "bun-nginx-real-"));
  try {
    const info = await probe({ binary: realBinary! });
    expect(info.available).toBe(true);
    const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("reserve") });
    const port = reservation.port;
    reservation.stop(true);
    writeFileSync(join(temporary, "payload.txt"), "NGINX_RANGE_BYTES");
    const configuration = (response: string) =>
      `worker_processes 1; error_log stderr; events { worker_connections 32; } http { access_log off; ${["client_body", "proxy", "fastcgi", "uwsgi", "scgi"].map(name => `${name}_temp_path "${join(temporary, name + "-temp").replaceAll("\\", "/")}";`).join(" ")} server { listen 127.0.0.1:${port}; location = /version { return 200 "${response}"; } location = /payload { alias "${join(temporary, "payload.txt").replaceAll("\\", "/")}"; } } }`;
    writeFileSync(join(temporary, "nginx.conf"), configuration("first"));
    await using nginx = await Nginx.create({
      binary: realBinary!,
      prefix: temporary,
      configFile: "nginx.conf",
      timeoutMs: 3000,
    });
    const started = await nginx.start();
    const url = `http://127.0.0.1:${port}`;
    await waitForBody(url + "/version", "first");
    const range = await fetch(url + "/payload", { headers: { Range: "bytes=0-4" }, signal: AbortSignal.timeout(2000) });
    expect({
      status: range.status,
      contentRange: range.headers.get("Content-Range"),
      text: await range.text(),
    }).toEqual({ status: 206, contentRange: "bytes 0-4/17", text: "NGINX" });
    writeFileSync(join(temporary, "nginx.conf"), configuration("second"));
    expect((await nginx.reload()).pid).toBe(started.pid);
    await waitForBody(url + "/version", "second");
    expect((await nginx.quit()).running).toBe(false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
