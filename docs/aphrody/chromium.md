# Chromium bridge

`bun:chromium` connects Bun to an independently running Chrome or Chromium browser through the Chrome DevTools Protocol (CDP). Browser pages execute in Chrome's engine; the Bun process executes in JavaScriptCore. The module also provides manifest builders and an explicit bookmark JSON importer.

## Chromium and Obscura modes

The target has two modes: native Obscura/JSC for serverless browser execution, and full Chromium/V8 with WebGPU enabled by default. `bun:chromium` currently controls an installed Chromium browser. `bun:obscura` launches the independently installed native `aphrody-web` browser service and reuses the loopback CDP connection client. Both expose named and default exports for `launch`, `connect` and `findExecutable`.

```ts
import { launch } from "bun:obscura";

const browser = await launch({ workers: 1 });
try {
  const { targetId } = await browser.connection.send<{ targetId: string }>("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await browser.connection.send<{ sessionId: string }>(
    "Target.attachToTarget",
    {
      targetId,
      flatten: true,
    },
  );
  console.log(
    await browser.connection.send(
      "Runtime.evaluate",
      {
        expression: "6 * 7",
        returnByValue: true,
      },
      sessionId,
    ),
  );
} finally {
  await browser.close();
}
```

Obscura's `launch({ executable?, timeout?, signal?, workers? })` selects a dynamically assigned loopback port, accepts one to 64 workers (one worker on Windows until process-tree shutdown is qualified) and returns `{ endpoint, connection, process, close }`. It does not enable unsafe file access. `await close()` terminates the owned process. `findExecutable()` returns an installed `aphrody-web` path or `null`.

The existing independently installed Obscura backend uses `deno_core` and V8. The `obscura` branch checkpoint `c82e6a6e3bd` contains the standalone `packages/bun-obscura` workspace. A concurrent native browser/JSC migration under `src/browser` and JSC bindings is uncommitted in the Obscura worktree; it remains owned by that workstream and is not copied into this bridge batch. Completing and qualifying that port is required before the Obscura/JSC mode can be reported as delivered.

Obscura's CDP `Browser.getVersion` response contains compatibility metadata, so a Chrome-shaped product string does not establish that the engine is Chromium. Obscura's CDP subset, rendering and GPU support require separate qualification; Chromium's GPU results cannot establish Obscura GPU support or a performance advantage. The two modes retain their own engine and sandbox contracts.

```ts
import { connect, manifests, profiles } from "bun:chromium";

const browser = await connect("ws://127.0.0.1:9222/devtools/browser/<id>");
try {
  const version = await browser.send("Browser.getVersion");
  console.log(version);
} finally {
  browser.close();
}

const extension = manifests.createExtension({ name: "Bun bridge" });
const theme = manifests.createTheme({
  name: "Bun theme",
  theme: { colors: { frame: [32, 48, 64] } },
});
const app = manifests.createPWA({
  name: "Bun app",
  start_url: "https://example.com/app",
});
```

## Browser connection

`connect(endpoint, { timeout?, signal? })` accepts a loopback WebSocket endpoint. `send(method, params?, sessionId?)` correlates concurrent command responses, surfaces protocol errors, and rejects pending commands when the connection closes or is aborted. The default command timeout is ten seconds. `on(method, callback)` subscribes to protocol events and returns an unsubscribe function. Close the connection when finished.

`findExecutable()` returns a discovered browser executable path or `null`. It does not install a browser or start a process. `launch({ executable?, userDataDir?, headless?, webgpu?, url?, extensions?, timeout?, signal? })` starts an installed browser with a dynamically assigned loopback debugging port and returns `{ connection, process, userDataDir, close }`. The default is a visible browser (`headless: false`); pass `headless: true` for automation. Without `userDataDir`, it creates a temporary isolated profile and removes that profile after `await browser.close()` terminates the process. An explicitly supplied profile path must be absolute and is retained on close; select a dedicated automation directory. Cancellation stops the owned process and cleans up its temporary profile. Extension directories must be absolute and contain a valid MV3 manifest.

The existing `Bun.WebView` Chrome backend also provides browser launching, page navigation, screenshots and tab-scoped CDP access. The `bun:chromium` launcher uses a browser-level connection so callers can create targets and attach flattened CDP sessions explicitly.

`launch` enables Chromium's `WebGPUService` by default; pass `webgpu: false` to disable it. `connection.gpu(sessionId)` probes WebGPU support and adapter availability in an attached target. WebGPU requires a secure context, such as HTTPS or a trustworthy local loopback page, and an adapter accepted by the browser's installed drivers and GPU blocklist. See [Chrome WebGPU troubleshooting](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips). The launcher does not bypass those checks with unsafe flags. GPU availability and successful shader execution require qualification on the actual host.

The [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) is version-dependent. A raw command transport does not guarantee that a particular browser implements every domain or method. Query `Browser.getVersion` and validate the operations required by your application against the selected browser.

Use an isolated user data directory when launching a browser for debugging. Starting with Chrome 136, remote debugging switches require a non-default data directory; Chrome for Testing has separate automation behavior. See [Chrome remote debugging changes](https://developer.chrome.com/blog/remote-debugging-port).

## Extensions, themes and PWAs

The extension and theme builders default to Manifest V3 and version `1.0.0`. Their validators check manifest structure and resource paths; creating a manifest does not create referenced resources, install an extension, package a CRX, grant permissions or publish to the Chrome Web Store. Create every referenced icon and script before loading the extension.

Chrome supplies `chrome.*` APIs inside permitted extension contexts. The Bun process communicates with those contexts through browser protocols or a separately installed native messaging host; it does not emulate the full extension API. [Native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) requires the extension's `nativeMessaging` permission and an installed host manifest with explicit allowed extension origins. Messages are UTF-8 JSON with a native-endian 32-bit byte-length prefix; host replies are limited to 1 MiB and requests to the host to 64 MiB. Host logs belong on stderr.

The experimental [Extensions CDP domain](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Extensions.pdl) includes unpacked extension loading and extension storage operations. Availability depends on browser version and configuration. Operations requiring Chrome user gestures or permission prompts retain those requirements.

[Chrome themes](https://developer.chrome.com/docs/extensions/develop/ui/themes) use a manifest's `theme` object and contain no JavaScript or HTML. Theme images must be PNG resources. Editing the manifest alone does not change an installed browser theme.

PWA manifests require an absolute HTTP or HTTPS `start_url` in this API. Generating a manifest does not provide a service worker, application assets or installation. The experimental [PWA CDP domain](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/PWA.pdl) exposes installation and launching where the browser supports it. Installation must be qualified with a real browser and the target operating system.

## Profile data and engine boundaries

Reuse the existing native owners: `bun:windows.gpu.d3d12` provides adapter information, render-target clearing and GPU buffer copies with readback; `packages/bun-cosmic` provides tiny-skia software rendering and an optional `gpu` feature using wgpu. These are existing native paths, not new dependencies or a second GPU implementation. Chromium's WebGPU remains browser-owned.

The existing `packages/bun-tauri/crates/aphrody-tauri-runtime-cef` owns CEF browser rendering, CDP and cookie facilities. Obscura owns its existing network CookieJar. Reuse those backend facilities for future cookie integration while preserving each profile's protected store; a new bookmark reader does not replace a cookie manager or authorize profile replication.

`profiles.readBookmarks(absoluteFile)` reads a caller-selected Chrome-format bookmark JSON file and returns flattened records with `id`, `name`, `url` and folder ancestry. It does not discover or synchronize a live profile. Cookies, passwords, authentication tokens, encrypted profile databases and Chrome Sync credentials stay in their existing protected stores. Chrome's [extension storage sync](https://developer.chrome.com/docs/extensions/reference/api/storage) synchronizes extension settings through Chrome under its own quotas and account state; it is not a general profile replication API.

Bun's debugger uses the WebKit Inspector Protocol. Chrome uses CDP. Browser CDP connectivity does not establish Chrome DevTools compatibility for debugging Bun's JavaScriptCore execution, V8 embedding parity, or WebKit/Blink rendering parity. These require separate protocol adapters and measured conformance coverage.

A Chromium fork with native Bun runtime integration remains a subsequent deliverable, after the requested browser capabilities are qualified. Full Chromium mode retains V8; the native JSC port belongs to the Obscura mode. The current bridge does not embed Chromium inside Bun. Chromium's [Windows build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md) require a substantial independent source checkout and native toolchain. [V8 embedding](https://v8.dev/docs/embed) uses engine-specific isolates, handles and contexts. Each mode needs evidence for its changed executable, rendering, extensions, debugging, GPU and sandbox behavior; native JSC implementation and engine parity are not established by bridge tests.

## Qualification — 2026-10-11

The Windows factory's changed Bun binary passes 20 browser/codegen tests and five existing D3D12 GPU tests (one non-Windows test skipped). Chromium `154.0.8037.57` runs WGSL compute and reads back `42` on NVIDIA Lovelace with `fallback: false`. Browser tests use headless mode; visible launch is the configured default and has no interactive UI qualification in this batch. Installed Obscura executes `6 * 7` in an attached target and exits on close. The installed older Bun fails to import `bun:chromium`, confirming that the new API requires the changed runtime.

Scoped TypeScript, pinned oxlint, source scope checks, serialized Rust check and crate-only strict Clippy pass. Dependency-wide strict Clippy fails on 68 existing undocumented unsafe blocks in `bun_libuv_sys`. No engine speed or cross-engine parity is inferred from these tests.

Live host inventory finds `aphrody-web` and depot_tools on the VPS, with 52 GiB available; DBFR has neither Chromium nor Obscura on PATH, with 25 GiB available. Neither host has been deployed or qualified with these new built-ins. Source delivery and Windows debug qualification do not establish a production release.
