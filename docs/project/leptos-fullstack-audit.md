# Leptos et Bun : audit full stack

État au 2026-10-14. Leptos vendored dans `vendor/leptos`, upstream
`leptos-rs/leptos`, fork `aphrody-labs/leptos`, tag `v0.8.22`, révision
`7ec903d4008ddf7679e771863f7b8b90f5cdebde`. Le reçu d'acquisition est porté par
le lot de vendoring ; cet audit porte sur les manifests, sources, exemples et
tests présents. Aucun build, test Rust, test Bun ou scénario navigateur n'a été
exécuté pour cet audit. Aucune mesure de performances n'est annoncée.

Les références `chemin:ligne` sont relatives à la racine Bun et ont été lues dans
les sources locales épinglées. **Disponible** signifie présent dans les sources
et/ou les types, **absent** signifie non trouvé dans le propriétaire examiné,
**expérimental** suit une indication explicite du propriétaire, **non vérifié**
signifie que le comportement du binaire ou du navigateur n'a pas été exécuté.
La présence vendored ne signifie ni linkage dans Bun ni adaptateur Leptos↔Bun livré.

L'inventaire reproductible [fullstack-features.json](fullstack-features.json)
contient les 61 manifests Axum et 107 manifests Leptos, leurs hashes, features,
dépendances normales/de développement/de build/par cible et paramètres workspace.
Il fournit la couverture mécanique de tous les manifests ; les matrices ci-dessous
expliquent les familles fonctionnelles et leurs frontières de qualification.

## Positionnement et propriétaires

Axum fournit routage HTTP, extraction, state, middleware et services. Leptos
ajoute composants, réactivité, rendu, routage UI et appels client/serveur.
`Bun.serve` fournit HTTP, WebSocket et les objets Request/Response ; Bake possède
déjà une intégration React/RSC et le prérendu. La comparaison n'oppose donc pas
deux produits au périmètre identique.

Le propriétaire Web existant est `packages/web/rust`. Son site Axum expose
catalogue, templates, recherche, M3, assets et app_ui ; il ne contient pas de
composants Leptos dans le baseline examiné. Le WebOS possède déjà son propriétaire
WASM. L'UI et les tokens Material doivent rester chez leurs propriétaires
canoniques, sans duplication pour ajouter Leptos.

Preuves : `packages/web/rust/Cargo.toml:117`,
`packages/web/rust/crates/site/Cargo.toml:14`,
`packages/web/rust/crates/site/src/lib.rs:69`,
`packages/web/rust/crates/site/src/m3.rs:6`,
`packages/web/rust/crates/webos-wasm/Cargo.toml:18`,
`src/runtime/bake/bun-framework-react/ssr.tsx:38`,
`src/runtime/bake/bun-framework-react/server.tsx:194`.

## Famille de crates et features

`vendor/leptos/Cargo.toml:43` fixe le MSRV à Rust 1.88. Les versions des crates
d'un même monorepo ne sont pas toutes identiques : `leptos` 0.8.22,
`leptos_axum` 0.8.10, `reactive_graph` 0.2.15, `reactive_stores` 0.4.4,
`server_fn` 0.8.13, `tachys` 0.2.19, `leptos_router` 0.8.17,
`leptos_meta` 0.8.7, `leptos_server` 0.8.8. Les path dependencies du workspace
relient cette famille : `vendor/leptos/Cargo.toml:45`.

| Famille                  | Feature et rôle                                                                                          | Limite / état                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Rendu client             | `csr` construit le DOM ; `hydrate` ajoute l'interactivité au HTML SSR                                    | Builds client distincts, non vérifiés                                          |
| Rendu serveur            | `ssr` active macros serveur, server_fn, hydration et rendu tachys                                        | Build natif distinct, non vérifié                                              |
| Infrastructure hydration | `hydration` connecte graphe, données et contexte                                                         | Ne pas confondre avec la seule feature publique `hydrate`                      |
| Îlots                    | `islands` ; `islands-router` pour les branches serveur navigables                                        | Présents ; adaptation et navigateur non vérifiés                               |
| Sérialisation            | `rkyv`, `serde-lite`, `cbor`, `msgpack`, `postcard`, `bitcode`, `bitcode-serde`, `multipart`             | Options ; activer seulement le codec requis                                    |
| CSP                      | `nonce` génère les nonces                                                                                | La politique et le header CSP restent applicatifs                              |
| Observabilité            | `tracing`, `trace-component-props`                                                                       | Optionnelles ; ne pas enregistrer données sensibles des props                  |
| Événements               | `delegation`                                                                                             | Délégation DOM avec différences possibles face aux événements natifs           |
| Compilateur              | `nightly`, cfg `erase_components`                                                                        | Choix distincts ; monomorphisation réduite en échange d'allocation et dispatch |
| Hot patch Rust           | `subsecond`                                                                                              | Option avec dépendances de développement ; qualification propre nécessaire     |
| Plateforme               | `spin`                                                                                                   | Option de déploiement spécifique ; pas de preuve sur nos hôtes                 |
| TLS client               | `default-tls`, `rustls`                                                                                  | Options server_fn ; pas une configuration TLS automatique de Bun.serve         |
| Graphe                   | `effects`, `hydration`, `serde`, `sandboxed-arenas`, `subsecond`, `tracing`, `nightly`                   | Effets ordinaires désactivables en SSR ; isolation par Owner à préserver       |
| Transport server_fn      | `ssr`/inventory, `generic`, `browser`, `reqwest`, `axum-no-default`, `axum`, Actix                       | Choisir le transport/cible ; middleware et codecs restent composables          |
| Axum integration         | default : Tokio fs/sync, Tower util, Tower HTTP fs, server_fn/axum ; `wasm`, `islands-router`, `tracing` | Version Axum compatible 0.8 ; pas de runtime Bun à elle seule                  |

Preuves : `vendor/leptos/leptos/Cargo.toml:66`,
`vendor/leptos/reactive_graph/Cargo.toml:49`,
`vendor/leptos/server_fn/Cargo.toml:103`,
`vendor/leptos/integrations/axum/Cargo.toml:44`.
**Ne pas utiliser `--all-features` comme gate de parité** : CSR, hydrate et SSR
doivent être sélectionnés par cible ; les exclusions sont explicites dans
`vendor/leptos/Cargo.toml:179` et les métadonnées des manifests concernés.

## Matrice composants, réactivité et navigateur

| Capacité               | Leptos : preuve                                                                                                                                                  | Bun / intégration / limite                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Vue typée              | `view!`, IntoView, builders HTML ; `vendor/leptos/leptos/src/lib.rs:156`                                                                                         | Bun JS/TS/JSX est déjà disponible ; aucun traducteur Rust→JSX requis                                 |
| Props, children, slots | Modules enfants/composants ; `vendor/leptos/leptos/src/lib.rs:167` ; exemples `slots`, `spread`, `parent_child`                                                  | Réutiliser composants et contrats UI existants ; ne pas recopier une UI entière                      |
| Contrôle de flux       | Show, For, Await et autres exports ; `vendor/leptos/leptos/src/lib.rs:221`                                                                                       | Listes keyed et branches appartiennent au moteur Leptos                                              |
| Signals et calculs     | Graphe exporté, signals, Memo, Effect, RenderEffect, untrack ; `vendor/leptos/leptos/src/lib.rs:176`                                                             | `reactive_graph` est le propriétaire Rust ; absent du lock Web au baseline                           |
| Stores structurés      | ArcStore/Store, champs réactifs ; `vendor/leptos/reactive_stores/src/lib.rs:542`                                                                                 | Utile pour état structuré ; option applicative, pas nécessité du transport HTTP                      |
| Contextes              | provide/use/expect/take/with/update_context ; `vendor/leptos/reactive_graph/src/owner/context.rs:203`                                                            | Contexte de requête isolé ; aucun principal global partagé                                           |
| Durée de vie           | Owner, cleanup, pause/resume ; `vendor/leptos/reactive_graph/src/owner.rs:148` et `:303`                                                                         | Tenir Owner jusqu'à fin/annulation du stream et libérer données et callbacks                         |
| Async chargé serveur   | Resource/ArcResource sérialisables ; `vendor/leptos/leptos_server/src/resource.rs:477`                                                                           | fetch/SQL côté serveur possibles via adaptateur ; sérialisation sélective requise                    |
| Données prioritaires   | Resource::new_blocking ; `vendor/leptos/leptos_server/src/resource.rs:503`                                                                                       | Bloque le début du HTML, pas un thread avec attente synchrone                                        |
| Async navigateur       | LocalResource ; `vendor/leptos/leptos_server/src/local_resource.rs:302`                                                                                          | En SSR, attente hors Suspense peut suspendre indéfiniment : `:389`                                   |
| Actions                | Action/MultiAction et ServerAction/ServerMultiAction ; `vendor/leptos/reactive_graph/src/actions/action.rs:174`, `vendor/leptos/leptos_server/src/action.rs:133` | Résultat, pending, versions et soumissions sont des états UI ; handlers métier restent propriétaires |
| Annulation             | Action abort, MultiAction cancel, tâches scoped ; `vendor/leptos/reactive_graph/src/actions/action.rs:250`, `vendor/leptos/reactive_graph/src/lib.rs:165`        | À connecter à Request.signal et disconnect ; aucune preuve de connexion automatique à Bun            |
| Suspense / Transition  | `vendor/leptos/leptos/src/suspense_component.rs:94`, `vendor/leptos/leptos/src/transition.rs:76`                                                                 | Transport ReadableStream approprié ; respecter ordre et fallbacks du mode choisi                     |
| Erreurs de vue         | ErrorBoundary de Result, fallback local ; `vendor/leptos/leptos/src/error_boundary.rs:78`                                                                        | Distinct de `Bun.serve.error`, qui traite erreurs de requête HTTP                                    |
| DOM / SVG / MathML     | Exports tachys ; `vendor/leptos/leptos/src/lib.rs:314`                                                                                                           | DOM navigateur via web-sys ; bun_browser_dom serveur est une autre surface                           |
| Portails               | `vendor/leptos/leptos/src/portal.rs:15`                                                                                                                          | Nécessitent DOM réel ; non qualifiés par test de SSR string                                          |
| CSR / hydration        | mount/hydrate parent/body, hydration lazy ; `vendor/leptos/leptos/src/mount.rs:23`, `:35`, `:58`, `:175`                                                         | Servir JS/WASM ne prouve pas interactivité ni absence de mismatch                                    |
| Islands                | hydrate_islands ; `vendor/leptos/leptos/src/mount.rs:245` ; `examples/islands`                                                                                   | Seuls îlots interactifs compilés/hydratés ; props exposées au client à sélectionner                  |
| Navigation islands     | `examples/islands_router` ; integration flags                                                                                                                    | Navigation serveur + diff client ; qualification indépendante des îlots ordinaires                   |
| Accessibilité          | Attributs ARIA typés ; `vendor/leptos/tachys/src/html/attribute/aria.rs:1`                                                                                       | HTML sémantique, clavier, focus et lecteur d'écran restent à vérifier                                |
| Planification DOM      | rAF, idle callbacks, timers ; `vendor/leptos/leptos_dom/src/helpers.rs:140`, `:214`, `:286`                                                                      | APIs navigateur ; ne pas supposer leur exécution SSR ou dans Bun sans DOM                            |

## SSR, streaming et statique

L'enum versionnée `vendor/leptos/router/src/ssr_mode.rs:30` contient cinq variantes.
Le shell synchrone/LocalResource est une stratégie de rendu, **pas** une variante
`SsrMode::Sync`. Les modes de routes imbriquées participent à la sélection finale.

| Mode                | Comportement                                                                   | Critère de qualification                                                              |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| OutOfOrder, défaut  | Shell/fallback immédiat, fragments serveur arrivant à leur résolution          | Observer premier chunk et remplacement via scripts sans attendre tout le body         |
| PartiallyBlocked    | Résoudre ressources bloquantes dans HTML initial ; autres fragments hors ordre | Données prioritaires et métadonnées présentes sans JS ; éléments secondaires streamés |
| InOrder             | HTML streamé en ordre, attente aux frontières Suspense                         | Contenu dans ordre correct sans JS, pas de buffering global inattendu                 |
| Async               | Résolution avant rendu complet                                                 | Titre/meta complets dans HTML initial ; erreur et cancellation à tester               |
| Static(StaticRoute) | Paramètres de prérendu et régénération via stream                              | Pages produites et invalidées selon contrat ; pas de contenu privé dans cache partagé |

Preuves : `vendor/leptos/integrations/axum/src/lib.rs:720`,
`vendor/leptos/router/src/static_routes.rs:52`, `:65`, `:77`,
`vendor/leptos/examples/static_routing/src/main.rs:18`.
Les handlers dédiés existent pour stream, in-order, replacement de blocks et
async : `vendor/leptos/integrations/axum/src/lib.rs:496`, `:585`, `:770`, `:844`,
`:1017`, `:1071`, `:1138`. Le bridge Axum transforme un stream de strings en
body HTTP : `vendor/leptos/integrations/axum/src/lib.rs:166`.

`leptos_meta` fournit contexte, Title, MetaTags, Link et Script :
`vendor/leptos/meta/src/lib.rs:294`, `:525`,
`vendor/leptos/meta/src/title.rs:228`, `vendor/leptos/meta/src/link.rs:31`,
`vendor/leptos/meta/src/script.rs:27`. Les métadonnées qui dépendent de données
asynchrones doivent être prêtes avant flush du head selon le mode choisi.
HydrationScripts/AutoReload possèdent leur génération chez Leptos :
`vendor/leptos/leptos/src/hydration/mod.rs:12`, `:45`.

## Router, server functions et contrats HTTP

| Capacité                                      | Preuve locale                                                                                                                       | Limite d'intégration                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Routes imbriquées / layouts                   | Router, Routes, ParentRoute, Outlet ; `vendor/leptos/router/src/components.rs:55`, `:219`, `:356`                                   | Ne pas confondre arbre UI avec routes HTTP de Bun                                  |
| Routes plates, params, wildcard et optionnels | FlatRoutes, path segments ; `vendor/leptos/router/src/components.rs:272`, `:331`                                                    | Conversion des chemins et paramètres Axum/Bun à tester                             |
| Guards UI                                     | ProtectedRoute/ProtectedParentRoute ; `vendor/leptos/router/src/components.rs:390`, `:461`                                          | Ne sécurisent pas à eux seuls endpoints server_fn ou fichiers                      |
| Links, Forms, navigation                      | `vendor/leptos/router/src/form.rs:17`, components Router                                                                            | Historiques, query, scroll, navigation externe et non-root à qualifier             |
| Routes lazy                                   | `vendor/leptos/examples/lazy_routes/Cargo.toml:1`                                                                                   | Exemple présent ; compilation et chargement chunks non vérifiés                    |
| Listing serveur                               | generate_route_list/exclusions/SSG ; `vendor/leptos/integrations/axum/src/lib.rs:1180`, `:1213`, `:1231`                            | Réutiliser listing, ne pas recréer algorithme de matching                          |
| ServerFn et codecs                            | `vendor/leptos/server_fn/src/lib.rs:218`, `vendor/leptos/server_fn/src/codec/mod.rs:1`                                              | Stub client appelle une API publique ; autoriser chaque opération sensible         |
| Registre et méthodes                          | server_fn_paths, get_server_fn_service ; `vendor/leptos/server_fn/src/lib.rs:1079`, `:1116`                                         | Préserver méthode, endpoint, erreurs et middlewares                                |
| Transport HTTP                                | Http<Input,Output> ; `vendor/leptos/server_fn/src/lib.rs:430`                                                                       | Request/Response Web ne sont pas les types HTTP Rust sans adaptateur               |
| WebSocket bidirectionnel                      | Websocket et BoxedStream ; `vendor/leptos/server_fn/src/lib.rs:530`, `:548`                                                         | Bun websocket disponible ; codecs, close et backpressure restent à adapter         |
| URL par méthode                               | GetUrl/PostUrl/DeleteUrl/PatchUrl/PutUrl ; `vendor/leptos/server_fn/src/codec/url.rs:11`                                            | Préserver Allow, HEAD et erreurs méthode dans routes dérivées                      |
| JSON et binaires                              | JSON + codecs gated ; `vendor/leptos/server_fn/src/codec/mod.rs:22`                                                                 | Ne pas activer codecs inutilement ; compatibilité client/serveur requise           |
| Multipart/upload                              | MultipartData client FormData / serveur multer ; `vendor/leptos/server_fn/src/codec/multipart.rs:27`                                | Borner taille/nombre des champs et fichiers ; pas de buffering intégral imposé     |
| Byte/text streams                             | Streaming/ByteStream/StreamingText/TextStream ; `vendor/leptos/server_fn/src/codec/stream.rs:25`, `:76`, `:151`, `:173`             | Streaming upload navigateur demande qualification HTTP2/3 ; voir commentaire `:17` |
| Codecs personnalisés                          | IntoReq/FromReq/IntoRes/FromRes ; `vendor/leptos/server_fn/src/codec/mod.rs:104`, `:139`, `:173`, `:207`                            | Éviter réécriture de sérialisation ; test interop et Content-Type nécessaires      |
| Middleware par fonction                       | ServerFn::middlewares + Tower bridge ; `vendor/leptos/server_fn/src/lib.rs:273`, `vendor/leptos/server_fn/src/middleware/mod.rs:45` | Auth/rate limits/cookies à brancher au handler réel, pas au rendu seul             |
| ActionForm et MultiActionForm                 | `vendor/leptos/leptos/src/form.rs:78`, `:155`                                                                                       | Contrat HTTP<PostUrl,...>, pas codecs d'entrée arbitraires                         |
| Validation                                    | FromFormData ; `vendor/leptos/leptos/src/form.rs:245`                                                                               | Conversion typée n'est pas validation métier ; vérifier à nouveau côté serveur     |
| Headers/status/cookies                        | ResponseOptions ; `vendor/leptos/integrations/axum/src/lib.rs:133`                                                                  | append conserve multiples valeurs ; copier Set-Cookie sans fusion invalide         |
| Redirects                                     | `vendor/leptos/integrations/axum/src/lib.rs:227`                                                                                    | Navigation HTML et appel RPC ont contrats différents ; tester sans JS et hydraté   |
| Contexte/extractors                           | provide_contexts/extract/extract_with_state ; `vendor/leptos/integrations/axum/src/lib.rs:955`, `:2004`, `:2019`                    | Conserver state, principal, URL, request parts, nonce et réponse par requête       |
| Assets/fallback                               | file_and_error_handler, site_pkg_dir_service ; `vendor/leptos/integrations/axum/src/lib.rs:2044`, `:2190`                           | Statuts 404 et headers d'isolation doivent survivre au fallback                    |

Exemples d'intégration auth, distincts du framework core :
`vendor/leptos/projects/session_auth_axum/src/main.rs:1` utilise couches session
et auth, avec pool dans state ; `vendor/leptos/projects/session_auth_axum/src/state.rs:10`.
Ce sont exemples vendored, pas architecture ni dépendances qualifiées de Bun.
CSRF, validation métier, sessions, OAuth, permissions et stockage durable ne
deviennent pas automatiques en important Leptos/Axum.

## Toutes familles Bun Web pertinentes pour cette intégration

Inventaire fonctionnel du périmètre full stack, sans prétendre que toutes les API
du runtime ou toutes les crates Rust servent un site. Toutes les lignes de cette
section restent **non vérifiées par exécution** pendant cet audit.

| Famille Bun                                  | Preuve propriétaire / types                                                                     | Usage et frontière                                                                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP et routes                               | `packages/bun-types/serve.d.ts:635`, `src/runtime/server/ServerConfig.rs:1164`                  | Request/Response, handlers par méthode, erreurs, limites de body et timeouts                                                                     |
| Protocoles HTTP1/2/3/TLS                     | `packages/bun-types/serve.d.ts:851`, `src/runtime/server/mod.rs:2782`                           | Le fork a HTTP2/3 ; HTTP2 ignoré pour node:http et HTML/HMR, erreur si HTTP1 désactivé dans ces cas ; HTTP3 demande TLS (`ServerConfig.rs:1276`) |
| Fetch/URL/Headers/Request/Response           | `packages/bun-types/fetch.d.ts:72`, `src/http/Cargo.toml:2`, `src/url/Cargo.toml:2`             | Transport, headers, cancellation, query et erreurs réseau ; appliquer SSRF policy aux URLs externes                                              |
| FormData/Blob/fichiers upload                | `packages/bun-types/fetch.d.ts:72`, `packages/bun-types/bun.d.ts:2804`                          | Entrée multipart et transfert binaire ; garder limites côté serveur                                                                              |
| Streams Web, encode/decode                   | `packages/bun-types/globals.d.ts:148`, `:162`, `packages/bun-types/bun.d.ts:592`                | Readable/Writable/Transform streams, backpressure, TextEncoder/Decoder ; éviter readableStreamToText pour SSR continu                            |
| Abort et event loop                          | `src/runtime/server/RequestContext.rs:137`, `src/event_loop/Cargo.toml:1`                       | Annulation requête/stream ; callbacks JSC uniquement sur contexte valide                                                                         |
| WebSocket/pubsub                             | `packages/bun-types/serve.d.ts:710`, `:1120`                                                    | Transport server_fn Websocket et événements ; test drain/cancel/disconnect requis                                                                |
| SSE/EventSource                              | EventSource `packages/bun-types/bun.d.ts:479` + Response stream                                 | SSE serveur via Content-Type text/event-stream et ReadableStream ; distinct du WebSocket                                                         |
| Cookies                                      | `packages/bun-types/serve.d.ts:916`, `packages/bun-types/bun.d.ts:11292`                        | CookieMap, request cookies, Set-Cookie ; sessions restent applicatives                                                                           |
| CSRF                                         | `packages/bun-types/bun.d.ts:2898`, `src/csrf/lib.rs:72`, `:134`                                | Generate/verify HMAC avec sessionId et expiration ; contrôle dans mutations, pas automatique                                                     |
| Cryptographie / identifiants / mots de passe | `packages/bun-types/bun.d.ts:3942`, `:5948`, `:10980`, `packages/bun-types/globals.d.ts:6`      | Bun.password, CryptoHasher, WebCrypto, UUID ; secrets dans store protégé                                                                         |
| Fichiers / static                            | `packages/bun-types/bun.d.ts:4950`, `:2188`, `packages/bun-types/serve.d.ts:628`                | Bun.file/write, DirectoryRoute, ETag/Last-Modified/HEAD/Range ; ne servir que racine publique                                                    |
| Bundler / HTML / CSS / HMR                   | `packages/bun-types/bun.d.ts:4799`, `:6782`, `packages/bun-types/devserver.d.ts:22`             | Bundles assets JS/CSS, HTML imports et import.meta.hot ; HMR Rust/WASM séparé                                                                    |
| Bake SSR/RSC/prérendu                        | `src/runtime/bake/bun-framework-react/ssr.tsx:38`, `:103`, `src/runtime/bake/bake.d.ts:1`       | Déjà présent et API en développement ; ne pas annoncer SSR Bun absent ni Leptos intégré                                                          |
| Rust→WASM build                              | `packages/bun-types/wasm-build.d.ts:1`, `:106`, `src/js/bun/wasm.ts:316`                        | bun:wasm.build pilote Cargo/wasm-bindgen/wasm-opt avec features, locked, wrapper, artifact existant ; candidat pour hydrate, non qualifié        |
| WebAssembly runtime                          | `packages/bun-types/wasm.d.ts:1`, `src/wasm/Cargo.toml:2`                                       | Charger le module ne fournit pas DOM navigateur ni adaptation Leptos native                                                                      |
| HTML rewriting/escaping                      | `packages/bun-types/html-rewriter.d.ts:149`, `:164`, `packages/bun-types/bun.d.ts:2464`         | HTMLRewriter streaming, escapeHTML ; préserver repères d'hydration tachys et nonces CSP                                                          |
| SQL / SQLite                                 | `packages/bun-types/sql.d.ts:602`, `packages/bun-types/sqlite.d.ts:117`, `src/sql/Cargo.toml:2` | Données server functions via propriétaire existant ; transactions, pooling et migrations applicatifs                                             |
| Redis / cache / pubsub                       | `packages/bun-types/redis.d.ts:58`                                                              | Cache/session/rate limit selon contrat ; ne pas confondre présence API et cache distribué configuré                                              |
| S3 / object storage                          | `packages/bun-types/s3.d.ts:940`, `src/s3_signing/Cargo.toml:2`                                 | Assets et uploads ; accès et domaines publics explicites, sans credentials client                                                                |
| Compression / hashing / archives             | `packages/bun-types/bun.d.ts:6284`, `:6294`, `src/hash/Cargo.toml:2`                            | Formats présents ; négociation HTTP, flush et taille à qualifier                                                                                 |
| Processus / workers / outils                 | `packages/bun-types/bun.d.ts:8472`, `src/jsc/web_worker.rs:1`                                   | Build/dev ou tâches isolées ; borner CPU, ne pas créer un autre serveur implicitement                                                            |
| Métriques / diagnostic                       | `packages/bun-types/serve.d.ts:1177`, `:1220`                                                   | pending requests/sockets, logging et erreurs ; traces/rate/métriques métier optionnels                                                           |
| Browser DOM/CDP/WebGPU                       | `src/browser/crates/dom/Cargo.toml:2`, `packages/bun-types/chromium.d.ts:1`                     | Candidats de tests navigateur ; capacité engine distincte du transport HTTP et non vérifiée ici                                                  |

## Crates Rust utiles et coût d'intégration

| Propriétaire                                   | Usage                                                 | État constaté                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Axum, Tower, Tower HTTP, Tokio                 | Routing, state, services, middleware, fichiers, async | Web workspace : Axum =0.8.9, Tower =0.5.3, Tower HTTP =0.7.1, Tokio =1.53.1 (`packages/web/rust/Cargo.toml:117`, `:285`, `:296`) |
| futures / futures-util                         | Streams, async et cancellation                        | Dépendances Web existantes (`packages/web/rust/Cargo.toml:152`)                                                                  |
| serde / serde_json / cookie / url              | Contrats RPC, cookies et URLs                         | Dépendances Web existantes (`packages/web/rust/Cargo.toml:136`, `:261`, `:266`, `:317`)                                          |
| tracing / tracing-subscriber                   | Traces async et logging structuré                     | Dépendances Web existantes (`packages/web/rust/Cargo.toml:304`)                                                                  |
| reqwest / rustls / tokio-tungstenite           | Clients externes et transport Rust                    | Dépendances Web existantes ; réutiliser Bun fetch/WS quand l'appel part de JS (`packages/web/rust/Cargo.toml:247`, `:289`)       |
| rusqlite                                       | SQLite pour propriétaire Rust                         | Dépendance Web existante (`packages/web/rust/Cargo.toml:252`) ; Bun SQL/SQLite existe côté JS                                    |
| wasm-bindgen / web-sys / js-sys                | Glue WASM navigateur                                  | wasm-bindgen Web présent (`packages/web/rust/Cargo.toml:324`) ; web-sys dans lock transitif ; API JS navigateur à qualifier      |
| Leptos family                                  | Vue, graphe, hydration, router, meta, server_fn       | Sources vendored ; absentes du lock Web baseline et linkage Bun non établi                                                       |
| bun_http / bun_http_types / bun_url            | HTTP et parsing canonique Bun                         | `src/http/Cargo.toml:2`, `src/http_types/Cargo.toml:2`, `src/url/Cargo.toml:2`                                                   |
| bun_csrf / bun_hash / bun_s3_signing / bun_sql | CSRF, hashing, signature object storage, SQL          | `src/csrf/Cargo.toml:2`, `src/hash/Cargo.toml:2`, `src/s3_signing/Cargo.toml:2`, `src/sql/Cargo.toml:2`                          |
| bun_browser_dom / bun_wasm                     | DOM serveur et surfaces WASM existantes               | Propriétaires distincts du DOM browser Leptos et de l'ABI du serveur                                                             |
| Tokens Material / site / WebOS                 | Identité visuelle, assets, UI et fonctions existantes | Propriétaires à conserver ; pas nouveau framework UI global                                                                      |
| SQLx, validator/garde, OpenTelemetry           | Options possibles selon manque réel                   | Absents du lock Web examiné ; aucun ajout ni besoin démontré dans cet audit                                                      |

Le workspace Leptos consomme Tower HTTP 0.6 ; le lock Web actuel contient déjà
0.6.11 et 0.7.1. Vendoring ne résout pas ces doublons ni les features transitives.
Préserver les path dependencies intra-Leptos et contrôler Cargo metadata/tree
sur le consommateur réel avant linkage. Aucun nouveau workspace produit ou
package wrapper ne doit être créé simplement pour renommer ces crates.

## Exemples et tests : présents, pas exécutés

L'inventaire couvre les exemples `ssr_modes_axum`, `static_routing`,
`server_fns_axum`, `islands`, `islands_router`, `lazy_routes`, `websocket`,
`todo_app_sqlite_axum`, `errors_axum`, `action-form-error-handling`, `stores`,
`subsecond_hot_patch` et les projets d'auth. Certains manifests d'exemples
emploient d'anciennes versions Tower/Tower HTTP : ils sont des références de
comportement, pas un graphe de dépendances à recopier.

| Test / exemple        | Preuve                                                                          | Contrat exploitable                                         |
| --------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Cleanup Owner         | `vendor/leptos/reactive_graph/tests/cleanup.rs:10`                              | Disposition et durée de vie des allocations                 |
| Async derived         | `vendor/leptos/reactive_graph/tests/async_derived.rs:11`                        | Calcul eager, changements de signals, state arena/Arc       |
| Macros et diagnostics | `vendor/leptos/leptos_macro/tests/ui.rs:2`                                      | Tests de compilation et messages d'erreur                   |
| WASM executor         | `vendor/leptos/any_spawner/tests/wasm_bindgen_tests.rs:11`                      | Exécution dans navigateur, spawn local et tick              |
| Assets fallback       | `vendor/leptos/integrations/axum/tests/axum_integration.rs:33`                  | JS/WASM servent 200 et erreurs servent 404 avec shell       |
| Headers isolation     | `vendor/leptos/integrations/axum/tests/axum_integration.rs:61`                  | COOP/COEP survivent au fallback                             |
| Prefix assets         | `vendor/leptos/integrations/axum/tests/axum_integration.rs:186`                 | site-root et pkg non-root                                   |
| Modes                 | `vendor/leptos/examples/ssr_modes_axum/Cargo.toml:31`                           | SSR et hydrate distincts ; sorties assets et E2E            |
| Server functions      | `vendor/leptos/examples/server_fns_axum/src/app.rs:255`, `:341`, `:500`, `:918` | Méthode, middleware, multipart, stream, client personnalisé |
| Static                | `vendor/leptos/examples/static_routing/src/main.rs:18`                          | Génération et routes serveur                                |

Les tests Axum déclenchent eux-mêmes `cargo leptos build` :
`vendor/leptos/integrations/axum/tests/axum_integration.rs:232`. Ils ne sont pas
des checks légers à lancer en parallèle d'un build natif. Les exemples comportent
des commandes npm/npx upstream ; leur exécution locale doit utiliser les outils
Bun autorisés, sans modifier la provenance des sources vendored pour cet audit.

## Gaps et critères de livraison d'un futur adaptateur

1. **Transport** : définir l'adaptation server_fn Request/Response et celle du
   rendu Rust vers les streams Bun ; démontrer HTTP, WS, multipart, codecs et
   erreurs sans recopier les implémentations Leptos.
2. **Cycle de vie** : un Owner/contexte par requête, principal et réponse isolés ;
   maintien jusqu'à fin stream, cancel/disconnect, libération des callbacks et
   ressources ; test de deux utilisateurs concurrents sans fuite de contexte.
3. **Streaming** : vérifier premier chunk, progression, drain, cancellation et
   mémoire bornée ; erreur avant/après headers, charset, compression et HTTP2/3.
   Les uploads navigateur en streaming ne sont pas prouvés par un test fetch Bun.
4. **Contrats HTTP** : méthodes/Allow/HEAD, status, redirect HTML/RPC, multi
   Set-Cookie, cache privé/public, taille body et timeouts ; garantir réponse
   explicite pour codec/méthode invalide.
5. **Rendu** : comparer les modes par traces de chunks et assertions HTML ;
   metadata/CSP prêtes au bon moment, static regeneration et invalidation ;
   tester paramètres, 404, nested routes et base path.
6. **Navigateur** : compiler hydrate via propriétaire bun:wasm ou pipeline
   existant qualifié, charger assets puis cliquer/soumettre ; absence de mismatch,
   navigation islands et retour/back, sans JS, sans WASM, et resource errors.
   HTMLRewriter doit préserver les repères d'hydration et les scripts avec nonce.
7. **Fonctions applicatives** : brancher auth/session/permissions/CSRF/validation
   dans handlers effectifs ; tester token lié à session et rejet des appels
   directs non autorisés. CSP et CORS ne remplacent pas ce contrôle.
8. **Distribution** : manifests/locks cohérents, licences, provenance source,
   features par cible et coût transitif ; extension facultative chez propriétaire
   Web existant, noyau Bun sans Leptos encore qualifié séparément.
9. **Mesures** : même hôte/cible/profil/workload avant/après, débit, percentiles,
   RSS, cold start et tailles native/WASM ; aucune affirmation de supériorité
   générale ou de parité complète sans ces preuves.

L'audit et les sources épinglées rendent ces choix reviewables. L'adaptateur,
ses builds et sa qualification utilisateur restent à réaliser ; aucun de ces
critères n'est marqué passé par cet audit documentaire.
