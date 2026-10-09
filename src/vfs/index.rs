// SPDX-License-Identifier: Apache-2.0
//! [`Index`]: build, snapshot, refresh and path reconstruction.

use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        OnceLock,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};

use globset::{GlobBuilder, GlobSet, GlobSetBuilder};
use serde::{Deserialize, Serialize};

use crate::{
    Result, SEP, VfsError,
    table::{
        self, Draft, FLAG_DIR, FLAG_HIDDEN, FLAG_LINK, Meta, ROOT_PARENT, Source, Tables,
        UNKNOWN_MTIME, UNKNOWN_SIZE,
    },
    walk::{self, WalkConfig},
};

/// Which enumeration [`Index::build`] uses.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceChoice {
    /// MFT for an NTFS volume root when the process may open the volume, else a walk.
    #[default]
    Auto,
    /// MFT only; fails when the volume cannot be opened.
    Mft,
    /// Directory traversal only.
    Walk,
}

/// What to index and how.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct IndexOptions {
    /// Directory or volume root. Empty means the system volume (`%SystemDrive%\` or `/`).
    pub root: PathBuf,
    pub source: SourceChoice,
    /// Worker threads; 0 means the available parallelism.
    pub threads: usize,
    /// Name globs (`node_modules`, `*.tmp`) or absolute paths of directories to skip.
    pub exclude: Vec<String>,
    /// Skip the operating system's virtual and bookkeeping trees (`/proc`, `/sys`,
    /// `System Volume Information`, `$Recycle.Bin`, `Windows\WinSxS`...).
    pub system_excludes: bool,
    /// Index hidden entries (dot files, `FILE_ATTRIBUTE_HIDDEN`).
    pub hidden: bool,
    /// Honour `.gitignore`, `.ignore` and git excludes (walk only).
    pub gitignore: bool,
    /// Record sizes and modification times (walk only; Unix needs one `lstat` per entry).
    pub stat: bool,
    /// Do not descend into other mounted file systems (Unix).
    pub one_file_system: bool,
    pub max_entries: usize,
}

impl Default for IndexOptions {
    fn default() -> Self {
        Self {
            root: PathBuf::new(),
            source: SourceChoice::Auto,
            threads: 0,
            exclude: Vec::new(),
            system_excludes: true,
            hidden: true,
            gitignore: false,
            stat: true,
            one_file_system: true,
            max_entries: 64 * 1024 * 1024,
        }
    }
}

/// Counters of an index.
#[derive(Debug, Clone, Serialize)]
pub struct IndexStats {
    pub root: String,
    pub source: Source,
    pub entries: usize,
    pub files: usize,
    pub directories: usize,
    pub name_bytes: usize,
    pub memory_bytes: usize,
    pub mapped: bool,
    pub built_at: i64,
    pub journal: Option<table::Journal>,
    /// Directories that could not be listed during the last walk (permissions).
    pub unreadable: usize,
}

/// What [`Index::load`] did.
#[derive(Debug, Clone, Serialize)]
pub struct LoadReport {
    pub snapshot: String,
    /// The snapshot was opened (and refreshed) rather than rebuilt.
    pub reused: bool,
    pub refresh: Option<RefreshStats>,
    /// Size of the snapshot written back, when it was.
    pub saved_bytes: Option<u64>,
}

/// What [`Index::refresh`] changed.
#[derive(Debug, Clone, Default, Serialize)]
pub struct RefreshStats {
    pub added: usize,
    pub removed: usize,
    pub updated: usize,
    /// The journal was unusable (recreated, truncated) or the source changed, so the index was rebuilt.
    pub rebuilt: bool,
    pub elapsed_ms: f64,
}

/// A queryable index of a volume or directory tree. `Send + Sync`: share it behind an `Arc`
/// (queries take `&self`; [`Index::refresh`] takes `&mut self`).
pub struct Index {
    pub(crate) meta: Meta,
    pub(crate) tables: Tables,
    pub(crate) unreadable: usize,
    dir_paths: OnceLock<DirPaths>,
}

/// Root-relative paths of every directory (`blob[offs[i]..offs[i + 1]]`, separator-terminated),
/// built on the first path query.
pub(crate) struct DirPaths {
    /// `[start, end)` of each entry's directory path in `blob` (empty for files).
    pub offs: Vec<u32>,
    pub blob: Vec<u8>,
    pub lower: Vec<u8>,
    /// Directory ids in blob order.
    pub order: Vec<u32>,
    /// Blob start of each `order` entry (ascending).
    pub starts: Vec<u32>,
}

#[derive(Clone)]
pub(crate) struct Exclusions {
    names: Option<GlobSet>,
    /// Absolute directory paths, separator-terminated (lower-cased on Windows).
    paths: HashSet<Vec<u8>>,
}

fn fold(bytes: &[u8]) -> Vec<u8> {
    if cfg!(windows) {
        bytes.to_ascii_lowercase()
    } else {
        bytes.to_vec()
    }
}

impl Exclusions {
    pub(crate) fn new(root: &[u8], options: &IndexOptions) -> Result<Self> {
        let mut names = GlobSetBuilder::new();
        let mut has_names = false;
        let mut paths = HashSet::new();
        let mut patterns: Vec<String> = options.exclude.clone();
        if options.system_excludes {
            patterns.extend(system_excludes(root));
        }
        for pattern in patterns {
            let is_path = pattern.contains('/') || pattern.contains('\\');
            if is_path {
                let normalized = pattern.replace(['/', '\\'], &(SEP as char).to_string());
                paths.insert(fold(&walk::dir_path(normalized.as_bytes())));
            } else {
                names.add(
                    GlobBuilder::new(&pattern)
                        .case_insensitive(cfg!(windows))
                        .literal_separator(true)
                        .build()?,
                );
                has_names = true;
            }
        }
        Ok(Self {
            names: if has_names {
                Some(names.build()?)
            } else {
                None
            },
            paths,
        })
    }

    /// Whether a directory called `name` is skipped wherever it is.
    pub(crate) fn excludes_name(&self, name: &[u8]) -> bool {
        self.names
            .as_ref()
            .is_some_and(|names| match std::str::from_utf8(name) {
                Ok(name) => names.is_match(Path::new(name)),
                Err(_) => false,
            })
    }

    /// Excluded absolute directory paths (separator-terminated; lower-cased on Windows).
    #[cfg(windows)]
    pub(crate) fn paths(&self) -> impl Iterator<Item = &[u8]> {
        self.paths.iter().map(Vec::as_slice)
    }

    /// Whether directory `name` in `parent` (separator-terminated) is skipped.
    pub(crate) fn excludes(&self, parent: &[u8], name: &[u8]) -> bool {
        if self.excludes_name(name) {
            return true;
        }
        if self.paths.is_empty() {
            return false;
        }
        let mut full = fold(parent);
        full.extend_from_slice(&fold(name));
        full.push(SEP);
        self.paths.contains(&full)
    }
}

fn system_excludes(root: &[u8]) -> Vec<String> {
    let root = String::from_utf8_lossy(root).into_owned();
    if cfg!(windows) {
        let drive = root.get(..3).unwrap_or("C:\\").to_owned();
        [
            "System Volume Information",
            "$Recycle.Bin",
            "$Extend",
            r"Windows\WinSxS",
        ]
        .iter()
        .map(|path| format!("{drive}{path}"))
        .collect()
    } else if cfg!(target_os = "macos") {
        ["/dev", "/System/Volumes", "/private/var/vm", "/Volumes"]
            .map(str::to_owned)
            .to_vec()
    } else {
        ["/proc", "/sys", "/dev", "/run"]
            .map(str::to_owned)
            .to_vec()
    }
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as i64)
}

/// Absolute, separator-terminated UTF-8 form of the requested root.
fn normalize_root(root: &Path) -> Result<Vec<u8>> {
    let root = if root.as_os_str().is_empty() {
        if cfg!(windows) {
            PathBuf::from(format!(
                "{}\\",
                std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_owned())
            ))
        } else {
            PathBuf::from("/")
        }
    } else {
        root.to_path_buf()
    };
    let root = std::path::absolute(&root).map_err(|error| crate::io_at(&root, error))?;
    let text = root
        .to_str()
        .ok_or_else(|| VfsError::Invalid(format!("vfs root must be UTF-8: {}", root.display())))?;
    let mut text = if cfg!(windows) {
        text.replace('/', "\\")
    } else {
        text.to_owned()
    };
    if cfg!(windows) && text.as_bytes().get(1) == Some(&b':') {
        text[..1].make_ascii_uppercase();
    }
    if !std::fs::metadata(&text)
        .map(|meta| meta.is_dir())
        .unwrap_or(false)
    {
        return Err(VfsError::Invalid(format!(
            "vfs root is not a directory: {text}"
        )));
    }
    Ok(walk::dir_path(text.as_bytes()))
}

/// `C:\` style volume root.
#[cfg(windows)]
fn is_volume_root(root: &[u8]) -> bool {
    root.len() == 3 && root[0].is_ascii_alphabetic() && root[1] == b':'
}

impl Index {
    /// Enumerates `options.root` (the system volume when empty).
    pub fn build(options: &IndexOptions, cancel: &AtomicBool) -> Result<Index> {
        let root = normalize_root(&options.root)?;
        let mut options = options.clone();
        options.root = PathBuf::from(String::from_utf8_lossy(&root).into_owned());
        let exclusions = Exclusions::new(&root, &options)?;
        let started = now();
        let root_mtime = walk::dir_mtime(&root).unwrap_or(UNKNOWN_MTIME);
        #[cfg(windows)]
        if options.source != SourceChoice::Walk && is_volume_root(&root) && !options.gitignore {
            match crate::mft::scan(&root, &options, &exclusions, cancel) {
                Ok((draft, journal)) => {
                    return Self::from_draft(
                        draft,
                        Meta {
                            root: String::from_utf8_lossy(&root).into_owned(),
                            source: Source::Mft,
                            journal: Some(journal),
                            built_at: started,
                            root_mtime,
                            options,
                        },
                        0,
                    );
                }
                Err(error) if options.source == SourceChoice::Mft => return Err(error),
                Err(VfsError::Cancelled) => return Err(VfsError::Cancelled),
                Err(_) => {}
            }
        }
        if options.source == SourceChoice::Mft {
            return Err(VfsError::Invalid(
                "the MFT source needs an NTFS volume root (C:\\) on Windows and no gitignore"
                    .into(),
            ));
        }
        let (draft, unreadable) = walk_tree(&root, &options, &exclusions, cancel)?;
        Self::from_draft(
            draft,
            Meta {
                root: String::from_utf8_lossy(&root).into_owned(),
                source: Source::Walk,
                journal: None,
                built_at: started,
                root_mtime,
                options,
            },
            unreadable,
        )
    }

    fn from_draft(draft: Draft, meta: Meta, unreadable: usize) -> Result<Index> {
        Ok(Index {
            meta,
            tables: draft.freeze()?,
            unreadable,
            dir_paths: OnceLock::new(),
        })
    }

    /// Memory-maps a snapshot written by [`Index::save`].
    pub fn open(snapshot: &Path) -> Result<Index> {
        let (meta, tables) = table::open(snapshot)?;
        Ok(Index {
            meta,
            tables,
            unreadable: 0,
            dir_paths: OnceLock::new(),
        })
    }

    /// Writes a snapshot atomically; returns its size in bytes.
    pub fn save(&self, snapshot: &Path) -> Result<u64> {
        table::save(snapshot, &self.meta, &self.tables)
    }

    /// Per-user snapshot location for `root`: `%LOCALAPPDATA%\bun\vfs` on Windows,
    /// `$XDG_CACHE_HOME/bun/vfs` or `~/.cache/bun/vfs` elsewhere (`BUN_VFS_DIR` overrides).
    pub fn default_snapshot_path(root: &str) -> PathBuf {
        let dir = std::env::var_os("BUN_VFS_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                let base = if cfg!(windows) {
                    std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
                } else {
                    std::env::var_os("XDG_CACHE_HOME")
                        .map(PathBuf::from)
                        .or_else(|| {
                            std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache"))
                        })
                };
                base.unwrap_or_else(std::env::temp_dir)
                    .join("bun")
                    .join("vfs")
            });
        // FNV-1a keeps the file name stable across processes and versions.
        let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
        for byte in fold(root.as_bytes()) {
            hash = (hash ^ u64::from(byte)).wrapping_mul(0x100_0000_01b3);
        }
        dir.join(format!("{hash:016x}.bvfs"))
    }

    /// Opens the snapshot of `options.root` (`snapshot`, else [`Index::default_snapshot_path`]) and
    /// brings it up to date, or builds the index when the snapshot is missing, unreadable or was
    /// built with other options; writes the snapshot back when it was built or changed.
    pub fn load(
        options: &IndexOptions,
        snapshot: Option<&Path>,
        cancel: &AtomicBool,
    ) -> Result<(Index, LoadReport)> {
        let root = normalize_root(&options.root)?;
        let root_text = String::from_utf8_lossy(&root).into_owned();
        let path = snapshot.map_or_else(
            || Self::default_snapshot_path(&root_text),
            Path::to_path_buf,
        );
        let mut wanted = options.clone();
        wanted.root = PathBuf::from(&root_text);
        let comparable = |options: &IndexOptions| {
            let mut options = options.clone();
            options.threads = 0;
            serde_json::to_string(&options).unwrap_or_default()
        };
        let reusable = Index::open(&path).ok().filter(|index| {
            index.meta.root == root_text && comparable(&index.meta.options) == comparable(&wanted)
        });
        let (index, reused, refresh) = match reusable {
            Some(mut index) => {
                index.meta.options.threads = options.threads;
                let stats = index.refresh(cancel)?;
                (index, true, Some(stats))
            }
            None => (Index::build(&wanted, cancel)?, false, None),
        };
        let changed = refresh
            .as_ref()
            .is_none_or(|stats| stats.rebuilt || stats.added + stats.removed + stats.updated > 0);
        let saved_bytes = if changed {
            Some(index.save(&path)?)
        } else {
            None
        };
        Ok((
            index,
            LoadReport {
                snapshot: path.to_string_lossy().into_owned(),
                reused,
                refresh,
                saved_bytes,
            },
        ))
    }

    pub fn root(&self) -> &str {
        &self.meta.root
    }

    pub fn source(&self) -> Source {
        self.meta.source
    }

    pub fn options(&self) -> &IndexOptions {
        &self.meta.options
    }

    pub fn len(&self) -> usize {
        self.tables.len()
    }

    pub fn is_empty(&self) -> bool {
        self.tables.len() == 0
    }

    pub fn stats(&self) -> IndexStats {
        let directories = self
            .tables
            .flags
            .iter()
            .filter(|flags| **flags & FLAG_DIR != 0)
            .count();
        IndexStats {
            root: self.meta.root.clone(),
            source: self.meta.source,
            entries: self.len(),
            files: self.len() - directories,
            directories,
            name_bytes: self.tables.names.len(),
            memory_bytes: self.tables.heap_bytes(),
            mapped: matches!(self.tables.parents, table::Col::Mapped { .. }),
            built_at: self.meta.built_at,
            journal: self.meta.journal,
            unreadable: self.unreadable,
        }
    }

    /// Absolute path of entry `id` (UTF-8, platform separators).
    pub fn path(&self, id: u32) -> String {
        String::from_utf8_lossy(&self.path_bytes(id)).into_owned()
    }

    pub(crate) fn path_bytes(&self, id: u32) -> Vec<u8> {
        let mut chain = Vec::with_capacity(16);
        let mut current = id;
        while current != ROOT_PARENT && chain.len() < 4096 {
            chain.push(current);
            current = self.tables.parents[current as usize];
        }
        let mut path = self.meta.root.as_bytes().to_vec();
        for (index, node) in chain.iter().rev().enumerate() {
            if index > 0 {
                path.push(SEP);
            }
            path.extend_from_slice(self.tables.name(*node));
        }
        path
    }

    /// Root-relative paths of all directories, computed once.
    pub(crate) fn dir_paths(&self) -> &DirPaths {
        self.dir_paths.get_or_init(|| {
            let count = self.len();
            let mut spans = vec![(0_u32, 0_u32); count];
            let mut done = vec![false; count];
            let mut blob = Vec::new();
            let mut stack = Vec::new();
            let (mut order, mut starts) = (Vec::new(), Vec::new());
            for start in 0..count as u32 {
                if !self.tables.is_dir(start) || done[start as usize] {
                    continue;
                }
                let mut node = start;
                while node != ROOT_PARENT && !done[node as usize] && stack.len() < 4096 {
                    stack.push(node);
                    node = self.tables.parents[node as usize];
                }
                while let Some(node) = stack.pop() {
                    let parent = self.tables.parents[node as usize];
                    let begin = blob.len() as u32;
                    if parent != ROOT_PARENT {
                        let (from, to) = spans[parent as usize];
                        blob.extend_from_within(from as usize..to as usize);
                    }
                    blob.extend_from_slice(self.tables.name(node));
                    blob.push(SEP);
                    spans[node as usize] = (begin, blob.len() as u32);
                    done[node as usize] = true;
                    order.push(node);
                    starts.push(begin);
                }
            }
            let mut offs = Vec::with_capacity(count * 2);
            for (from, to) in spans {
                offs.push(from);
                offs.push(to);
            }
            let lower = blob.to_ascii_lowercase();
            DirPaths {
                offs,
                blob,
                lower,
                order,
                starts,
            }
        })
    }

    /// Brings the index up to date: USN journal replay (MFT) or changed-directory re-listing (walk).
    pub fn refresh(&mut self, cancel: &AtomicBool) -> Result<RefreshStats> {
        let started = Instant::now();
        let mut stats = match self.meta.source {
            #[cfg(windows)]
            Source::Mft => match crate::mft::replay(self, cancel)? {
                Some(stats) => stats,
                None => self.rebuild(cancel)?,
            },
            #[cfg(not(windows))]
            Source::Mft => self.rebuild(cancel)?,
            Source::Walk => self.refresh_walk(cancel)?,
        };
        stats.elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
        Ok(stats)
    }

    fn rebuild(&mut self, cancel: &AtomicBool) -> Result<RefreshStats> {
        let before = self.len();
        *self = Index::build(&self.meta.options, cancel)?;
        Ok(RefreshStats {
            added: self.len(),
            removed: before,
            rebuilt: true,
            ..RefreshStats::default()
        })
    }

    pub(crate) fn replace_tables(&mut self, draft: Draft) -> Result<()> {
        self.tables = draft.freeze()?;
        self.dir_paths = OnceLock::new();
        self.meta.built_at = now();
        Ok(())
    }

    #[cfg(windows)]
    pub(crate) fn meta_mut(&mut self) -> &mut Meta {
        &mut self.meta
    }

    fn refresh_walk(&mut self, cancel: &AtomicBool) -> Result<RefreshStats> {
        let options = self.meta.options.clone();
        let root = self.meta.root.as_bytes().to_vec();
        if walk::dir_mtime(&root).is_none() {
            return Err(VfsError::Invalid(format!(
                "vfs root is gone: {}",
                self.meta.root
            )));
        }
        if options.gitignore {
            // Ignore rules can change with any file, so a gitignore index is rebuilt.
            return self.rebuild(cancel);
        }
        let exclusions = Exclusions::new(&root, &options)?;
        let count = self.len();
        let dirs: Vec<u32> = (0..count as u32)
            .filter(|id| self.tables.flags[*id as usize] & (FLAG_DIR | FLAG_LINK) == FLAG_DIR)
            .collect();
        let paths = self.dir_paths();
        let absolute = |id: u32| -> Vec<u8> {
            let mut path = root.clone();
            path.extend_from_slice(
                &paths.blob[paths.offs[id as usize * 2] as usize
                    ..paths.offs[id as usize * 2 + 1] as usize],
            );
            path
        };
        // Stat every directory in parallel; a changed mtime means children were added, removed or renamed.
        let threads = crate::threads(options.threads);
        let chunk = dirs.len().div_ceil(threads).max(1);
        let changed: Vec<(u32, Option<i64>)> = std::thread::scope(|scope| {
            #[allow(
                clippy::needless_collect,
                reason = "every worker is spawned before the first join"
            )]
            let handles: Vec<_> = dirs
                .chunks(chunk)
                .map(|ids| {
                    let absolute = &absolute;
                    let tables = &self.tables;
                    scope.spawn(move || {
                        let mut out = Vec::new();
                        for id in ids {
                            if cancel.load(Ordering::Relaxed) {
                                break;
                            }
                            let current = walk::dir_mtime(&absolute(*id));
                            if current != Some(tables.mtimes[*id as usize]) {
                                out.push((*id, current));
                            }
                        }
                        out
                    })
                })
                .collect();
            handles
                .into_iter()
                .filter_map(|handle| handle.join().ok())
                .flatten()
                .collect()
        });
        crate::check_cancel(cancel)?;
        let root_mtime = walk::dir_mtime(&root).unwrap_or(UNKNOWN_MTIME);
        let root_changed = root_mtime != self.meta.root_mtime;
        let mut stats = RefreshStats::default();
        if changed.is_empty() && !root_changed {
            return Ok(stats);
        }
        let mut draft = self.tables.thaw();
        let mut keep = vec![true; count];
        let mut relist: Vec<(u32, Vec<u8>)> = Vec::new();
        for (id, mtime) in &changed {
            match mtime {
                None => keep[*id as usize] = false,
                Some(mtime) => {
                    draft.mtimes[*id as usize] = *mtime;
                    relist.push((*id, absolute(*id)));
                }
            }
        }
        if root_changed {
            relist.push((ROOT_PARENT, root.clone()));
        }
        let wanted: HashSet<u32> = relist.iter().map(|(id, _)| *id).collect();
        let mut children: HashMap<u32, HashMap<Vec<u8>, u32>> = HashMap::new();
        for id in 0..count as u32 {
            let parent = self.tables.parents[id as usize];
            if wanted.contains(&parent) {
                children
                    .entry(parent)
                    .or_default()
                    .insert(self.tables.name(id).to_vec(), id);
            }
        }
        let config = WalkConfig {
            threads: 1,
            hidden: options.hidden,
            #[cfg(not(windows))]
            stat: options.stat,
            #[cfg(not(windows))]
            one_file_system: options.one_file_system,
            max_entries: options.max_entries,
            exclusions: &exclusions,
        };
        let device = 0;
        for (dir, path) in relist {
            crate::check_cancel(cancel)?;
            let mut existing = children.remove(&dir).unwrap_or_default();
            let mut fresh: Vec<(Vec<u8>, u16, u64, i64, bool)> = Vec::new();
            if walk::list_dir(&path, &config, device, &mut |child| {
                fresh.push((
                    child.name.to_vec(),
                    child.flags,
                    child.size,
                    child.mtime,
                    child.descend,
                ))
            })
            .is_err()
            {
                continue;
            }
            for (name, flags, size, mtime, descend) in fresh {
                if let Some(id) = existing.remove(&name) {
                    let index = id as usize;
                    if draft.flags[index] & FLAG_DIR != flags & FLAG_DIR {
                        // Replaced by an entry of the other kind: drop it and index the new one.
                        keep[index] = false;
                    } else {
                        if draft.sizes[index] != size
                            || (flags & FLAG_DIR == 0 && draft.mtimes[index] != mtime)
                        {
                            draft.sizes[index] = size;
                            draft.mtimes[index] = mtime;
                            stats.updated += 1;
                        }
                        draft.flags[index] = flags;
                        continue;
                    }
                }
                let id = draft.push(dir, &name, flags, size, mtime);
                keep.push(true);
                stats.added += 1;
                if descend && !exclusions.excludes(&path, &name) {
                    let sub = walk::join(&path, &name);
                    let walk_config = WalkConfig {
                        threads: crate::threads(options.threads),
                        ..config
                    };
                    let (subtree, _) = walk::walk(&sub, &walk_config, cancel)?;
                    stats.added += subtree.len();
                    splice(&mut draft, &mut keep, &subtree, id);
                }
            }
            for (_, id) in existing {
                keep[id as usize] = false;
            }
        }
        stats.removed = keep.iter().filter(|alive| !**alive).count();
        let draft = draft.retain(&keep);
        self.replace_tables(draft)?;
        self.meta.root_mtime = root_mtime;
        Ok(stats)
    }
}

/// Appends `subtree` (whose top level has [`ROOT_PARENT`]) under entry `parent` of `draft`.
pub(crate) fn splice(draft: &mut Draft, keep: &mut Vec<bool>, subtree: &Draft, parent: u32) {
    let base = draft.len() as u32;
    for id in 0..subtree.len() as u32 {
        let index = id as usize;
        let sub_parent = subtree.parents[index];
        draft.push(
            if sub_parent == ROOT_PARENT {
                parent
            } else {
                base + sub_parent
            },
            subtree.name(id),
            subtree.flags[index],
            subtree.sizes[index],
            subtree.mtimes[index],
        );
        keep.push(true);
    }
}

fn walk_tree(
    root: &[u8],
    options: &IndexOptions,
    exclusions: &Exclusions,
    cancel: &AtomicBool,
) -> Result<(Draft, usize)> {
    if options.gitignore {
        return walk_ignore(root, options, exclusions, cancel);
    }
    let config = WalkConfig {
        threads: crate::threads(options.threads),
        hidden: options.hidden,
        #[cfg(not(windows))]
        stat: options.stat,
        #[cfg(not(windows))]
        one_file_system: options.one_file_system,
        max_entries: options.max_entries,
        exclusions,
    };
    walk::walk(root, &config, cancel)
}

/// `.gitignore`-aware walk through the `ignore` crate (the ripgrep walker).
fn walk_ignore(
    root: &[u8],
    options: &IndexOptions,
    exclusions: &Exclusions,
    cancel: &AtomicBool,
) -> Result<(Draft, usize)> {
    let exclusions = exclusions.clone();
    let root_text = String::from_utf8_lossy(root).into_owned();
    let walker = ignore::WalkBuilder::new(&root_text)
        .hidden(!options.hidden)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(true)
        .require_git(false)
        .follow_links(false)
        .same_file_system(options.one_file_system)
        .threads(crate::threads(options.threads))
        .filter_entry(move |entry| {
            let Some(name) = entry.file_name().to_str() else {
                return true;
            };
            let parent = entry
                .path()
                .parent()
                .map(|parent| walk::dir_path(parent.to_string_lossy().as_bytes()))
                .unwrap_or_default();
            !(entry.file_type().is_some_and(|kind| kind.is_dir())
                && exclusions.excludes(&parent, name.as_bytes()))
        })
        .build_parallel();
    let found = std::sync::Mutex::new(Vec::<(Vec<u8>, u16, u64, i64)>::new());
    let errors = std::sync::atomic::AtomicUsize::new(0);
    walker.run(|| {
        let found = &found;
        let errors = &errors;
        let stat = options.stat;
        Box::new(move |entry| {
            if cancel.load(Ordering::Relaxed) {
                return ignore::WalkState::Quit;
            }
            let Ok(entry) = entry else {
                errors.fetch_add(1, Ordering::Relaxed);
                return ignore::WalkState::Continue;
            };
            if entry.depth() == 0 {
                return ignore::WalkState::Continue;
            }
            let kind = entry.file_type();
            let mut flags = 0;
            if kind.is_some_and(|kind| kind.is_dir()) {
                flags |= FLAG_DIR;
            }
            if kind.is_some_and(|kind| kind.is_symlink()) {
                flags |= FLAG_LINK;
            }
            if entry.file_name().to_string_lossy().starts_with('.') {
                flags |= FLAG_HIDDEN;
            }
            let (mut size, mut mtime) = (UNKNOWN_SIZE, UNKNOWN_MTIME);
            if stat {
                if let Ok(meta) = entry.metadata() {
                    if !meta.is_dir() {
                        size = meta.len();
                    }
                    mtime = meta
                        .modified()
                        .ok()
                        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                        .map_or(UNKNOWN_MTIME, |duration| duration.as_millis() as i64);
                }
            }
            let path = entry.path().to_string_lossy().as_bytes().to_vec();
            found
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push((path, flags, size, mtime));
            ignore::WalkState::Continue
        })
    });
    crate::check_cancel(cancel)?;
    let mut found = found.into_inner().unwrap_or_else(|e| e.into_inner());
    if found.len() > options.max_entries {
        return Err(VfsError::Limit("vfs max_entries"));
    }
    found.sort_unstable_by(|a, b| a.0.cmp(&b.0));
    let mut draft = Draft::default();
    let mut dirs: HashMap<Vec<u8>, u32> = HashMap::new();
    for (path, flags, size, mtime) in found {
        let relative = path.get(root.len()..).unwrap_or_default();
        let (parent, name) = match memchr::memrchr2(b'/', b'\\', relative) {
            Some(at) => (dirs.get(&relative[..at]).copied(), &relative[at + 1..]),
            None => (Some(ROOT_PARENT), relative),
        };
        let Some(parent) = parent else { continue };
        let id = draft.push(parent, name, flags, size, mtime);
        if flags & FLAG_DIR != 0 {
            dirs.insert(relative.to_vec(), id);
        }
    }
    Ok((draft, errors.load(Ordering::Relaxed)))
}
