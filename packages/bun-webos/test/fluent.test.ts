// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { hasChrome, waitFor } from "../e2e/harness";
import { FLUENT_ELEMENTS } from "../src/os/fluent-elements";
import { readPublicSearch } from "../src/os/apps/PublicSearchApp";

const entry = join(import.meta.dir, "fixtures", "fluent-page.ts");

test("public search refuses unverified sources, unsafe links and oversized replies", async () => {
  const page = {
    query: "fixture",
    source: "public-crawl-cache",
    collection: "fixture",
    generatedAt: "2026-10-11T00:00:00Z",
    organic: [{ title: "Fixture", url: "https://example.com/", snippet: "Fixture" }],
  };
  expect(await readPublicSearch(Response.json(page))).toEqual(page);
  await expect(
    readPublicSearch(Response.json({ ...page, source: "private-index" })),
  ).rejects.toThrow("Contrat");
  await expect(
    readPublicSearch(
      Response.json({ ...page, organic: [{ ...page.organic[0], url: "javascript:alert(1)" }] }),
    ),
  ).rejects.toThrow("HTTPS");
  await expect(readPublicSearch(new Response("x".repeat(1024 * 1024 + 1)))).rejects.toThrow(
    "grande",
  );
  await expect(readPublicSearch(new Response("private error", { status: 503 }))).rejects.toThrow(
    "HTTP 503",
  );
});

async function bundle(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "esm",
    minify: true,
  });
  expect(result.logs.map(String)).toEqual([]);
  expect(result.success).toBe(true);
  return result.outputs[0].text();
}

test("Bun.build bundles Fluent UI web components v3 and the Fluent 2 tokens", async () => {
  const js = await bundle();
  for (const tag of FLUENT_ELEMENTS) expect(js).toContain(tag.slice("fluent-".length));
  // webLightTheme from @fluentui/tokens, set as CSS custom properties by setTheme.
  expect(js).toContain("colorBrandBackground");
  expect(js).toContain("#0f6cbd");
});

describe.skipIf(!hasChrome())("headless render in Bun.WebView (Chrome)", () => {
  test.skipIf(!Bun.file(join(import.meta.dir, "../dist/wasm/bun/bun_wasm.wasm")).size)(
    "WASM worker awaits initialization before its first evaluation and keeps files in OPFS",
    async () => {
      const bundled = await Bun.build({
        entrypoints: [join(import.meta.dir, "../src/os/wasm/repl-worker.ts")],
        target: "browser",
        format: "esm",
      });
      expect(bundled.success).toBe(true);
      const isolated = {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      };
      using server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        routes: {
          "/": new Response("<!doctype html><title>WASM qualification</title><body></body>", {
            headers: { ...isolated, "Content-Type": "text/html" },
          }),
          "/worker.js": new Response(await bundled.outputs[0].text(), {
            headers: { ...isolated, "Content-Type": "text/javascript" },
          }),
          "/dist/wasm/bun/bun_wasm.wasm": new Response(
            Bun.file(join(import.meta.dir, "../dist/wasm/bun/bun_wasm.wasm")),
            { headers: { ...isolated, "Content-Type": "application/wasm" } },
          ),
        },
      });
      const view = new Bun.WebView({ backend: { type: "chrome", url: false } });
      try {
        await view.navigate(server.url.href);
        expect(await view.evaluate("crossOriginIsolated")).toBe(true);
        await view.evaluate(`(() => {
          window.wasmReplies = [];
          window.wasmWorker = new Worker('/worker.js', { type: 'module' });
          window.wasmWorker.onmessage = event => {
            window.wasmReplies.push(event.data);
            document.body.dataset.wasmState = event.data.type;
          };
          window.wasmWorker.onerror = event => {
            window.wasmReplies.push({ type: 'failed', error: event.message, event: event.type });
            document.body.dataset.wasmState = 'failed';
          };
          window.wasmWorker.postMessage({ type: 'init' });
          window.wasmWorker.postMessage({ type: 'eval', id: 1, code: ${JSON.stringify("(async () => { await Bun.write('first-evaluation.txt', 'private browser file'); return { order: Bun.semver.order('1.4.4', '1.10.0'), satisfies: Bun.semver.satisfies('1.4.4', '^1.4.0'), markdown: Bun.markdown.html('# Bun WASM'), shell: JSON.stringify(Bun.shellParse('echo bun | wc -c')).includes('echo'), file: await Bun.file('first-evaluation.txt').text() }; })()")} });
        })()`);
        await waitFor(view, "['result', 'failed'].includes(document.body.dataset.wasmState)");
        const replies = await view.evaluate("window.wasmReplies");
        expect(replies.find((reply: any) => reply.type === "failed")).toBeUndefined();
        expect(replies.find((reply: any) => reply.type === "ready")).toMatchObject({
          bunVersion: "1.4.4",
        });
        const result = replies.find((reply: any) => reply.type === "result");
        expect(result.ok).toBe(true);
        expect(JSON.parse(result.text)).toEqual({
          order: -1,
          satisfies: true,
          markdown: "<h1>Bun WASM</h1>\n",
          shell: true,
          file: "private browser file",
        });
      } finally {
        await view.evaluate("window.wasmWorker?.terminate()").catch(() => {});
        view.close();
      }
    },
    60_000,
  );
  test("browser permissions wait for a user gesture and make no automatic host requests", async () => {
    let hostReads = 0;
    const result = await Bun.build({
      entrypoints: [join(import.meta.dir, "fixtures", "browser-access-page.tsx")],
      target: "browser",
      format: "esm",
      minify: true,
    });
    expect(result.success).toBe(true);
    using server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      routes: {
        "/api/webos/capabilities": Response.json({ hostAccess: false }),
        "/api/webos/system": () => {
          hostReads++;
          return Response.json({});
        },
        "/": new Response('<!doctype html><script type="module" src="/permissions.js"></script>', {
          headers: { "Content-Type": "text/html" },
        }),
        "/permissions.js": new Response(await result.outputs[0].text(), {
          headers: { "Content-Type": "text/javascript" },
        }),
        "/api/search": Response.json({
          query: "fixture",
          source: "public-crawl-cache",
          collection: "fixture",
          generatedAt: "2026-10-11T00:00:00Z",
          organic: [
            {
              title: "<img src=x onerror=alert(1)>",
              url: "https://example.com/",
              snippet: "Browser fixture",
            },
          ],
        }),
      },
    });
    const view = new Bun.WebView({
      backend: { type: "chrome", url: false },
      width: 800,
      height: 600,
    });
    try {
      await view.navigate(server.url.href);
      await waitFor(view, 'document.querySelectorAll("[data-browser-capability]").length === 15');
      await waitFor(
        view,
        'document.querySelector("[data-host-status]").textContent.includes("Agent local non connecté")',
      );
      expect(hostReads).toBe(0);
      expect(await view.evaluate("window.fixturePermissionCalls")).toBe(0);
      await view.evaluate('document.querySelector("[data-browser-capability=camera]").click()');
      await waitFor(view, 'document.body.textContent.includes("Cliquez sur la capacité")');
      expect(await view.evaluate("window.fixturePermissionCalls")).toBe(0);
      expect(
        await view.evaluate('document.querySelector("[data-browser-capability=screen]").disabled'),
      ).toBe(true);
      const files = await view.evaluate(`(async () => {
        const fs = window.fixtureBrowserVfs;
        await fs.write('/imports/test.txt', new TextEncoder().encode('browser only'));
        let traversalDenied = false;
        try { await fs.write('/../outside.txt', new Uint8Array([1])); }
        catch { traversalDenied = true; }
        return {
          text: new TextDecoder().decode(await fs.read('/imports/test.txt')),
          size: await fs.size('/imports/test.txt'),
          missing: await fs.exists('/missing.txt'),
          traversalDenied,
        };
      })()`);
      expect(files).toEqual({
        text: "browser only",
        size: 12,
        missing: false,
        traversalDenied: true,
      });
      await view.evaluate(
        'document.querySelector("[aria-label=\\"Recherche publique\\"]").scrollIntoView({ block: "center" })',
      );
      await view.click('[aria-label="Recherche publique"]');
      await view.type("fixture");
      await view.click('button[type="submit"]');
      await waitFor(view, 'document.querySelector("article a") !== null');
      expect(await view.evaluate('document.querySelector("article a").textContent')).toBe(
        "<img src=x onerror=alert(1)>",
      );
      expect(await view.evaluate('document.querySelectorAll("article img").length')).toBe(0);
    } finally {
      view.close();
    }
  }, 60_000);
  test("Fluent controls upgrade with a shadow root and themed tokens", async () => {
    const js = await bundle();
    using server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      routes: {
        "/": new Response(
          `<!doctype html><html><body><script type="module" src="/fluent.js"></script></body></html>`,
          {
            headers: { "Content-Type": "text/html" },
          },
        ),
        "/fluent.js": new Response(js, { headers: { "Content-Type": "text/javascript" } }),
      },
    });
    const view = new Bun.WebView({
      backend: { type: "chrome", url: false },
      width: 800,
      height: 600,
    });
    try {
      await view.navigate(server.url.href);
      await waitFor(view, `document.getElementById("progress") !== null`);
      const state = await view.evaluate(`(() => {
        const ids = ["primary", "dark", "check", "input", "progress"];
        return {
          upgraded: ids.map(id => document.getElementById(id)).map(el => !!el && !!el.shadowRoot && customElements.get(el.localName) !== undefined),
          brand: getComputedStyle(document.documentElement).getPropertyValue("--colorBrandBackground").trim(),
          checked: document.getElementById("dark").checked,
        };
      })()`);
      expect(state).toEqual({
        upgraded: [true, true, true, true, true],
        brand: "#0f6cbd",
        checked: true,
      });
    } finally {
      view.close();
    }
  }, 60_000);
});
