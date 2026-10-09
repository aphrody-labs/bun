// SPDX-License-Identifier: Apache-2.0
//! NTFS master file table scan and USN journal replay (`FSCTL_READ_USN_JOURNAL`).
//!
//! [`scan`] reads the `$MFT` file straight from the volume in parallel chunks: every hard link name,
//! sizes from `$DATA`, modification times from `$STANDARD_INFORMATION`. When the layout is not
//! understood it falls back to `FSCTL_ENUM_USN_DATA` (one name per file, no sizes or times; one
//! thread, which measured faster than splitting the record space).
//!
//! Opening `\\.\C:` needs an elevated token; without it [`scan`] fails and [`crate::Index::build`]
//! falls back to a walk.

use std::{
    collections::HashMap,
    sync::atomic::{AtomicBool, Ordering},
};

use crate::{
    Index, IndexOptions, RefreshStats, Result, VfsError,
    index::Exclusions,
    table::{
        Draft, FLAG_DIR, FLAG_HIDDEN, FLAG_LINK, FLAG_SYSTEM, Journal, ROOT_PARENT, UNKNOWN_MTIME,
        UNKNOWN_SIZE,
    },
};

const GENERIC_READ: u32 = 0x8000_0000;
const FILE_SHARE_READ: u32 = 1;
const FILE_SHARE_WRITE: u32 = 2;
const OPEN_EXISTING: u32 = 3;
const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
const FILE_FLAG_NO_BUFFERING: u32 = 0x2000_0000;
const INVALID_HANDLE_VALUE: isize = -1;

const FSCTL_ENUM_USN_DATA: u32 = 0x0009_00b3;
const FSCTL_READ_USN_JOURNAL: u32 = 0x0009_00bb;
const FSCTL_CREATE_USN_JOURNAL: u32 = 0x0009_00e7;
const FSCTL_QUERY_USN_JOURNAL: u32 = 0x0009_00f4;

const ERROR_HANDLE_EOF: i32 = 38;
const ERROR_JOURNAL_DELETE_IN_PROGRESS: i32 = 1178;
const ERROR_JOURNAL_NOT_ACTIVE: i32 = 1179;
const ERROR_JOURNAL_ENTRY_DELETED: i32 = 1181;

const ATTR_HIDDEN: u32 = 0x2;
const ATTR_SYSTEM: u32 = 0x4;
const ATTR_DIRECTORY: u32 = 0x10;
const ATTR_REPARSE_POINT: u32 = 0x400;

const REASON_DATA_OVERWRITE: u32 = 0x1;
const REASON_DATA_EXTEND: u32 = 0x2;
const REASON_DATA_TRUNCATION: u32 = 0x4;
const REASON_FILE_CREATE: u32 = 0x100;
const REASON_FILE_DELETE: u32 = 0x200;
const REASON_RENAME_OLD_NAME: u32 = 0x1000;
const REASON_RENAME_NEW_NAME: u32 = 0x2000;
const REASON_BASIC_INFO_CHANGE: u32 = 0x8000;
const CHANGED: u32 =
    REASON_DATA_OVERWRITE | REASON_DATA_EXTEND | REASON_DATA_TRUNCATION | REASON_BASIC_INFO_CHANGE;
/// Changed entries beyond this count keep their previous size and time.
const MAX_RESTAT: usize = 100_000;

const RECORD_MASK: u64 = 0x0000_FFFF_FFFF_FFFF;
const ROOT_RECORD: u64 = 5;
/// Records below 24 are NTFS metafiles (`$MFT`, `$LogFile`...) and reserved slots.
const FIRST_USER_RECORD: u64 = 24;
const V2_HEADER: usize = 60;
const BUFFER_LEN: usize = 1 << 20;

#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateFileW(
        name: *const u16,
        access: u32,
        share: u32,
        security: *const core::ffi::c_void,
        disposition: u32,
        flags: u32,
        template: isize,
    ) -> isize;
    fn DeviceIoControl(
        handle: isize,
        code: u32,
        input: *const core::ffi::c_void,
        input_len: u32,
        output: *mut core::ffi::c_void,
        output_len: u32,
        returned: *mut u32,
        overlapped: *mut core::ffi::c_void,
    ) -> i32;
    fn CloseHandle(handle: isize) -> i32;
    fn ReadFile(
        handle: isize,
        buffer: *mut core::ffi::c_void,
        len: u32,
        read: *mut u32,
        overlapped: *mut Overlapped,
    ) -> i32;
}

#[repr(C)]
struct Overlapped {
    internal: usize,
    internal_high: usize,
    offset: u32,
    offset_high: u32,
    event: isize,
}

struct Volume(isize);

impl Drop for Volume {
    fn drop(&mut self) {
        // SAFETY: the handle came from CreateFileW and is closed exactly once.
        unsafe { CloseHandle(self.0) };
    }
}

impl Volume {
    fn open(root: &[u8]) -> std::io::Result<Volume> {
        Self::open_with(root, FILE_FLAG_BACKUP_SEMANTICS)
    }

    fn open_with(root: &[u8], flags: u32) -> std::io::Result<Volume> {
        let drive = root[0].to_ascii_uppercase() as char;
        let path: Vec<u16> = format!(r"\\.\{drive}:")
            .encode_utf16()
            .chain(Some(0))
            .collect();
        // SAFETY: `path` is NUL-terminated and outlives the call; the other arguments are plain values.
        let handle = unsafe {
            CreateFileW(
                path.as_ptr(),
                GENERIC_READ,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                core::ptr::null(),
                OPEN_EXISTING,
                flags,
                0,
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            return Err(std::io::Error::last_os_error());
        }
        Ok(Volume(handle))
    }

    /// Reads at byte `offset`; unbuffered handles need sector-aligned offsets, lengths and buffers.
    fn read_at(&self, offset: u64, buffer: &mut [u8]) -> std::io::Result<usize> {
        let mut overlapped = Overlapped {
            internal: 0,
            internal_high: 0,
            offset: offset as u32,
            offset_high: (offset >> 32) as u32,
            event: 0,
        };
        let mut read = 0_u32;
        // SAFETY: `buffer` is writable for its length and `overlapped` (which only carries the offset
        // of this synchronous read) outlives the call.
        let ok = unsafe {
            ReadFile(
                self.0,
                buffer.as_mut_ptr().cast(),
                buffer.len() as u32,
                &raw mut read,
                &raw mut overlapped,
            )
        };
        if ok == 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(read as usize)
    }

    /// Issues `code`; returns the number of output bytes.
    fn control(&self, code: u32, input: &[u8], output: &mut [u8]) -> std::io::Result<usize> {
        let mut returned = 0_u32;
        // SAFETY: input and output point to live buffers of the stated lengths for the call.
        let ok = unsafe {
            DeviceIoControl(
                self.0,
                code,
                input.as_ptr().cast(),
                input.len() as u32,
                output.as_mut_ptr().cast(),
                output.len() as u32,
                &raw mut returned,
                core::ptr::null_mut(),
            )
        };
        if ok == 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok((returned as usize).min(output.len()))
    }

    fn query_journal(&self) -> std::io::Result<Journal> {
        let mut out = [0_u8; 80];
        self.control(FSCTL_QUERY_USN_JOURNAL, &[], &mut out)?;
        Ok(Journal {
            id: u64_at(&out, 0),
            next_usn: u64_at(&out, 16) as i64,
        })
    }

    fn query_or_create_journal(&self) -> std::io::Result<Journal> {
        match self.query_journal() {
            Err(error)
                if matches!(
                    error.raw_os_error(),
                    Some(ERROR_JOURNAL_NOT_ACTIVE | ERROR_JOURNAL_DELETE_IN_PROGRESS)
                ) =>
            {
                let mut input = [0_u8; 16];
                input[..8].copy_from_slice(&(32_u64 << 20).to_le_bytes());
                input[8..].copy_from_slice(&(4_u64 << 20).to_le_bytes());
                self.control(FSCTL_CREATE_USN_JOURNAL, &input, &mut [])?;
                self.query_journal()
            }
            other => other,
        }
    }
}

fn u64_at(bytes: &[u8], at: usize) -> u64 {
    let mut raw = [0_u8; 8];
    raw.copy_from_slice(&bytes[at..at + 8]);
    u64::from_le_bytes(raw)
}

fn u32_at(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
}

fn u16_at(bytes: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([bytes[at], bytes[at + 1]])
}

/// One decoded `USN_RECORD_V2`.
struct Record<'b> {
    frn: u64,
    parent: u64,
    reason: u32,
    attributes: u32,
    name: &'b [u8],
}

/// Iterates the V2 records of an enumeration or journal buffer (after its 8-byte prefix).
fn records(buffer: &[u8], mut each: impl FnMut(Record<'_>)) {
    let mut at = 8;
    while at + V2_HEADER <= buffer.len() {
        let len = u32_at(buffer, at) as usize;
        if len < V2_HEADER || at + len > buffer.len() {
            break;
        }
        let record = &buffer[at..at + len];
        if u16_at(record, 4) == 2 {
            let name_len = u16_at(record, 56) as usize;
            let name_at = u16_at(record, 58) as usize;
            if name_at + name_len <= len {
                each(Record {
                    frn: u64_at(record, 8),
                    parent: u64_at(record, 16),
                    reason: u32_at(record, 40),
                    attributes: u32_at(record, 52),
                    name: &record[name_at..name_at + name_len],
                });
            }
        }
        at += len;
    }
}

fn utf16_to_utf8(raw: &[u8], out: &mut Vec<u8>) {
    let units = raw
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| u16::from_le_bytes(*pair));
    let mut buf = [0_u8; 4];
    for decoded in char::decode_utf16(units) {
        out.extend_from_slice(
            decoded
                .unwrap_or('\u{FFFD}')
                .encode_utf8(&mut buf)
                .as_bytes(),
        );
    }
}

fn flags_of(attributes: u32) -> u16 {
    let mut flags = 0;
    if attributes & ATTR_DIRECTORY != 0 {
        flags |= FLAG_DIR;
    }
    if attributes & ATTR_REPARSE_POINT != 0 {
        flags |= FLAG_LINK;
    }
    if attributes & ATTR_HIDDEN != 0 {
        flags |= FLAG_HIDDEN;
    }
    if attributes & ATTR_SYSTEM != 0 {
        flags |= FLAG_SYSTEM;
    }
    flags
}

#[derive(Default)]
struct Chunk {
    frns: Vec<u64>,
    parents: Vec<u64>,
    flags: Vec<u16>,
    starts: Vec<u32>,
    lens: Vec<u32>,
    arena: Vec<u8>,
}

/// Enumerates the MFT through `FSCTL_ENUM_USN_DATA`.
fn enumerate(volume: &Volume, high_usn: i64, hidden: bool, cancel: &AtomicBool) -> Result<Chunk> {
    let mut chunk = Chunk::default();
    let mut buffer = vec![0_u8; BUFFER_LEN];
    let mut next = 0_u64;
    loop {
        crate::check_cancel(cancel)?;
        // MFT_ENUM_DATA_V0: StartFileReferenceNumber, LowUsn, HighUsn.
        let mut input = [0_u8; 24];
        input[..8].copy_from_slice(&next.to_le_bytes());
        input[16..].copy_from_slice(&high_usn.to_le_bytes());
        let returned = match volume.control(FSCTL_ENUM_USN_DATA, &input, &mut buffer) {
            Ok(returned) => returned,
            Err(error) if error.raw_os_error() == Some(ERROR_HANDLE_EOF) => break,
            Err(error) => return Err(error.into()),
        };
        if returned < 8 {
            break;
        }
        let following = u64_at(&buffer, 0);
        records(&buffer[..returned], |record| {
            let number = record.frn & RECORD_MASK;
            let dotted = record.name.first() == Some(&b'.') && record.name.get(1) == Some(&0);
            if number < FIRST_USER_RECORD
                || (!hidden && (dotted || record.attributes & ATTR_HIDDEN != 0))
            {
                return;
            }
            chunk.frns.push(record.frn);
            chunk.parents.push(record.parent);
            chunk.flags.push(flags_of(record.attributes));
            chunk.starts.push(chunk.arena.len() as u32);
            let before = chunk.arena.len();
            utf16_to_utf8(record.name, &mut chunk.arena);
            chunk.lens.push((chunk.arena.len() - before) as u32);
        });
        if following & RECORD_MASK <= next & RECORD_MASK {
            break;
        }
        next = following & RECORD_MASK;
    }
    Ok(chunk)
}

/// Maps record numbers to entry ids; checks the sequence number half of the reference.
struct ByRecord {
    ids: Vec<u32>,
}

impl ByRecord {
    fn new(frns: &[u64]) -> ByRecord {
        let max = frns.iter().map(|frn| frn & RECORD_MASK).max().unwrap_or(0) as usize;
        let mut ids = vec![u32::MAX; max + 1];
        for (id, frn) in frns.iter().enumerate() {
            ids[(frn & RECORD_MASK) as usize] = id as u32;
        }
        ByRecord { ids }
    }

    fn get(&self, frns: &[u64], frn: u64) -> Option<u32> {
        let id = *self.ids.get((frn & RECORD_MASK) as usize)?;
        (id != u32::MAX && frns[id as usize] == frn).then_some(id)
    }

    fn insert(&mut self, frn: u64, id: u32) {
        let number = (frn & RECORD_MASK) as usize;
        if number >= self.ids.len() {
            self.ids.resize(number + 1, u32::MAX);
        }
        self.ids[number] = id;
    }
}

/// Resolves the parent reference of an entry: [`ROOT_PARENT`] for the volume root, `None` when
/// the parent is not indexed (excluded, hidden, gone).
fn parent_id(by_record: &ByRecord, frns: &[u64], parent: u64) -> Option<u32> {
    if parent & RECORD_MASK == ROOT_RECORD {
        return Some(ROOT_PARENT);
    }
    by_record.get(frns, parent)
}

/// Marks excluded directories (name globs everywhere, absolute paths by component lookup).
fn apply_exclusions(draft: &Draft, root: &[u8], exclusions: &Exclusions, keep: &mut [bool]) {
    for id in 0..draft.len() as u32 {
        if draft.flags[id as usize] & FLAG_DIR != 0 && exclusions.excludes_name(draft.name(id)) {
            keep[id as usize] = false;
        }
    }
    let root_lower = root.to_ascii_lowercase();
    for path in exclusions.paths() {
        let Some(relative) = path.strip_prefix(root_lower.as_slice()) else {
            continue;
        };
        let mut parent = ROOT_PARENT;
        let mut found = true;
        for component in relative
            .split(|byte| *byte == crate::SEP)
            .filter(|part| !part.is_empty())
        {
            match (0..draft.len() as u32).find(|id| {
                draft.parents[*id as usize] == parent
                    && draft.name(*id).eq_ignore_ascii_case(component)
            }) {
                Some(id) => parent = id,
                None => {
                    found = false;
                    break;
                }
            }
        }
        if found && parent != ROOT_PARENT {
            keep[parent as usize] = false;
        }
    }
}

#[path = "mft_raw.rs"]
mod raw;

/// Indexes the whole MFT of the volume `root` (`C:\`).
pub(crate) fn scan(
    root: &[u8],
    options: &IndexOptions,
    exclusions: &Exclusions,
    cancel: &AtomicBool,
) -> Result<(Draft, Journal)> {
    let volume = Volume::open(root)?;
    let journal = volume.query_or_create_journal()?;
    let scanned = match raw::scan(root, options, cancel) {
        Ok(scanned) => scanned,
        Err(error @ (VfsError::Cancelled | VfsError::Limit(_))) => return Err(error),
        Err(_) => from_enumeration(
            enumerate(&volume, journal.next_usn, options.hidden, cancel)?,
            options,
        )?,
    };
    drop(volume);
    let Scanned {
        mut draft,
        parents_frn,
    } = scanned;
    let by_record = ByRecord::new(&draft.frns);
    let mut keep = vec![true; draft.len()];
    draft.parents = parents_frn
        .iter()
        .enumerate()
        .map(|(id, parent)| {
            parent_id(&by_record, &draft.frns, *parent).unwrap_or_else(|| {
                keep[id] = false;
                ROOT_PARENT
            })
        })
        .collect();
    apply_exclusions(&draft, root, exclusions, &mut keep);
    crate::check_cancel(cancel)?;
    Ok((draft.retain(&keep), journal))
}

/// Scanned entries whose parents are still file references.
struct Scanned {
    draft: Draft,
    parents_frn: Vec<u64>,
}

fn from_enumeration(chunk: Chunk, options: &IndexOptions) -> Result<Scanned> {
    if chunk.frns.len() > options.max_entries {
        return Err(VfsError::Limit("vfs max_entries"));
    }
    let count = chunk.frns.len();
    let draft = Draft {
        parents: Vec::new(),
        flags: chunk.flags,
        sizes: vec![UNKNOWN_SIZE; count],
        mtimes: vec![UNKNOWN_MTIME; count],
        frns: chunk.frns,
        name_starts: chunk.starts,
        name_lens: chunk.lens,
        arena: chunk.arena,
    };
    Ok(Scanned {
        draft,
        parents_frn: chunk.parents,
    })
}

fn filetime_millis(filetime: u64) -> i64 {
    if filetime == 0 {
        return UNKNOWN_MTIME;
    }
    (filetime / 10_000) as i64 - 11_644_473_600_000
}

enum Change {
    Gone,
    At {
        parent: u64,
        name: Vec<u8>,
        attributes: u32,
    },
}

/// Replays the USN journal since the index checkpoint. `Ok(None)` means the journal no longer
/// covers the checkpoint (recreated or truncated) and the index must be rebuilt.
pub(crate) fn replay(index: &mut Index, cancel: &AtomicBool) -> Result<Option<RefreshStats>> {
    let Some(checkpoint) = index.meta.journal else {
        return Ok(None);
    };
    let root = index.meta.root.as_bytes().to_vec();
    let volume = Volume::open(&root)?;
    let current = match volume.query_journal() {
        Ok(current) => current,
        Err(_) => return Ok(None),
    };
    if current.id != checkpoint.id || current.next_usn < checkpoint.next_usn {
        return Ok(None);
    }
    let mut changes: HashMap<u64, Change> = HashMap::new();
    let mut order: Vec<u64> = Vec::new();
    let mut buffer = vec![0_u8; BUFFER_LEN];
    let mut usn = checkpoint.next_usn;
    while usn < current.next_usn {
        crate::check_cancel(cancel)?;
        // READ_USN_JOURNAL_DATA_V0: StartUsn, ReasonMask, ReturnOnlyOnClose, Timeout,
        // BytesToWaitFor, UsnJournalID.
        let mut input = [0_u8; 40];
        input[..8].copy_from_slice(&usn.to_le_bytes());
        let mask = REASON_FILE_CREATE
            | REASON_FILE_DELETE
            | REASON_RENAME_NEW_NAME
            | REASON_RENAME_OLD_NAME
            | CHANGED;
        input[8..12].copy_from_slice(&mask.to_le_bytes());
        input[32..].copy_from_slice(&checkpoint.id.to_le_bytes());
        let returned = match volume.control(FSCTL_READ_USN_JOURNAL, &input, &mut buffer) {
            Ok(returned) => returned,
            Err(error) if error.raw_os_error() == Some(ERROR_JOURNAL_ENTRY_DELETED) => {
                return Ok(None);
            }
            Err(error) => return Err(error.into()),
        };
        if returned < 8 {
            break;
        }
        let following = u64_at(&buffer, 0) as i64;
        records(&buffer[..returned], |record| {
            let change = if record.reason & REASON_FILE_DELETE != 0 {
                Change::Gone
            } else if record.reason & (REASON_FILE_CREATE | REASON_RENAME_NEW_NAME | CHANGED) != 0 {
                let mut name = Vec::with_capacity(record.name.len() / 2);
                utf16_to_utf8(record.name, &mut name);
                Change::At {
                    parent: record.parent,
                    name,
                    attributes: record.attributes,
                }
            } else {
                return;
            };
            if changes.insert(record.frn, change).is_none() {
                order.push(record.frn);
            }
        });
        if following <= usn {
            break;
        }
        usn = following;
    }
    drop(volume);
    let mut stats = RefreshStats::default();
    if !order.is_empty() {
        let options = index.meta.options.clone();
        let exclusions = Exclusions::new(&root, &options)?;
        let mut draft = index.tables.thaw();
        let mut by_record = ByRecord::new(&draft.frns);
        let mut keep = vec![true; draft.len()];
        // Pass 1: ids for new entries, so parents created in the same batch resolve in pass 2.
        let mut targets = Vec::with_capacity(order.len());
        for frn in &order {
            let Some(Change::At { attributes, .. }) = changes.get(frn) else {
                if let Some(id) = by_record.get(&draft.frns, *frn) {
                    if keep[id as usize] {
                        keep[id as usize] = false;
                        stats.removed += 1;
                    }
                }
                continue;
            };
            if (frn & RECORD_MASK) < FIRST_USER_RECORD {
                continue;
            }
            let id = match by_record.get(&draft.frns, *frn) {
                Some(id) => {
                    stats.updated += 1;
                    id
                }
                None => {
                    let id = draft.push(
                        ROOT_PARENT,
                        b"",
                        flags_of(*attributes),
                        UNKNOWN_SIZE,
                        UNKNOWN_MTIME,
                    );
                    draft.frns.push(*frn);
                    by_record.insert(*frn, id);
                    keep.push(true);
                    stats.added += 1;
                    id
                }
            };
            targets.push((*frn, id));
        }
        let mut restat = Vec::new();
        for (frn, id) in targets {
            let Some(Change::At {
                parent,
                name,
                attributes,
            }) = changes.get(&frn)
            else {
                continue;
            };
            let index_id = id as usize;
            let flags = flags_of(*attributes);
            match parent_id(&by_record, &draft.frns, *parent) {
                Some(parent) if parent == ROOT_PARENT || keep[parent as usize] => {
                    draft.parents[index_id] = parent
                }
                _ => {
                    keep[index_id] = false;
                    continue;
                }
            }
            if (!options.hidden && flags & FLAG_HIDDEN != 0)
                || (flags & FLAG_DIR != 0 && exclusions.excludes_name(name))
            {
                keep[index_id] = false;
                continue;
            }
            draft.flags[index_id] = flags;
            if draft.name(id) != name.as_slice() {
                draft.name_starts[index_id] = draft.arena.len() as u32;
                draft.name_lens[index_id] = name.len() as u32;
                draft.arena.extend_from_slice(name);
            }
            if restat.len() < MAX_RESTAT {
                restat.push(id);
            }
        }
        for id in restat {
            let Some(path) = draft_path(&draft, &root, id) else {
                continue;
            };
            if let Ok(meta) = std::fs::symlink_metadata(String::from_utf8_lossy(&path).as_ref()) {
                use std::os::windows::fs::MetadataExt;
                if !meta.is_dir() {
                    draft.sizes[id as usize] = meta.len();
                }
                draft.mtimes[id as usize] = filetime_millis(meta.last_write_time());
            }
        }
        let draft = draft.retain(&keep);
        index.replace_tables(draft)?;
    }
    index.meta_mut().journal = Some(Journal {
        id: current.id,
        next_usn: usn.max(checkpoint.next_usn),
    });
    if cancel.load(Ordering::Relaxed) {
        return Err(VfsError::Cancelled);
    }
    Ok(Some(stats))
}

/// Absolute path of a draft entry under the volume root root.
fn draft_path(draft: &Draft, root: &[u8], id: u32) -> Option<Vec<u8>> {
    let mut chain = Vec::new();
    let mut at = id;
    while at != ROOT_PARENT {
        if chain.len() > 4096 {
            return None;
        }
        chain.push(at);
        at = draft.parents[at as usize];
    }
    let mut path = root.to_vec();
    for (index, node) in chain.iter().rev().enumerate() {
        if index > 0 {
            path.push(crate::SEP);
        }
        path.extend_from_slice(draft.name(*node));
    }
    Some(path)
}
