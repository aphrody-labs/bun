// Copyright 2026 aphrody-code
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/// Applique les side-effects du mode `--migrate`, dans cet ordre :
///  1. package.json racine : pnpm-workspace.yaml + champ `pnpm` → `workspaces`
///     (+ `catalog`/`catalogs`), `overrides`, `patchedDependencies`,
///     `trustedDependencies` ; retrait de `pnpm` et `packageManager: pnpm@…`
///  2. bunfig.toml `[install]` : réglages pnpm équivalents (linker, hoist…)
///  3. `bun install` — tant que pnpm-lock.yaml / yarn.lock / package-lock.json
///     et pnpm-workspace.yaml existent : Bun migre alors le lockfile en
///     conservant les versions résolues
///  4. suppression de pnpm-workspace.yaml et des lockfiles concurrents
///  5. `@types/bun` en devDep si le code utilise `Bun.*`
///  6. (opt-in) `bunpp scaffold` des polyfills
///
/// Avec `dry_run`, rien n'est exécuté : le plan est seulement renvoyé.
/// Sinon `BackupGuard` restaure les fichiers si `bun install` échoue.
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use aphrody_n2b_core::{pnpm, types::FileFix};
use serde::Serialize;

use crate::subprocess::bun::{self, BackupGuard};

/// Wrapper rétrocompatible (sans options Phase 6) — conservé pour les
/// appelants externes qui ne consomment pas encore `MigrateOpts`.
#[allow(dead_code)]
pub(crate) fn run_migrate_side_effects(root: &Path, fixes: &[FileFix], quiet: bool) -> Result<()> {
    run_migrate_side_effects_with_opts(root, fixes, quiet, MigrateOpts::default()).map(|_| ())
}

#[derive(Debug, Clone, Default)]
pub(crate) struct MigrateOpts {
    /// Phase 6 §6.3 : appelle `bunpp scaffold <module>` pour les modules 🔴
    /// trouvés dans les findings. Crée des fichiers visibles — opt-in.
    pub scaffold_polyfills: bool,
    /// Planifie sans rien écrire ni exécuter.
    pub dry_run: bool,
}

/// Plan sérialisé dans le rapport JSON (`migration_plan`, schéma `MigrationPlan`).
#[derive(Debug, Clone, Default, Serialize)]
pub(crate) struct MigrationPlan {
    pub dry_run: bool,
    pub steps: Vec<MigrationStep>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct MigrationStep {
    pub action: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub detail: String,
}

enum Effect {
    Write(PathBuf, String),
    Delete(PathBuf),
    BunInstall,
    AddTypesBun,
    Scaffold(String),
}

fn read(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

fn pretty_json(value: &serde_json::Value) -> Result<String> {
    let mut out = serde_json::to_string_pretty(value)?;
    out.push('\n');
    Ok(out)
}

fn step(action: &'static str, path: Option<&str>, detail: String) -> MigrationStep {
    MigrationStep { action, path: path.map(String::from), detail }
}

type Planned = (Vec<(Effect, MigrationStep)>, Vec<String>);

fn plan(root: &Path, fixes: &[FileFix], opts: &MigrateOpts) -> Result<Planned> {
    let mut effects: Vec<(Effect, MigrationStep)> = Vec::new();
    let mut warnings = Vec::new();

    let pnpm_ws = root.join("pnpm-workspace.yaml");
    let root_pkg = root.join("package.json");
    // Le scan a déjà réécrit les scripts : en dry-run ce texte n'existe qu'en mémoire.
    let pkg_text = fixes
        .iter()
        .find(|f| f.file == "package.json")
        .map(|f| f.after.clone())
        .or_else(|| read(&root_pkg));
    let mut pkg: Option<serde_json::Value> = match &pkg_text {
        Some(text) => Some(serde_json::from_str(text).context("package.json racine invalide")?),
        None => None,
    };

    // 1–2. pnpm → package.json + bunfig.toml
    if let Some(current) = pkg.clone() {
        let mut cfg = pnpm::parse_package_field(&current).unwrap_or_default();
        if let Some(ws) = read(&pnpm_ws) {
            match pnpm::parse_workspace_yaml(&ws) {
                Some(yaml) => cfg.merge(yaml),
                None => warnings.push("pnpm-workspace.yaml illisible — non migré".into()),
            }
        }
        let lock = read(&root.join("pnpm-lock.yaml"));
        let migration = pnpm::plan_package_json(&current, &cfg, lock.as_deref());
        warnings.extend(migration.warnings);
        if migration.package_json != current {
            effects.push((
                Effect::Write(root_pkg.clone(), pretty_json(&migration.package_json)?),
                step("write", Some("package.json"), migration.changes.join("; ")),
            ));
            pkg = Some(migration.package_json);
        }
        if !migration.bunfig_install.is_empty() {
            let bunfig_path = root.join("bunfig.toml");
            let before = read(&bunfig_path).unwrap_or_default();
            let after = pnpm::merge_bunfig_install(&before, &migration.bunfig_install);
            if after != before {
                let keys: Vec<&str> =
                    migration.bunfig_install.iter().map(|(k, _)| k.as_str()).collect();
                effects.push((
                    Effect::Write(bunfig_path, after),
                    step("write", Some("bunfig.toml"), format!("[install] {}", keys.join(", "))),
                ));
            }
        }
    }

    // 3. bun install avant toute suppression : Bun migre les lockfiles présents.
    let rivals: Vec<(PathBuf, String)> = aphrody_n2b_core::scanners::lockfile::RIVAL_LOCKFILES
        .iter()
        .map(|name| (root.join(name), (*name).to_string()))
        .filter(|(p, _)| p.exists())
        .collect();
    let detail = if rivals.is_empty() {
        "bun install".to_string()
    } else {
        let names: Vec<&str> = rivals.iter().map(|(_, n)| n.as_str()).collect();
        format!("bun install (migre {} → bun.lock)", names.join(", "))
    };
    effects.push((Effect::BunInstall, step("run", None, detail)));

    // 4. Suppressions
    if pnpm_ws.exists() {
        effects.push((
            Effect::Delete(pnpm_ws),
            step("delete", Some("pnpm-workspace.yaml"), "repris dans package.json".into()),
        ));
    }
    for (rival, name) in rivals {
        effects.push((
            Effect::Delete(rival),
            step("delete", Some(name.as_str()), "lockfile concurrent, remplacé par bun.lock".into()),
        ));
    }

    // 5. @types/bun si usage Bun.* détecté et absent des deps
    let uses_bun_api = fixes
        .iter()
        .any(|f| f.file.ends_with(".ts") || f.file.ends_with(".tsx") || f.file.ends_with(".mts"))
        && fixes.iter().any(|f| {
            f.after.contains("Bun.") || f.findings.iter().any(|x| x.rule_id.starts_with("api/"))
        });
    let has_types = pkg.as_ref().is_some_and(|p| {
        ["devDependencies", "dependencies"]
            .iter()
            .any(|k| p.get(k).and_then(|d| d.get("@types/bun")).is_some())
    });
    if uses_bun_api && pkg.is_some() && !has_types {
        effects.push((Effect::AddTypesBun, step("run", None, "bun add -d @types/bun".into())));
    }

    // 6. Phase 6 §6.3 : scaffold polyfills bunpp pour les modules 🔴 (opt-in).
    if opts.scaffold_polyfills {
        use aphrody_n2b_core::types::CompatStatus;
        let mut scaffolded: std::collections::HashSet<String> = std::collections::HashSet::new();
        for f in fixes.iter().flat_map(|fix| &fix.findings) {
            if let Some(c) = &f.compat
                && c.status == CompatStatus::Missing
                && let Some(bunpp) = &c.bunpp
            {
                let module = bunpp.trim_start_matches("@bun++/node-").to_string();
                if scaffolded.insert(module.clone()) {
                    let detail = format!("bunpp scaffold node-{module}");
                    effects.push((Effect::Scaffold(module), step("run", None, detail)));
                }
            }
        }
    }

    Ok((effects, warnings))
}

pub(crate) fn run_migrate_side_effects_with_opts(
    root: &Path,
    fixes: &[FileFix],
    quiet: bool,
    opts: MigrateOpts,
) -> Result<MigrationPlan> {
    let log = |msg: &str| {
        if !quiet {
            eprintln!("[migrate] {msg}");
        }
    };

    let (effects, warnings) = plan(root, fixes, &opts)?;
    let report = MigrationPlan {
        dry_run: opts.dry_run,
        steps: effects.iter().map(|(_, s)| s.clone()).collect(),
        warnings,
    };
    for warning in &report.warnings {
        log(&format!("  ! {warning}"));
    }
    if opts.dry_run {
        log("dry-run : aucun effet de bord exécuté");
        for s in &report.steps {
            let path = s.path.as_deref().map(|p| format!(" {p}")).unwrap_or_default();
            log(&format!("  [{}]{path} — {}", s.action, s.detail));
        }
        return Ok(report);
    }

    let mut guard = BackupGuard::new();
    for (effect, _) in &effects {
        if let Effect::Write(path, _) | Effect::Delete(path) = effect {
            guard.backup(path)?;
        }
    }

    for (effect, s) in effects {
        match effect {
            Effect::Write(path, content) => {
                std::fs::write(&path, content)
                    .with_context(|| format!("écriture de {}", path.display()))?;
                log(&format!("  + {} : {}", s.path.unwrap_or_default(), s.detail));
            },
            Effect::BunInstall => {
                log(&format!("  → {}", s.detail));
                if let Err(e) = bun::install(root) {
                    guard.restore_all();
                    return Err(e)
                        .context("bun install a échoué ; fichiers restaurés depuis .n2b-bak");
                }
                log("  ✓ bun install OK");
            },
            Effect::Delete(path) => {
                std::fs::remove_file(&path)
                    .with_context(|| format!("suppression de {}", path.display()))?;
                log(&format!("  - {} supprimé", s.path.unwrap_or_default()));
            },
            Effect::AddTypesBun => {
                log("  → bun add -d @types/bun");
                match bun::add_dev(root, "@types/bun") {
                    Ok(()) => log("  ✓ @types/bun ajouté"),
                    Err(e) => log(&format!("  ✗ bun add -d @types/bun: {e}")),
                }
            },
            Effect::Scaffold(module) => {
                log(&format!("  → bunpp scaffold node-{module}"));
                match bun::bunpp_scaffold(root, &module) {
                    Ok(()) => log(&format!("  ✓ polyfill node-{module} scaffolded")),
                    Err(e) => log(&format!("  ✗ bunpp scaffold node-{module}: {e}")),
                }
            },
        }
    }

    guard.commit()?;
    Ok(report)
}
