import { expect, test } from "bun:test";
import { bunEnv, bunExe, isASAN, isWindows, tempDir, tls } from "harness";
import net from "node:net";
import { join } from "path";

test("dev server html route: non-GET/HEAD requests complete without hanging", async () => {
  await using dir = tempDir("html-route-405", {
    "index.html": `<!DOCTYPE html><html><head><title>t</title></head><body>hi</body></html>`,
  });
  const { default: html } = await import(join(dir, "index.html"));

  using server = Bun.serve({
    port: 0,
    development: true,
    routes: { "/": html },
    fetch() {
      return new Response("Not found", { status: 404 });
    },
  });

  // GET should serve the page.
  {
    const res = await fetch(server.url);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>t</title>");
  }

  // Non-GET/HEAD requests used to write a bare `405` status line with no
  // Content-Length, so HTTP/1.1 keep-alive clients would block forever
  // waiting for framing.
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS", "PATCH"]) {
    const res = await fetch(server.url, { method });
    await res.arrayBuffer();
    expect({
      method,
      status: res.status,
      contentLength: res.headers.get("content-length"),
      allow: res.headers.get("allow"),
    }).toEqual({
      method,
      status: 405,
      contentLength: "0",
      allow: "GET, HEAD",
    });
  }
});

const htmlMethods = ["POST", "PUT", "DELETE", "OPTIONS", "PATCH"];
const htmlMethodFixture = {
  "index.html": `<!DOCTYPE html><html><head><title>method-page</title></head><body><script type="module" src="./entry.ts"></script></body></html>`,
  "entry.ts": `console.log("bundle-output");`,
};

for (const development of [true, { hmr: false }, false]) {
  test(`HTML methods with a broken entry in development=${JSON.stringify(development)}`, async () => {
    using dir = tempDir("html-route-reject-before-build", {
      ...htmlMethodFixture,
      "entry.ts": "const = ;",
    });
    const { default: html } = await import(join(dir, "index.html"));
    await using server = Bun.serve({ port: 0, development, routes: { "/": html } });
    if (development === true) {
      const deniedHost = await fetch(server.url, { method: "POST", headers: { host: "untrusted.invalid" } });
      expect(deniedHost.status).toBe(403);
      expect(deniedHost.headers.get("allow")).toBeNull();
      await deniedHost.arrayBuffer();
    }
    for (const method of htmlMethods) {
      const res = await fetch(server.url, { method });
      expect({ status: res.status, allow: res.headers.get("allow"), body: await res.text() }).toEqual({
        status: development === true ? 405 : 500,
        allow: development === true ? "GET, HEAD" : null,
        body: "",
      });
    }
    const get = await fetch(server.url);
    expect(get.status).toBe(500);
    await get.arrayBuffer();
  });

  for (const path of ["/page", "/index.html"]) {
    test(`HTML methods in development=${JSON.stringify(development)} at ${path}, before and after bundling`, async () => {
      using dir = tempDir("html-route-methods", htmlMethodFixture);
      const { default: html } = await import(join(dir, "index.html"));
      await using server = Bun.serve({
        port: 0,
        development,
        routes: { [path]: html, "/api": { POST: () => new Response("posted") }, "/static": new Response("static") },
        fetch: () => new Response("fallback", { status: 404 }),
      });
      const url = new URL(path, server.url);
      for (const phase of ["cold", "warm"]) {
        for (const method of htmlMethods) {
          const res = await fetch(url, { method, body: method === "POST" ? "request-body" : undefined });
          const body = await res.text();
          if (development !== true) {
            expect({ phase, method, status: res.status, allow: res.headers.get("allow") }).toEqual({
              phase,
              method,
              status: 200,
              allow: null,
            });
            expect(body).toContain("<title>method-page</title>");
            continue;
          }
          expect({
            phase,
            method,
            status: res.status,
            allow: res.headers.get("allow"),
            length: res.headers.get("content-length"),
            body,
          }).toEqual({
            phase,
            method,
            status: 405,
            allow: "GET, HEAD",
            length: "0",
            body: "",
          });
        }
        const head = await fetch(url, { method: "HEAD" });
        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
        const get = await fetch(url);
        expect(get.status).toBe(200);
        const body = await get.text();
        expect(body).toContain("<title>method-page</title>");
        const assetPath = /src="([^"]+\.js)"/.exec(body)?.[1];
        expect(assetPath).toBeDefined();
        const assetUrl = new URL(assetPath!, server.url);
        expect(await (await fetch(assetUrl)).text()).toContain("bundle-output");
        const assetPost = await fetch(assetUrl, { method: "POST" });
        expect({
          status: assetPost.status,
          allow: assetPost.headers.get("allow"),
          body: await assetPost.text(),
        }).toEqual(
          development === true
            ? { status: 404, allow: null, body: "fallback" }
            : { status: 200, allow: null, body: expect.stringContaining("bundle-output") },
        );
      }
      const api = await fetch(new URL("/api", server.url), { method: "POST" });
      expect({ status: api.status, body: await api.text() }).toEqual({ status: 200, body: "posted" });
      const staticPost = await fetch(new URL("/static", server.url), { method: "POST" });
      expect(await staticPost.text()).toBe("static");
      const missing = await fetch(new URL("/missing", server.url), { method: "POST" });
      expect({ status: missing.status, body: await missing.text() }).toEqual({ status: 404, body: "fallback" });
    });
  }
}

test("HTML routes serve extended HTTP methods before and after bundling", async () => {
  using dir = tempDir("html-route-unknown-method", htmlMethodFixture);
  const { default: html } = await import(join(dir, "index.html"));
  await using server = Bun.serve({ port: 0, development: false, routes: { "/index.html": html } });
  for (const warm of [false, true]) {
    if (warm) {
      const res = await fetch(new URL("/index.html", server.url));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("<title>method-page</title>");
    }
    const socket = net.connect(server.port!, "127.0.0.1");
    try {
      const { promise, resolve, reject } = Promise.withResolvers<string>();
      const chunks: Buffer[] = [];
      socket.on("error", reject);
      socket.on("data", chunk => chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
      socket.on("end", () => resolve(Buffer.concat(chunks).toString()));
      socket.on("close", () => reject(new Error("closed before response completed")));
      socket.on("connect", () =>
        socket.write("COPY /index.html HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"),
      );
      const response = await promise;
      const split = response.indexOf("\r\n\r\n");
      expect(split).toBeGreaterThan(0);
      expect(response.slice(0, split)).toMatch(/^HTTP\/1\.1 200 /);
      const length = /\r\ncontent-length: (\d+)(?:\r\n|$)/i.exec(response.slice(0, split));
      expect(length).not.toBeNull();
      const body = response.slice(split + 4);
      expect(Buffer.byteLength(body)).toBe(Number(length![1]));
      expect(body).toContain("<title>method-page</title>");
    } finally {
      socket.destroy();
    }
  }
});

for (const protocol of ["http2", "http3"] as const) {
  test(`HTML route methods over ${protocol}, before and after bundling`, async () => {
    using dir = tempDir("html-route-mux-methods", htmlMethodFixture);
    const { default: html } = await import(join(dir, "index.html"));
    await using server = Bun.serve({
      port: 0,
      development: false,
      tls,
      http1: false,
      http2: protocol === "http2",
      http3: protocol === "http3",
      routes: { "/index.html": html },
    });
    const url = new URL("/index.html", server.url);
    const options = { protocol, tls: { rejectUnauthorized: false } };
    for (const phase of ["cold", "warm"]) {
      for (const method of htmlMethods) {
        const res = await fetch(url, { ...options, method, body: method === "POST" ? "request-body" : undefined });
        const body = await res.text();
        expect({
          phase,
          method,
          status: res.status,
          allow: res.headers.get("allow"),
        }).toEqual({
          phase,
          method,
          status: 200,
          allow: null,
        });
        expect(body).toContain("<title>method-page</title>");
      }
      const head = await fetch(url, { ...options, method: "HEAD" });
      expect({ status: head.status, body: await head.text() }).toEqual({ status: 200, body: "" });
      const get = await fetch(url, options);
      expect(get.status).toBe(200);
      expect(await get.text()).toContain("<title>method-page</title>");
    }
  });
}

// A server whose JS wrapper survives to lastChanceToFinalize used to leak its
// NewServer Box: finalize() -> schedule_deinit() enqueued a task that
// the now-exiting event loop never ran. The html_bundle::Route.server
// back-pointer makes the orphaned Box a pointer cycle, so LSan reports every
// interior allocation as an indirect leak. Only observable via LeakSanitizer.
test.skipIf(!isASAN || isWindows)(
  "stopped Bun.serve with a static route is freed at VM teardown",
  async () => {
    await using dir = tempDir("serve-static-route-teardown-leak", {
      "index.html": `<!DOCTYPE html><html><body>hi</body></html>`,
    });
    await using proc = Bun.spawn({
      cmd: [
        bunExe(),
        "-e",
        `
          const { default: html } = await import(process.argv[1]);
          const server = Bun.serve({
            port: 0,
            development: true,
            routes: { "/": html },
            fetch: () => new Response("no"),
          });
          await (await fetch(server.url)).text();
          server.stop(true);
        `,
        join(dir, "index.html"),
      ],
      env: {
        ...bunEnv,
        BUN_DESTRUCT_VM_ON_EXIT: "1",
        ASAN_OPTIONS: [bunEnv.ASAN_OPTIONS, "detect_leaks=1"].filter(Boolean).join(":"),
        LSAN_OPTIONS: `print_suppressions=0:suppressions=${join(import.meta.dirname, "../../../leaksan.supp")}`,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    // The dev-server bundler prints "Bundled page in Nms: <path>" to stderr on
    // first request; strip it so the assertion shows only LSan's report.
    const filtered = stderr
      .split("\n")
      .filter(l => !l.includes("Bundled page in "))
      .join("\n")
      .trim();
    expect({ stdout, stderr: filtered, exitCode }).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  },
  // LSan symbolizes through llvm-symbolizer on failure, which is slow against
  // the debug binary.
  30_000,
);

// Graceful stop() leaves the keep-alive socket in the uws app's socket group.
// A NewApp::destroy at lastChanceToFinalize would unlink that group from the
// loop and orphan the socket, so the synchronous deinit path above is gated
// on TERMINATED (set only by an abrupt stop or an app.close() that already
// drained the group).
test.skipIf(!isASAN || isWindows)(
  "gracefully-stopped Bun.serve does not orphan a keep-alive socket at VM teardown",
  async () => {
    await using proc = Bun.spawn({
      cmd: [
        bunExe(),
        "-e",
        `
          const server = Bun.serve({ port: 0, fetch: () => new Response("ok") });
          await (await fetch(server.url)).text();
          server.stop();
        `,
      ],
      env: {
        ...bunEnv,
        BUN_DESTRUCT_VM_ON_EXIT: "1",
        ASAN_OPTIONS: [bunEnv.ASAN_OPTIONS, "detect_leaks=1"].filter(Boolean).join(":"),
        LSAN_OPTIONS: `print_suppressions=0:suppressions=${join(import.meta.dirname, "../../../leaksan.supp")}`,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect({ stdout, stderr, exitCode }).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  },
  30_000,
);
