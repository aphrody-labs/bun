# FilmCraft / PhotoCraft : qualification n2b

Qualification du 18 octobre 2026, poste Windows natif, sans WSL ni build Rust.

## Runtime et commandes

Exécutable réellement utilisé : `C:\bun\build\release\bun.exe`, Bun `1.4.6`,
révision `169d8c5ea17b2b55a0582c475adc7123118b9623`, provenance déclarée
`https://github.com/aphrody-labs/bun/releases/download/bun-v1.4.6/bun-windows-x64-full.zip`.
Ce runtime exécute les outils ; il ne qualifie pas les changements Rust du checkout.

Le CLI natif `bun n2b --help` précise que `--fix` et `--aggressive` sont
mutuellement exclusifs. Depuis la racine de **chaque** sous-module initialisé :

```powershell
bun n2b --aggressive --dry-run --report=json --agent
bun n2b --aggressive --report=json --agent
```

Les quatre invocations ont été lancées avec stdout/stderr séparés, code de
sortie conservé, deadline de 20 secondes, sans redirection shell ambiguë.
Les racines ont été résolues depuis le workspace sélectionné.

| Sous-module | Fichiers scannés | Findings | Fichiers réécrits | stdout par invocation | stderr | Sortie |
| ----------- | ---------------: | -------: | ----------------: | --------------------: | -----: | -----: |
| FilmCraft   |               74 |       83 |                 0 |         78 290 octets |      0 |      0 |
| PhotoCraft  |               62 |       54 |                 0 |         48 277 octets |      0 |      0 |

Les findings sont des informations d'écosystème dans les manifests Cargo,
sans correctif automatique. Aucun manifest Cargo n'a été modifié par cette
qualification. Un rapport non vide et `changed: false` prouvent ici un scan
effectif sans transformation applicable, pas une migration supplémentaire.

Les preuves locales sont dans `build/{filmcraft,photocraft}-n2b-{preview,apply}`
avec suffixes `.stdout`, `.stderr` et `.status.json` ; ces fichiers de build
ne font pas partie de la distribution.

## Outils et périmètre navigateur

FilmCraft possède trois outils `.mjs` dans `apps/filmcraft-web/tests` et un
AudioWorklet dans `apps/filmcraft-web/web/audio-worklet.js`. Les outils utilisent
déjà `Bun.spawn`, `Bun.write`, `Bun.sleep` et `Bun.CryptoHasher` lorsque nécessaire.
Les imports `node:fs`, `node:path` et `node:os` restants fonctionnent dans Bun ;
le passage agressif natif ne propose aucun remplacement automatique.
PhotoCraft ne contient aucun fichier JS/TS autonome dans le checkout inspecté.
Les scripts éventuellement embarqués dans Rust/HTML ne sont pas couverts par
ce constat sur les fichiers JS/TS.

Le pilote local `build/craft-n2b-verify.mjs` passe **11 vérifications** et écrit
`build/craft-n2b-verification.json` :

- parsing Bun des trois outils ; import effectif des deux bibliothèques de
  régression navigateur ;
- exécution du code AudioWorklet original dans un hôte synthétique : nom
  d'enregistrement, reset, rejet d'une génération périmée, extraction stéréo,
  silence à l'épuisement, horloge limitée aux trames consommées et notification
  périodique.

Aucun outil ni AudioWorklet n'a été réécrit ou supprimé par ce passage.
Les tests synthétiques ne qualifient pas un AudioWorklet exécuté par Chromium.
Le smoke navigateur complet n'a pas été exécuté : l'artefact FilmCraft
`target/web/dist/index.html` est absent. Chrome et Edge sont présents sur le
poste ; cela ne constitue pas une preuve d'exécution de l'application web.
La compilation WASM, le rendu headless, les codecs et les applications natives
restent des gates distincts à exécuter sur les révisions finales des forks.
