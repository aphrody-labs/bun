# Fenêtre WinUI 3 native avec Bun

Une fenêtre WinUI 3 pilotée par `bun:winui` : XAML chargé par `XamlReader.Load`, une liste de notes, un `ComboBox` de thème et les pinceaux de thème WinUI réglés sur la palette Fluent 2 de `@aphrody/bun-fluent`. Les événements (`Click`, `SelectionChanged`) s’exécutent sur le thread JS ; la boucle d’événements de Bun reste libre.

```sh
winget install Microsoft.WindowsAppRuntime.1.8
bun install
bun main.ts            # fenêtre interactive
bun main.ts --smoke    # ajoute une note, affiche "1 4" et se ferme
```

Windows uniquement. Voir [`docs/runtime/winui.mdx`](../../../../docs/runtime/winui.mdx).
