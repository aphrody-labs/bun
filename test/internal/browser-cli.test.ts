// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  buildPWA,
  compileApplication,
  downloadPage,
  parseArguments,
  runBrowser,
  type Owner,
} from "../../scripts/aphrody/browser";
import { bunEnv, isWindows, tempDir } from "harness";
import { join } from "node:path";
import { findExecutable, launch } from "bun:chromium";

test("native Crawl optional provider rejects before reading options", async () => {
  expect(typeof Bun.Crawl.available).toBe("boolean");
  if (Bun.Crawl.available) return;
  let touched = false;
  const options: Bun.CrawlOptions = {
    store: "unavailable-provider-must-not-access",
    get action(): Bun.CrawlOptions["action"] {
      touched = true;
      throw new Error("unexpected getter");
    },
  };
  await expect(Bun.Crawl.run(options)).rejects.toThrow("ERR_CRAWL_PROVIDER_UNAVAILABLE");
  expect(touched).toBe(false);
});

test("native Crawl commits bounded CDX pages and honors pre-aborted jobs", async () => {
  if (!Bun.Crawl.available) return;
  using dir = tempDir("native-crawl-api", {});
  let requests = 0;
  using server = Bun.serve({
    port: 0,
    fetch() {
      requests++;
      return new Response("test,example)/ 20200101000000 https://example.test/ text/html 200 digest 12\n");
    },
  });
  const store = join(String(dir), "index.sqlite");
  const options: Bun.CrawlOptions = {
    action: "archive-cdx",
    store,
    seed: "https://example.test/",
    endpoint: new URL("/cdx", server.url).href,
    allowPrivate: true,
  };
  expect(await Bun.Crawl.run(options)).toMatchObject({
    owner: "bun_browser_crawl",
    pages: 1,
    inserted: 1,
    complete: true,
  });
  expect(await Bun.Crawl.run(options)).toMatchObject({ pages: 0, inserted: 0, complete: true });
  expect(requests).toBe(1);
  const cancelledStore = join(String(dir), "cancelled.sqlite");
  await expect(Bun.Crawl.run({ ...options, store: cancelledStore, signal: AbortSignal.abort() })).rejects.toThrow(
    "ERR_CRAWL_ABORTED",
  );
  expect(await Bun.file(cancelledStore).exists()).toBe(false);
  expect(requests).toBe(1);
});

test("native Crawl independent queries share an index without serializing HTTP", async () => {
  if (!Bun.Crawl.available) return;
  using dir = tempDir("native-crawl-parallel", {});
  const both = Promise.withResolvers<void>();
  let requests = 0;
  using server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (++requests === 2) both.resolve();
      await both.promise;
      const original = new URL(request.url).searchParams.get("url")!;
      return new Response(`test,example)/ 20200101000000 ${original} text/html 200 digest 12\n`);
    },
  });
  const store = join(String(dir), "index.sqlite");
  const reports = await Promise.all(
    ["one", "two"].map(path =>
      Bun.Crawl.run({
        action: "archive-cdx",
        store,
        seed: `https://example.test/${path}`,
        endpoint: new URL("/cdx", server.url).href,
        allowPrivate: true,
        signal: AbortSignal.timeout(4000),
      }),
    ),
  );
  expect(requests).toBe(2);
  expect(reports.map(report => report.inserted)).toEqual([1, 1]);
});

test("native Crawl cancels an in-flight page without committing its checkpoint", async () => {
  if (!Bun.Crawl.available) return;
  using dir = tempDir("native-crawl-cancel", {});
  const received = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let requests = 0;
  using server = Bun.serve({
    port: 0,
    async fetch() {
      if (++requests === 1) {
        received.resolve();
        await release.promise;
      }
      return new Response("test,example)/ 20200101000000 https://example.test/ text/html 200 digest 12\n");
    },
  });
  const options: Bun.CrawlOptions = {
    action: "archive-cdx",
    store: join(String(dir), "index.sqlite"),
    seed: "https://example.test/",
    endpoint: new URL("/cdx", server.url).href,
    allowPrivate: true,
  };
  const controller = new AbortController();
  const pending = Bun.Crawl.run({ ...options, timeout: 4000, signal: controller.signal });
  try {
    await Promise.race([
      received.promise,
      pending.then(() => {
        throw new Error("Crawl completed before the fixture request");
      }),
    ]);
    controller.abort();
    await expect(pending).rejects.toThrow("ERR_CRAWL_ABORTED");
  } finally {
    release.resolve();
  }
  expect(await Bun.Crawl.run(options)).toMatchObject({ pages: 1, inserted: 1, complete: true });
  expect(requests).toBe(2);
});

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "base64",
);

test("browser CLI leaves Chrome visibility and WebGPU defaults to its builtin", () => {
  expect(parseArguments(["chrome", "launch"]).launch).toEqual({});
  expect(
    parseArguments(["chrome", "launch", "--headless", "--no-webgpu", "--extension", "a path", "--extension", "b"])
      .launch,
  ).toEqual({ headless: true, webgpu: false, extensions: ["a path", "b"] });
});

test("browser CLI rejects incompatible options before loading any owner", () => {
  for (const args of [
    ["obscura", "launch", "--workers", "2"],
    ["chrome", "launch", "--workers", "2"],
    ["chrome", "connect"],
    ["obscura", "launch", "--timeout", "0"],
    ["obscura", "launch", "--workers", "65"],
    ["chrome", "launch", "--executable"],
  ])
    expect(() => parseArguments(args)).toThrow();
});

test("download and compile require explicit outputs before owner loading", () => {
  for (const command of ["download", "compile"])
    expect(() => parseArguments(["chrome", command, "https://example.test/"])).toThrow("needs --outfile");
  expect(parseArguments(["chrome", "compile", "app.tsx", "--outfile", "app"]).endpoint).toBe("app.tsx");
  expect(parseArguments(["chrome", "compile", "app.tsx", "--mode", "webview", "--outfile", "app"]).mode).toBe(
    "webview",
  );
  expect(
    parseArguments(["chrome", "compile", "app.tsx", "--mode", "pwa", "--outdir", "dist", "--icon", "icon.png"]).mode,
  ).toBe("pwa");
});

test("download preserves redirected asset base and rejects non-HTML responses", async () => {
  using server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/start") return Response.redirect(new URL("/nested/page", url).href, 302);
      if (url.pathname === "/nested/page")
        return new Response('<html><head></head><body><img src="image.png"></body></html>', {
          headers: { "content-type": "text/html" },
        });
      if (url.pathname === "/base")
        return new Response(
          '<html><head><base href="/assets/" target="_blank"></head><body><img src="image.png"></body></html>',
          {
            headers: { "content-type": "text/html" },
          },
        );
      return new Response("not HTML");
    },
  });
  const html = await downloadPage(new URL("/start", server.url).href);
  expect(html).toContain(`<base href="${new URL("/nested/page", server.url).href}">`);
  expect(html).toContain('src="image.png"');
  const based = await downloadPage(new URL("/base", server.url).href);
  expect(based).toContain(`href="${new URL("/assets/", server.url).href}"`);
  expect(based).toContain('target="_blank"');
  expect(based.match(/<base /g)).toHaveLength(1);
  await expect(downloadPage(new URL("/plain", server.url).href)).rejects.toThrow("HTML response");
  await expect(downloadPage("https://user:secret@example.test/")).rejects.toThrow("embedded credentials");
});

test("compile delegates TypeScript to Bun and produces an executable artifact", async () => {
  using directory = tempDir("browser-cli-compile", { "app.ts": "const answer: number = 42; console.log(answer);" });
  const outfile = join(String(directory), isWindows ? "app.exe" : "app");
  await compileApplication(
    parseArguments(["chrome", "compile", join(String(directory), "app.ts"), "--outfile", outfile]),
  );
  await using child = Bun.spawn([outfile], {
    env: { ...bunEnv, BUN_BE_BUN: "0" },
    cwd: String(directory),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  expect(stdout, JSON.stringify({ stderr, code })).toBe("42\n");
  expect(stderr).toBe("");
  expect(code).toBe(0);
}, 30000);

test("download cancels a chunked response when the HTML byte limit is exceeded", async () => {
  const closed = Promise.withResolvers<void>();
  const chunk = new Uint8Array(1024 * 1024).fill(32);
  using server = Bun.serve({
    port: 0,
    fetch() {
      return new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(chunk);
          },
          cancel() {
            closed.resolve();
          },
        }),
        { headers: { "content-type": "text/html" } },
      );
    },
  });
  await expect(downloadPage(server.url.href)).rejects.toThrow("16 MiB HTML limit");
  await closed.promise;
});

test("download preserves pre-abort and mid-stream abort reasons and closes the body", async () => {
  const started = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  using server = Bun.serve({
    port: 0,
    fetch() {
      return new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(4096));
            started.resolve();
          },
          cancel() {
            closed.resolve();
          },
        }),
        { headers: { "content-type": "text/html" } },
      );
    },
  });
  const before = new AbortController();
  before.abort(new Error("before download"));
  await expect(downloadPage(server.url.href, 30000, before.signal)).rejects.toThrow("before download");
  const controller = new AbortController();
  const pending = downloadPage(server.url.href, 30000, controller.signal);
  await started.promise;
  controller.abort(new Error("during download"));
  await expect(pending).rejects.toThrow("during download");
  await closed.promise;
});

test("download cancels HTTP error bodies before rejecting", async () => {
  const closed = Promise.withResolvers<void>();
  using server = Bun.serve({
    port: 0,
    fetch() {
      return new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(4096));
          },
          cancel() {
            closed.resolve();
          },
        }),
        { status: 418, headers: { "content-type": "text/html" } },
      );
    },
  });
  await expect(downloadPage(server.url.href)).rejects.toThrow("HTTP 418");
  await closed.promise;
});

test("PWA produces real PNG icons and only caches its owned files", async () => {
  using directory = tempDir("browser-cli-pwa", {
    "index.html": "<main>Fixture</main>",
    "dist/unrelated.txt": "preserved",
    "icon.png": tinyPng,
  });
  const outdir = join(String(directory), "dist");
  const icon = join(String(directory), "icon.png");
  const options = parseArguments([
    "chrome",
    "pwa",
    join(String(directory), "index.html"),
    "--outdir",
    outdir,
    "--icon",
    icon,
    "--name",
    "Fixture application",
  ]);
  await buildPWA(options);
  const manifest = await Bun.file(join(outdir, "manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Fixture application", display: "standalone", start_url: "./", scope: "./" });
  for (const size of [192, 512]) {
    expect(await new Bun.Image(join(outdir, `icon-${size}.png`)).metadata()).toMatchObject({
      width: size,
      height: size,
      format: "png",
    });
    expect(manifest.icons).toContainEqual({ src: `./icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png" });
  }
  const receipt = await Bun.file(join(outdir, "bun-pwa.json")).json();
  for (const file of receipt.files)
    expect(new Bun.CryptoHasher("sha256").update(await Bun.file(join(outdir, file.path)).bytes()).digest("hex")).toBe(
      file.sha256,
    );
  expect(receipt.files.some((file: { path: string }) => file.path.includes("unrelated"))).toBe(false);
  expect(await Bun.file(join(outdir, "unrelated.txt")).text()).toBe("preserved");
  expect(await Bun.file(join(outdir, "index.html")).text()).toContain("navigator.serviceWorker.register");
  expect(await Bun.file(join(outdir, "service-worker.js")).text()).toContain("cache.addAll");
  await expect(buildPWA(options)).rejects.toThrow("already exists");
});

test.skipIf(!findExecutable())(
  "generated PWA registers in Chrome and decodes its install icons",
  async () => {
    using directory = tempDir("browser-cli-pwa-chrome", {
      "index.html": "<html><head><title>PWA</title></head><body>Application</body></html>",
      "icon.png": tinyPng,
    });
    const outdir = join(String(directory), "dist");
    await buildPWA(
      parseArguments([
        "chrome",
        "pwa",
        join(String(directory), "index.html"),
        "--outdir",
        outdir,
        "--icon",
        join(String(directory), "icon.png"),
      ]),
    );
    const receipt = await Bun.file(join(outdir, "bun-pwa.json")).json();
    const ownedFiles = new Set<string>([
      "service-worker.js",
      ...receipt.files.map((file: { path: string }) => (file.path.startsWith("./") ? file.path.slice(2) : file.path)),
    ]);
    using server = Bun.serve({
      port: 0,
      async fetch(request) {
        const path = new URL(request.url).pathname;
        const name = path === "/app/" ? "index.html" : path.startsWith("/app/") ? path.slice(5) : "";
        if (!ownedFiles.has(name)) return new Response("Missing", { status: 404 });
        return new Response(Bun.file(join(outdir, name)));
      },
    });
    await using browser = await launch({ executable: findExecutable()!, headless: true, timeout: 10000 });
    const { targetId } = await browser.connection.send<{ targetId: string }>("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await browser.connection.send<{ sessionId: string }>("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await browser.connection.send("Page.enable", {}, sessionId);
    const loaded = Promise.withResolvers<void>();
    const deadline = AbortSignal.timeout(10000);
    const timedOut = () => loaded.reject(new Error("PWA page did not finish loading"));
    const unsubscribe = browser.connection.on("Page.loadEventFired", (_, eventSession) => {
      if (eventSession === sessionId) loaded.resolve();
    });
    deadline.addEventListener("abort", timedOut, { once: true });
    try {
      await Promise.all([
        browser.connection.send("Page.navigate", { url: new URL("/app/", server.url).href }, sessionId),
        loaded.promise,
      ]);
    } finally {
      unsubscribe();
      deadline.removeEventListener("abort", timedOut);
    }
    const result = await browser.connection.send<{ result: { value: any }; exceptionDetails?: unknown }>(
      "Runtime.evaluate",
      {
        expression: `(async()=>{const registration=await navigator.serviceWorker.ready;const manifest=await fetch(new URL('./manifest.webmanifest',location.href)).then(r=>r.json());const sizes=[];for(const icon of manifest.icons){const image=new Image();image.src=new URL(icon.src,location.href);await image.decode();sizes.push([image.naturalWidth,image.naturalHeight]);}return {scope:registration.scope,sizes,active:registration.active.state};})()`,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    expect(result.exceptionDetails).toBeUndefined();
    expect(result.result.value).toEqual({
      scope: new URL("/app/", server.url).href,
      sizes: [
        [192, 192],
        [512, 512],
      ],
      active: "activated",
    });
  },
  30000,
);

test("help does not load builtin modules", async () => {
  expect(parseArguments(["chrome", "connect", "--help"]).command).toBe("help");
  const output: string[] = [];
  expect(
    await runBrowser(
      parseArguments(["obscura", "help"]),
      async () => {
        throw new Error("must not load");
      },
      value => output.push(value),
    ),
  ).toBe(0);
  expect(output[0]).toContain("bun:obscura");
});

test("connect delegates the endpoint and timeout, probes then closes", async () => {
  const calls: unknown[] = [];
  const owner: Owner = {
    async connect(endpoint, options) {
      calls.push(endpoint, options.timeout);
      return {
        async send(method) {
          calls.push(method);
          return { product: "fixture" };
        },
        close() {
          calls.push("close");
        },
      };
    },
    async launch() {
      throw new Error("must not launch");
    },
  };
  const result = await runBrowser(
    parseArguments(["obscura", "connect", "ws://127.0.0.1:123/devtools/browser", "--timeout", "17"]),
    async engine => {
      calls.push(engine);
      return owner;
    },
    value => calls.push(value),
  );
  expect(calls).toEqual([
    "obscura",
    "ws://127.0.0.1:123/devtools/browser",
    17,
    "Browser.getVersion",
    '{"product":"fixture"}',
    "close",
  ]);
  expect(result).toBe(0);
});

test("connect closes even when the handshake probe fails", async () => {
  let closed = false;
  const owner: Owner = {
    async connect() {
      return {
        async send() {
          throw new Error("probe failed");
        },
        close() {
          closed = true;
        },
      };
    },
    async launch() {
      throw new Error("must not launch");
    },
  };
  await expect(
    runBrowser(parseArguments(["chrome", "connect", "ws://127.0.0.1:123"]), async () => owner),
  ).rejects.toThrow("probe failed");
  expect(closed).toBe(true);
});

test("launch preserves selected executable arguments and waits before closing", async () => {
  const calls: unknown[] = [];
  const owner: Owner = {
    async connect() {
      throw new Error("must not connect");
    },
    async launch(options) {
      calls.push(options);
      return {
        process: { exited: Promise.resolve(7) },
        async close() {
          calls.push("close");
        },
      };
    },
  };
  const options = parseArguments(["obscura", "launch", "--executable", "a path/owner", "--workers", "1"]);
  expect(
    await runBrowser(
      options,
      async () => owner,
      () => {},
    ),
  ).toBe(7);
  expect(calls).toEqual([{ executable: "a path/owner", workers: 1 }, "close"]);
});
