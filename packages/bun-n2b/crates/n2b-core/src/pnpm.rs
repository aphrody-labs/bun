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

//! Migration pnpm → Bun : lecture de `pnpm-workspace.yaml` et du champ `pnpm`
//! du package.json racine, puis plan du package.json et du `bunfig.toml`
//! équivalents (`workspaces.catalog(s)`, `overrides`, `patchedDependencies`,
//! `trustedDependencies`, `[install]`). Fonctions pures : aucune écriture.

use serde_json::{Map, Value};

/// Réglages pnpm lus d'une source (yaml ou champ `pnpm`).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PnpmConfig {
    pub packages: Vec<String>,
    pub catalog: Map<String, Value>,
    pub catalogs: Map<String, Value>,
    pub overrides: Map<String, Value>,
    pub patched: Map<String, Value>,
    /// `onlyBuiltDependencies` + entrées `true` de `allowBuilds`.
    pub only_built: Vec<String>,
    /// Réglages bunfig `[install]` : (clé, valeur TOML rendue).
    pub install: Vec<(String, String)>,
    /// Réglages pnpm sans équivalent Bun.
    pub unsupported: Vec<String>,
}

fn str_list(value: &Value) -> Vec<String> {
    match value {
        Value::String(s) => vec![s.clone()],
        Value::Array(items) => items.iter().filter_map(|x| x.as_str().map(String::from)).collect(),
        _ => Vec::new(),
    }
}

fn push_unique(into: &mut Vec<String>, items: impl IntoIterator<Item = String>) {
    for item in items {
        if !into.contains(&item) {
            into.push(item);
        }
    }
}

fn toml_string(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| format!("\"{s}\""))
}

fn toml_array(items: &[String]) -> String {
    format!("[{}]", items.iter().map(|s| toml_string(s)).collect::<Vec<_>>().join(", "))
}

impl PnpmConfig {
    /// `workspace_file` : la source est `pnpm-workspace.yaml` (seule à porter `packages`).
    pub fn from_settings(map: &Map<String, Value>, workspace_file: bool) -> Self {
        let mut c = Self::default();
        for (key, value) in map {
            match key.as_str() {
                "packages" if workspace_file => c.packages = str_list(value),
                "catalog" => c.catalog = value.as_object().cloned().unwrap_or_default(),
                "catalogs" => c.catalogs = value.as_object().cloned().unwrap_or_default(),
                "overrides" => c.overrides = value.as_object().cloned().unwrap_or_default(),
                "patchedDependencies" => {
                    c.patched = value.as_object().cloned().unwrap_or_default();
                },
                "onlyBuiltDependencies" => push_unique(&mut c.only_built, str_list(value)),
                "allowBuilds" => {
                    if let Some(builds) = value.as_object() {
                        push_unique(
                            &mut c.only_built,
                            builds
                                .iter()
                                .filter(|(_, allowed)| allowed.as_bool() == Some(true))
                                .map(|(name, _)| name.clone()),
                        );
                    }
                },
                // Bun n'exécute déjà pas les scripts des dépendances non approuvées.
                "ignoredBuiltDependencies" | "neverBuiltDependencies" => {},
                "nodeLinker" => match value.as_str() {
                    Some(linker @ ("isolated" | "hoisted")) => {
                        c.install.push(("linker".into(), toml_string(linker)));
                    },
                    _ => c.unsupported.push(format!("nodeLinker={value}")),
                },
                "shamefullyHoist" if value.as_bool() == Some(true) => {
                    c.install.push(("linker".into(), toml_string("hoisted")));
                },
                "publicHoistPattern" | "hoistPattern" => {
                    c.install.push((key.clone(), toml_array(&str_list(value))));
                },
                "hoist" if value.is_boolean() => c.install.push((key.clone(), value.to_string())),
                // pnpm : minutes ; Bun : secondes.
                "minimumReleaseAge" if value.as_u64().is_some() => c.install.push((
                    "minimumReleaseAge".into(),
                    (value.as_u64().unwrap_or_default() * 60).to_string(),
                )),
                "minimumReleaseAgeExclude" => c
                    .install
                    .push(("minimumReleaseAgeExcludes".into(), toml_array(&str_list(value)))),
                _ => c.unsupported.push(key.clone()),
            }
        }
        c
    }

    /// Fusionne `other` (prioritaire, ex. `pnpm-workspace.yaml`) dans `self`.
    pub fn merge(&mut self, other: Self) {
        if !other.packages.is_empty() {
            self.packages = other.packages;
        }
        self.catalog.extend(other.catalog);
        self.catalogs.extend(other.catalogs);
        self.overrides.extend(other.overrides);
        self.patched.extend(other.patched);
        push_unique(&mut self.only_built, other.only_built);
        for (key, value) in other.install {
            self.install.retain(|(k, _)| *k != key);
            self.install.push((key, value));
        }
        push_unique(&mut self.unsupported, other.unsupported);
    }

    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}

/// Lit `pnpm-workspace.yaml`. `None` si le YAML est invalide.
pub fn parse_workspace_yaml(content: &str) -> Option<PnpmConfig> {
    let yaml: serde_yaml::Value = serde_yaml::from_str(content).ok()?;
    match serde_json::to_value(&yaml).ok()? {
        Value::Object(map) => Some(PnpmConfig::from_settings(&map, true)),
        Value::Null => Some(PnpmConfig::default()),
        _ => None,
    }
}

/// Lit le champ `pnpm` d'un package.json.
pub fn parse_package_field(pkg: &Value) -> Option<PnpmConfig> {
    pkg.get("pnpm").and_then(Value::as_object).map(|map| PnpmConfig::from_settings(map, false))
}

/// Overrides pnpm que Bun ignore : plus d'un niveau de parent (`a>b>c`),
/// sélecteur de version vide (`pkg@`), suppression (`"-"`).
pub fn unsupported_override(key: &str, value: &Value) -> Option<&'static str> {
    if key.matches('>').count() > 1 {
        Some("Bun ne gère qu'un niveau de parent (`parent>dep`)")
    } else if key.ends_with('@') {
        Some("sélecteur de version vide non géré par Bun")
    } else if value.as_str() == Some("-") {
        Some("la suppression d'une dépendance (`-`) n'existe pas dans Bun")
    } else {
        None
    }
}

/// Versions de `name` listées dans `pnpm-lock.yaml` (clés de `packages:`).
pub fn lock_versions(lock: &str, name: &str) -> Vec<String> {
    let mut versions = Vec::new();
    for line in lock.lines() {
        let Some(key) = line.strip_prefix("  ") else { continue };
        if key.starts_with(' ') {
            continue;
        }
        let key = key.trim_start_matches(['\'', '"', '/']);
        let Some(rest) = key.strip_prefix(name).and_then(|r| r.strip_prefix('@')) else {
            continue;
        };
        let version: String =
            rest.chars().take_while(|c| !matches!(c, '(' | ':' | '\'' | '"' | '_')).collect();
        if version.starts_with(|c: char| c.is_ascii_digit()) {
            push_unique(&mut versions, [version]);
        }
    }
    versions
}

/// Résultat de [`plan_package_json`].
#[derive(Debug, Clone, Default)]
pub struct PnpmMigration {
    /// package.json racine après migration.
    pub package_json: Value,
    /// Changements effectués (une ligne chacun).
    pub changes: Vec<String>,
    /// Réglages bunfig `[install]` à ajouter.
    pub bunfig_install: Vec<(String, String)>,
    /// Ce que Bun ne sait pas reprendre.
    pub warnings: Vec<String>,
}

fn package_name(key: &str) -> &str {
    // `@scope/name@1.0.0` → `@scope/name` ; `name@1.0.0` → `name`.
    let skip = usize::from(key.starts_with('@'));
    key[skip..].find('@').map_or(key, |i| &key[..skip + i])
}

/// Plan du package.json racine : `workspaces` (forme objet dès qu'il y a des
/// catalogs), `overrides`, `patchedDependencies`, `trustedDependencies` ;
/// retire `pnpm` et `packageManager: pnpm@…`. Les protocoles `catalog:` et
/// `workspace:` des dépendances sont conservés (Bun les comprend).
pub fn plan_package_json(pkg: &Value, cfg: &PnpmConfig, lock: Option<&str>) -> PnpmMigration {
    let mut out = pkg.clone();
    let mut plan = PnpmMigration::default();
    let Some(root) = out.as_object_mut() else {
        plan.package_json = out;
        return plan;
    };

    // workspaces
    let existing = root.get("workspaces").cloned();
    let mut packages: Vec<String> = match &existing {
        Some(Value::Array(_)) => existing.as_ref().map(str_list).unwrap_or_default(),
        Some(Value::Object(o)) => o.get("packages").map(str_list).unwrap_or_default(),
        _ => Vec::new(),
    };
    push_unique(&mut packages, cfg.packages.iter().cloned());
    let has_catalogs = !cfg.catalog.is_empty() || !cfg.catalogs.is_empty();
    if matches!(existing, Some(Value::Object(_))) || has_catalogs {
        let mut ws = match existing {
            Some(Value::Object(o)) => o,
            _ => Map::new(),
        };
        if !packages.is_empty() {
            ws.insert("packages".into(), Value::from(packages.clone()));
        }
        for (field, entries) in [("catalog", &cfg.catalog), ("catalogs", &cfg.catalogs)] {
            if entries.is_empty() {
                continue;
            }
            let mut merged = ws.get(field).and_then(Value::as_object).cloned().unwrap_or_default();
            for (k, v) in entries {
                merged.entry(k.clone()).or_insert_with(|| v.clone());
            }
            ws.insert(field.into(), Value::Object(merged));
        }
        if root.get("workspaces") != Some(&Value::Object(ws.clone())) {
            plan.changes.push(if has_catalogs {
                format!(
                    "workspaces → forme objet (packages: {}, catalog: {}, catalogs: {})",
                    packages.len(),
                    cfg.catalog.len(),
                    cfg.catalogs.len()
                )
            } else {
                format!("workspaces.packages ← {packages:?}")
            });
            root.insert("workspaces".into(), Value::Object(ws));
        }
    } else if !packages.is_empty() && root.get("workspaces") != Some(&Value::from(packages.clone()))
    {
        plan.changes.push(format!("workspaces ← {packages:?}"));
        root.insert("workspaces".into(), Value::from(packages));
    }

    // overrides
    let mut overrides = root.get("overrides").and_then(Value::as_object).cloned().unwrap_or_default();
    let mut added = 0usize;
    for (key, value) in &cfg.overrides {
        if let Some(reason) = unsupported_override(key, value) {
            plan.warnings.push(format!("override {key:?}: {value} non migré — {reason}"));
            continue;
        }
        if !overrides.contains_key(key) {
            overrides.insert(key.clone(), value.clone());
            added += 1;
        }
    }
    if added > 0 {
        plan.changes.push(format!("overrides ← {added} entrée(s) pnpm"));
        root.insert("overrides".into(), Value::Object(overrides));
    }

    // patchedDependencies
    let mut patched =
        root.get("patchedDependencies").and_then(Value::as_object).cloned().unwrap_or_default();
    let mut added = 0usize;
    for (key, value) in &cfg.patched {
        let name = package_name(key);
        let key = if name == key {
            let versions = lock.map(|l| lock_versions(l, name)).unwrap_or_default();
            if let [version] = versions.as_slice() {
                format!("{name}@{version}")
            } else {
                plan.warnings.push(format!(
                    "patchedDependencies {key:?} sans version : {} version(s) dans pnpm-lock.yaml \
                     — Bun attend `nom@version`",
                    versions.len()
                ));
                key.clone()
            }
        } else {
            key.clone()
        };
        if !patched.contains_key(&key) {
            patched.insert(key, value.clone());
            added += 1;
        }
    }
    if added > 0 {
        plan.changes.push(format!("patchedDependencies ← {added} patch(s)"));
        root.insert("patchedDependencies".into(), Value::Object(patched));
    }

    // trustedDependencies
    if !cfg.only_built.is_empty() {
        let mut trusted =
            root.get("trustedDependencies").map(str_list).unwrap_or_default();
        let before = trusted.len();
        push_unique(&mut trusted, cfg.only_built.iter().cloned());
        if trusted.len() != before {
            plan.changes.push(format!(
                "trustedDependencies ← {} paquet(s) (onlyBuiltDependencies/allowBuilds)",
                trusted.len() - before
            ));
            root.insert("trustedDependencies".into(), Value::from(trusted));
        }
    }

    if root.remove("pnpm").is_some() {
        plan.changes.push("champ `pnpm` retiré".into());
    }
    if root.get("packageManager").and_then(Value::as_str).is_some_and(|pm| pm.starts_with("pnpm@"))
    {
        root.remove("packageManager");
        plan.changes.push("packageManager pnpm@… retiré".into());
    }

    plan.bunfig_install = cfg.install.clone();
    for key in &cfg.unsupported {
        plan.warnings.push(format!("réglage pnpm {key:?} sans équivalent Bun — non migré"));
    }
    plan.package_json = out;
    plan
}

/// Ajoute `entries` à la section `[install]` de `bunfig` (clés déjà présentes conservées).
pub fn merge_bunfig_install(bunfig: &str, entries: &[(String, String)]) -> String {
    let mut lines: Vec<String> = bunfig.lines().map(String::from).collect();
    let header = lines.iter().position(|l| l.trim() == "[install]");
    let section_end = |start: usize, lines: &[String]| {
        lines[start + 1..]
            .iter()
            .position(|l| l.trim_start().starts_with('['))
            .map_or(lines.len(), |i| start + 1 + i)
    };
    let present = |key: &str, lines: &[String], range: std::ops::Range<usize>| {
        lines[range].iter().any(|l| {
            l.trim_start().strip_prefix(key).is_some_and(|r| r.trim_start().starts_with('='))
        })
    };
    let start = match header {
        Some(i) => i,
        None => {
            if lines.last().is_some_and(|l| !l.trim().is_empty()) {
                lines.push(String::new());
            }
            lines.push("[install]".into());
            lines.len() - 1
        },
    };
    let mut insert_at = section_end(start, &lines);
    while insert_at > start + 1 && lines[insert_at - 1].trim().is_empty() {
        insert_at -= 1;
    }
    for (key, value) in entries {
        if present(key, &lines, start + 1..section_end(start, &lines)) {
            continue;
        }
        lines.insert(insert_at, format!("{key} = {value}"));
        insert_at += 1;
    }
    let mut out = lines.join("\n");
    out.push('\n');
    out
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    const YAML: &str = "packages:\n  - packages/*\n  - apps/*\ncatalog:\n  react: ^19.0.0\ncatalogs:\n  legacy:\n    react: ^17.0.0\noverrides:\n  lodash: 4.17.21\n  foo>bar: 1.0.0\n  a>b>c: 2.0.0\npatchedDependencies:\n  left-pad: patches/left-pad.patch\nonlyBuiltDependencies:\n  - esbuild\nallowBuilds:\n  sharp: true\n  core-js: false\nnodeLinker: hoisted\nminimumReleaseAge: 1440\nminimumReleaseAgeExclude:\n  - typescript\npackageExtensions: {}\n";

    #[test]
    fn parses_every_pnpm_workspace_section() {
        let cfg = parse_workspace_yaml(YAML).unwrap();
        assert_eq!(cfg.packages, ["packages/*", "apps/*"]);
        assert_eq!(cfg.catalog["react"], "^19.0.0");
        assert_eq!(cfg.catalogs["legacy"]["react"], "^17.0.0");
        assert_eq!(cfg.overrides.len(), 3);
        assert_eq!(cfg.patched["left-pad"], "patches/left-pad.patch");
        assert_eq!(cfg.only_built, ["esbuild", "sharp"]);
        assert!(cfg.install.contains(&("linker".into(), "\"hoisted\"".into())));
        assert!(cfg.install.contains(&("minimumReleaseAge".into(), "86400".into())));
        assert!(
            cfg.install
                .contains(&("minimumReleaseAgeExcludes".into(), "[\"typescript\"]".into()))
        );
        assert_eq!(cfg.unsupported, ["packageExtensions"]);
    }

    #[test]
    fn plans_object_workspaces_with_catalogs_and_drops_pnpm_fields() {
        let mut cfg = parse_package_field(&json!({
            "pnpm": { "overrides": { "semver": "7.6.0" } }
        }))
        .unwrap();
        cfg.merge(parse_workspace_yaml(YAML).unwrap());
        let pkg = json!({
            "name": "root",
            "packageManager": "pnpm@9.15.0",
            "workspaces": ["packages/*"],
            "dependencies": { "react": "catalog:", "lib": "workspace:*" },
            "pnpm": { "overrides": { "semver": "7.6.0" } }
        });
        let lock = "lockfileVersion: '9.0'\n\npackages:\n\n  left-pad@1.3.0:\n    resolution: {integrity: x}\n";
        let plan = plan_package_json(&pkg, &cfg, Some(lock));
        let out = &plan.package_json;
        assert_eq!(out["workspaces"]["packages"], json!(["packages/*", "apps/*"]));
        assert_eq!(out["workspaces"]["catalog"]["react"], "^19.0.0");
        assert_eq!(out["workspaces"]["catalogs"]["legacy"]["react"], "^17.0.0");
        assert_eq!(out["overrides"], json!({ "semver": "7.6.0", "lodash": "4.17.21", "foo>bar": "1.0.0" }));
        assert_eq!(out["patchedDependencies"], json!({ "left-pad@1.3.0": "patches/left-pad.patch" }));
        assert_eq!(out["trustedDependencies"], json!(["esbuild", "sharp"]));
        assert_eq!(out["dependencies"]["react"], "catalog:");
        assert_eq!(out["dependencies"]["lib"], "workspace:*");
        assert!(out.get("pnpm").is_none());
        assert!(out.get("packageManager").is_none());
        assert!(plan.warnings.iter().any(|w| w.contains("a>b>c")));
        assert!(plan.warnings.iter().any(|w| w.contains("packageExtensions")));
        let keys: Vec<&String> = out.as_object().unwrap().keys().collect();
        assert_eq!(keys[0], "name", "l'ordre des clés existantes est conservé");
    }

    #[test]
    fn bare_patch_key_with_ambiguous_lock_version_is_reported() {
        let cfg = parse_workspace_yaml("patchedDependencies:\n  left-pad: p.patch\n").unwrap();
        let lock = "packages:\n  left-pad@1.0.0:\n    x: y\n  left-pad@1.3.0:\n    x: y\n";
        let plan = plan_package_json(&json!({}), &cfg, Some(lock));
        assert_eq!(plan.package_json["patchedDependencies"], json!({ "left-pad": "p.patch" }));
        assert_eq!(plan.warnings.len(), 1);
    }

    #[test]
    fn merges_bunfig_install_section() {
        let entries = vec![
            ("linker".to_string(), "\"hoisted\"".to_string()),
            ("minimumReleaseAge".to_string(), "60".to_string()),
        ];
        assert_eq!(
            merge_bunfig_install("[test]\nroot = \"src\"\n", &entries),
            "[test]\nroot = \"src\"\n\n[install]\nlinker = \"hoisted\"\nminimumReleaseAge = 60\n"
        );
        assert_eq!(
            merge_bunfig_install("[install]\nlinker = \"isolated\"\n\n[run]\nbun = true\n", &entries),
            "[install]\nlinker = \"isolated\"\nminimumReleaseAge = 60\n\n[run]\nbun = true\n"
        );
    }
}
