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
  test("browser permissions wait for a user gesture and make no automatic host requests", async () => {
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
