// SPDX-License-Identifier: Apache-2.0
import { beforeAll, expect, test } from "bun:test";
import type { webcrypto } from "node:crypto";
import { createGoogleOAuthServer, createMemoryGoogleOAuthStore, type GoogleOAuthOptions } from "../src/oauth";

const origin = "https://aphrody.example";
const clientId = "fixture.apps.googleusercontent.com";
const callbackURL = origin + "/auth/google/callback";
let pair: webcrypto.CryptoKeyPair;
let publicKey: webcrypto.JsonWebKey;
beforeAll(async () => {
  pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
});
function encoded(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
async function signed(claims: Record<string, unknown>, header: Record<string, unknown> = {}) {
  const data = encoded({ alg: "RS256", kid: "fixture", ...header }) + "." + encoded(claims);
  return (
    data +
    "." +
    Buffer.from(
      await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(data)),
    ).toString("base64url")
  );
}
function cookie(result: Response, name: string) {
  return result.headers
    .getSetCookie()
    .find(value => value.startsWith(name + "="))!
    .split(";")[0]!;
}
function fixture(overrides: Partial<GoogleOAuthOptions> = {}) {
  let time = Date.now();
  let nonce = "";
  let challenge = "";
  let exchanges = 0;
  let keyLoads = 0;
  let alter: Record<string, unknown> = {};
  let header: Record<string, unknown> = {};
  let scope = "openid email profile";
  let corruptSignature = false;
  const fetch: NonNullable<GoogleOAuthOptions["fetch"]> = async (input, init) => {
    expect(init?.redirect).toBe("error");
    if (String(input) === "https://www.googleapis.com/oauth2/v3/certs") {
      keyLoads++;
      return Response.json(
        { keys: [{ ...publicKey, kid: "fixture" }] },
        { headers: { "cache-control": "max-age=3600" } },
      );
    }
    expect(String(input)).toBe("https://oauth2.googleapis.com/token");
    exchanges++;
    const form = new URLSearchParams(String(init?.body));
    expect(form.get("client_id")).toBe(clientId);
    expect(form.get("redirect_uri")).toBe(callbackURL);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(new Bun.CryptoHasher("sha256").update(form.get("code_verifier")!).digest("base64url")).toBe(challenge);
    const seconds = Math.floor(time / 1000);
    let token = await signed(
      {
        iss: "https://accounts.google.com",
        aud: clientId,
        sub: "fixture-user",
        nonce,
        iat: seconds,
        exp: seconds + 3600,
        email: "fixture@example.invalid",
        email_verified: true,
        ...alter,
      },
      header,
    );
    if (corruptSignature) {
      const parts = token.split(".");
      parts[2] = (parts[2]![0] === "A" ? "B" : "A") + parts[2]!.slice(1);
      token = parts.join(".");
    }
    return Response.json({
      id_token: token,
      access_token: "synthetic-access",
      token_type: "Bearer",
      refresh_token: "synthetic-refresh",
      expires_in: 3600,
      scope,
    });
  };
  const server = createGoogleOAuthServer({
    publicOrigin: origin,
    callbackURL,
    allowedCallbackURLs: [callbackURL],
    clientId,
    clientSecret: "synthetic-client-secret",
    store: createMemoryGoogleOAuthStore(),
    now: () => time,
    fetch,
    ...overrides,
  });
  async function login(query = "") {
    const result = (await server.fetch(new Request(origin + "/auth/google/login" + query)))!;
    if (result.status !== 303) return { result, url: new URL(origin), binding: "", state: "" };
    const url = new URL(result.headers.get("location")!);
    nonce = url.searchParams.get("nonce")!;
    challenge = url.searchParams.get("code_challenge")!;
    return {
      result,
      url,
      binding: cookie(result, "__Host-aphrody-google-flow"),
      state: url.searchParams.get("state")!,
    };
  }
  async function complete(flow: Awaited<ReturnType<typeof login>>, query = "", binding = flow.binding) {
    return (await server.fetch(
      new Request(callbackURL + "?state=" + flow.state + "&code=fixture-code" + query, {
        headers: { cookie: binding },
      }),
    ))!;
  }
  return {
    corruptSignature: () => {
      corruptSignature = true;
    },
    server,
    login,
    complete,
    advance: (ms: number) => {
      time += ms;
    },
    alter: (value: Record<string, unknown>) => {
      alter = value;
    },
    header: (value: Record<string, unknown>) => {
      header = value;
    },
    scope: (value: string) => {
      scope = value;
    },
    counts: () => ({ exchanges, keyLoads }),
  };
}

test("explicit HTTPS callback and return allowlists; missing configuration fails closed", async () => {
  expect(() => fixture({ callbackURL: "https://other.example/auth/google/callback" })).toThrow();
  expect(() => fixture({ allowedCallbackURLs: [] })).toThrow();
  expect(() => fixture({ publicOrigin: "http://aphrody.example" })).toThrow();
  expect(() => fixture({ allowedReturnPaths: ["//other.example/"] })).toThrow();
  const f = fixture({ clientSecret: undefined });
  expect(f.server.capabilities().configured).toBe(false);
  expect((await f.login()).result.status).toBe(503);
  expect(await f.server.fetch(new Request(origin + "/unrelated"))).toBeUndefined();
});

test("PKCE, nonce, bound one-time state, opaque secure session and token isolation", async () => {
  let tokens: unknown;
  const f = fixture({
    onTokens: async (_user, value) => {
      tokens = value;
    },
  });
  const flow = await f.login();
  expect(flow.url.origin).toBe("https://accounts.google.com");
  expect(flow.url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(flow.state).toMatch(/^[\w-]{43}$/);
  expect(flow.state).not.toBe(flow.url.searchParams.get("nonce"));
  expect(flow.result.headers.get("set-cookie")).toContain("Path=/; Secure; HttpOnly; SameSite=Lax");
  const result = await f.complete(flow);
  expect(result.status).toBe(303);
  expect(result.headers.get("location")).toBe(origin + "/");
  const session = cookie(result, "__Host-aphrody-google-session");
  const identity = (await f.server.fetch(new Request(origin + "/auth/session", { headers: { cookie: session } })))!;
  expect(identity.headers.get("cache-control")).toBe("no-store");
  const body = await identity.text();
  expect(JSON.parse(body)).toMatchObject({
    authenticated: true,
    user: { sub: "fixture-user", emailVerified: true },
    scopes: ["openid", "email", "profile"],
  });
  expect(body).not.toContain("synthetic-access");
  expect(body).not.toContain("synthetic-refresh");
  expect(tokens).toMatchObject({
    accessToken: "synthetic-access",
    refreshToken: "synthetic-refresh",
  });
  expect((await f.complete(flow)).status).toBe(400);
  expect(f.counts()).toEqual({ exchanges: 1, keyLoads: 1 });
});

test.each([
  { iss: "https://attacker.example" },
  { aud: "other.apps.googleusercontent.com" },
  { nonce: "wrong" },
  { exp: 1 },
  { iat: 9999999999 },
  { azp: "wrong" },
  { aud: [clientId, "another"], azp: undefined },
  { nbf: 9999999999 },
  { sub: "" },
])("reject invalid signed OIDC claims %j", async claims => {
  const f = fixture();
  const flow = await f.login();
  f.alter(claims);
  const result = await f.complete(flow);
  expect(result.status).toBe(400);
  expect(await result.json()).toEqual({ error: "google_oauth_failed" });
  expect(result.headers.getSetCookie().some(value => value.startsWith("__Host-aphrody-google-session="))).toBe(false);
});

test.each([{ alg: "none" }, { kid: "untrusted" }, { crit: ["jku"] }])(
  "reject invalid JOSE headers %j",
  async header => {
    const f = fixture();
    const flow = await f.login();
    f.header(header);
    expect((await f.complete(flow)).status).toBe(400);
  },
);

test("missing or duplicated binding and expired state do not exchange a code", async () => {
  const f = fixture();
  expect((await f.complete(await f.login(), "", "")).status).toBe(400);
  const wrong = await f.login();
  expect((await f.complete(wrong, "", "__Host-aphrody-google-flow=" + "a".repeat(43))).status).toBe(400);
  expect((await f.complete(wrong)).status).toBe(400);
  const flow = await f.login();
  expect((await f.complete(flow, "", flow.binding + "; " + flow.binding)).status).toBe(400);
  f.advance(600001);
  expect((await f.complete(flow)).status).toBe(400);
  expect(f.counts().exchanges).toBe(0);
});

test("reject callback parameter pollution, open redirect and unapproved scope", async () => {
  const f = fixture();
  expect((await f.login("?returnTo=https%3A%2F%2Fother.example")).result.status).toBe(400);
  expect((await f.login("?scope=openid%20https://www.googleapis.com/auth/drive")).result.status).toBe(400);
  expect((await f.complete(await f.login(), "&state=other")).status).toBe(400);
  const flow = await f.login();
  f.scope("openid https://www.googleapis.com/auth/drive");
  expect((await f.complete(flow)).status).toBe(400);
});

test("logout requires same-origin POST, revokes session; sessions expire", async () => {
  const f = fixture({ sessionTTLSeconds: 60 });
  const result = await f.complete(await f.login());
  const session = cookie(result, "__Host-aphrody-google-session");
  expect((await f.server.fetch(new Request(origin + "/auth/logout")))!.status).toBe(405);
  expect(
    (await f.server.fetch(
      new Request(origin + "/auth/logout", {
        method: "POST",
        headers: { cookie: session, origin: "https://other.example" },
      }),
    ))!.status,
  ).toBe(403);
  const logout = (await f.server.fetch(
    new Request(origin + "/auth/logout", { method: "POST", headers: { cookie: session, origin } }),
  ))!;
  expect(logout.status).toBe(200);
  expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(
    await (await f.server.fetch(new Request(origin + "/auth/session", { headers: { cookie: session } })))!.json(),
  ).toEqual({ authenticated: false, scopes: [] });
  const next = cookie(await f.complete(await f.login()), "__Host-aphrody-google-session");
  f.advance(60001);
  expect(
    await (await f.server.fetch(new Request(origin + "/auth/scopes", { headers: { cookie: next } })))!.json(),
  ).toEqual({ authenticated: false, scopes: [] });
});

test("owner store errors are redacted and fail closed", async () => {
  const store = createMemoryGoogleOAuthStore();
  store.getSession = async () => {
    throw new Error("protected-owner-detail");
  };
  const f = fixture({ store });
  const response = (await f.server.fetch(
    new Request(origin + "/auth/session", {
      headers: { cookie: "__Host-aphrody-google-session=" + "a".repeat(43) },
    }),
  ))!;
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "auth_store_unavailable" });
});

test("signature mismatch is rejected; attacker key URLs are never fetched", async () => {
  const invalid = fixture();
  const flow = await invalid.login();
  invalid.corruptSignature();
  expect((await invalid.complete(flow)).status).toBe(400);
  const f = fixture();
  const valid = await f.login();
  f.header({ jku: "https://attacker.example/keys", x5u: "https://attacker.example/certificate" });
  expect((await f.complete(valid)).status).toBe(303);
  expect(f.counts().keyLoads).toBe(1);
});

test("Google denial consumes transaction without exchange", async () => {
  const f = fixture();
  const flow = await f.login();
  expect((await f.complete(flow, "&error=access_denied")).status).toBe(400);
  expect((await f.complete(flow)).status).toBe(400);
  expect(f.counts().exchanges).toBe(0);
});

test("Google issuer and scope aliases are accepted; cached keys and session rotation", async () => {
  const f = fixture();
  const flow = await f.login();
  f.alter({ iss: "accounts.google.com", aud: [clientId, "other"], azp: clientId });
  f.scope("openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile");
  const prior = cookie(await f.complete(flow), "__Host-aphrody-google-session");
  const nextFlow = await f.login();
  const next = cookie(await f.complete(nextFlow, "", nextFlow.binding + "; " + prior), "__Host-aphrody-google-session");
  expect(next).not.toBe(prior);
  expect(f.counts()).toEqual({ exchanges: 2, keyLoads: 1 });
  expect(
    await (await f.server.fetch(new Request(origin + "/auth/session", { headers: { cookie: prior } })))!.json(),
  ).toEqual({ authenticated: false, scopes: [] });
  expect(
    await (await f.server.fetch(new Request(origin + "/auth/scopes", { headers: { cookie: next } })))!.json(),
  ).toMatchObject({ authenticated: true, scopes: ["openid", "email", "profile"] });
});

test("fixed transport rejects oversized token bodies without exposing their contents", async () => {
  const f = fixture({
    fetch: async (input, init) => {
      expect(String(input)).toBe("https://oauth2.googleapis.com/token");
      expect(init?.redirect).toBe("error");
      return Response.json({ privateDetail: "x".repeat(65537) });
    },
  });
  const response = await f.complete(await f.login());
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "google_oauth_failed" });
});

test("bounded memory store consumes state atomically", async () => {
  const store = createMemoryGoogleOAuthStore(1);
  const value = {
    verifier: "v",
    nonce: "n",
    bindingHash: "h",
    returnTo: "/",
    scopes: ["openid"],
    expiresAt: Date.now() + 10000,
  };
  await store.putState("first", value);
  await expect(store.putState("second", value)).rejects.toThrow();
  const results = await Promise.all([store.consumeState("first", Date.now()), store.consumeState("first", Date.now())]);
  expect(results.filter(Boolean)).toHaveLength(1);
});
