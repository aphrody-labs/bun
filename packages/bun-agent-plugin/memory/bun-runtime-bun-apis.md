---
name: bun-runtime-bun-apis
description: "globalThis.Bun object — full property table, C++ vs Rust owners, lazy-prop/callback export macros.classes.ts codegen classes and where each Bun.* API lives"
metadata:
 type: reference
---

# Bun.* APIs (src/runtime/api/ + src/jsc/bindings/BunObject.cpp)

## How the Bun object is built
- C++ hash table `@begin bunObjectTable ... @end` in `src/jsc/bindings/BunObject.cpp` (create_hash_table codegen). Each row: name, C++/Rust
 symbol, attributes (`PropertyCallback` = lazy, `Function N`, `CustomAccessor`).
- Rust side: `src/runtime/api/BunObject.rs`, `mod bun_object`:
- `export_callbacks!{ BunObject_callback_<name> => fn }` -> `#[no_mangle]` host fns wrapped in `bun_jsc::jsc_host_abi!` (SysV on
 Windows-x64! mismatching ABI = garbage globalObject).
 - `export_lazy_prop_callbacks!{ BunObject_lazyPropCb_<name> => getter }` (signature `(JSGlobalObject*, JSObject*) -> JSValue`, or `JsResult`).
 - Recipe in doc comment: add callback/prop -> export -> update bunObjectTable in BunObject.cpp -> update `BunObject+exports.h` -> `bun run build`.
- `src/runtime/api/BunObject.bind.ts` = bindgen fns (e.g. `gc` -> `Generated::BunObject::jsGc`).

## Property table (names in bunObjectTable)
`$ Archive ArrayBufferSink Cookie CookieMap CryptoHasher FFI FetchSession FileSystemRouter Glob Image MD4 MD5 ModuleGraph SHA1 SHA224 SHA256
SHA384 SHA512 SHA512_256 JSONC JSON5 JSONL markdown TOML XML YAML Transpiler embeddedFiles S3Client s3 CSRF allocUnsafe argv build
concatArrayBuffers connect cron cwd color deepEquals deepMatch deflateSync dns enableANSIColors env escapeHTML fetch file fileURLToPath gc
generateHeapSnapshot gunzipSync gzipSync hash indexOfLine inflateSync inspect isMainThread isStandaloneExecutable jest listen udpSocket main
mmap nanoseconds openInEditor origin version_with_sha password pathToFileURL peek plugin randomUUIDv7 randomUUIDv5
readableStreamToArray/ArrayBuffer/Bytes/Blob/FormData/JSON/Text registerMacro resolve resolveSync revision semver sql postgres SQL serve sha
shrink sliceAnsi sleep sleepSync spawn spawnSync stderr stdin stdout stringWidth stripANSI wrapAnsi Terminal unsafe version WebView which
RedisClient redis secrets write zstdCompressSync zstdDecompressSync zstdCompress zstdDecompress`

### Implemented in C++ (BunObject.cpp & friends)
`$` (constructBunShell), Cookie/CookieMap (`Cookie.cpp`, `CookieMap.cpp`), ModuleGraph, JSONL, concatArrayBuffers, deepEquals, deepMatch
dns (constructDNSObject), env, escapeHTML, fetch, fileURLToPath/pathToFileURL, gc, generateHeapSnapshot, isMainThread, main, nanoseconds
password (constructPasswordObject; impl `src/runtime/crypto/PasswordObject.rs`/`pwhash.rs`), peek (`src/js/builtins/Peek.ts`), plugin
(`BunPlugin.cpp`), randomUUIDv7/v5, readableStreamTo* (WebCore), revision, version, version_with_sha, sql/postgres/SQL (JS
`src/js/bun/sql.ts`), sleep, sliceAnsi, stringWidth, stripANSI, wrapAnsi, WebView (`src/runtime/webview/`), secrets.

### Rust callbacks (`BunObject_callback_*`)
allocUnsafe, build (`JSBundler.rs`), color (`bun_css_jsc::js_function_color`), connect/listen (`socket/Listener.rs`)
deflateSync/inflateSync/gzipSync/gunzipSync (JSZlib), file (`webcore::blob::construct_bun_file`), indexOfLine, jest (`Jest::call`), mmap
openInEditor, registerMacro, resolve/resolveSync, serve (see `bun-runtime-server`), sha (= `SHA512_256::hash`), shellEscape, shrink
sleepSync, spawn/spawnSync (`api/bun/subprocess.rs`), udpSocket (`socket/udp_socket.rs`), which, write (`webcore::blob::write_file`), zstd*
(JSZstd), createParsedShellScript/createShellInterpreter (shell).

### Rust lazy props (`BunObject_lazyPropCb_*`)
Archive (`Archive.rs`), CryptoHasher + MD4/MD5/SHA* (`crypto/CryptoHasher.rs`), CSRF (`csrf_jsc.rs`), FFI (`runtime/ffi/`), FetchSession
FileSystemRouter (`filesystem_router.rs`), Glob (`glob.rs`), Image (`runtime/image/`), JSONC/JSON5/TOML/XML/YAML/markdown (`*Object.rs`)
Transpiler (`JSTranspiler.rs`), argv, cron (`cron.rs`, `cron_parser.rs`), cwd, embeddedFiles (`standalone_graph_jsc.rs`), enableANSIColors
isStandaloneExecutable, hash (`HashObject.rs`), inspect, origin, semver (`bun_semver_jsc::SemverObject`), unsafe (`UnsafeObject.rs`)
S3Client/s3 (`webcore/S3Client.rs`), ValkeyClient/valkey (RedisClient/redis), Terminal (`api/bun/Terminal.rs`).

## Other api/ files
`HTMLRewriter` (`html_rewriter.rs`, lol-html), `JSBundler.rs` (Bun.build + plugins; `js_bundle_completion_task.rs`, `output_file_jsc.rs`)
`api/bun/`: `SecureContext.rs`, `SSLContextCache.rs`, `h2_frame_parser.rs` + `h2/` (node:http2 frame parser), `process.rs`, `spawn.rs`
`spawn/stdio.rs`, `subprocess.rs` + `subprocess/{Readable,Writable,ResourceUsage,SubprocessPipeReader}.rs`, `js_bun_spawn_bindings.rs`
`x509.rs`, `Terminal.rs`. `crash_handler_jsc.rs`, `NativePromiseContext.rs`.
- Sockets (Bun.listen/connect/udpSocket): `src/runtime/socket/` (`Listener.rs`, `socket_body.rs`, `udp_socket.rs`
 `SSLConfig.rs`+`.bindv2.ts`, `SocketConfig.bindv2.ts`, `WindowsNamedPipe.rs`, `UpgradedDuplex.rs`, `bundled_root_certs.rs`
 `system_certs.rs`).
- Timers: `src/runtime/timer/` (Timer.rs, TimeoutObject, ImmediateObject, DateHeaderTimer, EventLoopDelayMonitor, WTFTimer).
- IPC: `src/runtime/ipc.rs`, `ipc_host.rs`.
- NAPI: `src/runtime/napi/napi_body.rs`. FFI (bun:ffi): `src/runtime/ffi/ffi_body.rs` (TinyCC via `bun_tcc_sys`; `cc` = `Bun__FFI__cc`)
 `FFIObject.rs`, `abi_type.rs`, `FFI.h`.

## .classes.ts codegen (src/codegen/generate-classes.ts)
`define({ name, proto:{ m:{fn,length} | {getter,setter,cache} }, klass, construct, finalize, values:[cached slots], JSType, memoryCost
estimatedSize, sharedThis, noConstructor })` -> C++ wrapper + Rust `crate::generated_classes::js_<Name>` (`to_js`, `get_constructor`). Rust
impl methods marked `#[bun_jsc::host_fn(method)]`. See skill `implementing-jsc-classes-rust`.
Class files: api/{Archive, BunObject(ResourceUsage, Subprocess), Glob, JSBundler(Transpiler, BuildArtifact), ParsedShellScript, S3Client
S3Stat, SecureContext, Shell(ShellInterpreter), Terminal, cron(CronJob), filesystem_router(FileSystemRouter, FrameworkFileSystemRouter
MatchedRoute), h2(H2FrameParser), html_rewriter(HTMLRewriter, TextChunk, DocType, DocEnd, Comment, EndTag, AttributeIterator, Element
HTMLRewriterTransform), sourcemap(SourceMap), sql(PostgresSQLConnection/Query, MySQLConnection/Query), streams(Blob/File/Bytes
InternalReadableStreamSource), zlib(NativeZlib, NativeBrotli, NativeZstd)}, crypto(Crypto, CryptoHasher, SHA1..SHA512_256/MD4/MD5), ffi
image(Image), node(DNSResolver, FSWatcher, StatWatcher, Timeout, Immediate, NodeJSFS), node/quic
server(HTTPServer/HTTPSServer/DebugHTTPServer/DebugHTTPSServer, NodeHTTPResponse, ServerWebSocket, HTMLBundle), socket(TCPSocket, TLSSocket
Listener, UDPSocket, SocketAddress, BlockList), test_runner/jest, valkey_jsc(RedisClient), webcore(FetchSession, TextDecoder, Request
Response, Blob).
Generated Rust glue included from `$BUN_CODEGEN_DIR`: `src/runtime/generated_classes.rs`, `generated_host_exports.rs`
`generated_js2native.rs`, `generated_jssink.rs`.

Related: `bun-runtime-builtin-js-modules`, `bun-runtime-webcore-fetch-streams`, `bun-runtime-server`.
