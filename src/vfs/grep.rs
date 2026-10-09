// SPDX-License-Identifier: Apache-2.0
//! Bounded, paginated content search (ripgrep-style: `ignore` walker, SIMD `memmem` or
//! `regex::bytes`, memory-mapped large files, files searched in parallel and reported in path order).

use std::{
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
    time::Instant,
};

use memchr::memmem;
use serde::{Deserialize, Serialize};

use crate::{Result, VfsError};

/// Content search request. Paths in results are relative to `root` with `/` separators.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct GrepOptions {
    pub root: PathBuf,
    /// Files or directories under `root` to search (default: `root`).
    pub paths: Vec<String>,
    pub pattern: String,
    /// `pattern` is a regular expression (default: literal).
    pub regex: bool,
    /// `None` is smart case.
    pub case_sensitive: Option<bool>,
    /// Include globs; a leading `!` excludes (`["*.ts", "!*.d.ts"]`).
    pub globs: Vec<String>,
    pub gitignore: bool,
    pub hidden: bool,
    /// Larger files are skipped.
    pub max_file_bytes: u64,
    /// Hits to skip (pagination).
    pub offset: usize,
    /// Hits per page (1..=10000, default 100).
    pub limit: usize,
    /// Matching lines reported per file.
    pub max_per_file: usize,
    /// Characters kept per reported line.
    pub max_line_chars: usize,
    /// Lines of context before and after each hit (max 10).
    pub context: usize,
    /// Page budget for paths, lines and context, in bytes.
    pub max_output_bytes: usize,
    pub threads: usize,
    /// One hit per matching file.
    pub files_only: bool,
}

impl Default for GrepOptions {
    fn default() -> Self {
        Self {
            root: PathBuf::from("."),
            paths: Vec::new(),
            pattern: String::new(),
            regex: false,
            case_sensitive: None,
            globs: Vec::new(),
            gitignore: true,
            hidden: false,
            max_file_bytes: 16 << 20,
            offset: 0,
            limit: 100,
            max_per_file: 20,
            max_line_chars: 240,
            context: 0,
            max_output_bytes: 64 << 10,
            threads: 0,
            files_only: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct GrepHit {
    pub path: String,
    /// 1-based.
    pub line: usize,
    /// 1-based byte column of the match in the line.
    pub column: usize,
    pub text: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub before: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub after: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GrepPage {
    pub hits: Vec<GrepHit>,
    pub files_searched: usize,
    pub files_matched: usize,
    /// Hits found in the searched files (this page and the skipped ones).
    pub total_hits: usize,
    /// The search stopped before the last file (page full or byte budget spent).
    pub truncated: bool,
    /// `offset` of the next page.
    pub next_offset: Option<usize>,
    pub elapsed_ms: f64,
}

enum Matcher {
    Literal(Box<memmem::Finder<'static>>),
    Regex(regex::bytes::Regex),
}

impl Matcher {
    fn find(&self, haystack: &[u8], from: usize) -> Option<(usize, usize)> {
        match self {
            Matcher::Literal(finder) => finder
                .find(&haystack[from..])
                .map(|at| (from + at, from + at + finder.needle().len())),
            Matcher::Regex(regex) => regex
                .find_at(haystack, from)
                .map(|found| (found.start(), found.end())),
        }
    }
}

fn line_text(line: &[u8], max_chars: usize) -> String {
    let line = line.strip_suffix(b"\r").unwrap_or(line);
    let text = String::from_utf8_lossy(line);
    match text.char_indices().nth(max_chars) {
        Some((cut, _)) => format!("{}…", &text[..cut]),
        None => text.into_owned(),
    }
}

fn line_bounds(haystack: &[u8], at: usize) -> (usize, usize) {
    let start = memchr::memrchr(b'\n', &haystack[..at]).map_or(0, |newline| newline + 1);
    let end = memchr::memchr(b'\n', &haystack[at..]).map_or(haystack.len(), |newline| at + newline);
    (start, end)
}

struct FileResult {
    hits: Vec<GrepHit>,
    searched: bool,
}

fn search_file(
    path: &Path,
    relative: &str,
    matcher: &Matcher,
    options: &GrepOptions,
) -> FileResult {
    let none = FileResult {
        hits: Vec::new(),
        searched: false,
    };
    let Ok(file) = std::fs::File::open(path) else {
        return none;
    };
    let Ok(meta) = file.metadata() else {
        return none;
    };
    if meta.len() > options.max_file_bytes || meta.len() == 0 {
        return FileResult {
            hits: Vec::new(),
            searched: meta.len() == 0,
        };
    }
    let owned;
    let mapped;
    let haystack: &[u8] = if meta.len() >= 64 << 10 {
        // SAFETY: read-only mapping; a concurrent writer can change bytes under us, which only
        // affects what this search reports (no references escape the call).
        match unsafe { memmap2::Mmap::map(&file) } {
            Ok(map) => {
                mapped = map;
                &mapped
            }
            Err(_) => return none,
        }
    } else {
        let mut buffer = Vec::with_capacity(meta.len() as usize);
        if std::io::Read::read_to_end(&mut &file, &mut buffer).is_err() {
            return none;
        }
        owned = buffer;
        &owned
    };
    if memchr::memchr(0, &haystack[..haystack.len().min(8192)]).is_some() {
        return none;
    }
    let per_file = if options.files_only {
        1
    } else {
        options.max_per_file.max(1)
    };
    let context = options.context.min(10);
    let mut hits = Vec::new();
    let mut from = 0;
    let mut line = 1;
    let mut counted = 0;
    while hits.len() < per_file && from <= haystack.len() {
        let Some((start, _)) = matcher.find(haystack, from) else {
            break;
        };
        let (line_start, line_end) = line_bounds(haystack, start);
        line += memchr::memchr_iter(b'\n', &haystack[counted..line_start]).count();
        counted = line_start;
        let mut before = Vec::new();
        let mut after = Vec::new();
        if context > 0 && !options.files_only {
            let mut cursor = line_start;
            while before.len() < context && cursor > 0 {
                let (previous_start, previous_end) = line_bounds(haystack, cursor - 1);
                before.push(line_text(
                    &haystack[previous_start..previous_end],
                    options.max_line_chars,
                ));
                cursor = previous_start;
            }
            before.reverse();
            let mut cursor = line_end;
            while after.len() < context && cursor < haystack.len() {
                let (next_start, next_end) = line_bounds(haystack, cursor + 1);
                after.push(line_text(
                    &haystack[next_start..next_end],
                    options.max_line_chars,
                ));
                cursor = next_end;
            }
        }
        hits.push(GrepHit {
            path: relative.to_owned(),
            line,
            column: start - line_start + 1,
            text: line_text(&haystack[line_start..line_end], options.max_line_chars),
            before,
            after,
        });
        from = if line_end < haystack.len() {
            line_end + 1
        } else {
            haystack.len() + 1
        };
    }
    FileResult {
        hits,
        searched: true,
    }
}

/// Joins `path` (relative, or absolute inside `root`) to `root` without leaving it.
fn lexical(root: &Path, path: &str) -> Result<PathBuf> {
    let raw = Path::new(path);
    let relative = if raw.is_absolute() {
        raw.strip_prefix(root)
            .map_err(|_| VfsError::Outside(path.to_owned()))?
    } else {
        raw
    };
    let mut out = root.to_path_buf();
    let mut depth = 0_usize;
    for component in relative.components() {
        match component {
            std::path::Component::Normal(part) => {
                out.push(part);
                depth += 1;
            }
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir if depth > 0 => {
                out.pop();
                depth -= 1;
            }
            _ => return Err(VfsError::Outside(path.to_owned())),
        }
    }
    Ok(out)
}

/// Lists candidate files under the request paths, sorted.
fn list_files(
    options: &GrepOptions,
    root: &Path,
    cancel: &AtomicBool,
) -> Result<Vec<(PathBuf, String)>> {
    let mut overrides = ignore::overrides::OverrideBuilder::new(root);
    for glob in &options.globs {
        overrides.add(glob)?;
    }
    let overrides = overrides.build()?;
    let starts: Vec<PathBuf> = if options.paths.is_empty() {
        vec![root.to_path_buf()]
    } else {
        options
            .paths
            .iter()
            .map(|path| lexical(root, path))
            .collect::<Result<_>>()?
    };
    let mut builder = ignore::WalkBuilder::new(&starts[0]);
    for start in &starts[1..] {
        builder.add(start);
    }
    builder
        .hidden(!options.hidden)
        .git_ignore(options.gitignore)
        .git_exclude(options.gitignore)
        .git_global(options.gitignore)
        .ignore(options.gitignore)
        .parents(options.gitignore)
        .require_git(false)
        .follow_links(false)
        .overrides(overrides)
        .threads(crate::threads(options.threads));
    let found = std::sync::Mutex::new(Vec::new());
    builder.build_parallel().run(|| {
        let found = &found;
        Box::new(move |entry| {
            if cancel.load(std::sync::atomic::Ordering::Relaxed) {
                return ignore::WalkState::Quit;
            }
            if let Ok(entry) = entry {
                if entry.file_type().is_some_and(|kind| kind.is_file()) {
                    let path = entry.into_path();
                    let relative = path
                        .strip_prefix(root)
                        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
                        .unwrap_or_else(|_| path.to_string_lossy().into_owned());
                    found
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .push((path, relative));
                }
            }
            ignore::WalkState::Continue
        })
    });
    crate::check_cancel(cancel)?;
    let mut files = found.into_inner().unwrap_or_else(|e| e.into_inner());
    files.sort_unstable_by(|a, b| a.1.cmp(&b.1));
    files.dedup_by(|a, b| a.1 == b.1);
    Ok(files)
}

/// Searches file contents; see [`GrepOptions`].
pub fn grep(options: &GrepOptions, cancel: &AtomicBool) -> Result<GrepPage> {
    let started = Instant::now();
    if options.pattern.is_empty() {
        return Err(VfsError::Invalid("grep pattern is empty".into()));
    }
    let insensitive = match options.case_sensitive {
        Some(sensitive) => !sensitive,
        None => !options.pattern.chars().any(char::is_uppercase),
    };
    let matcher = if !options.regex && !insensitive {
        Matcher::Literal(Box::new(
            memmem::Finder::new(options.pattern.as_bytes()).into_owned(),
        ))
    } else {
        let source = if options.regex {
            options.pattern.clone()
        } else {
            regex::escape(&options.pattern)
        };
        Matcher::Regex(
            regex::bytes::RegexBuilder::new(&source)
                .case_insensitive(insensitive)
                .multi_line(true)
                .size_limit(1 << 24)
                .build()?,
        )
    };
    let root =
        std::path::absolute(&options.root).map_err(|error| crate::io_at(&options.root, error))?;
    let files = list_files(options, &root, cancel)?;
    let limit = if options.limit == 0 {
        100
    } else {
        options.limit.min(10_000)
    };
    let threads = crate::threads(options.threads);
    let batch = (threads * 32).max(64);
    let mut page = GrepPage {
        hits: Vec::new(),
        files_searched: 0,
        files_matched: 0,
        total_hits: 0,
        truncated: false,
        next_offset: None,
        elapsed_ms: 0.0,
    };
    let mut bytes = 0;
    let mut index = 0;
    'batches: while index < files.len() {
        crate::check_cancel(cancel)?;
        let chunk = &files[index..(index + batch).min(files.len())];
        let per_thread = chunk.len().div_ceil(threads).max(1);
        let results: Vec<FileResult> = std::thread::scope(|scope| {
            let matcher = &matcher;
            #[allow(
                clippy::needless_collect,
                reason = "every worker is spawned before the first join"
            )]
            let handles: Vec<_> = chunk
                .chunks(per_thread)
                .map(|part| {
                    scope.spawn(move || {
                        part.iter()
                            .map(|(path, relative)| search_file(path, relative, matcher, options))
                            .collect::<Vec<_>>()
                    })
                })
                .collect();
            handles
                .into_iter()
                .flat_map(|handle| handle.join().unwrap_or_default())
                .collect()
        });
        for result in results {
            page.files_searched += usize::from(result.searched);
            if result.hits.is_empty() {
                continue;
            }
            page.files_matched += 1;
            for hit in result.hits {
                page.total_hits += 1;
                if page.total_hits <= options.offset {
                    continue;
                }
                let size = hit.path.len()
                    + hit.text.len()
                    + hit
                        .before
                        .iter()
                        .chain(&hit.after)
                        .map(String::len)
                        .sum::<usize>()
                    + 32;
                if page.hits.len() >= limit
                    || (bytes + size > options.max_output_bytes && !page.hits.is_empty())
                {
                    page.total_hits -= 1;
                    page.truncated = true;
                    page.next_offset = Some(options.offset + page.hits.len());
                    break 'batches;
                }
                bytes += size;
                page.hits.push(hit);
            }
        }
        index += chunk.len();
    }
    page.elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    Ok(page)
}
