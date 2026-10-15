# yt-dlp dans Bun et Buv

Le catalogue, le parseur CLI et les extracteurs upstream s'exécutent dans le processus Bun via `bun:python` et `Python.async()`. Les sources complètes restent dans `yt-dlp` ; aucun exécutable Python, pip ou Node externe n'est lancé par ce bridge.

`ytDlpRuntimeInfo()` vérifie réellement le host Python et l'import du package sélectionné. La résolution de CPython appartient à `bun:python` : `BUV_PYTHON_LIBPYTHON`, `BUN_PYTHON_LIBPYTHON`, `APHRODY_LIBPYTHON`, `BUV_RUNTIME`, puis l'artefact Buv actif. Le host utilise `BUV_PYTHON_HOST_LIBRARY` ou `BUN_PYTHON_HOST_LIBRARY`, ou sa bibliothèque embarquée. Buv possède l'installation et le manifeste `share/buv/manifest.json` ; ce module ne réinstalle rien.

Le binaire compilé peut sélectionner le package avec `BUN_VIDEO_PACKAGE_ROOT`, ou fournir `vendorRoot` au bridge. Un package déjà importé depuis une autre racine est refusé plutôt que remplacé silencieusement.

```ts
import {
  ytDlpRuntimeInfo,
  listYtDlpExtractors,
  parseYtDlpOptions,
  runYtDlpCli,
  extractYtDlp,
} from "@aphrody/bun-video";

const runtime = await ytDlpRuntimeInfo();
const providers = await listYtDlpExtractors();
const parsed = await parseYtDlpOptions([
  "--skip-download",
  "https://www.crunchyroll.com/watch/ID",
]);
const result = await extractYtDlp("https://www.crunchyroll.com/watch/ID", {
  skipDownload: true,
});
const version = await runYtDlpCli(["--version"]);
```

Toutes les options upstream sont transmises. `normalizeYtDlpOptions()` convertit les alias camelCase documentés ; les clés natives snake_case ont priorité. `output` devient `outtmpl`, `noWarnings` devient `no_warnings`. Les appels extract/download/formats/playlist historiques restent disponibles.

Le runtime JavaScript des challenges yt-dlp est fixé à Bun : aucun fallback Node ou Deno implicite. Sa résolution utilise `BUN_VIDEO_BUN_EXECUTABLE`, puis le Bun installé, puis l'exécutable courant. La CLI force également `--no-js-runtimes --js-runtimes bun:<exécutable>` après les arguments pour conserver ce contrat. FFmpeg et les autres outils média explicitement configurés restent distincts du host CPython.

Le parseur et la CLI ajoutent `--ignore-config` pour éviter une configuration ambiante implicite. Les références explicites à des configurations et fichiers privés restent sous le contrôle de l'appelant. Aucun profil Chrome, cookie ou secret n'est lu implicitement, exporté ou copié. Les options, URLs signées, résultats et stdout/stderr CLI peuvent contenir des données privées : conserver ces valeurs exclusivement dans les stores privés, jamais dans un catalogue public ou des logs affichés.

Un extracteur présent et `working: true` ne prouvent ni lecture, ni authentification, ni téléchargement sur un site. Le bridge ne contourne pas DRM. Un appel CPython en cours n'est pas interrompu par un signal JavaScript ; le pipeline doit l'isoler dans son processus worker et appliquer son délai au processus.

Le bridge conserve le propriétaire CPython sur son thread d'initialisation jusqu'à la sortie du processus ; les opérations `Python.async()` s'attachent à cet interpréteur puis ferment leur session. Cela évite une finalisation/réinitialisation entre la qualification, le catalogue et une extraction.

Le catalogue natif de la version vendored `2026.08.19` contient 1751 extracteurs et aucun extracteur Crunchyroll dédié. Le client `src/crunchyroll.ts` reste le propriétaire de cette intégration ; le MPD DRM capturé et ses fragments ne deviennent pas des téléchargements yt-dlp qualifiés.
