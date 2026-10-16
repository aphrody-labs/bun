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

//! Classification des fichiers et du projet qui conditionne les réécritures :
//! code navigateur (bundlé par webpack, sans `node:`), configs d'outils
//! (chargées par Node via l'outil, pas par Bun) et projets encore sous Jest.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use once_cell::sync::Lazy;

fn basename(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

fn stem(path: &str) -> &str {
    let name = basename(path);
    name.rsplit_once('.').map_or(name, |(stem, _)| stem)
}

/// `webpack.config.ts`, `jest.config.js`, `vite.config.mts`, `.babelrc.js`…
/// L'outil (webpack, jest, eslint…) charge ces fichiers sous Node.
pub fn is_tool_config(path: &str) -> bool {
    let stem = stem(path);
    stem.ends_with(".config")
        || stem.ends_with(".workspace")
        || (stem.starts_with('.') && stem.ends_with("rc"))
}

pub fn is_jest_config(path: &str) -> bool {
    stem(path) == "jest.config"
}

/// Paquets propres à un runner de test (Jest, Vitest, Mocha).
pub fn is_test_runner_package(spec: &str) -> bool {
    matches!(spec, "jest" | "ts-jest" | "vitest" | "mocha")
        || spec.starts_with("@jest/")
        || spec.starts_with("jest-")
}

/// Code exécuté dans un navigateur et bundlé (webpack 5 ne résout pas `node:`
/// vers ses polyfills) : arbre `resources/`, `ui/`, `*_ui/`, JSX, ou usage
/// de `window`/`document`/`chrome://`.
pub fn is_browser_source(path: &str, source: &str) -> bool {
    let lower = path.replace('\\', "/").to_ascii_lowercase();
    let mut segments: Vec<&str> = lower.split('/').collect();
    segments.pop();
    if segments.iter().any(|s| {
        matches!(*s, "resources" | "ui" | "public" | "static" | "frontend" | "client" | "webview")
            || s.ends_with("_ui")
            || s.ends_with("-ui")
    }) {
        return true;
    }
    if lower.ends_with(".tsx") || lower.ends_with(".jsx") {
        return true;
    }
    source.contains("window.")
        || source.contains("document.")
        || source.contains("chrome://")
        || source.contains("chrome-untrusted://")
}

static JEST_PROJECTS: Lazy<Mutex<HashMap<PathBuf, bool>>> = Lazy::new(Default::default);

/// Le projet exécute encore Jest : `jest.config.*` ou champ `"jest"` du
/// package.json racine. Tant que c'est le cas, `@jest/globals` → `bun:test`
/// casserait les tests lancés par Jest.
pub fn project_keeps_jest(root: &Path) -> bool {
    let mut cache = JEST_PROJECTS.lock().unwrap_or_else(|e| e.into_inner());
    *cache.entry(root.to_path_buf()).or_insert_with(|| {
        let config = ["ts", "js", "mjs", "cjs", "mts", "cts", "json"]
            .iter()
            .any(|ext| root.join(format!("jest.config.{ext}")).is_file());
        config
            || std::fs::read_to_string(root.join("package.json"))
                .ok()
                .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
                .is_some_and(|pkg| pkg.get("jest").is_some())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_brave_layouts() {
        assert!(is_browser_source("components/brave_wallet/resources/ethereum_provider.js", ""));
        assert!(is_browser_source("components/brave_wallet_ui/common/hooks/use-orb.ts", ""));
        assert!(is_browser_source("x/hardware_wallet_connect.tsx", ""));
        assert!(is_browser_source("lib/a.js", "window.ethereum = provider"));
        assert!(!is_browser_source(
            "tools/chromium_src/lit_mangler/mangle.ts",
            "import fs from 'fs'"
        ));
        assert!(is_tool_config("ios/brave-ios/webpack.config.js"));
        assert!(is_tool_config("jest.config.ts"));
        assert!(!is_tool_config("src/config.ts"));
        assert!(is_jest_config("jest.config.ts"));
        assert!(is_test_runner_package("@jest/globals") && is_test_runner_package("ts-jest"));
        assert!(!is_test_runner_package("jestful"));
    }
}
