import { expect, spyOn, test } from "bun:test";
import { connect, findExecutable, launch, manifests, profiles, protocol } from "bun:chromium";
import { bunEnv, bunExe, tempDir } from "harness";
import { chmodSync, existsSync, readFileSync } from "node:fs";

test("native profile applications delegate to the owning browser without a debugging flag", () => {
  const options = {
    url: "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys",
    executable: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    userDataDir: "C:/Users/fixture/AppData/Local/Google/Chrome/User Data",
  };
  expect(profiles.planApplication(options)).toEqual([
    options.executable,
    `--user-data-dir=${options.userDataDir}`,
    "--profile-directory=Default",
    `--app=${options.url}`,
  ]);
  for (const profileDirectory of ["..", "../Default", "Default/Other", "Default\0"]) {
    expect(() => profiles.planApplication({ ...options, profileDirectory })).toThrow("single directory");
  }
  expect(typeof Bun.WebView.openApplication).toBe("function");
  expect(typeof Bun.WebView.prototype.importProfile).toBe("function");
});

test("profile applications select the existing last-used Chrome profile and honor an explicit selection", async () => {
  using directory = tempDir("application-profiles", {
    "Local State": JSON.stringify({
      profile: {
        last_used: "Profile 1",
        info_cache: { Default: { name: "Default" }, "Profile 1": { name: "Fixture" } },
      },
    }),
    Default: { Preferences: "{}" },
    "Profile 1": { Preferences: "{}" },
  });
  const unref = () => undefined;
  const spawn = spyOn(Bun, "spawn").mockReturnValue({ pid: 123, unref } as any);
  const options = { url: "https://example.test/app", executable: "/fixture/chrome", userDataDir: String(directory) };
  try {
    expect((await Bun.WebView.openApplication(options)).profileDirectory).toBe("Profile 1");
    const [command, processOptions] = spawn.mock.calls[0]!;
    expect(command).toContain("--profile-directory=Profile 1");
    expect(command).toContain("--app=https://example.test/app");
    expect(processOptions).toEqual({ stdin: "ignore", stdout: "ignore", stderr: "ignore", detached: true });
    expect((await Bun.WebView.openApplication({ ...options, profileDirectory: "Default" })).profileDirectory).toBe(
      "Default",
    );
    expect(spawn.mock.calls[1]![0]).toContain("--profile-directory=Default");
  } finally {
    spawn.mockRestore();
  }
});

test("site import copies acknowledged cookies and only explicitly selected same-origin sessions", async () => {
  const calls: any[] = [];
  const writes: any[] = [];
  const navigations: string[] = [];
  using browser = mockBrowser((message, socket) => {
    calls.push(message);
    let result: unknown = {};
    if (message.method === "Target.getTargets")
      result = {
        targetInfos: [
          { type: "page", targetId: "owned", url: "https://site.test/account", title: "Account" },
          { type: "page", targetId: "other", url: "https://other.test/", title: "Other" },
          { type: "page", targetId: "port", url: "https://site.test:8443/", title: "Other origin" },
          { type: "worker", targetId: "worker", url: "https://site.test/worker" },
        ],
      };
    if (message.method === "Target.attachToTarget") result = { sessionId: "source-session" };
    if (message.method === "Network.getCookies")
      result = {
        cookies: [
          {
            name: "fixture",
            value: "fixture-value",
            domain: "site.test",
            path: "/",
            secure: true,
            httpOnly: true,
            session: true,
            expires: -1,
            size: 28,
            sameSite: "Lax",
          },
        ],
      };
    socket.send(JSON.stringify({ id: message.id, result }));
  });
  const source = await connect(browser.url);
  const view = {
    async cdp(method: string, params: unknown) {
      writes.push({ method, params });
      if (method === "Network.getCookies")
        return {
          cookies: [
            {
              name: "fixture",
              value: "fixture-value",
              domain: "site.test",
              path: "/",
              secure: true,
              httpOnly: true,
              sameSite: "Lax",
            },
          ],
        };
      return {};
    },
    async navigate(url: string) {
      navigations.push(url);
    },
  } as unknown as Bun.WebView;
  try {
    const result = await profiles.importSite({ source, view, site: "https://site.test/", navigate: "owned" });
    expect(calls.map(call => call.method)).toEqual([
      "Target.getTargets",
      "Target.attachToTarget",
      "Network.getCookies",
      "Target.detachFromTarget",
    ]);
    expect(calls[2].params).toEqual({ urls: ["https://site.test/"] });
    expect(calls[2].sessionId).toBe("source-session");
    expect(writes).toEqual([
      {
        method: "Network.setCookies",
        params: {
          cookies: [
            {
              name: "fixture",
              value: "fixture-value",
              url: "https://site.test/",
              path: "/",
              secure: true,
              httpOnly: true,
              sameSite: "Lax",
            },
          ],
        },
      },
      { method: "Network.getCookies", params: { urls: ["https://site.test/"] } },
    ]);
    expect(navigations).toEqual(["https://site.test/account"]);
    expect(result).toEqual({
      site: "https://site.test",
      cookiesRequested: 1,
      cookiesImported: 1,
      sessions: [{ targetId: "owned", url: "https://site.test/account", title: "Account" }],
      navigated: true,
    });
    expect(JSON.stringify(result)).not.toContain("fixture-value");
  } finally {
    source.close();
  }
});

test("site import rejects passwords before calling either browser", async () => {
  const calls: string[] = [];
  const source = {
    async send() {
      calls.push("source");
    },
  } as any;
  const view = {
    async cdp() {
      calls.push("destination");
    },
  } as any;
  await expect(profiles.importSite({ source, view, site: "https://site.test/", passwords: true })).rejects.toThrow(
    "Stored password import is unavailable",
  );
  expect(calls).toEqual([]);
});

test("site import rejects foreign cookies and negative destination acknowledgement without navigation", async () => {
  for (const domain of ["other.test", "site.test"]) {
    const writes: string[] = [];
    using browser = mockBrowser((message, socket) =>
      socket.send(
        JSON.stringify({
          id: message.id,
          result: {
            cookies: [{ name: "fixture", value: "fixture-value", domain, path: "/", secure: true, session: true }],
          },
        }),
      ),
    );
    const source = await connect(browser.url);
    const view = {
      async cdp() {
        writes.push("cookies");
        return { success: false };
      },
    } as any;
    try {
      await expect(
        profiles.importSite({
          source,
          sourceSessionId: "existing-session",
          view,
          site: "https://site.test/",
          sessions: false,
        }),
      ).rejects.toThrow(domain === "other.test" ? "outside the selected site" : "rejected the site cookies");
      expect(writes).toEqual(domain === "other.test" ? [] : ["cookies"]);
    } finally {
      source.close();
    }
  }
});

test("site import narrows parent domain cookies and verifies the destination rather than trusting acknowledgement", async () => {
  for (const includeSubdomains of [false, true]) {
    let written: any;
    using browser = mockBrowser((message, socket) =>
      socket.send(
        JSON.stringify({
          id: message.id,
          result: {
            cookies: [
              {
                name: "fixture",
                value: "fixture-value",
                domain: ".parent.test",
                path: "/",
                secure: true,
                session: true,
              },
            ],
          },
        }),
      ),
    );
    const source = await connect(browser.url);
    const view = {
      async cdp(method: string, params: any) {
        if (method === "Network.setCookies") {
          written = params.cookies[0];
          return {};
        }
        return { cookies: [{ ...written, domain: includeSubdomains ? ".child.parent.test" : "child.parent.test" }] };
      },
    } as any;
    try {
      const result = await profiles.importSite({
        source,
        sourceSessionId: "existing-session",
        view,
        site: "https://child.parent.test/",
        sessions: false,
        includeSubdomains,
      });
      expect(written.domain).toBe(includeSubdomains ? ".child.parent.test" : undefined);
      expect(written.url).toBe("https://child.parent.test/");
      expect(result.cookiesImported).toBe(1);
    } finally {
      source.close();
    }
  }
  using browser = mockBrowser((message, socket) =>
    socket.send(
      JSON.stringify({
        id: message.id,
        result: {
          cookies: [
            { name: "fixture", value: "fixture-value", domain: "site.test", path: "/", secure: true, session: true },
          ],
        },
      }),
    ),
  );
  const source = await connect(browser.url);
  try {
    const view = {
      async cdp(method: string) {
        return method === "Network.setCookies" ? {} : { cookies: [] };
      },
    } as any;
    await expect(
      profiles.importSite({
        source,
        sourceSessionId: "existing-session",
        view,
        site: "https://site.test/",
        sessions: false,
      }),
    ).rejects.toThrow("did not verify the site cookies");
  } finally {
    source.close();
  }
});

test("site import rejects a foreign first-party cookie partition before destination mutation", async () => {
  let writes = 0;
  using browser = mockBrowser((message, socket) =>
    socket.send(
      JSON.stringify({
        id: message.id,
        result: {
          cookies: [
            {
              name: "fixture",
              value: "fixture-value",
              domain: "site.test",
              path: "/",
              secure: true,
              session: true,
              partitionKey: { topLevelSite: "https://other.test", hasCrossSiteAncestor: false },
            },
          ],
        },
      }),
    ),
  );
  const source = await connect(browser.url);
  try {
    const view = {
      async cdp() {
        writes++;
      },
    } as any;
    await expect(
      profiles.importSite({
        source,
        sourceSessionId: "existing-session",
        view,
        site: "https://site.test/",
        sessions: false,
      }),
    ).rejects.toThrow("partition does not match");
    expect(writes).toBe(0);
  } finally {
    source.close();
  }
});

test.skipIf(process.platform !== "win32")("Chromium discovery skips command wrappers on Windows PATH", async () => {
  using dir = tempDir("chromium-native-discovery", {
    "chromium.cmd": "@echo off\r\nexit /b 1\r\n",
    "chrome.exe": "",
  });
  await using child = Bun.spawn({
    cmd: [bunExe(), "-e", 'console.log(require("bun:chromium").findExecutable())'],
    env: { ...bunEnv, PATH: String(dir), BUN_CHROMIUM_PATH: undefined, BUN_CHROME_PATH: undefined },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  expect(stdout.trim().replaceAll("\\", "/")).toBe(`${String(dir).replaceAll("\\", "/")}/chrome.exe`);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});

test.skipIf(process.platform === "win32")(
  "Chromium close requests browser shutdown before termination and disposes idempotently",
  async () => {
    using dir = tempDir("chromium-close", {
      "browser": `#!${bunExe()}
const profile = process.argv.find(value => value.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
const server = Bun.serve({
  hostname: '127.0.0.1', port: 0,
  fetch(request, server) { if (server.upgrade(request)) return; return new Response(null, { status: 400 }); },
  websocket: { message(socket, data) {
    const message = JSON.parse(String(data));
    if (message.method === 'Browser.close') {
      require('node:fs').writeFileSync(require('node:path').dirname(Bun.main) + '/closed', JSON.stringify({ profile, basic: process.argv.includes('--password-store=basic') }));
      socket.send(JSON.stringify({ id: message.id, result: {} }));
      server.stop(true);
    }
  } }
});
console.error('DevTools listening on ws://127.0.0.1:' + server.port + '/devtools/browser/test');
`,
    });
    chmodSync(`${dir}/browser`, 0o755);
    const browser = await launch({ executable: `${dir}/browser`, headless: true, timeout: 2000 });
    const profile = browser.userDataDir;
    await browser[Symbol.asyncDispose]();
    await browser.close();
    expect(JSON.parse(readFileSync(`${dir}/closed`, "utf8"))).toEqual({ profile, basic: process.platform === "linux" });
    expect(browser.connection.closed).toBe(true);
    expect(existsSync(profile)).toBe(false);
    expect(browser.process.exitCode).toBe(0);
    const persistentProfile = `${dir}/persistent-profile`;
    const persistent = await launch({
      executable: `${dir}/browser`,
      headless: true,
      userDataDir: persistentProfile,
      timeout: 2000,
    });
    await persistent.close();
    expect(JSON.parse(readFileSync(`${dir}/closed`, "utf8"))).toEqual({ profile: persistentProfile, basic: false });
    expect(existsSync(persistentProfile)).toBe(true);
  },
);

test("Chromium launch retries a transient first debugging upgrade within its deadline", async () => {
  using dir = tempDir("chromium-upgrade-retry", {
    [process.platform === "win32" ? "server.ts" : "browser"]: `#!${bunExe()}
let attempts = 0;
const server = Bun.serve({
  hostname: '127.0.0.1', port: 0,
  fetch(request, server) {
    attempts++;
    if (attempts === 1) return new Response('not ready', { status: 503 });
    if (server.upgrade(request)) return;
    return new Response(null, { status: 400 });
  },
  websocket: { message(socket, data) {
    const message = JSON.parse(String(data));
    if (message.method === 'Browser.getVersion') socket.send(JSON.stringify({ id: message.id, result: { attempts } }));
    if (message.method === 'Browser.close') {
      socket.send(JSON.stringify({ id: message.id, result: {} }));
      server.stop(true);
    }
  } }
});
console.error('DevTools listening on ws://127.0.0.1:' + server.port + '/devtools/browser/test');
`,
    ...(process.platform === "win32" ? { "browser.cmd": `@"${bunExe()}" "%~dp0server.ts" %*\r\n` } : {}),
  });
  const executable = `${dir}/${process.platform === "win32" ? "browser.cmd" : "browser"}`;
  if (process.platform !== "win32") chmodSync(executable, 0o755);
  await using browser = await launch({ executable, timeout: 2000 });
  const result = await browser.connection.send<{ attempts: number }>("Browser.getVersion");
  expect(result.attempts).toBe(2);
  await browser.close();
  expect(browser.process.exitCode).toBe(0);
  expect(existsSync(browser.userDataDir)).toBe(false);
});

test.skipIf(process.platform === "win32")(
  "Chromium cancellation terminates an unresponsive browser and retains an explicit profile",
  async () => {
    using dir = tempDir("chromium-cancel", {
      "browser": `#!${bunExe()}
const server = Bun.serve({
  hostname: '127.0.0.1', port: 0,
  fetch(request, server) { if (server.upgrade(request)) return; return new Response(null, { status: 400 }); },
  websocket: { message() {} }
});
console.error('DevTools listening on ws://127.0.0.1:' + server.port + '/devtools/browser/test');
`,
      "profile/keep": "owner profile",
    });
    chmodSync(`${dir}/browser`, 0o755);
    const controller = new AbortController();
    const browser = await launch({
      executable: `${dir}/browser`,
      userDataDir: `${dir}/profile`,
      signal: controller.signal,
      timeout: 2000,
    });
    controller.abort();
    await browser.close();
    expect(browser.connection.closed).toBe(true);
    expect(readFileSync(`${dir}/profile/keep`, "utf8")).toBe("owner profile");
    expect(browser.process.signalCode).toBe("SIGKILL");
  },
);

function mockBrowser(handler: (message: any, socket: any) => void) {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request, server) {
      if (new URL(request.url).pathname === "/json/version")
        return Response.json({ webSocketDebuggerUrl: `ws://127.0.0.1:${server.port}/devtools/browser/test` });
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
  for (const url of ["javascript:alert(1)", "file:///secret", "chrome://settings", "data:text/html,test", "relative"])
    expect(() => protocol.validateURL(url)).toThrow();
  const executable = findExecutable();
  expect(executable === null || typeof executable === "string").toBe(true);
});

test.concurrent("CDP discovers the browser WebSocket from an HTTP endpoint", async () => {
  using browser = mockBrowser((message, socket) =>
    socket.send(JSON.stringify({ id: message.id, result: { ok: true } })),
  );
  const connection = await connect(browser.url.replace("ws:", "http:"));
  try {
    expect(await connection.send("Browser.getVersion")).toEqual({ ok: true });
  } finally {
    connection.close();
  }
  expect(connection.closed).toBe(true);
});

test.concurrent("CDP rejects failed discovery and nonlocal advertised endpoints", async () => {
  for (const response of [
    () => new Response("private diagnostic", { status: 503 }),
    () => Response.json({}),
    () => Response.json({ webSocketDebuggerUrl: "ws://example.com/devtools/browser/test" }),
    () => Response.json({ webSocketDebuggerUrl: "http://127.0.0.1/devtools/browser/test" }),
  ]) {
    using server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: response });
    await expect(connect(server.url.href)).rejects.toThrow();
  }
  const controller = new AbortController();
  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      controller.abort(new Error("discovery cancelled"));
      return Response.json({});
    },
  });
  await expect(connect(server.url.href, { signal: controller.signal })).rejects.toThrow("discovery cancelled");
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
  expect(() => manifests.validateTheme({ ...theme, theme: { colors: { frame: [256, 0, 0] } } })).toThrow();
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

test("profile discovery distinguishes Default from last used without copying stores", async () => {
  using dir = tempDir("chrome-profile-discovery", {
    "Local State": JSON.stringify({
      profile: { last_used: "Profile 2", info_cache: { Default: { name: "Main" }, "Profile 2": { name: "Work" } } },
    }),
    "Default/Bookmarks": "{}",
    "Profile 2/Bookmarks": "{}",
  });
  const found = await profiles.discover({ userDataDirs: [String(dir), String(dir)] });
  expect(found).toHaveLength(2);
  expect(found.find(profile => profile.isDefault)).toMatchObject({ name: "Main", isLastUsed: false });
  expect(found.find(profile => profile.isLastUsed)).toMatchObject({ name: "Work", isDefault: false });
  expect(profiles.capabilities()).toMatchObject({ storedCookies: "unavailable", storedPasswords: "unavailable" });
});

test("bookmark site filtering normalizes IDNA and respects domain boundaries", async () => {
  using dir = tempDir("chrome-bookmark-site", {
    Bookmarks: JSON.stringify({
      roots: {
        bookmark_bar: {
          type: "folder",
          name: "Sites",
          children: [
            { type: "url", id: "1", name: "Root", url: "https://BÜCHER.example/root" },
            { type: "url", id: "2", name: "Sub", url: "https://docs.xn--bcher-kva.example/doc" },
            { type: "url", id: "3", name: "Other", url: "https://notxn--bcher-kva.example/" },
            { type: "url", id: "4", name: "Script", url: "javascript:alert(1)" },
          ],
        },
      },
    }),
  });
  expect(
    (await profiles.readBookmarks(`${dir}/Bookmarks`, { site: "https://bücher.example/" })).map(
      bookmark => bookmark.id,
    ),
  ).toEqual(["1"]);
  expect(
    (
      await profiles.readBookmarks(`${dir}/Bookmarks`, { site: "https://bücher.example/", includeSubdomains: true })
    ).map(bookmark => bookmark.id),
  ).toEqual(["1", "2"]);
  await expect(
    profiles.readBookmarks(`${dir}/Bookmarks`, { site: "https://user:secret@example.test/" }),
  ).rejects.toThrow("without credentials");
});

test("profile metadata rejects path traversal and oversized JSON", async () => {
  using dir = tempDir("chrome-profile-bounds", {
    "Local State": JSON.stringify({ profile: { info_cache: { "../outside": { name: "Other" } } } }),
    Bookmarks: " ".repeat(8 * 1024 * 1024 + 1),
  });
  await expect(profiles.discover({ userDataDirs: [String(dir)] })).rejects.toThrow("single path component");
  await expect(profiles.readBookmarks(`${dir}/Bookmarks`)).rejects.toThrow("8 MiB limit");
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
      socket.send(JSON.stringify({ id: message.id, error: { code: -32601, message: "Unknown command" } }));
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
    const unsubscribe = connection.on("Page.loadEventFired", event => events.push(event));
    await connection.send("Page.enable");
    expect(events).toHaveLength(1);
    unsubscribe();
    await connection.send("Page.enable");
    expect(events).toHaveLength(1);
    const unsubscribeNext = connection.on("Page.loadEventFired", event => events.push(event));
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
  await expect(connect("ws://127.0.0.1:1/devtools/browser/test", { signal: alreadyAborted.signal })).rejects.toThrow();
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
      const version = await browser.connection.send<{ product: string; protocolVersion: string }>("Browser.getVersion");
      expect(version.product).toMatch(/Chrome|Chromium/);
      expect(version.protocolVersion).toMatch(/^\d+\.\d+$/);
      const { targetId } = await browser.connection.send<{ targetId: string }>("Target.createTarget", {
        url: "about:blank",
      });
      const { sessionId } = await browser.connection.send<{ sessionId: string }>("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
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
        const target = targetInfos.find(target => target.url === server.url.href);
        expect(target).toBeDefined();
        const { sessionId } = await browser.connection.send<{ sessionId: string }>("Target.attachToTarget", {
          targetId: target!.targetId,
          flatten: true,
        });
        await browser.connection.send("Page.enable", {}, sessionId);
        let unsubscribe = () => {};
        const loaded = new Promise<void>(resolve => {
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
