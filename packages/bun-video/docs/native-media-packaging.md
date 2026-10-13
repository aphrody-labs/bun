# Média natif embarqué

## SDK optionnels

`src/sdk-manifest.json` épingle les archives amont, leurs tailles, SHA-256,
révisions sources et ABI attendues. FFmpeg SDK 9.0.2 et la crate
`ffmpeg-sys-next` 9.0.1 sont deux versions distinctes. Les archives distribuées
dans `assets` sont des ZIP normalisés ; les archives `upstreamAssets` servent
uniquement à la factory. Aucun ZIP distribué n'est encore qualifié dans ce
manifeste.

Les scripts existants `scripts/aphrody/ffmpeg.ts` et `libmpv.ts` affichent
`sdk-plan` par défaut. `sdk-upstream-download` vérifie chaque téléchargement.
Sur la factory Linux, `sdk-normalize <target> <archive> <nouveau-répertoire>`
vérifie l'identité amont, extrait avec un outil natif, puis produit le ZIP et
`distribution.json`. Les fichiers pkg-config utilisent un préfixe relatif et
les fichiers exécutables conservent leurs permissions. Les liens internes sont
matérialisés ; les liens qui sortent du SDK sont refusés.

`sdk-download` et `sdk-extract` consomment exclusivement les ZIP distribués
épinglés. `sdk-verify <préfixe>` vérifie les en-têtes, bibliothèques, importlibs,
exécutables et notices de licence. Cette vérification des fichiers ne prouve
pas l'ABI du code exécuté. Le reçu `bun-sdk-receipt.json` contient les empreintes
des fichiers et conserve `nativeRuntimeABI: "not-yet-qualified"` avant les gates
natifs.

Les builds source sont explicites : `sdk-source <nouveau-répertoire>` récupère
la révision officielle, puis `build` exige ce checkout propre. Les chemins sont
configurables par `BUN_FFMPEG_SOURCE`, `BUN_MPV_SOURCE` et `BUN_MEDIA_PREFIX`.
Le SDK mpv Linux reste à construire et qualifier sur la factory, avec ses
prérequis libplacebo/libass et le SDK FFmpeg sélectionné. FFmpeg et mpv restent
optionnels ; aucun téléchargement ni build ne survient à l'import du package.

Le préfixe installé est `dirname(process.execPath)/lib/media/<ffmpeg|mpv>/<target>`
avec `bin`, `include`, `lib` et les notices de licence. La version figure dans le
reçu ; aucune ancienne version n'est conservée dans un second répertoire.
Les bindings FFI utilisent `bin` sur Windows et `lib` sur Linux. Un répertoire
de bibliothèques explicite ou `BUN_VIDEO_MEDIA_DIR` remplace cette découverte ;
`FFMPEG_DIR` désigne le préfixe complet pendant la compilation Rust.

## Exécutables embarqués

`scripts/media-plugin.ts` embarque les trois exécutables explicitement qualifiés
dans `BUN_VIDEO_NATIVE_EXECUTABLE`, `BUN_VIDEO_FFMPEG` et `BUN_VIDEO_FFPROBE`.
Sur Windows, FFmpeg et FFprobe doivent partager leur répertoire de DLL qualifié.

Le plugin lit leurs tables d'import PE et suit les dépendances transitives.
Il sélectionne uniquement les DLL adjacentes effectivement référencées dans
l'allowlist des bibliothèques FFmpeg, codecs, polices et runtimes associés.
Les autres DLL du dossier ne sont pas embarquées. Une dépendance média requise
manquante ou un import adjacent hors allowlist fait échouer la compilation.
Les bibliothèques système et pilotes restent celles de l'hôte qualifié.

Les DLL sélectionnées sont extraites dans le même répertoire temporaire privé
que les exécutables, avec leurs noms d'origine. Ce répertoire appartient au
processus et est supprimé à sa sortie. Cela préserve la résolution DLL Windows
du runtime FFmpeg sans modifier PATH global ni les bibliothèques système.

Le test du plugin vérifie la résolution des sections PE, la fermeture transitive,
l'exclusion d'une DLL étrangère et le refus d'une dépendance manquante. L'analyse
des imports ne remplace pas le gate réel d'exécution de l'artefact compilé.
