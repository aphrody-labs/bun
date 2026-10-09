// SPDX-License-Identifier: Apache-2.0
//! `git_ingest`: a directory as one prompt-ready digest (GitIngest layout).

use bun_threading::Guarded;
use std::{
    cmp::Ordering,
    collections::BTreeMap,
    fmt::Write as _,
    path::{Path, PathBuf},
};

use serde_json::Value;

use crate::{Context, Result, ToolError, args, walk};

const DEFAULT_MAX_FILE_SIZE: usize = 10 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES: usize = 16 * 1024 * 1024;
const SEPARATOR: &str = "================================================";

pub(crate) fn call(ctx: &Context<'_>, args: &Value) -> Result<String> {
    let source = ctx.resolve(args::str(args, "source"));
    let subpath = args::str(args, "subpath").filter(|s| !s.is_empty());
    let include = args::strings(args, "include_patterns")?;
    let exclude = args::strings(args, "exclude_patterns")?;
    let max_file_size = args::usize(args, "max_file_size", DEFAULT_MAX_FILE_SIZE)?;
    let max_total = args::usize(args, "max_total_bytes", DEFAULT_MAX_TOTAL_BYTES)?;
    ingest(
        ctx,
        &source,
        subpath,
        &include,
        &exclude,
        max_file_size,
        max_total,
    )
}

struct Ingested {
    relative: PathBuf,
    /// `None`: binary, not UTF-8 or over the size limit.
    text: Option<String>,
}

pub(crate) fn ingest(
    ctx: &Context<'_>,
    source: &Path,
    subpath: Option<&str>,
    include: &[String],
    exclude: &[String],
    max_file_size: usize,
    max_total: usize,
) -> Result<String> {
    if !walk::is_dir(source) {
        return Err(ToolError::NotFound(format!(
            "not a directory: {}",
            source.display()
        )));
    }
    let root = match subpath {
        Some(sub) => source.join(sub),
        None => source.to_path_buf(),
    };
    if !walk::is_dir(&root) {
        return Err(ToolError::NotFound(format!(
            "not a directory: {}",
            root.display()
        )));
    }
    let prefix = subpath.map(PathBuf::from).unwrap_or_default();
    let mut found = Guarded::new(Vec::new());
    let mut error = Guarded::new(None);
    let walker = walk::Walk {
        root: &root,
        include,
        exclude,
        gitignore: true,
        max_depth: None,
    };
    walker.visit(
        ctx,
        |entry| {
            let text = if entry.size as usize > max_file_size {
                None
            } else {
                let bytes = walk::read(&root.join(&entry.relative))?;
                // Binary or not UTF-8 means not text for a prompt; the tree still lists the file.
                if walk::is_binary(&bytes) || core::str::from_utf8(&bytes).is_err() {
                    None
                } else {
                    // SAFETY: validated as UTF-8 just above.
                    Some(unsafe { String::from_utf8_unchecked(bytes) })
                }
            };
            found.lock().push(Ingested {
                relative: prefix.join(&entry.relative),
                text,
            });
            Ok(())
        },
        &error,
    );
    if let Some(error) = core::mem::take(error.get_mut()) {
        return Err(error);
    }
    let mut files = core::mem::take(found.get_mut());
    files.sort_unstable_by(|a, b| tree_order(&a.relative, &b.relative));

    let name = source
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| walk::display(source));
    let mut content = String::new();
    let mut total = 0usize;
    let mut analyzed = 0usize;
    for file in &files {
        let Some(text) = &file.text else { continue };
        if total + text.len() > max_total {
            break;
        }
        total += text.len();
        analyzed += 1;
        let _ = write!(
            content,
            "{SEPARATOR}\nFILE: {}\n{SEPARATOR}\n{text}\n\n",
            walk::display(&file.relative)
        );
    }

    let mut out = String::with_capacity(content.len() + files.len() * 32 + 256);
    let _ = writeln!(out, "Directory: {name}");
    if let Some(sub) = subpath {
        let _ = writeln!(out, "Subpath: {sub}");
    }
    let _ = writeln!(out, "Files analyzed: {analyzed}");
    if analyzed < files.len() {
        let _ = writeln!(out, "Files listed only: {}", files.len() - analyzed);
    }
    let _ = writeln!(
        out,
        "Estimated tokens: {}",
        format_tokens(estimate_tokens(&content))
    );
    out.push_str("\nDirectory structure:\n");
    render_tree(&mut out, &name, files.iter().map(|f| f.relative.as_path()));
    out.push('\n');
    out.push_str(&content);
    Ok(out)
}

/// Files before directories at each level, case-insensitive, like GitIngest.
fn tree_order(a: &Path, b: &Path) -> Ordering {
    let mut a_parts = a.components().peekable();
    let mut b_parts = b.components().peekable();
    loop {
        match (a_parts.next(), b_parts.next()) {
            (Some(x), Some(y)) => {
                let a_dir = a_parts.peek().is_some();
                let b_dir = b_parts.peek().is_some();
                if a_dir != b_dir {
                    return if a_dir {
                        Ordering::Greater
                    } else {
                        Ordering::Less
                    };
                }
                let (x, y) = (
                    x.as_os_str().to_string_lossy(),
                    y.as_os_str().to_string_lossy(),
                );
                let order = x
                    .to_lowercase()
                    .cmp(&y.to_lowercase())
                    .then_with(|| x.cmp(&y));
                if order != Ordering::Equal {
                    return order;
                }
            }
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
        }
    }
}

#[derive(Default)]
struct Node {
    files: Vec<String>,
    dirs: BTreeMap<String, Node>,
    order: Vec<String>,
}

fn render_tree<'a>(out: &mut String, name: &str, paths: impl Iterator<Item = &'a Path>) {
    let mut root = Node::default();
    for path in paths {
        let parts: Vec<String> = path
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect();
        let Some((file, dirs)) = parts.split_last() else {
            continue;
        };
        let mut node = &mut root;
        for dir in dirs {
            if !node.dirs.contains_key(dir) {
                node.order.push(dir.clone());
            }
            node = node.dirs.entry(dir.clone()).or_default();
        }
        node.files.push(file.clone());
    }
    let _ = writeln!(out, "└── {name}/");
    render_children(out, &root, "    ");
}

fn render_children(out: &mut String, node: &Node, indent: &str) {
    let count = node.files.len() + node.order.len();
    let mut index = 0;
    for file in &node.files {
        index += 1;
        let branch = if index == count {
            "└── "
        } else {
            "├── "
        };
        let _ = writeln!(out, "{indent}{branch}{file}");
    }
    for dir in &node.order {
        index += 1;
        let last = index == count;
        let _ = writeln!(out, "{indent}{}{dir}/", if last { "└── " } else { "├── " });
        let next = format!("{indent}{}", if last { "    " } else { "│   " });
        render_children(out, &node.dirs[dir], &next);
    }
}

pub(crate) fn estimate_tokens(text: &str) -> usize {
    // Same ratio as GitIngest's tiktoken-free estimate.
    (text.chars().count() as f64 / 3.8).ceil() as usize
}

pub(crate) fn format_tokens(tokens: usize) -> String {
    match tokens {
        0..1_000 => tokens.to_string(),
        1_000..1_000_000 => format!("{:.1}k", tokens as f64 / 1_000.0),
        _ => format!("{:.1}M", tokens as f64 / 1_000_000.0),
    }
}
