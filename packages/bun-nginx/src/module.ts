import type { Nginx } from "bun:nginx";

export interface NginxModuleInfo {
  schema: 1;
  module: "ngx_http_bun_module";
  nginxVersion: number;
  nginxSourceRevision: string;
  ngxRustRevision: string;
  configurationSha256: string;
  moduleSignature: string;
  eventLoop: "nginx-worker";
  allocationOwner: "request-pool";
  delayMilliseconds: number;
  workerPID: number;
  masterPID: number;
  pendingTimers: number;
}
export interface NginxModuleReadOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  expectedConfigurationSha256?: string;
}

/** Reads the configured native module endpoint of this owned process over local HTTP. */
export async function readModuleInfo(
  owner: Nginx,
  endpoint: string | URL,
  options: NginxModuleReadOptions = {},
): Promise<NginxModuleInfo> {
  const url = new URL(endpoint);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new TypeError("The owned NGINX module endpoint must use loopback HTTP without credentials or a fragment");
  const timeout = options.timeoutMs ?? 2000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30_000)
    throw new RangeError("timeoutMs must be an integer between 1 and 30000");
  if (options.expectedConfigurationSha256 !== undefined && !/^[a-f0-9]{64}$/.test(options.expectedConfigurationSha256))
    throw new TypeError("expectedConfigurationSha256 must be a lowercase SHA256 digest");
  const deadline = performance.now() + timeout;
  const status = await owner.status({ signal: options.signal, timeoutMs: timeout });
  if (!status.running || status.pid === null) throw new Error("The owned NGINX master is not running");
  const remaining = Math.floor(deadline - performance.now());
  if (remaining < 1) throw new DOMException("Native module deadline exceeded", "TimeoutError");
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(remaining)])
    : AbortSignal.timeout(remaining);
  // An owned process can release/rebind its listener; do not retain a connection across lifetimes.
  const response = await fetch(url, { signal, redirect: "error", credentials: "omit", keepalive: false });
  if (!response.ok || !response.body) throw new Error(`Native NGINX module returned HTTP ${response.status}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 4096) throw new Error("Native NGINX module metadata exceeded 4096 bytes");
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value = JSON.parse(new TextDecoder().decode(bytes)) as Partial<NginxModuleInfo>;
  if (!value || typeof value !== "object") throw new Error("Native NGINX module metadata must be an object");
  const sha = (text: unknown, length: number) =>
    typeof text === "string" && text.length === length && /^[a-f0-9]+$/.test(text);
  const pid = (id: unknown) => typeof id === "number" && Number.isInteger(id) && id > 0 && id <= 0xffff_ffff;
  if (
    value.schema !== 1 ||
    value.module !== "ngx_http_bun_module" ||
    value.eventLoop !== "nginx-worker" ||
    value.allocationOwner !== "request-pool" ||
    !sha(value.nginxSourceRevision, 40) ||
    !sha(value.ngxRustRevision, 40) ||
    !sha(value.configurationSha256, 64) ||
    !Number.isInteger(value.nginxVersion) ||
    value.nginxVersion! <= 0 ||
    !Number.isInteger(value.delayMilliseconds) ||
    value.delayMilliseconds! < 0 ||
    value.delayMilliseconds! > 1000 ||
    !Number.isInteger(value.pendingTimers) ||
    value.pendingTimers! < 0 ||
    value.pendingTimers! > 0xffff_ffff ||
    typeof value.moduleSignature !== "string" ||
    value.moduleSignature.length === 0 ||
    value.moduleSignature.length > 128 ||
    !pid(value.workerPID) ||
    !pid(value.masterPID)
  )
    throw new Error("The native NGINX module metadata is incompatible with schema 1");
  if (value.masterPID !== status.pid && value.workerPID !== status.pid)
    throw new Error("The module endpoint belongs to a different NGINX master");
  if (options.expectedConfigurationSha256 && value.configurationSha256 !== options.expectedConfigurationSha256)
    throw new Error("The native NGINX module configuration differs from its selected build receipt");
  return value as NginxModuleInfo;
}
