// SPDX-License-Identifier: Apache-2.0
// oxlint-disable-next-line import/no-unassigned-import -- démarre le serveur de test par son effet de bord à l'import
import "./server.ts";
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserPage } from "../src/index.ts";

/** A document whose head is sent at once and whose body waits for `release()`: committed, but not loaded. */
function startFixture() {
  const gate = Promise.withResolvers<void>();
  const headSent = Promise.withResolvers<void>();
  const encoder = new TextEncoder();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(encoder.encode("<!doctype html><title>streamed</title><p>head</p>"));
            headSent.resolve();
            await gate.promise;
            controller.enqueue(encoder.encode('<p id="tail">tail</p>'));
            controller.close();
          },
        }),
        { headers: { "content-type": "text/html" } },
      ),
  });
  return { server, headSent: headSent.promise, release: () => gate.resolve() };
}

async function gotoWaitsForLoad(endpoint?: string) {
  const { server, headSent, release } = startFixture();
  const page = await BrowserPage.connect(endpoint);
  try {
    let settled = false;
    const navigation = page.goto(`http://127.0.0.1:${server.port}/`).then(response => {
      settled = true;
      return response;
    });
    await headSent;
    // Give a goto that returns at commit time the chance to do so; the load event cannot fire before release().
    await Promise.race([navigation, Bun.sleep(500)]);
    expect(settled).toBe(false);
    release();
    const response = await navigation;
    expect(response.status).toBe(200);
    expect(await page.evaluate("document.getElementById('tail')?.textContent")).toBe("tail");
  } finally {
    release();
    await page.close();
    await server.stop(true);
  }
}

test("goto resolves on the load event, after the whole document arrived (engine endpoint)", () =>
  gotoWaitsForLoad());

// Chrome answers a raw Page.navigate when the navigation commits, so this is the case that needs the load wait.
const chrome = process.env.BUN_CHROME_PATH ?? Bun.which("google-chrome-stable") ?? Bun.which("chromium");
test.skipIf(!chrome)("goto resolves on the load event on Chrome", async () => {
  const profile = mkdtempSync(join(tmpdir(), "bun-web-chrome-"));
  const child = Bun.spawn(
    [
      chrome!,
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  try {
    // Chrome writes DevToolsActivePort (port, then browser path) once the endpoint listens.
    const file = join(profile, "DevToolsActivePort");
    const deadline = Date.now() + 15_000;
    let published = "";
    while (!published.includes("\n") && Date.now() < deadline) {
      published = existsSync(file) ? readFileSync(file, "utf8") : "";
      if (!published.includes("\n")) await Bun.sleep(25);
    }
    const [port, path] = published.trim().split("\n");
    expect(port).toBeTruthy();
    await gotoWaitsForLoad(`ws://127.0.0.1:${port}${path}`);
  } finally {
    child.kill("SIGKILL");
    await child.exited;
    rmSync(profile, { recursive: true, force: true });
  }
});
