# Sources consultées le 14 octobre 2026

## Réécriture Rust

Source : [Rewriting Bun in Rust](https://bun.com/blog/bun-in-rust), 8 juillet 2026.

L'article décrit la migration du runtime Zig vers Rust avec conservation de
l'architecture et des tests. Ownership, Drop et revue indépendante servent à
réduire les erreurs de durée de vie. Les frontières natives/JSC restent à vérifier.
Des stubs compilables ne remplacent pas une implémentation. Les tests stress
nécessitent des limites de ressources. Ses dizaines d'agents et worktrees sont
un récit historique, pas une prescription pour ce dépôt partagé.

## Bun 1.4.3 : candidats à vérifier dans Bun OS

Source : [Bun v1.4.3](https://bun.com/blog/bun-v1.4.3), 10 octobre 2026.

- Types : `bun check`, `run/test/build --check`, `Bun.build({ check: true })`.
- Réseau : `Bun.FetchSession`, pools séparés, TLS/proxy/keep-alive ; fermeture explicite.
- `Bun.ModuleGraph` expérimental : états séparés, code partagé ; aucune sandbox de sécurité.
- Compression : `CompressionStream` accepte `level`.
- HTTP : `Bun.serve` gère `If-Range` pour fichiers.
- Bundler : `[hash9]` à `[hash13]`, métadonnées `entryPoint` des imports séparés.
- Exécutables : `--compile --bytecode`, `--bytecode-order`, profil via
  `BUN_BYTECODE_ORDER_OUT`, `bytecodeOrderStats()` de `bun:jsc`.
- JIT : `--compile-jit-policy`, `Bun.unsafe.setJITPolicy`, à mesurer.
- Politique de code : `--disallow-code-generation-from-strings=strict` ; vérifier
  sa compatibilité avec les plugins qui produisent du code.

Ces annonces ne prouvent aucune disponibilité locale. Lire la source officielle
pour options détaillées, corrections, limites et autres améliorations ; vérifier
chaque usage avec le binaire et les types cibles. Ne pas copier les chiffres de
performance upstream comme mesures de la distribution Aphrody.
