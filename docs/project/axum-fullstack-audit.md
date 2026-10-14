# Audit Axum et Bun.serve

État de l'exploration : 2026-10-14. Cet audit décrit les sources et les contrats déclarés. Aucun test, benchmark, build natif ou déploiement n'a été exécuté pour cet audit. La présence d'un exemple ou d'une crate ne prouve pas son activation dans Bun. Les fichiers Bun peuvent évoluer pendant les travaux concurrents ; les ancres indiquent les symboles observés.

Axum est un routeur HTTP composable. Leptos possède le rendu et l'hydratation full stack. La comparaison ne désigne aucun serveur « meilleur » ou plus rapide sans workload mesuré. Bun.serve conserve son propriétaire natif dans src/runtime/server. Le snapshot Axum est une référence d'exploration ; il n'ajoute aucun serveur Hyper au runtime Bun.

## Sources et dépendances

Le fork [aphrody-labs/axum](https://github.com/aphrody-labs/axum) et le snapshot vendor/axum reprennent le tag axum-v0.8.9 de [tokio-rs/axum](https://github.com/tokio-rs/axum/releases/tag/axum-v0.8.9), commit c59208c86fded335cd85e388030ad59347b0e5ae. Le pin est confirmé par le tag distant et les informations VCS de la crate registre. La licence MIT figure dans le snapshot. Le README racine représente la cible du symlink ; lire vendor/axum/axum/README.md.

| Propriétaire | Manifest/source observés | Limite |
| --- | --- | --- |
| Axum racine Bun | Cargo.toml:425, axum =0.8.9 ; Cargo.lock, axum-core 0.5.6 | Une dépendance workspace déclarée ne signifie pas que Bun.serve l'appelle. |
| Axum Web | packages/web/rust/Cargo.toml:117, defaults false, json/query/tokio/http1/http2 | Workspace et lock distincts. |
| Tower Web | packages/web/rust/Cargo.toml:296, tower =0.5.3 util ; :300, tower-http =0.7.1 cors | Site ajoute fs ; lock Web contient également tower-http 0.6.11 transitif. |
| Site Rust | packages/web/rust/crates/site/Cargo.toml:14 et :21 ; src/lib.rs:84 | Serveur Axum applicatif existant. |
| Tauri | packages/bun-tauri/Cargo.toml:20 ; crates/tauri-plugin-aphrody/src/wrap/serve.rs:156 | Serveur loopback du mode bundle, facultatif. |
| Dragon Pixel | packages/web/rust/crates/dragon-pixel-server/Cargo.toml:19 | Autre consommateur applicatif existant. |
| Bun HTTP | src/runtime/server/mod.rs:2780, src/runtime/server/ServerConfig.rs | uWS, transports H1/H2/H3, bindings JSC, cycle de vie Bun. |
| Snapshot complet | vendor/axum/axum/Cargo.toml:3 ; axum-core/Cargo.toml:12 ; axum-extra/Cargo.toml:12 ; axum-macros/Cargo.toml:12 | Versions respectives 0.8.9, 0.5.5, 0.12.6, 0.5.1. |

Le snapshot axum-core 0.5.5 est plus ancien que le 0.5.6 résolu par Bun. Un patch Cargo vers ce snapshot pourrait rétrograder le composant. La lecture des sources vendored ne change aucun pin de compilation. Le workspace upstream annonce Rust 1.80 dans vendor/axum/Cargo.toml:14.

Les locks inspectés contiennent déjà Tokio, Tower, Hyper, hyper-util, http, http-body, http-body-util, bytes, matchit, serde_json, serde_urlencoded, serde_path_to_error, tracing, rustls, tokio-tungstenite, cookie et prost. Le lock racine contient aussi h3, quinn et tonic. Le lock racine inspecté ne contient pas multer, axum-extra, axum-server, tower-sessions, utoipa, jsonwebtoken, oauth2 ou prometheus. Cela n'inventorie pas tous les workspaces imbriqués et ne justifie pas d'ajouter ces crates.

## Features Cargo complètes du snapshot

Source : vendor/axum/axum/Cargo.toml:14. L'inventaire reproductible [fullstack-features.json](./fullstack-features.json) contient les 61 manifests Axum du snapshot, leurs hashes et leurs tables package/workspace/features/dependencies/target. Il permet de vérifier les features des crates et de tous les exemples sans confondre déclaration et activation Cargo.

| Feature Axum | Défaut | Fonction/contrat |
| --- | --- | --- |
| form | Oui | Form URL-encoded, form_urlencoded/serde_urlencoded et erreurs de chemin. |
| http1 | Oui | Hyper et hyper-util HTTP/1. |
| http2 | Non | Hyper et hyper-util HTTP/2. |
| json | Oui | Json, serde_json et erreurs de chemin. |
| macros | Non | axum-macros, diagnostics et dérivation d'extractors. |
| matched-path | Oui | MatchedPath, patron de route reconnu. |
| multipart | Non | Multipart via multer. |
| original-uri | Oui | OriginalUri, URI avant nesting. |
| query | Oui | Query et désérialisation URL-encoded. |
| tokio | Oui | Listener/serve, connect-info, runtime/network et Tower make ; KeepAlive SSE. |
| tower-log | Oui | Tower log. |
| tracing | Oui | Tracing Axum/core et rejets d'extractors. |
| ws | Non | Upgrade et messages WebSocket via tokio-tungstenite ; Tokio/Hyper, SHA1/base64. |
| __private | Non, interne | Helpers de test ; Tokio/http1/reqwest. |
| __private_docs | Non, interne | Liens docs, Tower full, serde/tower-http. |

SSE n'a pas de feature Cargo nommée sse. Le rendu Sse est dans response/sse.rs ; sa variante KeepAlive utilise Tokio. Les features Web déclarées sont plus étroites que les defaults Axum. Les features Cargo réellement unifiées restent à établir sur chaque target par metadata/tree du propriétaire.

Axum-core expose tracing et __private_docs, sans liste default dans son manifest. Axum-macros a default vide et __private interne ; les macros publiques incluent FromRef, FromRequest, FromRequestParts, debug_handler, debug_middleware et TypedPath. Les tests de compilation pass/fail sont dans vendor/axum/axum-macros/tests.

Axum-extra 0.12.6 possède toutes les features suivantes, source vendor/axum/axum-extra/Cargo.toml:14 :

| Famille | Features complètes | Correspondance Bun/candidat |
| --- | --- | --- |
| Corps/fichiers | async-read-body, file-stream, attachment | Bun.file, Response(stream), Content-Disposition ; contrats streaming et erreurs à qualifier. |
| Cookies | cookie, cookie-private, cookie-signed, cookie-key-expansion | CookieMap présent ; signature/chiffrement restent politiques applicatives via crypto. |
| JSON | erased-json, json-deserializer, json-lines | Response.json, request.json, TransformStream/NDJSON ; aucune équivalence de validation induite. |
| Extractors | cached, form, query, multipart, optional-path, scheme, typed-header, with-rejection | Request/URL/Headers/FormData/params ; caches/rejets typés à placer chez le propriétaire applicatif. |
| Composition | handler, middleware, routing, typed-routing | Wrappers JS, routes typées Bun ; nesting/route-layer restent des écarts. |
| Protobuf | protobuf | prost déjà verrouillé côté Rust ; Web Response octets côté Bun. |
| Erreurs/logs | error-response, tracing | error callback et traçage applicatif. |
| Interne | __private_docs | Référence documentaire. |

Le default extra active tracing uniquement. Source de ses exports : axum-extra/src/lib.rs:51, extract/mod.rs:6 et response/mod.rs:6. Les modules non couverts par une feature incluent Either, Host, ContentDisposition, des réponses à Content-Type spécifique et les utilitaires de corps ; ils restent références de couche applicative.

## Matrice serveur

Statuts : S = source/API déclarée inspectée, sans exécution ; E = expérimental explicitement déclaré ; A = API publique équivalente non trouvée dans le périmètre inspecté ; N = contrat ou activation non vérifiés. Les écarts sont des observations à tester, pas une promesse de parité.

| Domaine | Axum/Tower et preuve vendored | API/propriétaire Bun et preuve | Statut et validation ciblée |
| --- | --- | --- | --- |
| Méthodes | MethodRouter et MethodFilter ; axum/src/routing/method_routing.rs:750 | Neuf méthodes dans ServerConfig.rs:814 ; union HTTPMethod dans packages/bun-types/serve.d.ts:590 | S : parser CONNECT/TRACE ; déclaration initialement limitée à sept. Qualifier types et callback de chaque méthode. |
| HEAD implicite/explicite | Tests routing/tests/get_to_head.rs:9 ; exemple handle-head-request | ServerConfig.rs:826 et mod.rs:2521 ; RequestContext.rs:869 | S : GET de repli et HEAD explicite. Tester corps vide, headers/length, fonctions/statique/fichier et ordre d'insertion. |
| 405 et Allow | method_routing.rs:1469 tests Allow ; routing/tests/mod.rs:222 | StaticRoute.rs:491, HTMLBundle.rs:254 ; mod.rs:2694 fallback global | S, différence : HTML GET/HEAD a 405+Allow ; méthode dynamique absente rejoint fetch/404. Préserver ce contrat ou proposer politique explicite. |
| any/CONNECT/TRACE | MethodRouter any/service/MethodFilter ; method_routing.rs:1504 teste absence Allow sur any | Handler direct = RouteMethod::Any ; parser ServerConfig.rs:800 | S/N : CONNECT/TRACE routage ne garantit ni tunnel ni RFC8441. Tester request-target et fermeture réseau séparément. |
| Params/wildcards | axum/src/routing/path_router.rs, docs/routing/route.md | docs/runtime/http/routing.mdx:78, BunRequest.params | S : syntaxe Axum {id}/{*rest} et Bun :id/* différente. Tester % encodage, Unicode, wildcard vide, conflits et priorité. |
| Composition | routing/mod.rs:209 nest, :235 nest_service, merge | routes JS, handlers ; pas de nest/merge public inspecté | A : créer composition chez couche Web propriétaire, sans duplication du moteur de dispatch. |
| URI/matched path | extract/mod.rs:28 NestedPath/Path/RawPathParams ; :53 MatchedPath ; :74 OriginalUri | request.url et req.params ; docs/runtime/http/routing.mdx:101 | S/A : URI disponible ; patron reconnu et prefix nested explicites absents. Tester avant/après rewrite. |
| Fallbacks | routing/mod.rs:345, :360, :374 méthode | routes false et fetch ; server/mod.rs:2477 et :2694 | S/A : pas d'API fallback méthode locale inspectée. Tester 404, 405, fallback déclaré, wildcard et reload. |
| State/extensions | extract/mod.rs:28 State, :47 Extension ; with_state | Closures JS, server, websocket.data ; serve.d.ts:675 | S/A : état explicite sans extractor Rust automatique. Tester isolation requête/VM, lifetime et teardown. |
| Extractors extensibles | FromRequest/FromRequestParts/OptionalFromRequest ; extract/mod.rs:19 | Web Request/Headers/URL et wrappers TS | S/A : pas d'extractor schéma natif. Un seul consommateur du corps ; rejets et annulation à vérifier. |
| JSON | axum/src/json.rs ; feature json | request.json, Response.json, fetch.d.ts ; webcore/fetch.rs | S/N : validation Serde ne correspond pas à JSON.parse. Tester Content-Type, JSON invalide, erreurs et structure attendue. |
| Form/query | extract/mod.rs:49 et :67 ; exemples form/query-params-with-empty-strings | FormData, URLSearchParams ; webcore/FormData.rs | S/N : params répétés, champs vides, bool/nombre et erreurs de conversion. |
| Multipart | extract/multipart.rs ; examples/multipart-form/src/main.rs:31 | request.formData, File/Blob | S/N : parsing champ-par-champ incrémental Bun non démontré. Tester boundaries, champ tronqué, gros fichier, cancellation et limite. |
| Body limits | axum-core/src/extract/default_body_limit.rs:89, :143, :182 ; RequestBodyLimitLayer dans exemple multipart | serve.d.ts:764 maxRequestBodySize global | S, scopes différents : Axum default 2 MiB pour extractors limités ; Bun default déclaré 128 MiB global. Tester limite et limite+1, chunked, multipart et route ciblée. |
| Responses | axum/src/response/mod.rs:36 Html, :77 NoContent ; axum-core IntoResponse | Response/Headers, json/redirect, Blob/BunFile/stream | S/N : statut null-body, headers multiples, cookies, redirects, HEAD et trailers. |
| Erreurs | error_handling, rejections ; examples/error-handling/src/main.rs | serve.d.ts:784 callback error async | S/N : rejet, throw, erreur de stream après headers, arrêt et réponse personnalisée ; ne pas convertir en succès. |
| Middleware/ordre | docs/middleware.md ; routing/mod.rs:321 route_layer | Wrappers fetch/routes ; pas de Layer/Service public Bun.serve inspecté | A : définir portée/ordre explicites, 404/405 avant auth, early return et abort. |
| CORS | examples/cors/src/main.rs:31 CorsLayer | Headers et route OPTIONS | S/A : politique native publique non trouvée. Tester credentials/origin/Vary/preflight/méthodes/headers. |
| CSRF | Tower-http 0.7.1 externe, feature csrf, Source/Origin/Host | Bun.CSRF generate/verify (src/csrf/lib.rs:72 et :134), Headers et policies applicatives | S/N : primitive HMAC liée à la session ; politique non automatique. Feature Tower non déclarée dans manifest Web inspecté. Tester token, Sec-Fetch-Site, Origin/trusted origins/Host et proxy. |
| Auth/sessions | examples/jwt et oauth ; cookies extra ; Tower auth | Bun.password, Bun.CSRF, crypto, CookieMap, SQL/Redis | S/N : primitives ; protocole auth/session complet non fourni par Bun.serve. Réutiliser propriétaire auth existant. |
| Request IDs/headers | examples/request-id ; Tower set/propagate/sensitive/validate | Headers, crypto, error/fetch wrappers | S/A : pas de pipeline natif public inspecté. Tester rejet et réponse d'erreur avec même ID, redaction et header multiples. |
| Timeouts | Tower TimeoutLayer ; examples/todos/src/main.rs:65 | idleTimeout, server.timeout(req,seconds), docs/server.mdx:247 | S, non équivalent : inactivité réseau versus deadline applicative/corps. Tester handler silencieux, stream lent et abort observable. |
| Service backpressure | Tower readiness, concurrency/rate limits, buffer/load-shed | Streams ; websocket drain/backpressureLimit | S/A : pas de quota d'admission natif public inspecté. Tester queue bornée, refus et libération après annulation. |
| Retry/balance | Tower retry/reconnect/balance/discover/load/steer | fetch et orchestration chez service propriétaire | N/A : retries, budgets et idempotence applicatifs ; aucune duplication de state machine réseau. |
| Compression HTTP | examples/compression/src/main.rs:33 ; Tower Compression/RequestDecompression | webcore/fetch/compress_body.rs ; CompressionStream dans ZigGlobalObject.cpp:93 | S/N : codecs présents ; négociation HTTP automatique Bun.serve non démontrée. Tester Accept-Encoding/q/Vary, no-transform, HEAD, stream et bornes décompression. |
| Streaming | axum-core Body/http-body frames ; examples/stream-to-file | webcore/streams.rs, Response(stream), FileResponseStream | S/N : backpressure/cancel/error ; trailers et fin de frames ne sont pas prouvés par Response en mémoire. |
| SSE | response/sse.rs:53, Event:173, KeepAlive:517 ; examples/sse | docs/guides/http/sse.mdx:9 ; Response streaming et server.timeout(req,0) | S/A : transport présent, builder Event/KeepAlive dédié non trouvé. Tester data multilignes/id/retry/comment/JSON, abort et délai inactivité. |
| WS HTTP/1 | extract/ws.rs:173 buffers, :195 message, :201 frame, :242 protocoles | serve.d.ts:477 payload, :484 backpressure, :513 pings, :520 perMessageDeflate | S/N : texte/binaire, fragmentation, protocoles, close, ping/pong, erreur et libération. |
| WS HTTP/2 | examples/websockets-http2/src/main.rs:57 ; serve active extended CONNECT | Bun upgrade présent ; h2 transport expérimental | N : support RFC8441 Bun non qualifié. Vérifier SETTINGS_ENABLE_CONNECT_PROTOCOL, CONNECT :protocol et coexistence routes HTTP. |
| Pub/sub | Tokio broadcast dans exemple chat et WS HTTP2 | ServerWebSocket publish/subscribe ; serve.d.ts:159 et :199 | S : pub/sub Bun natif ; vérifier topics, slow subscriber, self-publish et cleanup. |
| Fichiers/conditionnels | examples/static-file-server, Tower ServeDir/ServeFile | FileRoute, DirectoryRoute, RangeRequest ; docs/routing.mdx:161 | S/N : Range/If-Range/ETag/Last-Modified, 304/412/416, disparition fichier et HEAD. |
| Directory/access | ServeDir et fallback_service | routes {dir}, docs/routing.mdx:198 ; DirectoryRoute | S/N : canonicalisation, traversal/symlink, filesystem case insensitive ; accès privé hors dir public. |
| HTTP/1 | serve/mod.rs:97, Hyper/hyper-util | ServerConfig/mod.rs propriétaire uWS | S/N : parsing, keepalive, chunked, pipelining et unknown methods sur fil. |
| HTTP/2 | feature http2 ; serve/mod.rs, hyper-util auto builder | serve.d.ts:861, mod.rs:2780 | E : vérifier TLS ALPN, h2c prior knowledge, multiplexing et resets. HTML devserver/HMR et node:http restent H1 : mod.rs:2800. |
| HTTP/3 | Aucun transport axum::serve HTTP3 | serve.d.ts:851, docs/server.mdx:176 ; H3 uWS | E : TLS/QUIC, Alt-Svc, stream reset, UDP, HTTP1 refusé ; présence h3/quinn ailleurs ne prouve pas liaison Bun.serve. |
| TLS/listeners | serve/listener.rs:9 ; exemples low-level TLS, Unix, axum-server | tls/SNI/hostname/port/unix/reusePort/ipv6Only | S/N : certificats, SNI, mutual TLS, ALPN, reload, fermeture ; tester sur target réel. |
| Graceful shutdown | serve/mod.rs:151 ; exemples graceful/tls-graceful | serve.d.ts stop ; docs/server.mdx:313 | S/N : in-flight terminé, stop(true), WS/SSE longs, idle keepalive et résolution promise. |
| Observabilité/drop | TraceLayer, metrics, request-id ; Tower OnEarlyDrop | pendingRequests/WebSockets/subscriberCount ; docs/metrics.mdx:6 | S/A : counters présents ; durée/status/octets/drop par route non trouvés. Tester abort avant/après headers et compteurs revenus au niveau initial. |
| Tests sans socket | examples/testing/src/main.rs:73 oneshot | server.fetch, bun:test | S/N : dispatch mémoire ne valide pas TLS/h2/h3/framing/backpressure réseau. |
| Dev/full stack | Axum routeur ; exemples templates/Minijinja ; Leptos intégration séparée | HTML imports/Bake/bundler/HMR ; server HTMLBundle | S/N : CSR/SSR/hydratation/actions/routing/meta/cache doivent avoir des preuves distinctes. |

Le contrat [MethodRouter officiel](https://docs.rs/axum/0.8.9/axum/routing/method_routing/struct.MethodRouter.html) documente HEAD et Allow. [Tower-http CSRF](https://docs.rs/tower-http/0.7.1/tower_http/csrf/index.html) documente une politique fondée sur les headers, sans état de token. Les proxies qui réécrivent Host ou retirent Origin changent ses entrées ; CORS ne remplace pas CSRF.

## Tower et crates utiles

Tower 0.5.3 local dispose de full, log, balance, buffer, discover, filter, hedge, limit, load, load-shed, make, ready-cache, reconnect, retry, spawn-ready, steer, timeout, util et la feature de compatibilité tokio-stream. Lire la crate verrouillée via deps_read Cargo.toml.orig et ses modules. Activer uniquement les features consommées par un service Rust propriétaire. Le feature full n'est pas un plan d'intégration Bun.serve.

Tower-http 0.7.1 local dispose de default vide, full, add-extension, auth, catch-panic, compression-br/deflate/gzip/zstd/full, cors, csrf, decompression-br/deflate/gzip/zstd/full, follow-redirect, fs, limit, map-request-body, map-response-body, metrics, normalize-path, on-early-drop, propagate-header, redirect, request-id, sensitive-headers, set-header, set-status, timeout, trace, util, validate-request. OnEarlyDrop existe déjà dans 0.6.11 ; csrf est une différence 0.7.x. Les sources et exports de la version lock font foi, pas les exemples Axum qui ciblent 0.6.

Réutiliser http/bytes/http-body/util pour les services Rust déjà présents ; matchit possède la route Axum, pas le routage uWS Bun. Serde possède la désérialisation Rust. Tokio/futures possèdent l'asynchronisme Rust. Tracing possède les spans Rust. Bun possède Request/Response et le heap JSC. Tout pont doit décrire transferts, copies, backpressure, cancellation, GC et thread affinity. La présence d'une crate ne rend pas ses allocations accessibles au JS sans contrat de bindings.

Les exemples upstream SQLx, Diesel, MongoDB, tokio-postgres et Redis illustrent des intégrations, sans les rendre nécessaires à Bun. Pour JS/TS, réutiliser Bun.SQL, bun:sqlite, Bun.redis et Bun.s3 chez leurs propriétaires existants. Côté Rust, réutiliser la crate/protocole déjà consommé par le service visé. Les locks inspectés ne justifient pas l'import de tous les drivers présents dans les exemples.

## API Web Bun et périmètres à vérifier

L'objectif de couverture de toutes les API Web doit être traité par familles. Cette liste représente un registre de qualification ; elle n'affirme pas que chaque global existe sur chaque binaire.

| Famille/API | Source/propriétaire à explorer | Critère |
| --- | --- | --- |
| fetch, Request, Response, Headers, corps consommables | src/runtime/webcore/fetch.rs, fetch/*, packages/bun-types/fetch.d.ts | Réseau local, single consumption, clone/tee, redirect, errors, abort et headers multiples. |
| URL, URLSearchParams, URLPattern | Router/URL et bindings JSC ; URLPattern non qualifié ici | Encodage, params répétés et patrons ; ne pas remplacer parsing par regex. |
| FormData, File, Blob, BunFile | webcore/FormData.rs, FileRoute/server_body | Multipart, MIME, fichiers, quotas et erreurs de lecture. |
| ReadableStream/WritableStream/TransformStream, BYOB/tee | webcore/streams.rs et bindings streams | Pull/write/drain/close/cancel, mémoire bornée et detached buffers. |
| TextEncoder/Decoder, streams d'encodage | webcore/encoding.rs, encoding.classes.ts | Unicode, encodage incrémental, octets invalides et flush. |
| CompressionStream/DecompressionStream, codecs Bun | ZigGlobalObject.cpp:93 et :94, fetch/compress_body.rs | Vecteurs externes, formats acceptés et bornes mémoire ; aucun gain de débit sans mesure. |
| AbortController/AbortSignal, timeout/any | ZigGlobalObject.cpp:91 et lifecycle Request | Arrêt réellement propagé et resources libérées ; disponibilité de chaque méthode à vérifier. |
| WebSocket et EventSource | ServerWebSocket ; SSE endpoint docs/guides/http/sse.mdx | Séparer client et serveur ; EventSource global non qualifié ici. |
| Cookies, crypto/SubtleCrypto, Bun.password/hash | webcore/CookieMap.rs, crypto/* | Attributs cookies, KDF/vecteurs, signature/chiffrement et isolation secrets. |
| Worker, MessageChannel, BroadcastChannel, structuredClone | Globals/Worker et transports messages | Disponibilité, transfert d'objets et séparation VM ; non qualifié ici. |
| timers, performance, events, streams consumers | Runtime/event loop et globals | Deadline et observabilité ; aucune attente fixe utilisée comme preuve. |
| HTMLRewriter, HTML imports, Bun.build/Bake | Propriétaire HTML/bundler et server/HTMLBundle | Réécriture streaming, assets, HMR et modes production/compile séparés. |
| Bun.SQL/SQLite/Redis/S3/file/write | Propriétaires natifs déjà présents | Données et requêtes chez propriétaires canoniques ; aucune nouvelle couche de stockage du routeur. |

Les protocoles de session, validation, OpenAPI, GraphQL, JWT/OIDC, cache HTTP applicatif, files de jobs, mail et autorisation métier appartiennent aux intégrations full stack. Les exemples ne fournissent pas une implémentation production générique de ces domaines. Privilégier les propriétaires existants et documenter un manque avant toute dépendance supplémentaire.

## Index des exemples et tests upstream

Tous les répertoires examples du pin sont couverts par cet index de domaines :

- Routage/HTTP : hello-world, readme, routes-and-handlers-close-together, global-404-handler, versioning, handle-head-request, unix-domain-socket, simple-router-wasm, auto-reload.
- Extraction/validation : form, multipart-form, customize-extractor-error, customize-path-rejection, parse-body-based-on-content-type, query-params-with-empty-strings, consume-body-in-extractor-or-middleware, dependency-injection, validator.
- Erreurs/logs/policies : anyhow-error-response, error-handling, compression, cors, request-id, print-request-response, tracing-aka-logging, prometheus-metrics.
- Réseau et fichiers : http-proxy, reverse-proxy, reqwest-response, serve-with-hyper, static-file-server, stream-to-file.
- Longues connexions : sse, websockets, websockets-http2, chat.
- TLS/arrêt : low-level-native-tls, low-level-openssl, low-level-rustls, tls-rustls, graceful-shutdown, tls-graceful-shutdown.
- Données/auth/full stack : sqlx-postgres, diesel-postgres, diesel-async-postgres, tokio-postgres, tokio-redis, mongodb, key-value-store, jwt, oauth, async-graphql, todos, templates, templates-minijinja.
- Qualification : testing, testing-websockets.

Les assertions upstream sélectionnées comme références sont routing/tests/get_to_head.rs, routing/tests/fallback.rs, routing/tests/nest.rs, routing/tests/merge.rs, routing/tests/mod.rs et method_routing.rs:1357/1469. Les macros ont des tests trybuild pass/fail dans axum-macros/tests. Les extractors, SSE et WS ont des tests dans leurs modules. Aucun de ces tests n'a été exécuté dans cet audit.

## Lots et critères de validation

1. Fermer les divergences types/méthodes déjà implémentées. Exécuter la fixture bun-types réaliste et les routes CONNECT/TRACE sur le binaire checkout.
2. Qualifier HEAD/Allow/fallback sur fonctions, Responses, HTML, fichiers et directories. Préserver le fallback fetch actuel. Toute nouvelle politique 405 locale doit avoir un contrat explicite et couvrir wildcard/reload.
3. Définir les policies facultatives dans le propriétaire Web existant : extraction/rejets, CORS/CSRF, limites/deadlines, ID/trace. Tester ordre, portée et cancellation sans ajouter d'écouteur.
4. Qualifier streaming/SSE/WS avec clients locaux réels, backpressure, mauvais framing, abort et retour des compteurs. Tester HTTP/2 extended CONNECT distinctement.
5. Qualifier H1/H2/H3 et TLS sur chaque target. Le devserver HTML/HMR garde sa limite H1 observée. Une source vendored ne qualifie aucun transport.
6. Qualifier avec Leptos rendu, hydratation, actions, metadata, routing, assets et cache. La présence d'un serveur qui renvoie du HTML ne prouve pas ces contrats.
7. Pour toute revendication performance, comparer même host/target/profil/TLS/workload et collecter débit, distributions latence, RSS maximal, octets de distribution, démarrage et charge CPU. Identifier coûts JSC/interop et cold/warm. Aucun chiffre de gain n'est établi ici.

Les tests runtime futurs utilisent bun bd test via le propriétaire du build. L'exploration en lecture seule ne lance aucun build concurrent et ne remplace pas les preuves d'exécution.
