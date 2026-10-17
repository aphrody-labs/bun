# Optimisations binaire et runtime : état et priorités (2026-10-18)

Base examinée : `Cargo.toml` (profils), `scripts/build/{config,flags}.ts`, `scripts/build/deps/mimalloc.ts`,
`scripts/build/ci-images/spec.ts` (LLVM 23.1.1), `rust-toolchain.toml` (nightly-2026-09-15), `src/codegen/bundle-modules.ts`.

## État actuel du dépôt

- ThinLTO cross-langage (bun C++ + JSC prébuilt `-lto` + crates Rust en bitcode) activé par défaut en release
  (`config.ts` `ltoDefault = release && !assertions && !asan`), désactivé pour ASAN, Fuzzilli, Android, FreeBSD et Windows arm64.
  Garde stricte : même majeure LLVM pour clang et rustc.
- `[profile.release]` : `lto = "off"` côté cargo (le LTO est fait par lld via le bitcode), `codegen-units = 1`,
  `panic = "abort"`, `debug = "line-tables-only"`, `strip = "none"` (strip fait au lien, `bun-profile` gardé).
- Linker : lld partout ; `--gc-sections`, `--icf=safe` (+ `-faddrsig`), Windows `/OPT:REF` + `/OPT:SAFEICF`
  (ICF agressif cassait `expect.any()`).
- PGO IR : `--pgo-generate/--pgo-use`, uniquement `c.unix` ; `-z keep-text-section-prefix` sous `pgoUse` ;
  ordre de fonctions `linker.order` sans profil. Le script `scripts/build-pgo.ts` cité en commentaire n'existe pas.
  Upstream oven-sh/bun livre un binaire Linux PGO+BOLT (commentaire `flags.ts`) ; le pipeline n'est pas dans ce fork.
- CPU : `baseline` par défaut sur x64 (`-march=nehalem`, sans AVX) ; arm64 `armv8-a+crc`.
- Overrides par paquet : `bun_react_compiler` en `s`, crates de conformance en `z` ; profil `shim` avec
  `-Zbuild-std` + `panic_immediate_abort` (~13 KiB).
- mimalloc (fork oven-sh, statique, `MI_SKIP_COLLECT_ON_EXIT`) : malloc global sur Linux, `mi_*` direct sur Windows.
- JS : `bun build --compile --bytecode` embarque le bytecode JSC des builtins importés ; les modules internes du binaire
  restent embarqués en source, compilés paresseusement par JSC au premier chargement.
- Debug info : `-gz=zstd`.

## Tableau priorisé

| # | Technique | Gain attendu | Coût / risque | État dans le dépôt | Recommandation |
|---|---|---|---|---|---|
| 1 | PGO IR Rust+C++ (profils `.profraw` clang et rustc fusionnés par un seul `llvm-profdata merge`, même LLVM 23) | 5-15 % CPU sur parse/bundle/install, démarrage -5-10 % | Pipeline 2 étapes, workload représentatif, profil à régénérer à chaque bump WebKit/LLVM | Flags présents, Unix seulement, pas de driver | Écrire le driver manquant (`scripts/build-pgo.ts`), étendre à Windows (`-fprofile-instr-generate` clang-cl + `-Cprofile-generate`, lld-link) |
| 2 | BOLT post-lien Linux (`-Wl,--emit-relocs`, `perf record -e cycles:u -j any,u`, `llvm-bolt -reorder-blocks=ext-tsp -reorder-functions=cdsort -split-functions -icf=1`) | +2-8 % au-dessus de PGO, RSS `.text` -1 Mo au démarrage | Linux x64/arm64 seulement ; perf LBR requis ; casse les build-id si mal enchaîné | Absent (outillage BOLT dans l'image LLVM) | Ajouter après PGO, sur le `bun` final, garder `bun-profile` cohérent |
| 3 | Builds x64 non-baseline (`-march=haswell`/`x86-64-v3`, `-Ctarget-cpu=x86-64-v3`) en plus du baseline | 3-10 % sur chemins SIMD (strings, JSON, zlib, simdutf) | 2 artefacts ; détection CPU à l'install | Baseline par défaut (nehalem) | Publier une variante v3 par défaut et garder baseline ; multiversioning (`target_clones`, `is_x86_feature_detected!`) pour les points chauds du baseline |
| 4 | Ordonnancement de fonctions / Propeller (`-fbasic-block-address-map`, `create_llvm_prof --format=propeller`) | Démarrage -3-5 %, moins de page faults | Propeller exige perf LBR et clang récent ; double lien | `linker.order` déjà là (Linux) | Garder `linker.order` ; Propeller seulement si BOLT bloque |
| 5 | Taille : `opt-level="s"` par paquet sur crates froides (CLI rares, n2b, lint/format, sema hors chemin chaud, winmd) | -5-15 % `.text` Rust | Ralentit ces commandes de 10-30 % | Déjà fait pour 4 crates | Étendre via mesure `cargo bloat`/`bloaty` + map lld ; jamais sur parser/printer/bundler/install |
| 6 | Données embarquées compressées zstd (sources builtins, tables ICU, assets) décompressées à la demande | -2-10 Mo de fichier | +coût CPU au premier accès | Partiel | Compresser les blobs froids seulement ; pas les modules chargés au démarrage |
| 7 | Snapshot bytecode des modules internes au build (équivalent snapshot V8/Deno) via `JSC::CachedBytecode` | Démarrage `node:*` -10-30 % par module, moins de parse | Bytecode lié à la version JSC exacte ; taille +; invalidation à chaque bump WebKit | Disponible pour `--compile --bytecode`, pas pour le binaire lui-même | Générer le cache des modules internes les plus chargés au build (même machinerie que `--bytecode`), lazy-mappé |
| 8 | Options JSC (`useConcurrentJIT`, seuils Baseline/DFG/FTL, `useOMGJIT` Wasm, `useBBQJIT`) | Démarrage court vs débit long : arbitrage | Régressions benchmarks, divergence WebKit | Défauts upstream | Ne pas changer globalement ; exposer via `BUN_JSC_*` existant |
| 9 | Fat LTO Rust (`lto="fat"`) au lieu de ThinLTO global | <2 % perf, -1-3 % taille | Lien x3-5 plus long, mémoire | ThinLTO cross-langage | Ne pas faire ; ThinLTO cross-langage est le bon compromis |
| 10 | `-Zshare-generics=y`, polymorphisation | -1-3 % taille | `-Zpolymorphize` supprimé de rustc (2024) ; share-generics surtout utile en dev | Non | Ignorer en release ; dédupliquer à la main les génériques lourds (dyn/trampolines non génériques) |
| 11 | `-Zbuild-std` + `panic_immediate_abort` pour `bun` | -1-3 Mo (fmt de panic) | Nightly, panics sans message : diagnostics perdus | Shim seulement | Non pour `bun` (crash reporter a besoin des messages) |
| 12 | Debug info séparée (`split-debuginfo=packed`, `.dwp`/`.pdb` séparés, `strip`) | Fichier livré déjà strippé | Aucun | Fait | Rien |
| 13 | UPX | -60 % fichier | Démarrage +50-200 ms, pas de partage de pages, faux positifs antivirus, casse `--compile` (données en fin d'exe) | Non | Ne pas utiliser |
| 14 | mimalloc v3 / options (`MI_SECURE=0`, `arena_eager_commit`, `purge_delay`) | 0-5 % alloc-intensif, RSS | Bump du fork oven-sh/mimalloc | v2 fork, réglé | Évaluer mimalloc 3.x sur benchmarks install/bundle |
| 15 | Linker mold / wild | Lien Linux 2-5x plus rapide (dev) | Pas de ThinLTO aussi mature, pas d'ICF safe équivalent sous wild | lld (release imposé) | mold/wild pour debug sans LTO uniquement (déjà permis via `BUN_TOOLCHAIN_LD`) |

## Top 5

1. PGO cross-langage Rust+C++ avec un `llvm-profdata` unique (LLVM 23), driver à écrire, Linux puis Windows.
2. BOLT sur le binaire Linux release après PGO.
3. Variante x64 `x86-64-v3` publiée à côté du baseline nehalem.
4. Cache bytecode JSC des modules internes généré au build.
5. `opt-level="s"` étendu aux crates froides, guidé par `cargo bloat` et la map lld.

## Sources

- https://doc.rust-lang.org/rustc/linker-plugin-lto.html
- https://doc.rust-lang.org/rustc/profile-guided-optimization.html
- https://rustc-dev-guide.rust-lang.org/building/optimized-build.html
- https://github.com/llvm/llvm-project/blob/main/bolt/docs/OptimizingClang.md
- https://github.com/google/autofdo (Propeller)
- https://bun.com/docs/bundler/executables (bytecode)
- https://github.com/microsoft/mimalloc
