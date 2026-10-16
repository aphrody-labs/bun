# Intégration CEF dans Bun

`bun-os/packages/bun-tauri` fournit le runtime Tauri CEF avec `cef` et `cef-dll-sys` pinés
à `152.3.0`, correspondant à Chromium `152.0.7977.83`.

Le contrat canonique est exposé par `bun cef` :

- `bun cef plan` affiche les chemins et les pins sans modifier le système ;
- `bun cef doctor` valide `vendor/chromium/src` et la distribution CEF ;
- `bun cef env` produit les variables `CEF_PATH` et `BUN_*` pour un processus enfant.

La distribution CEF n'est pas une copie du dépôt Chromium. Elle doit être fournie
par `CEF_PATH` ou par le cache partagé `build/cef-cache/<version>/<target>` et
contenir le marqueur natif de la plateforme (`libcef.dll` sous Windows).

Le runtime Bun reste JavaScriptCore. CEF embarque Chromium/V8 dans le runtime
Tauri ; cette intégration ne fusionne pas V8 dans JavaScriptCore et ne transforme
pas les sources Chromium en bibliothèque CEF utilisable sans build CEF dédié.
