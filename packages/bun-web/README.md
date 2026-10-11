# Internal Bun browser SDK

These are library modules of Bun, not an additional executable, MCP server,
FFI provider or published product. They reuse the fork's existing `Bun.WebView`
CDP backend and preserve the imported semantic locator implementation. Import
does not launch a browser, process, worker or network request.

```ts
import { BrowserPage, WebLocator, getByTestId } from "./src/index.ts";

const page = await BrowserPage.connect("ws://127.0.0.1:9222/devtools/browser");
try {
  await page.goto("https://example.com/");
  const title = await page.title();
  const locator = new WebLocator(page, getByTestId("submit"));
  await locator.click();
} finally {
  await page.close();
}
```

The endpoint is the caller's existing Bun browser provider; the SDK never
spawns a legacy engine CLI to supply it. A missing endpoint throws an error.
It does not grant remote documents access to Bun APIs or host credentials.
Transport calls are serialized because a Bun.WebView accepts one CDP request
in flight per view. Navigation preserves the observed response status, and
remote evaluation exceptions reject the caller's promise.

## Qualification boundary

Transferred source is not a qualified replacement for the former service
client. Fetch profiles, static extraction, persistent crawling, media, frames,
X/Grok integration and runtime lifecycle are owned by separate lazy modules.
Their consumers stay on the qualified existing provider until Bun parity gates
pass on the VPS. No binary-size or speed reduction is claimed by this import.

The imported role and label selectors are heuristics, not the browser's full
accessibility tree. Imported visibility checks inspect attributes; they do not
prove layout-backed actionability. Keep these limitations in the parity suite.

Provenance and inventory are recorded in
[`../../src/browser/BROWSER-MIGRATION.json`](../../src/browser/BROWSER-MIGRATION.json)
and the [migration matrix](../../src/browser/docs/browser-migration.md).
