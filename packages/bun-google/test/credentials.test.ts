import { expect, spyOn, test } from "bun:test";
import { createClient } from "bun:google";
import { createAntigravityCredentialProvider } from "../src/credentials.ts";
import { googleAuthStatus, googleWhoami } from "../aphrody/packages/google/src/auth.ts";

test("exact-target provider reads the original OAuth envelope per request", async () => {
  const get = spyOn(Bun.secrets, "get").mockResolvedValue(
    JSON.stringify({
      token: {
        access_token: "fixture-token",
        refresh_token: "fixture-refresh",
        expiry: "2099-01-01T00:00:00Z",
      },
      auth_method: "consumer",
    }),
  );
  try {
    const selection = { target: "gemini:antigravity" };
    const provider = createAntigravityCredentialProvider(selection);
    selection.target = "other";
    const client = createClient({
      credentialProvider: provider,
      fetch: async (_input, init) => Response.json({ auth: new Headers(init?.headers).get("authorization") }),
    });
    expect(await (await client.request("drive/v3/files")).json()).toEqual({
      auth: "Bearer fixture-token",
    });
    get.mockResolvedValue(JSON.stringify({ token: { access_token: "refreshed-fixture-token" } }));
    expect(await provider()).toBe("refreshed-fixture-token");
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenLastCalledWith({ target: "gemini:antigravity" });
  } finally {
    get.mockRestore();
  }
});

test("credential provider redacts invalid envelopes, expired tokens and native errors", async () => {
  for (const target of ["", " ", "target\0"])
    expect(() => createAntigravityCredentialProvider({ target })).toThrow("explicit target");
  const get = spyOn(Bun.secrets, "get").mockResolvedValue(null);
  try {
    const provider = createAntigravityCredentialProvider({ target: "gemini:antigravity" });
    for (const stored of [null, "not json secret-token", "null", "{}", '{"token":{"access_token":"secret token"}}']) {
      get.mockResolvedValue(stored);
      await expect(provider()).rejects.toThrow("Google protected credential envelope unavailable");
    }
    for (const expiry of ["2000-01-01T00:00:00Z", "private-invalid-expiry", "9999", "3599", 123]) {
      get.mockResolvedValue(JSON.stringify({ token: { access_token: "fixture-token", expiry } }));
      await expect(provider()).rejects.toThrow("Google protected credential expired or has invalid expiry");
    }
    get.mockRejectedValue(new Error("private-store secret-token"));
    await expect(provider()).rejects.toThrow("Google protected credential read failed");
  } finally {
    get.mockRestore();
  }
});

test("credential provider preserves cancellation before and after native reads", async () => {
  const get = spyOn(Bun.secrets, "get").mockResolvedValue('{"token":{"access_token":"fixture-token"}}');
  try {
    const provider = createAntigravityCredentialProvider({ target: "gemini:antigravity" });
    await expect(provider(AbortSignal.abort())).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
    const controller = new AbortController();
    get.mockImplementation(async () => {
      controller.abort();
      return '{"token":{"access_token":"fixture-token"}}';
    });
    await expect(provider(controller.signal)).rejects.toThrow();
    expect(get).toHaveBeenCalledTimes(1);
  } finally {
    get.mockRestore();
  }
});

test("legacy auth status and OpenID profile use native protected reads and in-process fetch", async () => {
  const get = spyOn(Bun.secrets, "get").mockResolvedValue('{"token":{"access_token":"fixture-token"}}');
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      expect(new URL(request.url).pathname).toBe("/oauth2/v2/userinfo");
      expect(request.headers.get("authorization")).toBe("Bearer fixture-token");
      expect(request.headers.get("user-agent")).toContain("auth_method=consumer");
      return Response.json({
        name: "Fixture",
        email: "fixture@example.invalid",
        picture: "https://example.invalid/picture",
        private_extra: "not returned",
      });
    },
  });
  try {
    expect(await googleAuthStatus()).toBe("available");
    expect(await googleWhoami({ baseURL: server.url })).toEqual({
      name: "Fixture",
      email: "fixture@example.invalid",
      picture: "https://example.invalid/picture",
    });
    expect(get).toHaveBeenLastCalledWith({ target: "gemini:antigravity" });
  } finally {
    await server.stop(true);
    get.mockRestore();
  }
});

test("native target arguments are validated before any protected-store call", () => {
  for (const target of [null, 1, {}, "", "gemini:antigravity\0"]) {
    // @ts-expect-error invalid options exercise native validation only
    expect(() => Bun.secrets.get({ target })).toThrow(/target/i);
  }
  // @ts-expect-error target and service/name are mutually exclusive
  expect(() => Bun.secrets.get({ target: "gemini:antigravity", service: "x", name: "y" })).toThrow(
    "without service or name",
  );
  expect(() =>
    // @ts-expect-error exact target is read-only
    Bun.secrets.set({ target: "gemini:antigravity", service: "x", name: "y", value: "fixture" }),
  ).toThrow("only for get()");
  expect(() =>
    // @ts-expect-error exact target is read-only
    Bun.secrets.delete({ target: "gemini:antigravity", service: "x", name: "y" }),
  ).toThrow("only for get()");
});
