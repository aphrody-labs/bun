// SPDX-License-Identifier: Apache-2.0
import type { ChromiumConnection } from "bun:chromium";
import { isAbsolute } from "node:path";
import {
  createChromiumPasswordConnection,
  type ChromiumPasswordProvider,
} from "../../packages/bun-chromium/src/passwords";

export interface GoogleSessionOptions {
  allowedOrigins: readonly string[];
  protectedProfile: string;
  assertProtectedProfile(path: string): void;
  connection: Pick<ChromiumConnection, "send">;
  targetSessionId: string;
  passwordProvider: ChromiumPasswordProvider;
}

function webURL(value: string) {
  if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u0020\u007f]/.test(value))
    throw new TypeError("An explicit HTTPS session URL is required");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("An explicit HTTPS session URL is required");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new TypeError("An explicit HTTPS session URL is required");
  return url;
}

/** Chromium retains its cookie jar; this adapter returns counts without exporting cookie material. */
export function createGoogleSession(options: GoogleSessionOptions) {
  if (
    !Array.isArray(options.allowedOrigins) ||
    !options.allowedOrigins.length ||
    options.allowedOrigins.length > 32 ||
    !isAbsolute(options.protectedProfile) ||
    typeof options.assertProtectedProfile !== "function" ||
    !options.connection ||
    typeof options.connection.send !== "function" ||
    typeof options.targetSessionId !== "string" ||
    !options.targetSessionId
  )
    throw new TypeError("An explicitly protected Chromium session is required");
  const origins = new Set(
    options.allowedOrigins.map(value => {
      const url = webURL(value);
      if (url.pathname !== "/" || url.search) throw new TypeError("Session allowlist entries must be exact origins");
      return url.origin;
    }),
  );
  const profile = options.protectedProfile;
  const guard = options.assertProtectedProfile;
  const send = options.connection.send.bind(options.connection);
  const session = options.targetSessionId;
  const passwords = createChromiumPasswordConnection(options.passwordProvider);
  guard(profile);
  function approved(value: string) {
    const url = webURL(value);
    if (!origins.has(url.origin)) throw new Error("Session origin is outside the explicit allowlist");
    return url;
  }
  return Object.freeze({
    async audit(value: string) {
      const url = approved(value);
      guard(profile);
      let result: { cookies?: unknown };
      try {
        result = await send<{ cookies?: unknown }>("Network.getCookies", { urls: [url.href] }, session);
      } catch {
        throw new Error("Chromium session audit failed");
      }
      guard(profile);
      if (!result || !Array.isArray(result.cookies) || result.cookies.length > 4096)
        throw new Error("Chromium cookie metadata is invalid");
      let secure = 0,
        httpOnly = 0,
        persistent = 0;
      for (const cookie of result.cookies) {
        if (
          !cookie ||
          typeof cookie !== "object" ||
          typeof cookie.domain !== "string" ||
          typeof cookie.path !== "string" ||
          typeof cookie.secure !== "boolean" ||
          typeof cookie.httpOnly !== "boolean" ||
          typeof cookie.session !== "boolean"
        )
          throw new Error("Chromium cookie metadata is invalid");
        const domain = cookie.domain.toLowerCase();
        const host = url.hostname.toLowerCase();
        if (
          !(host === domain || (domain.startsWith(".") && (host === domain.slice(1) || host.endsWith(domain)))) ||
          !cookie.path.startsWith("/") ||
          !(
            url.pathname === cookie.path ||
            (url.pathname.startsWith(cookie.path) &&
              (cookie.path.endsWith("/") || url.pathname[cookie.path.length] === "/"))
          )
        )
          throw new Error("Chromium returned cookies outside the requested URL");
        secure += Number(cookie.secure);
        httpOnly += Number(cookie.httpOnly);
        persistent += Number(!cookie.session);
      }
      return Object.freeze({
        schemaVersion: 1,
        origin: url.origin,
        cookieOwner: "chromium",
        cookieCount: result.cookies.length,
        secureCookies: secure,
        httpOnlyCookies: httpOnly,
        persistentCookies: persistent,
        loggedIn: "unverified",
        oauthGranted: false,
        passwordImportVerified: false,
      });
    },
    passwordPlan() {
      return passwords.importPlan();
    },
    async withCredential(
      selector: { url: string; username?: string },
      consumer: Parameters<ChromiumPasswordProvider["withCredential"]>[1],
    ) {
      const url = approved(selector.url);
      const username = selector.username;
      if (typeof consumer !== "function") throw new TypeError("An explicit trusted credential consumer is required");
      guard(profile);
      try {
        await passwords.withCredential({ url: url.href, username }, async credential => {
          if (
            webURL(credential.url).origin !== url.origin ||
            (username !== undefined && credential.username !== username)
          )
            throw new Error("Credential origin mismatch");
          await consumer(credential);
        });
      } catch {
        throw new Error("Origin-scoped credential access failed");
      }
    },
  });
}
