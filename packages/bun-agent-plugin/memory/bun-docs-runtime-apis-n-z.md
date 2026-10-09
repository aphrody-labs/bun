---
name: bun-docs-runtime-apis-n-z
description: "Cheat-sheet of docs/runtime N-Z (node-api, nodejs-compat, plugins, redis, repl, s3, secrets, semver, shell, sql, sqlite, streams, toml, transpiler, typescript, utils, watch-mode, web-apis, webview, workers, xml, yaml) + docs/typescript*.mdx"
metadata:
 type: reference
---

Source: `<bun>\docs\runtime\*.mdx` + `docs/typescript.mdx`, `docs/typescript-6.mdx`. Related: `bun-docs-runtime-apis-a-m`, `bun-docs-http-networking`, `bun-docs-bundler`, `bun-docs-bunfig-env`, `bun-docs-map`.

## Node-API (node-api.mdx)
- `require("./x.node")` or `process.dlopen({exports:{}}, "./x.node")`. Implemented from scratch; most addons work.

## Node.js compat (nodejs-compat.mdx) — targets Node v26; "works in Node, not Bun" = bug
- Green w/ caveats:
 - `assert` (legacy deepEqual = Bun.deepEquals), `buffer` (max 4 GiB, `MAX_LENGTH=2**32`)
 - `console` (writes fds directly: patching `process.stdout.write` does NOT capture; `trace`→stdout, `time*`→stderr), `dgram` (`addMembership` needs `bind` first), `dns` (no `resolveTlsa`)
 - `http` (`http.Server` !extends `net.Server`; `listen(handle)`/fd/ipv6Only/signal ignored), `os` (`userInfo` from env USER/SHELL/HOME), `path` (`matchesGlob` = Bun.Glob semantics)
 - `tty` (streams extend fs streams), `vm` (full incl. SourceTextModule/SyntheticModule w/o flag), `http2` (94%), `net` (`new net.Socket({fd})` write-only)
 - `sqlite` (`backup` sync; macOS uses system lib → `Database.setCustomSQLite(path)`), `trace_events`, `quic` (ExperimentalWarning).
- Yellow:
 - `async_hooks` (ALS + AsyncResource only; createHook stubs; ALS not propagated into MessagePort/BroadcastChannel/Worker), `child_process` (`serialization:"advanced"` Bun↔Bun only)
 - `cluster` (HTTP load-balance Linux-only via SO_REUSEPORT), `crypto` (BoringSSL: no ed448/x448/rsa-pss/dsa/secp256k1/CCM/OCB/XTS/chacha20-poly1305 cipher)
 - `domain`, `module` (no registerHooks/findPackageJSON/stripTypeScriptTypes; `module.register` no-op → use Bun.plugin), `perf_hooks` (ELU zeros), `tls` (no PSK/OCSP/ticketKeys)
 - `v8` (JSC wire format; use `bun:jsc`), `wasi` (`bun ./prog.wasm` runs WASI), `worker_threads` (no resourceLimits), `inspector`, `repl` (`bun --interactive`), `node:test` (use `bun:test`)
 - `https` server sockets lack getPeerCertificate.
- Red: `node:sea` (use `bun build --compile`), `Storage`/localStorage, `QuotaExceededError`.
- Globals gotchas: WebSocket `binaryType` default `"nodebuffer"`;
 - WASM Memory64 off unless `BUN_JSC_useWasmMemory64=1`
 - streams not transferable
 - structuredClone transfers only ArrayBuffer/MessagePort
 - `fetch` ignores `integrity`
 - `Request` lacks keepalive/duplex
 - `File.constructor` reports Blob
 - `navigator` only userAgent/platform/hardwareConcurrency
 - `process.binding` partial
 - `process.title` set no-op mac/linux.

## Plugins (plugins.mdx) — `BunPlugin = { name, setup(build) }`; `Bun.build({plugins})` or runtime `Bun.plugin(...)`
- `onStart(cb)` (awaited before continuing), `onResolve({filter: RegExp, namespace?}, ({path, importer}) => {path, namespace?}|void)`, `onLoad({filter, namespace?}, ({path, namespace, loader, defer}) => {contents?, loader?, exports?})`, native `onBeforeParse({filter, namespace?}, {napiModule, symbol, external?})`.
- Loaders: js jsx ts tsx json jsonc toml yaml file napi wasm text css html. Default namespace `"file"`; others `bun:`, `node:`; module id = `ns:path`.
- Callbacks cannot mutate `build.config` (do it in `setup`). `defer` once per onLoad; resolves after all other modules loaded.
- Runtime onResolve: new path w/o namespace resolved from importer (no re-run of onResolve); falls back to raw path if an onLoad matches. Bare name claimed by plugin is never auto-installed.
- Native plugin (Rust): `cargo add bun-native-plugin`; `define_bun_plugin!("name")`, `#[bun] fn f(handle: &mut OnBeforeParse)`; must be thread-safe (any thread).

## Redis (redis.mdx) — `import { redis, RedisClient } from "bun"`; server ≥ 7.2, RESP3, written in Rust
- Env: `REDIS_URL` > `VALKEY_URL` > `redi<localhost>:6379`. Lazy connect on first command; `connect`, `close`, `duplicate`.
- URLs: `redi<user>:pw@h:6379/db`, `rediss://`, `redis+tls://`, `redis+uni<sock>`, `redis+tls+uni<sock>`.
- Options (defaults): `connectionTimeout` 10000ms, `idleTimeout` 0 (from last server data; no auto-reconnect after it fires), `autoReconnect` true, `maxRetries` 20, `enableOfflineQueue` true, `enableAutoPipelining` true, `tls` false|true|{ca,cert,key,rejectUnauthorized}.
- Backoff 50ms doubling, cap 2000ms. Props `connected`, `bufferedAmount`; `onconnect`, `onclose(err)`.
- Methods: get/getBuffer/set/del/exists(bool)/expire/ttl/incr/decr/hmset(key,[k,v...])/hmget/hget/hincrby/hincrbyfloat/sadd/srem/sismember(bool)/smembers/srandmember/spop/publish; `send(cmd, string[])` for anything else (MULTI/EXEC need raw).
- Pub/Sub (experimental, 1.2.23+): `subscribe(ch, (msg, ch)=>{})`, `unsubscribe([ch[, listener]])`; subscribed client only allows (p)subscribe/(p)unsubscribe/pubsub/ping → use `duplicate`.
- No auto-pipelining for AUTH INFO QUIT EXEC MULTI WATCH SCRIPT SELECT CLUSTER DISCARD UNWATCH PIPELINE (P)(UN)SUBSCRIBE. RESP3 big number → BigInt; map → object.
- Errors: `ERR_REDIS_CONNECTION_CLOSED|AUTHENTICATION_FAILED|INVALID_RESPONSE|SERVER_ERROR`. Unsupported: Sentinel, Cluster.

## REPL (repl.mdx) — `bun repl`
- TS/JSX, top-level await, highlighting, history `~/.bun_repl_history` (1000 entries), `_` last result, `_error` last error, const/let redeclarable, import+require mix.
- Commands: .help .exit .clear .copy [expr] .load file .save file .editor (Ctrl+D eval) .break .history. Emacs keys; Ctrl+C twice exits.
- Non-interactive: `bun repl -e "..."` / `-p "..."` (prints; `{a:1}` = object literal); exits after loop drains, code 1 on error.

## S3 (s3.mdx) — `import { s3, S3Client, write } from "bun"`; `Bun.s3` == `new S3Client` from env
- `client.file(key, opts?)` → lazy `S3File extends Blob`: text/json/bytes/arrayBuffer/stream/slice(start,end) (HTTP Range)/exists/stat/delete=unlink/presign/write(data,{type,contentEncoding,contentDisposition,acl})/writer({retry,queueSize,partSize,type}) (write/flush/end;
 - auto multipart). `size` is NaN (deprecated → `stat`).
- Client methods: write/delete/exists/presign/list/size/stat; statics `S3Client.write|presign|list|exists|size|stat|delete|unlink(key..., credentials)`.
- `presign(key,{expiresIn (s, default 86400), method GET|PUT|DELETE|HEAD|POST (default GET), acl, type, contentDisposition})` — sync, no network.
- `list({prefix, maxKeys (≤1000), startAfter, fetchOwner}, creds)` → `{contents, isTruncated}`.
- Options: accessKeyId, secretAccessKey, sessionToken, bucket, region (default us-east-1), endpoint, acl, virtualHostedStyle. Endpoints: R2 `https://<acct>.r2.cloudflarestorage.com`, GCS `http<storage.googleapis.com>`, MinIO, DO Spaces, Supabase `.../storage/v1/s3`.
- Env: `S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY|S3_REGION|S3_ENDPOINT|S3_BUCKET|S3_SESSION_TOKEN`, fallback `AWS_*` same suffix; read at init (not via process.env).env ok. Honors HTTP(S)_PROXY/ALL_PROXY/NO_PROXY.
- `new Response(s3file)` → 302 to presigned URL. `fetch("s3://b/k", {s3:{...}})`, `Bun.file("s3://b/k")`.
- Errors: `ERR_S3_MISSING_CREDENTIALS|INVALID_METHOD|INVALID_PATH|INVALID_ENDPOINT|INVALID_SIGNATURE|INVALID_SESSION_TOKEN`; service errors are `S3Error`. UTF-16 BOM honored; UTF-32 unsupported.

## Secrets (secrets.mdx, experimental) — OS keychain: macOS Keychain, Linux libsecret, Windows Credential Manager
- `secrets.get({service,name}) → string|null`, `set({service,name,value,persist?})`, `delete(...) → boolean`; positional forms `get(service,name)`, `set(service,name,value)`. Async on threadpool.
- `persist: "enterprise"` (default, CRED_PERSIST_ENTERPRISE, roams) | `"local"` (Windows only). Value max ~2048-4096 bytes; keep service/name < 256 chars. Slow; dev tools only.

## Semver (semver.mdx) — `Bun.semver`, ~20x node-semver
- `satisfies(version, range): boolean` (false if invalid/non-ASCII; unparseable range parts ignored; nothing parseable = `*`). `order(a,b): -1|0|1` (usable as sort comparator).

## Shell (shell.mdx) — `import { $ } from "bun"`; Rust interpreter, no /bin/sh, cross-platform
- `await $\`cmd\`` → `{stdout, stderr: Buffer, exitCode}`; `.quiet .text .json .lines (async iter) .blob .nothrow .env(obj) .cwd(dir)`. Globals: `$.nothrow`/`$.throws(bool)`, `$.env(obj|undefined→reset)`, `$.cwd(dir)`, `$.braces(str)→string[]`, `$.escape(str)`.
- Non-zero exit throws `ShellError` (`exitCode`, `stdout`, `stderr`). Interpolations are single literal args (injection-safe); `{ raw: "..." }` bypasses escaping. Still unsafe: `bash -c`, argument injection (`--upload-pack=`).
- Redirects `< > 1> 2> &> >> 2>> &>> 1>&2 2>&1`; to/from Buffer/TypedArray/ArrayBuffer/SharedArrayBuffer/`Bun.file`; `Response` as stdin. Pipes, `$(...)` (backtick substitution NOT supported), `FOO=x cmd`, globs `** * {a,b}`.
- Builtins: cd ls(-l) rm echo pwd bun cat touch mkdir which mv exit true false yes seq dirname basename. `bun ./script.sh` runs .sh via Bun Shell (Windows too).

## SQL (sql.mdx) — `import { sql, SQL } from "bun"`; Postgres (default) / MySQL 5.7+,8 / SQLite; API inspired by postgres.js
- Adapter detection: `mysql://`/`mysql2://` → MySQL; `:memory:`, `sqlite://`, `sqlite:`, `file://`, `file:` → SQLite; else Postgres. Bare filename needs `{adapter:"sqlite"}`. `new SQL(url, opts)` or `new SQL({adapter...})`.
- Tagged template = parameterized/prepared. Helpers: `sql(obj)` insert/update columns, `sql(obj, "c1","c2")` pick, `sql(arrayOfObjs)` bulk insert, `sql([1,2,3])` / `sql(objs,"id")` for IN, `sql("schema.table")` identifier, `sql\`\`` empty fragment, `sql.array([...])` (PG only; no NULL/multi-dim).
- Result modes: default array of objects (dup column: last wins);
 - `.values` arrays
 - `.raw` arrays of Buffer. `.simple` multi-statement, no params. `sql.file(path, params?)`, `sql.unsafe(str, params?)` (multi-cmd only w/o params
 - SQLite named `{":id":1}` or bare keys with `strict:true`). Queries lazy: run on await or `.execute`
 - `.cancel`.
- Pool opts: `max` (default 10), `idleTimeout` (s), `maxLifetime` (s, 0=forever), `connectionTimeout` (s), `prepare` (default true;
 - false = unnamed stmts, for PgBouncer txn mode), `bigint` (false → int8 as string), `tls`/`ssl`, `onconnect`, `onclose(client, err)`, `password` may be (async) fn. Connections opened lazily. `sql.close`, `close({timeout: s})` (0 = now).
- PG fields: url/hostname/port/database/username/password;
 - `tls: true | {ca, key, cert, rejectUnauthorized, checkServerIdentity} | Bun.file(ca)` (CA ⇒ verify-full). `ssl`/`?sslmode=` disable (default)|prefer|require|verify-ca|verify-full. Auth SCRAM-SHA-256, MD5, cleartext (no GSSAPI, no SCRAM-PLUS, no COPY).
- MySQL: `socket` or `?socket=`, auth native/caching_sha2/sha256;
 - plain-TCP caching_sha2 needs TLS or `allowPublicKeyRetrieval: true` else `ERR_MYSQL_PUBLIC_KEY_RETRIEVAL_NOT_ALLOWED`
 - utf8mb4
 - session `time_zone='+00:00'` forced
 - no RETURNING → `result.lastInsertRowid`, `affectedRows`
 - DECIMAL→string, BIGINT >32-bit → string/BigInt, DATETIME/TIMESTAMP read as UTC, JSON parsed, BIT(1)→bool, BLOB→Buffer
 - error codes `ER_DUP_ENTRY` etc. No LOAD DATA INFILE.
- SQLite: `filename`, `readonly`, `create`, `readwrite`, `strict`, `safeIntegers`; `?mode=ro|rw|rwc` (default rwc). Single connection (no pool), sync under Promise API; PG env vars ignored.
- Transactions: `sql.begin([opts,] async tx => {...})` (reserves conn; auto COMMIT/ROLLBACK; return array of queries to pipeline), `tx.savepoint(async sp => ...)`, 2PC `beginDistributed(name, fn)` / `commitDistributed` / `rollbackDistributed`.
- `sql.reserve({signal?})` → `release` or `using`. PG LISTEN/NOTIFY: `await sql.listen(ch, cb, onSubscribe?)` → `{unlisten}` (async disposable;
 - one shared dedicated conn, reconnect backoff 250ms→32s, keeps process alive), `sql.notify(ch, payload?)` (in tx: delivered on COMMIT)
 - channel ≤63 bytes, payload ≤8000 B
 - MySQL/SQLite reject.
- Env PG: `POSTGRES_URL`, `DATABASE_URL`, `PGURL`, `PG_URL`, `TLS_POSTGRES_DATABASE_URL`, `TLS_DATABASE_URL`;
 - params `PGHOST`(localhost) `PGPORT`(5432) `PGUSERNAME`→`PGUSER`/`USER`/`USERNAME` (postgres) `PGPASSWORD` `PGDATABASE`(=user) `PGSSLMODE`(disable). MySQL: `MYSQL_URL` > `DATABASE_URL`
 - `MYSQL_HOST`(localhost) `MYSQL_PORT`(3306) `MYSQL_USER`(root) `MYSQL_PASSWORD` `MYSQL_DATABASE`(mysql) `TLS_MYSQL_DATABASE_URL`. SQLite via `DATABASE_URL`.
- CLI: `bun --sql-preconnect index.js` (PG connect at startup; failure non-fatal).
- Errors: `SQL.SQLError` base, `SQL.PostgresError` (code/detail/hint), `SQL.SQLiteError` (code/errno/byteOffset). PG codes `ERR_POSTGRES_*`: CONNECTION_CLOSED/FAILED (retried until connectionTimeout)/REFUSED (no retry)/TIMEOUT, IDLE_TIMEOUT, LIFETIME_TIMEOUT, TLS_*, SYNTAX_ERROR, SERVER_ERROR, QUERY_CANCELLED, NOT_TAGGED_CALL, UNSAFE_TRANSACTION, COMMIT_ROLLED_BACK... Decode errors reject one query only;
 - write may already be stored.
- Roadmap: no column name/type transforms.

## bun:sqlite (sqlite.mdx) — sync, better-sqlite3-style
- `new Database(file?, {readonly, create, readwrite, safeIntegers, strict} | flags)`; `:memory:`/""/none = memory. `import db from "./x.sqlite" with {type:"sqlite"}`. `Database.open`, `Database.deserialize(u8)`, `db.serialize`.
- `db.query(sql)` cached Statement (LRU `Database.MAX_QUERY_CACHE_SIZE`=20); `db.prepare(sql)` uncached; `db.run/exec(sql, params)` → `{lastInsertRowid, changes}` (multi-statement ok).
- Statement: `all get(→null) run values iterate/for-of as(Class) finalize toString` + `columnNames columnTypes declaredTypes paramsCount native`. `.as(Class)`: no constructor call, prototype only.
- Params `?1`, `$x`, `:x`, `@x`; default keys need prefix and missing params don't throw; `strict:true` = bare keys + throw on missing.
- `safeIntegers:true` → bigint out + >64-bit bigint input throws; default rounds >2^53.
- `db.transaction(fn)` → callable + `.deferred/.immediate/.exclusive`; nested = savepoint; throw → rollback.
- `close(false)` default (prepared stmts live until finalized), `close(true)` finalize all + throw; `using` calls close(true).
- WAL: `PRAGMA journal_mode = WAL`; macOS system SQLite persists -wal/-shm → `db.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0)` + `PRAGMA wal_checkpoint(TRUNCATE)`. `loadExtension(name)`; macOS needs `Database.setCustomSQLite(dylib)` first (no-op elsewhere; workers may repeat same path).
- Types: string TEXT, number INTEGER/DECIMAL, boolean 1/0, Uint8Array/Buffer BLOB, bigint INTEGER, null NULL.

## Streams (streams.mdx)
- Web ReadableStream/WritableStream + `node:stream`. `for await` over streams.
- Direct stream: `new ReadableStream({type:"direct", pull(controller){controller.write(x);
 - controller.close}}, {highWaterMark})` — no queue
 - `write` returns bytes | Promise when full | 0 if dest gone
 - `flush(true)`
 - `close(err)` errors. Whole-body consumers call `pull` once (returned promise keeps it open)
 - readers call it as demand. JS-read HWM default 64 KiB.
- Async generators / `{[Symbol.asyncIterator]}` as Response/Request body; return value ignored; `yield` returns direct controller.
- `Bun.ArrayBufferSink`: `start({asUint8Array, highWaterMark, stream})`, `write`, `flush`, `end`.

## TOML (toml.mdx) — TOML v1.1.0, passes toml-test
- `Bun.TOML.parse(str)` (SyntaxError on invalid; ints beyond ±(2^53-1) throw; datetimes → `Temporal.Instant|PlainDateTime|PlainDate|PlainTime`). `Bun.TOML.stringify(obj)` (top-level object; null/BigInt/cycles throw; Date → UTC offset datetime).
- `import cfg, { table } from "./x.toml"`, `require`, `with {type:"toml"}`; `--hot` reload; bundler inlines at build.

## Transpiler (transpiler.mdx) — `new Bun.Transpiler({loader, target: browser|bun|node, define, tsconfig, macro, exports:{eliminate,replace}, trimUnusedImports(false), minifyWhitespace, inline(false)})`
- `transformSync(code, loader?)` (same thread;
 - preferred), `transform` (threadpool, `floor(cpus*0.8)` threads), `scan(code)` → `{exports, imports}`, `scanImports(code)` (faster, less exact). Type-only imports ignored. Kinds: import-statement, require-call, require-resolve, dynamic-import, import-rule, url-token, internal, entry-point-build/run.

## TypeScript (runtime/typescript.mdx, typescript.mdx, typescript-6.mdx)
- `bun add -d @aphrody/bun-types`. Recommended tsconfig (generated by `bun init`): lib/target ESNext, module Preserve, moduleDetection force, jsx react-jsx, allowJs, `types:["bun"]`, moduleResolution bundler, allowImportingTsExtensions, verbatimModuleSyntax, noEmit, strict, skipLibCheck, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, noImplicitOverride.
- Bun never type-checks on run → `bun check`. TS 6/7: `types` defaults to `[]` → must list `"bun"` (fixes "Cannot find name Bun"); `bun check` behaves like TS 7.

## Utils (utils.mdx)
- `Bun.version`, `Bun.revision`, `Bun.env` (= process.env), `Bun.main` (`import.meta.path === Bun.main`), `Bun.isMainThread`.
- `sleep(ms|Date)`, `sleepSync(ms)`, `which(bin, {PATH, cwd})→string|null`, `randomUUIDv7(encoding? hex|base64|base64url|buffer, timestamp?)` (monotonic, thread-safe counter), `peek(p)`/`peek.status(p)`, `openInEditor(path, {editor, line, column})` ($VISUAL/$EDITOR or bunfig `[debug] editor`), `deepEquals(a,b,strict?)`, `escapeHTML`, `stringWidth(s,{countAnsiEscapeCodes=false, ambiguousIsNarrow=true})`, `stripANSI`, `wrapAnsi(s, cols, {hard=false, wordWrap=true, trim=true, ambiguousIsNarrow=true})`, `fileURLToPath`, `pathToFileURL`, `nanoseconds`, `resolveSync(spec, root)`, `inspect(v)` / `inspect.custom` / `inspect.table(data, props?, {colors})`.
- Compression: `gzipSync/gunzipSync/deflateSync/inflateSync(buf, {level -1..9 (6), memLevel 1..9 (8), windowBits, strategy})`; `zstdCompress(Sync)(buf,{level 1-22, default 3})`, `zstdDecompress(Sync)`.
- `readableStreamTo{ArrayBuffer,Bytes,Blob,JSON,Text,Array,FormData(stream, boundary?)}`. `bun:jsc`: `serialize/deserialize` (structured clone), `estimateShallowMemoryUsageOf`.

## Watch mode (watch-mode.mdx)
- `bun --watch file` / `bun --watch test` / `bun build --watch`: hard restart, same args/env; native kqueue/inotify. `--check` type-checks before restart. `--no-clear-screen`. `--watch-kill-signal SIGINT` (default SIGTERM).
- `bun --hot file`: soft reload, `globalThis` persists, `Bun.serve` handler swapped without restart; excludes node_modules; resets require cache + ESM registry, sync GC, full re-transpile. `import.meta.hot` planned (not for runtime).

## Web APIs (web-apis.mdx)
- fetch/Request/Response/Headers/AbortController, URL/URLSearchParams, Worker/MessageChannel/BroadcastChannel/structuredClone, Streams + queuing strategies, Blob, WebSocket, TextEncoder/Decoder, atob/btoa, `Uint8Array.toBase64/fromBase64`, crypto/SubtleCrypto, console/performance, queueMicrotask, reportError, alert/confirm/prompt (CLI), ShadowRealm, Event/EventTarget/ErrorEvent/CloseEvent/MessageEvent.

## WebView (webview.mdx, experimental) — `new Bun.WebView({width=800, height=600 (1-16384), url, headless=true (false throws), backend, console, dataStore})`
- Backends: `"webkit"` (macOS default, WKWebView host subprocess) / `"chrome"` (default elsewhere;
 - CDP
 - main thread only, throws in Worker). Object form `{type, path, argv, url: "w<...>"|false, stdout, stderr: "inherit"|"ignore"}`
 - path/argv force spawn. Chrome lookup: `path` > `BUN_CHROME_PATH` > PATH > std locations > Playwright cache
 - auto-connects to running Chrome via DevToolsActivePort. Edge fails under Windows LocalSystem.
- `dataStore: "ephemeral" | {directory}` (Chrome: whole-process --user-data-dir, first wins; WebKit needs macOS 15.2+).
- Methods: navigate(url) (resolves on load), goBack/goForward/reload, evaluate(expr) (wrapped in `await (...)`, JSON round-trip), screenshot({format png|jpeg|webp(chrome), quality=80, encoding blob|buffer|base64|shmem(not Windows)}), click(x,y|selector,{button, modifiers, clickCount, timeout=30000}), type(text) (InsertText, no keydown), press(key,{modifiers}), scroll(dx,dy), scrollTo(sel,{block="center", timeout}), resize, cdp(method, params) (Chrome;
 - after first navigate), close, static `WebView.closeAll`. Props url/title/loading/onNavigated/onNavigationFailed
 - extends EventTarget (CDP events by name).
- One op per slot (navigate/evaluate/screenshot/cdp/simple) else sync `ERR_INVALID_STATE`, no queueing. `using`/`await using` → close. Doesn't keep loop alive unless op pending. Events `isTrusted: true`.

## Workers (workers.mdx, experimental) — global `Worker`
- `new Worker(path|blob:URL, {preload: string|string[], ref: false, smol: true})`; path resolved from project root; TS/JSX/ESM w/o `type:"module"`. Events: `open`, `message`, `error`, `close` (exit code). `terminate`, `unref/ref`, `process.exit` in worker ends worker only.
- Messages queued until script's sync part ran, then dropped if no handler → set `self.onmessage` before first top-level await (incl. awaits in static imports); `worker_threads` parentPort queues instead.
- postMessage fast paths: pure string, flat primitive-only plain object. `setEnvironmentData/getEnvironmentData` (worker_threads), `process.on("worker")`, `Bun.isMainThread`.

## XML (xml.mdx, new in v1.4) — Rust, XML 1.0 5th ed non-validating, no XXE, passes 1679 W3C cases
- `Bun.XML.parse(str|bytes|Blob, {compact?})`: compact (default) → `{root: {"@attr": "...", child: value|[...], "#text": "..."}}`, all values strings, leaf w/o attrs = string;
 - `{compact:false}` → tree `{name, attributes, children:[string|element|{comment}|{target,data}]}`. Bytes decoded UTF-8/UTF-16/ISO-8859-1 only. SyntaxError if not well-formed, RangeError on deep nesting.
- `Bun.XML.stringify(value, null, space?)`: no prolog; `null` → empty element; throws on invalid names/chars/root array/cycles.
- `import doc, { root } from "./x.xml"`, `with {type:"xml"}`, require, `--hot`, bundler inline.

## YAML (yaml.mdx) — YAML 1.2, Rust, passes official test suite
- `Bun.YAML.parse(str)` (multi-doc `---` → array; anchors/aliases share identity, may be cyclic; tags `!!str` etc.; SyntaxError on invalid). Import default + named top-level keys, require, `--hot`, bundler inline (imported YAML cannot be cyclic). No built-in `${ENV}` interpolation.
