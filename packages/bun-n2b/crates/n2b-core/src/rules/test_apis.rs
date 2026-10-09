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

//! APIs `vi.*` / `jest.*` des tests vitest/jest absentes de `bun:test`.
//! Signalées sans autofix : il n'existe pas d'équivalent mécanique.

use aphrody_n2b_types::types::{Finding, MakeFindingOpts, Severity};
use once_cell::sync::Lazy;
use regex::Regex;

use crate::util::{line_offsets, make_finding};

/// Membres de `vi` implémentés par bun:test (src/runtime/test_runner/jest.rs).
const VI_SUPPORTED: &[&str] = &[
    "fn",
    "mock",
    "spyOn",
    "restoreAllMocks",
    "resetAllMocks",
    "clearAllMocks",
    "useFakeTimers",
    "useRealTimers",
    "advanceTimersToNextTimer",
    "advanceTimersByTime",
    "runOnlyPendingTimers",
    "runAllTimers",
    "getTimerCount",
    "clearAllTimers",
    "isFakeTimers",
];

/// Membres de `jest` en plus de [`VI_SUPPORTED`].
const JEST_EXTRA: &[&str] = &["setSystemTime", "now", "setTimeout"];

static CALL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b(vi|jest)\.([A-Za-z_]\w*)\s*(?:<[^>()]*>)?\(")
        .expect("invariant: test_apis CALL_RE is valid")
});

static MOCK_WITHOUT_FACTORY_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"^\(\s*(?:"[^"]*"|'[^']*'|`[^`]*`)\s*\)"#)
        .expect("invariant: test_apis MOCK_WITHOUT_FACTORY_RE is valid")
});

fn is_test_file(path: &str, source: &str) -> bool {
    path.contains(".test.")
        || path.contains(".spec.")
        || path.contains("__tests__/")
        || source.contains("\"vitest\"")
        || source.contains("'vitest'")
        || source.contains("@jest/globals")
}

fn hint(api: &str) -> &'static str {
    match api {
        "stubEnv" | "unstubAllEnvs" => "assigner/restaurer process.env (ou Bun.env) à la main",
        "stubGlobal" | "unstubAllGlobals" => "assigner/restaurer globalThis.<nom> à la main",
        "importActual" | "requireActual" | "importMock" | "requireMock" => {
            "importer le module réel avec import() avant mock.module"
        },
        "hoisted" => "déclarer les valeurs au niveau module (bun:test ne hisse rien)",
        "mocked" => "cast TypeScript (`as Mock<typeof fn>`)",
        "doMock" | "unmock" | "doUnmock" | "resetModules" | "isolateModules" => {
            "pas d'équivalent : mock.module s'applique au registre de modules global"
        },
        "waitFor" | "waitUntil" => "boucle `await` bornée sur la condition",
        "setSystemTime" | "getRealSystemTime" => {
            "jest.setSystemTime / setSystemTime de bun:test"
        },
        "replaceProperty" => "spyOn(obj, prop, 'get') ou assignation restaurée en afterEach",
        _ if api.ends_with("Async") => "version synchrone puis `await` explicite",
        _ => "pas d'équivalent dans bun:test",
    }
}

/// Findings `test/unsupported-api` (warn) et `test/mock-hoisting` (info).
pub fn test_api_findings(path: &str, source: &str) -> Vec<Finding> {
    if !(source.contains("vi.") || source.contains("jest.")) || !is_test_file(path, source) {
        return Vec::new();
    }
    let offsets = line_offsets(source);
    let mut findings = Vec::new();
    for caps in CALL_RE.captures_iter(source) {
        let (Some(whole), Some(object), Some(member)) = (caps.get(0), caps.get(1), caps.get(2))
        else {
            continue;
        };
        let line_start = source[..whole.start()].rfind('\n').map_or(0, |i| i + 1);
        let line = source[line_start..whole.start()].trim_start();
        if line.starts_with("//") || line.starts_with('*') || line.starts_with("/*") {
            continue;
        }
        let (object, api) = (object.as_str(), member.as_str());
        let supported =
            VI_SUPPORTED.contains(&api) || (object == "jest" && JEST_EXTRA.contains(&api));
        if !supported {
            findings.push(make_finding(
                path,
                &offsets,
                whole.start(),
                "test/unsupported-api",
                format!("{object}.{api} n'existe pas dans bun:test — {}", hint(api)),
                format!("{object}.{api}"),
                None,
                MakeFindingOpts {
                    autofix: Some(false),
                    severity: Some(Severity::Warn),
                    ..Default::default()
                },
            ));
        } else if api == "mock" {
            let without_factory = MOCK_WITHOUT_FACTORY_RE.is_match(&source[whole.end() - 1..]);
            findings.push(make_finding(
                path,
                &offsets,
                whole.start(),
                "test/mock-hoisting",
                format!(
                    "{object}.mock n'est pas hissé par bun:test : l'appeler avant d'importer le \
                     module visé (ou dans un fichier --preload) ; la factory ne reçoit pas \
                     importOriginal{}",
                    if without_factory {
                        " — factory obligatoire (automock de module non géré)"
                    } else {
                        ""
                    }
                ),
                format!("{object}.mock"),
                None,
                MakeFindingOpts {
                    autofix: Some(false),
                    severity: Some(if without_factory { Severity::Warn } else { Severity::Info }),
                    ..Default::default()
                },
            ));
        }
    }
    findings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_missing_vi_and_jest_apis_only_in_tests() {
        let src = "import { vi } from 'vitest';\nvi.fn();\nvi.stubEnv('A', '1');\n// vi.hoisted()\njest.requireActual('x');\njest.setSystemTime(0);\nvi.advanceTimersByTimeAsync(5);\n";
        let findings = test_api_findings("a.test.ts", src);
        let apis: Vec<&str> = findings.iter().map(|f| f.original.as_str()).collect();
        assert_eq!(apis, ["vi.stubEnv", "jest.requireActual", "vi.advanceTimersByTimeAsync"]);
        assert!(findings.iter().all(|f| f.rule_id == "test/unsupported-api" && !f.autofix));
        assert!(test_api_findings("src/app.ts", "vi.stubEnv('A','1')").is_empty());
    }

    #[test]
    fn flags_mock_hoisting_and_missing_factory() {
        let src = "vi.mock('./a', () => ({ a: 1 }));\nvi.mock('./b');\n";
        let findings = test_api_findings("x.spec.ts", src);
        assert_eq!(findings.len(), 2);
        assert!(findings.iter().all(|f| f.rule_id == "test/mock-hoisting"));
        assert_eq!(findings[0].severity, Severity::Info);
        assert_eq!(findings[1].severity, Severity::Warn);
    }
}
