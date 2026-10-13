// SPDX-License-Identifier: Apache-2.0

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Arc, atomic::AtomicBool},
};

use bun_core::Fd;
use bun_sys::{File, O};
use serde_json::{Value, json};

use crate::{
    EditKind, EditRule, FileTask, InspectMode, Limits, Matcher, Result, Selection, Stage,
    WorkspaceError, WorkspaceOperation, WorkspaceRequest,
};

fn write(path: &Path, bytes: &[u8]) -> Result<()> {
    let file = File::openat(
        Fd::cwd(),
        path.as_os_str().as_encoded_bytes(),
        O::WRONLY | O::CREAT | O::TRUNC | O::CLOEXEC,
        0o600,
    )?;
    file.write_all(bytes)?;
    Ok(())
}

fn read(path: &Path) -> Result<Vec<u8>> {
    let file = File::openat(
        Fd::cwd(),
        path.as_os_str().as_encoded_bytes(),
        O::RDONLY | O::CLOEXEC,
        0,
    )?;
    Ok(file.read_to_end()?)
}

fn request(root: &Path, task: FileTask) -> WorkspaceRequest {
    WorkspaceRequest {
        root: root.to_owned(),
        limits: Limits::default(),
        operation: WorkspaceOperation::File { task },
    }
}

fn cli_args(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).into()).collect()
}

#[test]
fn workspace_cli_uses_native_rename_and_rejects_legacy_engines() -> Result<()> {
    let root = std::env::current_dir()?;
    let args = crate::cli::rename_args(
        &cli_args(&[
            "code-edit",
            "rename",
            "--find",
            "@tauri-apps/",
            "--with",
            "@aphrody/",
            "--glob",
            "**/*.ts",
            "--glob",
            "!**/audits/**",
            "--paths",
            "--apply",
        ]),
        &root,
    )?
    .ok_or_else(|| WorkspaceError::Invalid("missing native rename arguments".into()))?;
    assert_eq!(
        &args[..10],
        &[
            "--from",
            "@tauri-apps/",
            "--to",
            "@aphrody/",
            "--include",
            "**/*.ts",
            "--exclude",
            "**/audits/**",
            "--paths",
            "--apply"
        ]
    );
    assert_eq!(Path::new(&args[10]), root);
    assert!(
        crate::cli::rename_args(
            &cli_args(&["code-edit", "rename", "--engine", "yolo"]),
            &root
        )
        .is_err()
    );
    assert!(
        crate::cli::request(&cli_args(&["code-edit", "replace", "--find", "old"]), &root).is_err()
    );
    let restore = crate::cli::rename_args(
        &cli_args(&["code-edit", "restore", "--journal", "receipt.json"]),
        &root,
    )?;
    assert_eq!(restore, Some(cli_args(&["--restore", "receipt.json"])));
    Ok(())
}

#[tokio::test]
async fn workspace_cli_previews_then_applies_import_export_path_edits() -> Result<()> {
    let temporary = tempfile::tempdir()?;
    let path = temporary.path().join("index.ts");
    let original = b"import { run } from '@legacy/google';\nexport * from '@legacy/tauri';\nconst path = '@legacy/obscura';\n";
    write(&path, original)?;
    let mut args = cli_args(&[
        "code-edit",
        "replace",
        "--glob",
        "*.ts",
        "--find",
        "@legacy/",
        "--with",
        "@aphrody/",
    ]);
    let preview =
        crate::cli::execute(&args, temporary.path(), Arc::new(AtomicBool::new(false))).await?;
    assert_eq!(preview["files"][0]["matches"], 3);
    assert_eq!(read(&path)?, original);
    args.push("--apply".into());
    let applied =
        crate::cli::execute(&args, temporary.path(), Arc::new(AtomicBool::new(false))).await?;
    assert_eq!(applied["files"][0]["applied"], true);
    assert_eq!(read(&path)?, b"import { run } from '@aphrody/google';\nexport * from '@aphrody/tauri';\nconst path = '@aphrody/obscura';\n");
    let unchanged =
        crate::cli::execute(&args, temporary.path(), Arc::new(AtomicBool::new(false))).await?;
    assert_eq!(unchanged["files"].as_array().map(Vec::len), Some(0));
    Ok(())
}

async fn execute(root: &Path, task: FileTask) -> Result<Value> {
    crate::run(request(root, task), Arc::new(AtomicBool::new(false))).await
}

fn edit(
    kind: EditKind,
    matcher: Matcher,
    find: &str,
    replacement: &str,
    apply: bool,
    expected: BTreeMap<String, String>,
) -> FileTask {
    FileTask::Edit {
        selection: Selection {
            globs: vec!["*.ts".into()],
            ..Default::default()
        },
        rule: Box::new(EditRule {
            kind,
            matcher,
            find: find.into(),
            replacement: replacement.into(),
        }),
        apply,
        expected,
    }
}

fn hashes(preview: &Value) -> Result<BTreeMap<String, String>> {
    let files = preview["files"]
        .as_array()
        .ok_or_else(|| WorkspaceError::Invalid("missing preview files".into()))?;
    files
        .iter()
        .map(|file| {
            let path = file["path"]
                .as_str()
                .ok_or_else(|| WorkspaceError::Invalid("missing path".into()))?;
            let hash = file["before_hash"]
                .as_str()
                .ok_or_else(|| WorkspaceError::Invalid("missing hash".into()))?;
            Ok((path.to_owned(), hash.to_owned()))
        })
        .collect()
}

#[tokio::test]
async fn preview_and_apply_preserve_unicode_crlf_and_literal_dollars() -> Result<()> {
    let root = tempfile::tempdir()?;
    let path = root.path().join("été.ts");
    write(&path, "été();\r\nfoo();\r\n".as_bytes())?;
    let preview = execute(
        root.path(),
        edit(
            EditKind::AddBefore,
            Matcher::Text,
            "foo",
            "$1",
            false,
            BTreeMap::new(),
        ),
    )
    .await?;
    assert_eq!(read(&path)?, "été();\r\nfoo();\r\n".as_bytes());
    assert_eq!(
        preview["files"][0]["locations"][0],
        json!({"start": 10, "end": 13, "line": 2, "column": 1})
    );
    let applied = execute(
        root.path(),
        edit(
            EditKind::AddBefore,
            Matcher::Text,
            "foo",
            "$1",
            true,
            hashes(&preview)?,
        ),
    )
    .await?;
    assert_eq!(applied["files"][0]["applied"], true);
    assert_eq!(read(&path)?, "été();\r\n$1foo();\r\n".as_bytes());
    Ok(())
}

#[tokio::test]
async fn missing_or_stale_expected_hash_never_starts_a_multi_file_edit() -> Result<()> {
    let root = tempfile::tempdir()?;
    let a = root.path().join("a.ts");
    let z = root.path().join("z.ts");
    write(&a, b"old").unwrap();
    write(&z, b"old").unwrap();
    let preview = execute(
        root.path(),
        edit(
            EditKind::Replace,
            Matcher::Text,
            "old",
            "new",
            false,
            BTreeMap::new(),
        ),
    )
    .await?;
    let mut partial = hashes(&preview)?;
    partial.remove("z.ts");
    assert!(matches!(
        execute(
            root.path(),
            edit(
                EditKind::Replace,
                Matcher::Text,
                "old",
                "new",
                true,
                partial
            )
        )
        .await,
        Err(WorkspaceError::Conflict(_))
    ));
    assert_eq!(read(&a)?, b"old");
    assert_eq!(read(&z)?, b"old");
    write(&z, b"old changed externally").unwrap();
    assert!(matches!(
        execute(
            root.path(),
            edit(
                EditKind::Replace,
                Matcher::Text,
                "old",
                "new",
                true,
                hashes(&preview)?
            )
        )
        .await,
        Err(WorkspaceError::Conflict(_))
    ));
    assert_eq!(read(&a)?, b"old");
    assert_eq!(read(&z)?, b"old changed externally");
    Ok(())
}

#[tokio::test]
async fn regex_replacement_expands_captures_but_insertions_are_literal() -> Result<()> {
    let root = tempfile::tempdir()?;
    let path = root.path().join("main.ts");
    write(&path, b"foo42").unwrap();
    let preview = execute(
        root.path(),
        edit(
            EditKind::Replace,
            Matcher::Regex,
            r"foo(?P<id>\d+)",
            "${id}$$",
            false,
            BTreeMap::new(),
        ),
    )
    .await?;
    execute(
        root.path(),
        edit(
            EditKind::Replace,
            Matcher::Regex,
            r"foo(?P<id>\d+)",
            "${id}$$",
            true,
            hashes(&preview)?,
        ),
    )
    .await?;
    assert_eq!(read(&path)?, b"42$");
    let preview = execute(
        root.path(),
        edit(
            EditKind::AddAfter,
            Matcher::Regex,
            r"\d+",
            "$1",
            false,
            BTreeMap::new(),
        ),
    )
    .await?;
    execute(
        root.path(),
        edit(
            EditKind::AddAfter,
            Matcher::Regex,
            r"\d+",
            "$1",
            true,
            hashes(&preview)?,
        ),
    )
    .await?;
    assert_eq!(read(&path)?, b"42$1$");
    Ok(())
}

#[tokio::test]
async fn physical_entry_limit_counts_files_excluded_by_a_glob() -> Result<()> {
    let root = tempfile::tempdir()?;
    for index in 0..16 {
        write(&root.path().join(format!("ignored-{index}.txt")), b"x")?;
    }
    let mut request = request(
        root.path(),
        FileTask::Scan {
            selection: Selection {
                globs: vec!["*.ts".into()],
                ..Default::default()
            },
            hash: false,
            parse: false,
        },
    );
    request.limits.max_entries = 8;
    request.limits.max_files = 1;
    assert!(matches!(
        crate::run(request, Arc::new(AtomicBool::new(false))).await,
        Err(WorkspaceError::Limit("directory entries"))
    ));
    Ok(())
}

#[tokio::test]
async fn native_scan_honors_nested_ignore_rules_and_uses_existing_graph_extractor() -> Result<()> {
    let root = tempfile::tempdir()?;
    bun_sys::mkdir_recursive(root.path().join("src").as_os_str().as_encoded_bytes())?;
    write(&root.path().join(".gitignore"), b"*.ignored.ts\n")?;
    write(&root.path().join("src/.ignore"), b"skip.ts\n")?;
    write(&root.path().join("src/skip.ts"), b"export const skip = 1;")?;
    write(
        &root.path().join("src/one.ignored.ts"),
        b"export const skip = 2;",
    )?;
    write(
        &root.path().join("src/main.ts"),
        b"export function greet() { return 1; }",
    )?;
    let result = execute(
        root.path(),
        FileTask::Scan {
            selection: Selection::default(),
            hash: true,
            parse: true,
        },
    )
    .await?;
    assert_eq!(result["count"], 1);
    assert_eq!(result["files"][0]["parse"]["extractor"], "bun_graph");
    let nodes = result["files"][0]["parse"]["syntax"]["nodes"]
        .as_array()
        .ok_or_else(|| WorkspaceError::Invalid("missing native syntax".into()))?;
    assert!(nodes.iter().any(|node| node["label"] == "greet()"));
    Ok(())
}

#[tokio::test]
async fn dependency_order_and_shared_budget_are_enforced_before_unstarted_stages() -> Result<()> {
    let root = tempfile::tempdir()?;
    write(
        &root.path().join("main.py"),
        b"def greet():\n    return 1\n",
    )?;
    let task = FileTask::Inspect {
        path: PathBuf::from("main.py"),
        mode: InspectMode::Parse,
    };
    let stages = vec![
        Stage {
            id: "first".into(),
            depends_on: vec![],
            task: task.clone(),
        },
        Stage {
            id: "second".into(),
            depends_on: vec!["first".into()],
            task,
        },
    ];
    let mut request = WorkspaceRequest {
        root: root.path().to_owned(),
        limits: Limits::default(),
        operation: WorkspaceOperation::Workflow {
            stages,
            concurrency: 2,
        },
    };
    request.limits.max_files = 1;
    let result = crate::run(request, Arc::new(AtomicBool::new(false))).await;
    match result {
        Err(WorkspaceError::Workflow {
            stage,
            completed,
            source,
        }) => {
            assert_eq!(stage, "second");
            assert_eq!(completed, ["first"]);
            assert!(matches!(*source, WorkspaceError::Limit("files")));
        }
        result => {
            return Err(WorkspaceError::Invalid(format!(
                "unexpected workflow result: {result:?}"
            )));
        }
    }
    Ok(())
}

#[tokio::test]
async fn cycles_and_cancellation_fail_without_opening_the_workspace() -> Result<()> {
    let stages = vec![
        Stage {
            id: "one".into(),
            depends_on: vec!["two".into()],
            task: FileTask::Can {
                path: "x".into(),
                write: false,
            },
        },
        Stage {
            id: "two".into(),
            depends_on: vec!["one".into()],
            task: FileTask::Can {
                path: "x".into(),
                write: false,
            },
        },
    ];
    let temporary = tempfile::tempdir()?;
    let root = temporary.path().join("nonexistent-workspace-fixture");
    let cyclic = WorkspaceRequest {
        root: root.clone(),
        limits: Limits::default(),
        operation: WorkspaceOperation::Workflow {
            stages,
            concurrency: 1,
        },
    };
    assert!(matches!(
        crate::run(cyclic, Arc::new(AtomicBool::new(false))).await,
        Err(WorkspaceError::Invalid(_))
    ));
    let cancelled = request(
        &root,
        FileTask::Can {
            path: "x".into(),
            write: false,
        },
    );
    assert!(matches!(
        crate::run(cancelled, Arc::new(AtomicBool::new(true))).await,
        Err(WorkspaceError::Cancelled)
    ));
    Ok(())
}

#[tokio::test]
async fn traversal_and_symlink_targets_are_rejected() -> Result<()> {
    let root = tempfile::tempdir()?;
    let outside = tempfile::tempdir()?;
    write(&outside.path().join("secret.ts"), b"protected")?;
    let escape = execute(
        root.path(),
        FileTask::Inspect {
            path: "../secret.ts".into(),
            mode: InspectMode::Parse,
        },
    )
    .await;
    assert!(matches!(escape, Err(WorkspaceError::Sandbox(_))));
    #[cfg(unix)]
    {
        let target = bun_core::ZBox::from_bytes(outside.path().as_os_str().as_encoded_bytes());
        let link =
            bun_core::ZBox::from_bytes(root.path().join("link").as_os_str().as_encoded_bytes());
        bun_sys::symlink(target.as_zstr(), link.as_zstr())?;
        let escape = execute(
            root.path(),
            FileTask::Inspect {
                path: "link/secret.ts".into(),
                mode: InspectMode::Parse,
            },
        )
        .await;
        assert!(escape.is_err());
    }
    Ok(())
}
