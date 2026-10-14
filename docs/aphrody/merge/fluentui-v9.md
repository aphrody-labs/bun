# Fluent UI React v9 dans Bun

Le fork canonique est `aphrody-labs/fluentui`, synchronisé depuis `microsoft/fluentui` et épinglé comme submodule
`vendor/fluentui`. Le site produit officiel `react.fluentui.dev` est le Storybook de Fluent UI React v9.

Le SDK publié reste `packages/bun-fluent`. Il absorbe uniquement les sources MIT de `packages/tokens`, nécessaires
aux thèmes Bun, CSS, Tailwind et WinUI. Les projets v8 `packages/react` et Northstar ne sont ni copiés ni exposés.
Les applications React utilisent directement `@fluentui/react-components`; Bun ne maintient pas de paquet de
renommage.

`bun scripts/aphrody/fluentui-sync.ts --json` vérifie le commit du fork, les versions v9, le catalogue de composants
et la parité sémantique des sources de tokens. `--sync` applique une mise à jour, suivie de
`bun bd fmt packages/bun-fluent/src/tokens` et des gates du package.

État épinglé : Fluent UI React v9 `9.74.9`, `@fluentui/react-theme` `9.2.2`, `@fluentui/tokens`
`1.0.0-alpha.24`, commit `5ebdd1d52ca82f92af15f63bd016a9dfa07fbaff`.
