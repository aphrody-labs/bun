// SPDX-License-Identifier: Apache-2.0
//! Transactional multi-file edits: replacements, writes, deletions, then renames/moves.

use std::{
    collections::{BTreeMap, HashSet},
    path::{Component, Path, PathBuf},
    sync::atomic::AtomicBool,
};

use memchr::memmem;
use serde::{Deserialize, Serialize};

use crate::{Result, VfsError, io_at};

const MAX_EDIT_FILE_BYTES: u64 = 16 << 20;
const MAX_LISTED_SKIPS: usize = 100;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchKind {
    #[default]
    Literal,
    /// `regex` crate syntax; the replacement expands `$1` / `${name}`.
    Regex,
    /// Every reference and binding of a JS/TS identifier, found by the [`SpanProvider`].
    Identifier,
}

/// One step of an [`EditPlan`]. Paths are relative to the plan root (or absolute inside it).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum EditOp {
    Replace {
        /// Files, directories (recursive) or globs (`src/**/*.ts`).
        files: Vec<String>,
        find: String,
        replace: String,
        #[serde(default)]
        matcher: MatchKind,
        #[serde(default)]
        case_insensitive: bool,
        /// Fail the whole plan unless exactly this many replacements are made by this step.
        #[serde(default)]
        expect: Option<usize>,
    },
    /// Rename or move a file or directory; never overwrites.
    Rename {
        from: String,
        to: String,
    },
    /// Create or overwrite a file (parent directories are created).
    Write {
        path: String,
        content: String,
    },
    Delete {
        path: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct EditPlan {
    pub root: PathBuf,
    pub ops: Vec<EditOp>,
    /// `false` (default) is a dry run.
    pub apply: bool,
    pub max_diff_lines: usize,
    pub max_files: usize,
    /// Directory and glob sweeps honour `.gitignore`.
    pub gitignore: bool,
    /// Directory and glob sweeps include hidden files.
    pub hidden: bool,
}

impl Default for EditPlan {
    fn default() -> Self {
        Self {
            root: PathBuf::from("."),
            ops: Vec::new(),
            apply: false,
            max_diff_lines: 200,
            max_files: 10_000,
            gitignore: true,
            hidden: false,
        }
    }
}

/// Finds identifier occurrences for [`MatchKind::Identifier`].
pub trait SpanProvider: Sync {
    /// Byte ranges of `name` used as an identifier in `source` (file `path`, relative to the root).
    fn identifier_spans(
        &self,
        path: &str,
        source: &str,
        name: &str,
    ) -> std::result::Result<Vec<(usize, usize)>, String>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EditStatus {
    Changed,
    Unchanged,
    Created,
    Deleted,
    Renamed,
    Skipped,
    Failed,
    RolledBack,
}

#[derive(Debug, Clone, Serialize)]
pub struct EditFile {
    pub path: String,
    pub status: EditStatus,
    pub replacements: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RenameReport {
    pub from: String,
    pub to: String,
    pub status: EditStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct EditSummary {
    pub files_changed: usize,
    pub files_created: usize,
    pub files_deleted: usize,
    pub files_unchanged: usize,
    pub files_skipped: usize,
    pub replacements: usize,
    pub renames: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct EditReport {
    /// Changes are on disk.
    pub applied: bool,
    pub dry_run: bool,
    pub files: Vec<EditFile>,
    pub renames: Vec<RenameReport>,
    /// Unified diff of content changes, bounded by `max_diff_lines`.
    pub diff: String,
    pub truncated_diff: bool,
    pub summary: EditSummary,
    /// Set when applying failed and every completed step was rolled back.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

struct FileState {
    absolute: PathBuf,
    original: Option<Vec<u8>>,
    current: Option<Vec<u8>>,
    replacements: usize,
    explicit: bool,
}

/// Lexically resolves `path` under `root`; rejects escapes and links on the way.
fn resolve(root: &Path, path: &str) -> Result<(PathBuf, String)> {
    let raw = Path::new(path);
    let relative = if raw.is_absolute() {
        raw.strip_prefix(root)
            .map_err(|_| VfsError::Outside(path.to_owned()))?
            .to_path_buf()
    } else {
        raw.to_path_buf()
    };
    let mut parts: Vec<String> = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().into_owned()),
            Component::CurDir => {}
            Component::ParentDir => {
                if parts.pop().is_none() {
                    return Err(VfsError::Outside(path.to_owned()));
                }
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(VfsError::Outside(path.to_owned()));
            }
        }
    }
    if parts.is_empty() {
        return Err(VfsError::Invalid(format!(
            "edit path is the root itself: {path}"
        )));
    }
    let mut absolute = root.to_path_buf();
    for part in &parts {
        absolute.push(part);
        if let Ok(meta) = std::fs::symlink_metadata(&absolute) {
            if meta.file_type().is_symlink() {
                return Err(VfsError::Outside(path.to_owned()));
            }
        }
    }
    Ok((absolute, parts.join("/")))
}

fn has_glob(text: &str) -> bool {
    text.contains(['*', '?', '[', '{'])
}

/// Files under `root` (relative, `/` separators, sorted).
fn sweep(root: &Path, plan: &EditPlan, cancel: &AtomicBool) -> Result<Vec<String>> {
    let mut files = Vec::new();
    for entry in ignore::WalkBuilder::new(root)
        .hidden(!plan.hidden)
        .git_ignore(plan.gitignore)
        .git_exclude(plan.gitignore)
        .git_global(plan.gitignore)
        .ignore(plan.gitignore)
        .parents(plan.gitignore)
        .require_git(false)
        .follow_links(false)
        .build()
    {
        crate::check_cancel(cancel)?;
        let entry = entry?;
        if entry.file_type().is_some_and(|kind| kind.is_file()) {
            if let Ok(relative) = entry.path().strip_prefix(root) {
                files.push(relative.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    files.sort_unstable();
    Ok(files)
}

fn read_state(absolute: &Path) -> Result<Option<Vec<u8>>> {
    match std::fs::symlink_metadata(absolute) {
        Ok(meta) if meta.is_dir() => Err(VfsError::Invalid(format!(
            "{} is a directory",
            absolute.display()
        ))),
        Ok(meta) if meta.len() > MAX_EDIT_FILE_BYTES => {
            Err(VfsError::Limit("edit file size (16 MiB)"))
        }
        Ok(_) => std::fs::read(absolute)
            .map(Some)
            .map_err(|error| io_at(absolute, error)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(io_at(absolute, error)),
    }
}

enum Replacer {
    Literal {
        finder: Box<memmem::Finder<'static>>,
        find: String,
    },
    Regex(regex::Regex),
    Identifier(String),
}

fn replacer(find: &str, matcher: MatchKind, case_insensitive: bool) -> Result<Replacer> {
    if find.is_empty() {
        return Err(VfsError::Invalid("replace: `find` is empty".into()));
    }
    Ok(match matcher {
        MatchKind::Literal if !case_insensitive => Replacer::Literal {
            finder: Box::new(memmem::Finder::new(find.as_bytes()).into_owned()),
            find: find.to_owned(),
        },
        MatchKind::Literal | MatchKind::Regex => {
            let source = if matcher == MatchKind::Literal {
                regex::escape(find)
            } else {
                find.to_owned()
            };
            Replacer::Regex(
                regex::RegexBuilder::new(&source)
                    .case_insensitive(case_insensitive)
                    .size_limit(1 << 23)
                    .build()?,
            )
        }
        MatchKind::Identifier => Replacer::Identifier(find.to_owned()),
    })
}

/// Applies one replacement step to `text`; returns the new text and the count.
fn replace_text(
    replacer: &Replacer,
    literal: bool,
    replacement: &str,
    text: &str,
    path: &str,
    spans: Option<&dyn SpanProvider>,
) -> Result<(String, usize)> {
    Ok(match replacer {
        Replacer::Literal { finder, find } => {
            let mut out = String::with_capacity(text.len());
            let mut last = 0;
            let mut count = 0;
            for at in finder.find_iter(text.as_bytes()) {
                out.push_str(&text[last..at]);
                out.push_str(replacement);
                last = at + find.len();
                count += 1;
            }
            out.push_str(&text[last..]);
            (out, count)
        }
        Replacer::Regex(regex) => {
            let count = regex.find_iter(text).count();
            if count == 0 {
                return Ok((text.to_owned(), 0));
            }
            let out = if literal {
                regex
                    .replace_all(text, regex::NoExpand(replacement))
                    .into_owned()
            } else {
                regex.replace_all(text, replacement).into_owned()
            };
            (out, count)
        }
        Replacer::Identifier(name) => {
            let provider = spans
                .ok_or_else(|| VfsError::Invalid("identifier edits need a span provider".into()))?;
            let mut found = provider
                .identifier_spans(path, text, name)
                .map_err(|error| VfsError::Invalid(format!("{path}: {error}")))?;
            found.sort_unstable();
            found.dedup();
            let mut out = String::with_capacity(text.len());
            let mut last = 0;
            for (start, end) in &found {
                if *start < last || text.get(*start..*end) != Some(name.as_str()) {
                    return Err(VfsError::Invalid(format!(
                        "{path}: identifier span {start}..{end} does not hold `{name}`"
                    )));
                }
                out.push_str(&text[last..*start]);
                out.push_str(replacement);
                last = *end;
            }
            out.push_str(&text[last..]);
            (out, found.len())
        }
    })
}

/// Plans then (optionally) applies `plan`. Planning errors (bad pattern, missing file, unmet
/// `expect`, path outside the root, conflicting rename) return `Err` with nothing written;
/// an apply-time failure rolls back every completed step and is reported in [`EditReport::error`].
pub fn edit(
    plan: &EditPlan,
    spans: Option<&dyn SpanProvider>,
    cancel: &AtomicBool,
) -> Result<EditReport> {
    let root = std::path::absolute(&plan.root).map_err(|error| io_at(&plan.root, error))?;
    if !root.is_dir() {
        return Err(VfsError::Invalid(format!(
            "edit root is not a directory: {}",
            root.display()
        )));
    }
    let mut states: BTreeMap<String, FileState> = BTreeMap::new();
    let mut skipped: Vec<EditFile> = Vec::new();
    let mut skipped_total = 0;
    let mut swept: Option<Vec<String>> = None;
    let mut renames: Vec<(String, String, PathBuf, PathBuf)> = Vec::new();

    for op in &plan.ops {
        crate::check_cancel(cancel)?;
        match op {
            EditOp::Replace {
                files,
                find,
                replace,
                matcher,
                case_insensitive,
                expect,
            } => {
                if !renames.is_empty() {
                    return Err(VfsError::Invalid(
                        "content edits must come before renames".into(),
                    ));
                }
                let replacer = replacer(find, *matcher, *case_insensitive)?;
                let mut targets: Vec<(String, bool)> = Vec::new();
                for spec in files {
                    let spec_clean = spec.replace('\\', "/");
                    if has_glob(&spec_clean) {
                        let glob = globset::GlobBuilder::new(spec_clean.trim_start_matches("./"))
                            .literal_separator(true)
                            .build()?
                            .compile_matcher();
                        let list = match &swept {
                            Some(list) => list,
                            None => swept.insert(sweep(&root, plan, cancel)?),
                        };
                        targets.extend(
                            list.iter()
                                .filter(|file| glob.is_match(file.as_str()))
                                .map(|file| (file.clone(), false)),
                        );
                        continue;
                    }
                    let (absolute, relative) = resolve(&root, spec)?;
                    if absolute.is_dir() {
                        let list = match &swept {
                            Some(list) => list,
                            None => swept.insert(sweep(&root, plan, cancel)?),
                        };
                        let prefix = format!("{relative}/");
                        targets.extend(
                            list.iter()
                                .filter(|file| file.starts_with(&prefix))
                                .map(|file| (file.clone(), false)),
                        );
                    } else if states
                        .get(&relative)
                        .is_some_and(|state| state.current.is_some())
                        || absolute.is_file()
                    {
                        targets.push((relative, true));
                    } else {
                        return Err(VfsError::Invalid(format!("replace: no such file: {spec}")));
                    }
                }
                targets.sort_unstable();
                targets.dedup_by(|a, b| {
                    if a.0 == b.0 {
                        b.1 |= a.1;
                        true
                    } else {
                        false
                    }
                });
                let mut step = 0;
                for (relative, explicit) in targets {
                    crate::check_cancel(cancel)?;
                    if !states.contains_key(&relative) {
                        if states.len() >= plan.max_files {
                            return Err(VfsError::Limit("edit max_files"));
                        }
                        let (absolute, _) = resolve(&root, &relative)?;
                        let original = match read_state(&absolute) {
                            Ok(original) => original,
                            Err(VfsError::Limit(_)) if !explicit => {
                                skipped_total += 1;
                                if skipped.len() < MAX_LISTED_SKIPS {
                                    skipped.push(EditFile {
                                        path: relative.clone(),
                                        status: EditStatus::Skipped,
                                        replacements: 0,
                                        error: Some("larger than 16 MiB".into()),
                                    });
                                }
                                continue;
                            }
                            Err(error) => return Err(error),
                        };
                        states.insert(
                            relative.clone(),
                            FileState {
                                absolute,
                                current: original.clone(),
                                original,
                                replacements: 0,
                                explicit,
                            },
                        );
                    }
                    let state = states
                        .get_mut(&relative)
                        .ok_or_else(|| VfsError::Invalid(relative.clone()))?;
                    state.explicit |= explicit;
                    let Some(current) = &state.current else {
                        return Err(VfsError::Invalid(format!(
                            "replace: {relative} is deleted by an earlier step"
                        )));
                    };
                    let reason = if memchr::memchr(0, &current[..current.len().min(8192)]).is_some()
                    {
                        Some("binary file")
                    } else if std::str::from_utf8(current).is_err() {
                        Some("not UTF-8")
                    } else {
                        None
                    };
                    if let Some(reason) = reason {
                        if explicit {
                            return Err(VfsError::Invalid(format!(
                                "replace: {relative}: {reason}"
                            )));
                        }
                        skipped_total += 1;
                        if skipped.len() < MAX_LISTED_SKIPS {
                            skipped.push(EditFile {
                                path: relative.clone(),
                                status: EditStatus::Skipped,
                                replacements: 0,
                                error: Some(reason.into()),
                            });
                        }
                        continue;
                    }
                    let text = std::str::from_utf8(current)
                        .map_err(|_| VfsError::Invalid(relative.clone()))?;
                    let (next, count) = replace_text(
                        &replacer,
                        *matcher == MatchKind::Literal,
                        replace,
                        text,
                        &relative,
                        spans,
                    )?;
                    if count > 0 {
                        state.current = Some(next.into_bytes());
                        state.replacements += count;
                        step += count;
                    }
                }
                if let Some(expected) = expect {
                    if *expected != step {
                        return Err(VfsError::Invalid(format!(
                            "replace `{find}`: expected {expected} replacements, found {step}"
                        )));
                    }
                }
            }
            EditOp::Write { path, content } => {
                if !renames.is_empty() {
                    return Err(VfsError::Invalid(
                        "content edits must come before renames".into(),
                    ));
                }
                let (absolute, relative) = resolve(&root, path)?;
                if absolute.is_dir() {
                    return Err(VfsError::Invalid(format!("write: {path} is a directory")));
                }
                let state = match states.entry(relative) {
                    std::collections::btree_map::Entry::Occupied(entry) => entry.into_mut(),
                    std::collections::btree_map::Entry::Vacant(entry) => {
                        let original = read_state(&absolute)?;
                        entry.insert(FileState {
                            absolute,
                            current: original.clone(),
                            original,
                            replacements: 0,
                            explicit: true,
                        })
                    }
                };
                state.current = Some(content.as_bytes().to_vec());
                state.explicit = true;
            }
            EditOp::Delete { path } => {
                if !renames.is_empty() {
                    return Err(VfsError::Invalid(
                        "content edits must come before renames".into(),
                    ));
                }
                let (absolute, relative) = resolve(&root, path)?;
                if absolute.is_dir() {
                    return Err(VfsError::Invalid(format!(
                        "delete: {path} is a directory (rename it away instead)"
                    )));
                }
                let state = match states.entry(relative) {
                    std::collections::btree_map::Entry::Occupied(entry) => entry.into_mut(),
                    std::collections::btree_map::Entry::Vacant(entry) => {
                        let original = read_state(&absolute)?;
                        entry.insert(FileState {
                            absolute,
                            current: original.clone(),
                            original,
                            replacements: 0,
                            explicit: true,
                        })
                    }
                };
                if state.current.is_none() {
                    return Err(VfsError::Invalid(format!("delete: no such file: {path}")));
                }
                state.current = None;
                state.explicit = true;
            }
            EditOp::Rename { from, to } => {
                let (from_abs, from_rel) = resolve(&root, from)?;
                let (to_abs, to_rel) = resolve(&root, to)?;
                if to_rel == from_rel || to_rel.starts_with(&format!("{from_rel}/")) {
                    return Err(VfsError::Invalid(format!(
                        "rename: cannot move {from} into itself"
                    )));
                }
                renames.push((from_rel, to_rel, from_abs, to_abs));
            }
        }
    }
    validate_renames(&root, &renames, &states)?;

    let mut report = EditReport {
        applied: false,
        dry_run: !plan.apply,
        files: Vec::new(),
        renames: renames
            .iter()
            .map(|(from, to, _, _)| RenameReport {
                from: from.clone(),
                to: to.clone(),
                status: EditStatus::Renamed,
                error: None,
            })
            .collect(),
        diff: String::new(),
        truncated_diff: false,
        summary: EditSummary {
            renames: renames.len(),
            files_skipped: skipped_total,
            ..EditSummary::default()
        },
        error: None,
    };
    let mut diff_budget = plan.max_diff_lines;
    for (relative, state) in &states {
        let status = match (&state.original, &state.current) {
            (None, None) => continue,
            (Some(_), None) => EditStatus::Deleted,
            (None, Some(_)) => EditStatus::Created,
            (Some(before), Some(after)) if before == after => EditStatus::Unchanged,
            _ => EditStatus::Changed,
        };
        match status {
            EditStatus::Changed => report.summary.files_changed += 1,
            EditStatus::Created => report.summary.files_created += 1,
            EditStatus::Deleted => report.summary.files_deleted += 1,
            _ => report.summary.files_unchanged += 1,
        }
        report.summary.replacements += state.replacements;
        if status == EditStatus::Unchanged && !state.explicit {
            continue;
        }
        if status != EditStatus::Unchanged {
            let before = String::from_utf8_lossy(state.original.as_deref().unwrap_or_default());
            let after = String::from_utf8_lossy(state.current.as_deref().unwrap_or_default());
            if !unified_diff(
                relative,
                &before,
                &after,
                &mut report.diff,
                &mut diff_budget,
            ) {
                report.truncated_diff = true;
            }
        }
        report.files.push(EditFile {
            path: relative.clone(),
            status,
            replacements: state.replacements,
            error: None,
        });
    }
    report.files.extend(skipped);
    if !plan.apply {
        return Ok(report);
    }
    match commit(&states, &renames, cancel) {
        Ok(()) => report.applied = true,
        Err(Failure {
            path: failed,
            rename,
            error,
        }) => {
            for file in &mut report.files {
                if file.status != EditStatus::Skipped && file.status != EditStatus::Unchanged {
                    let this = !rename && file.path == failed;
                    file.error = this.then(|| error.clone());
                    file.status = if this {
                        EditStatus::Failed
                    } else {
                        EditStatus::RolledBack
                    };
                }
            }
            for entry in &mut report.renames {
                let this = rename && entry.from == failed;
                entry.error = this.then(|| error.clone());
                entry.status = if this {
                    EditStatus::Failed
                } else {
                    EditStatus::RolledBack
                };
            }
            report.error = Some(format!("{failed}: {error}; every change was rolled back"));
        }
    }
    Ok(report)
}

/// Checks renames against the tree as it will be after the content steps and earlier renames.
fn validate_renames(
    root: &Path,
    renames: &[(String, String, PathBuf, PathBuf)],
    states: &BTreeMap<String, FileState>,
) -> Result<()> {
    // Virtual overlay: path -> exists, for paths touched by content steps or earlier renames.
    let mut overlay: BTreeMap<String, bool> = states
        .iter()
        .map(|(path, state)| (path.clone(), state.current.is_some()))
        .collect();
    let mut moved: Vec<(String, String)> = Vec::new();
    let exists =
        |overlay: &BTreeMap<String, bool>, moved: &[(String, String)], path: &str| -> bool {
            if let Some(state) = overlay.get(path) {
                return *state;
            }
            let mut real = path.to_owned();
            for (from, to) in moved.iter().rev() {
                if real == *to || real.starts_with(&format!("{to}/")) {
                    real = format!("{from}{}", &real[to.len()..]);
                } else if real == *from || real.starts_with(&format!("{from}/")) {
                    return false;
                }
            }
            if overlay.get(&real) == Some(&false) {
                return false;
            }
            root.join(&real).exists()
        };
    let mut targets = HashSet::new();
    for (from, to, _, _) in renames {
        if !exists(&overlay, &moved, from) {
            return Err(VfsError::Invalid(format!(
                "rename: no such file or directory: {from}"
            )));
        }
        if exists(&overlay, &moved, to) || !targets.insert(to.clone()) {
            return Err(VfsError::Invalid(format!(
                "rename: destination exists: {to}"
            )));
        }
        overlay.insert(from.clone(), false);
        overlay.insert(to.clone(), true);
        moved.push((from.clone(), to.clone()));
    }
    Ok(())
}

enum Undo {
    /// Move the backup back over the target.
    Restore {
        backup: PathBuf,
        target: PathBuf,
    },
    Remove(PathBuf),
    RemoveDir(PathBuf),
    Rename {
        from: PathBuf,
        to: PathBuf,
    },
}

fn sidecar(target: &Path, tag: &str, serial: usize) -> PathBuf {
    let name = target
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    target.with_file_name(format!(
        ".{name}.bunvfs-{}-{serial}.{tag}",
        std::process::id()
    ))
}

fn create_parents(path: &Path, undo: &mut Vec<Undo>) -> std::io::Result<()> {
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    if parent.is_dir() {
        return Ok(());
    }
    create_parents(parent, undo)?;
    std::fs::create_dir(parent)?;
    undo.push(Undo::RemoveDir(parent.to_path_buf()));
    Ok(())
}

fn rollback(undo: Vec<Undo>) {
    for step in undo.into_iter().rev() {
        let _ = match step {
            Undo::Restore { backup, target } => {
                let _ = std::fs::remove_file(&target);
                std::fs::rename(&backup, &target)
            }
            Undo::Remove(path) => std::fs::remove_file(path),
            Undo::RemoveDir(path) => std::fs::remove_dir(path),
            Undo::Rename { from, to } => std::fs::rename(to, from),
        };
    }
}

struct Failure {
    path: String,
    rename: bool,
    error: String,
}

/// Writes every change; on failure undoes the completed steps and returns the failing step.
fn commit(
    states: &BTreeMap<String, FileState>,
    renames: &[(String, String, PathBuf, PathBuf)],
    cancel: &AtomicBool,
) -> std::result::Result<(), Failure> {
    let mut undo: Vec<Undo> = Vec::new();
    let mut temps: Vec<PathBuf> = Vec::new();
    let mut backups: Vec<PathBuf> = Vec::new();
    let result = (|| -> std::result::Result<(), Failure> {
        let changed: Vec<(&String, &FileState)> = states
            .iter()
            .filter(|(_, state)| state.original != state.current)
            .collect();
        // Stage new contents next to their targets.
        let mut staged: Vec<Option<PathBuf>> = Vec::with_capacity(changed.len());
        for (serial, (relative, state)) in changed.iter().enumerate() {
            let fail = |error: std::io::Error| Failure {
                path: (*relative).clone(),
                rename: false,
                error: error.to_string(),
            };
            if crate::check_cancel(cancel).is_err() {
                return Err(Failure {
                    path: (*relative).clone(),
                    rename: false,
                    error: "cancelled".into(),
                });
            }
            let Some(content) = &state.current else {
                staged.push(None);
                continue;
            };
            create_parents(&state.absolute, &mut undo).map_err(fail)?;
            let temp = sidecar(&state.absolute, "tmp", serial);
            temps.push(temp.clone());
            let mut file = std::fs::File::create_new(&temp).map_err(fail)?;
            std::io::Write::write_all(&mut file, content).map_err(fail)?;
            file.sync_all().map_err(fail)?;
            drop(file);
            if state.original.is_some() {
                if let Ok(meta) = std::fs::metadata(&state.absolute) {
                    std::fs::set_permissions(&temp, meta.permissions()).map_err(fail)?;
                }
            }
            staged.push(Some(temp));
        }
        // Swap them in, checking that nobody changed the originals since planning.
        for (serial, ((relative, state), temp)) in changed.iter().zip(staged).enumerate() {
            let fail = |error: String| Failure {
                path: (*relative).clone(),
                rename: false,
                error,
            };
            let on_disk = read_state(&state.absolute).map_err(|error| fail(error.to_string()))?;
            if on_disk != state.original {
                return Err(fail("changed on disk since the edit was planned".into()));
            }
            if state.original.is_some() {
                let backup = sidecar(&state.absolute, "bak", serial);
                std::fs::rename(&state.absolute, &backup)
                    .map_err(|error| fail(error.to_string()))?;
                backups.push(backup.clone());
                match &temp {
                    Some(temp) => {
                        undo.push(Undo::Restore {
                            backup,
                            target: state.absolute.clone(),
                        });
                        std::fs::rename(temp, &state.absolute)
                            .map_err(|error| fail(error.to_string()))?;
                    }
                    None => undo.push(Undo::Rename {
                        from: state.absolute.clone(),
                        to: backup,
                    }),
                }
            } else if let Some(temp) = &temp {
                if state.absolute.exists() {
                    return Err(fail("created on disk since the edit was planned".into()));
                }
                std::fs::rename(temp, &state.absolute).map_err(|error| fail(error.to_string()))?;
                undo.push(Undo::Remove(state.absolute.clone()));
            }
        }
        for (from, _, from_abs, to_abs) in renames {
            let fail = |error: std::io::Error| Failure {
                path: from.clone(),
                rename: true,
                error: error.to_string(),
            };
            if to_abs.exists() {
                return Err(Failure {
                    path: from.clone(),
                    rename: true,
                    error: "destination exists".into(),
                });
            }
            create_parents(to_abs, &mut undo).map_err(fail)?;
            std::fs::rename(from_abs, to_abs).map_err(fail)?;
            undo.push(Undo::Rename {
                from: from_abs.clone(),
                to: to_abs.clone(),
            });
        }
        Ok(())
    })();
    match result {
        Ok(()) => {
            for backup in backups {
                let _ = std::fs::remove_file(backup);
            }
            Ok(())
        }
        Err(error) => {
            rollback(undo);
            for temp in temps {
                let _ = std::fs::remove_file(temp);
            }
            Err(error)
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Line {
    Same,
    Del,
    Add,
}

/// Myers line diff of the region between the common prefix and suffix; `None` when the edit
/// distance exceeds the budget (the region is then reported as one replacement).
fn myers(a: &[&str], b: &[&str]) -> Option<Vec<Line>> {
    let (n, m) = (a.len() as isize, b.len() as isize);
    let max = (n + m).min(1000);
    let offset = max as usize + 1;
    let mut v = vec![0_isize; 2 * offset + 1];
    let mut trace: Vec<Vec<isize>> = Vec::new();
    for d in 0..=max {
        trace.push(v.clone());
        let mut k = -d;
        while k <= d {
            let index = (k + offset as isize) as usize;
            let mut x = if k == -d || (k != d && v[index - 1] < v[index + 1]) {
                v[index + 1]
            } else {
                v[index - 1] + 1
            };
            let mut y = x - k;
            while x < n && y < m && a[x as usize] == b[y as usize] {
                x += 1;
                y += 1;
            }
            v[index] = x;
            if x >= n && y >= m {
                let mut ops = Vec::new();
                let (mut x, mut y) = (n, m);
                for d in (1..=d).rev() {
                    let v = &trace[d as usize];
                    let k = x - y;
                    let index = (k + offset as isize) as usize;
                    let previous_k = if k == -d || (k != d && v[index - 1] < v[index + 1]) {
                        k + 1
                    } else {
                        k - 1
                    };
                    let previous_x = v[(previous_k + offset as isize) as usize];
                    let previous_y = previous_x - previous_k;
                    while x > previous_x && y > previous_y {
                        ops.push(Line::Same);
                        x -= 1;
                        y -= 1;
                    }
                    ops.push(if x == previous_x {
                        Line::Add
                    } else {
                        Line::Del
                    });
                    x = previous_x;
                    y = previous_y;
                }
                while x > 0 && y > 0 {
                    ops.push(Line::Same);
                    x -= 1;
                    y -= 1;
                }
                ops.reverse();
                return Some(ops);
            }
            k += 2;
        }
    }
    None
}

/// Appends a unified diff of one file; returns `false` when the line budget ran out.
fn unified_diff(
    path: &str,
    before: &str,
    after: &str,
    out: &mut String,
    budget: &mut usize,
) -> bool {
    use std::fmt::Write;
    let a: Vec<&str> = if before.is_empty() {
        Vec::new()
    } else {
        before.split_inclusive('\n').collect()
    };
    let b: Vec<&str> = if after.is_empty() {
        Vec::new()
    } else {
        after.split_inclusive('\n').collect()
    };
    let prefix = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    let suffix = a[prefix..]
        .iter()
        .rev()
        .zip(b[prefix..].iter().rev())
        .take_while(|(x, y)| x == y)
        .count();
    let (middle_a, middle_b) = (&a[prefix..a.len() - suffix], &b[prefix..b.len() - suffix]);
    let mut ops = vec![Line::Same; prefix];
    match myers(middle_a, middle_b) {
        Some(middle) => ops.extend(middle),
        None => {
            ops.extend(std::iter::repeat_n(Line::Del, middle_a.len()));
            ops.extend(std::iter::repeat_n(Line::Add, middle_b.len()));
        }
    }
    ops.extend(std::iter::repeat_n(Line::Same, suffix));
    if *budget == 0 {
        return false;
    }
    let _ = writeln!(out, "--- a/{path}\n+++ b/{path}");
    const CONTEXT: usize = 2;
    let changes: Vec<usize> = ops
        .iter()
        .enumerate()
        .filter(|(_, op)| **op != Line::Same)
        .map(|(at, _)| at)
        .collect();
    let mut start = 0;
    while start < changes.len() {
        let mut end = start;
        while end + 1 < changes.len() && changes[end + 1] <= changes[end] + 2 * CONTEXT + 1 {
            end += 1;
        }
        let from = changes[start].saturating_sub(CONTEXT);
        let to = (changes[end] + CONTEXT + 1).min(ops.len());
        let (mut line_a, mut line_b) = (0, 0);
        for op in &ops[..from] {
            match op {
                Line::Same => {
                    line_a += 1;
                    line_b += 1;
                }
                Line::Del => line_a += 1,
                Line::Add => line_b += 1,
            }
        }
        let count_a = ops[from..to].iter().filter(|op| **op != Line::Add).count();
        let count_b = ops[from..to].iter().filter(|op| **op != Line::Del).count();
        let _ = writeln!(
            out,
            "@@ -{},{count_a} +{},{count_b} @@",
            line_a + 1,
            line_b + 1
        );
        let (mut index_a, mut index_b) = (line_a, line_b);
        for op in &ops[from..to] {
            if *budget == 0 {
                return false;
            }
            *budget -= 1;
            let (sign, text) = match op {
                Line::Same => {
                    index_a += 1;
                    index_b += 1;
                    (' ', a[index_a - 1])
                }
                Line::Del => {
                    index_a += 1;
                    ('-', a[index_a - 1])
                }
                Line::Add => {
                    index_b += 1;
                    ('+', b[index_b - 1])
                }
            };
            let text = text.strip_suffix('\n').unwrap_or(text);
            let text = text.strip_suffix('\r').unwrap_or(text);
            let _ = writeln!(out, "{sign}{text}");
        }
        start = end + 1;
    }
    true
}
