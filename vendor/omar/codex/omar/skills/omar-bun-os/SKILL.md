---
name: omar-bun-os
description: "Utiliser ou intégrer le fork Bun d'Aphrody pour le runtime Windows, les API système, les dépendances Winget, Python/uv, WebAssembly et WebOS."
---

## Source et runtime

Le checkout de référence de cette machine est `C:/bun`, fork `aphrody-labs/bun`. Omar demande Bun maison 1.4.4 exclusivement pour JavaScript/TypeScript. Vérifier `bun --version`, le chemin du binaire et les fonctionnalités dans ce checkout : le code présent ne prouve pas qu'elles sont dans chaque binaire déjà installé ou publié. Lire `C:/bun/AGENTS.md` avant de modifier le fork. La couche système appartient au fork Bun ; Aphrody conserve les produits et workflows qui le consomment.

## Choisir le propriétaire natif

- Commencer par les API déjà fournies par Bun et la compatibilité Node intégrée. Garder Bun comme runtime des projets JS/TS ; ne recourir à un runtime Node séparé que si une dépendance requiert réellement une capacité absente du Bun installé.
- Sur Windows, consulter `bun:windows` et les paquets `@aphrody/bun-windows-*` disponibles dans le checkout pour Win32, WinRT, GPU, registre, processus, services ou autres familles System32. Les paquets générés ou une documentation d'API ne prouvent pas à eux seuls que chaque symbole est implémenté et qualifié : contrôler les exports, le chargement et la capacité ciblée.
- Pour l'installation des dépendances système, lire `C:/bun/docs/pm/winget.mdx`, puis inspecter `systemDependencies`, le lockfile et le comportement de la version Bun utilisée. Le backend Winget natif résout les paquets et vérifie le hash des manifestes avant l'installation, sans appeler `winget.exe`. Les installateurs peuvent demander une élévation ; vérifier la portée et l'effet du paquet avant de lancer `bun install`.
- Pour Python, lire `C:/bun/packages/buv/README.md` et `TRANSFER-RECEIPT.md`. Buv/PyJS, uv, Ruff, CPython et les extensions Python ont des frontières et des prérequis propres ; ne pas annoncer que uv/Ruff ou un ABI Python sont intégrés au binaire Bun sans qualification correspondante.
- Pour WASM, repérer d'abord les crates et paquets compatibles ainsi que `scripts/webos/wasm-inventory.ts` dans le dépôt Aphrody concerné. `bun:wasm` et les cibles WebAssembly exécutent les composants compilables pour leur cible ; ils ne convertissent pas automatiquement les services Windows, pilotes, GPU natifs ou tout un monorepo en modules WASM.
- `@aphrody/bun-webos` (`C:/bun/packages/bun-webos`) est l'application WebOS servie par Bun. Ses modules optionnels déclarés dans `src/server/modules.ts` dépendent du runtime qui l'héberge. Vérifier leur chargement réel avant d'attribuer au WebOS le contrôle d'une capacité système.

Pour les limites et la répartition actuelle, consulter `C:/bun/docs/aphrody/LAYERS.md`, puis la documentation et l'inventaire du sous-système demandé. Distinguer les fonctionnalités implémentées, expérimentales, planifiées et simplement documentées. Garder un shell de récupération et ne remplacer le shell Windows ou le démarrage qu'à la demande explicite d'Omar, après avoir vérifié le chemin de retour.
