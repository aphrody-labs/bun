// SPDX-License-Identifier: Apache-2.0
//! Gitignore-aware parallel file walking shared by the tools.

use bun_threading::Guarded;
use std::path::{Path, PathBuf};

use ignore::{WalkBuilder, WalkState, overrides::OverrideBuilder};

use crate::{Context, Result, ToolError};

pub(crate) struct Walk<'a> {
    pub(crate) root: &'a Path,
    pub(crate) include: &'a [String],
    pub(crate) exclude: &'a [String],
    /// Dependency sources are often published without their .gitignore and
    /// with dot-directories that matter (e.g. `.cargo`), so callers choose.
    pub(crate) gitignore: bool,
    pub(crate) max_depth: Option<usize>,
}

pub(crate) struct Entry {
    pub(crate) relative: PathBuf,
    pub(crate) size: u64,
}

impl Walk<'_> {
    fn builder(&self) -> Result<WalkBuilder> {
        let mut overrides = OverrideBuilder::new(self.root);
        for glob in self.include {
            overrides.add(glob)?;
        }
        for glob in self.exclude {
            overrides.add(&format!("!{glob}"))?;
        }
        let mut builder = WalkBuilder::new(self.root);
        builder
            .overrides(overrides.build()?)
            .hidden(true)
            .git_ignore(self.gitignore)
            .git_exclude(self.gitignore)
            .git_global(false)
            .ignore(self.gitignore)
            .parents(self.gitignore)
            .require_git(false)
            .follow_links(false)
            .max_depth(self.max_depth)
            .filter_entry(|entry| entry.file_name() != ".git");
        Ok(builder)
    }

    /// Calls `visit` for every regular file, from the walker's worker threads.
    /// The first error stops the walk and lands in `error`.
    pub(crate) fn visit<F>(&self, ctx: &Context<'_>, visit: F, error: &Guarded<Option<ToolError>>)
    where
        F: Fn(Entry) -> Result<()> + Sync,
    {
        let builder = match self.builder() {
            Ok(builder) => builder,
            Err(err) => {
                *error.lock() = Some(err);
                return;
            }
        };
        let fail = |err: ToolError| {
            error.lock().get_or_insert(err);
            WalkState::Quit
        };
        builder.build_parallel().run(|| {
            Box::new(|entry| {
                if let Err(err) = ctx.check() {
                    return fail(err);
                }
                let entry = match entry {
                    Ok(entry) => entry,
                    // Unreadable entries (permissions, races) are skipped like `rg` does.
                    Err(_) => return WalkState::Continue,
                };
                if !entry.file_type().is_some_and(|kind| kind.is_file()) {
                    return WalkState::Continue;
                }
                let Ok(relative) = entry.path().strip_prefix(self.root) else {
                    return WalkState::Continue;
                };
                let size = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
                match visit(Entry {
                    relative: relative.to_path_buf(),
                    size,
                }) {
                    Ok(()) => WalkState::Continue,
                    Err(err) => fail(err),
                }
            })
        });
    }
}

pub(crate) fn path_bytes(path: &Path) -> Result<&[u8]> {
    let bytes = path.as_os_str().as_encoded_bytes();
    if bun_core::strings::index_of_char(bytes, 0).is_some() {
        return Err(ToolError::Invalid(format!(
            "path contains NUL: {}",
            path.display()
        )));
    }
    Ok(bytes)
}

pub(crate) fn read(path: &Path) -> Result<Vec<u8>> {
    Ok(bun_sys::File::read_from(
        bun_sys::Fd::cwd(),
        path_bytes(path)?,
    )?)
}

/// Same heuristic as git: a NUL byte in the first 8 KiB means binary.
pub(crate) fn is_binary(bytes: &[u8]) -> bool {
    bun_core::strings::index_of_char(&bytes[..bytes.len().min(8192)], 0).is_some()
}

pub(crate) fn is_dir(path: &Path) -> bool {
    path_bytes(path).is_ok_and(|bytes| {
        bun_sys::File::openat(
            bun_sys::Fd::cwd(),
            bytes,
            bun_sys::O::RDONLY | bun_sys::O::DIRECTORY | bun_sys::O::CLOEXEC,
            0,
        )
        .is_ok()
    })
}

pub(crate) fn is_file(path: &Path) -> bool {
    path_bytes(path).is_ok_and(|bytes| {
        bun_sys::File::openat(
            bun_sys::Fd::cwd(),
            bytes,
            bun_sys::O::RDONLY | bun_sys::O::CLOEXEC,
            0,
        )
        .is_ok_and(|file| {
            file.stat()
                .is_ok_and(|stat| bun_sys::is_regular_file(stat.st_mode as bun_sys::Mode))
        })
    })
}

/// Paths in tool output always use `/`.
pub(crate) fn display(path: &Path) -> String {
    let text = path.to_string_lossy();
    if cfg!(windows) {
        text.chars()
            .map(|c| if c == '\\' { '/' } else { c })
            .collect()
    } else {
        text.into_owned()
    }
}
