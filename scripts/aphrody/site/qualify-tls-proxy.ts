// SPDX-License-Identifier: Apache-2.0
// Disposable canonical-origin browser qualification; certificates stay outside source control.
export function startQualificationProxy() {
  const cert = process.env.SITE_TLS_CERT;
  const key = process.env.SITE_TLS_KEY;
  if (!cert || !key) throw new Error("Explicit qualification certificate and key required");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 443,
    maxRequestBodySize: 64 * 1024,
    tls: { cert: Bun.file(cert), key: Bun.file(key) },
    async fetch(request) {
      const target = new URL(request.url);
      if (target.hostname !== "aphrody.com") return new Response(null, { status: 403 });
      target.protocol = "http:";
      target.hostname = "127.0.0.1";
      target.port = "18804";
      const headers = new Headers(request.headers);
      headers.set("host", "aphrody.com");
      for (const header of ["connection", "forwarded", "x-forwarded-host", "x-forwarded-proto"]) headers.delete(header);
      return fetch(target, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual",
        signal: request.signal,
      });
    },
  });
  console.log(`Disposable site qualification proxy: ${server.hostname}:${server.port}`);
  return server;
}
if (import.meta.main) startQualificationProxy();
