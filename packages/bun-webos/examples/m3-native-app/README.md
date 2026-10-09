# App native Material 3 avec Bun

Exemple de fenêtre native Bun et interface Material 3 web, sans WinUI ni XAML.

```sh
bun install
bun run build
bun run start
```

`main.ts` sert `dist/` sur une origine loopback, ouvre cette URL dans `Bun.WebView` avec le backend Chrome, puis sert une petite API de fichier. L’interface lit et écrit `note.txt` sous le dossier de données utilisateur de l’application au moyen de `Bun.file` et `Bun.write`. Sous Windows, le bouton système tente aussi de charger `bun:windows`; les plateformes qui ne fournissent pas ce module affichent son absence.

Installez `@aphrody/m3-front` et `@aphrody/material-web` depuis le workspace ou le registre aphrody M3 avant le build. `m3-front` fournit `<m3-theme>` et Material Web les éléments `md-*` enregistrés par les imports explicites de l’exemple. Le backend de fenêtre est Chrome, donc cet exemple peut aussi tourner sous Linux avec Chrome installé.

L’accent Windows, Mica/Acrylic et la barre de titre personnalisée demandent une intégration native de fenêtre; l’exemple ne prétend pas les émuler. Voir l’inventaire dans [`docs/aphrody/merge/M-winui-m3.md`](../../../../docs/aphrody/merge/M-winui-m3.md).
