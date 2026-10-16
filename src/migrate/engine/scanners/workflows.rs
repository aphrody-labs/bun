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

use crate::rules::cli_commands::apply_cli_rules;
use crate::types::{Finding, MakeFindingOpts};
use crate::util::{line_offsets, make_finding};
use once_cell::sync::Lazy;
use regex::Regex;

static SETUP_NODE_RE: Lazy<Regex> = Lazy::new(|| {
    // Le commentaire `# vX.Y.Z` d'un pin SHA décrit setup-node : il part avec lui.
    Regex::new(r"uses:\s*actions/setup-node@[^\s#]+(?:[ \t]+#[^\n]*)?")
        .expect("invariant: SETUP_NODE_RE regex literal is valid")
});
static NODE_VERSION_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"node-version:\s*['"]?[^\n'"]+['"]?"#)
        .expect("invariant: NODE_VERSION_RE regex literal is valid")
});
static PNPM_SETUP_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)^[ \t]*(?:-[ \t]+)?uses:[ \t]*pnpm/action-setup@")
        .expect("invariant: PNPM_SETUP_RE regex literal is valid")
});
static PNPM_COMMAND_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)(?:^|[\s;&|(])pnpm(?:\s|$)")
        .expect("invariant: PNPM_COMMAND_RE regex literal is valid")
});
static CACHE_PM_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"\n\s*cache:\s*['"]?(?:npm|yarn|pnpm)['"]?"#)
        .expect("invariant: CACHE_PM_RE regex literal is valid")
});

pub fn scan_workflow(path: &str, content: &str, aggressive: bool) -> (Vec<Finding>, String) {
    let mut findings: Vec<Finding> = Vec::new();
    let mut out = content.to_string();

    let offsets = line_offsets(content);
    for mat in SETUP_NODE_RE.find_iter(content) {
        findings.push(make_finding(
            path,
            &offsets,
            mat.start(),
            "ci/setup-node",
            "actions/setup-node → oven-sh/setup-bun@v2",
            mat.as_str().to_string(),
            Some("uses: oven-sh/setup-bun@v2".to_string()),
            MakeFindingOpts { autofix: Some(true), ..Default::default() },
        ));
    }
    out = SETUP_NODE_RE.replace_all(&out, "uses: oven-sh/setup-bun@v2").into_owned();

    let offsets = line_offsets(&out);
    for mat in NODE_VERSION_RE.find_iter(&out) {
        findings.push(make_finding(
            path,
            &offsets,
            mat.start(),
            "ci/node-version",
            "remplacer 'node-version' par 'bun-version: latest'",
            mat.as_str().to_string(),
            Some("bun-version: latest".to_string()),
            MakeFindingOpts { autofix: Some(true), ..Default::default() },
        ));
    }
    out = NODE_VERSION_RE.replace_all(&out, "bun-version: latest").into_owned();

    out = CACHE_PM_RE.replace_all(&out, "").into_owned();

    let (cli_f, cli_out) = apply_cli_rules(path, &out, aggressive);
    findings.extend(cli_f);
    let out = remove_pnpm_setup(path, cli_out, &mut findings);
    (findings, out)
}

fn indent(line: &str) -> usize {
    line.len() - line.trim_start_matches([' ', '\t']).len()
}

fn blank(line: &str) -> bool {
    line.trim().is_empty()
}

/// Retire les étapes `pnpm/action-setup` une fois toutes les commandes pnpm
/// migrées ; sinon les signale seulement.
fn remove_pnpm_setup(path: &str, out: String, findings: &mut Vec<Finding>) -> String {
    let Some(first) = PNPM_SETUP_RE.find(&out) else {
        return out;
    };
    let lines: Vec<&str> = out.split_inclusive('\n').collect();
    let mut starts = Vec::with_capacity(lines.len() + 1);
    let mut offset = 0;
    for line in &lines {
        starts.push(offset);
        offset += line.len();
    }
    starts.push(out.len());
    let mut steps: Vec<(usize, usize)> = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        if !PNPM_SETUP_RE.is_match(line) {
            continue;
        }
        // L'étape commence à la ligne `- ` qui contient `uses:`.
        let mut start = index;
        while start > 0 && !lines[start].trim_start().starts_with("- ") {
            start -= 1;
        }
        let dash = indent(lines[start]);
        let mut end = index + 1;
        while end < lines.len() && (blank(lines[end]) || indent(lines[end]) > dash) {
            end += 1;
        }
        while end > index + 1 && blank(lines[end - 1]) {
            end -= 1;
        }
        // Un seul séparateur vide entre les étapes voisines.
        if start > 0 && blank(lines[start - 1]) && end < lines.len() && blank(lines[end]) {
            end += 1;
        }
        steps.push((starts[start], starts[end]));
    }
    let mut rest = out.clone();
    for &(start, end) in steps.iter().rev() {
        rest.replace_range(start..end, "");
    }
    let remove = !PNPM_COMMAND_RE.is_match(&rest);
    let offsets = line_offsets(&out);
    findings.push(make_finding(
        path,
        &offsets,
        first.start(),
        "ci/pnpm-setup",
        if remove {
            "pnpm/action-setup retiré : plus aucune commande pnpm, Bun installe les paquets"
        } else {
            "pnpm/action-setup conservé : des commandes pnpm restent à migrer"
        },
        first.as_str().trim().to_string(),
        None,
        MakeFindingOpts { autofix: Some(remove), ..Default::default() },
    ));
    if remove { rest } else { out }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BRAVE: &str = "jobs:\n  fix:\n    steps:\n      - uses: actions/checkout@de0f # v6.0.2\n\n      - uses: actions/setup-node@53b8 # v6.3.0\n        with:\n          node-version: '24'\n\n      - uses: pnpm/action-setup@0977 # v6.0.10\n        with:\n          version: 11.25.0\n\n      - name: Install Socket CLI\n        run: pnpm add -g @socketsecurity/cli@1.1.156\n";

    #[test]
    fn setup_node_drops_stale_pin_and_pnpm_setup() {
        let (findings, out) = scan_workflow("w.yml", BRAVE, true);
        assert!(out.contains("      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: latest\n\n      - name: Install"), "{out}");
        assert!(!out.contains("v6.3.0") && !out.contains("pnpm"), "{out}");
        assert!(out.contains("checkout@de0f # v6.0.2"), "{out}");
        assert!(out.contains("run: bun add -g @socketsecurity/cli@1.1.156"), "{out}");
        assert!(findings.iter().any(|f| f.rule_id == "ci/pnpm-setup" && f.autofix));
    }

    #[test]
    fn pnpm_setup_kept_while_pnpm_commands_remain() {
        let src = "steps:\n  - uses: pnpm/action-setup@v4\n  - run: pnpm -w custom\n";
        let (findings, out) = scan_workflow("w.yml", src, true);
        assert!(out.contains("pnpm/action-setup@v4"), "{out}");
        assert!(findings.iter().any(|f| f.rule_id == "ci/pnpm-setup" && !f.autofix));
    }
}
