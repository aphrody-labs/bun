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

// Scanner de pnpm-workspace.yaml — Bun lit `"workspaces"` (et ses
// `catalog`/`catalogs`), `overrides`, `patchedDependencies` et
// `trustedDependencies` dans le package.json racine, les réglages
// d'installation dans bunfig.toml `[install]`. `n2b --migrate` fait la
// conversion (voir `crate::pnpm`).
use crate::pnpm::{PnpmConfig, parse_workspace_yaml, unsupported_override};
use crate::util::make_finding;
use aphrody_n2b_types::types::{Finding, MakeFindingOpts, Severity};

pub struct PnpmWorkspaceInfo {
    pub packages: Vec<String>,
    pub only_built: Vec<String>,
}

pub fn parse_pnpm_workspace(content: &str) -> Option<PnpmWorkspaceInfo> {
    parse_workspace_yaml(content)
        .map(|cfg| PnpmWorkspaceInfo { packages: cfg.packages, only_built: cfg.only_built })
}

fn warn(path: &str, rule: &str, message: String, original: &str, replacement: String) -> Finding {
    make_finding(
        path,
        &[],
        0,
        rule,
        message,
        original.to_string(),
        Some(replacement),
        MakeFindingOpts {
            autofix: Some(false),
            severity: Some(Severity::Warn),
            ..Default::default()
        },
    )
}

/// Findings des sections pnpm (yaml ou champ `pnpm`) portables vers Bun.
/// `source` : libellé de l'origine dans les messages.
pub fn pnpm_config_findings(path: &str, source: &str, cfg: &PnpmConfig) -> Vec<Finding> {
    let mut findings = Vec::new();
    if !cfg.catalog.is_empty() || !cfg.catalogs.is_empty() {
        let mut ws = serde_json::Map::new();
        if !cfg.packages.is_empty() {
            ws.insert("packages".into(), serde_json::json!(cfg.packages));
        }
        if !cfg.catalog.is_empty() {
            ws.insert("catalog".into(), serde_json::Value::Object(cfg.catalog.clone()));
        }
        if !cfg.catalogs.is_empty() {
            ws.insert("catalogs".into(), serde_json::Value::Object(cfg.catalogs.clone()));
        }
        findings.push(warn(
            path,
            "workspace/pnpm-catalog",
            format!(
                "{source} : catalog ({} entrée(s)) / catalogs ({}) → \"workspaces\": {{ \
                 \"packages\", \"catalog\", \"catalogs\" }} du package.json racine ; les \
                 protocoles `catalog:` restent valides avec Bun (n2b --migrate)",
                cfg.catalog.len(),
                cfg.catalogs.len()
            ),
            "catalog",
            format!(r#""workspaces": {}"#, serde_json::Value::Object(ws)),
        ));
    }
    if !cfg.overrides.is_empty() {
        let unsupported: Vec<String> = cfg
            .overrides
            .iter()
            .filter_map(|(k, v)| unsupported_override(k, v).map(|why| format!("{k} ({why})")))
            .collect();
        let mut message = format!(
            "{source} : overrides ({}) → \"overrides\" du package.json racine (n2b --migrate)",
            cfg.overrides.len()
        );
        if !unsupported.is_empty() {
            message
                .push_str(&format!(" ; non pris en charge par Bun : {}", unsupported.join(", ")));
        }
        findings.push(warn(
            path,
            "workspace/pnpm-overrides",
            message,
            "overrides",
            format!(r#""overrides": {}"#, serde_json::Value::Object(cfg.overrides.clone())),
        ));
    }
    if !cfg.patched.is_empty() {
        findings.push(warn(
            path,
            "workspace/pnpm-patched",
            format!(
                "{source} : patchedDependencies ({}) → \"patchedDependencies\" du package.json \
                 racine, clés `nom@version` (n2b --migrate les résout via pnpm-lock.yaml)",
                cfg.patched.len()
            ),
            "patchedDependencies",
            format!(r#""patchedDependencies": {}"#, serde_json::Value::Object(cfg.patched.clone())),
        ));
    }
    if !cfg.only_built.is_empty() {
        findings.push(warn(
            path,
            "workspace/only-built-deps",
            format!(
                "{source} : onlyBuiltDependencies/allowBuilds ({}) → \"trustedDependencies\" \
                 du package.json racine",
                cfg.only_built.len()
            ),
            "onlyBuiltDependencies",
            format!(
                r#""trustedDependencies": {}"#,
                serde_json::to_string(&cfg.only_built).unwrap_or_default()
            ),
        ));
    }
    if !cfg.install.is_empty() || !cfg.unsupported.is_empty() {
        let bunfig: Vec<String> = cfg.install.iter().map(|(k, v)| format!("{k} = {v}")).collect();
        let mut message = format!("{source} : réglages d'installation pnpm");
        if !bunfig.is_empty() {
            message.push_str(&format!(" → bunfig.toml [install] ({})", bunfig.join(", ")));
        }
        if !cfg.unsupported.is_empty() {
            message.push_str(&format!(" ; sans équivalent Bun : {}", cfg.unsupported.join(", ")));
        }
        findings.push(make_finding(
            path,
            &[],
            0,
            "workspace/pnpm-settings",
            message,
            "settings".to_string(),
            (!bunfig.is_empty()).then(|| format!("[install]\n{}", bunfig.join("\n"))),
            MakeFindingOpts {
                autofix: Some(false),
                severity: Some(Severity::Info),
                ..Default::default()
            },
        ));
    }
    findings
}

pub fn scan_pnpm_workspace(path: &str, content: &str) -> Vec<Finding> {
    let Some(cfg) = parse_workspace_yaml(content) else {
        return Vec::new();
    };
    let mut findings = vec![warn(
        path,
        "workspace/pnpm-yaml",
        format!(
            "pnpm-workspace.yaml présent ({} patterns) — Bun lit \"workspaces\" dans le \
             package.json racine. `n2b --migrate` le convertit puis le supprime.",
            cfg.packages.len()
        ),
        "pnpm-workspace.yaml",
        format!(r#""workspaces": {}"#, serde_json::to_string(&cfg.packages).unwrap_or_default()),
    )];
    findings.extend(pnpm_config_findings(path, "pnpm-workspace.yaml", &cfg));
    findings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_catalog_overrides_patches_and_settings() {
        let yaml = "packages: [packages/*]\ncatalog:\n  react: ^19.0.0\noverrides:\n  a>b>c: 1.0.0\npatchedDependencies:\n  left-pad@1.3.0: p.patch\nonlyBuiltDependencies: [esbuild]\nnodeLinker: isolated\n";
        let findings = scan_pnpm_workspace("pnpm-workspace.yaml", yaml);
        let ids: Vec<&str> = findings.iter().map(|f| f.rule_id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "workspace/pnpm-yaml",
                "workspace/pnpm-catalog",
                "workspace/pnpm-overrides",
                "workspace/pnpm-patched",
                "workspace/only-built-deps",
                "workspace/pnpm-settings",
            ]
        );
        assert!(findings[2].message.contains("a>b>c"));
        assert_eq!(findings[5].replacement.as_deref(), Some("[install]\nlinker = \"isolated\""));
    }
}
