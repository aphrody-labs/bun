# Consolidation Git et qualification — 13 octobre 2026

Périmètre : `aphrody-labs/bun`, son historique Bun-OS et les checkouts de ce
fork identifiés sur Windows, VPS et DBFR. Les dépôts distincts `bun-libraries`
et `bun-distribution` restent sous leurs propriétaires respectifs.

> Note (2026-10-25) : le miroir Bun-OS de ce document est archivé sous
> `aphrody-labs/bun-os-legacy` ; `bun-distribution` a été renommé `aphrody-labs/bun-os`.
> Le reste du texte garde les noms du 13 octobre.

## Source et fusions locales

| Commit        | Résultat                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `a1908164033` | 2 471 chemins de travail intégrés : runtime vidéo/Image/JSC/types, navigateur/CEF, CLI, packages, tests et documentation. |
| `b502f5e31bf` | Changements de publication non committés du checkout de qualification conservés.                                          |
| `dabbd9ad6de` | 179 chemins non committés du checkout Obscura conservés dans l'historique.                                                |
| `5c4b5a54fbd` | Bun-OS main fusionné : namespaces et surfaces du graphe, M3 desktop, WASI et workflows.                                   |
| `9dc65bb1cb2` | Qualification npm fusionnée en conservant le propriétaire de publication actuel, plus avancé.                             |
| `96b08b29286` | Historique Obscura fusionné sous les propriétaires canoniques actuels.                                                    |

La fusion textuelle Obscura produisait 471 conflits, principalement des anciens
déplacements de fichiers. L'audit a vérifié 836 états : 793 identiques, 43
remplacés par des versions plus avancées, et les 366 suppressions historiques
préservées. CDP/locator normalisés sont identiques ; les 15 crates, 50 tests et
contrats JSC/SSRF/V8 restent présents. Les sept compositions du checkout sale
étaient aussi déjà intégrées. La fusion d'historique conserve donc l'arbre
canonique actuel et tous les commits, sans restaurer les anciens layouts.

Huit enregistrements de worktrees inexistants ont été purgés. Deux checkouts
temporaires incomplets, contenant seulement leur fichier `.git`, ont été
retirés après preuve d'ascendance. Leurs milliers de fichiers absents n'ont
pas été committés comme suppressions. Les checkouts Obscura et npm sont
propres ; leurs données locales ignorées ont été conservées.

Deux hooks locaux legacy ont été supprimés ; `bun-agent-plugin` conserve la
propriété des hooks. Les copies de transit de Bun Video ont été remplacées
par leurs propriétaires existants. Les sources CEF importées et patches
gardent leur whitespace upstream.

## Publication GitHub

La [PR Bun-OS #3](https://github.com/aphrody-labs/bun-os-legacy/pull/3) est fusionnée
par `827b8953dd4`. Les tags officiels des deux actions et la syntaxe des deux
workflows ont été vérifiés. Les checks GitHub n'avaient pas démarré : GitHub
signale une limite de dépenses ou un problème de facturation Actions.
Les inventaires frais des deux dépôts ne montrent plus de PR ouverte.

L'audit de publication exclut les cookies, sessions, credentials, datasets,
poids, données épisode, sorties de build et cache Cloudflare. Le cache
`.wrangler/cache` a été retiré de l'arbre avant publication et conservé sur
disque avec une règle d'ignore. Le certificat CEF détecté appartient aux
fixtures publiques de tests ; l'exemple de token de documentation était déjà
dans HEAD. Aucun secret actif n'est retenu dans les changements publiés.

## Vérifications

Le binaire Windows debug reconstruit porte la révision `96b08b29286`.
Les changements suivants de clôture concernent uniquement le budget d'une
fixture de test et ce rapport ; aucun code runtime supplémentaire n'est ajouté.

| Gate                                                                           | Résultat                                                                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Graphe natif : snapshots, namespaces, surfaces, données protégées et junctions | 6 tests, 41 assertions PASS                                                                           |
| Bun.Video/Image, y compris H264 réel, RGBA, séquence, WAV, GIF et GC           | 15 tests, 217 assertions PASS ; 1 scénario « provider absent » ignoré puisque le provider est présent |
| Stress GC vidéo                                                                | 2 048 opérations de métadonnées avec buffers détachés et GC                                           |
| Déclarations Bun                                                               | 22 tests, 65 assertions PASS                                                                          |
| Serveur desktop                                                                | 30 tests, 91 assertions PASS                                                                          |
| Outillage Rust et configuration de build                                       | 22 tests, 110 assertions PASS                                                                         |
| Watchlist, SSH, R2 et livraison Shenron                                        | 26 tests, 149 assertions PASS ; intake live non configuré ignoré                                      |
| Types du package Bun Video                                                     | PASS                                                                                                  |
| Format/lint des modifications du graphe et diff de clôture                     | PASS                                                                                                  |
| Cargo root et crate vidéo, metadata complète Windows locked/offline            | PASS ; 1 534 / 195 packages                                                                           |
| WASM natif `wasm32-wasip1-threads`                                             | Compilation PASS ; semver ordre/satisfaction, parseur shell et Markdown exécutés avec succès          |

La première fixture graphe a désormais un délai local de 15 secondes : elle
hash le binaire natif de 593 353 216 octets avant ses opérations de snapshots.
Le délai global de la suite reste inchangé.

Cette qualification porte sur Windows debug et la surface WASM exécutée.
Elle ne qualifie pas un release Windows, les autres cibles natives, CEF
playback, DRM ou la livraison d'un nouveau runtime Linux.

## VPS et DBFR

Les constats de disponibilité de cette qualification étaient ponctuels et ne
décrivent plus l'accès courant. Le 14 octobre 2026, les alias SSH `vps` et
`dbfr` répondent de nouveau. `glab` 1.123.0 y est installé et authentifié comme
`aphrody-dev` via GNOME Keyring, sans jeton dans la configuration en clair.

Cette correction ne requalifie pas les anciens runtimes Linux, checkouts,
capacités disque ou déploiements. Ces propriétés doivent toujours être sondées
à nouveau avant toute opération distante. L'état GitLab courant est consigné
dans [la qualification dédiée](gitlab-mirror-host-auth-2026-10-14.md).

## Bun Video et données livrables

Le propriétaire runtime `src/runtime/video` utilise FilmCraft Rust, avec
bindings JSC et types Bun. Le chemin qualifié n'invoque ni FFmpeg ni Sharp.
Image expose extraction et RGBA ; Archive assure le packaging. Le graphe
et les opérations SSH utilisent directement Bun.

Les 875 épisodes du catalogue public Shenron existant ont été paginés,
validés et enregistrés de façon atomique dans le catalogue SQLite existant
de Bun Video. Cela qualifie les métadonnées, pas leur lecture ni leur traitement.
La CLI watchlist conserve séries et films, identités existantes et références
privées. Les sept titres du Chrome habituel ont été observés ; leurs URLs
live et l'expansion complète du compte restent non qualifiées.

L'épisode de référence conserve sa source, 33 511 frames, 5 GIF, SVG et thèmes
M3 dynamiques, page React et manifest d'assets. Les sous-titres FR comportent
177 cues officiels. Le japonais généré est une transcription ASR en 70
fenêtres, distincte de sous-titres officiels JP. Le dataset aligné comporte
177 exemples ; il n'est pas déclaré prêt pour fine-tuning sans revue.
Les extractions historiques ne sont pas requalifiées comme produites par
le nouveau décodeur. Le remux MKV absent a été retiré du manifest, la source
originale reste intacte et les archives sont reconstructibles à la demande.

R2 conserve **6 archives sur 672**, soit **399 739 836 octets**, vérifiées
par doubles GET SHA256 et metadata. Le sender a quitté après la perte SSH ;
son état terminal est `failed`, zéro transfert actif, reçus conservés.
`payloadComplete` et `publicationPerformed` restent `false`. Aucune publication
de pointeur, route CDN ou catalogue n'est revendiquée par ce transfert partiel.
Le publisher Shenron existant reste propriétaire de cette étape.

La suppression des caches natifs a été refusée par la revue automatique
(`blocked by policy`) ; aucun cache concerné n'a été supprimé. Une compression
NTFS réversible a conservé les octets vérifiés des fichiers traités.
