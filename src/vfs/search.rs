// SPDX-License-Identifier: Apache-2.0
//! Name and path queries over an [`Index`].

use std::{cmp::Ordering, time::Instant};

use memchr::memmem;
use serde::{Deserialize, Serialize};

use crate::{
    Index, Result, SEP, VfsError,
    index::DirPaths,
    table::{FLAG_DIR, FLAG_LINK, ROOT_PARENT, UNKNOWN_MTIME, UNKNOWN_SIZE},
};

/// Hard upper bound of [`SearchQuery::limit`].
pub const MAX_LIMIT: usize = 10_000;

/// How [`SearchQuery::query`] is interpreted.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QueryMode {
    /// Whitespace-separated terms that must all occur; a term with a path separator matches the
    /// root-relative path (an absolute term is anchored at the index root), others the name.
    #[default]
    Substring,
    /// Glob (`*.rs`, `src/**/mod.rs`); matched against the name, or the root-relative path when
    /// the pattern has a separator.
    Glob,
    /// Regular expression; matched against the name, or the root-relative path (with `/`
    /// separators) when the pattern contains `/`.
    Regex,
    /// Whole name equality.
    Exact,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KindFilter {
    File,
    Dir,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    /// Exact name, then name prefix, then name contains, then path-only matches; shorter paths first.
    #[default]
    Relevance,
    Name,
    /// Largest first (unknown sizes last).
    Size,
    /// Most recently modified first (unknown times last).
    Mtime,
    /// Index order (fastest).
    None,
}

/// A name/path query.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct SearchQuery {
    pub query: String,
    pub mode: QueryMode,
    /// `None` is smart case: insensitive unless the query has an upper-case letter.
    pub case_sensitive: Option<bool>,
    pub kind: Option<KindFilter>,
    /// Extensions without the dot (`["ts", "tsx"]`), case-insensitive.
    pub extensions: Vec<String>,
    /// Restrict to this directory (absolute, inside the index root).
    pub under: Option<String>,
    pub offset: usize,
    /// Page size, 1..=[`MAX_LIMIT`] (default 50).
    pub limit: usize,
    pub sort: SortOrder,
}

impl Default for SearchQuery {
    fn default() -> Self {
        Self {
            query: String::new(),
            mode: QueryMode::Substring,
            case_sensitive: None,
            kind: None,
            extensions: Vec::new(),
            under: None,
            offset: 0,
            limit: 50,
            sort: SortOrder::Relevance,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HitKind {
    File,
    Dir,
    Link,
}

#[derive(Debug, Clone, Serialize)]
pub struct Hit {
    /// Absolute path.
    pub path: String,
    pub name: String,
    pub kind: HitKind,
    pub size: Option<u64>,
    /// Unix milliseconds.
    pub mtime: Option<i64>,
}

/// One page of results.
#[derive(Debug, Clone, Serialize)]
pub struct SearchPage {
    /// Number of matching entries (all pages).
    pub total: usize,
    pub offset: usize,
    pub hits: Vec<Hit>,
    /// Offset of the next page, if any.
    pub next_offset: Option<usize>,
    pub elapsed_us: u64,
}

struct PathTerm {
    /// Per directory: bit 0 = its path contains the term, bit 1 = it ends with `head` (or equals
    /// it when anchored).
    dirs: Vec<u8>,
    root: u8,
    tail: Vec<u8>,
}

enum Pattern {
    None,
    Glob(globset::GlobMatcher),
    Regex(regex::bytes::Regex),
    Exact(Vec<u8>),
}

struct Plan<'i> {
    index: &'i Index,
    paths: Option<&'i DirPaths>,
    insensitive: bool,
    primary: Option<memmem::Finder<'static>>,
    primary_term: Vec<u8>,
    name_terms: Vec<memmem::Finder<'static>>,
    path_terms: Vec<PathTerm>,
    /// Per directory: inside `under` (`None`: no restriction).
    under: Option<(Vec<bool>, bool)>,
    kind: Option<KindFilter>,
    extensions: Vec<Vec<u8>>,
    pattern: Pattern,
    on_path: bool,
}

#[derive(Clone, Copy)]
struct Candidate {
    score: u8,
    len: u32,
    id: u32,
}

fn fold(bytes: &[u8], insensitive: bool) -> Vec<u8> {
    if insensitive {
        bytes.to_ascii_lowercase()
    } else {
        bytes.to_vec()
    }
}

fn normalize_separators(text: &str) -> Vec<u8> {
    text.bytes()
        .map(|byte| {
            if byte == b'/' || byte == b'\\' {
                SEP
            } else {
                byte
            }
        })
        .collect()
}

impl<'i> Plan<'i> {
    fn new(index: &'i Index, query: &SearchQuery) -> Result<Plan<'i>> {
        let insensitive = match query.case_sensitive {
            Some(sensitive) => !sensitive,
            None => !query.query.chars().any(char::is_uppercase),
        };
        let root = fold(index.root().as_bytes(), true);
        let mut plan = Plan {
            index,
            paths: None,
            insensitive,
            primary: None,
            primary_term: Vec::new(),
            name_terms: Vec::new(),
            path_terms: Vec::new(),
            under: None,
            kind: query.kind,
            extensions: query
                .extensions
                .iter()
                .map(|ext| {
                    let mut dotted = b".".to_vec();
                    dotted.extend_from_slice(
                        ext.trim_start_matches('.').to_ascii_lowercase().as_bytes(),
                    );
                    dotted
                })
                .collect(),
            pattern: Pattern::None,
            on_path: false,
        };
        match query.mode {
            QueryMode::Substring => {
                let mut names = Vec::new();
                for term in query.query.split_whitespace() {
                    if term.contains(['/', '\\']) {
                        let mut term = fold(&normalize_separators(term), insensitive);
                        let anchored = fold(&term, true).starts_with(&root);
                        if anchored {
                            term.drain(..root.len());
                        }
                        let paths = index.dir_paths();
                        plan.paths = Some(paths);
                        plan.path_terms
                            .push(path_term(index, paths, &term, anchored, insensitive));
                    } else {
                        names.push(fold(term.as_bytes(), insensitive));
                    }
                }
                names.sort_by_key(|term| std::cmp::Reverse(term.len()));
                let mut names = names.into_iter();
                if let Some(primary) = names.next() {
                    plan.primary = Some(memmem::Finder::new(&primary).into_owned());
                    plan.primary_term = primary;
                }
                plan.name_terms = names
                    .map(|term| memmem::Finder::new(&term).into_owned())
                    .collect();
            }
            QueryMode::Glob => {
                let pattern = query.query.trim();
                plan.on_path = pattern.contains('/') || (cfg!(windows) && pattern.contains('\\'));
                // globset compares with `/` separators (it rewrites `\` in Windows candidates).
                let pattern = if cfg!(windows) {
                    pattern.replace('\\', "/")
                } else {
                    pattern.to_owned()
                };
                let glob = globset::GlobBuilder::new(&pattern)
                    .case_insensitive(insensitive)
                    .literal_separator(true)
                    .build()?;
                plan.pattern = Pattern::Glob(glob.compile_matcher());
            }
            QueryMode::Regex => {
                plan.on_path = query.query.contains('/');
                plan.pattern = Pattern::Regex(
                    regex::bytes::RegexBuilder::new(query.query.trim())
                        .case_insensitive(insensitive)
                        .size_limit(1 << 23)
                        .build()?,
                );
            }
            QueryMode::Exact => {
                plan.pattern = Pattern::Exact(fold(query.query.trim().as_bytes(), insensitive))
            }
        }
        if plan.on_path {
            plan.paths = Some(index.dir_paths());
        }
        if let Some(under) = &query.under {
            let absolute = fold(
                &crate::walk::dir_path(&normalize_separators(under)),
                cfg!(windows),
            );
            let root_folded = fold(index.root().as_bytes(), cfg!(windows));
            let relative = absolute
                .strip_prefix(root_folded.as_slice())
                .ok_or_else(|| {
                    VfsError::Invalid(format!("`under` is outside the index root: {under}"))
                })?;
            if !relative.is_empty() {
                let paths = index.dir_paths();
                plan.paths = Some(paths);
                let blob: &[u8] = if cfg!(windows) {
                    &paths.lower
                } else {
                    &paths.blob
                };
                let mut inside = vec![false; index.len()];
                for dir in &paths.order {
                    let (from, to) = (
                        paths.offs[*dir as usize * 2] as usize,
                        paths.offs[*dir as usize * 2 + 1] as usize,
                    );
                    inside[*dir as usize] = blob[from..to].starts_with(relative);
                }
                plan.under = Some((inside, false));
            }
        }
        Ok(plan)
    }

    fn dir_path(&self, parent: u32) -> &[u8] {
        match self.paths {
            Some(paths) if parent != ROOT_PARENT => {
                let blob: &[u8] = if self.insensitive {
                    &paths.lower
                } else {
                    &paths.blob
                };
                &blob[paths.offs[parent as usize * 2] as usize
                    ..paths.offs[parent as usize * 2 + 1] as usize]
            }
            _ => &[],
        }
    }

    fn path_len(&self, id: u32) -> u32 {
        let parent = self.index.tables.parents[id as usize];
        let dir = match self.paths {
            Some(paths) if parent != ROOT_PARENT => {
                paths.offs[parent as usize * 2 + 1] - paths.offs[parent as usize * 2]
            }
            _ => 0,
        };
        dir + self.index.tables.name(id).len() as u32
    }

    /// Score of entry `id` when every filter accepts it.
    fn check(&self, id: u32, scratch: &mut Vec<u8>) -> Option<u8> {
        let tables = &self.index.tables;
        let flags = tables.flags[id as usize];
        match self.kind {
            Some(KindFilter::File) if flags & FLAG_DIR != 0 => return None,
            Some(KindFilter::Dir) if flags & FLAG_DIR == 0 => return None,
            _ => {}
        }
        let name = if self.insensitive {
            tables.lower_name(id)
        } else {
            tables.name(id)
        };
        if !self.extensions.is_empty() {
            let lower = tables.lower_name(id);
            if !self
                .extensions
                .iter()
                .any(|ext| lower.len() > ext.len() && lower.ends_with(ext))
            {
                return None;
            }
        }
        let parent = tables.parents[id as usize];
        if let Some((inside, root)) = &self.under {
            if !(if parent == ROOT_PARENT {
                *root
            } else {
                inside[parent as usize]
            }) {
                return None;
            }
        }
        if !self
            .name_terms
            .iter()
            .all(|finder| finder.find(name).is_some())
        {
            return None;
        }
        for term in &self.path_terms {
            let bits = if parent == ROOT_PARENT {
                term.root
            } else {
                term.dirs[parent as usize]
            };
            if bits & 1 == 0 && !(bits & 2 != 0 && name.starts_with(&term.tail)) {
                return None;
            }
        }
        let subject = |scratch: &mut Vec<u8>| -> usize {
            scratch.clear();
            if self.on_path {
                scratch.extend(
                    self.dir_path(parent)
                        .iter()
                        .map(|byte| if *byte == SEP { b'/' } else { *byte }),
                );
            }
            scratch.extend_from_slice(name);
            scratch.len()
        };
        let score = match &self.pattern {
            Pattern::None => match &self.primary {
                Some(_) if name == self.primary_term.as_slice() => 0,
                Some(_) if name.starts_with(&self.primary_term) => 1,
                Some(_) => 2,
                None if self.path_terms.is_empty() => 2,
                None => 3,
            },
            Pattern::Exact(exact) => {
                if name != exact.as_slice() {
                    return None;
                }
                0
            }
            Pattern::Glob(glob) => {
                subject(scratch);
                if !glob.is_match(Path::new(&*String::from_utf8_lossy(scratch))) {
                    return None;
                }
                2
            }
            Pattern::Regex(regex) => {
                subject(scratch);
                if !regex.is_match(scratch) {
                    return None;
                }
                2
            }
        };
        Some(score)
    }

    /// Candidates among entries `[from, to)`.
    fn scan(&self, from: u32, to: u32) -> Vec<Candidate> {
        let tables = &self.index.tables;
        let mut out = Vec::new();
        let mut scratch = Vec::new();
        let mut push = |id: u32, out: &mut Vec<Candidate>| {
            if let Some(score) = self.check(id, &mut scratch) {
                out.push(Candidate {
                    score,
                    len: self.path_len(id),
                    id,
                });
            }
        };
        match &self.primary {
            Some(finder) if matches!(self.pattern, Pattern::None) => {
                let blob: &[u8] = if self.insensitive {
                    &tables.lower
                } else {
                    &tables.names
                };
                let base = tables.name_offs[from as usize] as usize;
                let end = tables.name_offs[to as usize] as usize;
                let offs = &tables.name_offs[from as usize..=to as usize];
                let mut last = u32::MAX;
                for position in finder.find_iter(&blob[base..end]) {
                    let id = from
                        + (offs.partition_point(|offset| (*offset as usize - base) <= position) - 1)
                            as u32;
                    if id != last {
                        last = id;
                        push(id, &mut out);
                    }
                }
            }
            _ => {
                for id in from..to {
                    push(id, &mut out);
                }
            }
        }
        out
    }
}

/// Directories (ids) whose path in `blob` satisfies `accept(path, position)` for some occurrence
/// of `needle` at `position`; the blob is split across threads by directory.
fn dirs_matching(
    paths: &DirPaths,
    blob: &[u8],
    needle: &[u8],
    accept: impl Fn(&[u8], usize) -> bool + Sync,
) -> Vec<u32> {
    let count = paths.order.len();
    let threads = if blob.len() < 1 << 20 {
        1
    } else {
        crate::threads(0)
    };
    let step = count.div_ceil(threads).max(1);
    let finder = memmem::Finder::new(needle);
    let part = |first: usize, last: usize| -> Vec<u32> {
        let mut out = Vec::new();
        let base = paths
            .starts
            .get(first)
            .map_or(blob.len(), |start| *start as usize);
        let limit = if last < count {
            paths.starts[last] as usize
        } else {
            blob.len()
        };
        let mut at = base;
        while at < limit {
            let Some(found) = finder.find(&blob[at..limit]) else {
                break;
            };
            let position = at + found;
            let k = paths.starts[first..last].partition_point(|start| *start as usize <= position)
                - 1
                + first;
            let dir = paths.order[k];
            let (from, to) = (
                paths.offs[dir as usize * 2] as usize,
                paths.offs[dir as usize * 2 + 1] as usize,
            );
            if accept(&blob[from..to], position - from) {
                out.push(dir);
            }
            at = to;
        }
        out
    };
    if threads == 1 {
        return part(0, count);
    }
    std::thread::scope(|scope| {
        let part = &part;
        #[allow(
            clippy::needless_collect,
            reason = "every worker is spawned before the first join"
        )]
        let handles: Vec<_> = (0..threads)
            .map(|index| {
                let first = (index * step).min(count);
                scope.spawn(move || part(first, (first + step).min(count)))
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|handle| handle.join().unwrap_or_default())
            .collect()
    })
}

fn path_term(
    index: &Index,
    paths: &DirPaths,
    term: &[u8],
    anchored: bool,
    insensitive: bool,
) -> PathTerm {
    let blob: &[u8] = if insensitive {
        &paths.lower
    } else {
        &paths.blob
    };
    let split = term.len() - term.iter().rev().take_while(|byte| **byte != SEP).count();
    let (head, tail) = term.split_at(split);
    let mut dirs = vec![0_u8; index.len()];
    if anchored {
        for dir in &paths.order {
            let (from, to) = (
                paths.offs[*dir as usize * 2] as usize,
                paths.offs[*dir as usize * 2 + 1] as usize,
            );
            let path = &blob[from..to];
            dirs[*dir as usize] = u8::from(path.starts_with(term)) | (u8::from(path == head) << 1);
        }
    } else {
        for dir in dirs_matching(paths, blob, term, |path, at| at + term.len() <= path.len()) {
            dirs[dir as usize] |= 1;
        }
        if head.is_empty() {
            for dir in &paths.order {
                dirs[*dir as usize] |= 2;
            }
        } else {
            for dir in dirs_matching(paths, blob, head, |path, _| path.ends_with(head)) {
                dirs[dir as usize] |= 2;
            }
        }
    }
    PathTerm {
        dirs,
        root: u8::from(term.is_empty()) | (u8::from(head.is_empty()) << 1),
        tail: tail.to_vec(),
    }
}

use std::path::Path;

impl Index {
    /// Runs a name/path query and returns one page.
    pub fn search(&self, query: &SearchQuery) -> Result<SearchPage> {
        let started = Instant::now();
        let limit = if query.limit == 0 {
            50
        } else {
            query.limit.min(MAX_LIMIT)
        };
        let mut plan = Plan::new(self, query)?;
        if query.sort == SortOrder::Relevance && plan.paths.is_none() {
            plan.paths = Some(self.dir_paths());
        }
        let count = self.len() as u32;
        let threads = if count < 65_536 {
            1
        } else {
            crate::threads(0) as u32
        };
        let step = count.div_ceil(threads).max(1);
        let mut candidates: Vec<Candidate> = std::thread::scope(|scope| {
            let plan = &plan;
            #[allow(
                clippy::needless_collect,
                reason = "every worker is spawned before the first join"
            )]
            let handles: Vec<_> = (0..threads)
                .map(|part| {
                    let from = (part * step).min(count);
                    let to = (from + step).min(count);
                    scope.spawn(move || plan.scan(from, to))
                })
                .collect();
            handles
                .into_iter()
                .flat_map(|handle| handle.join().unwrap_or_default())
                .collect()
        });
        let total = candidates.len();
        let tables = &self.tables;
        let compare = |a: &Candidate, b: &Candidate| -> Ordering {
            match query.sort {
                SortOrder::Relevance => (a.score, a.len, a.id).cmp(&(b.score, b.len, b.id)),
                SortOrder::Name => tables
                    .lower_name(a.id)
                    .cmp(tables.lower_name(b.id))
                    .then(a.id.cmp(&b.id)),
                SortOrder::Size => {
                    let size = |id: u32| match tables.sizes[id as usize] {
                        UNKNOWN_SIZE => 0,
                        size => size.saturating_add(1),
                    };
                    size(b.id).cmp(&size(a.id)).then(a.id.cmp(&b.id))
                }
                SortOrder::Mtime => tables.mtimes[b.id as usize]
                    .cmp(&tables.mtimes[a.id as usize])
                    .then(a.id.cmp(&b.id)),
                SortOrder::None => a.id.cmp(&b.id),
            }
        };
        let end = query.offset.saturating_add(limit).min(total);
        let start = query.offset.min(end);
        if end < total && end > 0 {
            candidates.select_nth_unstable_by(end - 1, compare);
            candidates.truncate(end);
        }
        candidates.sort_unstable_by(compare);
        let hits = candidates[start..end.min(candidates.len())]
            .iter()
            .map(|candidate| self.hit(candidate.id))
            .collect();
        Ok(SearchPage {
            total,
            offset: start,
            hits,
            next_offset: (end < total).then_some(end),
            elapsed_us: started.elapsed().as_micros() as u64,
        })
    }

    pub(crate) fn hit(&self, id: u32) -> Hit {
        let index = id as usize;
        let flags = self.tables.flags[index];
        Hit {
            path: self.path(id),
            name: String::from_utf8_lossy(self.tables.name(id)).into_owned(),
            kind: if flags & FLAG_LINK != 0 {
                HitKind::Link
            } else if flags & FLAG_DIR != 0 {
                HitKind::Dir
            } else {
                HitKind::File
            },
            size: Some(self.tables.sizes[index]).filter(|size| *size != UNKNOWN_SIZE),
            mtime: Some(self.tables.mtimes[index]).filter(|mtime| *mtime != UNKNOWN_MTIME),
        }
    }
}
