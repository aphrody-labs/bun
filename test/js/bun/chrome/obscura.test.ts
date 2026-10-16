import { expect, test } from "bun:test";
import obscura, { connect, findExecutable, launch } from "bun:obscura";
import chromium from "bun:chromium";

test("Obscura exposes the same helpers through named and default exports", () => {
  expect(obscura.connect).toBe(connect);
  expect(obscura.launch).toBe(launch);
  expect(obscura.findExecutable).toBe(findExecutable);
  expect(findExecutable()).toBe(chromium.findExecutable());
});

test("Obscura validates worker counts before launching", async () => {
  for (const workers of [0, -1, 65, 1.5, NaN, Infinity]) await expect(launch({ workers })).rejects.toThrow(/workers/i);
  await expect(launch({ workers: 2 })).rejects.toThrow(/one browser worker/i);
});

test("Obscura rejects an already aborted launch", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(launch({ signal: controller.signal })).rejects.toThrow();
});

test.skipIf(!findExecutable())(
  "installed Obscura evaluates JavaScript in an attached target and exits on close",
  async () => {
    const browser = await launch({ workers: 1, headless: true, timeout: 10_000 });
    try {
      expect(browser.engine).toBe("chromium");
      const endpoint = new URL(browser.endpoint);
      expect(endpoint.protocol).toBe("ws:");
      expect(["127.0.0.1", "localhost", "[::1]"]).toContain(endpoint.hostname);
      const version = await browser.connection.send<{ product: string; protocolVersion: string }>("Browser.getVersion");
      expect(version.product.length).toBeGreaterThan(0);
      expect(version.protocolVersion).toMatch(/^\d+\.\d+$/);
      const { targetId } = await browser.connection.send<{ targetId: string }>("Target.createTarget", {
        url: "about:blank",
      });
      const { sessionId } = await browser.connection.send<{ sessionId: string }>("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
      const result = await browser.connection.send<{
        result: { value: number };
        exceptionDetails?: unknown;
      }>("Runtime.evaluate", { expression: "6 * 7", returnByValue: true }, sessionId);
      expect(result.exceptionDetails).toBeUndefined();
      expect(result.result.value).toBe(42);
    } finally {
      await browser.close();
    }
    expect(browser.connection.closed).toBe(true);
    expect(browser.process.exitCode !== null || browser.process.signalCode !== null).toBe(true);
  },
  15_000,
);
