const chromium = require("bun:chromium");
const obscura = require("bun:obscura");
const dns = Bun.dns;

function googleRuntime(env: Record<string, string | undefined> = process.env) {
  const configuredProject = env.APHRODY_VERTEX_PROJECT ?? env.GOOGLE_CLOUD_PROJECT;
  const project: "aphrody" | "rgfr" =
    configuredProject === "rgfr" || configuredProject === "rgfr-8927d" ? "rgfr" : "aphrody";
  return {
    project,
    location: env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
    home: env.APHRODY_HOME ?? "~/.aphrody",
    auth: env.APHRODY_GCP_AUTH ?? "adc-or-secret-manager",
  };
}

type ClientOptions = {
  credentialProvider: (signal?: AbortSignal) => string | Promise<string>;
  baseURL?: string | URL;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

function createClient(options: ClientOptions) {
  if (!options || typeof options.credentialProvider !== "function")
    throw new TypeError("Google credentialProvider must be a function");
  const base = new URL(options.baseURL ?? "https://www.googleapis.com/");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  const google = base.hostname === "googleapis.com" || base.hostname.endsWith(".googleapis.com");
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (!loopback && (!google || base.protocol !== "https:")) ||
    (loopback && !["http:", "https:"].includes(base.protocol))
  )
    throw new TypeError("Google baseURL must use Google HTTPS or a loopback HTTP(S) endpoint");
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  const transport = options.fetch ?? globalThis.fetch;
  if (typeof transport !== "function") throw new TypeError("Google fetch must be a function");
  const provider = options.credentialProvider;

  async function request(relativePath: string, init: RequestInit = {}): Promise<Response> {
    if (
      typeof relativePath !== "string" ||
      !relativePath ||
      relativePath.startsWith("/") ||
      relativePath.includes("\\") ||
      Array.from(relativePath).some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127) ||
      /^[a-z][a-z0-9+.-]*:/i.test(relativePath)
    )
      throw new TypeError("Google request path must be relative");
    const pathname = relativePath.split(/[?#]/, 1)[0];
    for (const [index, segment] of pathname.split("/").entries()) {
      const decoded = decodeURIComponent(segment);
      if (index === 0 && segment === "." && relativePath.startsWith("./")) continue;
      if ([".", ".."].includes(decoded) || decoded.includes("/") || decoded.includes("\\"))
        throw new TypeError("Google request path must not escape its baseURL");
    }
    const url = new URL(relativePath, base);
    if (
      url.origin !== base.origin ||
      !url.pathname.startsWith(base.pathname) ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new TypeError("Google request path must not escape its baseURL");
    const headers = new Headers(init.headers);
    if (headers.has("authorization") || headers.has("proxy-authorization"))
      throw new TypeError("Google authorization headers are owned by credentialProvider");
    const signal = init.signal ?? undefined;
    signal?.throwIfAborted();
    let token: string;
    try {
      token = await provider(signal);
    } catch {
      signal?.throwIfAborted();
      throw new Error("Google credential provider failed");
    }
    signal?.throwIfAborted();
    if (typeof token !== "string" || !/^[A-Za-z0-9._~+/-]+=*$/.test(token))
      throw new TypeError("Google credential provider returned an invalid token");
    headers.set("authorization", `Bearer ${token}`);
    let response: Response;
    try {
      response = await transport(url, { ...init, headers, redirect: "error" });
    } catch {
      signal?.throwIfAborted();
      throw new Error("Google request failed");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Google request failed (HTTP ${response.status})`);
    }
    return response;
  }

  return { request };
}

export default { googleRuntime, createClient, chromium, obscura, dns };
