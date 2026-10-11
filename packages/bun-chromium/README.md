# Bun Chromium SDK

`@aphrody/bun-chromium` reexports `bun:chromium`; its `chrome` export references
the same owner through `bun:chrome`. Requires Aphrody Bun with both builtins.
Source version 1.4.4 does not prove npm or native executable release availability.

## Complete export catalog

| Export                 | Contract                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| default, chrome        | Same native owner object                                                 |
| ChromiumConnection     | CDP send, events, GPU probe and close                                    |
| connect                | Explicit HTTP(S)/WebSocket debugging endpoint                            |
| launch                 | Selected/discovered executable, dedicated profile and CDP                |
| findExecutable         | Installed Chrome-compatible executable discovery                         |
| manifests              | Validate/create extension, theme and PWA manifests; no installation      |
| profiles.readBookmarks | Explicit Bookmarks JSON file                                             |
| protocol.validateURL   | HTTP(S) navigation or about:blank validation                             |
| Type exports           | ConnectOptions, LaunchOptions, ChromiumBrowser, Bookmark and owner types |

```ts
import chromium, { chrome, connect } from "@aphrody/bun-chromium";
console.assert(chromium === chrome);
const connection = await connect("http://127.0.0.1:9222");
try {
  await connection.send("Browser.getVersion");
} finally {
  connection.close();
}
```

Launch options: executable, userDataDir, headless, webgpu, url, extensions,
timeout and signal. Result: connection, process, userDataDir and async close.
The installed browser remains its engine owner. Do not implicitly reuse personal
browser state. Discovery is not a browser source-build receipt.

## Commands and source owners

```sh
bun src/cli.ts status
bun src/cli.ts validate-url https://example.com
bun src/cli.ts validate-extension '{"manifest_version":3,"name":"Example","version":"1.0.0"}'
bun src/cli.ts bookmarks /explicit/profile/Bookmarks
```

The npm binary is `bun-chromium`; `./cli` exports `runChromiumCommand`.
Commands inspect configuration or validate explicit input. They do not build
browsers, install extensions or authenticate profiles. Root `bun chromium`,
GN/depot_tools and `bun obscura` CDP retain their existing CLI owners and help.

`src/index.ts` only reexports builtins; `src/cli.ts` routes owner helpers.
`test/sdk.test.ts` checks identity and routing. Actual implementation and types
remain in root `src/js/bun/chromium.ts` and `packages/bun-types/chromium.d.ts`.

Run strict TypeScript, oxlint, oxfmt and `bun bd -j1 test ./packages/bun-chromium/test/sdk.test.ts`
from the root. Tests launch no browser and access no live CDP or personal profile.
SDK, runtime and engine artifacts qualify separately; see
[publication boundary](../../docs/project/google-browser-publication.md).
No JSC/V8, rendering, stealth or TLS parity is implied.

Release graph catalogs tracked hashes, symbols and references with explicit
unsupported inputs, unresolved calls and truncation. It is not complete dynamic
CDP coverage. [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md),
[GEMINI.md](GEMINI.md), [llms.txt](llms.txt) are dedicated agent entrypoints.
