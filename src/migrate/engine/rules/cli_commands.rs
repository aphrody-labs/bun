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

use crate::registry::CLI;
use crate::types::{Finding, MakeFindingOpts};
use crate::util::{Edit, apply_edits, line_offsets, make_finding};
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
    manual: bool,
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
            manual: e.manual,
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

fn procfile_prefix_len(line: &[u8]) -> Option<usize> {
    let start = line.iter().position(|byte| !matches!(*byte, b' ' | b'\t'))?;
    let length = line[start..]
        .iter()
        .take_while(|byte| byte.is_ascii_alphanumeric() || matches!(**byte, b'_' | b'-'))
        .count();
    (length > 0 && line.get(start + length) == Some(&b':')).then_some(start + length + 1)
}

/// Word offsets; quoted and escaped operators do not start commands.
fn command_positions(source: &str, procfile: bool) -> (Vec<usize>, Vec<usize>) {
    let bytes = source.as_bytes();
    let mut positions = Vec::new();
    let mut words = Vec::new();
    let (mut quote, mut executable, mut word) = (None, true, false);
    let mut contexts = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if procfile
            && executable
            && !word
            && quote.is_none()
            && contexts.is_empty()
            && (index == 0 || bytes[index - 1] == b'\n')
        {
            if let Some(length) = procfile_prefix_len(&bytes[index..]) {
                index += length;
                (executable, word) = (true, false);
                continue;
            }
        }
        let byte = bytes[index];
        if quote == Some(b'\'') {
            if byte == b'\'' {
                quote = None;
            }
            index += 1;
            continue;
        }
        if byte == b'\\' {
            if quote.is_none() && bytes.get(index + 1) != Some(&b'\n') {
                executable = false;
                word = true;
            }
            index = (index + 2).min(bytes.len());
            continue;
        }
        if byte == b'$' && bytes.get(index + 1) == Some(&b'(') {
            contexts.push((quote, false, true));
            (quote, executable, word) = (None, true, false);
            index += 2;
            continue;
        }
        if let Some(delimiter) = quote {
            if byte == delimiter {
                quote = None;
            }
            index += 1;
            continue;
        }
        match byte {
            b'\'' | b'"' | b'`' => {
                quote = Some(byte);
                executable = false;
                word = true;
            },
            b'#' if !word => {
                while index < bytes.len() && bytes[index] != b'\n' {
                    index += 1;
                }
                continue;
            },
            b'(' => {
                contexts.push((None, false, false));
                (executable, word) = (true, false);
            },
            b')' => {
                (quote, executable, word) = contexts.pop().unwrap_or((None, false, false));
            },
            b';' | b'&' | b'|' | b'\n' => (executable, word) = (true, false),
            b' ' | b'\t' | b'\r' => word = false,
            _ => {
                if !word {
                    words.push(index);
                }
                if !word && executable {
                    positions.push(index);
                    let end = bytes[index..]
                        .iter()
                        .position(|byte| b" \t\r\n;&|()'\"\\$`".contains(byte))
                        .map_or(bytes.len(), |length| index + length);
                    let token = &bytes[index..end];
                    // Document scanners pass Docker RUN and workflow run: prefixes.
                    executable =
                        token.eq_ignore_ascii_case(b"RUN") || token == b"run:" || token == b"-";
                }
                word = true;
            },
        }
        index += 1;
    }
    (positions, words)
}

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
    let procfile =
        path.rsplit(['/', '\\']).next().is_some_and(crate::scanners::procfile::is_procfile);
    // Copie de `out` où les hits signalés sans édition sont masqués par des
    // espaces (même longueur en octets) : une règle plus générique ne doit pas
    // re-signaler `vitest run` déjà couvert par `cli/vitest-run`.
    let mut shadow = out.clone();
    if procfile {
        let mut offset = 0;
        for line in source.split_inclusive('\n') {
            if let Some(length) = procfile_prefix_len(line.as_bytes()) {
                // Mask document context without changing source bytes or command offsets.
                shadow.replace_range(offset..offset + length, &" ".repeat(length));
            }
            offset += line.len();
        }
    }
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
        let (executable, words) = command_positions(&out, procfile);
        let native = rule.rule_id.starts_with("cli/native-");
        let mut cursor = 0;
        while let Some(mat) = rule.re.find_at(&shadow, cursor) {
            // Native patterns capture a separator as context for the next command.
            let separator =
                native && mat.as_str().as_bytes().last().is_some_and(|byte| b";&|)".contains(byte));
            cursor = mat.end() - usize::from(separator);
            if cursor <= mat.start() {
                break;
            }
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
            let lead = if native {
                rule.re.captures(text).and_then(|captures| captures.get(1)).map_or(0, |m| m.len())
            } else {
                text.len()
                    - text
                        .trim_start_matches(|c: char| c.is_whitespace() || ";&|(".contains(c))
                        .len()
            };
            let start = mat.start() + lead;
            if executable.binary_search(&start).is_err() {
                continue;
            }
            if rule.rule_id == "cli/native-check-no-emit" {
                let flag = rule.re.captures(text).and_then(|captures| captures.get(3));
                if flag
                    .is_none_or(|flag| words.binary_search(&(mat.start() + flag.start())).is_err())
                {
                    continue;
                }
            }
            let end = mat.end() - usize::from(separator);
            let replacement_end = rewritten.len() - usize::from(separator);
            let replacement = rewritten.get(lead..replacement_end).unwrap_or_default().to_string();
            let apply = !rule.manual && (aggressive || !rule.aggressive);
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
                // Keep a captured command separator available to the next rule.
                let context =
                    !native && text.as_bytes().last().is_some_and(|byte| b";&|)".contains(byte));
                masked.push((start, end - usize::from(context)));
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
