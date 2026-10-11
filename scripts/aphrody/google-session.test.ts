// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import type { ChromiumConnection } from "bun:chromium";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import { createChromePasswordProvider } from "../../packages/bun-google/src/password-store";
import { createGoogleSession } from "./google-session";

function fixture(root: string) {
  const requests: unknown[][] = [];
  const cookies = [
    {
      name: "private-name",
      value: "private-cookie",
      domain: ".google.com",
      path: "/",
      secure: true,
      httpOnly: true,
      session: true,
    },
  ];
  const connection = {
    async send(...args: unknown[]) {
      requests.push(args);
      return { cookies };
    },
  } as unknown as Pick<ChromiumConnection, "send">;
  const provider = createChromePasswordProvider({
    filename: join(root, "passwords.csv"),
    allowedPaths: [join(root, "passwords.csv")],
    assertProtectedPath: () => {},
  });
  const options = {
    allowedOrigins: ["https://accounts.google.com"],
    protectedProfile: root,
    assertProtectedProfile: () => {},
    connection,
    targetSessionId: "fixture-target",
    passwordProvider: provider,
  };
  return { requests, cookies, options };
}

test("Chromium session requests one explicit URL and exposes cookie counts without authentication claims", async () => {
  using root = tempDir("google-session", {});
  const f = fixture(String(root));
  const session = createGoogleSession(f.options);
  const audit = await session.audit("https://accounts.google.com/settings");
  expect(f.requests).toEqual([
    ["Network.getCookies", { urls: ["https://accounts.google.com/settings"] }, "fixture-target"],
  ]);
  expect(audit.cookieCount).toBe(1);
  expect(audit.httpOnlyCookies).toBe(1);
  expect(audit.loggedIn).toBe("unverified");
  expect(audit.oauthGranted).toBe(false);
  expect(JSON.stringify(audit)).not.toContain("private-cookie");
  expect(JSON.stringify(audit)).not.toContain("private-name");
  await expect(session.audit("https://mail.google.com/")).rejects.toThrow("allowlist");
  await expect(session.audit("https://accounts.google.com.attacker.test/")).rejects.toThrow("allowlist");
  await expect(session.audit("https://user:password@accounts.google.com/")).rejects.toThrow("HTTPS");
  expect(f.requests).toHaveLength(1);
});

test("wrong-domain cookie output and changed profile protection fail closed", async () => {
  using root = tempDir("google-session-scope", {});
  const f = fixture(String(root));
  f.cookies[0]!.domain = ".attacker.test";
  const session = createGoogleSession(f.options);
  await expect(session.audit("https://accounts.google.com/")).rejects.toThrow("outside the requested");
  let refused = false;
  const protectedSession = createGoogleSession({
    ...f.options,
    assertProtectedProfile: () => {
      if (refused) throw new Error("protected profile refused");
    },
  });
  refused = true;
  await expect(protectedSession.audit("https://accounts.google.com/")).rejects.toThrow("profile refused");
  expect(f.requests).toHaveLength(1);
});

test("shared password provider releases only an exact-origin fixture to the explicit consumer", async () => {
  using root = tempDir("google-session-password", {
    "passwords.csv": "name,url,username,password\nGoogle,https://accounts.google.com/,fixture-user,fixture-password\n",
  });
  const { chmodSync } = await import("node:fs");
  chmodSync(join(String(root), "passwords.csv"), 0o600);
  const f = fixture(String(root));
  const session = createGoogleSession(f.options);
  expect(session.passwordPlan().imported).toBe(false);
  let called = 0;
  await session.withCredential({ url: "https://accounts.google.com/", username: "fixture-user" }, credential => {
    expect(credential.password).toBe("fixture-password");
    called++;
  });
  expect(called).toBe(1);
  await expect(
    session.withCredential({ url: "https://mail.google.com/" }, () => {
      called++;
    }),
  ).rejects.toThrow("allowlist");
  await expect(
    session.withCredential({ url: "https://accounts.google.com/" }, () => {
      throw new Error("fixture-password");
    }),
  ).rejects.toThrow("Origin-scoped credential access failed");
  expect(called).toBe(1);
  expect(f.requests).toHaveLength(0);
});
