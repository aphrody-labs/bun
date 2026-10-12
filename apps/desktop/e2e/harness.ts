// SPDX-License-Identifier: Apache-2.0
/**
 * Drives the WebOS served by `startWebOS()` through `Bun.WebView`. The apps expose these
 * attributes for it: `data-webos-desktop`, `data-webos-launch`, `data-webos-window`
 * (+ `data-webos-ready`), `data-webos-result`, `data-webos-input`, `data-webos-action`,
 * `data-webos-entry|process|package|bench`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { startWebOS } from "../server.ts";

export type BackendName = "chrome" | "webview2";

export const APP_IDS = [
  "files",
  "processes",
  "kernel-monitor",
  "bun-repl",
  "bunsh",
  "apk-manager",
  "diagnostics",
] as const;
export type AppId = (typeof APP_IDS)[number];

/** Same lookup order as Bun's ChromeProcess.rs, enough to decide whether a Chrome backend can start. */
export function hasChrome(): boolean {
  if (process.env.BUN_CHROME_PATH) return existsSync(process.env.BUN_CHROME_PATH);
  const names =
    process.platform === "win32"
      ? ["chrome", "chromium", "brave", "msedge"]
      : ["google-chrome-stable", "google-chrome", "chromium-browser", "chromium", "brave-browser", "microsoft-edge"];
  if (names.some(name => Bun.which(name))) return true;
  if (process.platform !== "win32") return false;
  const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA].filter(Boolean);
  const relative = ["Google/Chrome/Application/chrome.exe", "Microsoft/Edge/Application/msedge.exe"];
  return roots.some(root => relative.some(rel => existsSync(join(root!, rel))));
}

/** Backends this host can run: Chrome where installed, plus WebView2 on Windows when the runtime accepts it. */
export function availableBackends(): BackendName[] {
  const list: BackendName[] = [];
  if (hasChrome()) list.push("chrome");
  if (process.platform === "win32" && supportsBackend("webview2")) list.push("webview2");
  return list;
}

function supportsBackend(name: string): boolean {
  try {
    new Bun.WebView({ backend: name as never, width: 1, height: 1 }).close();
    return true;
  } catch {
    return false;
  }
}

function backendOption(name: BackendName): Bun.WebView.Backend {
  // url: false — never attach to a developer's running Chrome.
  return name === "chrome" ? { type: "chrome", url: false } : (name as never);
}

export interface WebOSSession extends AsyncDisposable {
  readonly server: Awaited<ReturnType<typeof startWebOS>>;
  readonly view: Bun.WebView;
  readonly url: URL;
  /** Page-side console.error/warn lines and uncaught errors. */
  readonly pageErrors: string[];
  api<T = any>(path: string, init?: RequestInit): Promise<T>;
}

export async function openWebOS(backend: BackendName, size = { width: 1280, height: 800 }): Promise<WebOSSession> {
  const server = await startWebOS({ port: 0, hostname: "127.0.0.1" });
  const url = new URL(server.url);
  const pageErrors: string[] = [];
  const view = new Bun.WebView({
    backend: backendOption(backend),
    ...size,
    console: (type: string, ...args: unknown[]) => {
      if (type === "error") pageErrors.push(args.map(String).join(" "));
    },
  });
  view.addEventListener("Runtime.exceptionThrown", (event: Event) => {
    const details = (event as MessageEvent).data?.exceptionDetails;
    pageErrors.push(details?.exception?.description ?? details?.text ?? "uncaught exception");
  });
  try {
    await view.navigate(url.href);
    await waitFor(view, `document.querySelector("[data-webos-desktop]") !== null`);
  } catch (error) {
    view.close();
    server.stop(true);
    throw error;
  }
  return {
    server,
    view,
    url,
    pageErrors,
    async api(path, init) {
      const res = await fetch(new URL(path, url), init);
      if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path}: HTTP ${res.status}`);
      return res.json();
    },
    async [Symbol.asyncDispose]() {
      view.close();
      await server.stop(true);
    },
  };
}

/**
 * Resolves with the first truthy value of `expression`, re-checked on every DOM mutation inside the
 * page (no polling interval). Rejects after `timeoutMs` with the expression in the message.
 */
export async function waitFor<T = unknown>(view: Bun.WebView, expression: string, timeoutMs = 20_000): Promise<T> {
  return view.evaluate(`new Promise((resolve, reject) => {
    const read = () => { try { return (${expression}); } catch { return undefined; } };
    const timer = setTimeout(() => { observer.disconnect(); reject(new Error(${JSON.stringify(`waitFor timed out: ${expression}`)})); }, ${timeoutMs});
    const observer = new MutationObserver(() => {
      const value = read();
      if (value) { clearTimeout(timer); observer.disconnect(); resolve(value); }
    });
    const first = read();
    if (first) { clearTimeout(timer); resolve(first); }
    else observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  })`) as Promise<T>;
}

const q = (selector: string) => JSON.stringify(selector);
export const inWindow = (app: AppId, selector = "") => `[data-webos-window="${app}"] ${selector}`.trim();

/** Clicks the dock launcher and waits until the window reports its first data load. */
export async function openApp(view: Bun.WebView, app: AppId): Promise<void> {
  const ready = `[data-webos-window="${app}"][data-webos-ready]`;
  if (await view.evaluate(`document.querySelector(${q(ready)}) !== null`)) return;
  await view.click(`[data-webos-launch="${app}"]`);
  await waitFor(view, `document.querySelector(${q(ready)}) !== null`);
}

export function textOf(view: Bun.WebView, selector: string): Promise<string | null> {
  return view.evaluate(`document.querySelector(${q(selector)})?.textContent ?? null`) as Promise<string | null>;
}

/** Waits until `selector` exists and its text matches `pattern`; returns that text. */
export function waitForText(view: Bun.WebView, selector: string, pattern: RegExp, timeoutMs?: number): Promise<string> {
  return waitFor<string>(
    view,
    `(() => { const t = document.querySelector(${q(selector)})?.textContent ?? ""; return new RegExp(${q(pattern.source)}, ${q(pattern.flags)}).test(t) ? t : ""; })()`,
    timeoutMs,
  );
}

/** Values of `attribute` over every element matching `selector`. */
export function attributeValues(view: Bun.WebView, selector: string, attribute: string): Promise<string[]> {
  return view.evaluate(
    `[...document.querySelectorAll(${q(selector)})].map(el => el.getAttribute(${q(attribute)}))`,
  ) as Promise<string[]>;
}

/** Replaces the content of an input/textarea with real keystrokes. */
export async function fill(view: Bun.WebView, selector: string, value: string): Promise<void> {
  await view.click(selector);
  await view.evaluate(`(() => { const el = document.querySelector(${q(selector)}); el.focus(); el.select?.(); })()`);
  await view.press("Backspace");
  await view.type(value);
}
