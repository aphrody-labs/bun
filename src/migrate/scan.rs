//! Reading one file: the findings of the rules that apply to it, and the text it has once the rewrites that the
//! options allow are applied.

use bun_core::strings;

use crate::bytes::LineIndex;
use crate::json::{self, Node};
use crate::regex::Regex;
use crate::registry::{JsonTest, Kind, Registry, Severity, TextRule};

pub struct Finding {
    pub file: Vec<u8>,
    pub line: u32,
    pub column: u32,
    pub rule: Vec<u8>,
    pub severity: Severity,
    pub message: Vec<u8>,
    pub original: Vec<u8>,
    pub replacement: Option<Vec<u8>>,
    /// A rewrite exists, with `--write` for the safe ones and with `--aggressive` for the others.
    pub fixable: bool,
    pub aggressive: bool,
    pub applied: bool,
    pub docs: Vec<u8>,
}

/// Which rewrites run.
#[derive(Clone, Copy)]
pub(crate) struct Apply {
    pub(crate) safe: bool,
    pub(crate) aggressive: bool,
}

pub(crate) struct Scanner<'a> {
    pub(crate) registry: &'a Registry,
    pub(crate) apply: Apply,
    pub(crate) builtins: Vec<&'static [u8]>,
    pub(crate) imports: Regex,
    overrides: Vec<(Vec<u8>, Option<Severity>)>,
}

/// What the report needs to know of a `package.json`.
pub(crate) struct Manifest {
    pub(crate) path: Vec<u8>,
    pub(crate) name: Vec<u8>,
    pub(crate) scripts: Vec<Vec<u8>>,
    pub(crate) workspaces: Vec<Vec<u8>>,
    pub(crate) package_manager: Vec<u8>,
    /// Dependency name and range of every kind of dependency.
    pub(crate) dependencies: Vec<(Vec<u8>, Vec<u8>)>,
}

pub(crate) struct Edit {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) replacement: Vec<u8>,
}

const MAX_SHOWN: usize = 120;

impl<'a> Scanner<'a> {
    pub(crate) fn new(registry: &'a Registry, apply: Apply, overrides: &[(Vec<u8>, Option<Severity>)]) -> Scanner<'a> {
        let builtins = bun_resolve_builtins::node_builtins::NODE_BUILTIN_PATTERNS_RAW
            .iter()
            .copied()
            .filter(|name| !name.starts_with(b"_") && *name != b"test")
            .collect();
        let imports = Regex::new(br"(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|^\s*import\s+)([\x22\x27])([^\x22\x27\n]+)\1", b"m")
            .unwrap_or_else(|_| unreachable!("the import pattern is valid"));
        Scanner { registry, apply, builtins, imports, overrides: overrides.to_vec() }
    }

    /// The severity of a rule that the code defines, or `None` if an override turned it off.
    fn severity(&self, id: &[u8], default: Severity) -> Option<Severity> {
        let mut level = Some(default);
        for (name, wanted) in &self.overrides {
            if crate::registry::overrides_match(name, id) {
                level = *wanted;
            }
        }
        level
    }

    fn applicable(&self, rule: &TextRule) -> bool {
        rule.replace.is_some() && rule.autofix && if rule.aggressive { self.apply.aggressive } else { self.apply.safe }
    }

    /// Runs the text rules that apply to the file. Each rule reads what the rules before it left. Returns the new text,
    /// or `None` if no rewrite applied. `at` overrides the position of the findings, for text inside a JSON string.
    pub(crate) fn rewrite_text(&self, kind: Option<Kind>, path: &[u8], text: &[u8], at: Option<(u32, u32)>, findings: &mut Vec<Finding>) -> Option<Vec<u8>> {
        let mut current: Option<Vec<u8>> = None;
        for rule in &self.registry.text {
            if !rule.applies_to(kind, path) {
                continue;
            }
            let view = current.as_deref().unwrap_or(text);
            if rule.requires.as_ref().is_some_and(|requires| !requires.is_match(view))
                || rule.unless.as_ref().is_some_and(|unless| unless.is_match(view))
                || rule.import_from.as_ref().is_some_and(|import| !import.is_match(view))
            {
                continue;
            }
            let matches = rule.pattern.find_all(view);
            if matches.is_empty() {
                continue;
            }
            let comments = if kind == Some(Kind::Source) { comment_ranges(view) } else { Vec::new() };
            let lines = LineIndex::new(view);
            let apply = self.applicable(rule);
            let mut next = Vec::with_capacity(view.len());
            let mut copied = 0;
            for found in &matches {
                let (start, end) = found.range();
                if comments.iter().any(|&(from, to)| start >= from && start < to) {
                    continue;
                }
                let mut replacement = Vec::new();
                if let Some(template) = &rule.replace {
                    found.expand(template, view, &mut replacement);
                }
                let (line, column) = at.unwrap_or_else(|| lines.locate(start));
                findings.push(Finding {
                    file: path.to_vec(),
                    line,
                    column,
                    rule: rule.id.clone(),
                    severity: rule.severity,
                    message: rule.message.clone(),
                    original: shown(&view[start..end]),
                    replacement: rule.replace.is_some().then(|| shown(&replacement)),
                    fixable: rule.replace.is_some() && rule.autofix,
                    aggressive: rule.aggressive,
                    applied: apply,
                    docs: rule.docs.clone(),
                });
                if apply {
                    next.extend_from_slice(&view[copied..start]);
                    next.extend_from_slice(&replacement);
                    copied = end;
                }
            }
            if apply && copied > 0 {
                next.extend_from_slice(&view[copied..]);
                current = Some(next);
            }
        }
        current
    }

    /// A JavaScript or TypeScript source: the text rules and the imports.
    pub(crate) fn scan_source(&self, path: &[u8], text: &[u8], findings: &mut Vec<Finding>) -> Option<Vec<u8>> {
        let mut current = self.rewrite_text(Some(Kind::Source), path, text, None, findings);
        let view = current.as_deref().unwrap_or(text);
        let comments = comment_ranges(view);
        let lines = LineIndex::new(view);
        let mut edits = Vec::new();
        for found in self.imports.find_all(view) {
            let Some((start, end)) = found.group_range(2) else { continue };
            if comments.iter().any(|&(from, to)| start >= from && start < to) {
                continue;
            }
            let specifier = &view[start..end];
            let (line, column) = lines.locate(start);
            let package = package_name(specifier);
            if !specifier.starts_with(b"node:") && self.builtins.iter().any(|name| *name == package_of_builtin(specifier)) {
                let Some(severity) = self.severity(b"imports/node-prefix", Severity::Warn) else { continue };
                let apply = self.apply.safe;
                findings.push(Finding {
                    file: path.to_vec(),
                    line,
                    column,
                    rule: b"imports/node-prefix".to_vec(),
                    severity,
                    message: b"Node.js core modules are imported with the node: prefix".to_vec(),
                    original: shown(specifier),
                    replacement: Some([&b"node:"[..], specifier].concat()),
                    fixable: true,
                    aggressive: false,
                    applied: apply,
                    docs: Vec::new(),
                });
                if apply {
                    edits.push(Edit { start, end: start, replacement: b"node:".to_vec() });
                }
            } else if let Some(rule) = self.registry.packages.iter().find(|rule| rule.packages.iter().any(|name| name == package)) {
                findings.extend(self.severity(&rule.id, Severity::Info).map(|severity| replacement_finding(path, line, column, rule, package, severity)));
            }
        }
        if !edits.is_empty() {
            current = Some(apply_edits(view, edits));
        }
        current
    }

    /// A `package.json`: its scripts, and which dependencies Bun covers.
    pub(crate) fn scan_manifest(&self, path: &[u8], text: &[u8], findings: &mut Vec<Finding>, manifests: &mut Vec<Manifest>) -> Option<Vec<u8>> {
        let root = match json::parse(text) {
            Ok(root) => root,
            Err(json::SyntaxError(offset)) => {
                let (line, column) = LineIndex::new(text).locate(offset);
                findings.push(Finding {
                    file: path.to_vec(),
                    line,
                    column,
                    rule: b"manifest/syntax".to_vec(),
                    severity: Severity::Error,
                    message: b"package.json is not valid JSON".to_vec(),
                    original: Vec::new(),
                    replacement: None,
                    fixable: false,
                    aggressive: false,
                    applied: false,
                    docs: Vec::new(),
                });
                return None;
            }
        };
        let lines = LineIndex::new(text);
        let mut edits = Vec::new();
        let mut manifest = Manifest {
            path: path.to_vec(),
            name: root.get(b"name").and_then(Node::as_str).unwrap_or(b"").to_vec(),
            scripts: Vec::new(),
            workspaces: Vec::new(),
            package_manager: root.get(b"packageManager").and_then(Node::as_str).unwrap_or(b"").to_vec(),
            dependencies: Vec::new(),
        };
        if let Some(workspaces) = root.get(b"workspaces") {
            let list = if workspaces.items().is_empty() { workspaces.get(b"packages").map_or_else(Vec::new, Node::strings) } else { workspaces.strings() };
            manifest.workspaces = list.into_iter().map(<[u8]>::to_vec).collect();
        }
        if let Some(scripts) = root.get(b"scripts") {
            for script in scripts.members() {
                manifest.scripts.push(script.key.clone());
                let Some(command) = script.value.as_str() else { continue };
                let at = lines.locate(script.value.start);
                if let Some(rewritten) = self.rewrite_text(Some(Kind::Script), path, command, Some(at), findings) {
                    edits.push(Edit { start: script.value.start, end: script.value.end, replacement: json::quote(&rewritten) });
                }
            }
        }
        for section in [&b"dependencies"[..], b"devDependencies", b"optionalDependencies", b"peerDependencies"] {
            let Some(deps) = root.get(section) else { continue };
            for dep in deps.members() {
                manifest.dependencies.push((dep.key.clone(), dep.value.as_str().unwrap_or(b"").to_vec()));
                if let Some(rule) = self.registry.packages.iter().find(|rule| rule.packages.contains(&dep.key)) {
                    let (line, column) = lines.locate(dep.key_start);
                    findings.extend(self.severity(&rule.id, Severity::Info).map(|severity| replacement_finding(path, line, column, rule, &dep.key, severity)));
                }
            }
        }
        if !manifest.package_manager.is_empty() && let Some(severity) = self.severity(b"manifest/package-manager", Severity::Info) {
            let (line, column) = lines.locate(root.get(b"packageManager").map_or(0, |node| node.start));
            let apply = self.apply.aggressive;
            findings.push(Finding {
                file: path.to_vec(),
                line,
                column,
                rule: b"manifest/package-manager".to_vec(),
                severity,
                message: b"packageManager selects another package manager through Corepack".to_vec(),
                original: shown(&manifest.package_manager),
                replacement: Some(Vec::new()),
                fixable: true,
                aggressive: true,
                applied: apply,
                docs: Vec::new(),
            });
            if apply && let Some(index) = root.members().iter().position(|member| member.key == b"packageManager") {
                let (start, end) = json::member_span(&root, index);
                edits.push(Edit { start, end, replacement: Vec::new() });
            }
        }
        manifests.push(manifest);
        (!edits.is_empty()).then(|| apply_edits(text, edits))
    }

    /// The key checks of the registry on a JSON file such as `tsconfig.json`.
    pub(crate) fn check_json(&self, path: &[u8], text: &[u8], findings: &mut Vec<Finding>) {
        let rules: Vec<_> = self.registry.json.iter().filter(|rule| rule.applies_to(path)).collect();
        if rules.is_empty() {
            return;
        }
        let Ok(root) = json::parse(text) else { return };
        let lines = LineIndex::new(text);
        for rule in rules {
            let value = root.at_path(&rule.path);
            let hit = match (&rule.test, value) {
                (JsonTest::Absent, None) => Some(root.start),
                (JsonTest::Equals(options), Some(node)) => node.as_str().filter(|text| options.iter().any(|option| option.eq_ignore_ascii_case(text))).map(|_| node.start),
                (JsonTest::Items { has, lacks }, Some(node)) => {
                    let items = node.strings();
                    let all = !has.is_empty() && has.iter().all(|item| items.contains(&item.as_slice()));
                    let none = lacks.iter().all(|item| !items.contains(&item.as_slice()));
                    (all && none).then_some(node.start)
                }
                _ => None,
            };
            if let Some(offset) = hit {
                let (line, column) = lines.locate(offset);
                findings.push(Finding {
                    file: path.to_vec(),
                    line,
                    column,
                    rule: rule.id.clone(),
                    severity: rule.severity,
                    message: rule.message.clone(),
                    original: value.map(|node| shown(&text[node.start..node.end])).unwrap_or_default(),
                    replacement: None,
                    fixable: false,
                    aggressive: false,
                    applied: false,
                    docs: rule.docs.clone(),
                });
            }
        }
    }
}

fn replacement_finding(path: &[u8], line: u32, column: u32, rule: &crate::registry::PackageRule, package: &[u8], severity: Severity) -> Finding {
    Finding {
        file: path.to_vec(),
        line,
        column,
        rule: rule.id.clone(),
        severity,
        message: [&b"Bun covers this with "[..], &rule.replacement].concat(),
        original: package.to_vec(),
        replacement: None,
        fixable: false,
        aggressive: false,
        applied: false,
        docs: Vec::new(),
    }
}

/// The package of an import specifier: `@scope/name` or `name`, without a subpath.
pub(crate) fn package_name(specifier: &[u8]) -> &[u8] {
    let mut slashes = 0;
    let limit = if specifier.starts_with(b"@") { 2 } else { 1 };
    for (at, &byte) in specifier.iter().enumerate() {
        if byte == b'/' {
            slashes += 1;
            if slashes == limit {
                return &specifier[..at];
            }
        }
    }
    specifier
}

/// The first segment of a specifier: `fs` for `fs/promises`.
fn package_of_builtin(specifier: &[u8]) -> &[u8] {
    match strings::index_of_char_usize(specifier, b'/') {
        Some(at) => &specifier[..at],
        None => specifier,
    }
}

fn shown(text: &[u8]) -> Vec<u8> {
    text[..text.len().min(MAX_SHOWN)].to_vec()
}

/// Applies edits whose spans do not overlap, except cuts, which merge.
pub(crate) fn apply_edits(text: &[u8], mut edits: Vec<Edit>) -> Vec<u8> {
    edits.sort_by_key(|edit| (edit.start, edit.end));
    let mut out = Vec::with_capacity(text.len());
    let mut at = 0;
    let mut previous_cut_end: Option<usize> = None;
    for edit in edits {
        if edit.start < at {
            // An edit inside what an earlier edit replaced is dropped; two cuts that overlap become one.
            if edit.replacement.is_empty() && previous_cut_end.is_some() && edit.end > at {
                at = edit.end;
                previous_cut_end = Some(edit.end);
            }
            continue;
        }
        out.extend_from_slice(&text[at..edit.start]);
        out.extend_from_slice(&edit.replacement);
        at = edit.end;
        previous_cut_end = edit.replacement.is_empty().then_some(edit.end);
    }
    out.extend_from_slice(&text[at..]);
    out
}

/// The byte ranges of the comments of a JavaScript or TypeScript source. A string or template literal that holds `//`
/// is not a comment.
pub(crate) fn comment_ranges(text: &[u8]) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut at = 0;
    while at < text.len() {
        match text[at] {
            quote @ (b'"' | b'\'' | b'`') => {
                at += 1;
                while at < text.len() && text[at] != quote && !(quote != b'`' && text[at] == b'\n') {
                    at += if text[at] == b'\\' { 2 } else { 1 };
                }
                at += 1;
            }
            b'/' if text.get(at + 1) == Some(&b'/') => {
                let end = crate::bytes::line_end(text, at);
                ranges.push((at, end));
                at = end;
            }
            b'/' if text.get(at + 1) == Some(&b'*') => {
                let end = crate::bytes::find_from(text, b"*/", at + 2).map_or(text.len(), |close| close + 2);
                ranges.push((at, end));
                at = end;
            }
            _ => at += 1,
        }
    }
    ranges
}
