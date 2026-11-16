//! `--replace-packages`: source rewrites that remove a dependency Bun covers with a built-in.
//!
//! A rule rewrites a file only when every use of the package in it has a shape that the rule fully understands. Any
//! other use (a dynamic import, an alias, an option the built-in lacks, a result that is used) is reported and the file
//! stays as it is, because a half rewritten file does not run.

use bun_core::strings;

use crate::bytes::{LineIndex, find_from};
use crate::regex::Regex;
use crate::registry::Severity;
use crate::scan::{Finding, comment_ranges};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Rule {
    Execa,
    Glob,
    Rimraf,
    Del,
    RequireLike,
    Dotenv,
    NodeFetch,
    Ws,
}

struct Spec {
    rule: Rule,
    id: &'static str,
    packages: &'static [&'static str],
    to: &'static str,
}

const SPECS: [Spec; 8] = [
    Spec { rule: Rule::Execa, id: "replace/execa", packages: &["execa"], to: "Bun.$" },
    Spec { rule: Rule::Glob, id: "replace/glob", packages: &["glob", "fast-glob", "globby"], to: "Bun.Glob" },
    Spec { rule: Rule::Rimraf, id: "replace/rimraf", packages: &["rimraf"], to: "fs.rm" },
    Spec { rule: Rule::Del, id: "replace/del", packages: &["del"], to: "fs.rm and Bun.Glob" },
    Spec { rule: Rule::RequireLike, id: "replace/require-like", packages: &["require-like"], to: "module.createRequire" },
    Spec { rule: Rule::Dotenv, id: "replace/dotenv", packages: &["dotenv"], to: "the .env files that bun reads" },
    Spec { rule: Rule::NodeFetch, id: "replace/node-fetch", packages: &["node-fetch", "undici"], to: "the global fetch" },
    Spec { rule: Rule::Ws, id: "replace/ws", packages: &["ws"], to: "the global WebSocket" },
];

struct Binding {
    local: Vec<u8>,
    imported: Vec<u8>,
}

struct Statement {
    start: usize,
    end: usize,
    is_import: bool,
    spec: Vec<u8>,
    bindings: Vec<Binding>,
    bad: Option<String>,
}

struct Call {
    callee: Vec<u8>,
    args: Vec<Vec<u8>>,
    start: usize,
    end: usize,
}

struct Need {
    module: &'static str,
    name: &'static str,
    alias: &'static str,
}

struct Edit {
    start: usize,
    end: usize,
    replacement: Vec<u8>,
}

/// What one rule did to one file.
struct Outcome {
    edits: Vec<Edit>,
    rewritten: usize,
    manual: Vec<(usize, String)>,
}

/// The result for a file: its new text, if it changed, and the packages it no longer mentions.
pub(crate) struct Replaced {
    pub(crate) text: Option<Vec<u8>>,
    pub(crate) gone: Vec<&'static str>,
}

/// The packages of the rules that `text` still names in a quoted specifier.
pub(crate) fn still_mentioned(text: &[u8]) -> Vec<&'static str> {
    SPECS.iter().flat_map(|spec| spec.packages.iter().copied()).filter(|package| mentions(text, package)).collect()
}

/// Whether `text` mentions one of the packages in a quoted specifier, which is what makes the rules worth running.
pub(crate) fn mentions_any(text: &[u8]) -> bool {
    SPECS.iter().flat_map(|spec| spec.packages).any(|package| mentions(text, package))
}

pub(crate) fn mentions(text: &[u8], package: &str) -> bool {
    quoted(package).is_some_and(|pattern| pattern.is_match(text))
}

fn quoted(package: &str) -> Option<Regex> {
    Regex::new(format!("[\\x22\\x27]{}(?:/[\\w./-]*)?[\\x22\\x27]", escape(package)).as_bytes(), b"").ok()
}

fn escape(text: &str) -> String {
    text.chars().map(|ch| if ch.is_ascii_alphanumeric() || ch == '_' { ch.to_string() } else { format!("\\{ch}") }).collect()
}

/// Rewrites one source file. `major` gives the major version of a package that the owning package.json asks for.
pub(crate) fn rewrite(path: &[u8], text: &[u8], major: &dyn Fn(&str) -> Option<u32>, findings: &mut Vec<Finding>) -> Replaced {
    let mut current = text.to_vec();
    let mut gone = Vec::new();
    for spec in &SPECS {
        if !spec.packages.iter().any(|package| mentions(&current, package)) {
            continue;
        }
        let statements = find_statements(&current, spec.packages);
        let mut outcome = Outcome { edits: Vec::new(), rewritten: 0, manual: Vec::new() };
        apply_rule(spec, &current, &statements, major, &mut outcome);
        // A package named in a form that no statement covers, such as a dynamic import, keeps the dependency alive.
        let covered = statements.iter().filter(|statement| spec.packages.iter().any(|package| statement.spec == *package || statement.spec.starts_with(&[package.as_bytes(), b"/"].concat()))).count();
        let mentioned: usize = spec.packages.iter().filter_map(|package| quoted(package)).map(|pattern| pattern.find_all(&current).len()).sum();
        let stray = mentioned > covered + dotenv_inline(spec.rule, &current);
        if stray && let Some(at) = first_outside(spec.packages, &current, &statements) {
            outcome.manual.push((at, "the package is used in a form that is not rewritten".to_string()));
        }
        let lines = LineIndex::new(&current);
        let blocked = !outcome.manual.is_empty();
        for (at, reason) in &outcome.manual {
            let (line, column) = lines.locate(*at);
            findings.push(report(path, line, column, spec, reason.as_bytes(), false));
        }
        if spec.rule == Rule::Del {
            continue;
        }
        if blocked || outcome.edits.is_empty() {
            continue;
        }
        let (line, column) = lines.locate(outcome.edits.iter().map(|edit| edit.start).min().unwrap_or(0));
        let message = format!("{} use(s) replaced by {}", outcome.rewritten.max(1), spec.to);
        findings.push(report(path, line, column, spec, message.as_bytes(), true));
        let mut edits = outcome.edits;
        edits.sort_by_key(|edit| edit.start);
        let mut next = Vec::with_capacity(current.len());
        let mut at = 0;
        for edit in edits {
            if edit.start < at {
                continue;
            }
            next.extend_from_slice(&current[at..edit.start]);
            next.extend_from_slice(&edit.replacement);
            at = edit.end;
        }
        next.extend_from_slice(&current[at..]);
        current = next;
        gone.extend(spec.packages.iter().copied().filter(|package| !mentions(&current, package) && mentions(text, package)));
    }
    Replaced { text: (current != text).then_some(current), gone }
}

fn report(path: &[u8], line: u32, column: u32, spec: &Spec, message: &[u8], applied: bool) -> Finding {
    Finding {
        file: path.to_vec(),
        line,
        column,
        rule: spec.id.as_bytes().to_vec(),
        severity: if applied { Severity::Info } else { Severity::Warn },
        message: message.to_vec(),
        original: Vec::new(),
        replacement: None,
        fixable: applied,
        aggressive: false,
        applied,
        docs: Vec::new(),
    }
}

fn dotenv_inline(rule: Rule, text: &[u8]) -> usize {
    if rule != Rule::Dotenv {
        return 0;
    }
    Regex::new(br"require\(\s*[\x22\x27]dotenv(?:/config)?[\x22\x27]\s*\)", b"").map_or(0, |pattern| pattern.find_all(text).len())
}

fn first_outside(packages: &[&str], text: &[u8], statements: &[Statement]) -> Option<usize> {
    packages.iter().filter_map(|package| quoted(package)).flat_map(|pattern| pattern.find_all(text)).map(|found| found.range().0).filter(|at| !statements.iter().any(|statement| *at >= statement.start && *at < statement.end)).min()
}

fn apply_rule(spec: &Spec, text: &[u8], statements: &[Statement], major: &dyn Fn(&str) -> Option<u32>, outcome: &mut Outcome) {
    match spec.rule {
        Rule::Del => statements.iter().for_each(|statement| outcome.manual.push((statement.start, "del takes globs: replace it with fs.rm or Bun.Glob by hand".to_string()))),
        Rule::Dotenv => {
            call_rule(text, statements, outcome, |call, binding, text| {
                if call.callee != [&binding.local[..], b".config"].concat() || !call.args.is_empty() {
                    return Err("dotenv with options".to_string());
                }
                match standalone(text, call) {
                    Some((start, end)) => Ok(Handled { span: Some((start, end)), replacement: Vec::new(), need: None }),
                    None => Err("config() result is used".to_string()),
                }
            }, |spec| spec == b"dotenv/config");
            if let Ok(inline) = Regex::new(br"^[ \t]*require\(\s*[\x22\x27]dotenv(?:/config)?[\x22\x27]\s*\)(\.config\(\s*\))?;?[ \t]*\r?\n?", b"m") {
                for found in inline.find_all(text) {
                    let (start, end) = found.range();
                    outcome.edits.push(Edit { start, end, replacement: Vec::new() });
                    outcome.rewritten += 1;
                }
            }
        }
        Rule::NodeFetch => {
            let unsafe_use = Regex::new(br"\.buffer\(\)|\bagent\s*:|\.body\.pipe\(|\bcompress\s*:|\bfollow\s*:|\bsize\s*:|\.textConverted\(|\bAbortError\b|\bFetchError\b|\bdispatcher\s*:", b"");
            for statement in statements {
                if let Some(bad) = &statement.bad {
                    outcome.manual.push((statement.start, format!("{bad}: {}", String::from_utf8_lossy(&statement.spec))));
                    continue;
                }
                let globals: [&[u8]; 5] = [b"fetch", b"Headers", b"Request", b"Response", b"FormData"];
                let bad = statement.bindings.iter().find(|binding| {
                    binding.local.is_empty()
                        || if binding.imported == b"default" { binding.local != b"fetch" || statement.spec == b"undici" } else { !globals.contains(&binding.imported.as_slice()) || binding.local != binding.imported }
                });
                if statement.bindings.is_empty() || bad.is_some() {
                    outcome.manual.push((statement.start, "an import has no global equivalent".to_string()));
                    continue;
                }
                if let Some(found) = unsafe_use.as_ref().ok().and_then(|pattern| pattern.find_at(text, 0)) {
                    outcome.manual.push((found.range().0, "an API that only node-fetch and undici have".to_string()));
                    continue;
                }
                outcome.edits.push(Edit { start: statement.start, end: statement.end, replacement: Vec::new() });
                outcome.rewritten += 1;
            }
        }
        Rule::Ws => {
            let server_only = Regex::new(br"WebSocketServer|\bServer\b|\.(?:on|once|off|ping|pong|terminate|removeListener|removeAllListeners)\(|new WebSocket\([^()]*,", b"");
            for statement in statements {
                if let Some(bad) = &statement.bad {
                    outcome.manual.push((statement.start, bad.clone()));
                    continue;
                }
                let wrong = statement.bindings.is_empty() || statement.bindings.iter().any(|binding| binding.local != b"WebSocket" || (binding.imported != b"default" && binding.imported != b"WebSocket"));
                let found = server_only.as_ref().ok().and_then(|pattern| pattern.find_at(text, 0));
                if wrong || found.is_some() {
                    outcome.manual.push((statement.start, "ws is used beyond the client of the global WebSocket".to_string()));
                    continue;
                }
                outcome.edits.push(Edit { start: statement.start, end: statement.end, replacement: Vec::new() });
                outcome.rewritten += 1;
            }
        }
        Rule::Execa => call_rule(text, statements, outcome, execa, |_| false),
        Rule::Glob => call_rule(text, statements, outcome, glob, |_| false),
        Rule::Rimraf => call_rule(text, statements, outcome, |call, binding, text| rimraf(call, binding, text, major("rimraf")), |_| false),
        Rule::RequireLike => call_rule(text, statements, outcome, require_like, |_| false),
    }
}

struct Handled {
    /// The span to replace, when it is not the call.
    span: Option<(usize, usize)>,
    replacement: Vec<u8>,
    need: Option<Need>,
}

/// Every use of every binding must be a call that `handle` rewrites, or nothing changes.
fn call_rule(text: &[u8], statements: &[Statement], outcome: &mut Outcome, handle: impl Fn(&Call, &Binding, &[u8]) -> Result<Handled, String>, side_effect: impl Fn(&[u8]) -> bool) {
    for statement in statements {
        let real: Vec<&Binding> = statement.bindings.iter().filter(|binding| !binding.local.is_empty()).collect();
        if let Some(bad) = &statement.bad {
            outcome.manual.push((statement.start, format!("{bad}: {}", String::from_utf8_lossy(&statement.spec))));
            continue;
        }
        if real.is_empty() {
            if side_effect(&statement.spec) {
                outcome.edits.push(Edit { start: statement.start, end: statement.end, replacement: Vec::new() });
                outcome.rewritten += 1;
            } else {
                outcome.manual.push((statement.start, format!("a side-effect import of {}", String::from_utf8_lossy(&statement.spec))));
            }
            continue;
        }
        let locals: Vec<&[u8]> = real.iter().map(|binding| binding.local.as_slice()).collect();
        let calls = calls_for(text, &locals);
        let mut local_edits = Vec::new();
        let mut needs: Vec<Need> = Vec::new();
        let mut ok = true;
        let mut seen = Vec::new();
        for call in &calls {
            let head = call.callee.split(|&byte| byte == b'.').next().unwrap_or(b"");
            let Some(binding) = real.iter().find(|binding| binding.local == head) else { continue };
            seen.push(call.start);
            match handle(call, binding, text) {
                Ok(handled) => {
                    let (start, end) = handled.span.unwrap_or((call.start, call.end));
                    local_edits.push(Edit { start, end, replacement: handled.replacement });
                    needs.extend(handled.need);
                }
                Err(reason) => {
                    outcome.manual.push((call.start, reason));
                    ok = false;
                }
            }
        }
        for binding in &real {
            for at in occurrences(text, statements, &binding.local) {
                if !seen.contains(&at) {
                    outcome.manual.push((at, format!("{} is used outside a supported call", String::from_utf8_lossy(&binding.local))));
                    ok = false;
                }
            }
        }
        if !ok {
            continue;
        }
        local_edits.sort_by_key(|edit| edit.start);
        if local_edits.windows(2).any(|pair| pair[1].start < pair[0].end) {
            outcome.manual.push((statement.start, "calls are nested".to_string()));
            continue;
        }
        let mut lines = Vec::new();
        for need in needs.iter().fold(Vec::<&Need>::new(), |mut unique, need| {
            if !unique.iter().any(|known| known.alias == need.alias) {
                unique.push(need);
            }
            unique
        }) {
            lines.push(if statement.is_import {
                format!("import {{ {}{} }} from \"{}\";\n", need.name, if need.alias == need.name { String::new() } else { format!(" as {}", need.alias) }, need.module)
            } else {
                format!("const {{ {}{} }} = require(\"{}\");\n", need.name, if need.alias == need.name { String::new() } else { format!(": {}", need.alias) }, need.module)
            });
        }
        outcome.rewritten += calls.len().max(1);
        outcome.edits.extend(local_edits);
        outcome.edits.push(Edit { start: statement.start, end: statement.end, replacement: lines.concat().into_bytes() });
    }
}

const SIMPLE: &str = "[\\w@%+=:,./-]+";

fn literal(arg: Option<&Vec<u8>>) -> Option<&[u8]> {
    let arg = arg?;
    let (first, rest) = arg.split_first()?;
    let inner = rest.strip_suffix(core::slice::from_ref(first))?;
    (matches!(first, b'\'' | b'"') && !inner.contains(first) && !inner.contains(&b'\\')).then_some(inner)
}

fn is_simple(text: &[u8]) -> bool {
    Regex::new(format!("^{SIMPLE}$").as_bytes(), b"").is_ok_and(|pattern| pattern.is_match(text))
}

fn execa(call: &Call, binding: &Binding, text: &[u8]) -> Result<Handled, String> {
    if binding.imported != b"execa" && binding.imported != b"default" {
        return Err(format!("execa.{} is not supported", String::from_utf8_lossy(&binding.imported)));
    }
    if call.callee != binding.local {
        return Err("only the plain execa() form is supported".to_string());
    }
    let before = &text[..call.start];
    let line_start = line_start_of(before, before.len());
    let lead = &before[line_start..];
    let awaited = lead.trim_ascii_end().ends_with(b"await") && lead.trim_ascii_end()[..lead.trim_ascii_end().len() - 5].iter().all(|byte| byte.is_ascii_whitespace());
    let statement_end = standalone_tail(text, call.end);
    if !awaited || statement_end.is_none() {
        return Err("the result of execa is used, or it is not a statement".to_string());
    }
    let Some(command) = literal(call.args.first()).filter(|command| is_simple(command)) else {
        return Err("the command is not a plain literal".to_string());
    };
    let mut parts = vec![command.to_vec()];
    if let Some(args) = call.args.get(1) {
        let inner = args.strip_prefix(b"[").and_then(|rest| rest.strip_suffix(b"]")).ok_or("the arguments are not a literal array")?;
        for item in split_top(inner) {
            let item = item.to_vec();
            match literal(Some(&item)).filter(|value| is_simple(value)) {
                Some(value) => parts.push(value.to_vec()),
                None => return Err("the arguments are not plain literals".to_string()),
            }
        }
    }
    let mut quiet = true;
    if let Some(options) = call.args.get(2) {
        let inherit = Regex::new(br"^\{\s*stdio\s*:\s*([\x22\x27])inherit\1\s*,?\s*\}$", b"").map_err(|_| "unsupported execa options")?;
        if call.args.len() > 3 || !inherit.is_match(options) {
            return Err("unsupported execa options".to_string());
        }
        quiet = false;
    }
    let await_at = line_start + lead.len() - lead.trim_ascii_start().len();
    let line = parts.join(&b' ');
    let mut replacement = b"await Bun.$`".to_vec();
    replacement.extend_from_slice(&line);
    replacement.push(b'`');
    if quiet {
        replacement.extend_from_slice(b".quiet()");
    }
    Ok(Handled { span: Some((await_at, call.end)), replacement, need: None })
}

fn glob(call: &Call, binding: &Binding, _text: &[u8]) -> Result<Handled, String> {
    let fast = binding.imported == b"fast-glob";
    let name = &call.callee[binding.local.len()..];
    let kind = match (name, binding.imported.as_slice()) {
        (b"", b"globSync") => "sync",
        (b"", _) => "async",
        (b".sync", _) => "sync",
        (b".async", _) | (b".glob", _) => "async",
        _ => return Err("an unsupported glob member".to_string()),
    };
    if call.args.is_empty() || call.args.len() > 2 {
        return Err("a callback or extra arguments".to_string());
    }
    let pattern = &call.args[0];
    if pattern.starts_with(b"[") || pattern.starts_with(b"...") {
        return Err("an array pattern".to_string());
    }
    let mut options: Vec<(Vec<u8>, Vec<u8>)> = Vec::new();
    if let Some(arg) = call.args.get(1) {
        let inner = arg.strip_prefix(b"{").and_then(|rest| rest.strip_suffix(b"}")).ok_or("unsupported glob options")?;
        for part in split_top(inner) {
            let (key, value) = match find_from(part, b":", 0) {
                Some(at) => (part[..at].trim_ascii(), part[at + 1..].trim_ascii()),
                None => (part.trim_ascii(), part.trim_ascii()),
            };
            let allowed: &[&[u8]] = if fast { &[b"cwd", b"dot", b"absolute"] } else { &[b"cwd", b"dot", b"absolute", b"nodir"] };
            if !allowed.contains(&key) {
                return Err("unsupported glob options".to_string());
            }
            options.push((key.to_vec(), value.to_vec()));
        }
    }
    let option = |name: &[u8]| options.iter().find(|(key, _)| key == name).map(|(_, value)| value.clone());
    let mut bun: Vec<String> = Vec::new();
    for key in [&b"cwd"[..], b"dot", b"absolute"] {
        if let Some(value) = option(key) {
            bun.push(format!("{}: {}", String::from_utf8_lossy(key), String::from_utf8_lossy(&value)));
        }
    }
    match option(b"nodir") {
        Some(value) if value != b"true" => return Err("nodir is not a literal true".to_string()),
        Some(_) => {}
        None if !fast => bun.push("onlyFiles: false".to_string()),
        None => {}
    }
    let opts = if bun.is_empty() { String::new() } else { format!("{{ {} }}", bun.join(", ")) };
    let pattern = String::from_utf8_lossy(pattern);
    let replacement = if kind == "sync" { format!("Array.from(new Bun.Glob({pattern}).scanSync({opts}))") } else { format!("Array.fromAsync(new Bun.Glob({pattern}).scan({opts}))") };
    Ok(Handled { span: None, replacement: replacement.into_bytes(), need: None })
}

fn rimraf(call: &Call, binding: &Binding, _text: &[u8], major: Option<u32>) -> Result<Handled, String> {
    let name = &call.callee[binding.local.len()..];
    let sync = match (name, binding.imported.as_slice()) {
        (b"", b"rimrafSync") | (b".sync", _) | (b".rimrafSync", _) => true,
        (b"", b"default" | b"rimraf") => false,
        _ => return Err("an unsupported rimraf form".to_string()),
    };
    if call.args.len() != 1 || call.args[0].starts_with(b"[") || call.args[0].starts_with(b"...") {
        return Err("options, a callback or an array argument".to_string());
    }
    match literal(call.args.first()) {
        Some(path) if path.iter().any(|byte| b"*?[]{}!".contains(byte)) => return Err("a glob pattern".to_string()),
        None if major.is_some_and(|major| major < 4) => return Err("rimraf before 4 expands globs in paths that are not literals".to_string()),
        _ => {}
    }
    let need = if sync { Need { module: "node:fs", name: "rmSync", alias: "fsRmSync" } } else { Need { module: "node:fs/promises", name: "rm", alias: "fsRm" } };
    let replacement = format!("{}({}, {{ recursive: true, force: true }})", need.alias, String::from_utf8_lossy(&call.args[0]));
    Ok(Handled { span: None, replacement: replacement.into_bytes(), need: Some(need) })
}

fn require_like(call: &Call, binding: &Binding, _text: &[u8]) -> Result<Handled, String> {
    if call.callee != binding.local || call.args.len() != 1 {
        return Err("requireLike with other arguments".to_string());
    }
    let absolute = Regex::new(br"^(?:__filename|import\.meta\.(?:filename|url)|fileURLToPath\(import\.meta\.url\)|(?:path\.)?(?:resolve|join)\([\s\S]*\))$", b"").map_err(|_| "invalid pattern")?;
    if !absolute.is_match(&call.args[0]) {
        return Err("the path may be relative".to_string());
    }
    let replacement = format!("createRequire({})", String::from_utf8_lossy(&call.args[0]));
    Ok(Handled { span: None, replacement: replacement.into_bytes(), need: Some(Need { module: "node:module", name: "createRequire", alias: "createRequire" }) })
}

fn line_start_of(text: &[u8], at: usize) -> usize {
    strings::last_index_of_char(&text[..at], b'\n').map_or(0, |newline| newline + 1)
}

/// The span of the line of a call that stands alone on it.
fn standalone(text: &[u8], call: &Call) -> Option<(usize, usize)> {
    let line_start = line_start_of(text, call.start);
    if !text[line_start..call.start].iter().all(|byte| byte.is_ascii_whitespace()) {
        return None;
    }
    standalone_tail(text, call.end).map(|end| (line_start, end))
}

/// The end of the statement that a call at `end` finishes, if nothing else is on its line.
fn standalone_tail(text: &[u8], end: usize) -> Option<usize> {
    let mut at = end;
    while matches!(text.get(at), Some(b' ' | b'\t')) {
        at += 1;
    }
    if text.get(at) == Some(&b';') {
        at += 1;
    }
    while matches!(text.get(at), Some(b' ' | b'\t')) {
        at += 1;
    }
    match text.get(at) {
        None => Some(at),
        Some(b'\r') if text.get(at + 1) == Some(&b'\n') => Some(at + 2),
        Some(b'\n') => Some(at + 1),
        _ => None,
    }
}

/// The index of the bracket that closes the one at `open`, skipping strings, templates and comments.
pub(crate) fn match_paren(text: &[u8], open: usize) -> Option<usize> {
    let mut stack = vec![close_of(text[open])?];
    let mut at = open + 1;
    while at < text.len() {
        let byte = text[at];
        match byte {
            b'\'' | b'"' => {
                at += 1;
                while at < text.len() && text[at] != byte {
                    at += if text[at] == b'\\' { 2 } else { 1 };
                }
            }
            b'`' => {
                at += 1;
                while at < text.len() && text[at] != b'`' {
                    if text[at] == b'\\' {
                        at += 1;
                    } else if text[at] == b'$' && text.get(at + 1) == Some(&b'{') {
                        at = match_paren(text, at + 1)?;
                    }
                    at += 1;
                }
            }
            b'/' if text.get(at + 1) == Some(&b'/') => at = crate::bytes::line_end(text, at),
            b'/' if text.get(at + 1) == Some(&b'*') => at = find_from(text, b"*/", at + 2).map_or(text.len(), |close| close + 1),
            b'(' | b'[' | b'{' => stack.push(close_of(byte)?),
            _ if Some(&byte) == stack.last() => {
                stack.pop();
                if stack.is_empty() {
                    return Some(at);
                }
            }
            _ => {}
        }
        at += 1;
    }
    None
}

fn close_of(open: u8) -> Option<u8> {
    match open {
        b'(' => Some(b')'),
        b'[' => Some(b']'),
        b'{' => Some(b'}'),
        _ => None,
    }
}

/// The top-level, comma separated parts of the inside of a call.
fn split_top(inner: &[u8]) -> Vec<&[u8]> {
    let mut parts = Vec::new();
    let mut from = 0;
    let mut at = 0;
    while at < inner.len() {
        match inner[at] {
            quote @ (b'\'' | b'"' | b'`') => {
                at += 1;
                while at < inner.len() && inner[at] != quote {
                    at += if inner[at] == b'\\' { 2 } else { 1 };
                }
            }
            b'(' | b'[' | b'{' => match match_paren(inner, at) {
                Some(close) => at = close,
                None => return vec![inner.trim_ascii()],
            },
            b',' => {
                parts.push(inner[from..at].trim_ascii());
                from = at + 1;
            }
            _ => {}
        }
        at += 1;
    }
    let last = inner[from.min(inner.len())..].trim_ascii();
    if !last.is_empty() {
        parts.push(last);
    }
    parts
}

fn calls_for(text: &[u8], locals: &[&[u8]]) -> Vec<Call> {
    let mut calls = Vec::new();
    for local in locals {
        let pattern = format!("(?<![.\\w$\\x27\\x22`]){}(\\.[\\w$]+)?\\s*\\(", escape(&String::from_utf8_lossy(local)));
        let Ok(regex) = Regex::new(pattern.as_bytes(), b"") else { continue };
        for found in regex.find_all(text) {
            let (start, end) = found.range();
            let open = end - 1;
            let Some(close) = match_paren(text, open) else { continue };
            let member = found.group(text, 1).unwrap_or(b"");
            calls.push(Call { callee: [local, member].concat(), args: split_top(&text[open + 1..close]).into_iter().map(<[u8]>::to_vec).collect(), start, end: close + 1 });
        }
    }
    calls.sort_by_key(|call| call.start);
    calls
}

/// Where `local` appears as an identifier outside the statements and not as a property.
fn occurrences(text: &[u8], statements: &[Statement], local: &[u8]) -> Vec<usize> {
    let mut blanked = text.to_vec();
    for statement in statements {
        blanked[statement.start..statement.end].fill(b' ');
    }
    let comments = comment_ranges(text);
    let pattern = format!("(?<![.\\w$\\x27\\x22`]){}(?![\\w$])", escape(&String::from_utf8_lossy(local)));
    let Ok(regex) = Regex::new(pattern.as_bytes(), b"") else { return Vec::new() };
    regex.find_all(&blanked).into_iter().map(|found| found.range().0).filter(|at| !comments.iter().any(|&(from, to)| *at >= from && *at < to)).collect()
}

fn find_statements(text: &[u8], packages: &[&str]) -> Vec<Statement> {
    let alternation = packages.iter().map(|package| escape(package)).collect::<Vec<_>>().join("|");
    let spec = |quote: usize| format!("([\\x22\\x27])((?:{alternation})(?:/[\\w./-]*)?)\\{quote}");
    let mut found = Vec::new();
    let import = format!("^[ \\t]*import\\s+(type\\s+)?([^\\x27\\x22;]*?)\\s*from\\s*{};?[ \\t]*\\r?\\n?", spec(3));
    if let Ok(regex) = Regex::new(import.as_bytes(), b"m") {
        for m in regex.find_all(text) {
            let (start, end) = m.range();
            let (bindings, bad) = parse_clause(m.group(text, 2).unwrap_or(b""));
            found.push(Statement { start, end, is_import: true, spec: m.group(text, 4).unwrap_or(b"").to_vec(), bindings, bad: if m.group(text, 1).is_some() { Some("a type-only import".to_string()) } else { bad } });
        }
    }
    let side_effect = format!("^[ \\t]*import\\s*{};?[ \\t]*\\r?\\n?", spec(1));
    if let Ok(regex) = Regex::new(side_effect.as_bytes(), b"m") {
        for m in regex.find_all(text) {
            let (start, end) = m.range();
            found.push(Statement { start, end, is_import: true, spec: m.group(text, 2).unwrap_or(b"").to_vec(), bindings: Vec::new(), bad: None });
        }
    }
    let require = format!("^[ \\t]*(?:const|let|var)\\s+([\\w$]+|\\{{[^}}]*\\}})\\s*=\\s*require\\(\\s*{}\\s*\\)(\\.[\\w$]+)?;?[ \\t]*\\r?\\n?", spec(2));
    if let Ok(regex) = Regex::new(require.as_bytes(), b"m") {
        for m in regex.find_all(text) {
            let (start, end) = m.range();
            let (mut bindings, mut bad) = parse_destructure(m.group(text, 1).unwrap_or(b"").trim_ascii());
            if let Some(member) = m.group(text, 4) {
                if bindings.len() == 1 && bindings[0].imported == b"default" {
                    bindings[0].imported = member[1..].to_vec();
                } else {
                    bad = Some("a require member".to_string());
                }
            }
            found.push(Statement { start, end, is_import: false, spec: m.group(text, 3).unwrap_or(b"").to_vec(), bindings, bad });
        }
    }
    found.sort_by_key(|statement| statement.start);
    found
}

fn is_identifier(text: &[u8]) -> bool {
    !text.is_empty() && !text[0].is_ascii_digit() && text.iter().all(|byte| byte.is_ascii_alphanumeric() || *byte == b'_' || *byte == b'$')
}

/// `fetch`, `{ a, b as c }` or `x, { y }` of an import.
fn parse_clause(clause: &[u8]) -> (Vec<Binding>, Option<String>) {
    let clause = clause.trim_ascii();
    let mut bindings = Vec::new();
    if clause.starts_with(b"*") {
        return (Vec::new(), Some("a namespace import".to_string()));
    }
    let mut rest = clause;
    if !rest.starts_with(b"{") {
        let end = rest.iter().take_while(|byte| byte.is_ascii_alphanumeric() || **byte == b'_' || **byte == b'$').count();
        if end == 0 {
            return (bindings, Some("an import clause".to_string()));
        }
        bindings.push(Binding { local: rest[..end].to_vec(), imported: b"default".to_vec() });
        rest = rest[end..].trim_ascii_start();
        rest = rest.strip_prefix(b",").unwrap_or(rest).trim_ascii_start();
    }
    if let Some(named) = rest.strip_prefix(b"{").and_then(|inner| inner.strip_suffix(b"}")) {
        for part in split_top(named) {
            let words: Vec<&[u8]> = part.split(|byte| byte.is_ascii_whitespace()).filter(|word| !word.is_empty()).collect();
            match words.as_slice() {
                [name] if is_identifier(name) => bindings.push(Binding { local: name.to_vec(), imported: name.to_vec() }),
                [name, b"as", local] if is_identifier(name) && is_identifier(local) => bindings.push(Binding { local: local.to_vec(), imported: name.to_vec() }),
                _ => return (bindings, Some("a specifier that is not plain".to_string())),
            }
        }
    } else if !rest.is_empty() {
        return (bindings, Some("an import clause".to_string()));
    }
    (bindings, None)
}

/// `x` or `{ a, b: c }` of a require.
fn parse_destructure(left: &[u8]) -> (Vec<Binding>, Option<String>) {
    let Some(inner) = left.strip_prefix(b"{").and_then(|rest| rest.strip_suffix(b"}")) else {
        return (vec![Binding { local: left.to_vec(), imported: b"default".to_vec() }], None);
    };
    let mut bindings = Vec::new();
    for part in split_top(inner) {
        let (name, local) = match find_from(part, b":", 0) {
            Some(at) => (part[..at].trim_ascii(), part[at + 1..].trim_ascii()),
            None => (part, part),
        };
        if !is_identifier(name) || !is_identifier(local) {
            return (bindings, Some("a pattern that is not plain".to_string()));
        }
        bindings.push(Binding { local: local.to_vec(), imported: name.to_vec() });
    }
    (bindings, None)
}
