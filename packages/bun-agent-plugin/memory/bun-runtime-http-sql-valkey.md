---
name: bun-runtime-http-sql-valkey
description: "Network/database crates — bun_http client (HTTP/1.1, h2_client, h3_client, proxy, TLS session cache), WebSocket client (http_jsc), Bun.SQL (postgres/mysql/sqlite adapters), Valkey/Redis, DNS, S3 signing"
metadata:
 type: reference
---

# HTTP client, WebSocket client, SQL, Valkey, DNS, S3

## bun_http (src/http/) — fetch network engine
- `lib.rs` ("HTTP client"): `HTTPClient<'a>` (~752), `HTTPClientResult`, `HTTPClientResultCallback`. Runs on a dedicated **HTTP thread**
 (`HTTPThread.rs`, also SSL-context cache keyed by interned `SSLConfig` pointer; `ssl_config.rs` `global_registry`).
- `AsyncHTTP.rs`: `AsyncHTTP` (request job handed from JS thread; `start_async_http`, `preconnect`, `load_env` for proxy env vars
 `basic_authorization`, `Options`), `SingleHTTPChannel`.
- `HTTPContext.rs`: `HTTPContext<const SSL: bool>` socket context + keep-alive pool (SSL const-generic is load-bearing). `session_cache.rs`:
 client TLS session resumption keyed on `(hostname, port, proxy_auth_hash, unix_path)`.
- `ProxyTunnel.rs`: HTTPS-over-HTTP-proxy CONNECT tunnel. `HeaderBuilder.rs`, `Headers.rs`, `HeaderValueIterator.rs`, `HTTPRequestBody.rs`
 `ThreadSafeStreamBuffer.rs` (streaming upload), `SendFile.rs`, `Decompressor.rs` + `InternalState.rs` (gzip/deflate/br/zstd; libdeflate
 bounded gzip ISIZE), `compress_body.rs` (request compression), `CertificateInfo.rs`, `HTTPCertError.rs`, `InitError.rs`, `Signals.rs`
 `lshpack.rs` (HPACK via vendor/lshpack).
- HTTP/2: `H2Client.rs` + `h2_client/{ClientSession, PendingConnect, Stream, dispatch, encode}.rs` — ClientSession owns TLS socket after
 ALPN "h2"; per-stream results reuse HTTP/1.1 picohttp response machinery (redirects, decompression shared).
- HTTP/3: `H3Client.rs` + `h3_client/{AltSvc, ClientContext, ClientSession, PendingConnect, Stream, callbacks, encode}.rs` — lsquic via
 `packages/bun-usockets/src/quic.c`; one ClientContext per HTTP-thread loop; Alt-Svc discovery.
- Types crate `bun_http_types` (`src/http_types/`): Method, MimeType (+ generated `mime_type_list*`), Encoding, ETag, FetchCacheMode
 FetchRedirect, FetchRequestMode, URLPath, h2.
- JSC glue crate `bun_http_jsc` (`src/http_jsc/`): `headers_jsc.rs`, `method_jsc.rs`, `fetch_enums_jsc.rs`.
- JS-facing fetch: see `bun-runtime-webcore-fetch-streams` (FetchTasklet).

## WebSocket client
- JS class `WebSocket` is C++ `src/jsc/bindings/webcore/WebSocket.cpp`; Rust wrapper `src/http_jsc/websocket_client/CppWebSocket.rs`.
- `http_jsc/websocket_client/WebSocketUpgradeClient.rs` (RFC 6455 HTTP upgrade handshake), `src/http_jsc/websocket_client.rs` (framing after
 handshake, TLS/non-TLS), `WebSocketDeflate.rs` (permessage-deflate), `WebSocketProxy.rs`, `WebSocketProxyTunnel.rs` (wss:// through HTTP
 CONNECT proxy).
- `ws` npm package replaced by `src/js/thirdparty/ws.js`.

## Bun.SQL (postgres / mysql / sqlite)
- JS front: `src/js/bun/sql.ts` (`SQL` class, pooling, transactions, tagged templates) + `src/js/internal/sql/{query, shared, errors
 postgres, mysql, sqlite}.ts` (`PostgresAdapter`, `MySQLAdapter`, `SQLiteAdapter`). `Bun.sql`/`Bun.postgres`/`Bun.SQL` exposed from
 BunObject.cpp (`defaultBunSQLObject`, `constructBunSQLObject`).
- Native binding: `$rust("postgres.rs", "createBinding")` -> `src/sql_jsc/postgres.rs::create_binding`; `$rust("mysql.rs", "createBinding")`
 -> `src/sql_jsc/mysql.rs`.
- Crates: `bun_sql` (`src/sql/`: protocol-only — `postgres/` (AnyPostgresError, CommandTag, PostgresProtocol, PostgresTypes, SSLMode
 SocketMonitor, protocol/ messages: Authentication, DataRow, RowDescription, Parse, Execute, SASL*, ReadyForQuery, NotificationResponse
 CopyData...), `mysql/` (AuthMethod, Capabilities, ConnectionState, MySQLTypes, protocol/), `shared/` (ColumnIdentifier, Data, QueryStatus
 SQLQueryResultMode...)) and `bun_sql_jsc` (`src/sql_jsc/`: `postgres/` PostgresSQLConnection, PostgresSQLQuery, PostgresSQLStatement
 SASL, AuthenticationState, DataCell; `mysql/` JSMySQLConnection, JSMySQLQuery, MySQLConnection, MySQLStatement, MySQLValue
 MySQLRequestQueue; `shared/` CachedStructure, QueryBindingIterator, SQLDataCell, datetime_text).
- JS classes from `src/runtime/api/sql.classes.ts`: `PostgresSQLConnection`, `PostgresSQLQuery`, `MySQLConnection`, `MySQLQuery` (rustPaths
 map to `bun_sql_jsc::...`).
- **bun:sqlite** is C++: `src/jsc/bindings/sqlite/JSSQLStatement.cpp` + JS `src/js/bun/sqlite.ts` (`$cpp("JSSQLStatement.cpp"
 "createJSSQLStatementConstructor")`). `node:sqlite` = `src/jsc/modules/NodeSqliteModule.h`. Bun.SQL's sqlite adapter wraps bun:sqlite.
- Tests: `test/js/sql/`, `test/js/bun/sqlite/`.

## Valkey / Redis (`Bun.redis`, `Bun.RedisClient`)
- RESP protocol crate `bun_valkey` (`src/valkey/lib.rs`, `valkey_protocol.rs`: RESP types, incremental `ReplyScanner`).
- JSC side `src/runtime/valkey_jsc/`: `valkey.rs` (`ValkeyClient` state machine, auto-flush, fail/reject paths; codegen target
 `RedisClient`), `js_valkey.rs` (`JSValkeyClient` host fns, SocketHandler, ctor), `js_valkey_functions.rs` (~200 commands
 get/set/hget/...), `ValkeyCommand.rs`, `protocol_jsc.rs`. Class `valkey.classes.ts` name `RedisClient`. Lazy props
 `BunObject_lazyPropCb_ValkeyClient` / `_valkey` (default client from `REDIS_URL`/`VALKEY_URL`).

## DNS
- Crate `bun_dns` (`src/dns/lib.rs`): addrinfo/getaddrinfo abstractions, sockaddr shim for Windows (`bun_windows_sys::ws2_32`), Wyhash-dedupe cache.
- `src/runtime/dns_jsc/`: `dns.rs` (Resolver, `Bun.dns`, node:dns backend; exports `JS2Rust___src_runtime_dns_jsc_dns_rs__Resolver_*`
 hand-written), `cares_jsc.rs` (c-ares reply -> JS; `src/cares_sys/`, vendor/cares), `dns_sd.rs` (macOS), `options_jsc.rs`.

## S3
- Signing crate `bun_s3_signing` (`src/s3_signing/`: `credentials.rs` SigV4 + `S3Credentials`, `acl.rs` ACL, `storage_class.rs`, `error.rs`).
- Client/JS: `src/runtime/webcore/S3Client.rs`, `S3File.rs`, `S3Stat.rs`, `webcore/s3/*` (multipart upload, list_objects, download_stream
 simple_request, xml_response). `Bun.s3`, `Bun.S3Client`, `s3://` URLs in fetch/Bun.file.

Related: `bun-runtime-webcore-fetch-streams`, `bun-runtime-server`, `bun-runtime-node-compat`.
