---
name: bun-toolchain-bake
description: "Bake (src/runtime/bake) - DevServer for Bun.serve HTML routes/app, IncrementalGraph HMR, HMR websocket protocol, framework API, FrameworkRouter, bun build --app production, client/server HMR runtimes"
metadata:
 type: reference
---

# Bake — `src/runtime/bake/` (inside crate `bun_runtime`; there is no `src/bake/`)

"Bun's toolkit for building client+server web apps: combines `Bun.build` and `Bun.serve`, providing a
hot-reloading dev server, server components, and integrations — a tool for frameworks, not a framework"
(`mod.rs`). Type stubs reference `src/bake/bake.d.ts` in docs but the real file is
`src/runtime/bake/bake.d.ts` (+ `bake.private.d.ts`). API marked "under heavy development".

## When DevServer starts
`src/runtime/server/ServerConfig.rs` (~930): if `Bun.serve({ routes })` contains HTMLBundle routes
(`dedupe_html_bundle_map`) or framework routers, and `development` has HMR enabled, it builds
`bake::UserOptions` (client env prefix/load_all/disable, `serve_define`) into `args.bake`. Also via the
`app:` option (`UserOptions::from_js`, ~1147; comment says "app" may be removed in favor of the HTML loader).
`src/runtime/server/mod.rs` (~2266) calls `bake::DevServer::init(Options{..})` after the server box exists;
`server.dev_server: Option<Box<DevServer>>`. Requests reach it via `AnyRequestContext::dev_server`.

## Files
- `mod.rs` — keystone types: `Side`/`Graph` (canonical in `bun_bundler::bundle_v2` bake_types: `Side {Client
 Server}`, `Graph {Client, Server, Ssr}`), `Mode`, `UserOptions`, `Framework` re-exports; wiring to
 `bun_bundler::dispatch::DevServerVTable`.
- `DevServer.rs` (~6.8k): request handling (`on_request`, `on_js_request`, `on_asset_request`
 `on_src_request`, `on_html_request_with_bundle`, `on_framework_request_with_bundle`), bundling
 (`ensure_route_is_bundled`, `start_async_bundle`, `start_next_bundle_if_present`, `finalize_bundle`
 `generate_client_bundle`, `generate_css_js_array`, `generate_html_payload`, `trace_all_route_imports`)
 file watching (`on_file_update`), HMR websocket (`on_websocket_upgrade`, `on_message`, `publish`)
 errors (`send_serialized_failures`, `index_failures`, `on_report_error_request`), host/origin checks
 (`is_allowed_dev_host`, `is_allowed_dev_origin`), memory visualizer, `bake_load_server_hmr_patch*`.
 Philosophy: all in-memory, data-oriented, "editing a file must rebundle only that one file".
- `dev_server/`: `incremental_graph.rs` (`IncrementalGraph<SIDE>`: per-side file graph, edge lists
 `FileIndex` (u30) distinct per side, `EdgeAttachmentMode`, CSS freeing), `hmr_socket.rs`
 `route_bundle.rs`, `assets.rs`, `source_map_store.rs`, `serialized_failure.rs`, `error_report_request.rs`
 `inspector_agent.rs`, `memory_cost.rs`, `packed_map.rs`, `js_escape.rs`, `lifecycle.rs`, `mod.rs` (wire enums).
- `FrameworkRouter.rs` (~2k): filesystem route discovery per framework `fileSystemRouterTypes`
 (`Type`, `Route`, `FileKind`, `EncodedPattern`, `StaticPattern`, `ParsedPattern`, `Style`, `MatchedParams`
 `InsertError`); incremental for DevServer, serializable for production; JS test hook `JSFrameworkRouter`
 (test `test/bake/framework-router.test.ts`).
- `bake_body.rs`: `Framework`/`UserOptions`/`BuildConfigSubset` `from_js`, `Framework::react(arena)` built-in
 (embeds `bun-framework-react/{client,server,ssr}.tsx` via `runtime_embed_file!`; `framework: "react"`)
 `add_import_meta_defines`, `init_server_runtime`, `get_hmr_runtime`.
- `production.rs`: `bun build --app` (`Arguments.rs` sets `bundler_options.bake`; `build_command.rs` ~76 ->
 `bake::production::build_command`) — bundles client/server/ssr, SSG prerender via `PerThread` VM.
 `BakeProduction.cpp`.
- C++: `BakeGlobalObject.{cpp,h}`, `BakeSourceProvider.*`, `DevServerSourceProvider.*`;
 `source_provider_exports.rs`.
- TS runtimes (bundled as internal): `hmr-module.ts` (HMR module registry implementing `bun build`
 semantics, not strict ESM; imports helpers from `src/runtime.bun.js`), `hmr-runtime-client.ts`
 `hmr-runtime-server.ts`, `hmr-runtime-error.ts`, `client/` (error `overlay.ts`, `css-reloader.ts`
 `websocket.ts`, `stack-trace.ts`), `shared.ts`, `enums.ts`, `generated.ts`, `DevServer.bind.ts`.

## Bundler side
Output format `Format::InternalBakeDev`: `((unloadedModuleRegistry, config) => {...runtime...})({"mod.ts": ...}
{...})`. Parser `hot_module_reloading` (forces tree_shaking off), `lower_esm_exports_hmr.rs`
(`ConvertESMExportsForHmr`), `import.meta.hot` (`hmr_api_ref`, `handle_import_meta_hot_accept_call`), React
Fast Refresh (`react_fast_refresh` feature). BundleV2 entry: `start_from_bake_dev_server`
`finish_from_bake_dev_server`, `enqueue_file_from_dev_server_incremental_graph_invalidation`; linker
`convertStmtsForChunkForDevServer.rs`. Reserved source indices `BAKE_SERVER_DATA = 1`, `BAKE_CLIENT_DATA = 2`.
Server components: `ServerComponentParseTask.rs`, `server_components` feature, `"use client"` boundaries
separate SSR graph (`Target::ServerComponentsSsr`).

## HMR wire protocol (`dev_server/mod.rs`; must match client `generated.ts`)
Server->client `MessageId`: `Version 'V'`, `HotUpdate 'u'`, `Errors 'e'`, `MemoryVisualizer 'M'`
`SetUrlResponse 'n'`, `TestingWatchSynchronization 'r'`. Client->server `IncomingMessageId`: `Init 'i'`
`Subscribe 's'`, `SetUrl 'n'`, `TestingBatchEvents 'H'`, `ConsoleLog 'l'`, `UnrefSourceMap 'u'`.
`HmrTopic`: `HotUpdate 'h'`, `Errors 'e'`, `BrowserError 'E'`, `IncrementalVisualizer 'v'`
`MemoryVisualizer 'M'`, `TestingWatchSynchronization 'r'`. Browser console forwarding:
`broadcast_console_log_from_browser_to_server_for_bake`.

## Tests
`test/bake/` with `bake-harness.ts` (`devTest`, `prodTest`, `devAndProductionTest`, `Dev`, `Client`
`emptyHtmlFile`, `minimalFramework`); see `bun-toolchain-bundler-tests`.

## Related
`bun-toolchain-bundler` · `bun-toolchain-parser`
