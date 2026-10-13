import { expect, test } from "bun:test";
import { tempDir } from "../../../test/harness";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { HOME_THEME_SCRIPT, HOME_THEME_BOOTSTRAP } from "./home-theme";
import {
  adaptUpstreamHome,
  buildUpstreamHome,
  HOME_SEARCH_SCRIPT,
  loadRuntimeHomeFacts,
  normalizeRuntimeHomeFact,
  publicRuntimeHomeFact,
  type RuntimeHomeFact,
} from "./upstream-home";

const source = "a".repeat(40);
const receipt = (): RuntimeHomeFact => ({
  schema: 1,
  capturedAt: "2026-10-13T16:00:00Z",
  source,
  version: "1.4.4",
  target: "win32-x64",
  binary: { sha256: "b".repeat(64), bytes: 1024 },
  nativeVideo: { available: true, methods: ["metadata", "frame", "resize", "png", "write"] },
  nativeImage: { available: true, methods: ["resize", "png", "write"] },
  gates: [{ sha256: "c".repeat(64), passed: 1, failed: 0, assertions: 5 }],
});
const fixture = `<!doctype html><html lang="en"><head><title>Upstream</title><script src="https://analytics.invalid/script.js"></script><link rel="preconnect" href="https://analytics.invalid"></head><body><header class="site-header"><a href="/" aria-label="Bun — home">Bun</a><nav aria-label="Primary"><a href="/blog">News</a></nav><button aria-label="Search">Search</button><button aria-label="Open menu">Open menu</button></header><main><section class="register"><div class="grid upstream-layout-sentinel"><div><h1>Original</h1></div><div><p>performance-sentinel</p></div></div><div>endorsement-sentinel</div></section><section aria-labelledby="toolkit-heading"><h2 id="toolkit-heading">Tools</h2><a href="/run">Run</a><a href="/test">Test</a><a href="/install">Install</a><a href="/build">Build</a></section><section><h2>Anthropic</h2><p>unqualified-sentinel</p></section></main><footer onmouseover="untrusted-handler()">Upstream footer</footer></body></html>`;
const adapt = (facts: RuntimeHomeFact[]) =>
  adaptUpstreamHome(fixture, {
    source,
    origin: "https://aphrody.app",
    facts,
    cssPath: "/owned.css",
    scriptPath: "/owned.js",
    bootstrapPath: "/scheme.js",
  });

test("captured structure becomes native video content and drops upstream claims and executable code", () => {
  const html = adapt([receipt()]);
  expect(html).toContain("upstream-layout-sentinel");
  expect(html).toContain("Bun.Video.<br>One fluent");
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).toContain('name="color-scheme" content="light dark"');
  expect(html).toContain('id="content" tabindex="-1"');
  expect(html).toContain('label for="home-question"');
  expect(html).toContain('role="status" aria-atomic="true"');
  expect(html).toContain('select id="home-theme"');
  expect(html).toContain('option value="system"');
  expect(html).toContain('details class="home-mobile"');
  expect(html).toContain("Native surfaces measured");
  for (const removed of [
    "performance-sentinel",
    "endorsement-sentinel",
    "unqualified-sentinel",
    "Anthropic",
    "analytics.invalid",
    "untrusted-handler",
    "cdn.aphrody.com",
    "/mirror-assets/symbols/",
  ])
    expect(html).not.toContain(removed);
  const absent = receipt();
  absent.nativeVideo.available = false;
  expect(adapt([absent])).toContain("Native qualification pending");
  expect(adapt([])).toContain("Runtime measurements are pending");
  expect(html).not.toContain("all eight targets");
});

test("public capability facts discard local paths and provider configuration and reject malformed evidence", () => {
  const value = {
    ...receipt(),
    providerKey: "fixture-secret",
    privateVector: "protected-do-not-copy",
    binary: { ...receipt().binary, path: "protected-do-not-copy" },
  };
  const clean = publicRuntimeHomeFact(value);
  expect(JSON.stringify(clean)).not.toContain("fixture-secret");
  expect(JSON.stringify(clean)).not.toContain("protected-do-not-copy");
  expect(clean.nativeVideo.methods).toContain("metadata");
  expect(() => publicRuntimeHomeFact({ ...receipt(), source: "main" })).toThrow("capability receipt");
  expect(() =>
    publicRuntimeHomeFact({ ...receipt(), gates: [{ sha256: "mutable", passed: 1, failed: 0, assertions: 5 }] }),
  ).toThrow("capability gate");
  expect(() =>
    publicRuntimeHomeFact({ ...receipt(), nativeVideo: { available: true, methods: ["<script>"] } }),
  ).toThrow("native surface");
});

test("factory behavior passes remain separate from failed release ABI and unreported assertions", () => {
  const measured = {
    schema: 1,
    kind: "bun-runtime-capabilities",
    measuredAt: receipt().capturedAt,
    source: { commit: source, codeMatchesCommit: true, checkout: "protected-do-not-copy" },
    runtime: {
      revision: source,
      version: "1.4.4",
      platform: "linux",
      arch: "x64",
      executable: { ...receipt().binary, path: "protected-do-not-copy" },
      libc: { kind: "glibc", minimumDirectRequirement: "2.43" },
    },
    apis: { video: receipt().nativeVideo, image: receipt().nativeImage },
    gates: {
      native: true,
      passed: true,
      tests: { native: true, passed: true, passCount: 161, failCount: 0 },
      binaryRelease: { passed: false },
      receipts: [{ name: "native-tests.log", sha256: "d".repeat(64) }],
    },
  };
  const clean = normalizeRuntimeHomeFact(measured);
  expect(clean.target).toBe("linux-x64");
  expect(clean.gates[0]).toEqual({ sha256: "d".repeat(64), passed: 161, failed: 0 });
  expect(clean.distribution).toEqual({ status: "failed", minimumGLIBC: "2.43" });
  expect(JSON.stringify(clean)).not.toContain("protected-do-not-copy");
  expect(adapt([clean])).toContain("Release gate fails");
  expect(() =>
    normalizeRuntimeHomeFact({ ...measured, source: { ...measured.source, codeMatchesCommit: false } }),
  ).toThrow("factory capability");
  expect(() => normalizeRuntimeHomeFact({ ...measured, gates: { ...measured.gates, receipts: [] } })).toThrow(
    "bound receipt",
  );
});

test("browser controls and theme startup bundle without importing backend credentials or upstream hydration", async () => {
  using directory = tempDir("home-browser-controls", {
    "controls.js": HOME_THEME_SCRIPT + HOME_SEARCH_SCRIPT,
    "scheme.js": HOME_THEME_BOOTSTRAP,
  });
  const result = await Bun.build({
    entrypoints: [String(directory) + "/controls.js", String(directory) + "/scheme.js"],
    target: "browser",
    minify: true,
  });
  expect(result.success).toBe(true);
  expect(result.logs).toEqual([]);
  expect(result.outputs).toHaveLength(2);
  const text = await result.outputs[0]!.text();
  expect(text).toContain("/api/site/rag");
  expect(text).not.toContain("TYPESAFE_API_KEY");
  expect(text).not.toContain("process.env");
  expect(text).not.toContain("MutationObserver");
});

const captureRoot = fileURLToPath(new URL("../../../build/media/site-upstream-bun/", import.meta.url));
test.skipIf(
  !(await Bun.file(new URL("../../../build/media/site-upstream-bun/manifest.json", import.meta.url)).exists()),
)("real captured Bun homepage keeps CSS and fonts byte-identical and produces a source-bound manifest", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const facts = await loadRuntimeHomeFacts([
    fileURLToPath(new URL("../../../build/native-sdk-candidates/bun-windows-capabilities.json", import.meta.url)),
  ]);
  const page = await buildUpstreamHome({ captureRoot, sourceRoot: root, source, facts });
  expect(page.html.match(/<h1\b/g)).toHaveLength(1);
  expect(page.html).toContain("Bun.Video.");
  expect(page.provenance.runtime[0]!.source).toBe(facts[0]!.source);
  expect(page.provenance.upstream.captureBlake3Verification).toBe("declared-only");
  for (const input of page.provenance.upstream.inputs.filter(input => /\.(?:css|woff2)$/.test(input.path))) {
    const asset = page.assets.find(asset => "bun.com/" + asset.path === input.path)!;
    expect(asset.sha256).toBe(input.sha256);
    expect(asset.bytes).toEqual(
      await Bun.file(new URL("../../../build/media/site-upstream-bun/" + input.path, import.meta.url)).bytes(),
    );
  }
  expect(page.provenance.documentation.map(document => document.path)).toEqual([
    "docs/runtime/video.mdx",
    "docs/runtime/image.mdx",
  ]);
  expect(page.html).not.toMatch(
    /Anthropic|Upstream Bun news|Benchmarks|Bun in production|fastest install|No runtime switch required/,
  );
  expect(page.assets.some(asset => asset.path.endsWith(".js") && !asset.path.startsWith("_assets/aphrody-home-"))).toBe(
    false,
  );
  const resources: string[] = [];
  new HTMLRewriter()
    .on("script[src],link[rel=stylesheet],link[rel=preload],img[src]", {
      element(element) {
        resources.push(element.getAttribute(element.tagName === "link" ? "href" : "src")!);
      },
    })
    .transform(page.html);
  expect(resources.every(path => page.assets.some(asset => "/" + asset.path === path))).toBe(true);
});

// Opt-in renderer qualification uses an isolated profile and closes only its own process tree.
test.skipIf(!process.env.BUN_HOME_CHROME || process.platform !== "win32")(
  "isolated Chrome qualifies real layout, native keyboard controls, system themes and read-only RAG",
  async () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const git = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe", stderr: "ignore" });
    const source = (await new Response(git.stdout).text()).trim();
    expect(await git.exited).toBe(0);
    expect(source).toMatch(/^[a-f0-9]{40}$/);
    const output = resolve(root, "build/media/site-upstream-home-preview");
    const facts = await loadRuntimeHomeFacts([
      join(root, "build/native-sdk-candidates/bun-windows-capabilities.json"),
      join(root, "factory/artifacts/runtime-release/linux-video-qualification-20261013/runtime-capabilities.json"),
    ]);
    const page = await buildUpstreamHome({ captureRoot, sourceRoot: root, source, facts });
    const resources = new Map(page.assets.map(asset => ["/" + asset.path, asset.bytes]));
    const requests: string[] = [];
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        requests.push(url.pathname);
        if (url.pathname === "/api/site/rag") {
          const query = url.searchParams.get("q");
          if (query === "fixture cancel")
            return new Response(
              new ReadableStream({
                start(controller) {
                  request.signal.addEventListener("abort", () => controller.close(), { once: true });
                },
              }),
              { headers: { "Content-Type": "application/json" } },
            );
          if (query === "fixture cited metadata" || query === "fixture wrong citation")
            return Response.json({
              snapshot: { id: "b".repeat(64), source, repository: "aphrody-labs/bun", profile: "bun" },
              answer: "Fixture: metadata is documented in the cited source [S1]. <script>window.injected=true</script>",
              citations: [
                {
                  id: "S1",
                  path: "docs/runtime/video.mdx",
                  title: "Bun.Video",
                  url:
                    "https://github.com/aphrody-labs/bun/blob/" +
                    (query === "fixture wrong citation" ? "main" : source) +
                    "/docs/runtime/video.mdx",
                  sha256: "c".repeat(64),
                },
              ],
              generation: { status: "extractive" },
              graph: { links: [] },
            });
          return Response.json({ error: "snapshot-unavailable" }, { status: 503 });
        }
        if (url.pathname === "/")
          return new Response(page.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        const bytes = resources.get(url.pathname);
        return bytes
          ? new Response(Uint8Array.from(bytes), {
              headers: {
                "Content-Type": url.pathname.endsWith(".css")
                  ? "text/css"
                  : url.pathname.endsWith(".js")
                    ? "text/javascript"
                    : url.pathname.endsWith(".svg")
                      ? "image/svg+xml"
                      : url.pathname.endsWith(".woff2")
                        ? "font/woff2"
                        : "application/octet-stream",
              },
            })
          : new Response("Not found", { status: 404 });
      },
    });
    using job = new (await import("bun:windows")).default.Job({ killOnClose: true });
    const environment = Object.fromEntries(
      ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"]
        .filter(key => process.env[key])
        .map(key => [key, process.env[key]!]),
    );
    const child = job.spawn(
      [
        process.env.BUN_HOME_CHROME!,
        "--headless=new",
        "--remote-debugging-port=0",
        "--remote-debugging-address=127.0.0.1",
        "--user-data-dir=" + join(output, "browser-profile"),
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-sync",
        "--disable-extensions",
        "--disable-default-apps",
        "--disable-features=OptimizationHints,MediaRouter",
        "about:blank",
      ],
      { env: environment, stdin: "ignore", stdout: "ignore", stderr: "pipe" },
    );
    let socket: WebSocket | undefined;
    const deadline = setTimeout(() => job.terminate(), 40000);
    try {
      const endpoint = await new Promise<string>((complete, reject) => {
        const timer = setTimeout(() => reject(new Error("Isolated Chrome startup timed out")), 10000);
        void child.exited.then(() => {
          clearTimeout(timer);
          reject(new Error("Isolated Chrome exited"));
        });
        void (async () => {
          let tail = "";
          for await (const chunk of child.stderr) {
            tail = (tail + new TextDecoder().decode(chunk)).slice(-8192);
            const match = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/.exec(tail);
            if (match) {
              clearTimeout(timer);
              complete(match[1]!);
            }
          }
        })().catch(reject);
      });
      socket = new WebSocket(endpoint);
      const ws = socket;
      await new Promise<void>((complete, reject) => {
        const timer = setTimeout(() => reject(new Error("CDP connection timed out")), 5000);
        ws.onopen = () => {
          clearTimeout(timer);
          complete();
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error("CDP connection failed"));
        };
      });
      let next = 0;
      const pending = new Map<
        number,
        {
          complete: (value: Record<string, any>) => void;
          reject: (reason: Error) => void;
          timer: ReturnType<typeof setTimeout>;
        }
      >();
      const listeners = new Map<string, Set<(params: Record<string, any>) => void>>();
      const network: string[] = [];
      const errors: string[] = [];
      ws.onmessage = event => {
        const reply = JSON.parse(String(event.data));
        if (reply.id) {
          const entry = pending.get(reply.id);
          if (entry) {
            pending.delete(reply.id);
            clearTimeout(entry.timer);
            if (reply.error) entry.reject(new Error(reply.error.message));
            else entry.complete(reply.result ?? {});
          }
        }
        if (reply.method) for (const listener of listeners.get(reply.method) ?? []) listener(reply.params ?? {});
        if (reply.method === "Network.requestWillBeSent" && network.length < 256)
          network.push(reply.params.request.url);
        if (reply.method === "Runtime.exceptionThrown") errors.push(reply.params.exceptionDetails.text);
      };
      const command = (method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
        new Promise<Record<string, any>>((complete, reject) => {
          const id = ++next;
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error("CDP command timed out: " + method));
          }, 5000);
          pending.set(id, { complete, reject, timer });
          ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
      const once = (method: string) =>
        new Promise<Record<string, any>>((complete, reject) => {
          const handlers = listeners.get(method) ?? new Set();
          listeners.set(method, handlers);
          const timer = setTimeout(() => {
            handlers.delete(listener);
            reject(new Error("CDP event timed out: " + method));
          }, 5000);
          const listener = (params: Record<string, any>) => {
            clearTimeout(timer);
            handlers.delete(listener);
            complete(params);
          };
          handlers.add(listener);
        });
      const created = await command("Target.createTarget", { url: "about:blank" });
      const attached = await command("Target.attachToTarget", { targetId: created.targetId, flatten: true });
      const session = attached.sessionId;
      const send = (method: string, params: Record<string, unknown> = {}) => command(method, params, session);
      const evaluate = async (expression: string) => {
        const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails)
          throw new Error(
            "Browser evaluation failed: " +
              (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text),
          );
        return result.result?.value;
      };
      const key = async (key: string, code = key) => {
        const virtualKey = (
          { Enter: 13, Tab: 9, Home: 36, ArrowDown: 40, Escape: 27, "/": 191 } as Record<string, number>
        )[key];
        await send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key,
          code,
          windowsVirtualKeyCode: virtualKey,
          nativeVirtualKeyCode: virtualKey,
          ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}),
        });
        await send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key,
          code,
          windowsVirtualKeyCode: virtualKey,
          nativeVirtualKeyCode: virtualKey,
        });
      };
      await send("Page.enable");
      await send("Runtime.enable");
      await send("Network.enable");
      const observations: Record<string, unknown>[] = [];
      for (const viewport of [
        { width: 1280, height: 900, mobile: false },
        { width: 390, height: 844, mobile: true },
      ]) {
        await send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1 });
        await send("Emulation.setEmulatedMedia", {
          features: [
            { name: "prefers-color-scheme", value: "light" },
            { name: "prefers-reduced-motion", value: "reduce" },
          ],
        });
        const loaded = once("Page.loadEventFired");
        await send("Page.navigate", { url: server.url.href });
        await loaded;
        await evaluate(
          `localStorage.removeItem('bun-home-theme');const theme=document.getElementById('home-theme');theme.value='system';theme.dispatchEvent(new Event('change'));document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(resolve)))`,
        );
        const geometry = await evaluate(
          `(()=>{const root=document.documentElement,h=document.querySelector('h1'),box=h.getBoundingClientRect();return {width:innerWidth,scrollWidth:root.scrollWidth,canvas:getComputedStyle(root).getPropertyValue('--c-canvas').trim(),fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family),heading:{width:box.width,height:box.height,font:getComputedStyle(h).fontFamily},h1:document.querySelectorAll('h1').length}})()`,
        );
        expect(geometry.scrollWidth).toBeLessThanOrEqual(viewport.width);
        expect(geometry.canvas).toBe("255 255 255");
        expect(geometry.h1).toBe(1);
        expect(geometry.heading.width).toBeGreaterThan(100);
        expect(geometry.fonts.some((font: string) => font.includes("Archivo"))).toBe(true);
        await key("/");
        expect(await evaluate(`document.activeElement.id`)).toBe("home-question");
        await key("Tab");
        expect(await evaluate(`document.activeElement.type`)).toBe("submit");
        if (viewport.mobile) {
          await evaluate(`document.querySelector('.home-mobile summary').focus()`);
          await key("Enter");
          expect(await evaluate(`document.querySelector('.home-mobile').open`)).toBe(true);
          await key("Enter");
        }
        for (const dark of [false, true]) {
          await send("Emulation.setEmulatedMedia", {
            features: [
              { name: "prefers-color-scheme", value: dark ? "dark" : "light" },
              { name: "prefers-reduced-motion", value: "reduce" },
            ],
          });
          await evaluate(`new Promise(resolve=>requestAnimationFrame(resolve))`);
          expect(
            await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--c-canvas').trim()`),
          ).toBe(dark ? "13 10 12" : "255 255 255");
          await evaluate(`scrollTo(0,0);document.activeElement.blur()`);
          const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
          await Bun.write(
            join(output, (viewport.mobile ? "mobile" : "desktop") + (dark ? "-dark" : "-light") + ".png"),
            Buffer.from(screenshot.data, "base64"),
          );
        }
        await evaluate(`document.getElementById('home-theme').focus()`);
        await key("Home");
        await key("ArrowDown");
        await key("Tab");
        expect(await evaluate(`document.getElementById('home-theme').value`)).toBe("light");
        expect(await evaluate(`document.documentElement.dataset.homeTheme`)).toBe("light");
        expect(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--c-canvas').trim()`)).toBe(
          "255 255 255",
        );
        // A DOM mutation event settles async UI work; no timing sleeps or polling.
        const submit = async (query: string) => {
          await evaluate(
            `(()=>{window.homeSearchSettled=new Promise(resolve=>{const status=document.getElementById('home-search-status');const observer=new MutationObserver(()=>{if(status.textContent){observer.disconnect();resolve(status.textContent)}});observer.observe(status,{childList:true,subtree:true,characterData:true})});document.getElementById('home-question').value=${JSON.stringify(query)};document.getElementById('home-question').focus();return true})()`,
          );
          await key("Enter");
          return evaluate("window.homeSearchSettled");
        };
        expect(await submit("fixture unavailable")).toContain("snapshot is unavailable");
        expect(await evaluate(`document.getElementById('home-answer').hidden`)).toBe(true);
        expect(await evaluate(`document.getElementById('home-rag-form').hasAttribute('aria-busy')`)).toBe(false);
        expect(await submit("fixture cited metadata")).toBe("1 cited sources.");
        expect(await evaluate(`document.getElementById('home-answer-mode').textContent`)).toContain("Source excerpts");
        expect(await evaluate(`document.querySelector('#home-answer-citations a').href`)).toContain(
          "/blob/" + source + "/",
        );
        expect(await evaluate(`window.injected===undefined`)).toBe(true);
        expect(await submit("fixture wrong citation")).toContain("Search unavailable");
        expect(await evaluate(`document.getElementById('home-answer').hidden`)).toBe(true);
        const requested = once("Network.requestWillBeSent");
        const cancelled = submit("fixture cancel");
        await requested;
        await key("Escape");
        expect(await cancelled).toContain("Search cancelled");
        expect(await evaluate(`document.getElementById('home-rag-form').hasAttribute('aria-busy')`)).toBe(false);
        observations.push({
          viewport,
          geometry,
          keyboard: "slash, tab, enter, select, mobile details, escape cancellation",
          rag: "503, extractive fixture, safe text citations, mutable citation rejected, pending request cancelled",
        });
      }
      expect(errors).toEqual([]);
      expect(network.every(url => new URL(url).origin === server.url.origin)).toBe(true);
      expect(requests.filter(path => path === "/api/site/rag")).toHaveLength(8);
      await Bun.write(
        join(output, "browser-qualification.json"),
        JSON.stringify(
          {
            schema: 1,
            measuredAt: new Date().toISOString(),
            source,
            preview: server.url.origin,
            browser: "isolated installed Chrome headless",
            observations,
            networkOrigins: [...new Set(network.map(url => new URL(url).origin))],
            upstream: page.provenance.upstream,
            runtime: page.provenance.runtime,
            scope:
              "UI and local read-only response fixtures; production RAG and platform distribution are separate gates",
          },
          null,
          2,
        ),
      );
      await command("Target.closeTarget", { targetId: created.targetId });
    } finally {
      clearTimeout(deadline);
      socket?.close();
      job.terminate();
      await child.exited;
      server.stop(true);
    }
  },
  45000,
);
