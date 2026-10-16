# GPU, Skia et réutilisation native

État documentaire consulté le **2026-10-11**. Les liens `main` et `HEAD` évoluent.
Une révision épinglée rend les sources reproductibles ; elle ne prouve ni
l'activation d'un backend dans un binaire ni ses performances sur un GPU.

## Couches graphiques

| Couche | Fonction et frontière |
| --- | --- |
| SkCanvas | Contexte de dessin Skia ; ses commandes ciblent une surface. |
| Ganesh | Backend GPU historique de Skia, configurable indépendamment de Graphite. |
| Graphite | Backend GPU distinct ; les options de compilation déterminent les transports disponibles. |
| Dawn | Implémentation WebGPU utilisée par Chromium, avec backends natifs D3D12, Metal, Vulkan et OpenGL. |
| Tint | Compilateur WGSL de Dawn. |
| CanvasKit | Skia compilé en WebAssembly et exposé à JavaScript pour dessiner dans une page. |

[SkCanvas](https://skia.org/docs/user/api/skcanvas_overview/) décrit le contexte de
dessin. [Dawn](https://dawn.googlesource.com/dawn/+/HEAD/README.md) décrit les
backends natifs, le protocole client/serveur pour le sandbox et Tint.

Dans [les arguments GN de Skia](https://skia.googlesource.com/skia/+/main/gn/skia.gni),
`skia_enable_ganesh` et `skia_enable_graphite` sont distincts. Dawn exige Graphite.
Le backend Direct3D direct et OpenGL exigent Ganesh dans ce fichier.
Ainsi, Graphite peut atteindre D3D12 via Dawn sans être le backend Direct3D
direct de Ganesh. Vulkan est une autre option de compilation ; la présence
d'une option ne signifie pas qu'une distribution Chromium l'active.

## WebAssembly et WebGPU

[CanvasKit](https://docs.skia.org/docs/user/modules/canvaskit/) expose notamment
canvas, peinture, chemins et texte. Son [quickstart](https://skia.org/docs/user/modules/quickstart/)
décrit un contexte WebGL2 et des commandes produites par du C++ compilé en Wasm.
Wasm exécute le code ; WebGL ou WebGPU fournit l'accès graphique.

Le [script de compilation CanvasKit](https://skia.googlesource.com/skia/+/main/modules/canvaskit/compile.sh)
sélectionne Graphite et désactive Ganesh avec l'option `webgpu`, puis active
Dawn et WebGPU dans les arguments GN. Sans cette option, sa route GPU utilise
WebGL. Documenter une variante demande de conserver ses arguments,
sa version Emscripten et ses artefacts. Charger CanvasKit n'ajoute pas le DOM,
Blink ou la compatibilité complète d'un navigateur à Bun.

## Surfaces déjà présentes

Ces éléments sont vérifiés dans les sources locales, sans nouvelle compilation :

| Propriétaire | Source et portée observée |
| --- | --- |
| Bun Windows | `src/js/bun/windows.ts` expose `gpu.d3d12.info`, `clearRenderTarget` et `copyBuffer`, reliés aux fonctions Rust de `windows/host.rs`. |
| Bun Cosmic | `src/js/bun/cosmic.ts` relie le layout de texte à Rust ; `src/cosmic/Cargo.toml` déclare `cosmic-text`. |
| Navigateur Bun | `src/browser/crates/render/Cargo.toml` active `tiny-skia` 0.12 avec `paint`; `bun_browser_js` propage `render` vers ce renderer. |
| Aphrody UI | `C:/aphrody/crates/ui/render/Cargo.toml` active `wgpu` via la feature optionnelle `gpu`, avec notamment DX12, Vulkan et Metal. |
| CEF Bun | `bun-os/packages/bun-tauri/crates/aphrody-tauri-runtime-cef` possède le navigateur Chromium embarqué et son transport DevTools. |

`tiny-skia` est un rasteriseur Rust distinct de la bibliothèque Skia C++.
`wgpu` et Dawn sont des implémentations distinctes de WebGPU ; les traiter comme
un même backend masquerait leurs versions, adaptateurs et compilateurs de shaders.
Les surfaces D3D12 présentes ne constituent pas une API Skia ou WebGPU complète.

## Qualification à produire

Réutiliser d'abord CEF pour le rendu Chromium, Obscura pour son rendu headless
et les propriétaires Bun pour leurs primitives natives. Toute comparaison doit
consigner le commit, les features, l'adaptateur, le pilote, les dimensions,
le format de pixels, le warmup et les distributions de temps CPU/GPU.
Conserver captures et résultats de validation pour séparer fidélité et vitesse.
Cette fiche ne contient aucun benchmark ni preuve d'intégration Skia dans JSC.
