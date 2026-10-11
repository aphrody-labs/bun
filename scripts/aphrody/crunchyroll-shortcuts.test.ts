// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { Script } from "node:vm";
import { startCrunchyrollShortcuts } from "./crunchyroll-shortcuts";

async function withServer(run: (origin: URL) => Promise<void>) {
  const server = await startCrunchyrollShortcuts({ port: 0, hostname: "127.0.0.1" });
  try {
    expect(server.port).toBeGreaterThan(0);
    await run(server.url);
  } finally {
    server.stop(true);
  }
}

function localPath(path: string, origin: URL): URL {
  const url = new URL(path, origin);
  expect(url.origin).toBe(origin.origin);
  return url;
}

test("shortcut server serves health and redirects its root to the local PWA", async () => {
  await withServer(async (origin) => {
    const health = await fetch(new URL("/health", origin));
    expect(health.status).toBe(200);
    expect(health.headers.get("content-type")).toContain("application/json");
    expect(await health.json()).toEqual({ service: "bun-crunchyroll-shortcuts" });
    const root = await fetch(origin, { redirect: "manual" });
    expect([301, 302, 303, 307, 308]).toContain(root.status);
    expect(localPath(root.headers.get("location")!, origin).pathname).toBe("/pwa/");
    const index = await fetch(new URL("/pwa/", origin));
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toContain("text/html");
    expect(await index.text()).toContain("manifest.webmanifest");
  });
});

test("PWA manifest and PNG install icons use local resources with real 192 and 512 dimensions", async () => {
  await withServer(async (origin) => {
    const response = await fetch(new URL("/pwa/manifest.webmanifest", origin));
    expect(response.status).toBe(200);
    const manifest = await response.json();
    expect(localPath(manifest.start_url, origin).pathname).toBe("/pwa/");
    expect(localPath(manifest.scope, origin).pathname).toBe("/pwa/");
    expect(["standalone", "minimal-ui", "fullscreen"]).toContain(manifest.display);
    for (const size of [192, 512]) {
      const icon = manifest.icons.find(
        (entry: { sizes: string }) => entry.sizes === `${size}x${size}`,
      );
      expect(icon).toBeDefined();
      expect(icon.type).toBe("image/png");
      const iconUrl = localPath(icon.src, new URL("/pwa/manifest.webmanifest", origin));
      const image = await fetch(iconUrl);
      expect(image.status).toBe(200);
      expect(image.headers.get("content-type")).toContain("image/png");
      const bytes = new Uint8Array(await image.arrayBuffer());
      expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(new TextDecoder().decode(bytes.subarray(12, 16))).toBe("IHDR");
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(view.getUint32(16)).toBe(size);
      expect(view.getUint32(20)).toBe(size);
    }
  });
});

test("local PWA shell assets are available to its service worker", async () => {
  await withServer(async (origin) => {
    const sw = await fetch(new URL("/pwa/sw.js", origin));
    expect(sw.status).toBe(200);
    expect(sw.headers.get("content-type")).toMatch(/(?:java|ecma)script/);
    const source = await sw.text();
    expect(source).toContain("bun-crunchyroll-shortcut-shell-");
    for (const path of [
      "index.html",
      "app.js",
      "styles.css",
      "locales.js",
      "manifest.webmanifest",
      "icons/icon192.png",
      "icons/icon512.png",
    ]) {
      expect(source).toContain(path);
      expect((await fetch(new URL(`/pwa/${path}`, origin))).status).toBe(200);
    }
  });
});

test("extension is Manifest V3 with no browser or host permissions", async () => {
  await withServer(async (origin) => {
    const response = await fetch(new URL("/extension/manifest.json", origin));
    expect(response.status).toBe(200);
    const manifest = await response.json();
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions ?? []).toEqual([]);
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.optional_permissions ?? []).toEqual([]);
    expect(manifest.optional_host_permissions ?? []).toEqual([]);
    expect(manifest.background).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    const popup = localPath(
      manifest.action.default_popup,
      new URL("/extension/manifest.json", origin),
    );
    expect((await fetch(popup)).status).toBe(200);
    expect((await fetch(new URL("/extension/_locales/fr/messages.json", origin))).status).toBe(200);
  });
});

test("HEAD preserves local content headers while POST has no write or authentication endpoint", async () => {
  await withServer(async (origin) => {
    for (const path of ["/health", "/pwa/", "/pwa/icons/icon192.png", "/extension/manifest.json"]) {
      const head = await fetch(new URL(path, origin), { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(head.headers.get("content-type")).not.toBeNull();
      expect(await head.text()).toBe("");
      const post = await fetch(new URL(path, origin), {
        method: "POST",
        body: "fixture-only-input",
      });
      expect(post.status).toBe(405);
    }
    for (const path of ["/auth", "/cookies", "/pwa/auth", "/extension/cookies"]) {
      expect((await fetch(new URL(path, origin))).status).toBe(404);
    }
  });
});

test("static allowlist rejects outside files and encoded traversal paths", async () => {
  await withServer(async (origin) => {
    for (const path of [
      "/cookie.json",
      "/hls.json",
      "/package.json",
      "/.git/config",
      "/pwa/.env",
      "/extension/cookie.json",
      "/pwa/%2e%2e%2fcookie.json",
      "/pwa/..%5ccookie.json",
      "/pwa/%2f..%2fcookie.json",
      "/extension/%252e%252e%252fpackage.json",
      "/extension/%2e%2e/%2e%2e/cookie.json",
    ]) {
      const response = await fetch(new URL(path, origin));
      expect(response.status).toBe(404);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });
});

test("local CSP permits the shell's assets without broad remote execution or credential reflection", async () => {
  await withServer(async (origin) => {
    const response = await fetch(new URL("/pwa/", origin), {
      headers: {
        Cookie: "fixture-only-credential",
        Authorization: "Bearer fixture-only-credential",
      },
    });
    expect(response.status).toBe(200);
    const csp = response.headers.get("content-security-policy");
    expect(csp).not.toBeNull();
    const directives = new Map(
      csp!.split(";").map((part) => {
        const [name, ...sources] = part.trim().split(/\s+/);
        return [name!, sources];
      }),
    );
    expect(directives.get("script-src") ?? directives.get("default-src")).toContain("'self'");
    expect(directives.get("img-src") ?? directives.get("default-src")).toContain("'self'");
    for (const directive of ["default-src", "script-src", "connect-src", "worker-src"]) {
      const sources = directives.get(directive) ?? [];
      expect(sources).not.toContain("*");
      expect(sources).not.toContain("https:");
      expect(sources).not.toContain("'unsafe-eval'");
    }
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).not.toContain("fixture-only-credential");
  });
});

type LocaleModule = {
  locales: Record<string, Record<string, string>>;
  languageNames: Record<string, string>;
  resolveLanguage(value: unknown): string;
};

test("eleven actual language catalogs and extension messages have matching nonempty keys", async () => {
  const pwa = (await import(
    new URL("../../crunchyroll-pwa/locales.js", import.meta.url).href
  )) as LocaleModule;
  const extension = (await import(
    new URL("../../crunchyroll-extension/locales.js", import.meta.url).href
  )) as LocaleModule;
  const languages = ["en", "fr", "es", "pt", "de", "it", "ar", "ja", "ko", "hi", "ru"];
  expect(Object.keys(pwa.locales).sort()).toEqual([...languages].sort());
  expect(Object.keys(pwa.languageNames).sort()).toEqual([...languages].sort());
  const keys = Object.keys(pwa.locales.en!).sort();
  await withServer(async (origin) => {
    for (const language of languages) {
      expect(Object.keys(pwa.locales[language]!).sort()).toEqual(keys);
      expect(extension.locales[language]).toEqual(pwa.locales[language]);
      for (const value of Object.values(pwa.locales[language]!))
        expect(value.trim().length).toBeGreaterThan(0);
      const messages = await (
        await fetch(new URL(`/extension/_locales/${language}/messages.json`, origin))
      ).json();
      expect(Object.keys(messages).sort()).toEqual(keys);
      for (const key of keys) expect(messages[key].message).toBe(pwa.locales[language]![key]);
    }
  });
  for (const [input, expected] of [
    ["fr-CA", "fr"],
    ["pt_BR", "pt"],
    ["EN-us", "en"],
    ["ar-SA", "ar"],
    ["zh-CN", "en"],
    ["", "en"],
    ["constructor", "en"],
    ["__proto__", "en"],
  ]) {
    expect(pwa.resolveLanguage(input)).toBe(expected!);
    expect(extension.resolveLanguage(input)).toBe(expected!);
  }
  expect(pwa.locales.ar!.open).toMatch(/[\u0600-\u06ff]/);
});

test("actual PWA renderer selects Arabic RTL, language variants and fallback without preference storage", async () => {
  const catalog = (await import(
    new URL("../../crunchyroll-pwa/locales.js", import.meta.url).href
  )) as LocaleModule;
  const listeners = new Map<string, () => void>();
  const select = {
    value: "",
    append() {},
    addEventListener(name: string, callback: () => void) {
      listeners.set(name, callback);
    },
  };
  const install = { disabled: true, addEventListener() {} };
  const installation = { textContent: "" },
    connectivity = { textContent: "" };
  const message = { dataset: { message: "open" }, textContent: "" };
  const document = {
    documentElement: { lang: "", dir: "" },
    title: "",
    querySelector(selector: string) {
      return {
        "#language": select,
        "#install": install,
        "#installation": installation,
        "#connectivity": connectivity,
      }[selector as "#language"];
    },
    querySelectorAll() {
      return [message];
    },
    createElement() {
      return { value: "", textContent: "" };
    },
  };
  const source = await Bun.file(new URL("../../crunchyroll-pwa/app.js", import.meta.url)).text();
  const executable = source.replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?\s*/m, "");
  new Script(executable).runInNewContext({
    ...catalog,
    document,
    localStorage: {
      getItem() {
        throw new Error("Preference storage unavailable");
      },
      setItem() {
        throw new Error("Preference storage unavailable");
      },
    },
    navigator: { language: "ar-SA", onLine: false },
    window: { addEventListener() {}, isSecureContext: false },
  });
  expect(document.documentElement).toEqual({ lang: "ar", dir: "rtl" });
  expect(message.textContent).toBe(catalog.locales.ar!.open!);
  select.value = "pt_BR";
  listeners.get("change")!();
  expect(document.documentElement).toEqual({ lang: "pt", dir: "ltr" });
  expect(message.textContent).toBe(catalog.locales.pt!.open!);
  select.value = "unsupported";
  listeners.get("change")!();
  expect(document.documentElement).toEqual({ lang: "en", dir: "ltr" });
  expect(document.title).toBe(catalog.locales.en!.appName!);
});

test("actual service worker caches only the local shell and cleans only its own stale caches", async () => {
  const handlers = new Map<string, (event: unknown) => void>();
  const origin = "http://localhost";
  const stored = new Map<string, Response>();
  const fetched: Request[] = [];
  const requestInitializations: RequestInit[] = [];
  // Bun's Request metadata differs here; model Chrome's explicit RequestInit credentials contract.
  class BrowserRequest extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init);
      Object.defineProperty(this, "credentials", {
        value:
          init?.credentials ??
          (input instanceof BrowserRequest ? input.credentials : "same-origin"),
      });
      requestInitializations.push({ ...init });
    }
  }
  const deleted: string[] = [];
  let claimed = false,
    skipped = false;
  const cache = {
    async put(request: Request, response: Response) {
      stored.set(request.url, response);
    },
    async match(url: string) {
      return stored.get(url);
    },
  };
  const source = await Bun.file(new URL("../../crunchyroll-pwa/sw.js", import.meta.url)).text();
  new Script(source).runInNewContext({
    URL,
    Request: BrowserRequest,
    Response,
    self: {
      location: { origin },
      addEventListener(name: string, callback: (event: unknown) => void) {
        handlers.set(name, callback);
      },
      async skipWaiting() {
        skipped = true;
      },
      clients: {
        async claim() {
          claimed = true;
        },
      },
    },
    caches: {
      async open() {
        return cache;
      },
      async keys() {
        return [
          "bun-crunchyroll-shortcut-shell-v0",
          "bun-crunchyroll-shortcut-shell-v1",
          "other-owner-cache",
        ];
      },
      async delete(name: string) {
        deleted.push(name);
        return true;
      },
    },
    async fetch(request: Request) {
      fetched.push(request);
      const response = new Response("local-shell");
      Object.defineProperty(response, "type", { value: "basic" });
      return response;
    },
  });
  let installation: Promise<unknown> = Promise.resolve();
  handlers.get("install")!({
    waitUntil(value: Promise<unknown>) {
      installation = value;
    },
  });
  await installation;
  expect(skipped).toBe(true);
  expect(fetched.length).toBe(8);
  expect(requestInitializations).toHaveLength(8);
  for (const init of requestInitializations) {
    expect(init.cache).toBe("reload");
    expect(init.credentials).toBe("omit");
  }
  for (const request of fetched) {
    expect(new URL(request.url).origin).toBe(origin);
    expect(new URL(request.url).pathname.startsWith("/pwa/")).toBe(true);
    expect(request.method).toBe("GET");
    expect(request.credentials).toBe("omit");
  }
  let activation: Promise<unknown> = Promise.resolve();
  handlers.get("activate")!({
    waitUntil(value: Promise<unknown>) {
      activation = value;
    },
  });
  await activation;
  expect(deleted).toEqual(["bun-crunchyroll-shortcut-shell-v0"]);
  expect(claimed).toBe(true);
  let shellResponse: Promise<Response> | undefined;
  handlers.get("fetch")!({
    request: new Request(`${origin}/pwa/`),
    respondWith(value: Promise<Response>) {
      shellResponse = value;
    },
  });
  expect(await shellResponse!.then((response) => response.text())).toBe("local-shell");
  expect(fetched.length).toBe(8);
  for (const [url, method] of [
    ["https://www.crunchyroll.com/fr/watch/fixture", "GET"],
    [`${origin}/auth`, "GET"],
    [`${origin}/cookies`, "GET"],
    [`${origin}/pwa/media.mp4`, "GET"],
    [`${origin}/pwa/manifest.mpd`, "GET"],
    [`${origin}/pwa/?token=fixture`, "GET"],
    [`${origin}/pwa/app.js`, "POST"],
  ]) {
    let intercepted = false;
    handlers.get("fetch")!({
      request: new Request(url!, { method }),
      respondWith() {
        intercepted = true;
      },
    });
    expect(intercepted).toBe(false);
  }
  expect(fetched.length).toBe(8);
});
