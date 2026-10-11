//! `vfs_find` / `vfs_grep` / `vfs_edit` / `vfs_apply` over `bun_vfs`: file name search on an index
//! kept warm for the session, bounded content search, and bulk edits previewed as a diff before
//! they are applied as one transaction.

use std::collections::HashMap;
use std::fmt::Write as _;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

use bun_vfs::{EditPlan, EditReport, GrepOptions, Index, IndexOptions, SearchQuery};
use serde_json::{Map, Value};

use crate::registry::{Annotations, Args, Context, Output, Tool, ToolError};

#[derive(Default)]
struct VfsState {
    indexes: Mutex<HashMap<PathBuf, (Index, Instant)>>,
    plans: Mutex<HashMap<u64, EditPlan>>,
    next_plan: Mutex<u64>,
    snapshots: Mutex<HashMap<u64, (PathBuf, Vec<u8>)>>,
    guards: Mutex<HashMap<u64, (PathBuf, Option<Vec<u8>>)>>,
}

/// A directory under the working directory (`path`, default: the working directory).
fn root(ctx: &Context, args: &Args<'_>) -> Result<PathBuf, ToolError> {
    let root = match args.opt_str("path") {
        Some(p) => ctx.cwd.join(p),
        None => ctx.cwd.clone(),
    };
    if root.is_dir() {
        Ok(root)
    } else {
        Err(ToolError::InvalidArgs(format!(
            "{} is not a directory",
            root.display()
        )))
    }
}

/// `args` minus the server and tool-level keys, deserialized into a `bun_vfs` request.
fn request<T: serde::de::DeserializeOwned>(args: &Args<'_>, drop: &[&str]) -> Result<T, ToolError> {
    let mut map = Map::new();
    for (k, v) in args.0 {
        if !v.is_null() && !drop.contains(&k.as_str()) {
            map.insert(k.clone(), v.clone());
        }
    }
    serde_json::from_value(Value::Object(map)).map_err(|e| ToolError::InvalidArgs(e.to_string()))
}

const CONTROL: &[&str] = &["cursor", "max_tokens", "path"];

fn find(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let root = root(ctx, args)?;
    let mut query: SearchQuery = request(args, CONTROL)?;
    query.limit = query.limit.clamp(1, 500);
    if let Some(under) = &query.under {
        query.under = Some(root.join(under).to_string_lossy().into_owned());
    }
    let state = ctx.state::<VfsState>();
    let mut indexes = state.indexes.lock().unwrap_or_else(|e| e.into_inner());
    let cancel = AtomicBool::new(false);
    let mut note = "";
    match indexes.get_mut(&root) {
        Some((index, at)) => {
            if at.elapsed() > Duration::from_secs(2) {
                index.refresh(&cancel)?;
                *at = Instant::now();
            }
        }
        None => {
            let options = IndexOptions {
                root: root.clone(),
                gitignore: true,
                hidden: false,
                ..IndexOptions::default()
            };
            indexes.insert(
                root.clone(),
                (Index::build(&options, &cancel)?, Instant::now()),
            );
            note = " (index built)";
        }
    }
    let (index, _) = indexes.get(&root).expect("inserted above");
    let page = index.search(&query)?;
    let mut out = format!(
        "{} matches under {}{note}, showing {}-{}:\n",
        page.total,
        root.display(),
        page.offset + usize::from(!page.hits.is_empty()),
        page.offset + page.hits.len()
    );
    for hit in &page.hits {
        let path = std::path::Path::new(&hit.path);
        let shown = path
            .strip_prefix(&root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        let _ = write!(out, "{shown}");
        if matches!(hit.kind, bun_vfs::HitKind::Dir) {
            out.push('/');
        }
        if let Some(size) = hit
            .size
            .filter(|_| !matches!(hit.kind, bun_vfs::HitKind::Dir))
        {
            let _ = write!(out, "  {size} B");
        }
        out.push('\n');
    }
    if let Some(next) = page.next_offset {
        let _ = writeln!(out, "… more: call vfs_find with \"offset\": {next}");
    }
    Ok(Output::text(out))
}

fn grep(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let mut options: GrepOptions = request(args, CONTROL)?;
    options.root = root(ctx, args)?;
    options.limit = options.limit.clamp(1, 1000);
    if options.pattern.is_empty() {
        return Err(ToolError::InvalidArgs("missing `pattern`".into()));
    }
    let page = bun_vfs::grep(&options, &AtomicBool::new(false))?;
    let mut out = format!(
        "{} hits in {} of {} files ({:.0} ms){}\n",
        page.total_hits,
        page.files_matched,
        page.files_searched,
        page.elapsed_ms,
        if page.truncated {
            ", page truncated"
        } else {
            ""
        }
    );
    let mut last = String::new();
    for hit in &page.hits {
        let path = hit.path.replace('\\', "/");
        if options.files_only {
            let _ = writeln!(out, "{path}");
            continue;
        }
        if path != last {
            let _ = writeln!(out, "\n{path}");
            last = path;
        }
        for (i, line) in hit.before.iter().enumerate() {
            let _ = writeln!(out, "{}-{line}", hit.line - hit.before.len() + i);
        }
        let _ = writeln!(out, "{}:{}: {}", hit.line, hit.column, hit.text);
        for (i, line) in hit.after.iter().enumerate() {
            let _ = writeln!(out, "{}-{line}", hit.line + 1 + i);
        }
    }
    if let Some(next) = page.next_offset {
        let _ = writeln!(out, "\n… more: call vfs_grep with \"offset\": {next}");
    }
    Ok(Output::text(out))
}

fn render(report: &EditReport, out: &mut String) {
    let s = &report.summary;
    let _ = writeln!(
        out,
        "{} files changed, {} created, {} deleted, {} unchanged, {} skipped; {} replacements, {} renames",
        s.files_changed,
        s.files_created,
        s.files_deleted,
        s.files_unchanged,
        s.files_skipped,
        s.replacements,
        s.renames
    );
    if let Some(error) = &report.error {
        let _ = writeln!(out, "error: {error}");
    }
    for f in report.files.iter().filter(|f| f.error.is_some()) {
        let _ = writeln!(out, "{}: {}", f.path, f.error.as_deref().unwrap_or(""));
    }
    for r in &report.renames {
        let _ = write!(out, "rename {} -> {}", r.from, r.to);
        if let Some(e) = &r.error {
            let _ = write!(out, ": {e}");
        }
        out.push('\n');
    }
    if !report.diff.is_empty() {
        let _ = write!(out, "\n{}", report.diff);
        if report.truncated_diff {
            out.push_str("\n… diff truncated (raise max_diff_lines)\n");
        }
    }
}

fn edit(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let mut plan: EditPlan = request(args, CONTROL)?;
    plan.root = root(ctx, args)?;
    plan.apply = false;
    if plan.ops.is_empty() {
        return Err(ToolError::InvalidArgs("`ops` is empty".into()));
    }
    let report = bun_vfs::edit(&plan, None, &AtomicBool::new(false))?;
    let state = ctx.state::<VfsState>();
    let mut out = String::from("Dry run: nothing was written.\n");
    render(&report, &mut out);
    if report.error.is_some() {
        return Ok(Output {
            text: out,
            is_error: true,
        });
    }
    let id = {
        let mut next = state.next_plan.lock().unwrap_or_else(|e| e.into_inner());
        *next += 1;
        *next
    };
    state
        .plans
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(id, plan);
    let _ = writeln!(
        out,
        "\nApply this exact plan with vfs_apply {{\"plan\": {id}}}."
    );
    Ok(Output::text(out))
}

fn apply(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let id = args.get("plan").and_then(Value::as_u64).ok_or_else(|| {
        ToolError::InvalidArgs("missing `plan` (the id printed by vfs_edit)".into())
    })?;
    let state = ctx.state::<VfsState>();
    let expected: Vec<_> = state
        .guards
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&id)
        .into_iter()
        .collect();
    let mut plan = state
        .plans
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&id)
        .ok_or_else(|| {
            ToolError::InvalidArgs(format!(
                "unknown or already applied plan {id}; preview it again with vfs_edit"
            ))
        })?;
    plan.apply = true;
    let report = bun_vfs::edit_guarded(&plan, None, &AtomicBool::new(false), &expected)?;
    let mut out = String::from(if report.applied {
        "Applied.\n"
    } else {
        "Not applied: every change was rolled back.\n"
    });
    render(&report, &mut out);
    state
        .indexes
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clear();
    Ok(Output {
        text: out,
        is_error: !report.applied,
    })
}

const MAX_FILE_BYTES: usize = 16 << 20;

fn file_path(ctx: &Context, args: &Args<'_>) -> Result<PathBuf, ToolError> {
    let root = ctx.cwd.canonicalize()?;
    let path = root.join(args.str("path")?);
    let resolved = if path.exists() {
        path.canonicalize()?
    } else {
        path.parent()
            .ok_or_else(|| ToolError::InvalidArgs("file has no parent".into()))?
            .canonicalize()?
            .join(
                path.file_name()
                    .ok_or_else(|| ToolError::InvalidArgs("missing file name".into()))?,
            )
    };
    let relative = resolved.strip_prefix(&root).map_err(|_| {
        ToolError::InvalidArgs("file must remain inside the working directory".into())
    })?;
    for component in relative.components() {
        let name = component.as_os_str().to_string_lossy().to_ascii_lowercase();
        if matches!(
            name.as_str(),
            ".ssh"
                | ".codex"
                | ".claude"
                | ".aphrody"
                | "cookies"
                | "sessions"
                | "credentials"
                | "models"
                | "datasets"
        ) || name == ".env"
            || name.starts_with(".env.")
            || name.ends_with(".pem")
            || name.ends_with(".key")
        {
            return Err(ToolError::InvalidArgs(
                "protected store or credential file".into(),
            ));
        }
    }
    Ok(resolved)
}

fn read_bytes(path: &std::path::Path) -> Result<Vec<u8>, ToolError> {
    let path = path
        .to_str()
        .ok_or_else(|| ToolError::InvalidArgs("path is not UTF-8".into()))?;
    let file = bun_sys::File::openat(bun_sys::Fd::cwd(), path.as_bytes(), bun_sys::O::RDONLY, 0)?;
    let size = file.get_end_pos()?;
    if size > MAX_FILE_BYTES {
        return Err(ToolError::InvalidArgs(
            "file exceeds the 16 MiB limit".into(),
        ));
    }
    let mut bytes = Vec::with_capacity(size.min(MAX_FILE_BYTES));
    let mut chunk = vec![0; 8192];
    loop {
        let count = file.pread_all(&mut chunk, bytes.len() as u64)?;
        if bytes.len() + count > MAX_FILE_BYTES {
            return Err(ToolError::InvalidArgs(
                "file exceeds the 16 MiB limit".into(),
            ));
        }
        bytes.extend_from_slice(&chunk[..count]);
        if count < chunk.len() {
            break;
        }
    }
    Ok(bytes)
}

fn read_file(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let path = file_path(ctx, args)?;
    let bytes = read_bytes(&path)?;
    let text = std::str::from_utf8(&bytes)
        .map_err(|_| ToolError::InvalidArgs("file is not UTF-8 text".into()))?;
    if text.contains('\0') {
        return Err(ToolError::InvalidArgs("binary file".into()));
    }
    let start = args.uint("start_line", 1, u64::MAX).max(1) as usize;
    let count = args.uint("line_count", 200, 5000).max(1) as usize;
    let mut out = String::new();
    for (number, line) in text.lines().enumerate().skip(start - 1).take(count) {
        let _ = writeln!(out, "{}: {line}", number + 1);
    }
    let state = ctx.state::<VfsState>();
    let mut snapshots = state.snapshots.lock().unwrap_or_else(|e| e.into_inner());
    if snapshots.len() >= 8 {
        snapshots.clear();
    }
    let mut next = state.next_plan.lock().unwrap_or_else(|e| e.into_inner());
    *next += 1;
    snapshots.insert(*next, (path, bytes));
    Ok(Output::text(format!("revision: {}\n{out}", *next)))
}

fn preview_file(ctx: &Context, args: &Args<'_>, replacement: bool) -> Result<Output, ToolError> {
    let path = file_path(ctx, args)?;
    let state = ctx.state::<VfsState>();
    let expected = if args.bool("create_only", false) {
        if path.exists() {
            return Err(ToolError::Failed("create_only file already exists".into()));
        }
        None
    } else {
        let revision = args
            .get("revision")
            .and_then(Value::as_u64)
            .ok_or_else(|| {
                ToolError::InvalidArgs(
                    "read_file revision is required to change an existing file".into(),
                )
            })?;
        let snapshots = state.snapshots.lock().unwrap_or_else(|e| e.into_inner());
        let (snapshot_path, bytes) = snapshots
            .get(&revision)
            .ok_or_else(|| ToolError::InvalidArgs("expired revision; read_file again".into()))?;
        if *snapshot_path != path {
            return Err(ToolError::InvalidArgs(
                "revision belongs to another file".into(),
            ));
        }
        if read_bytes(&path)? != *bytes {
            return Err(ToolError::Failed("file changed since read_file".into()));
        }
        Some(bytes.clone())
    };
    let relative = path
        .strip_prefix(ctx.cwd.canonicalize()?)
        .map_err(|e| ToolError::InvalidArgs(e.to_string()))?
        .to_str()
        .ok_or_else(|| ToolError::InvalidArgs("path is not UTF-8".into()))?
        .to_owned();
    let op = if replacement {
        serde_json::json!({"op":"replace","files":[relative],"find":args.str("find")?,"replace":args.str("replace")?,"expect":args.uint("expect",1,1000000)})
    } else {
        let content = args.str("content")?;
        if content.len() > MAX_FILE_BYTES {
            return Err(ToolError::InvalidArgs("content exceeds 16 MiB".into()));
        }
        serde_json::json!({"op":"write","path":relative,"content":content})
    };
    let map = serde_json::json!({"ops":[op], "path":ctx.cwd.canonicalize()?})
        .as_object()
        .expect("object")
        .clone();
    let output = edit(ctx, &Args(&map))?;
    if !output.is_error {
        let id = *state.next_plan.lock().unwrap_or_else(|e| e.into_inner());
        let mut guards = state.guards.lock().unwrap_or_else(|e| e.into_inner());
        if guards.len() >= 8
            && let Some(oldest) = guards.keys().min().copied()
        {
            guards.remove(&oldest);
            state
                .plans
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&oldest);
        }
        guards.insert(id, (path, expected));
    }
    Ok(output)
}

fn write_file(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    preview_file(ctx, args, false)
}
fn edit_file(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    preview_file(ctx, args, true)
}

const PATH: &str = r#""path":{"type":"string","description":"Directory under the working directory to work in (default: the working directory)"}"#;

pub(crate) const TOOLS: &[Tool] = &[
    Tool {
        name: "read_file",
        title: "Read native file",
        description: "Read bounded UTF-8 lines inside the working directory through bun_sys. Returns a session revision for guarded edits; protected stores and escaping symlinks are rejected.",
        input_schema: r#"{"type":"object","properties":{"path":{"type":"string"},"start_line":{"type":"integer","minimum":1},"line_count":{"type":"integer","minimum":1,"maximum":5000}},"required":["path"]}"#,
        annotations: Annotations::READ_ONLY,
        call: read_file,
    },
    Tool {
        name: "write_file",
        title: "Preview guarded file write",
        description: "Preview one native transactional write. Existing files require read_file revision; new files require create_only. Apply returned plan with vfs_apply, which rejects changed contents.",
        input_schema: r#"{"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"},"revision":{"type":"integer"},"create_only":{"type":"boolean"}},"required":["path","content"]}"#,
        annotations: Annotations::READ_ONLY,
        call: write_file,
    },
    Tool {
        name: "edit_file",
        title: "Preview guarded literal edit",
        description: "Preview an exact literal replacement using read_file revision. Requires exactly expect matches (default one); apply returned plan with vfs_apply.",
        input_schema: r#"{"type":"object","properties":{"path":{"type":"string"},"revision":{"type":"integer"},"find":{"type":"string"},"replace":{"type":"string"},"expect":{"type":"integer","minimum":1}},"required":["path","revision","find","replace"]}"#,
        annotations: Annotations::READ_ONLY,
        call: edit_file,
    },
    Tool {
        name: "vfs_find",
        title: "Find files",
        description: "Find files and directories by name or path (substring terms, glob, regex or exact name) on an index of the working directory that stays warm for the session (.gitignore honoured). Paged with offset/limit.",
        input_schema: const_format::concatcp!(
            r#"{"type":"object","properties":{"query":{"type":"string","description":"Terms that must all occur (a term with / matches the path), or a glob/regex per mode"},"mode":{"type":"string","enum":["substring","glob","regex","exact"],"default":"substring"},"kind":{"type":"string","enum":["file","dir"]},"extensions":{"type":"array","items":{"type":"string"},"description":"Without the dot"},"under":{"type":"string","description":"Sub-directory to search in"},"case_sensitive":{"type":"boolean"},"sort":{"type":"string","enum":["relevance","name","size","mtime","none"],"default":"relevance"},"offset":{"type":"integer","minimum":0,"default":0},"limit":{"type":"integer","minimum":1,"maximum":500,"default":50},"#,
            PATH,
            r#"},"required":["query"]}"#
        ),
        annotations: Annotations::READ_ONLY,
        call: find,
    },
    Tool {
        name: "vfs_grep",
        title: "Search file contents",
        description: "Search file contents for a literal or a regular expression (.gitignore honoured, hidden files skipped), in path order, with optional context lines. Paged with offset/limit.",
        input_schema: const_format::concatcp!(
            r#"{"type":"object","properties":{"pattern":{"type":"string"},"regex":{"type":"boolean","default":false},"case_sensitive":{"type":"boolean","description":"Default: smart case"},"paths":{"type":"array","items":{"type":"string"},"description":"Files or directories to search (default: all)"},"globs":{"type":"array","items":{"type":"string"},"description":"Include globs; a leading ! excludes"},"context":{"type":"integer","minimum":0,"maximum":10,"default":0},"files_only":{"type":"boolean","default":false},"hidden":{"type":"boolean","default":false},"max_per_file":{"type":"integer","minimum":1,"default":20},"offset":{"type":"integer","minimum":0,"default":0},"limit":{"type":"integer","minimum":1,"maximum":1000,"default":100},"#,
            PATH,
            r#"},"required":["pattern"]}"#
        ),
        annotations: Annotations::READ_ONLY,
        call: grep,
    },
    Tool {
        name: "vfs_edit",
        title: "Preview a bulk edit",
        description: "Plan a bulk edit and return its diff without writing anything: literal or regex replacements over files, directories and globs, file writes, deletions and renames. Returns a plan id for vfs_apply.",
        input_schema: const_format::concatcp!(
            r#"{"type":"object","properties":{"ops":{"type":"array","description":"Steps, in order","items":{"type":"object","properties":{"op":{"type":"string","enum":["replace","rename","write","delete"]},"files":{"type":"array","items":{"type":"string"},"description":"replace: files, directories or globs"},"find":{"type":"string"},"replace":{"type":"string","description":"replace: replacement ($1 / ${name} with regex)"},"matcher":{"type":"string","enum":["literal","regex"],"default":"literal"},"case_insensitive":{"type":"boolean"},"expect":{"type":"integer","description":"replace: fail unless exactly this many replacements"},"from":{"type":"string"},"to":{"type":"string"},"path":{"type":"string","description":"write/delete: the file"},"content":{"type":"string"}},"required":["op"]}},"max_diff_lines":{"type":"integer","minimum":0,"default":200},"max_files":{"type":"integer","minimum":1,"default":10000},"hidden":{"type":"boolean","default":false},"#,
            PATH,
            r#"},"required":["ops"]}"#
        ),
        annotations: Annotations::READ_ONLY,
        call: edit,
    },
    Tool {
        name: "vfs_apply",
        title: "Apply a bulk edit",
        description: "Apply a plan previewed by vfs_edit, as one transaction: every file is written or none (rolled back on any failure).",
        input_schema: r#"{"type":"object","properties":{"plan":{"type":"integer","description":"Plan id returned by vfs_edit"}},"required":["plan"]}"#,
        annotations: Annotations::DESTRUCTIVE,
        call: apply,
    },
];
