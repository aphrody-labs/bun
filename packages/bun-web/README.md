# @aphrody/bun-web

Browser SDK of the Bun fork. It is a library, not an additional executable or published product: the browser
runtime stays `Bun.WebView` (Chrome over CDP) and the Rust engine in `src/browser/crates`. Importing a module never
launches a browser, process, worker or network request.

| Module                                           | Role                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./cdp`                                          | `BrowserPage`: one `Bun.WebView` tab on a CDP endpoint. `goto` settles on the load event (`waitUntil` `load` and `networkidle`), on `Page.domContentEventFired` (`domcontentloaded`) or at commit (`commit`). |
| `./locator`, `./selectors`                       | Semantic locators (`getByRole`, `getByLabel`, `getByTestId`, ...) imported from the former web client.                                                                                                        |
| `./client`                                       | `AgentBrowser` / `AgentPage`: the agent-browser command surface (snapshot refs, click, fill, wait, screenshot, PDF) over CDP.                                                                                 |
| `./cli`                                          | `yolo browser <command>`: one command, one JSON line.                                                                                                                                                         |
| `./engine`, `./config`                           | Lifecycle of the local `aphrody-web` engine (`launch`) from `tools/config/web.json`.                                                                                                                          |
| `./service`, `./runtime`                         | Web service client (fetch, scrape, crawl) and its shared runtime.                                                                                                                                             |
| `./tauri`                                        | Tauri bridge.                                                                                                                                                                                                 |
| `./testing`, `./testing/next`, `./testing/sites` | Playwright-compatible test runner over the same pages.                                                                                                                                                        |

```ts
import { BrowserPage, WebLocator, getByTestId } from "@aphrody/bun-web";

const page = await BrowserPage.connect("ws://127.0.0.1:9222/devtools/browser");
try {
  await page.goto("https://example.com/");
  console.log(await page.title());
  await new WebLocator(page, getByTestId("submit")).click();
} finally {
  await page.close();
}
```

The endpoint is the caller's existing provider: the Obscura-based `aphrody-web launch` engine, or any Chrome started
with `--remote-debugging-port`. A missing endpoint throws. Remote documents get no access to Bun APIs or host
credentials. CDP calls are serialized because a `Bun.WebView` accepts one request in flight per view.

## Tests

`bun test test/` (the preload in `bunfig.toml` starts one `aphrody-web` engine for the run). The engine binary is
resolved without following symlinks: the installed `aphrody-web` is a link to the multi-call `aphrody` binary, which
dispatches on its invocation name. `test/goto-load.test.ts` also starts the system Chrome when one is installed
(`BUN_CHROME_PATH`, `google-chrome-stable` or `chromium`; `--no-sandbox` is passed).

## Qualification boundary

The imported role and label selectors are heuristics, not the browser's accessibility tree, and the visibility check
inspects attributes rather than layout. Keep those limits in the parity suite. Provenance is recorded in
[`../../src/browser/BROWSER-MIGRATION.json`](../../src/browser/BROWSER-MIGRATION.json) and the
[migration matrix](../../src/browser/docs/browser-migration.md); `bun src/browser/scripts/verify-migration.ts`
checks the hashes (`--update` rewrites the integrated hashes after an intentional edit). No binary-size or speed
claim is made by this import.
