// SPDX-License-Identifier: Apache-2.0
/**
 * Bun WebOS desktop: one executable (`bun build --compile`, see build.ts) that embeds the WebOS
 * server and its built assets, serves them on 127.0.0.1 (random port) and shows them in a
 * `Bun.WebView` window (`headless: false`). Closing the window stops the server and exits.
 *
 *   bun-webos                 open the window
 *   bun-webos --smoke         open it, wait for the desktop, print a JSON report, exit 0
 *   bun-webos --port 4000     fixed port (default: random)
 *
 * A runtime older than `headless: false` (ERR_METHOD_NOT_IMPLEMENTED) falls back to Chrome's
 * `--app=<url>` window; the smoke report then reads the page through a headless Bun.WebView.
 */
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { startWebOS, type WebOSOptions } from "../server.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    smoke: { type: "boolean", default: false },
    port: { type: "string", default: "0" },
    width: { type: "string", default: "1280" },
    height: { type: "string", default: "800" },
    chrome: { type: "string" },
    "no-sandbox": { type: "boolean", default: false },
  },
  strict: true,
});
const width = Number(values.width);
const height = Number(values.height);

function cacheRoot(): string {
  if (process.platform === "win32")
    return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "bun-webos");
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "bun-webos");
}

/** The compiled exe embeds dist/ (page bundle, workers, wasm) as webos-dist.tar.gz; extracted once per content hash. */
async function embeddedDist(): Promise<string | undefined> {
  const blob = Bun.embeddedFiles.find(file => (file as Blob & { name: string }).name.startsWith("webos-dist"));
  if (!blob) return undefined;
  const bytes = await blob.bytes();
  const dir = join(cacheRoot(), "dist", Bun.hash(bytes).toString(16));
  if (!existsSync(join(dir, ".complete"))) {
    mkdirSync(dir, { recursive: true });
    await new Bun.Archive(bytes).extract(dir);
    await Bun.write(join(dir, ".complete"), "");
  }
  return dir;
}

const distDir = await embeddedDist();
const options: WebOSOptions = {
  port: Number(values.port),
  hostname: "127.0.0.1",
  development: false,
  ...(distDir ? { distDir, wasmDir: join(distDir, "wasm") } : {}),
};
const server = await startWebOS(options);
const url = server.url.href;

const READ_DESKTOP = `new Promise((resolve, reject) => {
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
})`;

// In a container Chrome has no user namespaces for its sandbox and /dev/shm is 64 MB (renderer crashes).
const noSandbox = values["no-sandbox"] || existsSync("/.dockerenv") || existsSync("/run/.containerenv");
const chromeArgs = noSandbox ? ["--no-sandbox", "--disable-dev-shm-usage"] : [];
const backend = {
  type: "chrome" as const,
  url: false as const,
  argv: chromeArgs,
  ...(values.chrome ? { path: values.chrome } : {}),
};

interface DesktopWindow {
  mode: "webview" | "app";
  closed: Promise<unknown>;
  bounds(): Promise<unknown>;
  read(): Promise<unknown>;
  close(): void;
}

function openWebView(): DesktopWindow | undefined {
  let view: Bun.WebView;
  try {
    view = new Bun.WebView({
      backend,
      headless: false,
      width,
      height,
      console: values.smoke ? undefined : globalThis.console,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_METHOD_NOT_IMPLEMENTED") return undefined;
    throw error;
  }
  const { promise: closed, resolve } = Promise.withResolvers<void>();
  view.addEventListener("Target.detachedFromTarget", () => resolve());
  return {
    mode: "webview",
    closed,
    async bounds() {
      const { windowId } = await view.cdp<{ windowId: number }>("Browser.getWindowForTarget");
      return (await view.cdp<{ bounds: unknown }>("Browser.getWindowBounds", { windowId })).bounds;
    },
    read: async () => {
      await view.navigate(url);
      return view.evaluate(READ_DESKTOP);
    },
    close: () => view.close(),
  };
}

function findChrome(): string {
  const candidates = [values.chrome, process.env.BUN_CHROME_PATH];
  for (const name of ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome", "chrome", "msedge"])
    candidates.push(Bun.which(name) ?? undefined);
  const found = candidates.find((path): path is string => !!path && existsSync(path));
  if (!found) throw new Error("no Chrome/Chromium for the --app window (set BUN_CHROME_PATH or pass --chrome)");
  return found;
}

function openAppWindow(): DesktopWindow {
  const profile = join(cacheRoot(), "chrome-profile");
  mkdirSync(profile, { recursive: true });
  const chrome = Bun.spawn({
    cmd: [
      findChrome(),
      `--app=${url}`,
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      "--no-first-run",
      "--no-default-browser-check",
      ...chromeArgs,
    ],
    stdio: ["ignore", "ignore", "ignore"],
  });
  return {
    mode: "app",
    closed: chrome.exited,
    bounds: async () => ({ width, height, windowState: "normal", pid: chrome.pid }),
    read: async () => {
      await using probe = new Bun.WebView({ backend, width, height });
      await probe.navigate(url);
      return await probe.evaluate(READ_DESKTOP);
    },
    close: () => chrome.kill(),
  };
}

const window = openWebView() ?? openAppWindow();

async function shutdown(code: number): Promise<never> {
  window.close();
  // stop() waits on the page worker socket Chrome keeps open; exit regardless after a bound.
  await Promise.race([server.stop(true), Bun.sleep(2000)]);
  process.exit(code);
}
process.on("SIGINT", () => void shutdown(130));
process.on("SIGTERM", () => void shutdown(143));

const report = await window.read();
if (values.smoke) {
  console.log(
    JSON.stringify({
      ok: true,
      bun: Bun.version,
      revision: Bun.revision,
      platform: process.platform,
      arch: process.arch,
      compiled: Bun.main.includes("$bunfs") || Bun.main.includes("~BUN"),
      mode: window.mode,
      url,
      window: await window.bounds(),
      ...(report as object),
    }),
  );
  await shutdown(0);
}

await window.closed;
await shutdown(0);
