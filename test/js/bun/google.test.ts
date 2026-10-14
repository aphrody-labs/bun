import { expect, test } from "bun:test";
import google, { chromium, createClient, dns, googleRuntime, obscura } from "bun:google";
import chromiumOwner from "bun:chromium";
import obscuraOwner from "bun:obscura";

test("Google reuses existing capabilities and public configuration", () => {
  expect(google.createClient).toBe(createClient);
  expect(chromium).toBe(chromiumOwner);
  expect(obscura).toBe(obscuraOwner);
  expect(dns).toBe(Bun.dns);
  expect(googleRuntime({})).toEqual({
    project: "aphrody",
    location: "us-central1",
    home: "~/.aphrody",
    auth: "adc-or-secret-manager",
  });
  expect(googleRuntime({ GOOGLE_CLOUD_PROJECT: "rgfr-8927d" }).project).toBe("rgfr");
  expect(
    googleRuntime({ APHRODY_VERTEX_PROJECT: "aphrody", GOOGLE_CLOUD_PROJECT: "rgfr" }).project,
  ).toBe("aphrody");
});

test("Google resolves the same builtin through CommonJS and dynamic import", async () => {
  expect(require("bun:google")).toBe(google);
  const imported = await import("bun:google");
  expect(imported.default).toBe(google);
  expect(imported.createClient).toBe(createClient);
});

test("Bun bundling preserves the Google builtin as a runtime external", async () => {
  const result = await Bun.build({
    entrypoints: ["google-entry"],
    target: "bun",
    plugins: [
      {
        name: "google-test-entry",
        setup(builder) {
          builder.onResolve({ filter: /^google-entry$/ }, () => ({
            path: "entry",
            namespace: "google-test",
          }));
          builder.onLoad({ filter: /.*/, namespace: "google-test" }, () => ({
            contents:
              'import { googleRuntime } from "bun:google"; export const runtime = googleRuntime({});',
            loader: "js",
          }));
        },
      },
    ],
  });
  expect(result.success).toBe(true);
  expect(result.outputs).toHaveLength(1);
  expect(await result.outputs[0].text()).toContain('from "bun:google"');
});

test("Google authenticates in-process REST fetch and forwards request data", async () => {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      return Response.json({
        path: new URL(request.url).pathname,
        auth: request.headers.get("authorization"),
        method: request.method,
      });
    },
  });
  try {
    let calls = 0;
    const client = createClient({
      baseURL: server.url,
      credentialProvider: () => `token-${++calls}`,
    });
    expect(await (await client.request("drive/v3/files", { method: "POST" })).json()).toEqual({
      path: "/drive/v3/files",
      auth: "Bearer token-1",
      method: "POST",
    });
    expect(await (await client.request("docs/v1/documents/123")).json()).toEqual({
      path: "/docs/v1/documents/123",
      auth: "Bearer token-2",
      method: "GET",
    });
    expect(
      await (await client.request("./v1internal:fetchAvailableModels", { method: "POST" })).json(),
    ).toEqual({ path: "/v1internal:fetchAvailableModels", auth: "Bearer token-3", method: "POST" });
  } finally {
    await server.stop(true);
  }
});

test("Google refuses unsafe endpoints, path escapes and caller authorization before credentials", async () => {
  for (const baseURL of [
    "http://www.googleapis.com",
    "https://googleapis.com.evil.test",
    "https://user:password@www.googleapis.com",
    "https://www.googleapis.com/?token=secret",
  ])
    expect(() => createClient({ baseURL, credentialProvider: () => "secret" })).toThrow();
  let calls = 0;
  const client = createClient({
    baseURL: "https://www.googleapis.com/api/",
    credentialProvider: () => {
      calls++;
      return "secret";
    },
  });
  for (const path of [
    "https://evil.test/",
    "https://www.googleapis.com/api/files",
    " https://www.googleapis.com/api/files",
    "ht\ttps://www.googleapis.com/api/files",
    "//evil.test/",
    "/files",
    "../files",
    "%2e%2e/files",
    "files/%2fprivate",
    "files\\private",
    "files#fragment",
  ])
    await expect(client.request(path)).rejects.toThrow();
  for (const name of ["Authorization", "Proxy-Authorization"])
    await expect(client.request("files", { headers: { [name]: "secret" } })).rejects.toThrow();
  expect(calls).toBe(0);
});

test("Google forwards cancellation and never sends invalid bearer tokens", async () => {
  const controller = new AbortController();
  let sent = 0;
  const client = createClient({
    credentialProvider: () => "token",
    fetch: async (_input, init) => {
      expect(init?.signal).toBe(controller.signal);
      expect(init?.redirect).toBe("error");
      sent++;
      return new Response("ok");
    },
  });
  expect(await (await client.request("files", { signal: controller.signal })).text()).toBe("ok");
  for (const token of ["", "token\r\nheader: value", "token value", "token\u0000"]) {
    await expect(
      createClient({
        credentialProvider: () => token,
        fetch: async () => {
          sent++;
          return new Response("unexpected");
        },
      }).request("files"),
    ).rejects.toThrow("Google credential provider returned an invalid token");
  }
  expect(sent).toBe(1);
});

test("Google rejects redirects and redacts transport, provider and HTTP errors", async () => {
  let targetCalls = 0;
  const target = Bun.serve({
    port: 0,
    fetch() {
      targetCalls++;
      return new Response("leaked");
    },
  });
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      return new URL(request.url).pathname === "/redirect"
        ? Response.redirect(target.url.href)
        : new Response("secret response", { status: 403 });
    },
  });
  try {
    const client = createClient({ baseURL: server.url, credentialProvider: () => "secret-token" });
    await expect(client.request("redirect", { redirect: "follow" })).rejects.toThrow(
      "Google request failed",
    );
    expect(targetCalls).toBe(0);
    await expect(client.request("forbidden")).rejects.toThrow("Google request failed (HTTP 403)");
    await expect(
      createClient({
        credentialProvider: () => {
          throw new Error("secret-token");
        },
      }).request("files"),
    ).rejects.toThrow("Google credential provider failed");
    await expect(
      createClient({
        credentialProvider: () => "secret-token",
        fetch: async () => {
          throw new Error("secret-token");
        },
      }).request("files"),
    ).rejects.toThrow("Google request failed");
  } finally {
    await Promise.all([server.stop(true), target.stop(true)]);
  }
});

test("Google preserves cancellation before credentials and after refresh", async () => {
  let calls = 0;
  const before = new AbortController();
  before.abort();
  const client = createClient({
    credentialProvider: () => {
      calls++;
      return "secret";
    },
  });
  await expect(client.request("files", { signal: before.signal })).rejects.toThrow();
  expect(calls).toBe(0);
  const after = new AbortController();
  const refreshing = createClient({
    credentialProvider: (signal) => {
      expect(signal).toBe(after.signal);
      after.abort();
      return "secret";
    },
  });
  await expect(refreshing.request("files", { signal: after.signal })).rejects.toThrow();
});
