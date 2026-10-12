// SPDX-License-Identifier: Apache-2.0
import type { GoogleClientOptions } from "bun:google";

export interface AntigravityCredentialOptions {
  /** Exact existing Windows target, such as gemini:antigravity. No discovery or store migration. */
  target: string;
}

export type AntigravityCredentialProvider = GoogleClientOptions["credentialProvider"] & {
  /** Non-secret envelope metadata, updated after each protected-store read. */
  readonly authMethod?: string;
};

/**
 * Re-read the desktop-owned OAuth envelope through Bun's native Credential Manager API.
 * This is read-only: the desktop remains token/refresh authority. The native API
 * returns a JS string; no opaque credential or non-Windows store parity is claimed.
 */
export function createAntigravityCredentialProvider(
  options: AntigravityCredentialOptions,
): AntigravityCredentialProvider {
  const target = options?.target;
  if (typeof target !== "string" || !target.trim() || target.includes("\0"))
    throw new TypeError("Google credential provider requires an explicit target");
  let authMethod: string | undefined;
  const provider = async (signal?: AbortSignal): Promise<string> => {
    signal?.throwIfAborted();
    let stored: string | null;
    try {
      stored = await Bun.secrets.get({ target });
    } catch {
      signal?.throwIfAborted();
      throw new Error("Google protected credential read failed");
    }
    signal?.throwIfAborted();
    let envelope: { token?: { access_token?: unknown; expiry?: unknown }; auth_method?: unknown };
    try {
      if (stored === null) throw new Error();
      envelope = JSON.parse(stored);
    } catch {
      throw new Error("Google protected credential envelope unavailable");
    }
    const token = envelope?.token;
    if (typeof token?.access_token !== "string" || !/^[A-Za-z0-9._~+/-]+=*$/.test(token.access_token))
      throw new Error("Google protected credential envelope unavailable");
    if (token.expiry !== undefined && token.expiry !== null) {
      const expiry =
        typeof token.expiry === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(token.expiry)
          ? Date.parse(token.expiry)
          : NaN;
      if (!Number.isFinite(expiry) || expiry <= Date.now())
        throw new Error("Google protected credential expired or has invalid expiry");
    }
    authMethod = typeof envelope.auth_method === "string" ? envelope.auth_method : undefined;
    return token.access_token;
  };
  return Object.defineProperty(provider, "authMethod", { get: () => authMethod });
}
