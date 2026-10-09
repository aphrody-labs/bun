# M-n2b-node : surface publique de Node couverte par n2b

Généré par `bun scripts/aphrody/node-api-surface.ts` depuis aphrody-labs/node@dd9777b2 (lib/*.js, doc/api/*.md) et le registre n2b (`packages/bun-n2b/crates/n2b-registry/registry`), avec Bun 1.4.3. Détail par API : `M-n2b-node.json`.

Statuts :

- **règle n2b** : `n2b` signale l'appel et le réécrit vers l'équivalent Bun natif (ou le signale quand la réécriture est manuelle).
- **natif Bun** : Bun expose la même API (compat native), pas de réécriture.
- **absent de Bun** : ni API Bun du même nom, ni règle ; à implémenter dans le cœur ou à réécrire.
- **membre d'instance** : méthode ou propriété d'une instance (`filehandle.close`) ou type de la doc sans export (`AesCbcParams`), suit sa classe.

## Synthèse

| Catégorie | Total | règle n2b | natif Bun | absent de Bun | membre d'instance |
| --- | --- | --- | --- | --- | --- |
| module | 67 | 5 | 57 | 5 | 0 |
| export | 590 | 22 | 417 | 151 | 0 |
| classe | 212 | 0 | 103 | 21 | 88 |
| api | 2310 | 18 | 396 | 250 | 1646 |
| option CLI | 217 | 1 | 58 | 158 | 0 |
| variable d'environnement | 31 | 0 | 28 | 3 | 0 |
| code d'erreur | 470 | 0 | 304 | 166 | 0 |
| global | 39 | 3 | 25 | 5 | 6 |
| N-API (C) | 189 | 0 | 189 | 0 | 0 |
| process | 102 | 8 | 66 | 28 | 0 |
| **total** | 4227 | 57 | 1643 | 787 | 1740 |

## Par document (API, classes, globals, process)

| Source | Total | règle n2b | natif Bun | absent de Bun | membre d'instance |
| --- | --- | --- | --- | --- | --- |
| doc/api/assert.md | 21 | 0 | 21 | 0 | 0 |
| doc/api/async_context.md | 19 | 0 | 0 | 0 | 19 |
| doc/api/async_hooks.md | 11 | 0 | 0 | 8 | 3 |
| doc/api/bench.md | 22 | 0 | 0 | 10 | 12 |
| doc/api/buffer.md | 96 | 4 | 14 | 2 | 76 |
| doc/api/child_process.md | 24 | 0 | 1 | 2 | 21 |
| doc/api/cluster.md | 20 | 0 | 11 | 1 | 8 |
| doc/api/console.md | 23 | 0 | 23 | 0 | 0 |
| doc/api/crypto.md | 97 | 0 | 17 | 0 | 80 |
| doc/api/dgram.md | 27 | 0 | 0 | 1 | 26 |
| doc/api/diagnostics_channel.md | 29 | 0 | 1 | 6 | 22 |
| doc/api/dns.md | 41 | 0 | 36 | 3 | 2 |
| doc/api/domain.md | 9 | 0 | 0 | 9 | 0 |
| doc/api/dtls.md | 62 | 0 | 0 | 5 | 57 |
| doc/api/environment_variables.md | 2 | 1 | 0 | 1 | 0 |
| doc/api/errors.md | 470 | 0 | 304 | 166 | 0 |
| doc/api/esm.md | 8 | 3 | 0 | 1 | 4 |
| doc/api/events.md | 63 | 0 | 9 | 2 | 52 |
| doc/api/ffi.md | 14 | 0 | 0 | 2 | 12 |
| doc/api/fs.md | 245 | 6 | 127 | 9 | 103 |
| doc/api/globals.md | 87 | 3 | 69 | 5 | 10 |
| doc/api/http.md | 130 | 0 | 1 | 2 | 127 |
| doc/api/http2.md | 70 | 0 | 1 | 0 | 69 |
| doc/api/https.md | 1 | 0 | 1 | 0 | 0 |
| doc/api/inspector.md | 19 | 0 | 0 | 15 | 4 |
| doc/api/module.md | 21 | 0 | 12 | 6 | 3 |
| doc/api/modules.md | 15 | 2 | 0 | 9 | 4 |
| doc/api/n-api.md | 189 | 0 | 189 | 0 | 0 |
| doc/api/net.md | 64 | 0 | 0 | 1 | 63 |
| doc/api/os.md | 3 | 0 | 3 | 0 | 0 |
| doc/api/packages.md | 1 | 0 | 0 | 0 | 1 |
| doc/api/path.md | 16 | 1 | 15 | 0 | 0 |
| doc/api/perf_hooks.md | 116 | 1 | 17 | 1 | 97 |
| doc/api/permissions.md | 2 | 0 | 0 | 0 | 2 |
| doc/api/process.md | 102 | 8 | 66 | 28 | 0 |
| doc/api/punycode.md | 8 | 0 | 8 | 0 | 0 |
| doc/api/quic.md | 206 | 0 | 9 | 28 | 169 |
| doc/api/readline.md | 22 | 0 | 3 | 1 | 18 |
| doc/api/repl.md | 6 | 0 | 1 | 1 | 4 |
| doc/api/sqlite.md | 50 | 0 | 1 | 4 | 45 |
| doc/api/stream_iter.md | 57 | 0 | 0 | 32 | 25 |
| doc/api/stream.md | 94 | 0 | 25 | 3 | 66 |
| doc/api/string_decoder.md | 3 | 0 | 1 | 2 | 0 |
| doc/api/test.md | 76 | 0 | 5 | 10 | 61 |
| doc/api/timers.md | 17 | 0 | 5 | 2 | 10 |
| doc/api/tls.md | 37 | 0 | 3 | 0 | 34 |
| doc/api/tracing.md | 5 | 0 | 0 | 1 | 4 |
| doc/api/tty.md | 17 | 0 | 3 | 0 | 14 |
| doc/api/url.md | 46 | 0 | 5 | 14 | 27 |
| doc/api/util.md | 79 | 0 | 52 | 6 | 21 |
| doc/api/v8.md | 46 | 0 | 4 | 6 | 36 |
| doc/api/vfs.md | 17 | 0 | 0 | 14 | 3 |
| doc/api/vm.md | 25 | 0 | 5 | 6 | 14 |
| doc/api/wasi.md | 6 | 0 | 1 | 5 | 0 |
| doc/api/webcrypto.md | 150 | 0 | 1 | 0 | 149 |
| doc/api/webstreams.md | 70 | 0 | 1 | 1 | 68 |
| doc/api/worker_threads.md | 36 | 0 | 0 | 2 | 34 |
| doc/api/zlib.md | 110 | 0 | 12 | 37 | 61 |
| lib/async_hooks.js | 7 | 0 | 7 | 0 | 0 |
| lib/buffer.js | 9 | 0 | 8 | 1 | 0 |
| lib/child_process.js | 9 | 3 | 5 | 1 | 0 |
| lib/crypto.js | 69 | 3 | 61 | 5 | 0 |
| lib/dgram.js | 2 | 0 | 2 | 0 | 0 |
| lib/diagnostics_channel.js | 8 | 0 | 6 | 2 | 0 |
| lib/dns.js | 33 | 0 | 33 | 0 | 0 |
| lib/domain.js | 3 | 0 | 2 | 1 | 0 |
| lib/dtls.js | 6 | 0 | 0 | 6 | 0 |
| lib/events.js | 6 | 0 | 6 | 0 | 0 |
| lib/ffi.js | 35 | 0 | 0 | 35 | 0 |
| lib/http.js | 24 | 2 | 17 | 5 | 0 |
| lib/http2.js | 11 | 0 | 11 | 0 | 0 |
| lib/https.js | 5 | 2 | 3 | 0 | 0 |
| lib/inspector.js | 9 | 0 | 6 | 3 | 0 |
| lib/inspector/promises.js | 1 | 0 | 1 | 0 | 0 |
| lib/net.js | 20 | 1 | 15 | 4 | 0 |
| lib/os.js | 20 | 4 | 16 | 0 | 0 |
| lib/perf_hooks.js | 15 | 0 | 13 | 2 | 0 |
| lib/querystring.js | 7 | 0 | 7 | 0 | 0 |
| lib/quic.js | 8 | 0 | 7 | 1 | 0 |
| lib/readline.js | 8 | 1 | 7 | 0 | 0 |
| lib/readline/promises.js | 3 | 0 | 3 | 0 | 0 |
| lib/repl.js | 9 | 0 | 9 | 0 | 0 |
| lib/sea.js | 5 | 0 | 0 | 5 | 0 |
| lib/sqlite.js | 7 | 0 | 5 | 2 | 0 |
| lib/stream/consumers.js | 6 | 0 | 6 | 0 | 0 |
| lib/stream/iter.js | 40 | 0 | 0 | 40 | 0 |
| lib/stream/promises.js | 2 | 0 | 2 | 0 | 0 |
| lib/stream/web.js | 18 | 0 | 17 | 1 | 0 |
| lib/string_decoder.js | 1 | 0 | 1 | 0 | 0 |
| lib/test.js | 3 | 0 | 3 | 0 | 0 |
| lib/timers/promises.js | 4 | 0 | 4 | 0 | 0 |
| lib/tls.js | 16 | 0 | 15 | 1 | 0 |
| lib/trace_events.js | 2 | 0 | 2 | 0 | 0 |
| lib/url.js | 14 | 0 | 14 | 0 | 0 |
| lib/util.js | 29 | 4 | 20 | 5 | 0 |
| lib/v8.js | 25 | 0 | 21 | 4 | 0 |
| lib/vfs.js | 9 | 0 | 0 | 9 | 0 |
| lib/vm.js | 10 | 0 | 10 | 0 | 0 |
| lib/wasi.js | 2 | 0 | 0 | 2 | 0 |
| lib/worker_threads.js | 20 | 0 | 20 | 0 | 0 |
| lib/zlib.js | 34 | 2 | 32 | 0 | 0 |
| lib/zlib/iter.js | 16 | 0 | 0 | 16 | 0 |

## API réécrites par une règle n2b

| API Node | Règles |
| --- | --- |
| `node:net/promises` | `imports/node-net` |
| `node:sea` | `imports/node-sea` |
| `node:stream/iter` | `imports/node-stream` |
| `node:test/reporters` | `imports/node-test` |
| `node:zlib/iter` | `imports/node-zlib` |
| `child_process.exec` | `api/exec` |
| `child_process.execSync` | `api/execSync` |
| `child_process.spawnSync` | `api/child-process-spawnSync` |
| `crypto.createHash` | `api/crypto-createHash` |
| `crypto.randomBytes` | `api/crypto-randomBytes` |
| `crypto.hash` | `api/crypto-hash` |
| `http.createServer` | `api/http-createServer` |
| `http.request` | `api/http-request` |
| `https.createServer` | `api/https-createServer` |
| `https.request` | `api/https-request` |
| `net.createServer` | `api/net-createServer` |
| `os.availableParallelism` | `api/os-availableParallelism` |
| `os.cpus` | `api/os-cpus-length` |
| `os.homedir` | `api/os-homedir` |
| `os.platform` | `api/os-platform` |
| `readline.createInterface` | `api/readline-createInterface` |
| `util.inspect` | `api/util-inspect` |
| `util.isDeepStrictEqual` | `api/util-isDeepStrictEqual` |
| `util.promisify` | `api/util-promisify` |
| `util.stripVTControlCharacters` | `api/util-stripVTControlCharacters` |
| `zlib.gzipSync` | `api/zlib-gzipSync` |
| `zlib.gunzipSync` | `api/zlib-gunzipSync` |
| `Buffer.alloc` | `api/buffer-alloc` |
| `Buffer.byteLength` | `api/buffer-byteLength` |
| `Buffer.concat` | `api/buffer-concat` |
| `Buffer.from` | `api/buffer-from-base64`, `api/buffer-from-string` |
| `--import` | `cli/node-ts-loader` |
| `process.env` | `api/process-env`, `globals/process-env` |
| `import.meta` | `api/dirname-esm`, `api/filename-esm`, `api/new-url-import-meta` |
| `import.meta.url` | `api/dirname-esm`, `api/filename-esm`, `api/new-url-import-meta` |
| `require` | `globals/require-dynamic` |
| `fsPromises.readFile` | `api/fs-readFile-promise` |
| `fs.readFile` | `api/fs-readFile-utf8` |
| `fs.existsSync` | `api/fs-existsSync` |
| `fs.globSync` | `api/fs-globSync` |
| `fs.readFileSync` | `api/fs-readFileSync`, `api/json-parse-readFileSync` |
| `fs.writeFileSync` | `api/fs-writeFileSync` |
| `__dirname` | `globals/__dirname` |
| `__filename` | `globals/__filename` |
| `exports` | `globals/exports` |
| `require.resolve` | `api/require-resolve` |
| `module.exports` | `globals/module-exports` |
| `path.join` | `api/path-join-dirname` |
| `performance.now` | `api/performance-now` |
| `process.argv` | `globals/process-argv` |
| `process.cwd` | `globals/process-cwd` |
| `process.hrtime` | `api/process-hrtime-bigint`, `api/process-hrtime` |
| `process.hrtime.bigint` | `api/process-hrtime-bigint` |
| `process.platform` | `globals/process-platform` |
| `process.stderr` | `api/process-stderr-write` |
| `process.stdin` | `api/readline-createInterface` |
| `process.stdout` | `api/process-stdout-write` |

## Absentes de Bun

| Catégorie | API Node | Source |
| --- | --- | --- |
| module | `node:bench` | lib |
| module | `node:bench/reporters` | lib |
| module | `node:dtls` | lib |
| module | `node:ffi` | lib |
| module | `node:vfs` | lib |
| export | `buffer.isLatin1` | lib/buffer.js |
| export | `child_process._forkChild` | lib/child_process.js |
| export | `crypto.createMac` | lib/crypto.js |
| export | `crypto.getMacs` | lib/crypto.js |
| export | `crypto.parsePKCS12` | lib/crypto.js |
| export | `crypto.encapsulate` | lib/crypto.js |
| export | `crypto.decapsulate` | lib/crypto.js |
| export | `diagnostics_channel.boundedChannel` | lib/diagnostics_channel.js |
| export | `diagnostics_channel.BoundedChannel` | lib/diagnostics_channel.js |
| export | `domain.Domain` | lib/domain.js |
| export | `dtls.connect` | lib/dtls.js |
| export | `dtls.createSecureContext` | lib/dtls.js |
| export | `dtls.listen` | lib/dtls.js |
| export | `dtls.DTLSEndpoint` | lib/dtls.js |
| export | `dtls.DTLSSecureContext` | lib/dtls.js |
| export | `dtls.DTLSSession` | lib/dtls.js |
| export | `ffi.DynamicLibrary` | lib/ffi.js |
| export | `ffi.dlopen` | lib/ffi.js |
| export | `ffi.dlclose` | lib/ffi.js |
| export | `ffi.dlsym` | lib/ffi.js |
| export | `ffi.exportArrayBuffer` | lib/ffi.js |
| export | `ffi.exportArrayBufferView` | lib/ffi.js |
| export | `ffi.exportString` | lib/ffi.js |
| export | `ffi.exportBuffer` | lib/ffi.js |
| export | `ffi.getInt8` | lib/ffi.js |
| export | `ffi.getUint8` | lib/ffi.js |
| export | `ffi.getInt16` | lib/ffi.js |
| export | `ffi.getUint16` | lib/ffi.js |
| export | `ffi.getInt32` | lib/ffi.js |
| export | `ffi.getUint32` | lib/ffi.js |
| export | `ffi.getInt64` | lib/ffi.js |
| export | `ffi.getUint64` | lib/ffi.js |
| export | `ffi.getFloat32` | lib/ffi.js |
| export | `ffi.getFloat64` | lib/ffi.js |
| export | `ffi.getCurrentEventLoop` | lib/ffi.js |
| export | `ffi.getRawPointer` | lib/ffi.js |
| export | `ffi.setInt8` | lib/ffi.js |
| export | `ffi.setUint8` | lib/ffi.js |
| export | `ffi.setInt16` | lib/ffi.js |
| export | `ffi.setUint16` | lib/ffi.js |
| export | `ffi.setInt32` | lib/ffi.js |
| export | `ffi.setUint32` | lib/ffi.js |
| export | `ffi.setInt64` | lib/ffi.js |
| export | `ffi.setUint64` | lib/ffi.js |
| export | `ffi.setFloat32` | lib/ffi.js |
| export | `ffi.setFloat64` | lib/ffi.js |
| export | `ffi.suffix` | lib/ffi.js |
| export | `ffi.toString` | lib/ffi.js |
| export | `ffi.toArrayBuffer` | lib/ffi.js |
| export | `ffi.toBuffer` | lib/ffi.js |
| export | `ffi.types` | lib/ffi.js |
| export | `http._connectionListener` | lib/http.js |
| export | `http.isValidHeaderName` | lib/http.js |
| export | `http.isValidHeaderValue` | lib/http.js |
| export | `http.websocketMask` | lib/http.js |
| export | `http.websocketUnmask` | lib/http.js |
| export | `inspector.Network` | lib/inspector.js |
| export | `inspector.NetworkResources` | lib/inspector.js |
| export | `inspector.DOMStorage` | lib/inspector.js |
| export | `net._createServerHandle` | lib/net.js |
| export | `net._TransferredBoundSocket` | lib/net.js |
| export | `net.BoundSocket` | lib/net.js |
| export | `net.promises` | lib/net.js |
| export | `perf_hooks.createSlidingWindowHistogram` | lib/perf_hooks.js |
| export | `perf_hooks.importHistogram` | lib/perf_hooks.js |
| export | `quic.listEndpoints` | lib/quic.js |
| export | `sea.isSea` | lib/sea.js |
| export | `sea.getAsset` | lib/sea.js |
| export | `sea.getRawAsset` | lib/sea.js |
| export | `sea.getAssetAsBlob` | lib/sea.js |
| export | `sea.getAssetKeys` | lib/sea.js |
| export | `sqlite.Database` | lib/sqlite.js |
| export | `sqlite.Statement` | lib/sqlite.js |
| export | `stream/iter.Stream` | lib/stream/iter.js |
| export | `stream/iter.toStreamable` | lib/stream/iter.js |
| export | `stream/iter.toAsyncStreamable` | lib/stream/iter.js |
| export | `stream/iter.broadcastProtocol` | lib/stream/iter.js |
| export | `stream/iter.shareProtocol` | lib/stream/iter.js |
| export | `stream/iter.shareSyncProtocol` | lib/stream/iter.js |
| export | `stream/iter.drainableProtocol` | lib/stream/iter.js |
| export | `stream/iter.push` | lib/stream/iter.js |
| export | `stream/iter.duplex` | lib/stream/iter.js |
| export | `stream/iter.from` | lib/stream/iter.js |
| export | `stream/iter.fromSync` | lib/stream/iter.js |
| export | `stream/iter.pull` | lib/stream/iter.js |
| export | `stream/iter.pullSync` | lib/stream/iter.js |
| export | `stream/iter.pipeTo` | lib/stream/iter.js |
| export | `stream/iter.pipeToSync` | lib/stream/iter.js |
| export | `stream/iter.bytes` | lib/stream/iter.js |
| export | `stream/iter.text` | lib/stream/iter.js |
| export | `stream/iter.arrayBuffer` | lib/stream/iter.js |
| export | `stream/iter.array` | lib/stream/iter.js |
| export | `stream/iter.dump` | lib/stream/iter.js |
| export | `stream/iter.bytesSync` | lib/stream/iter.js |
| export | `stream/iter.textSync` | lib/stream/iter.js |
| export | `stream/iter.arrayBufferSync` | lib/stream/iter.js |
| export | `stream/iter.arraySync` | lib/stream/iter.js |
| export | `stream/iter.dumpSync` | lib/stream/iter.js |
| export | `stream/iter.merge` | lib/stream/iter.js |
| export | `stream/iter.broadcast` | lib/stream/iter.js |
| export | `stream/iter.Broadcast` | lib/stream/iter.js |
| export | `stream/iter.share` | lib/stream/iter.js |
| export | `stream/iter.shareSync` | lib/stream/iter.js |
| export | `stream/iter.Share` | lib/stream/iter.js |
| export | `stream/iter.SyncShare` | lib/stream/iter.js |
| export | `stream/iter.tap` | lib/stream/iter.js |
| export | `stream/iter.tapSync` | lib/stream/iter.js |
| export | `stream/iter.ondrain` | lib/stream/iter.js |
| export | `stream/iter.fromReadable` | lib/stream/iter.js |
| export | `stream/iter.fromWritable` | lib/stream/iter.js |
| export | `stream/iter.toReadable` | lib/stream/iter.js |
| export | `stream/iter.toReadableSync` | lib/stream/iter.js |
| export | `stream/iter.toWritable` | lib/stream/iter.js |
| export | `stream/web.ReadableStreamTee` | lib/stream/web.js |
| export | `tls.getCertificateCompressionAlgorithms` | lib/tls.js |
| export | `util._exceptionWithHostPort` | lib/util.js |
| export | `util.isPartialDeepStrictEqual` | lib/util.js |
| export | `util.markPromiseAsHandled` | lib/util.js |
| export | `util.transferableAbortSignal` | lib/util.js |
| export | `util.transferableAbortController` | lib/util.js |
| export | `v8.queryObjects` | lib/v8.js |
| export | `v8.setHeapProfileNearHeapLimit` | lib/v8.js |
| export | `v8.startCpuProfile` | lib/v8.js |
| export | `v8.startHeapProfile` | lib/v8.js |
| export | `vfs.create` | lib/vfs.js |
| export | `vfs.vfsBase` | lib/vfs.js |
| export | `vfs.registerProvider` | lib/vfs.js |
| export | `vfs.VirtualFileSystem` | lib/vfs.js |
| export | `vfs.VirtualProvider` | lib/vfs.js |
| export | `vfs.MemoryProvider` | lib/vfs.js |
| export | `vfs.ComposableProvider` | lib/vfs.js |
| export | `vfs.RealFSProvider` | lib/vfs.js |
| export | `vfs.ZipProvider` | lib/vfs.js |
| export | `wasi.this` | lib/wasi.js |
| export | `wasi.throw` | lib/wasi.js |
| export | `zlib/iter.compressGzip` | lib/zlib/iter.js |
| export | `zlib/iter.compressDeflate` | lib/zlib/iter.js |
| export | `zlib/iter.compressBrotli` | lib/zlib/iter.js |
| export | `zlib/iter.compressZstd` | lib/zlib/iter.js |
| export | `zlib/iter.compressGzipSync` | lib/zlib/iter.js |
| export | `zlib/iter.compressDeflateSync` | lib/zlib/iter.js |
| export | `zlib/iter.compressBrotliSync` | lib/zlib/iter.js |
| export | `zlib/iter.compressZstdSync` | lib/zlib/iter.js |
| export | `zlib/iter.decompressGzip` | lib/zlib/iter.js |
| export | `zlib/iter.decompressDeflate` | lib/zlib/iter.js |
| export | `zlib/iter.decompressBrotli` | lib/zlib/iter.js |
| export | `zlib/iter.decompressZstd` | lib/zlib/iter.js |
| export | `zlib/iter.decompressGzipSync` | lib/zlib/iter.js |
| export | `zlib/iter.decompressDeflateSync` | lib/zlib/iter.js |
| export | `zlib/iter.decompressBrotliSync` | lib/zlib/iter.js |
| export | `zlib/iter.decompressZstdSync` | lib/zlib/iter.js |
| api | `init` | doc/api/async_hooks.md |
| api | `type` | doc/api/async_hooks.md |
| api | `triggerAsyncId` | doc/api/async_hooks.md |
| api | `resource` | doc/api/async_hooks.md |
| api | `before` | doc/api/async_hooks.md |
| api | `after` | doc/api/async_hooks.md |
| api | `destroy` | doc/api/async_hooks.md |
| api | `promiseResolve` | doc/api/async_hooks.md |
| api | `createRunner` | doc/api/bench.md |
| api | `bench` | doc/api/bench.md |
| api | `bench.skip` | doc/api/bench.md |
| api | `bench.only` | doc/api/bench.md |
| api | `suite` | doc/api/bench.md |
| api | `describe` | doc/api/bench.md |
| api | `beforeEach` | doc/api/bench.md |
| api | `afterEach` | doc/api/bench.md |
| api | `run` | doc/api/bench.md |
| api | `runFile` | doc/api/bench.md |
| api | `Buffer.stringLength` | doc/api/buffer.md |
| api | `buf` | doc/api/buffer.md |
| api | `subprocess` | doc/api/child_process.md |
| api | `maxBuffer` | doc/api/child_process.md |
| option CLI | `--abort-on-uncaught-exception` | cli |
| option CLI | `--allow-addons` | cli |
| option CLI | `--allow-child-process` | cli |
| option CLI | `--allow-env` | cli |
| option CLI | `--allow-ffi` | cli |
| option CLI | `--allow-fs-read` | cli |
| option CLI | `--allow-fs-vfs` | cli |
| option CLI | `--allow-fs-write` | cli |
| option CLI | `--allow-inspector` | cli |
| option CLI | `--allow-net` | cli |
| option CLI | `--allow-openssl-store` | cli |
| option CLI | `--allow-wasi` | cli |
| option CLI | `--allow-worker` | cli |
| option CLI | `--bench` | cli |
| option CLI | `--bench-isolation` | cli |
| option CLI | `--bench-name-pattern` | cli |
| option CLI | `--bench-reporter-destination` | cli |
| option CLI | `--bench-reporter` | cli |
| option CLI | `--bench-samples` | cli |
| option CLI | `--bench-warmup` | cli |
| option CLI | `--build-sea` | cli |
| option CLI | `--build-snapshot` | cli |
| option CLI | `--build-snapshot-config` | cli |
| option CLI | `--completion-bash` | cli |
| option CLI | `-C` | cli |
| option CLI | `--config-file` | cli |
| option CLI | `--diagnostic-dir` | cli |
| option CLI | `--disable-proto` | cli |
| option CLI | `--disable-sigusr1` | cli |
| option CLI | `--disable-wasm-trap-handler` | cli |
| option CLI | `--enable-fips` | cli |
| option CLI | `--enable-fips-indicator-events` | cli |
| option CLI | `--enable-source-maps` | cli |
| option CLI | `--entry-url` | cli |
| option CLI | `--env-file-if-exists` | cli |
| option CLI | `--experimental-addon-modules` | cli |
| option CLI | `--experimental-bench` | cli |
| option CLI | `--experimental-dtls` | cli |
| option CLI | `--experimental-eventsource` | cli |
| option CLI | `--experimental-import-meta-resolve` | cli |
| option CLI | `--experimental-import-text` | cli |
| option CLI | `--experimental-inspector-network-resource` | cli |
| option CLI | `--experimental-loader` | cli |
| option CLI | `--experimental-network-inspection` | cli |
| option CLI | `--experimental-package-map` | cli |
| option CLI | `--experimental-print-required-tla` | cli |
| option CLI | `--experimental-quic` | cli |
| option CLI | `--experimental-sea-config` | cli |
| option CLI | `--experimental-shadow-realm` | cli |
| option CLI | `--experimental-storage-inspection` | cli |
| option CLI | `--experimental-test-coverage` | cli |
| option CLI | `--experimental-test-module-mocks` | cli |
| option CLI | `--experimental-test-tag-filter` | cli |
| option CLI | `--experimental-vfs` | cli |
| option CLI | `--experimental-vm-modules` | cli |
| option CLI | `--experimental-wasi-unstable-preview1` | cli |
| option CLI | `--experimental-web-worker` | cli |
| option CLI | `--experimental-worker-inspection` | cli |
| option CLI | `--force-context-aware` | cli |
| option CLI | `--force-fips[` | cli |
| option CLI | `--force-node-api-uncaught-exceptions-policy` | cli |
| option CLI | `--frozen-intrinsics` | cli |
| option CLI | `--heapsnapshot-near-heap-limit` | cli |
| option CLI | `--heapsnapshot-signal` | cli |
| option CLI | `--icu-data-dir` | cli |
| option CLI | `--input-type` | cli |
| option CLI | `--inspect-brk[` | cli |
| option CLI | `--inspect-port` | cli |
| option CLI | `--inspect-publish-uid` | cli |
| option CLI | `--inspect-wait[` | cli |
| option CLI | `--inspect[` | cli |
| option CLI | `--jitless` | cli |
| option CLI | `--localstorage-file` | cli |
| option CLI | `--max-old-space-size-percentage` | cli |
| option CLI | `--network-family-autoselection-attempt-timeout` | cli |
| option CLI | `--no-experimental-detect-module` | cli |
| option CLI | `--no-experimental-ffi` | cli |
| option CLI | `--no-experimental-global-navigator` | cli |
| option CLI | `--no-experimental-require-module` | cli |
| option CLI | `--no-experimental-sqlite` | cli |
| option CLI | `--no-experimental-webstorage` | cli |
| option CLI | `--no-extra-info-on-fatal-exception` | cli |
| option CLI | `--no-force-async-hooks-checks` | cli |
| option CLI | `--no-global-search-paths` | cli |
| option CLI | `--no-network-family-autoselection` | cli |
| option CLI | `--no-require-module` | cli |
| option CLI | `--no-strip-types` | cli |
| option CLI | `--no-worker-snapshot` | cli |
| option CLI | `--node-memory-debug` | cli |
| option CLI | `--openssl-config` | cli |
| option CLI | `--openssl-legacy-provider` | cli |
| option CLI | `--openssl-shared-config` | cli |
| option CLI | `--permission` | cli |
| option CLI | `--permission-audit` | cli |
| option CLI | `--process-timeout` | cli |
| option CLI | `--prof` | cli |
| option CLI | `--prof-process` | cli |
| option CLI | `--report-compact` | cli |
| option CLI | `--report-dir` | cli |
| option CLI | `--report-exclude-env` | cli |
| option CLI | `--report-exclude-network` | cli |
| option CLI | `--report-filename` | cli |
| option CLI | `--report-on-fatalerror` | cli |
| option CLI | `--report-on-process-timeout` | cli |
| option CLI | `--report-on-signal` | cli |
| option CLI | `--report-signal` | cli |
| option CLI | `--report-uncaught-exception` | cli |
| option CLI | `--run` | cli |
| option CLI | `--secure-heap-min` | cli |
| option CLI | `--secure-heap` | cli |
| option CLI | `--snapshot-blob` | cli |
| option CLI | `--test` | cli |
| option CLI | `--test-concurrency` | cli |
| option CLI | `--test-coverage-branches` | cli |
| option CLI | `--test-coverage-exclude` | cli |
| option CLI | `--test-coverage-functions` | cli |
| option CLI | `--test-coverage-include` | cli |
| option CLI | `--test-coverage-include-all` | cli |
| option CLI | `--test-coverage-lines` | cli |
| option CLI | `--test-force-exit` | cli |
| option CLI | `--test-global-setup` | cli |
| option CLI | `--test-isolation` | cli |
| option CLI | `--test-only` | cli |
| option CLI | `--test-random-seed` | cli |
| option CLI | `--test-randomize` | cli |
| option CLI | `--test-reporter` | cli |
| option CLI | `--test-reporter-destination` | cli |
| option CLI | `--test-rerun-failures` | cli |
| option CLI | `--test-shard` | cli |
| option CLI | `--test-skip-pattern` | cli |
| option CLI | `--test-timeout` | cli |
| option CLI | `--test-update-snapshots` | cli |
| option CLI | `--tls-cipher-list` | cli |
| option CLI | `--tls-keylog` | cli |
| option CLI | `--trace-require-module` | cli |
| option CLI | `--trace-sigint` | cli |
| option CLI | `--trace-sync-io` | cli |
| option CLI | `--trace-tls` | cli |
| option CLI | `--trace-uncaught` | cli |
| option CLI | `--track-heap-objects` | cli |
| option CLI | `--use-env-proxy` | cli |
| option CLI | `--use-largepages` | cli |
| option CLI | `--v8-options` | cli |
| option CLI | `--v8-pool-size` | cli |
| option CLI | `--vfs-load` | cli |
| option CLI | `--watch-path` | cli |
| option CLI | `--watch-preserve-output` | cli |
| variable d'environnement | `NODE_COMPILE_CACHE_READONLY` | cli |
| variable d'environnement | `NODE_PENDING_PIPE_INSTANCES` | cli |
| variable d'environnement | `NODE_SKIP_PLATFORM_CHECK` | cli |
| option CLI | `--enable-etw-stack-walking` | cli |
| option CLI | `--harmony-shadow-realm` | cli |
| option CLI | `--heap-snapshot-on-oom` | cli |
| option CLI | `--interpreted-frames-native-stack` | cli |
| option CLI | `--max-heap-size` | cli |
| option CLI | `--max-semi-space-size` | cli |
| option CLI | `--perf-basic-prof` | cli |
| option CLI | `--perf-basic-prof-only-functions` | cli |
| option CLI | `--perf-prof` | cli |
| option CLI | `--perf-prof-unwinding-info` | cli |
| option CLI | `--security-revert` | cli |
| api | `cluster.worker` | doc/api/cluster.md |
| api | `socket` | doc/api/dgram.md |
| classe | `BoundedChannel` | doc/api/diagnostics_channel.md |
| api | `start` | doc/api/diagnostics_channel.md |
| api | `end` | doc/api/diagnostics_channel.md |
| api | `asyncStart` | doc/api/diagnostics_channel.md |
| api | `asyncEnd` | doc/api/diagnostics_channel.md |
| api | `error` | doc/api/diagnostics_channel.md |
| api | `Resolver` | doc/api/dns.md |
| api | `dns.resolveTlsa` | doc/api/dns.md |
| api | `dnsPromises.resolveTlsa` | doc/api/dns.md |
| classe | `Domain` | doc/api/domain.md |
| api | `domain.members` | doc/api/domain.md |
| api | `domain.add` | doc/api/domain.md |
| api | `domain.bind` | doc/api/domain.md |
| api | `domain.enter` | doc/api/domain.md |
| api | `domain.exit` | doc/api/domain.md |
| api | `domain.intercept` | doc/api/domain.md |
| api | `domain.remove` | doc/api/domain.md |
| api | `domain.run` | doc/api/domain.md |
| classe | `DTLSSecureContext` | doc/api/dtls.md |
| classe | `DTLSEndpoint` | doc/api/dtls.md |
| api | `endpoint` | doc/api/dtls.md |
| classe | `DTLSSession` | doc/api/dtls.md |
| api | `session` | doc/api/dtls.md |
| api | `export` | doc/api/environment_variables.md |
| code d'erreur | `ERR_ASYNC_LOADER_REQUEST_NEVER_SETTLED` | doc/api/errors.md |
| code d'erreur | `ERR_ASYNC_RESOURCE_DOMAIN_REMOVED` | doc/api/errors.md |
| code d'erreur | `ERR_BUFFER_CONTEXT_NOT_AVAILABLE` | doc/api/errors.md |
| code d'erreur | `ERR_CHILD_CLOSED_BEFORE_REPLY` | doc/api/errors.md |
| code d'erreur | `ERR_CONTEXT_NOT_INITIALIZED` | doc/api/errors.md |
| code d'erreur | `ERR_CPU_PROFILE_ALREADY_STARTED` | doc/api/errors.md |
| code d'erreur | `ERR_CPU_PROFILE_NOT_STARTED` | doc/api/errors.md |
| code d'erreur | `ERR_CPU_PROFILE_TOO_MANY` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_ARGON2_NOT_SUPPORTED` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_ENGINE_UNKNOWN` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_FIPS_FORCED` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_FIPS_UNAVAILABLE` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_INITIALIZATION_FAILED` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_INVALID_COUNTER` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_INVALID_MAC` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_INVALID_TAG_LENGTH` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_JOB_INIT_FAILED` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_KEM_NOT_SUPPORTED` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_MAC_FINALIZED` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_MAC_NOT_SUPPORTED` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_MAC_UPDATE_FAILED` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_PBKDF2_ERROR` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_SCRYPT_NOT_SUPPORTED` | doc/api/errors.md |
| code d'erreur | `ERR_DEBUGGER_ERROR` | doc/api/errors.md |
| code d'erreur | `ERR_DEBUGGER_STARTUP_ERROR` | doc/api/errors.md |
| code d'erreur | `ERR_DOMAIN_CALLBACK_NOT_AVAILABLE` | doc/api/errors.md |
| code d'erreur | `ERR_DOMAIN_CANNOT_SET_UNCAUGHT_EXCEPTION_CAPTURE` | doc/api/errors.md |
| code d'erreur | `ERR_DUPLICATE_STARTUP_SNAPSHOT_MAIN_FUNCTION` | doc/api/errors.md |
| code d'erreur | `ERR_EVAL_ESM_CANNOT_PRINT` | doc/api/errors.md |
| code d'erreur | `ERR_EXECUTION_ENVIRONMENT_NOT_AVAILABLE` | doc/api/errors.md |
| code d'erreur | `ERR_FFI_CALL_FAILED` | doc/api/errors.md |
| code d'erreur | `ERR_FFI_INVALID_POINTER` | doc/api/errors.md |
| code d'erreur | `ERR_FFI_LIBRARY_CLOSED` | doc/api/errors.md |
| code d'erreur | `ERR_FS_FILE_TOO_LARGE` | doc/api/errors.md |
| code d'erreur | `ERR_FS_WATCH_QUEUE_OVERFLOW` | doc/api/errors.md |
| code d'erreur | `ERR_HTTP2_NO_MEM` | doc/api/errors.md |
| code d'erreur | `ERR_HTTP2_SETTINGS_CANCEL` | doc/api/errors.md |
| code d'erreur | `ERR_HTTP2_STREAM_ABORTED` | doc/api/errors.md |
| code d'erreur | `ERR_HTTP2_STREAM_SELF_DEPENDENCY` | doc/api/errors.md |
| code d'erreur | `ERR_HTTP2_TOO_MANY_ORIGINS` | doc/api/errors.md |
| code d'erreur | `ERR_IMPORT_ATTRIBUTE_MISSING` | doc/api/errors.md |
| code d'erreur | `ERR_IMPORT_ATTRIBUTE_TYPE_INCOMPATIBLE` | doc/api/errors.md |
| code d'erreur | `ERR_IMPORT_ATTRIBUTE_UNSUPPORTED` | doc/api/errors.md |
| code d'erreur | `ERR_INPUT_TYPE_NOT_ALLOWED` | doc/api/errors.md |
| code d'erreur | `ERR_INSPECTOR_CLOSED` | doc/api/errors.md |
| code d'erreur | `ERR_INVALID_ADDRESS` | doc/api/errors.md |
| code d'erreur | `ERR_INVALID_FD` | doc/api/errors.md |
| code d'erreur | `ERR_INVALID_MODULE_SPECIFIER` | doc/api/errors.md |
| code d'erreur | `ERR_INVALID_PACKAGE_CONFIG` | doc/api/errors.md |
| code d'erreur | `ERR_INVALID_PACKAGE_TARGET` | doc/api/errors.md |
| code d'erreur | `ERR_INVALID_RETURN_PROPERTY` | doc/api/errors.md |
| code d'erreur | `ERR_INVALID_RETURN_PROPERTY_VALUE` | doc/api/errors.md |
| code d'erreur | `ERR_INVALID_TUPLE` | doc/api/errors.md |
| code d'erreur | `ERR_INVALID_TYPESCRIPT_SYNTAX` | doc/api/errors.md |
| code d'erreur | `ERR_INVALID_URL_PATTERN` | doc/api/errors.md |
| code d'erreur | `ERR_LOADER_CHAIN_INCOMPLETE` | doc/api/errors.md |
| code d'erreur | `ERR_MESSAGE_TARGET_CONTEXT_UNAVAILABLE` | doc/api/errors.md |
| code d'erreur | `ERR_MISSING_PLATFORM_FOR_WORKER` | doc/api/errors.md |
| code d'erreur | `ERR_NAPI_INVALID_TYPEDARRAY_ALIGNMENT` | doc/api/errors.md |
| code d'erreur | `ERR_NAPI_INVALID_TYPEDARRAY_LENGTH` | doc/api/errors.md |
| code d'erreur | `ERR_NAPI_TSFN_CALL_JS` | doc/api/errors.md |
| code d'erreur | `ERR_NAPI_TSFN_GET_UNDEFINED` | doc/api/errors.md |
| code d'erreur | `ERR_NON_CONTEXT_AWARE_DISABLED` | doc/api/errors.md |
| code d'erreur | `ERR_NOT_IN_SINGLE_EXECUTABLE_APPLICATION` | doc/api/errors.md |
| code d'erreur | `ERR_NOT_SUPPORTED_IN_SNAPSHOT` | doc/api/errors.md |
| code d'erreur | `ERR_NO_CRYPTO` | doc/api/errors.md |
| code d'erreur | `ERR_NO_ICU` | doc/api/errors.md |
| code d'erreur | `ERR_NO_TEMPORAL` | doc/api/errors.md |
| code d'erreur | `ERR_NO_TYPESCRIPT` | doc/api/errors.md |
| code d'erreur | `ERR_OPTIONS_BEFORE_BOOTSTRAPPING` | doc/api/errors.md |
| code d'erreur | `ERR_PACKAGE_IMPORT_NOT_DEFINED` | doc/api/errors.md |
| code d'erreur | `ERR_PACKAGE_MAP_EXTERNAL_FILE` | doc/api/errors.md |
| code d'erreur | `ERR_PACKAGE_MAP_INVALID` | doc/api/errors.md |
| code d'erreur | `ERR_PACKAGE_MAP_KEY_NOT_FOUND` | doc/api/errors.md |
| code d'erreur | `ERR_PACKAGE_PATH_NOT_EXPORTED` | doc/api/errors.md |
| code d'erreur | `ERR_PERFORMANCE_INVALID_TIMESTAMP` | doc/api/errors.md |
| code d'erreur | `ERR_PERFORMANCE_MEASURE_INVALID_OPTIONS` | doc/api/errors.md |
| code d'erreur | `ERR_REQUIRE_ASYNC_MODULE` | doc/api/errors.md |
| code d'erreur | `ERR_REQUIRE_CYCLE_MODULE` | doc/api/errors.md |
| code d'erreur | `ERR_REQUIRE_ESM_RACE_CONDITION` | doc/api/errors.md |
| code d'erreur | `ERR_SINGLE_EXECUTABLE_APPLICATION_ASSET_NOT_FOUND` | doc/api/errors.md |
| code d'erreur | `ERR_SOCKET_HANDLE_ADOPTED` | doc/api/errors.md |
| code d'erreur | `ERR_SOURCE_MAP_CORRUPT` | doc/api/errors.md |
| code d'erreur | `ERR_SOURCE_MAP_MISSING_SOURCE` | doc/api/errors.md |
| code d'erreur | `ERR_SOURCE_PHASE_NOT_DEFINED` | doc/api/errors.md |
| code d'erreur | `ERR_SRI_PARSE` | doc/api/errors.md |
| code d'erreur | `ERR_THROTTLED` | doc/api/errors.md |
| code d'erreur | `ERR_TLS_DH_PARAM_SIZE` | doc/api/errors.md |
| code d'erreur | `ERR_TLS_INVALID_CONTEXT` | doc/api/errors.md |
| code d'erreur | `ERR_TLS_PSK_SET_IDENTITY_HINT_FAILED` | doc/api/errors.md |
| code d'erreur | `ERR_TLS_REQUIRED_SERVER_NAME` | doc/api/errors.md |
| code d'erreur | `ERR_TLS_SESSION_ATTACK` | doc/api/errors.md |
| code d'erreur | `ERR_TTY_INIT_FAILED` | doc/api/errors.md |
| code d'erreur | `ERR_UNKNOWN_FILE_EXTENSION` | doc/api/errors.md |
| code d'erreur | `ERR_UNKNOWN_MODULE_FORMAT` | doc/api/errors.md |
| code d'erreur | `ERR_UNSUPPORTED_DIR_IMPORT` | doc/api/errors.md |
| code d'erreur | `ERR_UNSUPPORTED_ESM_URL_SCHEME` | doc/api/errors.md |
| code d'erreur | `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` | doc/api/errors.md |
| code d'erreur | `ERR_UNSUPPORTED_RESOLVE_REQUEST` | doc/api/errors.md |
| code d'erreur | `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` | doc/api/errors.md |
| code d'erreur | `ERR_VALID_PERFORMANCE_ENTRY_TYPE` | doc/api/errors.md |
| code d'erreur | `ERR_VFS_INVALID_TARGET` | doc/api/errors.md |
| code d'erreur | `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG` | doc/api/errors.md |
| code d'erreur | `ERR_WASI_ALREADY_STARTED` | doc/api/errors.md |
| code d'erreur | `ERR_WASI_NOT_STARTED` | doc/api/errors.md |
| code d'erreur | `ERR_WEBASSEMBLY_NOT_SUPPORTED` | doc/api/errors.md |
| code d'erreur | `ERR_WORKER_HANDLE_NOT_TRANSFERABLE` | doc/api/errors.md |
| code d'erreur | `ERR_WORKER_INIT_FAILED` | doc/api/errors.md |
| code d'erreur | `ERR_WORKER_OUT_OF_MEMORY` | doc/api/errors.md |
| code d'erreur | `ERR_WORKER_UNSERIALIZABLE_ERROR` | doc/api/errors.md |
| code d'erreur | `ERR_ZIP_ARCHIVE_TOO_LARGE` | doc/api/errors.md |
| code d'erreur | `ERR_ZIP_ENTRY_CORRUPT` | doc/api/errors.md |
| code d'erreur | `ERR_ZIP_ENTRY_NOT_FOUND` | doc/api/errors.md |
| code d'erreur | `ERR_ZIP_ENTRY_TOO_LARGE` | doc/api/errors.md |
| code d'erreur | `ERR_ZIP_INVALID_ARCHIVE` | doc/api/errors.md |
| code d'erreur | `ERR_ZIP_NOT_WRITABLE` | doc/api/errors.md |
| code d'erreur | `ERR_ZIP_UNSUPPORTED_FEATURE` | doc/api/errors.md |
| code d'erreur | `ERR_CANNOT_TRANSFER_OBJECT` | doc/api/errors.md |
| code d'erreur | `ERR_CPU_USAGE` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_HASH_DIGEST_NO_UTF16` | doc/api/errors.md |
| code d'erreur | `ERR_CRYPTO_SCRYPT_INVALID_PARAMETER` | doc/api/errors.md |
| code d'erreur | `ERR_FS_INVALID_SYMLINK_TYPE` | doc/api/errors.md |
| code d'erreur | `ERR_HTTP2_FRAME_ERROR` | doc/api/errors.md |
| code d'erreur | `ERR_HTTP2_HEADERS_OBJECT` | doc/api/errors.md |
| code d'erreur | `ERR_HTTP2_HEADER_REQUIRED` | doc/api/errors.md |
| code d'erreur | `ERR_HTTP2_INFO_HEADERS_AFTER_RESPOND` | doc/api/errors.md |
| code d'erreur | `ERR_HTTP2_STREAM_CLOSED` | doc/api/errors.md |
| code d'erreur | `ERR_HTTP_INVALID_CHAR` | doc/api/errors.md |
| code d'erreur | `ERR_IMPORT_ASSERTION_TYPE_FAILED` | doc/api/errors.md |
| code d'erreur | `ERR_IMPORT_ASSERTION_TYPE_MISSING` | doc/api/errors.md |
| code d'erreur | `ERR_IMPORT_ASSERTION_TYPE_UNSUPPORTED` | doc/api/errors.md |
| code d'erreur | `ERR_INDEX_OUT_OF_RANGE` | doc/api/errors.md |
| code d'erreur | `ERR_INVALID_PERFORMANCE_MARK` | doc/api/errors.md |
| code d'erreur | `ERR_INVALID_TRANSFER_OBJECT` | doc/api/errors.md |
| code d'erreur | `ERR_MANIFEST_ASSERT_INTEGRITY` | doc/api/errors.md |
| code d'erreur | `ERR_MANIFEST_DEPENDENCY_MISSING` | doc/api/errors.md |
| code d'erreur | `ERR_MANIFEST_INTEGRITY_MISMATCH` | doc/api/errors.md |
| code d'erreur | `ERR_MANIFEST_INVALID_RESOURCE_FIELD` | doc/api/errors.md |
| code d'erreur | `ERR_MANIFEST_INVALID_SPECIFIER` | doc/api/errors.md |
| code d'erreur | `ERR_MANIFEST_PARSE_POLICY` | doc/api/errors.md |
| code d'erreur | `ERR_MANIFEST_TDZ` | doc/api/errors.md |
| code d'erreur | `ERR_MANIFEST_UNKNOWN_ONERROR` | doc/api/errors.md |
| code d'erreur | `ERR_MISSING_MESSAGE_PORT_IN_TRANSFER_LIST` | doc/api/errors.md |
| code d'erreur | `ERR_MISSING_TRANSFERABLE_IN_TRANSFER_LIST` | doc/api/errors.md |
| code d'erreur | `ERR_NAPI_CONS_PROTOTYPE_OBJECT` | doc/api/errors.md |
| code d'erreur | `ERR_NAPI_TSFN_START_IDLE_LOOP` | doc/api/errors.md |
| code d'erreur | `ERR_NAPI_TSFN_STOP_IDLE_LOOP` | doc/api/errors.md |
| code d'erreur | `ERR_NO_LONGER_SUPPORTED` | doc/api/errors.md |
| code d'erreur | `ERR_OUTOFMEMORY` | doc/api/errors.md |
| code d'erreur | `ERR_PARSE_HISTORY_DATA` | doc/api/errors.md |
| code d'erreur | `ERR_SOCKET_CANNOT_SEND` | doc/api/errors.md |
| code d'erreur | `ERR_STDERR_CLOSE` | doc/api/errors.md |
| code d'erreur | `ERR_STDOUT_CLOSE` | doc/api/errors.md |
| code d'erreur | `ERR_STREAM_READ_NOT_IMPLEMENTED` | doc/api/errors.md |
| code d'erreur | `ERR_TAP_LEXER_ERROR` | doc/api/errors.md |
| code d'erreur | `ERR_TAP_PARSER_ERROR` | doc/api/errors.md |
| code d'erreur | `ERR_TAP_VALIDATION_ERROR` | doc/api/errors.md |
| code d'erreur | `ERR_TLS_RENEGOTIATION_FAILED` | doc/api/errors.md |
| code d'erreur | `ERR_TRANSFERRING_EXTERNALIZED_SHAREDARRAYBUFFER` | doc/api/errors.md |
| code d'erreur | `ERR_UNKNOWN_STDIN_TYPE` | doc/api/errors.md |
| code d'erreur | `ERR_UNKNOWN_STREAM_TYPE` | doc/api/errors.md |
| code d'erreur | `ERR_V8BREAKITERATOR` | doc/api/errors.md |
| code d'erreur | `ERR_VM_MODULE_LINKING_ERRORED` | doc/api/errors.md |
| code d'erreur | `ERR_VM_MODULE_NOT_LINKED` | doc/api/errors.md |
| code d'erreur | `ERR_WORKER_UNSUPPORTED_EXTENSION` | doc/api/errors.md |
| code d'erreur | `ERR_ZLIB_BINDING_CLOSED` | doc/api/errors.md |
| api | `import` | doc/api/esm.md |
| api | `emitter` | doc/api/events.md |
| api | `NodeEventTarget` | doc/api/events.md |
| classe | `DynamicLibrary` | doc/api/ffi.md |
| api | `library` | doc/api/ffi.md |
| api | `filehandle` | doc/api/fs.md |
| api | `fs.lchmod` | doc/api/fs.md |
| api | `fs.lchmodSync` | doc/api/fs.md |
| api | `fs.openAsBlobSync` | doc/api/fs.md |
| api | `dir` | doc/api/fs.md |
| classe | `fs.FSWatcher` | doc/api/fs.md |
| classe | `fs.StatWatcher` | doc/api/fs.md |
| classe | `fs.StatFs` | doc/api/fs.md |
| api | `utf8Stream` | doc/api/fs.md |
| global | `localStorage` | doc/api/globals.md |
| global | `navigator.language` | doc/api/globals.md |
| global | `navigator.languages` | doc/api/globals.md |
| global | `navigator.locks` | doc/api/globals.md |
| global | `sessionStorage` | doc/api/globals.md |
| api | `server` | doc/api/http.md |
| api | `NO_PROXY` | doc/api/http.md |
| api | `inspector.Network.dataReceived` | doc/api/inspector.md |
| api | `inspector.Network.dataSent` | doc/api/inspector.md |
| api | `inspector.Network.requestWillBeSent` | doc/api/inspector.md |
| api | `inspector.Network.responseReceived` | doc/api/inspector.md |
| api | `inspector.Network.loadingFinished` | doc/api/inspector.md |
| api | `inspector.Network.loadingFailed` | doc/api/inspector.md |
| api | `inspector.Network.webSocketCreated` | doc/api/inspector.md |
| api | `inspector.Network.webSocketHandshakeResponseReceived` | doc/api/inspector.md |
| api | `inspector.Network.webSocketClosed` | doc/api/inspector.md |
| api | `inspector.NetworkResources.put` | doc/api/inspector.md |
| api | `inspector.DOMStorage.domStorageItemAdded` | doc/api/inspector.md |
| api | `inspector.DOMStorage.domStorageItemRemoved` | doc/api/inspector.md |
| api | `inspector.DOMStorage.domStorageItemUpdated` | doc/api/inspector.md |
| api | `inspector.DOMStorage.domStorageItemsCleared` | doc/api/inspector.md |
| api | `inspector.DOMStorage.registerStorage` | doc/api/inspector.md |
| api | `module.findPackageJSON` | doc/api/module.md |
| api | `module.registerHooks` | doc/api/module.md |
| api | `module.stripTypeScriptTypes` | doc/api/module.md |
| api | `initialize` | doc/api/module.md |
| api | `module.getSourceMapsSupport` | doc/api/module.md |
| api | `module.setSourceMapsSupport` | doc/api/module.md |
| api | `module.children` | doc/api/modules.md |
| api | `module.filename` | doc/api/modules.md |
| api | `module.id` | doc/api/modules.md |
| api | `module.isPreloading` | doc/api/modules.md |
| api | `module.loaded` | doc/api/modules.md |
| api | `module.parent` | doc/api/modules.md |
| api | `module.path` | doc/api/modules.md |
| api | `module.paths` | doc/api/modules.md |
| api | `module.require` | doc/api/modules.md |
| api | `boundSocket` | doc/api/net.md |
| api | `histogram` | doc/api/perf_hooks.md |
| process | `process.addUncaughtExceptionCaptureCallback` | doc/api/process.md |
| process | `process.channel` | doc/api/process.md |
| process | `process.channel.ref` | doc/api/process.md |
| process | `process.channel.unref` | doc/api/process.md |
| process | `process.disconnect` | doc/api/process.md |
| process | `process.exitCode` | doc/api/process.md |
| process | `process.getegid` | doc/api/process.md |
| process | `process.geteuid` | doc/api/process.md |
| process | `process.getgid` | doc/api/process.md |
| process | `process.getgroups` | doc/api/process.md |
| process | `process.getuid` | doc/api/process.md |
| process | `process.initgroups` | doc/api/process.md |
| process | `process.mainModule` | doc/api/process.md |
| process | `process.noDeprecation` | doc/api/process.md |
| process | `process.permission` | doc/api/process.md |
| process | `process.permission.has` | doc/api/process.md |
| process | `process.permission.drop` | doc/api/process.md |
| process | `process.report.signal` | doc/api/process.md |
| process | `process.send` | doc/api/process.md |
| process | `process.setegid` | doc/api/process.md |
| process | `process.seteuid` | doc/api/process.md |
| process | `process.setgid` | doc/api/process.md |
| process | `process.setgroups` | doc/api/process.md |
| process | `process.setuid` | doc/api/process.md |
| process | `process.sourceMapsEnabled` | doc/api/process.md |
| process | `process.throwDeprecation` | doc/api/process.md |
| process | `process.traceDeprecation` | doc/api/process.md |
| process | `process.traceProcessWarnings` | doc/api/process.md |
| api | `stream.opened` | doc/api/quic.md |
| api | `stream.closed` | doc/api/quic.md |
| api | `stream.destroyed` | doc/api/quic.md |
| api | `stream.resetStream` | doc/api/quic.md |
| api | `stream.stopSending` | doc/api/quic.md |
| api | `stream.early` | doc/api/quic.md |
| api | `stream.direction` | doc/api/quic.md |
| api | `stream.budget` | doc/api/quic.md |
| api | `stream.id` | doc/api/quic.md |
| api | `stream.onerror` | doc/api/quic.md |
| api | `stream.onblocked` | doc/api/quic.md |
| api | `stream.onreset` | doc/api/quic.md |
| api | `stream.onstopsending` | doc/api/quic.md |
| api | `stream.headers` | doc/api/quic.md |
| api | `stream.onheaders` | doc/api/quic.md |
| api | `stream.ontrailers` | doc/api/quic.md |
| api | `stream.oninfo` | doc/api/quic.md |
| api | `stream.onwanttrailers` | doc/api/quic.md |
| api | `stream.pendingTrailers` | doc/api/quic.md |
| api | `stream.sendHeaders` | doc/api/quic.md |
| api | `stream.sendInformationalHeaders` | doc/api/quic.md |
| api | `stream.sendTrailers` | doc/api/quic.md |
| api | `stream.priority` | doc/api/quic.md |
| api | `stream.setPriority` | doc/api/quic.md |
| api | `stream.writer` | doc/api/quic.md |
| api | `stream.setBody` | doc/api/quic.md |
| api | `stream.session` | doc/api/quic.md |
| api | `stream.stats` | doc/api/quic.md |
| api | `rl` | doc/api/readline.md |
| api | `await` | doc/api/repl.md |
| classe | `Database` | doc/api/sqlite.md |
| api | `database` | doc/api/sqlite.md |
| classe | `Statement` | doc/api/sqlite.md |
| api | `statement` | doc/api/sqlite.md |
| api | `writable` | doc/api/stream.md |
| api | `readable` | doc/api/stream.md |
| api | `highWaterMark` | doc/api/stream.md |
| api | `writer` | doc/api/stream_iter.md |
| api | `from` | doc/api/stream_iter.md |
| api | `fromSync` | doc/api/stream_iter.md |
| api | `pipeTo` | doc/api/stream_iter.md |
| api | `pipeToSync` | doc/api/stream_iter.md |
| api | `pull` | doc/api/stream_iter.md |
| api | `pullSync` | doc/api/stream_iter.md |
| api | `push` | doc/api/stream_iter.md |
| api | `duplex` | doc/api/stream_iter.md |
| api | `array` | doc/api/stream_iter.md |
| api | `arrayBuffer` | doc/api/stream_iter.md |
| api | `arrayBufferSync` | doc/api/stream_iter.md |
| api | `arraySync` | doc/api/stream_iter.md |
| api | `bytes` | doc/api/stream_iter.md |
| api | `bytesSync` | doc/api/stream_iter.md |
| api | `dump` | doc/api/stream_iter.md |
| api | `dumpSync` | doc/api/stream_iter.md |
| api | `text` | doc/api/stream_iter.md |
| api | `textSync` | doc/api/stream_iter.md |
| api | `ondrain` | doc/api/stream_iter.md |
| api | `merge` | doc/api/stream_iter.md |
| api | `tap` | doc/api/stream_iter.md |
| api | `tapSync` | doc/api/stream_iter.md |
| api | `broadcast` | doc/api/stream_iter.md |
| api | `share` | doc/api/stream_iter.md |
| api | `sharable` | doc/api/stream_iter.md |
| api | `shareSync` | doc/api/stream_iter.md |
| api | `fromReadable` | doc/api/stream_iter.md |
| api | `fromWritable` | doc/api/stream_iter.md |
| api | `toReadable` | doc/api/stream_iter.md |
| api | `toReadableSync` | doc/api/stream_iter.md |
| api | `toWritable` | doc/api/stream_iter.md |
| api | `stringDecoder.end` | doc/api/string_decoder.md |
| api | `stringDecoder.write` | doc/api/string_decoder.md |
| api | `only` | doc/api/test.md |
| api | `it` | doc/api/test.md |
| api | `assert.register` | doc/api/test.md |
| api | `snapshot` | doc/api/test.md |
| api | `timers.enable` | doc/api/test.md |
| api | `timers.reset` | doc/api/test.md |
| api | `timers.tick` | doc/api/test.md |
| api | `timers.runAll` | doc/api/test.md |
| api | `timers.setTime` | doc/api/test.md |
| api | `getTestContext` | doc/api/test.md |
| api | `immediate` | doc/api/timers.md |
| api | `timeout` | doc/api/timers.md |
| api | `Tracing` | doc/api/tracing.md |
| api | `url.hash` | doc/api/url.md |
| api | `url.host` | doc/api/url.md |
| api | `url.hostname` | doc/api/url.md |
| api | `url.href` | doc/api/url.md |
| api | `url.origin` | doc/api/url.md |
| api | `url.password` | doc/api/url.md |
| api | `url.pathname` | doc/api/url.md |
| api | `url.port` | doc/api/url.md |
| api | `url.protocol` | doc/api/url.md |
| api | `url.search` | doc/api/url.md |
| api | `url.searchParams` | doc/api/url.md |
| api | `url.username` | doc/api/url.md |
| api | `url.toJSON` | doc/api/url.md |
| api | `urlSearchParams` | doc/api/url.md |
| api | `debuglog` | doc/api/util.md |
| api | `util.debounce` | doc/api/util.md |
| api | `util.throttle` | doc/api/util.md |
| api | `util.diff` | doc/api/util.md |
| api | `mimeParams` | doc/api/util.md |
| api | `parseArgs` | doc/api/util.md |
| api | `settled` | doc/api/v8.md |
| api | `profiler` | doc/api/v8.md |
| api | `syncCpuProfileHandle` | doc/api/v8.md |
| api | `syncHeapProfileHandle` | doc/api/v8.md |
| api | `cpuProfileHandle` | doc/api/v8.md |
| api | `heapProfileHandle` | doc/api/v8.md |
| classe | `VirtualFileSystem` | doc/api/vfs.md |
| api | `vfs.mount` | doc/api/vfs.md |
| api | `vfs.unmount` | doc/api/vfs.md |
| api | `vfs.mounted` | doc/api/vfs.md |
| api | `vfs.mountPoint` | doc/api/vfs.md |
| api | `vfs.mountPointURL` | doc/api/vfs.md |
| api | `vfs.provider` | doc/api/vfs.md |
| api | `vfs.readonly` | doc/api/vfs.md |
| classe | `VirtualProvider` | doc/api/vfs.md |
| classe | `MemoryProvider` | doc/api/vfs.md |
| classe | `ComposableProvider` | doc/api/vfs.md |
| classe | `RealFSProvider` | doc/api/vfs.md |
| classe | `ZipProvider` | doc/api/vfs.md |
| api | `Stats` | doc/api/vfs.md |
| api | `module.error` | doc/api/vm.md |
| api | `module.evaluate` | doc/api/vm.md |
| api | `module.identifier` | doc/api/vm.md |
| api | `module.link` | doc/api/vm.md |
| api | `module.namespace` | doc/api/vm.md |
| api | `module.status` | doc/api/vm.md |
| api | `wasi.getImportObject` | doc/api/wasi.md |
| api | `wasi.start` | doc/api/wasi.md |
| api | `wasi.initialize` | doc/api/wasi.md |
| api | `wasi.finalizeBindings` | doc/api/wasi.md |
| api | `wasi.wasiImport` | doc/api/wasi.md |
| api | `ReadableStreamTee` | doc/api/webstreams.md |
| api | `worker_threads.locks` | doc/api/worker_threads.md |
| api | `worker` | doc/api/worker_threads.md |
| classe | `zlib.ZipBuffer` | doc/api/zlib.md |
| classe | `zlib.ZipEntry` | doc/api/zlib.md |
| api | `zlib.ZipEntry.create` | doc/api/zlib.md |
| api | `zlib.ZipEntry.createStream` | doc/api/zlib.md |
| api | `zlib.ZipEntry.createSymlink` | doc/api/zlib.md |
| api | `zlib.ZipEntry.createSync` | doc/api/zlib.md |
| api | `zlib.ZipEntry.read` | doc/api/zlib.md |
| classe | `zlib.ZipFile` | doc/api/zlib.md |
| api | `zlib.ZipFile.open` | doc/api/zlib.md |
| api | `zlib.ZipFile.openSync` | doc/api/zlib.md |
| classe | `zlib.ZlibBase` | doc/api/zlib.md |
| api | `zlib.bytesWritten` | doc/api/zlib.md |
| api | `zlib.close` | doc/api/zlib.md |
| api | `zlib.flush` | doc/api/zlib.md |
| api | `zlib.params` | doc/api/zlib.md |
| api | `zlib.reset` | doc/api/zlib.md |
| api | `zlib.createZipArchive` | doc/api/zlib.md |
| api | `zlib.createZipArchiveSync` | doc/api/zlib.md |
| api | `zlib.zipFiles` | doc/api/zlib.md |
| api | `zlib.getMaxZipContentSize` | doc/api/zlib.md |
| api | `zlib.setMaxZipContentSize` | doc/api/zlib.md |
| api | `compressBrotli` | doc/api/zlib.md |
| api | `compressBrotliSync` | doc/api/zlib.md |
| api | `compressDeflate` | doc/api/zlib.md |
| api | `compressDeflateSync` | doc/api/zlib.md |
| api | `compressGzip` | doc/api/zlib.md |
| api | `compressGzipSync` | doc/api/zlib.md |
| api | `compressZstd` | doc/api/zlib.md |
| api | `compressZstdSync` | doc/api/zlib.md |
| api | `decompressBrotli` | doc/api/zlib.md |
| api | `decompressBrotliSync` | doc/api/zlib.md |
| api | `decompressDeflate` | doc/api/zlib.md |
| api | `decompressDeflateSync` | doc/api/zlib.md |
| api | `decompressGzip` | doc/api/zlib.md |
| api | `decompressGzipSync` | doc/api/zlib.md |
| api | `decompressZstd` | doc/api/zlib.md |
| api | `decompressZstdSync` | doc/api/zlib.md |
