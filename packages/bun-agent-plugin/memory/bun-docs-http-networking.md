---
name: bun-docs-http-networking
description: "Cheat-sheet of Bun docs for Bun.serve (options, routes, Server methods, TLS, HTTP/2/3, errors, metrics), WebSockets, fetch extensions, DNS cache, TCP/UDP, Cookie/CookieMap, CSRF"
metadata:
 type: reference
---

Sources: docs/runtime/http/{server,routing,cookies,error-handling,metrics,tls,websockets}.mdx
docs/runtime/networking/{fetch,dns,tcp,udp}.mdx, docs/runtime/{cookies,csrf}.mdx, docs/guides/http/*, docs/guides/websocket/*.
Related: `bun-docs-map`, `bun-docs-runtime-apis-a-m`, `bun-docs-runtime-apis-n-z`
`bun-docs-bundler` (fullstack / HTML imports), `bun-docs-bunfig-env`.

## Bun.serve options + defaults
- `port`: default `$BUN_PORT` > `$PORT` > `$NODE_PORT` > 3000; CLI `bun --port=4002`.
 - `port: 0` = random; read `server.port` / `server.url`.
- `unix: "/tmp/x.sock"`; Linux abstract socket: prefix `"\0name"` (not on FS, auto-removed when last ref closes).
- `idleTimeout` (seconds): default **10**, max **255**, `0` disables.
 - Counts in-flight handlers that have not written bytes yet, and quiet streams (SSE): client sees a reset.
 - Per-request override: `server.timeout(req, s)`.
- `development`: ON by default; off with `NODE_ENV=production` or `development: false`.
 - The `--production` flag does NOT disable it (`bun run` ignores it).
- `routes` (Bun >= 1.2.3); `fetch(req, server)` = fallback for unmatched routes (required before 1.2.3).
- `error(err)` -> Response; `websocket` handlers; `tls` (object or array for SNI).
- `http2: true` (experimental): same port, routes and fetch.
 - With TLS: chosen per connection via ALPN `h2`. Without TLS: only prior-knowledge preface clients.
- `http3: true` (experimental): requires `tls`; listens TCP + UDP on same port; HTTP/1.1 responses carry `Alt-Svc`. Not with `unix`.
- `http1: false`: requires `http2` or `http3`.
 - Refuses HTTP/1.x: TLS ALPN without h2 fails handshake; no ALPN / no preface -> `505`.
 - Disables WebSockets (`server.upgrade` is HTTP/1.1-only).
- Not supported: WebSockets over HTTP/2, server push, response trailers (gRPC).
- `reusePort: true`: Linux only (SO_REUSEPORT + SO_REUSEADDR), ignored on Windows/macOS.
 - Cluster = spawn N `bun server.ts` processes on same port (guides/http/cluster); faster but more limited than `node:cluster`.
- Not in docs pages, only in @aphrody/bun-types `serve.d.ts`: `maxRequestBodySize` default 128 MB, `reusePort` default false, `ipv6Only` default false.
- `export default { fetch(req) {...} } satisfies Serve.Options<undefined>`: Bun auto-serves a default export having `fetch`.
 - Type param = WebSocket data type.
- HTML imports: `import app from "./index.html"` then `routes: { "/": app }`.
 - Dev (`bun --hot`): on-demand bundling + HMR. Prod: `bun build --target=bun` -> prebuilt manifest, no runtime bundling.
- `bun --hot`: reloads fetch handler without restarting the process; no browser reload; ignores non-imported files (.env, bunfig.toml, tsconfig.json).

## Routes syntax
- Values: handler `(req: BunRequest, server) => Response | Promise<Response>`; per-method object `{ GET, POST... }`;
 static `Response` (`Response.json`, `Response.redirect`); `Bun.file(...)`; HTML import; `{ dir: "./public" }` (path must end `/*`).
- Params `/users/:id` -> `req.params.id`, typed from string literal (or explicit `BunRequest<"/orgs/:orgId">`).
 - Percent-decoded incl. Unicode; invalid Unicode -> U+FFFD.
- Wildcard `/api/*`, global catch-all `/*`. Routing is case-sensitive.
- **Precedence**: 1 exact `/users/all` > 2 param `/users/:id` > 3 wildcard `/users/*` > 4 global `/*`; then `fetch` fallback.
- `BunRequest` extends Request: `params`, `readonly cookies: CookieMap`.
- Static Response routes: zero-alloc dispatch, >= 15% faster, cached for server lifetime -> change via `server.reload`.
- Buffered: `new Response(await Bun.file(p).bytes)` read at startup.
 - ETag + If-None-Match -> 304; missing file = startup error; full content in RAM.
- File route: `new Response(Bun.file(p))` read per request.
 - 404 if missing; Last-Modified / If-Modified-Since -> 304; Range -> 206 + Content-Range.
 - If-Range honored only for strong ETag or exact Last-Modified; streamed with backpressure; sendfile(2) when possible.
 - `file.slice(start, end)` auto-sets Content-Range / Content-Length.
- Dir routes: URL tail percent-decoded once, opened relative to `dir`.
 - Non-canonical paths (`.`, `..`, empty segment, `%2F`, needless `%XX`) -> 404; Linux uses `openat2(RESOLVE_IN_ROOT)`.
 - Content-Type from extension; Last-Modified + weak ETag `W/"<size>-<mtime>"`; 304 on If-Modified-Since / If-None-Match.
 - Range supported; weak ETag never matches If-Range -> full file.
 - Directory without trailing `/` -> 301; with `/` -> `index.html`; missing -> 404.
 - `statCache: false` disables Last-Modified cache (~20 KB/route).
 - Gotcha: macOS/Windows FS case-insensitive -> keep protected content outside `dir`, don't gate with overlapping routes.
- Response body may be async generator fn, ReadableStream, async iterable, Node `Readable`.
 - Client disconnect -> generator `finally` runs / stream `cancel` called.

## Server object
- `stop(force?) -> Promise<void>`: graceful by default (in-flight requests and WS finish, idle keep-alive closed now); `true` kills all.
- `closeIdleConnections -> number` closed (Node's returns nothing); server keeps accepting.
- `reload(opts)`: only `fetch`, `error`, `routes`, `websocket` are updatable.
- `fetch(req | string)`: request your own server (tests, internal routing).
- `upgrade(req, { headers?, data? }) -> boolean`; on success return `undefined` from fetch; headers go on the 101.
- `publish(topic, data, compress?)` -> bytes sent, `0` dropped, `-1` backpressure. `subscriberCount(topic)`.
- `requestIP(req) -> { address, port } | null` (null for closed requests and unix sockets).
- `timeout(req, seconds)`: 0 = none; over HTTP/2 timeout is per connection, most permissive open request wins.
- `ref` / `unref`; readonly `pendingRequests`, `pendingWebSockets`, `url`, `port`, `hostname`, `development`, `id`.
- `Server extends Disposable`.

## Error handling / metrics
- Dev mode + throw + no `error` response -> built-in page with message, stack, source, file paths (leaked to requester).
- Prod (NODE_ENV=production or development:false) -> plain 500.
- `error(error)` returning a Response replaces the dev page.
- Metrics: `server.pendingRequests`, `server.pendingWebSockets`, `server.subscriberCount(topic)`.

## TLS (Bun.serve / Bun.listen, BoringSSL)
- `tls: { key, cert }` = CONTENTS, not paths: string | BunFile | TypedArray | Buffer | array of those.
 - In an array only the LAST key/cert pair is used.
- `passphrase`; `dhParamsFile` (path); `serverName`; `lowMemoryMode`; `secureOptions`.
- `ca` replaces Mozilla CA list; server uses it to verify client certs -> also set `requestCert: true`.
- SNI multi-cert: `tls: [{ key, cert, serverName: "a.com" }, { key, cert, serverName: "b.com" }]`.

## WebSockets (server, uWebSockets-based)
- Handlers declared once per server: `message(ws, msg)` (required), `open`, `close(ws, code, reason)`, `drain`, `error`, `ping(ws, buf)`, `pong`.
- Defaults: `maxPayloadLength` 16 MB (bigger -> close), `idleTimeout` 120 s, `backpressureLimit` 16 MB
 `closeOnBackpressureLimit` false, `sendPings` true, `publishToSelf` false.
- `perMessageDeflate: true | { compress, decompress }`.
 - Compressor: `"disable" | "shared" | "dedicated" | "3KB" | "4KB" | ... | "256KB"`.
 - Per message `ws.send(msg, true)`; sent uncompressed unless perMessageDeflate enabled.
- Typing `ws.data`: `websocket: { data: {} as MyData... }` (old `Bun.serve<MyData>` pattern removed).
 - Set via `server.upgrade(req, { data })`; parse cookies with `new Bun.CookieMap(req.headers.get("cookie"))`.
- `ServerWebSocket.send(string | ArrayBuffer | TypedArray | DataView | Blob, compress?)`:
 - returns `-1` enqueued with backpressure, `0` dropped, `n` bytes sent.
- Other: `close(code?, reason?)`, `subscribe` / `unsubscribe` / `isSubscribed(topic)`, `subscriptions`, `cork(cb)`, `data`, `readyState`, `remoteAddress`.
- `ws.publish(topic, msg)` excludes the sender (unless `publishToSelf`); `server.publish` reaches all subscribers.
- Client: `new WebSocket(url, protocols?)`; Bun-only `new WebSocket(url, { headers })`.
 - Bun-only `pause` / `resume` (TCP backpressure, return boolean) + `isPaused`; same as `ws` package methods.
 - Messages decoded before `pause` may still be delivered.

## fetch extensions
- `proxy`: string | URL | `{ url, headers?, respectNoProxy? }` | `false` (direct, ignore env).
 - Proxy headers go in CONNECT (https target) or proxy request (http target); `Proxy-Authorization` overrides URL creds.
 - Non-2xx CONNECT -> `ERR_PROXY_TUNNEL` error with `status`, `statusText`, `headers`.
- Env `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` (any case), re-read on each call.
 - ALL_PROXY = fallback for http and https (Node ignores it); non-HTTP proxy like `socks5://` ignored.
 - `no_proxy` (else `NO_PROXY`), comma/space separated: `*`, `example.com` / `.example.com` / `*.example.com` (+ subdomains), IPs, CIDR, `host:port`.
 - NO_PROXY also applies to explicit `proxy` unless `respectNoProxy: false`.
 - `unix` requests ignore proxy env; `proxy` + `unix` together throws.
- `unix: "/path.sock"` (https:// URL also works).
- `tls: { key, cert, ca, rejectUnauthorized, checkServerIdentity, serverName }`.
- `checkServerIdentity(hostname, cert)`: runs after chain verification, replaces Bun's hostname check.
 - With `rejectUnauthorized: false` still called, result ignored.
 - Falsy/`undefined` approves; Error / throw / object rejects; Promise or `true` -> `ERR_INVALID_RETURN_VALUE` (async fn never approves).
 - Non-function value -> `ERR_INVALID_ARG_TYPE`; forces a dedicated connection (put it on a FetchSession to reuse).
- `decompress` (default true: gzip, deflate, br, zstd); `keepalive: false` (no reuse, like `Connection: close`).
- `verbose: true | "curl"` prints `[fetch] >` / `[fetch] <` headers; `session`; `s3: { accessKeyId, secretAccessKey, region }`.
- Schemes: `s3://bucket/key` (env creds; bodies only PUT/POST; streams -> parallel multipart upload).
 - `file://` host must be empty or `localhost` else `ERR_INVALID_FILE_URL_HOST`; Windows paths normalized.
 - `data:` and `blob:` (from `URL.createObjectURL`).
- URL creds `user:pass@` -> Basic Authorization unless one is set (Node rejects such URLs).
- Errors: body on GET/HEAD throws; connect failure -> TypeError with `code` (ECONNREFUSED, ECONNRESET, ETIMEDOUT, ENOTFOUND), message starts with code.
- Auto Content-Type: Blob `type`, FormData multipart boundary. Stream request bodies not buffered; Content-Length only if size known.
- `fetch.preconnect(url)` (DNS + TCP + TLS; useless right before fetch); `bun --fetch-preconnect <url> script.ts` (not on Windows).
- Max **256** concurrent fetches, extra queued; raise with `BUN_CONFIG_MAX_HTTP_REQUESTS` (max 65535).
- Pooling on by default. sendfile upload only if file > 32 KB, no proxy/compress, plain HTTP, not Windows, macOS regular files.
- `Bun.write("out.txt", response)` writes body to disk.
- `new Bun.FetchSession({ tls, proxy, keepAlive, unix })`: own keep-alive pool, never shared with other sessions or plain fetch.
 - `keepAlive: false | { idleTimeout (s, default 300), maxIdleSockets }`; limits ignore HTTP/3.
 - `session.fetch` is bound (no `preconnect`); or `fetch(url, { session })`; `session.close` closes idle connections.
 - Request options override session's; request `tls` replaces session `tls` wholesale.
 - idleTimeout rounded up (4 s steps to 4 min, then minutes), max 238 min.
- Pin to a resolved IP: IP in URL + `headers: { Host }` + `tls.serverName` + `proxy: false` + `redirect: "manual"`.
 - No multi-address fallback; `protocol: "http3"` rejects serverName; up to 60 serverName contexts cached.

## DNS
- `import { dns } from "bun"`: `dns.prefetch(host, port?)` (experimental).
- `dns.getCacheStats` -> `{ cacheHitsCompleted, cacheHitsInflight, cacheMisses, size, errors, totalCount }` (experimental).
- `dns.lookup(host, { backend })`:
 - `"c-ares"` default on Linux (reads /etc/resolv.conf, no NSS / systemd-resolved);
 - `"system"` default on macOS/Windows/Android; `"getaddrinfo"` (alias `"libc"`).
 - `node:dns.lookup` always `"system"`; `node:dns.resolve*` use c-ares.
- Cache: 256 entries, 30 s TTL, concurrent lookups deduped, entry evicted on connect failure.
 - Used by bun install, fetch, node:http client, Bun.connect, node:net, node:tls.
 - TTL env: `BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS`.

## TCP (Bun.listen / Bun.connect)
- `Bun.listen<Data>({ hostname, port, socket: { open, data, drain, close(socket, error), error }, tls })`.
 - One handler set shared by all sockets; per-socket `socket.data` assigned in `open`.
 - Returns TCPSocketListener: `stop(closeActive?)`, `unref`, `reload({ socket })`.
- `await Bun.connect({ hostname, port, socket: {...}, tls: true })`; extra handlers `connectError`, `end`, `timeout`; `socket.reload(handlers)`.
- No write buffering: batch writes, e.g. `ArrayBufferSink` `start({ stream: true, highWaterMark })`, `flush`, re-queue unwritten tail.
 - `write` returns bytes written; no corking yet, manage backpressure with `drain`.

## UDP (Bun.udpSocket)
- `await Bun.udpSocket({ port?, socket: { data(sock, buf, port, addr), drain }, connect?: { port, hostname } })`; `socket.port`.
- `send(data, port, ip)` -> `false` on backpressure; IP only, NO DNS. Connected socket: `send(data)`.
- `sendMany([data, port, ip...])`, connected `sendMany([d1, d2])` -> number of packets sent.
- `setBroadcast`, `setTTL`, `addMembership(group, iface?)`, `dropMembership`, `setMulticastTTL`, `setMulticastLoopback`
 `setMulticastInterface`, `addSourceSpecificMembership(src, group)` / `dropSourceSpecificMembership`.

## Cookies
- `new Bun.CookieMap(string | Record<string,string> | [name, value][])`:
 - `get(name) -> string | null`, `has`, `size`, iterators (`entries/keys/values/forEach`), `toJSON`.
 - `set(name, value, opts?)` / `set(CookieInit)` / `set(Cookie)`; defaults `path: "/"`, `sameSite: "lax"`.
 - `delete(name)` / `delete({ name, domain, path })` / `delete(name, opts)` -> Set-Cookie empty value + past Expires (domain/path must match).
 - `toSetCookieHeaders` for servers other than Bun.serve.
- In `routes`, `req.cookies` mutations are auto-applied to the response.
- `new Bun.Cookie(name, value, opts?)` / `(cookieString)` / `(CookieInit)`; `Bun.Cookie.parse(str)`, `Bun.Cookie.from(name, value, opts)`.
 - Props: name, value, domain (null), path ("/"), expires, secure, sameSite, partitioned (CHIPS), maxAge, httpOnly.
 - `isExpired`: maxAge wins over expires (RFC 6265); maxAge <= 0 expired; no expiry = session cookie.
 - `serialize` / `toString` -> Set-Cookie value; `toJSON` -> CookieInit. `path: ""` lets the browser pick.

## CSRF (Bun.CSRF)
- `generate(secret?, { expiresIn, encoding, algorithm, sessionId })` -> HMAC-signed token (nonce + timestamp + expiresIn).
 - `expiresIn` 86400000 ms; `encoding` `"base64url"` (or `"base64"`, `"hex"`).
 - `algorithm` `"sha256"` (or sha384, sha512, sha512-256, blake2b256, blake2b512).
- `verify(token, { secret, maxAge = 86400000, encoding, algorithm, sessionId }) -> boolean`; encoding/algorithm must match.
- Always pass the same `sessionId` to both, else tokens replay across users; token made without sessionId fails if one is supplied.
- No secret -> random per-thread secret: no verification across workers/servers/restarts.

## Gotchas
- Default 10 s idleTimeout kills slow handlers and SSE: `server.timeout(req, 0)`.
- Dev error page leaks source unless NODE_ENV=production or development:false.
- TLS key/cert are contents (use `Bun.file`), only last array pair used.
- `server.upgrade` HTTP/1.1 only; `ws.publish` skips sender; `ws.send(.., true)` needs perMessageDeflate.
- guides/http/proxy says HTTP_PROXY only for http:// and HTTPS_PROXY only for https://; fetch.mdx adds ALL_PROXY fallback.
- UDP `send` never resolves DNS; TCP writes are unbuffered.
