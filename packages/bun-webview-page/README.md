# @aphrody/bun-webview-page

Playwright-shaped `Browser`, `Page`, `Locator`, routing and events over [`Bun.WebView`](https://bun.com/docs/runtime/webview) with the Chrome backend (CDP). No Playwright install, no Node: one Bun process drives one Chrome.

```ts
import { chromium } from "@aphrody/bun-webview-page";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:3000/");
await page.getByRole("button", { name: "Send" }).click();
await page.screenshot({ path: "shot.png" });
await browser.close();
```

It covers the subset used by capture and contract scripts; anything beyond it is not implemented rather than approximated. Differences from Playwright: locators act on the first match (no strict-mode error), accessible names follow a simplified computation, and screenshots are viewport-only.

Tests: `bun test` (unit tests run against happy-dom). The real-browser suite runs only when `BUN_CHROME_PATH` points at a Chrome-family executable.
