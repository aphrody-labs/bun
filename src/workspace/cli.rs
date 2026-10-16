// SPDX-License-Identifier: Apache-2.0

use std::{
    collections::BTreeMap,
    path::Path,
    sync::{Arc, atomic::AtomicBool},
};

use serde_json::Value;

use crate::{
    EditKind, EditRule, FileTask, Limits, Matcher, Result, Selection, WorkspaceError,
    WorkspaceOperation, WorkspaceRequest,
};

pub const HELP: &str = "Usage: bun workspace code-edit <search|replace|add-before|add-after|remove|rename|restore> [options]\n  --root PATH       Workspace root (default: current directory)\n  --glob PATTERN    Repeatable file selection\n  --engine text|regex (rename/restore: bun)\n  --find PATTERN\n  --with TEXT       Replacement or insertion (empty allowed)\n  --paths           Rename file paths with the native Bun renamer\n  --journal FILE    Native Bun rename receipt to restore\n  --apply           Write files; default previews only\n";

pub fn rename_args(args: &[String], cwd: &Path) -> Result<Option<Vec<String>>> {
    if args.first().map(String::as_str) != Some("code-edit")
        || !matches!(args.get(1).map(String::as_str), Some("rename" | "restore"))
    {
        return Ok(None);
    }
    let restore = args[1] == "restore";
    let mut output = Vec::new();
    let mut root = cwd.to_path_buf();
    let mut find = false;
    let mut replacement = false;
    let mut journal = false;
    let mut options = args[2..].iter();
    while let Some(flag) = options.next() {
        match flag.as_str() {
            "--apply" => {
                output.push(flag.clone());
                continue;
            }
            "--paths" if !restore => {
                output.push(flag.clone());
                continue;
            }
            _ => {}
        }
        let value = options
            .next()
            .ok_or_else(|| WorkspaceError::Invalid(format!("missing value for {flag}")))?;
        let target = match flag.as_str() {
            "--root" => {
                root = cwd.join(value);
                continue;
            }
            "--engine" if value == "bun" => continue,
            "--find" if !restore => {
                find = true;
                "--from"
            }
            "--with" if !restore => {
                replacement = true;
                "--to"
            }
            "--journal" if restore => {
                journal = true;
                "--restore"
            }
            "--glob" if !restore => {
                if let Some(exclude) = value.strip_prefix('!') {
                    output.extend(["--exclude".into(), exclude.into()]);
                    continue;
                }
                "--include"
            }
            _ => {
                return Err(WorkspaceError::Invalid(format!(
                    "unknown rename option {flag}"
                )));
            }
        };
        output.extend([target.into(), value.clone()]);
    }
    if (restore && !journal) || (!restore && (!find || !replacement)) {
        return Err(WorkspaceError::Invalid(
            if restore {
                "restore requires --journal"
            } else {
                "rename requires --find and --with"
            }
            .into(),
        ));
    }
    if !restore {
        output.push(
            root.into_os_string()
                .into_string()
                .map_err(|_| WorkspaceError::Invalid("root must be UTF-8".into()))?,
        );
    }
    Ok(Some(output))
}

pub fn request(args: &[String], cwd: &Path) -> Result<(WorkspaceRequest, bool)> {
    if args.first().map(String::as_str) != Some("code-edit") {
        return Err(WorkspaceError::Invalid("expected code-edit".into()));
    }
    let kind = match args.get(1).map(String::as_str) {
        Some("search") => EditKind::Search,
        Some("replace") => EditKind::Replace,
        Some("add-before") => EditKind::AddBefore,
        Some("add-after") => EditKind::AddAfter,
        Some("remove") => EditKind::Remove,
        _ => {
            return Err(WorkspaceError::Invalid(
                "unknown code-edit operation".into(),
            ));
        }
    };
    let mut root = cwd.to_path_buf();
    let mut selection = Selection::default();
    let mut matcher = Matcher::Text;
    let mut find = None;
    let mut replacement = None;
    let mut apply = false;
    let mut options = args[2..].iter();
    while let Some(flag) = options.next() {
        if flag == "--apply" {
            apply = true;
            continue;
        }
        let value = options
            .next()
            .ok_or_else(|| WorkspaceError::Invalid(format!("missing value for {flag}")))?;
        match flag.as_str() {
            "--root" => root = cwd.join(value),
            "--glob" => selection.globs.push(value.clone()),
            "--engine" => {
                matcher = match value.as_str() {
                    "text" => Matcher::Text,
                    "regex" => Matcher::Regex,
                    _ => {
                        return Err(WorkspaceError::Invalid(
                            "engine must be text or regex".into(),
                        ));
                    }
                }
            }
            "--find" => find = Some(value.clone()),
            "--with" => replacement = Some(value.clone()),
            _ => return Err(WorkspaceError::Invalid(format!("unknown option {flag}"))),
        }
    }
    if !matches!(kind, EditKind::Search | EditKind::Remove) && replacement.is_none() {
        return Err(WorkspaceError::Invalid("--with is required".into()));
    }
    let request = WorkspaceRequest {
        root,
        limits: Limits::default(),
        operation: WorkspaceOperation::File {
            task: FileTask::Edit {
                selection,
                rule: Box::new(EditRule {
                    kind,
                    matcher,
                    find: find
                        .ok_or_else(|| WorkspaceError::Invalid("--find is required".into()))?,
                    replacement: replacement.unwrap_or_default(),
                }),
                apply: false,
                expected: BTreeMap::new(),
            },
        },
    };
    request.validate()?;
    Ok((request, apply))
}

pub async fn execute(args: &[String], cwd: &Path, cancel: Arc<AtomicBool>) -> Result<Value> {
    let (mut request, apply) = request(args, cwd)?;
    let preview = crate::run(request.clone(), cancel.clone()).await?;
    let WorkspaceOperation::File {
        task:
            FileTask::Edit {
                rule,
                expected,
                apply: write,
                ..
            },
    } = &mut request.operation
    else {
        return Err(WorkspaceError::Invalid("expected edit request".into()));
    };
    if !apply || rule.kind == EditKind::Search {
        return Ok(preview);
    }
    let files = preview
        .get("files")
        .and_then(Value::as_array)
        .ok_or_else(|| WorkspaceError::Invalid("missing preview files".into()))?;
    for file in files {
        if file.get("changed").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        let path = file
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| WorkspaceError::Invalid("missing preview path".into()))?;
        let hash = file
            .get("before_hash")
            .and_then(Value::as_str)
            .ok_or_else(|| WorkspaceError::Invalid("missing preview hash".into()))?;
        expected.insert(path.into(), hash.into());
    }
    if expected.is_empty() {
        return Ok(preview);
    }
    *write = true;
    crate::run(request, cancel).await
}
