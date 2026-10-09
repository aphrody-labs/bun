// SPDX-License-Identifier: Apache-2.0

use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    sync::{Arc, atomic::AtomicBool},
};

use ignore::{
    gitignore::{Gitignore, GitignoreBuilder},
    overrides::{Override, OverrideBuilder},
};
use serde::Serialize;
use serde_json::{Value, json};

use super::{Budget, Sandbox, charge, polyglot};
use crate::{InspectMode, Limits, Result, Selection, WorkspaceError, check_cancel};

#[derive(Serialize)]
struct FileRecord {
    path: PathBuf,
    size: u64,
    modified_sec: i64,
    modified_nsec: i64,
    language: polyglot::LanguageDefinition,
    #[serde(skip_serializing_if = "Option::is_none")]
    hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parse: Option<Value>,
}

pub(super) fn paths(
    sandbox: &Sandbox,
    selection: &Selection,
    limits: &Limits,
    budget: &Budget,
    cancel: &AtomicBool,
) -> Result<Vec<PathBuf>> {
    let mut overrides = OverrideBuilder::new(&sandbox.path);
    for glob in &selection.globs {
        overrides.add(glob)?;
    }
    let overrides = overrides.build()?;
    let mut stack = vec![frame(
        sandbox,
        PathBuf::new(),
        Vec::new(),
        limits,
        budget,
        cancel,
    )?];
    let mut files = Vec::new();
    while let Some(current) = stack.last_mut() {
        check_cancel(cancel)?;
        let Some(entry) = current.iterator.next()? else {
            stack.pop();
            continue;
        };
        charge(&budget.entries, 1, limits.max_entries, "directory entries")?;
        #[cfg(windows)]
        let name = {
            use std::os::windows::ffi::OsStringExt;
            OsString::from_wide(entry.name.slice())
        };
        #[cfg(unix)]
        let name = {
            use std::os::unix::ffi::OsStringExt;
            OsString::from_vec(entry.name.slice_u8().to_vec())
        };
        if name == "." || name == ".." || name == ".git" {
            continue;
        }
        let relative = current.relative.join(&name);
        let kind = if entry.kind == bun_sys::EntryKind::Unknown {
            let name = bun_core::ZBox::from_bytes(name.as_encoded_bytes());
            bun_sys::kind_from_mode(
                bun_sys::lstatat(&current._directory, name.as_zstr())?.st_mode as bun_sys::Mode,
            )
        } else {
            entry.kind
        };
        let directory = kind == bun_sys::EntryKind::Directory;
        if ignored(
            &sandbox.path.join(&relative),
            directory,
            &name,
            selection,
            &overrides,
            &current.ignores,
        ) {
            continue;
        }
        if relative.components().count() > limits.max_depth {
            return Err(WorkspaceError::Limit("directory depth"));
        }
        if directory {
            let ignores = current.ignores.clone();
            stack.push(frame(sandbox, relative, ignores, limits, budget, cancel)?);
            continue;
        }
        if kind != bun_sys::EntryKind::File {
            continue;
        }
        charge(&budget.files, 1, limits.max_files, "files")?;
        // Validate through directory handles before a path enters the editable/indexed selection.
        sandbox.target(&relative)?.metadata()?;
        files.push(relative);
    }
    files.sort_unstable();
    Ok(files)
}

struct Frame {
    // The iterator borrows the native directory handle; RAII closes it only when this frame is dropped.
    _directory: bun_sys::File,
    iterator: bun_sys::dir_iterator::WrappedIterator,
    relative: PathBuf,
    ignores: Vec<Arc<Gitignore>>,
}

fn frame(
    sandbox: &Sandbox,
    relative: PathBuf,
    mut ignores: Vec<Arc<Gitignore>>,
    limits: &Limits,
    budget: &Budget,
    cancel: &AtomicBool,
) -> Result<Frame> {
    let directory = sandbox.directory(&relative)?;
    let absolute = sandbox.path.join(&relative);
    for name in [".gitignore", ".ignore"] {
        let path = relative.join(name);
        let native = bun_core::ZBox::from_bytes(name);
        match bun_sys::lstatat(&directory, native.as_zstr()) {
            Err(error) if error.errno == bun_sys::E::NOENT as u16 => continue,
            Err(error) => return Err(error.into()),
            Ok(stat) if !bun_sys::is_regular_file(stat.st_mode as bun_sys::Mode) => continue,
            Ok(_) => {}
        }
        let config = sandbox.read(&path, limits, budget, cancel)?;
        let text = std::str::from_utf8(&config.bytes)
            .map_err(|_| WorkspaceError::Invalid("ignore configuration must be UTF-8".into()))?;
        let mut matcher = GitignoreBuilder::new(&absolute);
        for line in text.lines() {
            check_cancel(cancel)?;
            matcher.add_line(Some(sandbox.path.join(&path)), line)?;
        }
        ignores.push(Arc::new(matcher.build()?));
    }
    let iterator = bun_sys::dir_iterator::iterate(directory.fd());
    Ok(Frame {
        _directory: directory,
        iterator,
        relative,
        ignores,
    })
}

fn ignored(
    path: &Path,
    directory: bool,
    name: &std::ffi::OsStr,
    selection: &Selection,
    overrides: &Override,
    ignores: &[Arc<Gitignore>],
) -> bool {
    let matched = overrides.matched(path, directory);
    if matched.is_ignore() {
        return true;
    }
    if matched.is_whitelist() {
        return false;
    }
    if !selection.include_hidden && name.as_encoded_bytes().starts_with(b".") {
        return true;
    }
    for matcher in ignores.iter().rev() {
        let matched = matcher.matched(path, directory);
        if matched.is_ignore() {
            return true;
        }
        if matched.is_whitelist() {
            return false;
        }
    }
    false
}

pub(super) fn scan(
    sandbox: &Sandbox,
    selection: &Selection,
    hash: bool,
    parse: bool,
    limits: &Limits,
    budget: &Budget,
    cancel: &AtomicBool,
) -> Result<Value> {
    let files = paths(sandbox, selection, limits, budget, cancel)?;
    let mut records = Vec::with_capacity(files.len());
    let mut output_bytes = 0;
    for path in files {
        check_cancel(cancel)?;
        let target = sandbox.target(&path)?;
        let (stat, hash, parsed, definition) = if hash || parse {
            let read = target.read(limits, budget, cancel)?;
            let content = std::str::from_utf8(&read.bytes)
                .ok()
                .filter(|text| !text.contains('\0'));
            let parsed = if parse {
                content
                    .map(|content| parse_source(&path, content, limits, cancel))
                    .transpose()?
            } else {
                None
            };
            (
                read.stat,
                hash.then_some(read.hash),
                parsed,
                polyglot::detect(&path, content),
            )
        } else {
            (
                target.metadata()?,
                None,
                None,
                polyglot::detect(&path, None),
            )
        };
        let modified = bun_sys::stat_mtime(&stat);
        let record = FileRecord {
            path,
            size: stat.st_size as u64,
            modified_sec: modified.sec,
            modified_nsec: modified.nsec,
            language: definition,
            hash,
            parse: parsed,
        };
        let bytes = serde_json::to_vec(&record)?;
        output_bytes += bytes.len();
        if output_bytes > limits.max_output_bytes {
            return Err(WorkspaceError::Limit("output bytes"));
        }
        records.push(record);
    }
    Ok(
        json!({ "root": sandbox.path, "files": records, "count": records.len(), "provenance": crate::provenance() }),
    )
}

pub(super) fn inspect(
    sandbox: &Sandbox,
    path: &Path,
    mode: InspectMode,
    limits: &Limits,
    budget: &Budget,
    cancel: &AtomicBool,
) -> Result<Value> {
    charge(&budget.files, 1, limits.max_files, "files")?;
    let read = sandbox.read(path, limits, budget, cancel)?;
    check_cancel(cancel)?;
    let analysis = match mode {
        InspectMode::Parse => {
            let text = std::str::from_utf8(&read.bytes)
                .map_err(|_| WorkspaceError::Invalid("parse requires UTF-8 text".into()))?;
            if text.contains('\0') {
                return Err(WorkspaceError::Invalid(
                    "parse requires text without NUL bytes".into(),
                ));
            }
            parse_source(path, text, limits, cancel)?
        }
        InspectMode::Binary => triage(&read.bytes, limits)?,
        InspectMode::Magika => classify(&read.bytes)?,
    };
    check_cancel(cancel)?;
    Ok(json!({ "path": path, "hash": read.hash, "bytes": read.bytes.len(), "analysis": analysis }))
}

fn parse_source(path: &Path, text: &str, limits: &Limits, cancel: &AtomicBool) -> Result<Value> {
    let path = path
        .to_str()
        .ok_or_else(|| WorkspaceError::Invalid("parse paths must be UTF-8".into()))?
        .replace('\\', "/");
    if bun_graph::extract::Language::of_path(&path).is_some() {
        let graph =
            bun_graph::extract::extract_bounded(&path, text.as_bytes(), limits.max_depth, cancel)
                .map_err(|error| WorkspaceError::Native(error.to_string()))?;
        let count = graph
            .nodes
            .len()
            .saturating_add(graph.edges.len())
            .saturating_add(graph.calls.len())
            .saturating_add(graph.imports.len());
        if count > limits.max_matches {
            return Err(WorkspaceError::Limit("extracted records"));
        }
        Ok(
            json!({ "extractor": "bun_graph", "definition": polyglot::detect(Path::new(&path), Some(text)), "syntax": graph }),
        )
    } else {
        let analysis = polyglot::parse(Path::new(&path), text, limits.max_matches, cancel)?;
        Ok(json!({ "extractor": "line_patterns", "analysis": analysis }))
    }
}

fn triage(_bytes: &[u8], _limits: &Limits) -> Result<Value> {
    Err(WorkspaceError::Unavailable(
        "binary triage lives in packages/bun-re, outside the bun binary",
    ))
}

fn classify(_bytes: &[u8]) -> Result<Value> {
    Err(WorkspaceError::Unavailable(
        "Magika classification lives in packages/bun-re, outside the bun binary",
    ))
}
