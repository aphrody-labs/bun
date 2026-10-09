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

use crate::util::{Edit, apply_edits, line_offsets, make_finding};
use aphrody_n2b_registry::CLI;
use aphrody_n2b_types::types::{Finding, MakeFindingOpts};
use once_cell::sync::Lazy;
use regex::Regex;

/// Vue runtime d'une `CliEntry` du registre — la regex est compilée une
/// fois au premier accès via `Lazy`. Champ `respect_comments` honoré dans
/// `apply_cli_rules` (déjà couvert par PS4 — détection ET édition partagent
/// le même filtre `COMMENT_PREFIX`).
struct Mapping {
    re: Regex,
    replace: String,
    rule_id: String,
    message: String,
    aggressive: bool,
    unless: Option<Regex>,
}

static MAPPINGS: Lazy<Vec<Mapping>> = Lazy::new(|| {
    CLI.iter()
        .map(|e| Mapping {
            re: Regex::new(&e.pattern).unwrap_or_else(|err| {
                panic!(
                    "invariant: cli_commands mapping pattern '{}' is invalid: {}",
                    e.pattern, err
                )
            }),
            replace: e.replace.clone(),
            rule_id: e.id.clone(),
            message: e.message.clone(),
            aggressive: e.aggressive,
            unless: e.unless.as_deref().map(|p| {
                Regex::new(p).unwrap_or_else(|err| {
                    panic!("invariant: cli_commands unless pattern '{p}' is invalid: {err}")
                })
            }),
        })
        .collect()
});

static COMMENT_PREFIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^\s*(#|//)").expect("invariant: COMMENT_PREFIX regex literal is valid")
});

/// Applique chaque mapping en séquence, en ignorant les lignes commentées.
/// **Détection et édition partagent le même filtre `COMMENT_PREFIX`** —
/// avant ce fix, l'édition utilisait `re.replace_all` global et réécrivait
/// les lignes commentées que la détection ignorait (PS4).
///
/// `aggressive` : mode `--aggressive`/`--migrate`. Hors de ce mode, une règle
/// `aggressive = true` du registre est signalée (replacement proposé) sans
/// autofix ni édition.
pub fn apply_cli_rules(path: &str, source: &str, aggressive: bool) -> (Vec<Finding>, String) {
    let mut out = source.to_string();
    // Copie de `out` où les hits signalés sans édition sont masqués par des
    // espaces (même longueur en octets) : une règle plus générique ne doit pas
    // re-signaler `vitest run` déjà couvert par `cli/vitest-run`.
    let mut shadow = out.clone();
    let mut findings: Vec<Finding> = Vec::new();
    let mut offsets = line_offsets(&out);
    let mut offsets_stale = false;

    for rule in MAPPINGS.iter() {
        if offsets_stale {
            offsets = line_offsets(&out);
            offsets_stale = false;
        }

        let mut edits: Vec<Edit> = Vec::new();
        let mut masked: Vec<(usize, usize)> = Vec::new();
        for mat in rule.re.find_iter(&shadow) {
            let line_start = shadow[..mat.start()].rfind('\n').map(|p| p + 1).unwrap_or(0);
            let line_end =
                shadow[mat.start()..].find('\n').map(|p| mat.start() + p).unwrap_or(shadow.len());
            if COMMENT_PREFIX.is_match(&shadow[line_start..line_end]) {
                continue;
            }

            let text = mat.as_str();
            if rule.unless.as_ref().is_some_and(|unless| unless.is_match(text)) {
                continue;
            }
            // Rejoue la regex sur le hit pour conserver les back-refs ($1, $2).
            let rewritten = rule.re.replace(text, rule.replace.as_str()).to_string();
            // Le contexte capturé en tête (`(^|[\s;&|(])`) n'appartient pas à la
            // commande et est recopié tel quel par `${1}`.
            let lead = text.len()
                - text.trim_start_matches(|c: char| c.is_whitespace() || ";&|(".contains(c)).len();
            let start = mat.start() + lead;
            let end = mat.end();
            let replacement = rewritten.get(lead..).unwrap_or_default().to_string();
            let apply = aggressive || !rule.aggressive;
            findings.push(make_finding(
                path,
                &offsets,
                start,
                &rule.rule_id,
                rule.message.clone(),
                out[start..end].to_string(),
                Some(replacement.clone()),
                MakeFindingOpts {
                    autofix: Some(apply),
                    aggressive: rule.aggressive.then_some(true),
                    ..Default::default()
                },
            ));
            if apply {
                edits.push(Edit { index: start, len: end - start, replacement });
            } else {
                masked.push((start, end));
            }
        }

        for (start, end) in masked {
            shadow.replace_range(start..end, &" ".repeat(end - start));
        }
        if !edits.is_empty() {
            out = apply_edits(&out, edits.clone());
            shadow = apply_edits(&shadow, edits);
            offsets_stale = true;
        }
    }

    (findings, out)
}
