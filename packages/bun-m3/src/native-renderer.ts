// SPDX-License-Identifier: Apache-2.0
import type { M3SheetRequest } from "./catalog";

export function createNativeM3Renderer(options: {
  endpoint: "http://m3-renderer:3000";
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}) {
  if (options.endpoint !== "http://m3-renderer:3000")
    throw new Error("Explicit internal native renderer endpoint required");
  const request = options.fetch ?? fetch;
  return async (config: M3SheetRequest): Promise<string> => {
    const url = new URL("/api/m3/css", options.endpoint);
    for (const key of ["sheet", "seed", "variant", "dark", "contrast"] as const)
      if (config[key] !== undefined) url.searchParams.set(key, String(config[key]));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("Native renderer deadline exceeded")), 20_000);
    let cancel: (() => Promise<void>) | undefined;
    try {
      const response = await request(url, {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        signal: controller.signal,
      });
      if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "text/css")
        throw new Error("Native renderer did not return CSS");
      const declared = response.headers.get("content-length");
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > 2 * 1024 * 1024))
        throw new Error("Native renderer CSS exceeds limit");
      if (!response.body) throw new Error("Native renderer body missing");
      const reader = response.body.getReader();
      cancel = () => reader.cancel();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 2 * 1024 * 1024) throw new Error("Native renderer CSS exceeds limit");
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (cancel) void cancel().catch(() => {});
    }
  };
}
