# M-syspkg : sources de paquets système dans `bun install`

Objectif : `bun install` résout, verrouille et installe des paquets winget, apk, deb/apt et pacman
sans winget.exe, apk, apt ni pacman. Le code est dans `src/install/system/`.

## Déclaration

Le champ dédié `systemDependencies` de package.json prend des clés `<source>:<id>` et des plages en valeur :

```json
{ "systemDependencies": { "winget:Microsoft.PowerToys": "^0.100", "apk:curl": "*" } }
```

Spécificateurs reconnus : `winget:`, `apk:`, `deb:` et `apt:` (alias de deb), `pacman:`. `bun add winget:Id[@plage]` écrit
dans ce champ, et `bun remove winget:Id` l'en retire. Les dépendances npm, le hoisting et le linker ne sont pas modifiés.

## Interface (`system/mod.rs`)

| Élément | Rôle |
| --- | --- |
| `SourceKind` | `Winget, Apk, Deb, Pacman` : `name()`, `from_name()` |
| `Spec`, `parse_spec`, `parse_entry`, `is_system_spec` | parsing de `source:id[@plage]` et des entrées du champ |
| `trait Source` | `kind`, `host_can_install`, `search`, `info`, `resolve -> LockEntry`, `install -> InstalledRecord`, `remove`, `compare_versions` |
| `source_for(kind)` | registre des backends (une ligne par source) |
| `Ctx` | env, cache `<cache d'install>/system/<source>`, `fetch`, `fetch_cached(max_age)`, `fetch_verified(sha256)` |
| `Options::from_env` | `BUN_SYSTEM_ROOT`, `BUN_SYSTEM_ELEVATE`, `BUN_SYSTEM_ARCH`, `BUN_SYSTEM_SCOPE`, `BUN_SYSTEM_LOCALE`, `BUN_SYSTEM_REFRESH` |
| `InstallRoot` | `<projet>/node_modules/.system` (bin : `node_modules/.bin`), ou `--root <dir>` (bin : `<dir>/bin`), comme `apk --root` |
| `resolve_lock`, `install_lock` | résolution incrémentale (une entrée reste tant que son spécificateur ne change pas), puis synchronisation install/remove guidée par la base |
| `value.rs` | arbre JSON/YAML commun (les nombres gardent leur texte brut, donc `1.10` reste `1.10`) |
| `version.rs` | comparaison souple et plages (`*`, exact, `^`, `~`, `>=`, `x`, `||`) ; une source peut redéfinir `compare_versions` |
| `net.rs` | GET bloquant via `bun_http` (proxy et TLS repris de l'env) |

## Lock

bun.lock reçoit un bloc racine `"system"`, écrit avant `"packages"` :

```jsonc
"system": {
  "winget:Microsoft.PowerToys": { "version": "0.100.1", "specifier": "^0.100", "url": "<manifeste>", "hash": "sha256:…", "deps": ["winget:Microsoft.VCRedist.2015+.x64"], "meta": { … } },
},
```

`LockEntry { source, id, specifier, version, url, hash, deps, meta }` (`system/lock.rs`). Dans bun.lockb, le même
document JSON est stocké dans une section finale étiquetée. `--frozen-lockfile` échoue si le bloc doit changer.

## Base des paquets installés

`<root>/.bun-system/installed.json` (`system/db.rs`). Chaque `InstalledRecord` liste les fichiers écrits, les shims
et l'argv de désinstallation d'un installeur natif. Le remove et l'upgrade passent par cette base, sans gestionnaire natif.

## Brancher une source (agent SP)

1. Créer `src/install/system/{apk,deb,pacman}.rs` (ou un dossier), qui implémente `Source`.
2. Ajouter le `mod` et le bras correspondant dans `source_for`.
3. Lire l'index via `ctx.fetch_cached`, vérifier les archives avec `ctx.fetch_verified`, extraire sous
   `root.package_dir(kind, id)` et remplir `InstalledRecord.files` et `bins`.
4. Hors de l'hôte cible (`host_can_install == false`), la résolution et le lock fonctionnent, et l'install est sautée avec un avertissement.

## État

| Lot | État |
| --- | --- |
| Interface commune, lock, base, version, réseau | fait (compile, `cargo check -p bun_install`) |
| winget : index SQLite natif, versionData MSZIP, manifeste vérifié | ⏳ |
| winget : choix d'installeur, portable/zip et shims, msi/exe silencieux, refus si UAC | ⏳ |
| Intégration bun.lock/bun.lockb, `bun install`, `bun add`/`remove` | ⏳ |
| CLI `bun pm <source> search\|info\|ls` | ⏳ |
| apk / deb / pacman (SP) | ⏳ |
