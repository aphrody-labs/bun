import { expect, test } from "bun:test";
import { connect, findExecutable, launch, manifests, profiles, protocol } from "bun:chromium";
import { tempDir } from "harness";
import { existsSync } from "node:fs";

function mockBrowser(handler: (message: any, socket: any) => void) {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request, server) {
      if (server.upgrade(request)) return;
      return new Response("Expected WebSocket", { status: 400 });
    },
    websocket: {
      message(socket, data) {
        handler(JSON.parse(String(data)), socket);
      },
    },
  });
  return {
    url: `ws://127.0.0.1:${server.port}/devtools/browser/test`,
    [Symbol.dispose]() {
      server.stop(true);
    },
  };
}

test("Chrome protocol accepts web URLs and rejects privileged schemes", () => {
  expect(protocol.validateURL("https://example.com/app")).toBe("https://example.com/app");
  expect(protocol.validateURL("http://localhost/app")).toBe("http://localhost/app");
  expect(protocol.validateURL("about:blank")).toBe("about:blank");
  for (const url of [
    "javascript:alert(1)",
    "file:///secret",
    "chrome://settings",
    "data:text/html,test",
    "relative",
  ])
    expect(() => protocol.validateURL(url)).toThrow();
  const executable = findExecutable();
  expect(executable === null || typeof executable === "string").toBe(true);
});

test("Chrome extension and theme manifests default to MV3", () => {
  const extension = manifests.createExtension({ name: "Bun bridge" });
  expect(extension.manifest_version).toBe(3);
  expect(extension.version).toBe("1.0.0");
  expect(extension.name).toBe("Bun bridge");
  expect(() => manifests.validateExtension({ ...extension, manifest_version: 2 })).toThrow();
  expect(() =>
    manifests.validateExtension({ ...extension, background: { service_worker: "../outside.js" } }),
  ).toThrow();

  const theme = manifests.createTheme({
    name: "Bun theme",
    theme: { colors: { frame: [10, 20, 30] } },
  });
  expect(theme.manifest_version).toBe(3);
  expect(theme.theme).toEqual({ colors: { frame: [10, 20, 30] } });
  expect(() =>
    manifests.validateTheme({ ...theme, theme: { colors: { frame: [256, 0, 0] } } }),
  ).toThrow();
  expect(() =>
    manifests.validateTheme({ ...theme, theme: { images: { theme_frame: "../../private.png" } } }),
  ).toThrow();
});

test("PWA manifests require an absolute web start URL", () => {
  const manifest = manifests.createPWA({ name: "Bun app", start_url: "https://example.com/app" });
  expect(manifest.name).toBe("Bun app");
  expect(manifest.start_url).toBe("https://example.com/app");
  expect(() => manifests.validatePWA({ name: "App", start_url: "javascript:alert(1)" })).toThrow();
  expect(() => manifests.validatePWA({ name: "App", start_url: "/app" })).toThrow();
});

test("bookmark import flattens an explicitly selected JSON file", async () => {
  using dir = tempDir("chrome-bookmarks", {
    Bookmarks: JSON.stringify({
      roots: {
        bookmark_bar: {
          type: "folder",
          name: "Bookmarks bar",
          children: [
            {
              type: "folder",
              name: "Work",
              children: [{ type: "url", id: "7", name: "Docs", url: "https://example.com/docs" }],
            },
          ],
        },
      },
    }),
  });
  const bookmarks = await profiles.readBookmarks(`${dir}/Bookmarks`);
  expect(bookmarks).toHaveLength(1);
  expect(bookmarks[0].id).toBe("7");
  expect(bookmarks[0].name).toBe("Docs");
  expect(bookmarks[0].url).toBe("https://example.com/docs");
  expect(bookmarks[0].folder.at(-1)).toBe("Work");
});

test.concurrent("CDP correlates replies received in reverse order and forwards sessions", async () => {
  const messages: any[] = [];
  using browser = mockBrowser((message, socket) => {
    messages.push(message);
    if (messages.length !== 2) return;
    for (const request of messages.toReversed())
      socket.send(
        JSON.stringify({
          id: request.id,
          result: { method: request.method, sessionId: request.sessionId },
        }),
      );
  });
  const connection = await connect(browser.url);
  try {
    const results = await Promise.all([
      connection.send("Runtime.enable", {}, "session-one"),
      connection.send("Page.enable", {}, "session-two"),
    ]);
    expect(results).toEqual([
      { method: "Runtime.enable", sessionId: "session-one" },
      { method: "Page.enable", sessionId: "session-two" },
    ]);
  } finally {
    connection.close();
  }
  expect(connection.closed).toBe(true);
});

test.concurrent("CDP exposes browser errors and rejects pending commands on disconnect", async () => {
  using browser = mockBrowser((message, socket) => {
    if (message.method === "Missing.command")
      socket.send(
        JSON.stringify({ id: message.id, error: { code: -32601, message: "Unknown command" } }),
      );
    else socket.close();
  });
  const connection = await connect(browser.url);
  try {
    await expect(connection.send("Missing.command")).rejects.toThrow("Unknown command");
    await expect(connection.send("Runtime.enable")).rejects.toThrow();
  } finally {
    connection.close();
  }
});

test.concurrent("CDP listeners unsubscribe without dropping subsequent replies", async () => {
  using browser = mockBrowser((message, socket) => {
    socket.send(JSON.stringify({ method: "Page.loadEventFired", params: { timestamp: 42 } }));
    socket.send(JSON.stringify({ id: message.id, result: {} }));
  });
  const connection = await connect(browser.url);
  const events: unknown[] = [];
  try {
    const unsubscribe = connection.on("Page.loadEventFired", (event) => events.push(event));
    await connection.send("Page.enable");
    expect(events).toHaveLength(1);
    unsubscribe();
    await connection.send("Page.enable");
    expect(events).toHaveLength(1);
    const unsubscribeNext = connection.on("Page.loadEventFired", (event) => events.push(event));
    unsubscribe();
    await connection.send("Page.enable");
    expect(events).toHaveLength(2);
    unsubscribeNext();
    await expect(connection.send("invalid-method")).rejects.toThrow();
    await expect(
      connection.send("Page.enable", {
        toJSON() {
          connection.close();
          return {};
        },
      }),
    ).rejects.toThrow("Chrome connection closed");
  } finally {
    connection.close();
  }
});

test.concurrent("CDP connection and pending work respect cancellation", async () => {
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  await expect(
    connect("ws://127.0.0.1:1/devtools/browser/test", { signal: alreadyAborted.signal }),
  ).rejects.toThrow();
  for (const url of [
    "ws://example.com/devtools/browser/test",
    "ws://127.0.0.1.example.com/devtools/browser/test",
    "ws://user:password@127.0.0.1/devtools/browser/test",
    "ws://127.0.0.1/devtools/browser/test#fragment",
  ])
    await expect(connect(url)).rejects.toThrow();

  const controller = new AbortController();
  using browser = mockBrowser(() => controller.abort());
  const connection = await connect(browser.url, { signal: controller.signal });
  try {
    await expect(connection.send("Runtime.enable")).rejects.toThrow();
  } finally {
    connection.close();
  }
});

test.concurrent("CDP commands time out when the browser does not reply", async () => {
  using browser = mockBrowser(() => {});
  const connection = await connect(browser.url, { timeout: 500 });
  try {
    await expect(connection.send("Runtime.enable")).rejects.toThrow();
  } finally {
    connection.close();
  }
});

test.skipIf(!findExecutable())(
  "installed Chromium evaluates JavaScript and cleans up its temporary profile",
  async () => {
    const browser = await launch({ headless: true, timeout: 10_000 });
    const profile = browser.userDataDir;
    try {
      expect(existsSync(profile)).toBe(true);
      const version = await browser.connection.send<{ product: string; protocolVersion: string }>(
        "Browser.getVersion",
      );
      expect(version.product).toMatch(/Chrome|Chromium/);
      expect(version.protocolVersion).toMatch(/^\d+\.\d+$/);
      const { targetId } = await browser.connection.send<{ targetId: string }>(
        "Target.createTarget",
        { url: "about:blank" },
      );
      const { sessionId } = await browser.connection.send<{ sessionId: string }>(
        "Target.attachToTarget",
        { targetId, flatten: true },
      );
      const result = await browser.connection.send<{ result: { value: number } }>(
        "Runtime.evaluate",
        { expression: "6 * 7", returnByValue: true },
        sessionId,
      );
      expect(result.result.value).toBe(42);
    } finally {
      await browser.close();
    }
    expect(browser.connection.closed).toBe(true);
    expect(browser.process.exitCode !== null || browser.process.signalCode !== null).toBe(true);
    expect(existsSync(profile)).toBe(false);
  },
  20_000,
);

test.skipIf(!findExecutable())(
  "Chromium launch rejects cancellation and relative profiles before starting",
  async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(launch({ signal: controller.signal })).rejects.toThrow();
    await expect(launch({ userDataDir: "relative-profile" })).rejects.toThrow("absolute");
  },
);

test.skipIf(process.platform !== "win32" || !findExecutable())(
  "installed Chromium runs WebGPU compute in a secure local page",
  async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response("<!doctype html><title>Bun Chromium GPU</title>", {
          headers: { "Content-Type": "text/html" },
        });
      },
    });
    try {
      const browser = await launch({ url: server.url.href, headless: true, timeout: 10_000 });
      try {
        const { targetInfos } = await browser.connection.send<{
          targetInfos: { targetId: string; url: string }[];
        }>("Target.getTargets");
        const target = targetInfos.find((target) => target.url === server.url.href);
        expect(target).toBeDefined();
        const { sessionId } = await browser.connection.send<{ sessionId: string }>(
          "Target.attachToTarget",
          { targetId: target!.targetId, flatten: true },
        );
        await browser.connection.send("Page.enable", {}, sessionId);
        let unsubscribe = () => {};
        const loaded = new Promise<void>((resolve) => {
          unsubscribe = browser.connection.on("Page.loadEventFired", (_event, eventSession) => {
            if (eventSession === sessionId) resolve();
          });
        });
        try {
          await browser.connection.send("Page.navigate", { url: server.url.href }, sessionId);
          await loaded;
        } finally {
          unsubscribe();
        }
        const gpu = await browser.connection.gpu(sessionId);
        const version = await browser.connection.send("Browser.getVersion");
        console.info("Chromium GPU qualification", JSON.stringify({ version, gpu }));
        expect(gpu.available).toBe(true);
        expect(gpu.adapter).toBe(true);
        const result = await browser.connection.send<{
          result: { value: number };
          exceptionDetails?: unknown;
        }>(
          "Runtime.evaluate",
          {
            awaitPromise: true,
            returnByValue: true,
            expression: `(async () => {
            const adapter = await navigator.gpu.requestAdapter();
            const device = await adapter.requestDevice();
            const output = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
            const readback = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
            try {
              const module = device.createShaderModule({ code:
                "@group(0) @binding(0) var<storage, read_write> output: array<u32>; " +
                "@compute @workgroup_size(1) fn main() { output[0] = 42u; }" });
              const pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
              const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: output } }] });
              const encoder = device.createCommandEncoder();
              const pass = encoder.beginComputePass();
              pass.setPipeline(pipeline);
              pass.setBindGroup(0, group);
              pass.dispatchWorkgroups(1);
              pass.end();
              encoder.copyBufferToBuffer(output, 0, readback, 0, 4);
              device.queue.submit([encoder.finish()]);
              await readback.mapAsync(GPUMapMode.READ);
              const value = new Uint32Array(readback.getMappedRange())[0];
              readback.unmap();
              return value;
            } finally {
              output.destroy();
              readback.destroy();
              device.destroy();
            }
          })()`,
          },
          sessionId,
        );
        expect(result.exceptionDetails).toBeUndefined();
        expect(result.result.value).toBe(42);
      } finally {
        await browser.close();
      }
    } finally {
      server.stop(true);
    }
  },
  20_000,
);
