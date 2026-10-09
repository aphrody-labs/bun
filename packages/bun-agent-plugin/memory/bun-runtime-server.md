---
name: bun-runtime-server
description: "Bun.serve internals — NewServer<SSL,DEBUG>, ServerConfig, routes (AnyRoute), RequestContext, ServerWebSocket, node:http bridge (NodeHTTPResponse), H2/H3, HTML bundles and Bun.listen sockets"
metadata:
 type: reference
---

# Bun.serve / HTTP server (src/runtime/server/)

## Entry
- `Bun.serve` -> `BunObject_callback_serve` -> `super::serve` in `src/runtime/api/BunObject.rs` (`serve_with!` macro picks the monomorphization).
- Server types (`src/runtime/server/mod.rs` ~3748):
`HTTPServer = NewServer<false,false>`, `HTTPSServer = NewServer<true,false>`, `DebugHTTPServer = NewServer<false,true>`, `DebugHTTPSServer =
NewServer<true,true>`. DEBUG = `development` mode.
- JS classes generated from `server/server.classes.ts` via `generate(name)` for the 4 names; proto: fetch(doFetch), upgrade(doUpgrade)
 publish(doPublish), subscriberCount, reload(doReload), `@@dispose`, closeIdleConnections, stop(doStop), requestIP, timeout, ref/unref;
 getters port, id, pendingRequests, pendingWebSockets, hostname, address, url, protocol, development. Cached `values`: routeList
 onRequest, onError, onNodeHTTPRequest, onClientError, onConnection, wsOnOpen/Message/Close/Drain/Error/Ping/Pong. `sharedThis: false`
 (host fns still take `&mut self`).
- Also in server.classes.ts: `NodeHTTPResponse`, `ServerWebSocket`, `HTMLBundle`.
- `server_js_create(ptr, global, ssl, debug)` routes to `generated_classes::js_*Server::to_js`.
- `AnyServer` (mod.rs ~3770, `AnyServerTag`) = type-erased tagged pointer (packed u49 addr | u15 tag, cached in `any_server_packed`) used by
 C++ node:http path.

## NewServer struct (mod.rs ~228)
Fields: `app: *mut uws_sys::NewApp<SSL>`, `listener`, `h3_app` + `h3_listener` (HTTP/3 via lsquic; `h3_alt_svc` cached Alt-Svc header)
`h2_app` (when `config.http2`; ALPN "h2" or cleartext preface), `js_value: JsRef`, `vm`, `method_name_cache` (N_HTTP_METHODS=36), `config:
ServerConfig`, `pending_requests`, `active_connection_count`, `idle_tunnel_count`, websocket counts, `ServerFlags` (DEINIT_SCHEDULED
TERMINATED, HAS_HANDLED_ALL_CLOSED_PROMISE).
Key fns: `init(config, global)` (~2197), `set_routes` (~2303), `listen(this)` (~2852), `on_request` / `on_user_route_request` /
`on_node_http_request` (~1136-1276 and extern "C" trampolines ~3467), `stop(abrupt)` (~1853), `on_request_complete`. Deinit tasks:
`AppCloseTask<SSL>`, `ServerDeinitTask`, `ServerAllConnectionsClosedTask`.
`server_body.rs` (~3900 lines): `do_publish`, `do_reload`, `on_upgrade`, `on_request_for` / `on_user_route_request_for` generic over
`RequestCtxOps`, `ServePlugins` (serve.static plugins loading state), `respond_stopped_503`, `BunInfo`.

## ServerConfig (ServerConfig.rs)
`address` (tcp host/port or unix), `idle_timeout` (default 10s), `base_uri`, `ssl_config: Option<SSLConfig>`, `sni: Option<Vec<SSLConfig>>`
`max_request_body_size`, `development: DevelopmentOption`, `on_error`, `on_request` (fetch), `on_node_http_request`, `is_node_http_server`
`websocket: Option<WebSocketServerContext>`, `reuse_port`, `id`, `allow_hot`, `ipv6_only`, `http3`, `http2`, `http1`, `static_routes:
Vec<StaticRouteEntry>`, `negative_routes`, `user_routes_to_build: Vec<UserRouteBuilder>`, `bake: Option<bake::UserOptions>` (fullstack dev
server).

## Routes (`routes:` option)
`enum AnyRoute` (mod.rs ~167):
- `Static(RefPtr<StaticRoute>)` — `"/robots.txt": new Response(...)` buffered once (`StaticRoute.rs`).
- `File(RefPtr<FileRoute>)` — Bun.file responses, Range support (`RangeRequest.rs`), streamed by `FileResponseStream.rs` (shared with
 RequestContext file bodies).
- `Directory(RefPtr<DirectoryRoute>)` — `"/static/*": { dir }`.
- `Html(RefPtr<html_bundle::Route>)` — `import html from "./index.html"` -> lazily bundled (`HTMLBundle.rs`; dev mode uses `bake::DevServer`).
- `FrameworkRouter` — file-system routing (`"/*": { dir, style: "nextjs-pages" }`), `bake/FrameworkRouter.rs`.
- Function / method-object routes -> `UserRoute<SSL,DEBUG>` (mod.rs ~327), params via route matcher.
- Dev error page: `DevErrorPage.rs` + `dev-error-page.html`. Status text table `HTTPStatusText.rs`.

## Request lifecycle
- `RequestContext.rs` (~4850 lines) `RequestContext<...>` per request: creates JS `Request` (`webcore::Request`), calls fetch handler
 handles returned `Response`/Promise, writes body (Blob, InternalBlob, ReadableStream via `HTTPServerWritable` sink in
 `webcore/streams.rs`, sendfile `SendfileContext`), abort handling, `UpgradeState`.
- `AnyRequestContext.rs` erases SSL/DEBUG generics. `PreparedRequest`, `SavedRequest` (for deferred dispatch).
- Underlying HTTP engine: uWebSockets/uSockets C++ in `packages/bun-uws`, `packages/bun-usockets`; Rust wrappers crates `src/uws`
 (`bun_uws`) and `src/uws_sys`.

## WebSockets (server side)
- `WebSocketServerContext.rs` (`Handler`): websocket options (open/message/close/drain/ping/pong, perMessageDeflate, maxPayloadLength
 idleTimeout, backpressureLimit, publishToSelf...).
- `ServerWebSocket.rs`: per-connection object, `BinaryType`, `Flags(u64)`; send/publish/subscribe/cork. Pub/sub topics handled by uWS app
 (`server.publish`).
- Upgrade path: `server.upgrade(req, {data, headers})` -> `on_upgrade` in server_body.rs.

## node:http bridge
- `node:http` `createServer` is implemented on top of Bun.serve with `on_node_http_request`; JS side `src/js/node/_http_server.ts` (+
 `internal/http.ts` `$cpp` setServerCustomOptions etc., `getBunServerAllClosedPromise` via `$newRustFunction("node_http_binding.rs"
 ...)`).
- `NodeHTTPResponse.rs` (~2800 lines) = the raw uWS response object driven by node:http's ServerResponse; C++
 `src/jsc/bindings/node/JSNodeHTTPServerSocket*.cpp`.
- `src/runtime/node/node_http_binding.rs` Rust helpers.

## Raw sockets (Bun.listen / Bun.connect / Bun.udpSocket)
`src/runtime/socket/`: `Listener.rs` (listen/connect, `jsAddServerName`), `socket_body.rs` (TCPSocket/TLSSocket, generated from
`sockets.classes.ts` `generate(ssl)`), `Handlers.rs`/`JSSocketHandlers.rs`, `uws_handlers.rs`/`uws_dispatch.rs`, `tls_socket_functions.rs`
`SSLConfig.rs`, `udp_socket.rs` (UDPSocket), `SocketAddress.rs`, `node/net/BlockList.rs`, `UpgradedDuplex.rs` (TLS over a JS duplex)
`WindowsNamedPipe*.rs`. node:net (`src/js/node/net.ts`) uses `Bun.listen` and
`$newRustFunction("node_net_binding.rs"/"runtime/socket/socket.rs"...)`.

## Bake (fullstack dev server / SSR framework)
`src/runtime/bake/` — `DevServer.rs` + `dev_server/`, `FrameworkRouter.rs`, `production.rs`, HMR runtime TS (`hmr-runtime-client.ts`
`hmr-runtime-server.ts`), `bun-framework-react`. Tests in `test/bake/` (skill `writing-dev-server-tests`).

Tests: `test/js/bun/http/serve.test.ts`, `test/js/bun/websocket/`, `test/js/node/http/`.
Related: `bun-runtime-webcore-fetch-streams`, `bun-runtime-bun-apis`, `bun-runtime-http-sql-valkey`.
