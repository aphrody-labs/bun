# @aphrody/bun-runtime-sdk

## Browser HLS lifecycle

The pure `@aphrody/bun-runtime-sdk/video/hls` export does not load a native library or bundle a
decoder. Supply a qualified HLS constructor and an explicit same-origin worker path:

```ts
import { attachHlsPlayback } from "@aphrody/bun-runtime-sdk/video/hls";

const playback = attachHlsPlayback(video, Hls, {
  src: "https://media.example/master.m3u8",
  config: { workerPath: "/assets/vendor/hls/hls.worker.js" },
  beforeStart(instance) {
    instance.on(Hls.Events.ERROR, handlePlaybackError);
  },
});
// Release this owned HLS instance when the source or component changes.
playback.destroy();
```

Register listeners synchronously in `beforeStart`, before `attachMedia` or `loadSource` can emit
events. Cleanup is idempotent, and startup failures destroy the owned instance without pausing
or resetting unrelated media. This helper does not call `play`, implement native fallback or
promise playback: the caller owns browser capability detection, recovery and media controls.
Sources use HTTP(S) without embedded URL credentials. Workers must share the document origin;
`ownerDocument.URL` supplies the page origin, independently of a document's `<base>` element;
`pageUrl` supplies it when no document URL is available. The worker path is normalized to an
absolute URL so a foreign `<base>` cannot redirect its resolution. Set `enableWorker:
false` explicitly for a worker-free configuration. Worker validation does not prove worker
execution or successful media decoding.

SDK of the YOLO native runtime. One library, `yolo_runtime` (`crates/yolo-runtime`, C ABI in
`include/yolo_runtime.h`, contract in `docs/RUNTIME-ABI.md`), with three bindings:

| Consumer     | Binding                                                                          | Test                                   |
| ------------ | -------------------------------------------------------------------------------- | -------------------------------------- |
| Bun          | `src/` through `bun:ffi`                                                         | `bun test test`                        |
| .NET 10      | `dotnet/YoloRuntime` (`LibraryImport`, AOT-compatible)                           | `dotnet test dotnet/YoloRuntime.slnx`  |
| Python       | `python/ctypes` (verified artifact), `python/pyo3` (`crates/yolo-pyo3`, maturin) | `bun run stage && bun run test:python` |
| C, C++, Rust | `include/yolo_runtime.h`, `crates/yolo-core`                                     | `cargo test`                           |

```sh
cargo build --profile runtime -p yolo-runtime   # target/runtime/yolo_runtime.{dll,so,dylib}, panic=unwind
bun scripts/stage.ts                            # target/artifact/<triple>/current with manifest.json
```

Supervised children run in their own process group on Unix and in a Job Object on Windows, so
`stop` and runtime destruction take every descendant down.

```ts
import { Runtime } from "@aphrody/bun-runtime-sdk";

using runtime = Runtime.load(); // verified artifact, ABI negotiated first
using child = runtime.spawn({
  program: "server",
  args: ["--port", "8080"],
  stdio: "capture",
});
await child.waitForHttp({ port: 8080, path: "/health" });
await child.stopAsync(2000);
```

Library resolution: `$YOLO_RUNTIME_LIB`, then the installed artifact
(`$YOLO_RUNTIME_HOME/<target>/current`, default `~/.yolo/runtime`), then `target/runtime/` of this package.
The .NET binding uses `$YOLO_RUNTIME_LIB`, then the application directory, then the nearest `target/runtime/` above it.

For one-shot binary output, ABI 1.4 provides lossless capture with an explicit
budget. Overflow rejects with `RuntimeError` / `Status.OutputLimit`; no successful
response is truncated. The existing `capture` mode remains a 64 KiB diagnostic tail.

```ts
using runtime = Runtime.load();
using child = runtime.spawn({
  program: "converter",
  args: ["input"],
  stdio: "capture-lossless",
  maxOutputBytes: 8 * 1024 * 1024, // per stream, total across all drains
});
const { stdout, stderr, status } = await child.collectOutput({
  timeoutMs: 30_000,
});
// stdout/stderr are owned Uint8Arrays; arbitrary bytes survive without UTF-8 decoding.
```

`collectOutput` stops the child on timeout, abort or capture error, and drains
terminal output after joined-reader shutdown. The caller releases the handle.
Native capture workers are joined before process release/runtime destroy returns.
After runtime close, SDK handles reject further native calls and can be disposed
without entering unloaded code. Unix shutdown covers the owned process group;
Windows process-tree shutdown and runtime behavior on other targets still need
execution qualification.

Optional clients load without activating either engine. Desktop opens a separately
installed `yolo-desktop` CEF host through the shared process supervisor.
Import `@aphrody/bun-runtime-sdk/desktop` and call `desktop.open` with explicit
`grants` and exact `allowedOrigins`; dispose the session to close its windows and
join its host. Verified desktop installation helpers are exported from
`@aphrody/bun-runtime-sdk/desktop-artifact`.

Import `@aphrody/bun-runtime-sdk/browser` and call `BrowserRuntime.load` to use the
optional native browser provider. Core ABI and `browser.*` capabilities are
negotiated before any extension symbol is bound. Each context requires exact
HTTP(S) `allowedOrigins`; private-network access needs an explicit context opt-in.
Contexts own isolated in-memory cookies and JavaScript realms. Navigation,
extraction, evaluation and PNG capture accept cancellation; disposing their owner
joins the native workers before library unload.

These SDK APIs do not establish native rendering or distribution qualification.
An ABI 1.4 core artifact lacks browser capabilities, and desktop requires its own
verified native executable (it ships its CEF payload) plus the platform GTK 4 prerequisites on Linux. Native provider
and target support remain subject to their actual build and execution gates.
