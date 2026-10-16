# @aphrody/bun-runtime-sdk

## Bun-native typed decisions

`@aphrody/bun-runtime-sdk/yolo` reexports the default and named exports of
`bun:yolo`. It requires a Bun runtime that provides that built-in module; it
adds no inference, transport, validation or compatibility fallback. Keep the
import on the server and pass an application-owned provider. Installing this
package does not add the native module to an older runtime.

The package also includes `python/ctypes/bun_yolo.py`, its sibling
`yolo_runtime.py` and the private `yolo_worker.ts`. Running that bridge requires
a separately verified ABI 1.6 runtime artifact and a Bun executable qualified
for `bun:yolo`; package availability alone does not qualify native inference.

## Eight native targets and libc identity

`targetFor(platform, arch, abi)` maps the release matrix without loading a native
module. Linux requires the explicit build ABI; architecture alone never selects
GNU or musl. `hostTarget()` uses the running process instead: Bun's native
`process.report` GNU runtime version, or an architecture-matching musl loader
actually mapped in `/proc/self/maps`. Python uses `os.confstr` for GNU and the
same positive mapped-loader evidence for musl. Missing or contradictory evidence
fails before installed-library selection. Windows Python uses its compiled
`sysconfig` platform, including ARM64, rather than an emulated kernel's machine.

| Release target   | Native Rust target           |
| ---------------- | ---------------------------- |
| Linux x64 GNU    | `x86_64-unknown-linux-gnu`   |
| Linux ARM64 GNU  | `aarch64-unknown-linux-gnu`  |
| Linux x64 musl   | `x86_64-unknown-linux-musl`  |
| Linux ARM64 musl | `aarch64-unknown-linux-musl` |
| Darwin x64       | `x86_64-apple-darwin`        |
| Darwin ARM64     | `aarch64-apple-darwin`       |
| Windows x64      | `x86_64-pc-windows-msvc`     |
| Windows ARM64    | `aarch64-pc-windows-msvc`    |

`hostTargetInfo()` exports only target/platform/architecture and reduced libc
evidence: ABI, observed GNU version or musl loader path, and probe source. It
never exports the full process report, environment or process maps. A static
binary without positive libc evidence is refused. The observed host GNU version
does not establish the native module's minimum supported GLIBC version.

Artifact verification checks hashes before loading and binds the target, clean
source revision, ABI, unwind/panic recovery, native build identity and declared
capabilities. `loadArtifact` and its async form compare the loaded C ABI's build
identity/capabilities with that manifest and close a mismatch. Staging requires a
clean pinned source; the actual native `TARGET` must match the probed host. The
compiler's `rustc -vV` host is metadata, not a substitute for a cross-build target.

These matrix fixtures do not qualify native modules for eight hosts. The selected
Windows x64 ABI 1.6 module is exercised explicitly with
`BUV_RUNTIME_SDK_GATE_DIR`. Every other native module needs its own execution,
SHA/source receipt and canonical ELF/dependency gate: GNU GLIBC at most 2.17,
musl without GNU symbols, matching loader and a closed dependency set. No native
module is built or installed by the target helper or artifact verifier.

## Native system and process ownership

`@aphrody/bun-runtime-sdk/system` gets statistics and executable identity from
the running Bun runtime. Its managed processes use `Bun.spawn`, POSIX process
groups and Windows `bun:windows.Job`; no external runtime library is loaded.
Binary capture drains both pipes concurrently. Lossless capture enforces a
per-stream lifetime byte budget, while capture mode retains the last 64 KiB.
Collection timeout, abort or capture failure terminates the owned child and
waits for exit and drain. Use `await using` or `release()` to release ownership.
Readiness awaits pipe events or subprocess exit, and HTTP probes use bounded
same-origin fetch requests. `system.capabilities()` reports only these APIs.

```ts
import { processes, system } from "@aphrody/bun-runtime-sdk/system";

const identity = system.info();
await using child = processes.spawn({
  program: identity.executable,
  args: ["-e", "console.log('ready')"],
  stdio: "capture-lossless",
});
const result = await child.collectOutput();
```

The core source receipt is in `docs/core-native-source-receipt.json`. The former
native ABI modules require separate consumer migration; this export does not
qualify their removal or native benchmark/GPU replacement.

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
