// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { hasChrome, waitFor } from "../e2e/harness";
import { FLUENT_ELEMENTS } from "../src/os/fluent-elements";

const entry = join(import.meta.dir, "fixtures", "fluent-page.ts");

async function bundle(): Promise<string> {
  const result = await Bun.build({ entrypoints: [entry], target: "browser", format: "esm", minify: true });
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
  test("Fluent controls upgrade with a shadow root and themed tokens", async () => {
    const js = await bundle();
    using server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      routes: {
        "/": new Response(`<!doctype html><html><body><script type="module" src="/fluent.js"></script></body></html>`, {
          headers: { "Content-Type": "text/html" },
        }),
        "/fluent.js": new Response(js, { headers: { "Content-Type": "text/javascript" } }),
      },
    });
    const view = new Bun.WebView({ backend: { type: "chrome", url: false }, width: 800, height: 600 });
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
      expect(state).toEqual({ upgraded: [true, true, true, true, true], brand: "#0f6cbd", checked: true });
    } finally {
      view.close();
    }
  }, 60_000);
});
