// SPDX-License-Identifier: Apache-2.0
//! Whole-volume file index, bounded content search and transactional bulk edits.
//!
//! This crate is the engine behind `bun:vfs` and `bun vfs`. It depends on `std` and a few
//! pure-Rust crates only, so it links (and tests) without Bun's C++ objects.
//!
//! # Index
//!
//! [`Index::build`] enumerates a volume or directory into compact column tables:
//!
//! - **Windows, NTFS volume root, elevated token**: the master file table ([`Source::Mft`]), read
//!   raw from the volume in parallel (records in use per `$MFT` `$BITMAP`; every hard link name,
//!   sizes, modification times), or through `FSCTL_ENUM_USN_DATA` when the raw layout is not
//!   understood (one name per file, sizes and times unknown). [`Index::refresh`] then replays the
//!   USN journal from the stored checkpoint and re-reads the size and time of changed entries.
//! - **Everywhere else** (non-admin, non-NTFS, sub-directories, Linux, macOS): a parallel
//!   traversal ([`Source::Walk`]): `FindFirstFileExW` with large fetches on Windows, `readdir`
//!   plus `lstat` on Unix. [`Index::refresh`] re-lists only the directories whose modification
//!   time changed (entry added, removed or renamed), and walks new sub-trees.
//!
//! [`Index::save`] writes a snapshot that [`Index::open`] memory-maps without copying, so a
//! process that opens a 2 M entry index can answer its first query in milliseconds.
//!
//! [`Index::search`] answers name and path queries ([`SearchQuery`]): substring terms (all must
//! match; a term containing a path separator matches the full path), globs or regular
//! expressions, with kind, extension and sub-tree filters, relevance or metadata ordering, and
//! `offset`/`limit` pagination. Substring terms scan the contiguous name table with SIMD
//! `memmem`, split across threads.
//!
//! ```no_run
//! use std::sync::atomic::AtomicBool;
//! use bun_vfs::{Index, IndexOptions, SearchQuery};
//!
//! let cancel = AtomicBool::new(false);
//! let mut index = Index::build(&IndexOptions::default(), &cancel)?; // C:\ or /
//! index.save(&Index::default_snapshot_path(index.root()))?;
//! let page = index.search(&SearchQuery { query: "readme".into(), limit: 20, ..Default::default() })?;
//! for hit in &page.hits {
//!     println!("{}", hit.path);
//! }
//! index.refresh(&cancel)?; // USN journal or changed directories only
//! # Ok::<(), bun_vfs::VfsError>(())
//! ```
//!
//! # Content search
//!
//! [`grep()`] searches file contents under a root (`.gitignore` aware, hidden files skipped by
//! default) with a literal or regular expression. Files are listed, sorted, then searched in
//! parallel in path order, so pages are deterministic; every result is bounded (`limit`, lines
//! per file, characters per line, total output bytes) and the page says where the next one
//! starts ([`GrepPage::next_offset`]).
//!
//! # Bulk edit
//!
//! [`edit()`] applies an [`EditPlan`]: literal, regex or identifier (via a [`SpanProvider`])
//! replacements over files, globs and directories, file writes and deletions, then renames and
//! moves of files or directories. Everything is planned and validated first; nothing is written
//! if any step fails. `apply: false` (the default) is a dry run that returns the per-file report
//! and a bounded diff. When applying, new contents go to temporary files next to their targets,
//! originals are renamed aside, and any failure rolls back every completed step.

#![deny(unsafe_op_in_unsafe_fn)]
// std-only leaf crate: `bun_core::strings` / `bun_sys` would pull Bun's C++ objects into
// `cargo test -p bun_vfs`, so `std::fs` and `memchr` are used directly.
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

mod edit;
mod grep;
mod index;
#[cfg(windows)]
mod mft;
mod search;
mod table;
mod walk;

#[cfg(test)]
mod tests;

pub use edit::{
    EditFile, EditOp, EditPlan, EditReport, EditStatus, EditSummary, MatchKind, RenameReport,
    SpanProvider, edit,
};
pub use grep::{GrepHit, GrepOptions, GrepPage, grep};
pub use index::{Index, IndexOptions, IndexStats, RefreshStats, SourceChoice};
pub use search::{
    Hit, HitKind, KindFilter, MAX_LIMIT, QueryMode, SearchPage, SearchQuery, SortOrder,
};
pub use table::{Journal, Source};

/// Errors of every vfs operation.
#[derive(Debug, thiserror::Error)]
pub enum VfsError {
    #[error("vfs operation cancelled")]
    Cancelled,
    #[error("vfs limit exceeded: {0}")]
    Limit(&'static str),
    #[error("invalid vfs request: {0}")]
    Invalid(String),
    #[error("path is outside the edit root or crosses a link: {0}")]
    Outside(String),
    #[error("{path}: {source}")]
    Path {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Regex(#[from] regex::Error),
    #[error(transparent)]
    Glob(#[from] globset::Error),
    #[error(transparent)]
    Walk(#[from] ignore::Error),
}

pub type Result<T> = std::result::Result<T, VfsError>;

pub(crate) fn io_at(path: &std::path::Path, source: std::io::Error) -> VfsError {
    VfsError::Path {
        path: path.display().to_string(),
        source,
    }
}

pub(crate) fn check_cancel(cancel: &std::sync::atomic::AtomicBool) -> Result<()> {
    if cancel.load(std::sync::atomic::Ordering::Relaxed) {
        Err(VfsError::Cancelled)
    } else {
        Ok(())
    }
}

pub(crate) fn threads(requested: usize) -> usize {
    if requested > 0 {
        return requested.min(256);
    }
    std::thread::available_parallelism().map_or(4, |count| count.get())
}

/// Platform path separator as a byte.
pub(crate) const SEP: u8 = if cfg!(windows) { b'\\' } else { b'/' };
