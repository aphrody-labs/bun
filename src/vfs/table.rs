// SPDX-License-Identifier: Apache-2.0
//! Column storage of a volume index and its memory-mapped snapshot format.

use std::{io::Write, ops::Deref, path::Path, sync::Arc};

use serde::{Deserialize, Serialize};

use crate::{Result, VfsError, io_at};

/// Parent of entries that sit directly under the index root.
pub(crate) const ROOT_PARENT: u32 = u32::MAX;
/// `mtimes` value of an entry whose modification time is unknown (MFT source).
pub(crate) const UNKNOWN_MTIME: i64 = i64::MIN;
/// `sizes` value of an entry whose size is unknown (MFT source, directories).
pub(crate) const UNKNOWN_SIZE: u64 = u64::MAX;

pub(crate) const FLAG_DIR: u16 = 1;
pub(crate) const FLAG_LINK: u16 = 1 << 1;
pub(crate) const FLAG_HIDDEN: u16 = 1 << 2;
pub(crate) const FLAG_SYSTEM: u16 = 1 << 3;

const MAGIC: [u8; 8] = *b"BUNVFS\x02\x00";

#[cfg(target_endian = "big")]
compile_error!("the bun_vfs snapshot format is little-endian only");

/// Plain-old-data element of a column; any bit pattern is valid.
///
/// # Safety
/// Implementors must be `Copy`, have no padding and accept every bit pattern.
pub(crate) unsafe trait Pod: Copy + 'static {}
// SAFETY: integers have no padding and every bit pattern is a valid value.
unsafe impl Pod for u8 {}
// SAFETY: as above.
unsafe impl Pod for u16 {}
// SAFETY: as above.
unsafe impl Pod for u32 {}
// SAFETY: as above.
unsafe impl Pod for u64 {}
// SAFETY: as above.
unsafe impl Pod for i64 {}

/// A column owned in memory or borrowed from a mapped snapshot.
pub(crate) enum Col<T: Pod> {
    Owned(Vec<T>),
    Mapped {
        map: Arc<memmap2::Mmap>,
        offset: usize,
        len: usize,
    },
}

impl<T: Pod> Default for Col<T> {
    fn default() -> Self {
        Self::Owned(Vec::new())
    }
}

impl<T: Pod> Deref for Col<T> {
    type Target = [T];
    fn deref(&self) -> &[T] {
        match self {
            Self::Owned(values) => values,
            Self::Mapped { map, offset, len } => {
                // SAFETY: `Snapshot::open` checked that `offset` is aligned for `T` relative to a
                // page-aligned mapping and that `offset + len * size_of::<T>()` is in bounds; `T`
                // is `Pod`, and the map is kept alive by the `Arc` for the lifetime of `&self`.
                unsafe { std::slice::from_raw_parts(map.as_ptr().add(*offset).cast::<T>(), *len) }
            }
        }
    }
}

impl<T: Pod> From<Vec<T>> for Col<T> {
    fn from(values: Vec<T>) -> Self {
        Self::Owned(values)
    }
}

impl<T: Pod> Col<T> {
    fn bytes(&self) -> &[u8] {
        let values: &[T] = self;
        // SAFETY: `T` is `Pod` (no padding), so its storage is plain initialized bytes.
        unsafe {
            std::slice::from_raw_parts(values.as_ptr().cast::<u8>(), std::mem::size_of_val(values))
        }
    }
}

/// Where the entries of an index came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    /// NTFS master file table through `FSCTL_ENUM_USN_DATA` (names only, no sizes).
    Mft,
    /// Parallel directory traversal (sizes and modification times included).
    Walk,
}

/// USN journal checkpoint of an MFT-sourced index.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Journal {
    pub id: u64,
    pub next_usn: i64,
}

/// Header metadata persisted in a snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Meta {
    pub(crate) root: String,
    pub(crate) source: Source,
    pub(crate) journal: Option<Journal>,
    /// Unix milliseconds when the entries were last brought up to date.
    pub(crate) built_at: i64,
    /// Modification time of the root directory (walk refresh).
    pub(crate) root_mtime: i64,
    /// Build options, kept so `refresh` applies the same exclusions.
    pub(crate) options: crate::IndexOptions,
}

/// The frozen, query-ready tables of an index.
///
/// Entry `i` has name `names[name_offs[i]..name_offs[i + 1] - 1]` (every name is followed by a NUL),
/// parent `parents[i]` (or [`ROOT_PARENT`]); `lower` is `names` with ASCII letters lowered, used by
/// case-insensitive search.
#[derive(Default)]
pub(crate) struct Tables {
    pub(crate) parents: Col<u32>,
    pub(crate) name_offs: Col<u32>,
    pub(crate) flags: Col<u16>,
    pub(crate) sizes: Col<u64>,
    pub(crate) mtimes: Col<i64>,
    /// NTFS file reference numbers (MFT source only; empty otherwise).
    pub(crate) frns: Col<u64>,
    pub(crate) names: Col<u8>,
    pub(crate) lower: Col<u8>,
}

impl Tables {
    pub(crate) fn len(&self) -> usize {
        self.parents.len()
    }

    pub(crate) fn name(&self, id: u32) -> &[u8] {
        let id = id as usize;
        &self.names[self.name_offs[id] as usize..self.name_offs[id + 1] as usize - 1]
    }

    pub(crate) fn lower_name(&self, id: u32) -> &[u8] {
        let id = id as usize;
        &self.lower[self.name_offs[id] as usize..self.name_offs[id + 1] as usize - 1]
    }

    pub(crate) fn is_dir(&self, id: u32) -> bool {
        self.flags[id as usize] & FLAG_DIR != 0
    }

    pub(crate) fn heap_bytes(&self) -> usize {
        self.parents.bytes().len()
            + self.name_offs.bytes().len()
            + self.flags.bytes().len()
            + self.sizes.bytes().len()
            + self.mtimes.bytes().len()
            + self.frns.bytes().len()
            + self.names.len()
            + self.lower.len()
    }
}

/// Mutable entry list a build or refresh produces before [`Draft::freeze`].
#[derive(Default)]
pub(crate) struct Draft {
    pub(crate) parents: Vec<u32>,
    pub(crate) flags: Vec<u16>,
    pub(crate) sizes: Vec<u64>,
    pub(crate) mtimes: Vec<i64>,
    pub(crate) frns: Vec<u64>,
    pub(crate) name_starts: Vec<u32>,
    pub(crate) name_lens: Vec<u32>,
    pub(crate) arena: Vec<u8>,
}

impl Draft {
    pub(crate) fn push(
        &mut self,
        parent: u32,
        name: &[u8],
        flags: u16,
        size: u64,
        mtime: i64,
    ) -> u32 {
        let id = self.parents.len() as u32;
        self.parents.push(parent);
        self.flags.push(flags);
        self.sizes.push(size);
        self.mtimes.push(mtime);
        self.name_starts.push(self.arena.len() as u32);
        self.name_lens.push(name.len() as u32);
        self.arena.extend_from_slice(name);
        id
    }

    pub(crate) fn len(&self) -> usize {
        self.parents.len()
    }

    pub(crate) fn name(&self, id: u32) -> &[u8] {
        let start = self.name_starts[id as usize] as usize;
        &self.arena[start..start + self.name_lens[id as usize] as usize]
    }

    /// Keeps the entries with `keep[i]`, renumbering parents; a kept entry whose parent is dropped
    /// is dropped too, so `keep` only needs to mark subtree roots.
    pub(crate) fn retain(&mut self, keep: &[bool]) -> Draft {
        let mut map = vec![ROOT_PARENT; self.len()];
        let mut state = vec![0_u8; self.len()]; // 0 unknown, 1 keep, 2 drop
        let mut stack = Vec::new();
        for start in 0..self.len() {
            let mut id = start as u32;
            while id != ROOT_PARENT && state[id as usize] == 0 && stack.len() <= self.len() {
                stack.push(id);
                id = self.parents[id as usize];
            }
            let mut alive = id == ROOT_PARENT || state[id as usize] == 1;
            while let Some(node) = stack.pop() {
                alive = alive && keep[node as usize];
                state[node as usize] = if alive { 1 } else { 2 };
            }
        }
        // Parents precede children only for walk drafts, so ids are assigned in a first pass.
        let mut next = 0_u32;
        for id in 0..self.len() {
            if state[id] == 1 {
                map[id] = next;
                next += 1;
            }
        }
        let mut out = Draft::default();
        for id in 0..self.len() {
            if state[id] != 1 {
                continue;
            }
            let parent = self.parents[id];
            let parent = if parent == ROOT_PARENT {
                ROOT_PARENT
            } else {
                map[parent as usize]
            };
            out.push(
                parent,
                self.name(id as u32),
                self.flags[id],
                self.sizes[id],
                self.mtimes[id],
            );
            if !self.frns.is_empty() {
                out.frns.push(self.frns[id]);
            }
        }
        out
    }

    pub(crate) fn freeze(self) -> Result<Tables> {
        let count = self.len();
        let total = self.arena.len() + count;
        if total > u32::MAX as usize || count >= ROOT_PARENT as usize {
            return Err(VfsError::Limit("vfs index entries"));
        }
        let mut names = Vec::with_capacity(total);
        let mut offs = Vec::with_capacity(count + 1);
        for id in 0..count {
            offs.push(names.len() as u32);
            names.extend_from_slice(self.name(id as u32));
            names.push(0);
        }
        offs.push(names.len() as u32);
        let lower = names.to_ascii_lowercase();
        Ok(Tables {
            parents: self.parents.into(),
            name_offs: offs.into(),
            flags: self.flags.into(),
            sizes: self.sizes.into(),
            mtimes: self.mtimes.into(),
            frns: self.frns.into(),
            names: names.into(),
            lower: lower.into(),
        })
    }
}

impl Tables {
    /// Thaws the tables back into a draft for an incremental update.
    pub(crate) fn thaw(&self) -> Draft {
        let count = self.len();
        let mut draft = Draft {
            parents: self.parents.to_vec(),
            flags: self.flags.to_vec(),
            sizes: self.sizes.to_vec(),
            mtimes: self.mtimes.to_vec(),
            frns: self.frns.to_vec(),
            name_starts: Vec::with_capacity(count),
            name_lens: Vec::with_capacity(count),
            arena: Vec::with_capacity(self.names.len()),
        };
        for id in 0..count as u32 {
            let name = self.name(id);
            draft.name_starts.push(draft.arena.len() as u32);
            draft.name_lens.push(name.len() as u32);
            draft.arena.extend_from_slice(name);
        }
        draft
    }
}

fn align8(value: usize) -> usize {
    (value + 7) & !7
}

/// Writes `tables` and `meta` to `path` atomically (temp file + rename).
pub(crate) fn save(path: &Path, meta: &Meta, tables: &Tables) -> Result<u64> {
    let meta_json = serde_json::to_vec(meta)?;
    let sections: [&[u8]; 8] = [
        tables.parents.bytes(),
        tables.name_offs.bytes(),
        tables.flags.bytes(),
        tables.sizes.bytes(),
        tables.mtimes.bytes(),
        tables.frns.bytes(),
        &tables.names,
        &tables.lower,
    ];
    // Header: magic, meta length, 8 section lengths; then meta, then 8-aligned sections.
    let mut header = Vec::with_capacity(16 + 8 * 8 + meta_json.len() + 8);
    header.extend_from_slice(&MAGIC);
    header.extend_from_slice(&(meta_json.len() as u64).to_le_bytes());
    for section in sections {
        header.extend_from_slice(&(section.len() as u64).to_le_bytes());
    }
    header.extend_from_slice(&meta_json);
    header.resize(align8(header.len()), 0);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| io_at(parent, error))?;
    }
    let mut temp = path.as_os_str().to_owned();
    temp.push(format!(".{}.tmp", std::process::id()));
    let temp = std::path::PathBuf::from(temp);
    let written = (|| -> std::io::Result<u64> {
        let mut file = std::io::BufWriter::with_capacity(1 << 20, std::fs::File::create(&temp)?);
        let mut total = header.len() as u64;
        file.write_all(&header)?;
        let padding = [0_u8; 8];
        for section in sections {
            file.write_all(section)?;
            let pad = align8(section.len()) - section.len();
            file.write_all(&padding[..pad])?;
            total += (section.len() + pad) as u64;
        }
        file.into_inner()
            .map_err(|error| error.into_error())?
            .sync_all()?;
        Ok(total)
    })();
    let written = match written {
        Ok(written) => written,
        Err(error) => {
            let _ = std::fs::remove_file(&temp);
            return Err(io_at(&temp, error));
        }
    };
    if let Err(error) = replace(&temp, path) {
        let _ = std::fs::remove_file(&temp);
        return Err(io_at(path, error));
    }
    Ok(written)
}

/// Renames `temp` over `path`. A snapshot another process still maps cannot be replaced on
/// Windows, but it can be renamed aside (the mapping keeps its section alive).
fn replace(temp: &Path, path: &Path) -> std::io::Result<()> {
    match std::fs::rename(temp, path) {
        Ok(()) => Ok(()),
        Err(error) if cfg!(windows) && path.exists() => {
            let mut aside = path.as_os_str().to_owned();
            aside.push(format!(".{}.old", std::process::id()));
            std::fs::rename(path, &aside).map_err(|_| error)?;
            std::fs::rename(temp, path)?;
            let _ = std::fs::remove_file(&aside);
            Ok(())
        }
        Err(error) => Err(error),
    }
}

/// Maps a snapshot written by [`save`]; the columns borrow the mapping (no copy).
pub(crate) fn open(path: &Path) -> Result<(Meta, Tables)> {
    let file = std::fs::File::open(path).map_err(|error| io_at(path, error))?;
    // SAFETY: snapshots are only replaced by rename (`save`), never written in place, so the
    // mapped file stays immutable for the lifetime of the mapping.
    let map = unsafe { memmap2::Mmap::map(&file) }.map_err(|error| io_at(path, error))?;
    drop(file);
    let map = Arc::new(map);
    let invalid = || VfsError::Invalid(format!("not a bun vfs snapshot: {}", path.display()));
    if map.len() < 16 + 64 || map[..8] != MAGIC {
        return Err(invalid());
    }
    let read =
        |at: usize| u64::from_le_bytes(map[at..at + 8].try_into().unwrap_or([0; 8])) as usize;
    let meta_len = read(8);
    let lens: Vec<usize> = (0..8).map(|i| read(16 + i * 8)).collect();
    let meta_start: usize = 16 + 64;
    let meta_end = meta_start
        .checked_add(meta_len)
        .filter(|end| *end <= map.len())
        .ok_or_else(invalid)?;
    let meta: Meta = serde_json::from_slice(&map[meta_start..meta_end])?;
    let mut offset = align8(meta_end);
    let mut spans = [(0_usize, 0_usize); 8];
    for (index, len) in lens.iter().enumerate() {
        let end = offset
            .checked_add(*len)
            .filter(|end| *end <= map.len())
            .ok_or_else(invalid)?;
        spans[index] = (offset, *len);
        offset = align8(end);
    }
    fn col<T: Pod>(map: &Arc<memmap2::Mmap>, (offset, bytes): (usize, usize)) -> Col<T> {
        Col::Mapped {
            map: Arc::clone(map),
            offset,
            len: bytes / std::mem::size_of::<T>(),
        }
    }
    let tables = Tables {
        parents: col(&map, spans[0]),
        name_offs: col(&map, spans[1]),
        flags: col(&map, spans[2]),
        sizes: col(&map, spans[3]),
        mtimes: col(&map, spans[4]),
        frns: col(&map, spans[5]),
        names: col(&map, spans[6]),
        lower: col(&map, spans[7]),
    };
    let count = tables.parents.len();
    if tables.name_offs.len() != count + 1
        || tables.flags.len() != count
        || tables.sizes.len() != count
        || tables.mtimes.len() != count
        || (!tables.frns.is_empty() && tables.frns.len() != count)
        || tables.names.len() != tables.lower.len()
        || tables.name_offs.last().copied().unwrap_or(0) as usize != tables.names.len()
        || tables.name_offs.windows(2).any(|pair| pair[1] <= pair[0])
        || tables
            .parents
            .iter()
            .any(|parent| *parent != ROOT_PARENT && *parent as usize >= count)
    {
        return Err(invalid());
    }
    Ok((meta, tables))
}
