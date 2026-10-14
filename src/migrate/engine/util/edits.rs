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

/// Une édition à appliquer dans une chaîne source : remplace `len` octets
/// à partir de `index` par `replacement`.
#[derive(Debug, Clone)]
pub struct Edit {
    pub index: usize,
    pub len: usize,
    pub replacement: String,
}

/// Applique des éditions en résolvant les chevauchements.
///
/// Stratégie :
/// - Tri (index asc, len desc) pour qu'à index égal, l'édition la plus longue gagne (ex.
///   `api/json-parse-readFileSync` enveloppe `api/fs-readFileSync`).
/// - Filtre les éditions qui chevauchent une précédente déjà gardée.
/// - Construit la sortie en une passe, avec les offsets du texte original.
pub fn apply_edits(source: &str, mut edits: Vec<Edit>) -> String {
    if edits.is_empty() {
        return source.to_string();
    }
    edits.sort_by(|a, b| a.index.cmp(&b.index).then(b.len.cmp(&a.len)));
    let mut kept: Vec<Edit> = Vec::with_capacity(edits.len());
    for e in edits {
        let overlaps = kept.last().map(|p| p.index + p.len > e.index).unwrap_or(false);
        if !overlaps {
            kept.push(e);
        }
    }
    let capacity = kept.iter().fold(source.len(), |len, e| len - e.len + e.replacement.len());
    let mut out = String::with_capacity(capacity);
    let mut cursor = 0;
    for group in kept.chunk_by(|a, b| a.index == b.index) {
        let first = &group[0];
        out.push_str(&source[cursor..first.index]);
        for e in group.iter().rev() {
            out.push_str(&e.replacement);
        }
        cursor = first.index + first.len;
    }
    out.push_str(&source[cursor..]);
    out
}
