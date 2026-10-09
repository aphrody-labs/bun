---
name: bun-runtime-node-compat
description: "Node.js compatibility layer map — which node:* modules are JS (src/js/node), native C++ (src/jsc/modules), or Rust bindings (src/runtime/node); fs/path/process/Buffer/net/http/crypto/child_process owners and compat review rules"
metadata:
 type: reference
---

# Node.js compat layer

Three layers per module:
1. JS module `src/js/node/<name>.ts` (bundled builtin, header comment `// Hardcoded module "node:x"`), helpers in `src/js/internal/` —
 `bun-runtime-builtin-js-modules`.
2. Rust native bindings `src/runtime/node/*.rs` (module root `src/runtime/node.rs`; every Windows-only file needs a `#[cfg(windows)] pub
 mod` there or its exports won't link), reached from JS via `$rust("node_x_binding.rs", "sym")` / `$newRustFunction(...)` or `.classes.ts`
 classes.
3. C++ in `src/jsc/bindings/` (JSBuffer, process, crypto, http parser, timers) and native modules in `src/jsc/modules/`.

Resolution of specifiers: `src/resolve_builtins/HardcodedModule.rs` (crate `bun_resolve_builtins`, strum `serialize = "node:fs"` etc. +
aliases), `node_builtins.rs`.

## Native (C++) modules — `src/jsc/modules/` (`NativeModuleList.h`)
`node:buffer` (NodeBufferModule.cpp + `src/jsc/bindings/JSBuffer.cpp`, JS builtins `builtins/JSBufferConstructor.ts`/`JSBufferPrototype.ts`
Rust `runtime/node/buffer.rs`), `node:constants`, `node:module` (NodeModuleModule.cpp; `builtins/NodeModuleObject.ts`, `CommonJS.ts`)
`node:process` (NodeProcessModule.h; object in `BunProcess.cpp`), `node:sqlite` (NodeSqliteModule.h), `node:string_decoder`, `node:tty`
(NodeTTYModule.cpp + `js/node/tty.ts`), `node:util/types` (NodeUtilTypesModule.cpp), `utf-8-validate`, `abort-controller`, plus `bun`
`bun:jsc`, `bun:test`, `bun:app` (BunObjectModule.h, BunJSCModule.h, BunTestModule.h, BunAppModule.h).

## JS modules in src/js/node/
_http2_upgrade, _http_agent/_client/_common/_incoming/_outgoing/_server, _stream_* , _tls_common/_tls_wrap, assert(+strict), async_hooks
child_process, cluster, console, crypto, dgram, diagnostics_channel, dns(+promises), domain, events, fs(+promises), http, http2, https
inspector(+promises), net, os, path(+posix/win32), perf_hooks, punycode, querystring, quic, readline(+promises), repl, stream(+consumers
iter, promises, web), test, timers(+promises), tls, trace_events, tty, url, util, v8, vm, wasi, worker_threads, zlib, zlib.iter.

## Key module owners
- **fs**: JS `src/js/node/fs.ts`, `fs.promises.ts`; shared native binding `src/js/internal/fs/binding.ts` (one `createBinding` instance);
 constants `$processBindingConstants.fs`; `internal/fs/{cp, cp-sync, glob, streams, watch, watchfile}.ts`. Rust: `runtime/node/node_fs.rs`
 (~10k lines; `struct NodeFS` ~4640, `mod args` ~2734; top-level fns assume validated args; uses `bun_sys::Maybe`), `node_fs_binding.rs`
 (generated NodeFS host fns; class `NodeJSFS` in `node.classes.ts`), `node_fs_constant.rs`, `Stat.rs`, `StatFS.rs`, `dir_iterator.rs`
 watchers `node_fs_watcher.rs` (FSWatcher), `node_fs_stat_watcher.rs` (StatWatcher), `path_watcher.rs`, `fs_events.rs` (macOS)
 `win_watcher.rs`. `types.rs` = PathLike/Encoding/StringOrBuffer arg types.
- **path**: `runtime/node/path.rs` + `js/node/path*.ts`.
- **process**: C++ `src/jsc/bindings/BunProcess.cpp`; Rust `runtime/node/node_process.rs` (process info/control); JS
 `builtins/ProcessObjectInternals.ts`, `internal/process/pre_execution.ts`; signals on Windows `uv_signal_handle_windows.rs`;
 `memory_pressure.rs`.
- **os**: `node_os.rs` + `node_os.bind.ts` (bindgen).
- **child_process**: `js/node/child_process.ts` built on `Bun.spawn`/`Bun.spawnSync` (`runtime/api/bun/subprocess.rs`); IPC
 `runtime/ipc.rs`, `ipc_host.rs`, `builtins/Ipc.ts`; cluster: `js/node/cluster.ts`, `internal/cluster/*`, Rust `node_cluster_binding.rs`.
- **net / tls**: `js/node/net.ts` uses `Bun.listen`/`Bun.connect` + `$rust("node_net_binding.rs"...)` (autoSelectFamily, BlockList
 SocketAddress, newDetachedSocket, doConnect) and `runtime/socket/socket.rs` fns (jsUpgradeDuplexToTLS, jsIsNamedPipeSocket);
 `internal/net/*`; `tls.ts`, `_tls_wrap.ts`, `SecureContext.rs`.
- **http/https**: `_http_server.ts` (on Bun.serve via `on_node_http_request` + `NodeHTTPResponse.rs`), `_http_client.ts` (fetch-based
 `is_node_http_client`), C++ llhttp parser `src/jsc/bindings/node/http/` (JSHTTPParser, JSConnectionsList), Rust `node_http_binding.rs`
 `internal/http.ts`, `internal/http/FakeSocket.ts`, `internal/http1_server_fallback.ts`.
- **http2**: `js/node/http2.ts` + `runtime/api/bun/h2_frame_parser.rs` and `api/bun/h2/` (class H2FrameParser).
- **quic**: `js/node/quic.ts`, `internal/quic/*`, Rust `runtime/node/quic/` + `node_quic_binding.rs`.
- **crypto**: JS `js/node/crypto.ts`; C++ `src/jsc/bindings/node/crypto/` (KeyObject, Cipher, DiffieHellman, keygen jobs, Hkdf, Sign
 Primes...); Rust `runtime/node/node_crypto_binding.rs`, `runtime/crypto/` (CryptoHasher, EVP, HMAC, PBKDF2, boringssl_jsc). BoringSSL
 vendored at `vendor/boringssl`.
- **zlib**: `js/node/zlib.ts`; Rust `runtime/node/zlib/{NativeZlib, NativeBrotli, NativeZstd}.rs` + `node_zlib_binding.rs` (classes from
 `api/zlib.classes.ts`).
- **dns**: `js/node/dns.ts` -> `runtime/dns_jsc/dns.rs` (Resolver, c-ares `cares_jsc.rs`, `dns_sd.rs`), class `DNSResolver`; lower crate
 `bun_dns` (`src/dns/lib.rs`, getaddrinfo + cache).
- **timers**: C++ `src/jsc/bindings/node/NodeTimers.cpp`; Rust `runtime/timer/` (Timeout/Immediate classes in node.classes.ts).
- **util**: `js/node/util.ts`, `internal/util/*`, `builtins/UtilInspect.ts`; Rust `node_util_binding.rs`, `node/util/parse_args.rs`
 (+`parse_args_utils.rs`), `node/util/validators.rs`.
- **assert**: `js/node/assert.ts`, `internal/assert/*` (myers_diff via `$rust("node_assert_binding.rs","generate")`), Rust `node_assert.rs`
 `assert/myers_diff.rs`.
- **worker_threads**: `js/node/worker_threads.ts` + `src/jsc/web_worker.rs`; `internal/worker/`.
- **streams**: `js/node/stream*.ts`, `internal/streams/*` (Node streams port, readable/writable/duplex...), `internal/webstreams_adapters.ts`.
- **readline/repl**: `internal/readline/*`, `internal/repl/*` (acorn), `js/node/repl.js`.

## Errors & validation
- Node error codes table `src/jsc/bindings/ErrorCode.ts` (329 codes, `[code, Ctor, name?...extraCtors]`), C++ `ErrorCode.cpp/.h`, codegen
 `src/codegen/generate-node-errors.ts`. JS: `throw $ERR_INVALID_ARG_TYPE(name, expected, actual)`. Rust:
 `global.ERR_INVALID_ARG_TYPE(format_args!(...))` style methods.
- JS validators `src/js/internal/validators.ts` (validateFunction, validateInteger, validateString, getValidatedPath...).

## Review rules (.claude/docs/landing-prs.md "Node/Web compat")
Node's observed behavior is the spec (Web APIs: WHATWG/WPT). Match full error contract: exact `ERR_*` code, ctor class, verbatim message
check ordering, delivery channel (throw vs event vs rejection). Never validate stricter than Node. Property attributes / prototype chains /
timing are observable. Port upstream tests verbatim into `test/js/node/test/parallel/` (~3600 files); known failures `test.todo`, never
weaken. Port all sibling forms (sync/callback/promises).

Tests: `test/js/node/<module>/`, `test/js/node/test/parallel/`.
Related: `bun-runtime-builtin-js-modules`, `bun-runtime-server`, `bun-runtime-shell`.
