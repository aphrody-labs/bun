// SPDX-License-Identifier: Apache-2.0
/**
 * Bun WebOS desktop: one executable (`bun build --compile`, see build.ts) that embeds the WebOS
 * server and its assets, serves them on 127.0.0.1 (random port) and shows them in a
 * `Bun.WebView` window (`headless: false`). Closing the window stops the server and exits.
 *
 *   bun-webos                 open the window
 *   bun-webos --smoke         open it, wait for the desktop, print a JSON report, exit 0
 *   bun-webos --port 4000     fixed port (default: random)
 */
import { parseArgs } from "node:util";
import { startWebOS } from "../server.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    smoke: { type: "boolean", default: false },
    port: { type: "string", default: "0" },
    width: { type: "string", default: "1280" },
    height: { type: "string", default: "800" },
    chrome: { type: "string" },
  },
  strict: true,
});

const server = await startWebOS({ port: Number(values.port), hostname: "127.0.0.1" });
const view = new Bun.WebView({
  backend: { type: "chrome", url: false, ...(values.chrome ? { path: values.chrome } : {}) },
  headless: false,
  width: Number(values.width),
  height: Number(values.height),
  console: values.smoke ? undefined : globalThis.console,
});

const { promise: closed, resolve: onClosed } = Promise.withResolvers<void>();
view.addEventListener("Target.detachedFromTarget", () => onClosed());

async function shutdown(code: number): Promise<never> {
  view.close();
  await server.stop(true);
  process.exit(code);
}
process.on("SIGINT", () => void shutdown(130));
process.on("SIGTERM", () => void shutdown(143));

await view.navigate(server.url.href);

if (values.smoke) {
  const report = await view.evaluate(`new Promise((resolve, reject) => {
    const read = () => document.querySelector("[data-webos-desktop]") && {
      title: document.title,
      launchers: [...document.querySelectorAll("[data-webos-launch]")].map(el => el.getAttribute("data-webos-launch")),
      userAgent: navigator.userAgent,
    };
    const timer = setTimeout(() => reject(new Error("WebOS desktop did not mount")), 30000);
    const done = value => { clearTimeout(timer); observer.disconnect(); resolve(value); };
    const observer = new MutationObserver(() => { const v = read(); if (v) done(v); });
    const first = read();
    if (first) done(first); else observer.observe(document, { subtree: true, childList: true });
  })`);
  const { windowId } = await view.cdp<{ windowId: number }>("Browser.getWindowForTarget");
  const { bounds } = await view.cdp<{ bounds: { windowState: string; width: number; height: number } }>(
    "Browser.getWindowBounds",
    { windowId },
  );
  console.log(
    JSON.stringify({
      ok: true,
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
      compiled: Bun.main.includes("$bunfs") || Bun.main.includes("~BUN"),
      url: server.url.href,
      window: bounds,
      ...(report as object),
    }),
  );
  await shutdown(0);
}

await closed;
await shutdown(0);
