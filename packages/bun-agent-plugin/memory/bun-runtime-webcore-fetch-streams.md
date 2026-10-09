---
name: bun-runtime-webcore-fetch-streams
description: "Web APIs in src/runtime/webcore — fetch pipeline (fetch_impl -> FetchTasklet -> AsyncHTTP), Request/Response/Body.Value, Blob/Bun.file Store, ReadableStream native sources, JSSink sinks, S3, encoding"
metadata:
 type: reference
---

# Webcore: fetch, Request/Response, Blob, streams (src/runtime/webcore/)

Module root: `src/runtime/webcore.rs`. Many Web APIs are C++ in `src/jsc/bindings/webcore/` (EventTarget, FetchHeaders = `Headers`
URL/URLSearchParams, BroadcastChannel, MessagePort, WebSocket JS class, Web Streams controllers/readers `webcore/streams/JS*.cpp`
CompressionStream/DecompressionStream `JSCompressionStream*.cpp`). Rust owns the data-heavy parts below.

## fetch
- Global `fetch` / `Bun.fetch`: `#[host_fn(export = "Bun__fetch")] fn bun_fetch` in `webcore/fetch.rs` -> `fetch_impl::<ALLOW_GET_BODY>(ctx
 callframe, session)`. `fetch` never throws synchronously: errors go through `reject_on_exception` (WHATWG step 3). `session_fetch` =
 `session.fetch`.
- `webcore/fetch/FetchTasklet.rs` (~2800 lines): `FetchTasklet` = per-request state bridging JS thread and HTTP thread; `FetchOptions`
 fields: method, headers, body (`HTTPRequestBody`), stream_framing, disable_timeout, idle_timeout_seconds (`timeout` ms)
 disable_keepalive, disable_decompression, max_redirects, reject_unauthorized, verbose, redirect_type, proxy (`ProxyPolicy`) +
 proxy_headers, signal (AbortSignal), check_server_identity, unix_socket_path (`unix`), ssl_config (`tls`), forced_protocol (`protocol`
 http1/h2/h3), is_node_http_client, compress (`compress_body.rs`), pool/bypass_pool, fetch_session.
- `fetch/FetchRequestBodySink.rs` = streaming request body (ReadableStream upload); `fetch/FetchSession.rs` = `Bun.FetchSession` (shared
 tls/proxy/unix + keep-alive pool; class `FetchSession.classes.ts`); `fetch/proxy_testing.rs`.
- Network work runs on the HTTP thread: `bun_http::AsyncHTTP` (`src/http/AsyncHTTP.rs`, `start_async_http`), `HTTPThread.rs`.
 `bun-runtime-http-sql-valkey`.
- `data:`, `file://`, `blob:` (ObjectURLRegistry.rs) and `s3://` URLs are handled in fetch.rs before networking.

## Request / Response / Body
- Classes in `webcore/response.classes.ts`: `Request`, `Response`, `Blob`.
- `Request.rs` (`struct Request`, `Flags`), `Response.rs` (`struct Response`, `Init`, `HeadersRef(NonNull<FetchHeaders>)`
 `BodyAbortListener`), `BakeResponse.rs` (SSR Response subclass).
- `Body.rs`: `struct Body`, `enum Value { Blob, WTFStringImpl, InternalBlob, Locked(PendingValue), Used, Empty, Error(ValueError), Null }` —
 strings stay as refcounted WTFStringImpl until the server needs bytes (`to_blob_if_possible`). Values pooled in a hive: `hive_alloc` /
 `BodyHiveHandle` (POOL_SIZE 256, `runtime_state.body_value_pool`). `Body::extract(global, value)` converts BodyInit. `PendingValue` =
 locked body awaiting stream/promise.
- `FormData.rs`, `CookieMap.rs` (Rust side of `Bun.CookieMap`), `headers_ref.rs`.

## Blob / Bun.file / Bun.write
- `Blob.rs` (~6800 lines) + `webcore/blob/`: `Store.rs`, `read_file.rs`, `write_file.rs`, `copy_file.rs` (copy_file_range/clonefile fast
 paths), `io_parking.rs`.
- Data types are defined LOWER in `bun_jsc`: `src/jsc/webcore_types.rs` — `pub struct Blob`, `store::{Store, Data { Bytes, File, S3 }
 DataTag, Bytes, File, S3}`; runtime adds extension traits (`BlobExt`).
- `Bun.file` -> `webcore::blob::construct_bun_file`; `Bun.write` -> `webcore::blob::write_file`.
- S3: `S3Client.rs`, `S3File.rs`, `S3Stat.rs`, `webcore/s3/{client, credentials_jsc, download_stream, error_jsc, list_objects, multipart
 simple_request, xml_response}.rs`; signing in crate `bun_s3_signing` (`src/s3_signing/`: credentials.rs SigV4, acl.rs, storage_class.rs).

## Streams
- `ReadableStream.rs`: Rust handle to JS ReadableStream; `Tag { Invalid=-1, JavaScript=0, Blob=1, File=2, Direct=3, Bytes=4 }` (asserted
 against C++ `ReadableStreamTag__tagged`), `Source { JavaScript, Blob(*ByteBlobLoader), File(*FileReader), Bytes(*ByteStream) }`
 `NewSource<C: SourceContext>` generic native source.
- Native sources: `ByteBlobLoader.rs` (Blob -> stream), `FileReader.rs` (file fd -> stream), `ByteStream.rs` (pushed bytes, e.g. fetch
 response body). JS classes `{Blob,File,Bytes}InternalReadableStreamSource` from `api/streams.classes.ts`.
- `streams.rs` (~2800 lines): `Start`, `StreamResult`, `StreamError`, `Writable`, `Pending`, `SourceHandle`, `HTTPServerWritable<SSL>`
 (Response body sink for Bun.serve), `NetworkSink` (S3 upload), `BufferAction`.
- Sinks (`Sink.rs` `JSSink<T>`, codegen `src/codegen/generate-jssink.ts`, glue `generated_jssink.rs`): ArrayBufferSink, FileSink
 HTTPResponseSink, HTTPSResponseSink, NetworkSink, FetchRequestBodySink, HTMLRewriterSink. `FileSink.rs` = `Bun.file.writer` / stdout
 writer / subprocess stdin.
- `CompressionStreamCoder.rs` (gzip/deflate/brotli/zstd coder for (De)CompressionStream). `wasm_streaming.rs` (WebAssembly.compileStreaming;
 JS `builtins/WasmStreaming.ts`).
- Helpers `Bun.readableStreamTo*` are C++ (`WebCore::jsFunctionReadableStreamTo*`), stream consumers in `webcore/streams/BunStreamConsumers.cpp`.

## Encoding & misc
`TextEncoder.rs`, `TextDecoder.rs` (class `encoding.classes.ts`), `TextEncoderStreamEncoder.rs`, `encoding.rs`, `EncodingLabel.rs`;
`Crypto.rs` (globalThis.crypto getRandomValues/randomUUID; subtle is C++); `prompt.rs` (alert/confirm/prompt); `ScriptExecutionContext.rs`;
`ObjectURLRegistry.rs` (URL.createObjectURL).

Tests: `test/js/web/fetch/fetch.test.ts`, `test/js/web/streams/`, `test/js/bun/io/bun-write.test.js`, `test/js/bun/s3/`.
Related: `bun-runtime-server`, `bun-runtime-http-sql-valkey`, `bun-runtime-bun-apis`.
