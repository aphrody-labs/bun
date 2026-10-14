# Bun.serve, Axum et Leptos

Exploration du 2026-10-14, à partir des sources complètes des deux forks. Axum
avec Leptos est une référence pertinente pour comparer routage HTTP, rendu SSR,
hydratation et actions serveur. Aucun benchmark ne permet ici de les désigner
comme le serveur le plus rapide ou le meilleur pour tous les usages.

| Source | Version du tag | Commit immuable | Fichiers vérifiés |
| --- | --- | --- | --- |
| [aphrody-labs/axum](https://github.com/aphrody-labs/axum) | axum-v0.8.9 | c59208c86fded335cd85e388030ad59347b0e5ae | 490 |
| [aphrody-labs/leptos](https://github.com/aphrody-labs/leptos) | v0.8.22 | 7ec903d4008ddf7679e771863f7b8b90f5cdebde | 1541 |

Les snapshots sont dans `vendor/axum` et `vendor/leptos`, avec les licences MIT,
tests, exemples et documentation du pin. Chaque fichier conserve ses octets
Git, contrôlés par SHA-1 du blob et SHA-256. Le lien README racine Axum est
représenté par son contenu Git, `axum/README.md`, sans créer de lien filesystem.
Lire le README réel dans `vendor/axum/axum/README.md`.

Les reçus [Axum](./axum-source.json) et [Leptos](./leptos-source.json) couvrent
tous les blobs des arbres Git récursifs non tronqués. Les sources n'ajoutent
aucun membre ou patch au workspace Cargo Bun. En particulier, axum-core du
snapshot est 0.5.5 alors que le lock Bun possède 0.5.6 ; les substituer serait
une modification distincte à qualifier.

## Exploration complète

Deux sous-agents Explore ont inspecté les sources locales séparément :

- [Audit Axum](./axum-fullstack-audit.md) : routage, extractors, middleware,
  Tower, limites, sécurité applicative, streaming, transports et 57 exemples.
- [Audit Leptos](./leptos-fullstack-audit.md) : réactivité, composants, router,
  server functions, formulaires, CSR, hydratation, islands et modes SSR.
- [Inventaire Cargo](./fullstack-features.json) : les 61 manifests Axum et
  107 manifests Leptos, avec toutes leurs tables features, dépendances,
  workspace et target. Il conserve également les versions propres aux crates
  de chaque famille, qui ne sont pas toutes identiques au tag du framework.

Les références demandées sont [MethodRouter](https://docs.rs/axum/latest/axum/routing/method_routing/struct.MethodRouter.html)
et les [modes SSR Leptos](https://book.leptos.dev/ssr/23_ssr_modes.html). Les
audits utilisent les pins locaux pour éviter qu'un lien `latest` change le
contrat observé.

## Réutilisation des propriétaires Bun

| Besoin | Propriétaire à exploiter |
| --- | --- |
| HTTP, routes, HEAD/Allow, fichiers, TLS, WS | Bun.serve et src/runtime/server ; les transports expérimentaux gardent leurs gates propres. |
| Corps, parsing et streaming | Request/Response/Headers, URL/URLSearchParams, FormData/File/Blob, Web Streams et AbortSignal. |
| Sécurité et état applicatifs | CookieMap, Bun.CSRF, crypto/SubtleCrypto, Bun.password, SQL/SQLite/Redis ; politiques et autorisation restent chez l'application. |
| Rendu HTML et assets | Bun.build, HTML imports, Bake et HTMLRewriter ; préserver les marqueurs d'hydratation Leptos. |
| Client Leptos WASM | Pipeline bun:wasm.build existant, features et target séparés pour hydrate/CSR/SSR. |
| Service Rust Axum/Leptos facultatif | Propriétaire Web existant, Axum/Tower/Tokio/http/bytes/Serde/tracing déjà consommés, crates Leptos uniquement pour les fonctions retenues. |

L'adaptateur Leptos vers Request/Response Bun reste à implémenter et qualifier :
transport server_fn, contexte/Owner par requête, headers et cookies avant flush,
annulation, backpressure, routage, assets WASM et hydratation navigateur.
Les audits détaillent les autres écarts et leurs critères de validation.
La disponibilité du source n'est pas une preuve de parité full stack.

## Correctifs HTTP qualifiés

Les routes HTML avec HMR rejettent les méthodes hors GET/HEAD avant de lancer
la compilation, après validation du Host. La réponse 405 est cadrée avec
`Allow: GET, HEAD` et `Content-Length: 0`. Une erreur persistante de compilation
HTML hors HMR conserve désormais son statut 500 sur les requêtes suivantes.
Les POST configurés, les routes API et les manifests compilés sont préservés.

Le binaire Linux reconstruit via `bun bd` sur le VPS passe les quatre suites
HTML, méthodes, routes et exécutable compilé : 107 tests, 751 assertions et
12 snapshots, avec 2 tests LeakSanitizer ignorés. Les assertions CSS vérifient
aussi les sourcemaps servies et leurs identifiants avant de comparer le contenu.
Les deux régressions HMR/500 ont été reproduites sur le runtime installé Windows.
Cette validation Linux ne qualifie pas le binaire Windows ni l'adaptateur Leptos.

Les 12 fichiers runtime, tests, scripts et workflow qualifiés sur le VPS ont
les mêmes empreintes SHA-256 que les fichiers locaux (normalisation LF).
Les contrôles ciblés `bun bd check`, `bun bd lint --deny-warnings` et
`bun bd fmt --check` passent aussi ; le typecheck couvre 10 fichiers dans
2 projets. Ces contrôles ne constituent pas un gate global du dépôt.

## Reproduction

Vérification offline des octets vendored :

```sh
bun scripts/aphrody/vendor-fullstack.ts
bun scripts/aphrody/fullstack-features.ts
```

Acquisition des mêmes pins dans les répertoires canoniques :

```sh
bun scripts/aphrody/vendor-fullstack.ts --import
bun scripts/aphrody/fullstack-features.ts --write
```

L'import exige GitHub CLI authentifié et un accès aux archives des forks. Il
refuse un arbre tronqué, un blob différent, une collision de chemin et
l'écrasement d'un fichier modifié. L'inventaire est généré avec Bun.TOML.parse.
Les contrôles source passent localement ; les tests upstream Rust, SSR/WASM et
navigateur n'ont pas été exécutés par l'exploration.
