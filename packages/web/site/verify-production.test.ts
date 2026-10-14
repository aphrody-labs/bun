import { expect, test } from "bun:test";
import { verifyProduction } from "./verify-production";

const source = "a".repeat(40),
  snapshot = "b".repeat(64);
const editorialRoutes = [
  "/guides/decisions-typees-jev",
  "/guides/graphe-de-code",
  "/blog/video-native",
  "/blog/qualite-native",
];
function fixture(change?: (path: string, value: Record<string, any>) => Response | Record<string, any> | undefined) {
  const requests: { path: string; method: string; authorization: string | null; cookie: string | null }[] = [];
  const pages = editorialRoutes.map(path => ({ path, models: ["Jev-fixture"], grounding: 0.98 }));
  const metadata: Record<string, Record<string, any>> = {
    "/publish.json": { commit: source, evidence: "c".repeat(64), protected: "fixture-never-expose" },
    "/api/site/snapshot": { id: snapshot, source, profile: "bun", repository: "aphrody-labs/bun" },
    "/site.json": {
      commit: source,
      editorial: { source, snapshot, validator: "bun:yolo", receiptSha256: "d".repeat(64), pages },
    },
    "/editorial-provenance.json": {
      schema: 1,
      source,
      snapshot,
      validator: "bun:yolo",
      receiptSha256: "d".repeat(64),
      pages,
    },
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      requests.push({
        path,
        method: request.method,
        authorization: request.headers.get("authorization"),
        cookie: request.headers.get("cookie"),
      });
      const value = metadata[path] ?? {};
      const changed = change?.(path, value);
      if (changed instanceof Response) return changed;
      if (metadata[path]) return Response.json(changed ?? value);
      return new Response(
        `<!doctype html><html><head><title>Fixture ${path}</title><link rel="canonical" href="${server.url.origin}${path}"></head><body>Fixture page</body></html>`,
        { headers: { "content-type": "text/html" } },
      );
    },
  });
  return {
    server,
    requests,
    options: { origin: server.url.origin, expectedSource: source, expectedSnapshot: snapshot, editorialRoutes },
  };
}

test("native GET and DNS prove all thirteen public routes and one source/snapshot without leaking response fields", async () => {
  const { server, options, requests } = fixture();
  try {
    const report = await verifyProduction(options);
    expect(report.qualified).toBe(true);
    expect(report.routes).toHaveLength(13);
    expect(report.dns.status).toBe("resolved");
    expect(report.dns.count).toBeGreaterThan(0);
    expect(report.observed.databaseSnapshot).toBe(snapshot);
    expect(report.routes.every(route => route.ok && route.status === 200 && route.bytes < 1024 * 1024)).toBe(true);
    expect(
      requests.every(request => request.method === "GET" && request.authorization === null && request.cookie === null),
    ).toBe(true);
    expect(JSON.stringify(report)).not.toContain("fixture-never-expose");
  } finally {
    server.stop(true);
  }
});

test("metadata source/snapshot divergence is a failed production gate, even when every route returns 200", async () => {
  const { server, options } = fixture((path, value) =>
    path === "/api/site/snapshot" ? { ...value, source: "f".repeat(40), id: "e".repeat(64) } : undefined,
  );
  try {
    const report = await verifyProduction(options);
    expect(report.qualified).toBe(false);
    expect(report.issues).toContain("source-mismatch");
    expect(report.issues).toContain("snapshot-mismatch");
  } finally {
    server.stop(true);
  }
});

test("HTTP errors and homepage fallback on a document route are rejected independently", async () => {
  const { server, options } = fixture(path => {
    if (path === "/blog/video-native") return new Response("private-error-fixture", { status: 503 });
    if (path === "/docs/runtime/yolo")
      return new Response('<html><head><link rel="canonical" href="https://aphrody.app/"></head></html>', {
        headers: { "content-type": "text/html" },
      });
  });
  try {
    const report = await verifyProduction(options);
    expect(report.qualified).toBe(false);
    expect(report.routes.find(route => route.path === "/blog/video-native")!.issue).toBe("http-status");
    expect(report.routes.find(route => route.path === "/docs/runtime/yolo")!.issue).toBe("html-route-mismatch");
    expect(JSON.stringify(report)).not.toContain("private-error-fixture");
  } finally {
    server.stop(true);
  }
});

test("streamed bodies above one MiB and unfinished bodies stop within the native request deadline", async () => {
  const { server, options } = fixture(path => {
    if (path === "/guides")
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1024 * 1024 + 1));
            controller.close();
          },
        }),
        { headers: { "content-type": "text/html" } },
      );
    if (path === "/blog")
      return new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "text/html" } });
  });
  try {
    const report = await verifyProduction({ ...options, timeoutMilliseconds: 100 });
    expect(report.qualified).toBe(false);
    expect(report.routes.find(route => route.path === "/guides")!.issue).toBe("body-limit");
    expect(report.routes.find(route => route.path === "/blog")!.issue).toBe("timeout");
  } finally {
    server.stop(true);
  }
});

test("invalid scope and cancellation refuse network operations before DNS or HTTP", async () => {
  const { server, options, requests } = fixture();
  try {
    await expect(verifyProduction({ ...options, expectedSource: "mutable-main" })).rejects.toThrow("scope");
    await expect(verifyProduction({ ...options, editorialRoutes: ["/guides/../private"] })).rejects.toThrow("routes");
    await expect(verifyProduction(options, AbortSignal.abort(Error("cancel production proof")))).rejects.toThrow(
      "cancel production proof",
    );
    expect(requests).toHaveLength(0);
  } finally {
    server.stop(true);
  }
});

test("untrusted identity strings and malformed editorial metadata are reported without exposing them", async () => {
  const { server, options } = fixture((path, value) =>
    path === "/publish.json"
      ? { ...value, commit: "fixture-private-source" }
      : path === "/editorial-provenance.json"
        ? { ...value, pages: "fixture-private-pages" }
        : undefined,
  );
  try {
    const report = await verifyProduction(options);
    expect(report.qualified).toBe(false);
    expect(report.observed.publishSource).toBeNull();
    expect(report.issues).toContain("editorial-route-not-in-manifest");
    expect(JSON.stringify(report)).not.toContain("fixture-private");
  } finally {
    server.stop(true);
  }
});
