// SPDX-License-Identifier: Apache-2.0
// Port of Aphrody workspace code-edit literal/regex semantics; native handles replace rg/sd subprocesses.

use std::{collections::BTreeMap, sync::atomic::AtomicBool};

use regex::{Regex, RegexBuilder};
use serde::Serialize;
use serde_json::{Value, json};

use super::{Budget, Sandbox, charge, scan};
use crate::{EditKind, EditRule, Limits, Matcher, Result, Selection, WorkspaceError, check_cancel};

#[derive(Serialize)]
struct FileEdit {
    path: std::path::PathBuf,
    before_hash: String,
    after_hash: String,
    matches: usize,
    locations: Vec<MatchLocation>,
    changed: bool,
    applied: bool,
}

#[derive(Serialize)]
struct MatchLocation {
    start: usize,
    end: usize,
    line: usize,
    column: usize,
}

enum Pattern<'a> {
    Text(&'a str),
    Regex(Regex),
}

fn pattern(rule: &EditRule) -> Result<Pattern<'_>> {
    Ok(match rule.matcher {
        Matcher::Text => Pattern::Text(&rule.find),
        Matcher::Regex => Pattern::Regex(
            RegexBuilder::new(&rule.find)
                .size_limit(4 * 1024 * 1024)
                .dfa_size_limit(4 * 1024 * 1024)
                .build()?,
        ),
    })
}

fn append(output: &mut String, text: &str, limit: usize) -> Result<()> {
    if output
        .len()
        .checked_add(text.len())
        .is_none_or(|size| size > limit)
    {
        return Err(WorkspaceError::Limit("edited file bytes"));
    }
    output.push_str(text);
    Ok(())
}

fn transform(
    content: &str,
    pattern: &Pattern<'_>,
    rule: &EditRule,
    limits: &Limits,
    budget: &Budget,
    cancel: &AtomicBool,
) -> Result<(String, Vec<MatchLocation>)> {
    let mut output = String::with_capacity(content.len());
    let mut locations = Vec::new();
    let mut end = 0;
    let mut line = 1;
    let mut column = 1;
    let mut scanned = 0;
    let mut matched = |start: usize, stop: usize, replacement: &str| -> Result<()> {
        check_cancel(cancel)?;
        charge(&budget.matches, 1, limits.max_matches, "matches")?;
        for character in content[scanned..start].chars() {
            if character == '\n' {
                line += 1;
                column = 1;
            } else {
                column += 1;
            }
        }
        scanned = start;
        locations.push(MatchLocation {
            start,
            end: stop,
            line,
            column,
        });
        append(&mut output, &content[end..start], limits.max_file_bytes)?;
        let original = &content[start..stop];
        match rule.kind {
            EditKind::Search => append(&mut output, original, limits.max_file_bytes)?,
            EditKind::Replace => append(&mut output, replacement, limits.max_file_bytes)?,
            EditKind::AddBefore => {
                append(&mut output, &rule.replacement, limits.max_file_bytes)?;
                append(&mut output, original, limits.max_file_bytes)?;
            }
            EditKind::AddAfter => {
                append(&mut output, original, limits.max_file_bytes)?;
                append(&mut output, &rule.replacement, limits.max_file_bytes)?;
            }
            EditKind::Remove => {}
        }
        end = stop;
        Ok(())
    };
    match pattern {
        Pattern::Text(find) => {
            for (start, text) in content.match_indices(find) {
                matched(start, start + text.len(), &rule.replacement)?;
            }
        }
        Pattern::Regex(regex) => {
            for captures in regex.captures_iter(content) {
                let Some(full) = captures.get(0) else {
                    continue;
                };
                let mut replacement = String::new();
                if rule.kind == EditKind::Replace {
                    // Cap capture expansion before Regex::expand can duplicate a large match many times.
                    replacement =
                        expand_replacement(&captures, &rule.replacement, limits.max_file_bytes)?;
                }
                matched(full.start(), full.end(), &replacement)?;
            }
        }
    }
    append(&mut output, &content[end..], limits.max_file_bytes)?;
    Ok((output, locations))
}

fn expand_replacement(
    captures: &regex::Captures<'_>,
    replacement: &str,
    limit: usize,
) -> Result<String> {
    let mut output = String::new();
    let mut input = replacement;
    while let Some(dollar) = input.find('$') {
        append(&mut output, &input[..dollar], limit)?;
        input = &input[dollar + 1..];
        if let Some(tail) = input.strip_prefix('$') {
            append(&mut output, "$", limit)?;
            input = tail;
            continue;
        }
        let (name, rest) = if let Some(braced) = input.strip_prefix('{') {
            if let Some(end) = braced.find('}') {
                (&braced[..end], &braced[end + 1..])
            } else {
                append(&mut output, "$", limit)?;
                continue;
            }
        } else {
            let end = input
                .find(|c: char| !c.is_ascii_alphanumeric() && c != '_')
                .unwrap_or(input.len());
            if end == 0 {
                append(&mut output, "$", limit)?;
                continue;
            }
            (&input[..end], &input[end..])
        };
        let matched = if let Ok(index) = name.parse::<usize>() {
            captures.get(index)
        } else {
            captures.name(name)
        };
        if let Some(matched) = matched {
            append(&mut output, matched.as_str(), limit)?;
        }
        input = rest;
    }
    append(&mut output, input, limit)?;
    Ok(output)
}

pub(super) fn edit(
    sandbox: &Sandbox,
    selection: &Selection,
    rule: &EditRule,
    apply: bool,
    expected: &BTreeMap<String, String>,
    limits: &Limits,
    budget: &Budget,
    cancel: &AtomicBool,
) -> Result<Value> {
    let pattern = pattern(rule)?;
    let paths = scan::paths(sandbox, selection, limits, budget, cancel)?;
    let mut records = Vec::new();
    let mut skipped_binary = 0;
    let mut prepared = Vec::new();
    let mut prepared_bytes = 0_usize;
    let mut verification_bytes = 0_usize;
    for path in paths {
        check_cancel(cancel)?;
        let target = sandbox.target(&path)?;
        let read = target.read(limits, budget, cancel)?;
        let Ok(content) = std::str::from_utf8(&read.bytes) else {
            skipped_binary += 1;
            continue;
        };
        if content.contains('\0') {
            skipped_binary += 1;
            continue;
        }
        let (output, locations) = transform(content, &pattern, rule, limits, budget, cancel)?;
        let matches = locations.len();
        if matches == 0 {
            continue;
        }
        let changed = output.as_bytes() != read.bytes;
        let after_hash = blake3::hash(output.as_bytes()).to_hex().to_string();
        let before_hash = read.hash.clone();
        let index = records.len();
        records.push(FileEdit {
            path: path.clone(),
            after_hash,
            before_hash,
            matches,
            locations,
            changed,
            applied: false,
        });
        if apply && changed {
            let key = path
                .to_str()
                .ok_or_else(|| WorkspaceError::Invalid("apply paths must be UTF-8".into()))?;
            if expected
                .get(key)
                .is_none_or(|hash| !hash.eq_ignore_ascii_case(&read.hash))
            {
                return Err(WorkspaceError::Conflict(path.display().to_string()));
            }
            prepared_bytes = prepared_bytes
                .checked_add(output.len() + read.bytes.len())
                .filter(|size| *size <= limits.max_source_bytes)
                .ok_or(WorkspaceError::Limit("prepared edit bytes"))?;
            verification_bytes += read.bytes.len();
            prepared.push((target, read, output, index));
        }
    }
    // Validate the complete preview/hash set before the first mutation; each commit rechecks the file.
    super::validate_serialized(&records, limits.max_output_bytes.saturating_sub(256))?;
    charge(
        &budget.source_bytes,
        verification_bytes,
        limits.max_source_bytes,
        "verification bytes",
    )?;
    for (target, read, output, index) in prepared {
        let commit = check_cancel(cancel)
            .and_then(|()| target.replace(output.as_bytes(), &read, limits, budget, cancel));
        if let Err(source) = commit {
            if matches!(source, WorkspaceError::Durability(_)) {
                records[index].applied = true;
            }
            return Err(WorkspaceError::EditInterrupted {
                applied: records
                    .iter()
                    .filter(|record| record.applied)
                    .map(|record| record.path.display().to_string())
                    .collect(),
                source: Box::new(source),
            });
        }
        records[index].applied = true;
    }
    records.sort_unstable_by(|a, b| a.path.cmp(&b.path));
    Ok(json!({ "files": records, "skipped_binary": skipped_binary, "apply": apply }))
}
