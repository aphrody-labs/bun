# FilmCraft / PhotoCraft : audit REA et propriétaires Bun

Audit du 18 octobre 2026, sur les sources effectivement présentes. Ce document
décrit des frontières et des obligations d'extraction ; il ne qualifie aucune
fonction Rust, aucun build WASM et aucune parité fonctionnelle par exécution.

## Sources et résultat REA

- FilmCraft : `vendor/filmcraft`, HEAD initial
  `87b845138e2cecf43e97e2c2e011b820a6e70ecd` ; fusion upstream en cours inspectée
  avec `MERGE_HEAD` `6c3948a36c80e4996d924766ba7157eec4fca85e`, workspace 0.9.0.
- PhotoCraft : `vendor/photocraft`, HEAD réinspecté après mise à jour upstream
  `9185b64b94c07458038e768f4b31778590ba93ee`, workspace 0.10.0.
- Les deux workspaces sont Rust édition 2024, Rust minimum 1.95,
  licence MIT OR Apache-2.0. Les moteurs ne sont pas des applications Node à
  réécrire automatiquement en TypeScript.

REA 6.7.0 a réellement exécuté une analyse statique bornée sous le binaire Bun
release de ce checkout, sans lancer le code analysé :

```powershell
$env:BUN_DEBUG_QUIET_LOGS='1'
& ./build/release/bun.exe "$env:USERPROFILE/.bun/install/global/node_modules/rea-agents/scripts/rea.mjs" analyze-javascript-application ./vendor/filmcraft --artifact-format directory --source-path apps/filmcraft-web/web/audio-worklet.js --max-heap-mb 256 --analysis-timeout-ms 20000 --format json
```

La commande a terminé en 3,4 secondes, code 0. Evidence :
`ev_b60bfc172e0c2c48e343dbfb1bba41dfd22f9e17bae6fbdd57029bcda0335804`.
Le JSON local de 343646 octets est conservé dans
`$env:TEMP/filmcraft-rea-audio-worklet.json`, SHA-256
`f53dc2daf1aa20f123ab28f176aad7304df890ca047f1df855ccfae27ff8a20a`.
Le fichier source analysé a pour SHA-256
`e3d3272a30eafe34505e5676eb3543d7248870835a5569f314f388c89b807524`.
L'Evidence indique une confiance `derived`, sept fichiers inventoriés hors
périmètre et des relations sémantiques partielles. Ce résultat concerne
uniquement le worklet audio JS ; il ne constitue pas une analyse REA du Rust,
une preuve de bon fonctionnement audio ou un certificat de parité des moteurs.
PhotoCraft ne présente aucun fichier JS/TS/MJS dans l'inventaire source inspecté.
Le hash du worklet a été revérifié après fusion upstream : inchangé.
Les rapports annoncés `build/filmcraft-n2b.json` et
`build/photocraft-n2b.json` étaient tous deux vides (0 octet) lors du contrôle ;
ils ne prouvent aucune transformation n2b. Une migration n2b vise les outils et
glues JS, pas la réécriture des codecs Rust ni leur qualification WASM.

## Propriétaires et extraction

| Domaine source                                                   | Propriétaire Bun existant ou destination de l'adaptateur                      | Contrat à conserver                                                                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| FilmCraft `bitstream`, codecs vidéo/audio, containers            | `packages/bun-video/native`, façade `src/runtime/video`                       | Décodage et encodage natifs ; limites, annulation et erreurs récupérables ; aucun FFmpeg obligatoire                      |
| FilmCraft `time`, `project`, `edit`, `automation`                | Modèle de projet et commandes de `packages/bun-video`                         | Ticks entiers, historiques, commandes partagées entre CLI et éditeur ; aucune UI dans le moteur                           |
| FilmCraft `render`, `gpu`, `color`, `scopes`, `text`, `captions` | Composition et WebGPU de `packages/bun-video`, transformations image communes | CPU de référence, effets, titres, sous-titres, rendu linéaire et scopes ; GPU optionnel                                   |
| FilmCraft `export`, `audio-dsp`                                  | Pipeline vidéo natif et export de `packages/bun-video`                        | Rendu → encodeur → mux ; audio, progression, annulation, presets et synchronisation                                       |
| PhotoCraft `codecs`, `raw`, `heif`, `cms`, `color`               | `src/runtime/image`, façade `Bun.Image`                                       | Profondeurs, métadonnées, profils, orientation, pages et animations ; ne pas écraser les pixels float/16-bit en RGBA8     |
| PhotoCraft `doc`, `ops`, `raster`, `compose`, `paint`, `algo`    | Moteur documentaire image derrière la façade Bun                              | Calques, masques, modes de fusion, sélections, historique, rendu et pinceaux ; la classe Image bitmap ne suffit pas seule |
| PhotoCraft `psd`, `affinity`, `format`, `io`, `vector`, `text`   | Import/export documentaire image et bibliothèque web                          | Préservation des calques, texte, vecteurs, avertissements de pertes et formats natifs                                     |
| PhotoCraft `automation`, `engine`, `plugins`                     | API de commandes headless et adaptation Bun                                   | Une seule exécution de commandes ; plugins explicitement isolés ; aucun chargement UI obligatoire                         |
| Frontends egui, plateformes et tablettes des deux projets        | Frontends et adaptateurs optionnels                                           | Conserver leurs fonctionnalités ; ne pas importer ces dépendances dans les bibliothèques headless/WASM                    |

La compression de bitstream et les modes de compression propres aux formats
appartiennent aux codecs/conteneurs image et vidéo. Ils ne doivent pas devenir
des doublons des API générales de compression Bun : réutiliser ces dernières
uniquement lorsque le format, les limites et le comportement sont identiques.

Points d'entrée Rust directement réutilisables, vérifiés dans les sources :
`filmcraft_codecs::{open_bytes, openers, reader_openers, make_video_decoder}`,
`filmcraft_media::{open_bytes, open_path, MediaSource, FrameRequest}`,
`filmcraft_engine::{command_specs, find_command}` et les réexports `export`,
`project`, `render` ; côté photo,
`photocraft_engine::{Session, command_specs}` et
`photocraft_automation::{Headless, AuthorizedWorkspace}`. Préférer ces contrats
aux appels CLI en sous-processus pour le futur binding Bun.

## Différences actuelles à résoudre

L'intégration Bun existante `packages/bun-video/native/Cargo.toml` dépend de
FilmCraft git `9b7893a2f67cb40832a4cd709f3ccfa7c96ce8e2` et de sa façade
`filmcraft-lib`. Cette façade n'existe pas dans l'arbre upstream HEAD inspecté.
Le nouveau submodule ne remplace donc pas à lui seul le provider existant :
il faut porter l'adaptateur vers les propriétaires upstream ou porter la façade
avec provenance, puis qualifier la nouvelle révision. La documentation historique
`packages/bun-video/docs/filmcraft.md` décrit encore une autre révision source.

Les wrappers actuels `src/runtime/video/Video.rs` et
`packages/bun-video/native/src/filmcraft.rs` couvrent une partie des opérations
media, sans exposer tout l'éditeur, l'exporteur ni la timeline upstream.
`src/runtime/image` possède déjà PNG/JPEG/WebP/GIF/BMP, EXIF et backends plateforme ;
l'extraction PhotoCraft doit étendre ces propriétaires sans créer un second
chemin concurrent pour les mêmes primitives.

## Headless et WASM : ce que les sources prouvent

FilmCraft dispose déjà de `apps/filmcraft-cli` (CLI et serveur MCP headless,
`default = []`) et de `apps/filmcraft-web` (cdylib WASM). Son exporteur est une
crate distincte du frontend. `docs/web.md` expose Blob, OPFS, WebAudio,
WebCodecs et WebGPU avec repli logiciel. Ce frontend WASM dépend d'egui/eframe,
`window` et d'une boucle UI : ce n'est pas encore une bibliothèque WASM headless.
Le document décrit explicitement un moteur WASM monothread coopératif ; proxies,
prévisualisations sur workers, Project Manager et suivi de masques retournent
encore une erreur sur web. L'objectif « sans perte de fonctionnalité » exige
de traiter ces fonctions, pas de les supprimer de la matrice.

PhotoCraft possède déjà `apps/photocraft-cli` (lib + bin, conversion, inspection,
commandes, batch, MCP) et `apps/photocraft-web` (frontend eframe WebGPU/WebGL2).
`crates/codecs/src/lib.rs` expose déjà des fonctions Rust publiques de décodage,
options/limites, TIFF multipage, GIF animé, OpenEXR et Cryptomatte. Les codecs
WASM restent monothread selon leur manifeste. Le frontend web n'est pas à lui
seul un export WASM de ces API pour un Worker ou Bun.

Limites upstream à préserver explicitement dans les capacités : FilmCraft ne
dispose pas d'encodage AV1 logiciel ; HEVC exporte via certains encodeurs
matériels. PhotoCraft AVIF encode seulement derrière feature `avif`, HEIF décode
seulement derrière feature `heif`, JPEG XL et AVIF decode sont absents ; Affinity
est en lecture seule avec avertissements sur les constructions non prises en
charge. Sources : README des projets et manifeste `photocraft-codecs`.

## Preuves requises avant déclaration de parité

1. Inventaire versionné des commandes, formats, directions encode/decode,
   profondeurs, options, exports et erreurs depuis les registres Rust ; comparaison
   avec les surfaces Bun natives et WASM, sans supprimer les entrées manquantes.
2. Même projet synthétique et mêmes fixtures bornées pour le moteur natif,
   Bun natif et bibliothèque WASM sans DOM ; comparer pixels, audio, timing,
   calques, métadonnées et paquets selon chaque contrat de format.
3. CLI et bibliothèque exécutables sans serveur graphique, frontend, FFmpeg,
   libmpv ni processus codec auxiliaire ; les outils oracles de test restent
   séparés du runtime.
4. Test WASM dans Bun puis Worker navigateur sans canvas/UI pour les opérations
   CPU ; qualification séparée des adaptateurs WebGPU, WebCodecs et audio.
5. Hostilité des entrées : allocations bornées, troncatures, nombres invalides,
   projets cycliques, annulation, erreurs récupérables et libération des ressources.
6. Conservation des licences, attributions d'assets et restrictions des marques ;
   conserver la provenance upstream des sources extraites.

Aucune compilation lourde ni test de moteur n'a été lancé dans cet audit afin
de préserver le build release parent déjà actif. Les commandes de qualification
doivent utiliser le runtime checkout via `bun bd` et les gates Rust sérialisées.
