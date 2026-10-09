---
name: bun-docs-runtime-apis-a-m
description: "Dense cheat-sheet of docs/runtime/*.mdx pages archive..module-resolution (Archive, spawn, check, cron, FFI/cc, file I/O, Glob, hashing, HTMLRewriter, Image, JSON5/JSONL, markdown, ModuleGraph, resolution)"
metadata:
 type: reference
---

Source: <bun>\docs\runtime\*.mdx (read 2026-10-08). Siblings: `bun-docs-runtime-apis-n-z`, `bun-docs-http-networking`, `bun-docs-bundler`, `bun-docs-bunfig-env`, `bun-docs-map`.

## Bun.Archive (archive.mdx) — tar / tar.gz
- `new Bun.Archive(data, opts?)`; data = `Record<path, string|Blob|ArrayBufferView|ArrayBufferLike>` (create) OR Blob/bytes of an existing tar(.gz) (read; gzip auto-detected).
- opts `{ compress?: "gzip", level?: 1-12 }`; default uncompressed; gzip default level 6.
- `.extract(dir, { glob?: string|string[] }) -> Promise<number>` (counts files+dirs+symlinks); creates dir, overwrites files.
- `.files(glob?) -> Promise<Map<path, File>>` regular files only, loads into memory (use extract for large); empty Map if no match.
- `.bytes`, `.blob` use ctor compression. `Bun.write("x.tar", archive)` works.
- Globs: `* ** ? [abc] {a,b} !neg`; only negatives => include all except. Paths normalized to `/`.
- Security: rejects absolute (POSIX, `C:\`, UNC) and unsafe symlink targets; `..` normalized away. Windows always skips symlinks. Corrupt data errors may be deferred to read/extract.

## Auto-install (auto-install.mdx)
- Active only when NO `node_modules` in cwd or above: Bun-style resolution, installs to global cache `<cache>/<pkg>@<version>` (+ symlink `<cache>/<pkg>/<version>`).
- Version: `bun.lock` > nearest package.json dep range > `latest`. `latest` cached 24h.
- Limits: no IDE types (no node_modules), no patch-package, no URL imports.

## Bun APIs index (bun-apis.mdx)
- Map of Bun.* surfaces: serve, $, build, file/write/stdin/stdout/stderr, spawn/spawnSync, listen/connect, udpSocket, Transpiler, FileSystemRouter, HTMLRewriter, WebView, password/hash/CryptoHasher/sha, CSRF.generate/verify, bun:sqlite, SQL/sql, RedisClient/redis, bun:ffi, dns.lookup/prefetch/getCacheStats, Worker, plugin, Glob, Cookie/CookieMap, semver, TOML.parse, XML, markdown, color, Image, gzipSync/gunzipSync/deflateSync/inflateSync/zstd*(Sync), readableStreamTo*, ArrayBufferSink, allocUnsafe, concatArrayBuffers, resolveSync, mmap, gc, generateHeapSnapshot, bun:jsc.

## Binary data (binary-data.mdx)
- TypedArrays incl. `Float16Array`; `Uint32Array` over 10-byte buffer => RangeError (length must be multiple of element size).
- `Uint8Array#toBase64/toHex`, `Uint8Array.fromBase64/fromHex`.
- `Blob#bytes` copies; `BunFile` = lazy Blob subclass with name/lastModified.
- Stream helpers: `Bun.readableStreamToArrayBuffer|Bytes|Text|Array(stream)`; `new Response(stream).bytes` alt; `stream.tee`.

## C compiler `cc` (c-compiler.mdx) — experimental, TinyCC
- `import { cc } from "bun:ffi"`; `cc({ source: string|URL|BunFile, symbols: {name:{args,returns}}, library?: string|string[], flags?: string|string[], define?: Record<string,string> })`.
- Same FFITypes as dlopen except `buffer_length`; `napi_env`/`napi_value` ONLY in cc (`#include <node/node_api.h>`).
- `--no-ffi-cc` => cc throws `ERR_FFI_CC_DISABLED`; `--no-addons` also disables cc + process.dlopen. Workers inherit; `execArgv:["--no-ffi-cc"]`; compile: `--compile-exec-argv="--no-ffi-cc"`.

## bun check (check.mdx) — TS7-equivalent type checker
- `bun check [flags] [files|dirs]`; exit 1 on error OR empty run; never writes files (no .d.ts/.tsbuildinfo, no incremental cache).
- Flags: `-p/--project <tsconfig|dir>`, `-b/--build` (follow references), `--pretty`/`--no-pretty` (default pretty in TTY, one-line `tsc --pretty false` when piped), `--all` (else identical errors grouped above 50), `--threads <n>` (default 1/core), `--timing`, `--cwd`, any compiler option (`--strict false`, `--target=es2022`, case-insensitive; applies to all projects with -b).
- `--check` on run/build/test: `bun --check f.ts`, `bun build --check`, `bun test --check`, `bun run --check dev`, `bun --watch --check`, `--hot --check`. `Bun.build({ check: true })` -> BuildMessage starting with TS code.
- --check covers static imports only: NOT workers, computed import, require in TS, spawned processes, preload files. package.json script / PATH bin / shell script => whole project. HTML => local `<script src>`.
- No tsconfig: ESNext/Preserve/bundler/react-jsx/strict/skipLibCheck/allowJs/verbatimModuleSyntax/noEmit defaults. No tsconfig at/above but some below => lists them and stops; `bun check .` checks all below.
- TS6/7 changes: strict on, `types` empty (list `["bun"]` after `bun add -d @aphrody/bun-types`), side-effect imports checked (TS2882). Removed opts stop check: moduleResolution node/node10/classic, baseUrl, target es5, module amd/umd/system, downlevelIteration, outFile, esModuleInterop/alwaysStrict false.
- `"check"` script in package.json wins: `bun check` runs it; use `bun --check`. Inside that script, `bun check` = checker. Older bun => infinite loop; name it `typecheck`. `--filter`/`--workspaces` => always the script.
- Env `AGENT=1`, `CLAUDECODE=1`, `REPL_ID=1` => tagged `<error file line column code>` blocks, no color. GitHub Actions: auto `::error` annotations. Errors to stdout, summary to stderr.
- Version: `process.versions.typescript`; align editor: `bun add -d typescript@$(bun -p process.versions.typescript)`. lib.*.d.ts built in (`bundle<libs>/...`). Ignores `plugins`; no Yarn PnP; no `bun check --watch`.

## Spawn (child-process.mdx)
- `Bun.spawn(cmd[], opts?)` / `Bun.spawn({ cmd...opts })`; `Bun.spawnSync` same (posix_spawn).
- Opts: cwd, env, stdio `[in,out,err]`, stdin/stdout/stderr, onExit(proc, exitCode, signalCode, error), ipc(msg, proc), serialization `"advanced"`(default, structuredClone)|`"json"` (needed for Bun<->Node IPC), windowsHide, windowsVerbatimArguments, argv0, signal (AbortSignal), timeout ms, killSignal (default SIGTERM; also used on abort), maxBuffer (spawnSync), cgroup (Linux path|dir fd; spawn fails if can't join; v1+v2), terminal.
- stdin default `null`; `"pipe"` => FileSink (`write/flush/end`); also inherit, Bun.file, TypedArray/DataView, Response, Request, ReadableStream, Blob, fd number.
- stdout default `"pipe"` (ReadableStream: `await proc.stdout.text`); stderr default `"inherit"` (proc.stderr undefined). Also "ignore", Bun.file, fd.
- Subprocess: pid, exited (Promise<number>), exitCode, signalCode, killed, kill(sig?), ref/unref (parent waits for children unless unref), send/disconnect, resourceUsage (maxRSS, cpuTime µs), AsyncDisposable.
- SyncSubprocess: stdout/stderr Buffer, success, exitCode, exitedDueToTimeout, no stdin. maxBuffer overshoot <= one read.
- Child IPC: `process.send` / `process.on("message")`.
- PTY: `terminal: { cols=80, rows=24, name="xterm-256color", data(term,data), exit(term,code 0=EOF/1=err,signal), drain }`; proc.stdin/out/err = null; `proc.terminal.write/resize/setRawMode/ref/unref/close`. Reusable `await using t = new Bun.Terminal({...})`. spawnSync + terminal throws.
- Windows ConPTY: no termios (flags read 0, setRawMode no-op), no echo without child, re-encoded VT output + init seq, `\r` not translated, child SIGWINCH missing unless raw, close slow before 11 24H2, no mouse tracking on Win10/2019.

## --disallow-code-generation-from-strings (code-generation-from-strings.mdx)
- No value = Node parity: refuses eval, Function ctors (all kinds), ShadowRealm evaluate. `=strict` (Bun only) also refuses node:vm source APIs, module._compile/Module.wrapper, dat<blob>: imports & workers, `eval:true` workers, plugin onLoad `contents` for js/jsx/ts/tsx, inspector.open, bun:jsc startRemoteDebugger, napi_run_script, node:repl.
- Synchronous catchable `EvalError`; import rejects. Process-wide, no off switch; last flag wins; `BUN_OPTIONS` read before CLI, can raise not lower compiled level.
- Worker with flag in its own execArgv => `ERR_WORKER_INVALID_EXEC_ARGV`.
- strict + `--inspect*`/`BUN_INSPECT` => startup error; `BUN_INSPECT_CONNECT_TO` => warning, ignored.
- Compile: `--compile-exec-argv="--disallow-code-generation-from-strings=strict"` (use `=`, space form silently drops strict). Literal data: URLs bundled at build time load. Verify via `process.execArgv.includes(...)`.
- Not covered: written-then-imported files, entry/preload/-e, BUN_OPTIONS --preload, `BUN_BE_BUN=1`, dlopen/linkSymbols/CFunction, child processes.

## Bun.color (color.mdx)
- `Bun.color(input, format?)` -> null on parse failure. Input: CSS names, numbers, hex, rgb/rgba/hsl/hsla/lab strings, `{r,g,b,a?}`, `[r,g,b,a?]`.
- Formats: `css` (most compact), `ansi` (auto-detects depth; "" if no color), `ansi-16|ansi-256|ansi-16m`, `number`, `rgb`, `rgba`, `hsl`, `hex`, `HEX`, `{rgb}`, `{rgba}` (a 0-1), `[rgb]`, `[rgba]` (a 0-255). Usable as macro: `import { color } from "bun" with { type: "macro" }`.

## Console (console.mdx)
- Depth default 2; `--console-depth <n>` > bunfig `console.depth`.
- `for await (const line of console)` reads stdin lines; `console.write(str)`.

## Cookies (cookies.mdx) — also see `bun-docs-http-networking`
- `new Bun.CookieMap(string | Record | [k,v][])`: get (null if absent), has, set(name,value,opts)|set(init)|set(Cookie) default `{path:"/", sameSite:"lax"}`, delete(name|{name,domain,path}), toJSON, toSetCookieHeaders (for non-Bun.serve servers), size, iterators. `req.cookies` in Bun.serve routes auto-applied.
- `new Bun.Cookie(name,value,opts?)|(cookieString)|(init)`; `Cookie.parse`, `Cookie.from`; serialize/toString/toJSON; isExpired (maxAge beats expires; maxAge<=0 expired). CookieInit: domain, path (""=browser), expires number|Date|string, secure, sameSite strict|lax|none, httpOnly, partitioned, maxAge s.

## Cron (cron.mdx)
- `Bun.cron.parse(expr, relativeDate=Date.now, { tz? }) -> Date|null` (null if none within 8 years).
- 5 fields; names case-insensitive (MON, Monday); 0 and 7 = Sunday; nicknames @yearly/@annually/@monthly/@weekly/@daily/@midnight/@hourly. DOM+DOW both set => OR. Local TZ default; DST: spring-forward shifted, fall-back fixed fires once, `*` fields fire both.
- In-process `Bun.cron(schedule, handler, { tz? }) -> CronJob` (sync; TypeError on invalid/no-future). No overlap: next fire computed after handler settles. Errors -> uncaughtException/unhandledRejection (exit 1 if no listener). Job: `.cron`, stop/ref/unref (chainable), Disposable (`using`). `--hot` stops+re-registers. Honors `jest.useFakeTimers`.
- OS-level `await Bun.cron(path, schedule, title)` (title alnum/-/_; same title overwrites); script exports `default { scheduled(controller) }` (cron, type, scheduledTime). `Bun.cron.remove(title)` (missing => resolves).
- Linux crontab with `# bun-cron: <title>` marker; macOS `~/Library/LaunchAgents/bun.cron.<title>.plist`, logs `/tmp/bun.cron.<title>.std{out,err}.log`; Windows task `bun-cron-<title>`, S4U logon (no SMB/Kerberos), 48-trigger cap (`*/7 * * * *` fails; steps dividing 60 with other fields `*` use Repetition), unsupported in Windows containers, SID failure for NSSM-style accounts.

## Debugger (debugger.mdx)
- `--inspect[=port|host:port|host:port/prefix]`, `--inspect-brk` (break first line), `--inspect-wait` (wait for attach). WebKit Inspector Protocol; UI at debug.bun.sh; VS Code extension experimental.
- `BUN_CONFIG_VERBOSE_FETCH=curl|true|false` logs fetch + node:http.
- `Bun.inspect(err, { colors: true })` source preview. V8 stack API: `Error.prepareStackTrace(err, callSites)`, `Error.captureStackTrace(err, fn)`; CallSite isPromiseAll/getPromiseIndex not implemented; getEvalOrigin undefined.

## bun:ffi (ffi.mdx) — experimental, prefer Node-API for prod
- `dlopen(path, { sym: { args, returns } }) -> { symbols, close }`; `suffix` = dylib|so|dll. Engine-native (JSC), JIT-inlined.
- Types: buffer, cstring, function(fn/callback), ptr(pointer/void*/char*), i8..i64(int/isize), i64_fast, u8..u64(usize), u64_fast, f32/float, f64/double, bool, char, napi_env/napi_value (cc only; TypeError elsewhere), buffer_length (arg-only, same view as buffer -> byte length, not cc).
- cstring arg accepts JS string (call-scoped UTF-8 buffer); return -> JS string clone. `new CString(ptr, byteOffset?, byteLength?)` returns plain string clone.
- `new CFunction({ ptr, args, returns })`, `linkSymbols({ name: {ptr,args,returns} })`; `new JSCallback(fn, { args, returns, threadsafe?=false })` -> `.ptr`, `.close`; threadsafe return value unspecified (treat as void); async fns unsupported.
- Pointers are numbers (BigInt converted); Windows HANDLE use `u64`. `ptr(typedArray)`, `toArrayBuffer(ptr, off?, len?, ctx?, deallocator?)` (no len => null-terminated), `toBuffer`, `read.u8/i32/f64/ptr...(ptr, off)`. No memory management; deallocator may run on GC thread.

## File I/O (file-io.mdx)
- `Bun.file(path|fd|URL, { type? }) -> BunFile` lazy; default type `text/plain;charset=utf-8`; nonexistent => size 0, `exists` false. Methods: text, json, stream, arrayBuffer, bytes, writer, exists, delete. `Bun.stdin` (readonly) / stdout / stderr are BunFiles.
- `Bun.write(dest: path|fd|BunFile|URL, data: string|Blob|ArrayBuffer|SAB|TypedArray|Response) -> Promise<number>`; uses copy_file_range/sendfile/splice (Linux), clonefile/fcopyfile (macOS).
- `file.writer({ highWaterMark })` FileSink: write/flush/end/ref/unref; keeps process alive until `end` unless unref. Dirs: use node:fs (readdir recursive, mkdir recursive).

## FileSystemRouter (file-system-router.mdx)
- `new Bun.FileSystemRouter({ style: "nextjs", dir, origin?, assetPrefix?, fileExtensions? })`; pages dir only (no app dir). `.match(path|Request|Response)` -> `{ filePath, kind: exact|catch-all|optional-catch-all|dynamic, name, pathname, src, params?, query? } | null`; `.reload` rescans.

## File types / loaders (file-types.mdx) — see `bun-docs-bundler`
- Exts: js cjs mjs mts cts ts tsx jsx css json jsonc json5 toml yaml yml xml txt text md markdown wasm node html sh. Override: `with { type: "toml" }` (TS 7.1+ types from attribute).
- `.js` uses `jsx` loader; ts loader never type-checks; no syntax down-leveling. `jsonc` auto for tsconfig/jsconfig/package.json/bun.lock. xml -> `Bun.XML.parse` shape (`@attr`, `#text`, arrays, all strings). md -> HTML string. `.node` -> napi (bundler: file loader). sqlite: `with { type: "sqlite", embed: "true" }`, target bun only. html loader: lol-html selectors (script/link/img/srcset/source/video/audio/icons/manifest). `sh` only when starting bun. Unknown -> `file` loader (abs path at runtime; copied + `publicPath` prefix in bundler).

## Glob (glob.mdx)
- `new Glob(pat)`: `scan(root|opts)` async iter, `scanSync`, `match(path)`. ScanOptions: cwd (process.cwd), dot=false, absolute=false, followSymlinks=false, throwErrorOnBrokenSymlink=false, onlyFiles=true.
- Syntax: `? * ** [ab] [a-z] [^ab]/[!ab] {a,b}` (nest <=10) leading `!` negation, `\` escape. node:fs `glob/globSync/promises.glob` support arrays + `exclude`.

## Globals (globals.mdx)
- Web + Node globals incl. alert/confirm/prompt (CLI), `__dirname`, `__filename`, `require`, `module`, `exports`, `Buffer`, `process`, `HTMLRewriter`, `ShadowRealm`, `BuildMessage`, `ResolveMessage`, `reportError`.

## Hashing (hashing.mdx)
- `Bun.password.hash(pw, opts?)`/`verify(pw, hash)` (+ hashSync/verifySync). Default argon2id (PHC, m=65536 t=2 p=1); `{ algorithm: argon2id|argon2i|argon2d, memoryCost (KiB, min 8), timeCost }` or `{ algorithm: "bcrypt", cost: 4-31 }` (MCF `$2b$10$`; >72 bytes pre-hashed with SHA-512). Salt automatic; verify auto-detects.
- `Bun.hash(data, seed?)` wyhash 64-bit bigint; `.wyhash .crc32 .adler32 .cityHash32/64 .xxHash32/64 .xxHash3 .murmur32v3/v2 .murmur64v2 .rapidhash` (32-bit -> number). Seeds > MAX_SAFE_INTEGER as BigInt.
- `new Bun.CryptoHasher(alg, hmacKey?)`: blake2b256/512, blake2s256, md4, md5, ripemd160, sha1/224/256/384/512, sha512-224/256, sha3-*, shake128/256. `update(data, enc?)` (base64/base64url/hex/utf8/utf16le/latin1/ascii/binary/ucs2), `digest(enc|TypedArray?)`, `copy`. HMAC: no blake2s/shake; instance unusable after digest.

## HTMLRewriter (html-rewriter.mdx) — lol-html, Cloudflare-compatible
- `new HTMLRewriter.on(selector, { element, text, comments }).onDocument({ doctype, text, comments, end }).transform(input)`; input Response|string|ArrayBuffer (Blob/File: wrap in Response).
- Selectors: tag.class, #id, attribute ops `= ~= ^= $= *= |=` + `i`/`s`, descendant, `>`, :nth-child, :first-child, :nth-of-type, :first-of-type, :not, `*`.
- Element: get/set/has/removeAttribute, setInnerContent, before/after/prepend/append (`{ html: true }` else escaped), remove, removeAndKeepContent, onEndTag, tagName, namespaceURI, selfClosing, canHaveContent, removed, attributes iterator. Text: text, lastInTextNode, replace. Comment: text (settable).
- Async handlers run one at a time. Response input: streams lazily, handler errors reject the output body. string/ArrayBuffer input: sync; handler needing event loop => TypeError. Unreturned promise rejections -> unhandledRejection.

## Bun.Image (image.mdx)
- `new Bun.Image(path|bytes|Blob, { maxPixels (~268MP default), autoOrient=true })`; `Bun.file(p).image`, `Bun.s3.file(k).image`. Format sniffed from bytes. Path strings = arbitrary file read (don't pass user input). Don't mutate input bytes while pending; SAB/resizable refused.
- `metadata` -> {width,height,format} header-only. `resize(w,h?, { fit: "fill"(default)|"inside", withoutEnlargement, filter: lanczos3(default)|lanczos2|mitchell|cubic|mks2013|mks2021|bilinear|linear|box|nearest })`, `rotate(90n)`, `flip` vertical, `flop` horizontal, `modulate({ brightness, saturation })`.
- Output: `jpeg({ quality 1-100=80, progressive })`, `png({ compressionLevel 0-9, palette, colors, dither })`, `webp({ quality, lossless })`, `heic/avif` (macOS/Windows only). Default = source format; `write(path)` picks by extension.
- Terminals (lazy, off-thread): bytes, buffer, blob, toBase64, dataurl, write(dest like Bun.write), placeholder (ThumbHash <=32px data URL). width/height -1 until first terminal.
- Errors: `ERR_IMAGE_DECODE_FAILED`, `ERR_IMAGE_FORMAT_UNSUPPORTED` (HEIC/AVIF on Linux; AVIF encode Apple M3+ only). `Bun.Image.fromClipboard` (null on Linux), `clipboardChangeCount`, `hasClipboardImage`. `Bun.Image.backend = "bun"` forces portable path (default "system" on mac/Win). Valid Response body (encode sync then; prefer awaiting `.blob`).

## Runtime CLI basics (index.mdx)
- `bun [flags] run <file|script>`; Bun flags go BEFORE the script name (`bun --watch run dev`). `--watch`, `--check`, `--bun` (ignore node shebang), `--filter <pattern>`, `--console-depth`, `--smol` (more GC). `bun run -` reads stdin as TSX.
- Scripts shell: bash>sh>zsh on POSIX, Bun Shell on Windows; pre/post hooks; built-in commands shadow `bun <script>`. Resolution: scripts > source files > package bins > (bun run only) system commands.

## JSON5 / JSONL
- `Bun.JSON5.parse(str)` (SyntaxError on invalid; 100% official suite), `Bun.JSON5.stringify(v, null, space)` keeps Infinity/NaN. `.json5` import: default + named top-level exports, require, --hot reload, inlined by bundler.
- `Bun.JSONL.parse(string|Uint8Array)` -> array (throws only if nothing parsed; skips UTF-8 BOM). `Bun.JSONL.parseChunk(input, start?, end?)` -> `{ values, read, done, error }` never throws; `read` = chars (string) or bytes (Uint8Array).

## JSX (jsx.mdx)
- From tsconfig/jsconfig or bunfig: `jsx` react|react-jsx|react-jsxdev|preserve (preserve unsupported), `jsxFactory` (default React.createElement), `jsxFragmentFactory` (React.Fragment), `jsxImportSource` (react). Pragmas `// @jsx h`, `// @jsxFrag X`, `// @jsxImportSource preact`. Prop punning `<div {className} />`.

## Bun.markdown (markdown.mdx) — unstable, Rust, GFM
- `html(md, opts)`, `render(md, callbacks, opts)`, `react(md, components?, opts?)` (Fragment; `reactVersion: 18` for old React).
- Opts defaults: tables/strikethrough/tasklists true; autolinks (true|{url,www,email}), headings (true|{ids}), hardSoftBreaks, wikiLinks, underline, latexMath, collapseWhitespace, permissiveAtxHeaders, noIndentedCodeBlocks, noHtmlBlocks, noHtmlSpans, tagFilter all false.
- render callbacks `(children, meta)`; return null/undefined omits. Block: heading{level,id}, paragraph, blockquote, code{language}, list{ordered,start,depth}, listItem{index,depth,ordered,start,checked}, hr, table/thead/tbody/tr, th/td{align}, html. Inline: strong, emphasis, link{href,title}, image{src,title}, codespan, strikethrough, text.

## Bun.ModuleGraph (module-graph.mdx) — experimental, multi-tenant, NOT a sandbox
- `new Bun.ModuleGraph({ globals?, onError?(error, kind) })`; `await graph.import(spec)` (first = main), `graph.run(fn)` enters graph context, `graph.dispose`, `Bun.ModuleGraph.current`.
- Own module registry + require.cache; shares parsed code/bytecode/JIT. Owns timers, servers, sockets, fetch, watchers, children, workers, DB, writers; context follows async like AsyncLocalStorage.
- dispose: nothing settles (no reject), later import/run/require -> `ERR_INVALID_STATE`. Not covered: spawnSync/sync fs, node:http via shared globalAgent (pass own Agent), node:quic, raw fds. Shared: globalThis, plugins, addons, process (unless in globals), mock.module. Escape context with `AsyncLocalStorage.snapshot` taken in host.

## Module resolution (module-resolution.mdx)
- Extensionless order (local ESM): .tsx .jsx .mts .ts .mjs .js .cts .cjs .json then `/index.*`; require tries CJS first; node_modules tries JS before TS. `.js`/`.jsx` imports also match `.ts`/`.tsx`; `.mjs`->`.mts` outside node_modules; no `.cjs`->`.cts`.
- import & require mix freely; `require` of ESM => namespace; cannot require a file with top-level await.
- exports conditions first-match: `bun`, `node-addons` (unless --no-addons), `node`, `require`, `import`, `default`. No exports => `main` (or index) preferred over `module` at runtime. `--conditions="react-server"` (runtime + build). `NODE_PATH` (`:` / `;`).
- Built-in replacements (even if installed): undici, node-fetch, isomorphic-fetch, @vercel/fetch, ws, utf-8-validate, abort-controller, next/dist/compiled/{undici,node-fetch,ws}; undici Agent/Pool etc. are inert, `dispatcher` ignored.
- Paths: tsconfig/jsconfig `compilerOptions.paths`, package.json `imports` (`#`).
- import.meta: dir/dirname, file, path/filename, url, main, env (= process.env), resolve(spec).
