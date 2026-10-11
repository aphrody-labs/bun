<!-- SPDX-License-Identifier: Apache-2.0 -->
# Bun : moteur et surfaces unifiés

Directive du propriétaire, 2026-10-11. Branche de livraison : `obscura` dans
`aphrody-labs/bun-os`. Objectif : un moteur natif partagé pour JavaScript, HTML,
CSS, réseau, layout et automatisation; Aphrody consomme ses capacités et garde
les comportements produit. Les divergences avec les upstreams sont autorisées.
Les licences et notices restent attachées à leurs sources.

Surface finale : un seul binaire `bun`, une seule CLI `bun`, une seule FFI Bun,
le MCP intégré `bun mcp` et le plugin existant `bun-agent-plugin`. Les noms
d'origine ne sont conservés que dans les registres de provenance, les notices
et les formats de données historiques nécessaires à leur lecture. Aucun nouveau
binaire auxiliaire, serveur MCP ou plugin navigateur n'est une étape de livraison.

**Exécution : aucune compilation, suite de tests, Clippy ou benchmark sur le PC
du propriétaire.** Tous ces travaux passent par Infra SSH sur le VPS, dans un
checkout isolé, sous les verrous de l'usine et dans tmux. Les lectures, éditions
et opérations Git peuvent rester sur le PC. Ni production dbfr ni WSL ne sont
des cibles implicites.

Un déplacement de fichiers, un symbole présent ou une API compilée ne clôt pas
une fusion de moteur. Une tâche est cochée après la gate indiquée et son reçu.
Les gates bloquées gardent leur cause et le prochain travail nécessaire.

## État vérifié

- [x] Créer la branche `obscura` à partir de Bun OS main
  `65c232c1db46f01037b983a11499df61229d1511`.
- [x] Publier l'import complet dans
  `e4bcb7dc4d89304c1689222fd0af3cb07c5e4ee8` : neuf crates Bun,
  extraction et Taffy patché, fixtures, polices, licences et patches.
- [x] Vérifier les 346 fichiers transférés, 25 195 518 octets, par SHA256.
  [Inventaire](src/browser/MIGRATION.json), source Aphrody
  `2d66be8fcd84a87b4ca73124023881ca9d0c204f`. Une adaptation initiale : chemin
  relatif Taffy dans le manifest renderer.
- [x] Qualifier l'import initial Windows avant la directive de builds VPS :
  nextest 2 247 PASS, 7 ignorés; Clippy strict PASS avec render et all-targets.
  Ce reçu ne qualifie aucun futur raccord Bun/JSC.
- [x] Qualifier cet import Linux sur VPS : check PASS, nextest 2 250 PASS,
  5 ignorés, Clippy strict PASS; code de sortie 0. Reçu
  `/home/ubuntu/obscura-vps-gates.log`, toolchain Rust 1.98.1.
  Ce reçu précède les raccords HTML/CSS/JSC.
- [ ] Publier et qualifier chaque lot de fusion ci-dessous; joindre commit,
  commande, toolchain, plateforme, nombre de tests et échecs/ignorés.
- [x] Inventorier 176 documents de recherche et transférer 58 fichiers/687 717
  octets de bibliothèques service/crawl/détection/index et de SDK natif CDP.
  [Registre](src/browser/BROWSER-MIGRATION.json),
  [mapping des capacités](src/browser/docs/browser-migration.md).
- [x] Rassembler les 15 bibliothèques sous `src/browser`, identités `bun_browser*`;
  conserver les registres d'import et leurs empreintes d'origine distinctes des
  adaptations d'intégration.
- [x] Intégrer ces 15 crates comme membres du seul workspace Cargo racine Bun;
  supprimer le manifest, Cargo.lock, toolchain et configuration Cargo du
  workspace intermédiaire. Les dépendances et le lock racine font autorité.
- [x] Déclarer le profil racine `browser-tests`, hérité de `dev`, avec
  `debug = 0`, `incremental = false` et `split-debuginfo = "off"`.
- [ ] Qualifier ce nouveau graphe racine et son lock généré par Cargo sur VPS :
  check/test/Clippy strict ciblés avec le profil `browser-tests`. Les reçus de
  l'import initial autonome ne qualifient pas cette intégration.
- [ ] Qualifier les raccords HTML et CSS écrits; leur présence dans le code ne
  qualifie pas encore le binaire exécuté.

Allocation VPS déclarée pour ce lot :
`/home/ubuntu/builds/bun-os-factory`, 107 GiB de disque et 45 GiB de RAM.
Vérifier disponibilités, bail et verrous de l'usine avant chaque gate lourde.
Cette allocation n'est pas un reçu d'exécution; les nouvelles gates restent
non qualifiées. Aucun retour aux builds sur le PC du propriétaire.

## 1. Sources de décision et benchmarks existants

Références officielles relues le 2026-10-11 :
[Bun 1.4.3](https://bun.sh/blog/bun-v1.4.3) et [Bun](https://bun.sh).
Les capacités et résultats annoncés par upstream restent distincts de la
qualification de notre candidat. Vérifier `bun check`, les options `--check`,
les modules et correctifs de cette version via les suites existantes.
La référence publique consultée est upstream 1.4.3; les manifests de notre
fork sont alignés sur 1.4.4. Ces numéros ne démontrent ni build candidat,
installation, activation ni parité des moteurs fusionnés.
Upstream Git rafraîchi : `6c1eb067e3c3943d2035bc165b241539c0b673b6`,
merge-base `e655c5803297cc44bb96d844d7766815af0220ad`; 11 commits
upstream à intégrer au candidat au relevé du 2026-10-11.

- [ ] Ajouter l'orchestrateur récursif de lots lint/types/Rust/runtime/docs,
  provenance des recherches, DAG de dépendances, reçus JSON et reprises après
  changement de sources; exécution complète exclusivement sur VPS.
- [ ] Qualifier son mode plan, ses gardes hôte/verrou et ses codes d'échec sur VPS.
- [ ] Fusionner les 11 commits upstream après le lot courant, résoudre les
  conflits conservant nos capacités, puis repasser les lots impactés et la
  couverture complète. Un relevé sans conflit ne qualifie pas une fusion.
  Préparation `git merge-tree` : conflits dans `Cargo.lock`, `package.json`,
  `test/cli/check/check.test.ts`; ce relevé ne modifie aucun checkout.

Références Aphrody au commit source ci-dessus; les résultats datés restent des
preuves de ces seuls pins. Les chemins `vendor/bun`, les anciens binaires et les
plans Drive absents ne deviennent pas des chemins actifs par citation.

| Source | Utilisation | Limite |
| --- | --- | --- |
| [METHOD](https://github.com/aphrody-labs/aphrody/blob/2d66be8fcd84a87b4ca73124023881ca9d0c204f/docs/plans/fusion/bench/METHOD.md) | Contrôles C1–C14, sondes P1–P5, métriques S1–S7/E1/E2/R1 | Méthode 2026-10-05; les anciens pins doivent être remplacés pour une nouvelle mesure |
| [FACTS](https://github.com/aphrody-labs/aphrody/blob/2d66be8fcd84a87b4ca73124023881ca9d0c204f/docs/plans/fusion/bench/FACTS.md) | Résultats B1/B2/B3 et limites snapshot/heap/locale/cache | B3 avec ops simulées ne démontre pas un navigateur JSC |
| [Équivalence moteur](https://github.com/aphrody-labs/aphrody/blob/2d66be8fcd84a87b4ca73124023881ca9d0c204f/docs/plans/fusion/engine-equivalence-2026-10-05.json) | Inventaire symboles V8/JSC, gaps et mitigations | Un symbole trouvé ne prouve ni comportement ni sécurité |
| [Audit moteur](https://github.com/aphrody-labs/aphrody/blob/2d66be8fcd84a87b4ca73124023881ca9d0c204f/scripts/audit/engine-equivalence.ts) | Rafraîchir le relevé contre les vrais pins Bun OS/WebKit/Bun | Adapter découverte checkout et cache WebKit; aucun chemin historique codé en dur comme preuve |
| [Showcase V8/Deno](https://github.com/aphrody-labs/aphrody/blob/2d66be8fcd84a87b4ca73124023881ca9d0c204f/scripts/tools/web/obscura-v8-deno.ts) | Inventaire ops/bootstrap et page locale réelle | Statique et live sont deux gates distinctes |
| [Spécification Bun](src/browser/docs/obscura-integration-spec.md) | Inventaire DOM/CDP/HTTP/MCP et adaptations | Rapport historique; manifest et tests courants décident |
| [Plan desktop/web](https://github.com/aphrody-labs/aphrody/blob/2d66be8fcd84a87b4ca73124023881ca9d0c204f/docs/plans/desktop-web/PLAN.md) | Items navigateur hérités et frontière CEF | CEF/Tauri n'est pas remplacé par cet import |
| [Arène existante](bench/aphrody/arena/arena.ts) | Fork/baseline/Deno, processus frais entrelacés, résultats bruts | Deno informatif; mesurer Bun réel pour snapshot et ops |
| [Charges partagées](bench/aphrody/arena/shared) | compute, JSON, realm, startup, fetch, serve, sqlite, gzip, FFI | Séparer voie moteur et voie runtime |
| [Profils](bench/aphrody/arena/profiles.json) | JIT/GC contrôlés | Mêmes paramètres des deux côtés, versions consignées |
| [Documentation benchmarks](docs/project/benchmarking.mdx) | Horloges, heapStats et outillage existant | Aucun gain annoncé sans mesures comparables |

- [ ] Relever SHA256, révision, WebKit, Rust/JSC/V8/Deno, profil release/LTO et
  variables JIT de chaque binaire candidat/baseline sur VPS.
- [ ] Réutiliser l'arène et les microbancs B3 existants; ne pas créer une seconde
  arène concurrente. Donner aux résultats nouveaux leur propre pin/horodatage.
- [ ] Rafraîchir l'inventaire des ops `deno_core::op2`, signatures, états,
  async/sync, realms, dépendances réseau et rendu; associer chaque op à sa gate.
- [ ] Rafraîchir audit V8/JSC contre les en-têtes WebKit effectivement liés.
- [ ] Résoudre les références archivées/retirées avant de les compter comme tests
  présents, notamment les anciens 119 tests `Bun.WebView`.

## 2. Protocole de mesure et critères

- [ ] C1/C2 : binaires identifiés par SHA256 et révisions; source et flags V8
  d'Bun consignés, Deno pin vérifié.
- [ ] C3/C13 : mêmes charges/entrées, checksums identiques, graine fixe, hash des
  sources avant/après, aucune optimisation spécifique au checksum du banc.
- [ ] C4/C5 : builds production comparables, JIT par défaut des deux côtés ou
  désactivé des deux; ne pas mélanger debug/ASAN et release.
- [ ] C6/C7 : au moins 5 processus frais entrelacés, 10 échauffements compute,
  au moins 10 mesures; hôte calme avant/après, nice 10, locks réellement testés
  par flock, CPU steal et charge consignés. Stationnarité ≤5% ou écart expliqué.
- [ ] C8/C9/C11 : distinguer démarrage processus, VM, realm, bootstrap, page
  complète; ECMAScript pur séparé des API propres aux runtimes; déclarer snapshot
  V8 contre bootstrap/cache JSC, jamais extrapoler Deno à Bun snapshoté.
- [ ] C10/C12/C14 : VmHWM lu dans l'enfant et GC consignés; sondes capacités
  PASS/FAIL; JSON brut avec commande, host, pins, sources et échantillons.
- [ ] Publier verdict `valide`, `indicatif`, `invalide` ou `à reproduire`, avec les
  contrôles en défaut. Aucun seuil proposé n'est présenté comme mesure acquise.

| Gate | Critère proposé issu de METHOD | Refus/alerte |
| --- | --- | --- |
| S1/S2/S3 | Processus, VM, realm mesurés séparément; reprendre seuils METHOD avant verdict | Aucune déduction depuis un seul startup CLI |
| S4 bootstrap | Cache médiane ≤20 ms, froid p95 ≤100 ms | Froid p95 >100 ms ET cache médiane >50 ms |
| S5 page locale | ≤85 ms ou ≤1,2× baseline V8 mesurée | >1,5× baseline V8 |
| S6 mémoire page | RSS ≤1,5× V8 et relevé par enfant | >2× V8 |
| S7 op synchrone | 10⁶ appels host JSC/op Deno, ratio ≤1,5 | >3×; nécessite un harnais natif |
| E1/E2 | Charges compute/JSON identiques, ratio ≤1,25 neutre | >2× sur une charge, alerte documentée |
| R1 runtime | APIs runtime mesurées à part | Ne décide jamais seul le choix JSC/V8 |

## 3. JavaScript : VM, realms et ops

- [ ] Créer un BrowserRealm minimal dans la VM JSC Bun : global distinct,
  GC roots, JSLock, destruction et comptes mémoire; ne pas utiliser le global
  Bun, EvalGlobalObject ou l'isolation des tests comme sandbox de page.
- [ ] Exposer l'arbre DOM natif partagé uniquement par callbacks autorisés dans
  ce realm; aucun Bun/process/require/FFI/env/FS implicite pour une page distante.
- [ ] Porter les ops DOM sync vers le host JSC avec conversions/erreurs/IDs
  vérifiés; bannir les références JS traversant VM/thread/realm sans protection.
- [ ] Porter ops async, queue de tâches, promises, microtasks, timers, rAF,
  annulation et exceptions; préserver ordre observable et budgets.
- [ ] Porter bootstrap.js sans Deno.core; remplacer uniquement les APIs dont
  le comportement WebCore Bun est qualifié sur les mêmes fixtures.
- [ ] Modules/import maps/CSP : résolveur Bun commun avec origines, URL et
  politiques navigateur; aucun accès package/host implicite par import de page.
- [ ] Frames : contexte par frame, WindowProxy, navigation/détachement,
  postMessage/targetOrigin, structured clone, cookies et storage par origine.
- [ ] Workers : VM/thread et lifecycle explicites; messages, timers, close,
  imports, ressources et budgets qualifiés avant transfert d'ownership.
- [ ] P1 heap : arrêt avant limite choisie, réaction bornée, processus survivant,
  contexte suivant `1+1`; une option GC ne remplace pas un callback heap limite.
- [ ] P2 watchdog : boucle infinie interrompue dans ≤2× échéance, VM réutilisable.
- [ ] P3 locale ICU : langue fixée par l'hôte effectivement visible; timezone
  testée séparément. Vérifier les corrections Bun existantes, ne pas les supposer.
- [ ] P4 flags/JIT : options acceptées, inconnues rejetées, mode réellement actif.
- [ ] P5 bytecode/snapshot : cache accepté/rejeté, invalidation version/options,
  code de démarrage; JSC n'offre pas actuellement l'équivalent prouvé du snapshot V8.
- [ ] Qualifier GC, weak/finalizers, exceptions, promises, interruption et teardown
  par tests existants Bun puis WPT ciblés; seulement ensuite retirer deno_core,
  deno_v8, rusty_v8, snapshots et ops remplacés du graphe livré.

## 4. HTML et DOM communs

- [ ] Raccorder HTMLDocument natif Bun à obscura-dom : un arbre persistant,
  IDs stables, parsing HTML5, querySelector, sérialisation et mutations.
- [ ] Ownership Arc/GC/finalization, handles invalides, mutation après close,
  documents détachés et mémoire comptabilisée; tests GC forcé et durée de vie.
- [ ] Brancher le même arbre dans le realm JS, le renderer et CDP : aucune copie
  divergente du DOM entre HTML API, exécution et capture.
- [ ] HTML5 : fragments/table/foster parenting, encodage, commentaires/doctype,
  namespace SVG/MathML, shadow DOM/slots, templates et script lifecycle.
- [ ] DOM Web : collections live, observers, événements/capture/bubble,
  formulaires/input/textarea, adoption/importNode et CSSOM mutations.
- [ ] Conserver HTMLRewriter streaming jusqu'à qualification d'un remplacement
  équivalent; ne pas assimiler réécriture streaming et DOM persistant.
- [ ] Après mesures et gate comportement, retirer les parseurs/arbres redondants
  réellement remplacés; préserver les usages non équivalents.

## 5. CSS, layout et peinture communs

- [ ] Raccorder l'AST/parser bun_css au navigateur, avec récupération d'erreurs
  CSS et règles inconnues; utiliser des blocs owned, pas deux scanners divergents.
- [ ] Unifier tokens, declarations, sélecteurs, nesting, media/supports/container,
  layers, scopes, variables/calc et imports sur des fixtures communes.
- [ ] Cascade/inheritance/specificity/important/pseudo-classes : préserver résultats
  layout; ne pas appliquer une minification bundler qui change la sémantique page.
- [ ] CSSOM et computed style : modèle commun, invalidation incrementale,
  hover/focus/scroll, style mutations et query selectors cohérents avec layout.
- [ ] Layout Taffy : patches de libération context data/invalidation conservés;
  block/inline/flex/grid/floats/containment, coordonnées et scroll qualifiés.
- [ ] Paint : polices provenance/fallback, shaping/axes/line-break, SVG/images,
  clips/transforms/sticky/fixed, canvas et capture DPR/full-page/regions.
- [ ] Partager le GPU hub/wgpu déclaré, porter WebGPU aux versions du lock courant,
  permissions par contexte et limite de ressources des pages distantes.
- [ ] Qualifier pixel/layout/selector et CPU/RSS avant retrait des scanners et
  caches devenus inutiles; un adaptateur normalize seul reste un lot intermédiaire.

## 6. Réseau, APIs Web et automatisation

- [ ] Comparer Bun WebCore et les ops réseau/URL/encoding/crypto/streams Bun
  avant remplacement; même contrat de body binaire et abort/backpressure.
- [ ] Partager HTTP/TLS/cookies/proxy/DNS sous profils navigateur; SSRF, private
  ranges, redirects, file:// opt-in, trackers et permissions restent appliqués.
- [ ] Qualifier TLS impersonation/stealth Windows et Linux; HTTP/3 demeure ouvert
  tant qu'implémentation et tests ne sont pas présents.
- [ ] CDP Runtime/DOM/Page/Network/Target/Storage/Input : adapter les IDs realm,
  exceptions, promise awaiting, bindings, capture et lifecycle au backend commun.
- [ ] Playwright : visibilité/actionability depuis layout réel, getByRole/ARIA,
  navigation/downloads/frames et résultats d'erreur; aucun no-op revendiqué conforme.
- [ ] Garder une seule exposition MCP côté Aphrody; typer les API/SDK Bun OS,
  permissions et erreurs; tests CLI content-only et profils conservés.

## 7. Aphrody léger, livraison et suppression qualifiée

- [ ] Pin Git exact Bun OS pour les 11 identités Rust; préserver ABI/noms/features.
- [ ] Adapter audits, provenance et docs au provider externe; aucun chemin source
  local supprimé encore utilisé par les outils.
- [ ] Générer Cargo.lock par Cargo sur VPS sans bulk update; vérifier toutes les
  versions externes ajoutées/modifiées et les expliquer.
- [ ] Qualifier consommateurs Aphrody CLI/service/FFI/MCP et `@aphrody/web-test`
  sur VPS avec le provider publié; check/test/strict Clippy et gates TS ciblées.
- [ ] Retirer les 11 arbres moteur et patches dupliqués d'Aphrody après qualification;
  conserver les sources rollback dans Git, les notices et les liens de provenance.
- [ ] Mesurer séparément sources retirées, membres workspace, compilation, taille
  artefact, RSS/démarrage; aucune baisse de taille binaire déduite du déplacement.
- [ ] Produire le runtime/SDK précompilé depuis la branche fusionnée, types et
  packages versionnés, checksums et installation réelle avant annoncer activation.
- [ ] Push normal sur remotes existants, ancestry vérifiée, commits des seuls chemins
  possédés sous `aphrody-dev <contact@aphrody.com>`, sans attribuer les travaux concurrents.
- [ ] Intégrer `obscura` à Bun OS main après gates complètes; le push d'une branche
  ne constitue pas cette intégration et aucun force-push n'est autorisé.

## 8. Consolidation des capacités et des interfaces

- [ ] Compléter le transfert des domaines frames/engine/extraction dynamique,
  acquisition, capture média, rediffusion, RAG et entraînement qui ont encore
  des sources actives; réutiliser chaque capacité Bun existante avant de porter.
- [ ] Mapper toutes les fonctions historiques aux owners présents ou à une gate
  ouverte. Aucun solveur CAPTCHA, cache de sélecteurs ou apprentissage de schéma
  n'est déclaré présent depuis un document qui n'a plus de source exécutable.
- [ ] Réutiliser `Bun.WebView`/CDP pour les modules SDK et locators transférés;
  qualification provider local, contextes, screenshots, erreurs et annulation.
- [ ] Modules lourds facultatifs : frontières internes/lazy load et features
  explicites dans le même produit, sans nouveau runtime, binaire ou plugin.
- [ ] Raccorder outils navigateur à la registry MCP Bun existante; retirer les
  serveurs/aliases spécialisés après migration des clients et schemas.
- [ ] Porter exports utiles à la seule FFI Bun, conventions bytes/free, erreurs,
  panic/unwind, ownership et version ABI; retirer les anciennes DLL/cdylib et
  wrappers seulement après tests des consommateurs Rust/TS/Python concernés.
- [ ] Installer les skills/docs/types via le seul `bun-agent-plugin`; aucune
  identité plugin navigateur supplémentaire ni deuxième copie de ses docs.
- [ ] Consolider aide, documentation produit, examples, manifests et types sous
  Bun; préserver auteurs/licences/provenance et anciens formats lisibles.
- [ ] Vérifier un seul point de démarrage CLI, un seul binaire livré, une seule
  registry MCP active, un seul catalogue plugin et un seul owner FFI.
- [ ] Après stabilité démontrée, faire appeler directement Bun par les produits;
  retirer les anciennes surfaces produit et les wrappers remplacés.

## 9. Famille Chromium, Python et dépendances natives Bun

Directive du propriétaire, 2026-10-11 : intégrer la famille Chromium de façon
cross-platform et converger l'exécution des pages sur Bun/JSC. Réutiliser Buv,
`bun:python`, `bun uv`, `bun install` et les propriétaires natifs de dépendances
système. [Inventaire actuel](docs/project/chromium-native-owners.mdx).
La connexion CDP à Chrome/CEF ne démontre pas le remplacement de leur V8 interne.

- [x] Relever les propriétaires existants et l'aide installée : UV embarqué,
  host Python ABI 1, Bun.WebView/CDP, gestion CEF, winget/APK et `bun msvc`.
  Aucune installation ni qualification d'un nouveau build dans ce relevé.
- [ ] Planifier versions exactes Chromium/depot_tools/CPython/UV/JSC, dépendances
  et acquisition au moyen des owners existants; préserver notices et provenance.
- [ ] Qualifier `bun uv` et le host `bun:python` pour les vrais outils Chromium :
  argv/Unicode/cwd/env, `sys.executable`, sous-processus, exceptions et codes de
  sortie. Un évaluateur Python embarqué ne remplace pas la CLI automatiquement.
- [ ] Réutiliser l'inventaire/setup factory et `bun msvc` pour les toolchains;
  aucune installation globale ou changement de PATH/registre sur le PC.
- [ ] Qualifier les sources winget/APK déjà implémentées avec lock/hashes,
  rootfs/transactions, scripts/elevation et rollback sur les cibles déclarées.
- [ ] Implémenter Debian/apt dans `src/install/system` avant annoncer son usage
  natif : `source_for` retourne actuellement None et `bun pm apt|deb|pacman`
  refuse explicitement. Signatures/index, versions/architectures, fermeture des
  dépendances, scripts, permissions, transactions et rollback ont leurs gates.
  Le bootstrap factory apt-get existant reste identifié séparément.
- [ ] Réutiliser la détection/lifecycle Chromium/Chrome/Brave/Edge et la pipe CDP
  native Bun.WebView; qualifier erreur de binaire absent, profils, auth endpoint,
  événements, fermetures/descendants, captures et navigation réelle par cible.
- [ ] Qualifier séparément WebView de plateforme et CEF; inventorier leurs
  helpers existants et consolider la livraison dans le seul produit Bun avant
  retrait, sans créer de serveur/plugin/binaire navigateur supplémentaire.
- [ ] Converger le realm de page Bun/JSC avec DOM/layout/réseau communs et les
  gates du chapitre 3; refuser tout accès implicite Bun/Node/Python/FFI/FS/env/
  process/installers pour des pages distantes. Retirer V8 seulement après parité.
- [ ] Pour un remplacement JSC à l'intérieur même de Chromium/CEF, établir un
  contrat d'embedding et des preuves de build/comportement distinctes; ne pas
  assimiler ce chantier à une simple adaptation CDP.
- [ ] Relever l'enveloppe disque demandée de 108 GB et les ressources réelles
  en octets sur `/home/ubuntu/builds/bun-os-factory`, RAM/slots/verrous compris.
  Le précédent relevé de 107 GiB/45 GiB reste daté; les unités ne sont pas
  interchangeables. Aucun lourd local faute de ressources SSH suffisantes.
- [ ] Qualifier Linux/Windows/macOS : compilation sur hôtes qualifiés, tests
  réels sur chaque cible, acquisition/checksums, installation et rollback;
  publier les reçus et benchmarks avant bascule des consommateurs.

## Critère de fermeture

La fusion est terminée quand le binaire Bun OS publié exécute les pages sur son
backend JS qualifié, partage DOM/HTML/CSS/layout/réseau sans implémentations
redondantes remplacées, passe les suites navigateur/automatisation et les sondes,
dispose de benchmarks comparables, et qu'Aphrody consomme cet artefact/provider
sans conserver son moteur dupliqué. Chaque gate restante garde une case ouverte.
