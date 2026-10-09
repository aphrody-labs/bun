// SPDX-License-Identifier: Apache-2.0
//! Raw `$MFT` reader: boot sector geometry, the `$MFT` runlist from record 0, then 4 MiB chunks
//! read unbuffered and parsed in parallel (update sequence fixups, `$STANDARD_INFORMATION`,
//! `$FILE_NAME`, unnamed `$DATA`; extension records merge into their base record).

use std::sync::{
    Mutex,
    atomic::{AtomicBool, AtomicU64, Ordering},
};

use super::{
    ATTR_DIRECTORY, ATTR_HIDDEN, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_NO_BUFFERING,
    FIRST_USER_RECORD, RECORD_MASK, Scanned, Volume, filetime_millis, flags_of, u16_at, u32_at,
    u64_at, utf16_to_utf8,
};
use crate::{
    IndexOptions, Result, VfsError,
    table::{Draft, FLAG_DIR, ROOT_PARENT, UNKNOWN_MTIME, UNKNOWN_SIZE},
};

const CHUNK: u64 = 4 << 20;
const ALIGN: usize = 4096;
const ATTR_STANDARD_INFORMATION: u32 = 0x10;
const ATTR_FILE_NAME: u32 = 0x30;
const ATTR_DATA: u32 = 0x80;
const ATTR_BITMAP: u32 = 0xB0;
/// Free records between two in-use ones that are read through rather than skipped.
const GAP_RECORDS: u64 = 64;
const ATTR_END: u32 = 0xFFFF_FFFF;
const NAMESPACE_DOS: u8 = 2;
const RECORD_IN_USE: u16 = 1;
const RECORD_DIRECTORY: u16 = 2;

/// Sector-aligned scratch buffer for unbuffered reads.
struct Aligned {
    storage: Vec<u8>,
    start: usize,
    len: usize,
}

impl Aligned {
    fn new(len: usize) -> Aligned {
        let storage = vec![0_u8; len + ALIGN];
        let start = (ALIGN - storage.as_ptr().addr() % ALIGN) % ALIGN;
        Aligned {
            storage,
            start,
            len,
        }
    }

    fn bytes(&mut self) -> &mut [u8] {
        &mut self.storage[self.start..self.start + self.len]
    }
}

struct Run {
    /// Byte offset inside `$MFT`.
    logical: u64,
    /// Byte offset on the volume.
    disk: u64,
    len: u64,
}

struct Geometry {
    sector: u64,
    record: usize,
    runs: Vec<Run>,
    /// Initialized bytes of `$MFT`, a whole number of records.
    bytes: u64,
    /// `$MFT` `$BITMAP` (one bit per record in use); empty when unreadable.
    bitmap: Vec<u8>,
}

fn invalid(what: &str) -> VfsError {
    VfsError::Invalid(format!("raw mft: {what}"))
}

/// Applies the update sequence array; `false` for torn or foreign records.
fn fixup(record: &mut [u8]) -> bool {
    if record.len() < 48 || &record[..4] != b"FILE" {
        return false;
    }
    let usa = u16_at(record, 4) as usize;
    let count = u16_at(record, 6) as usize;
    if count < 2 || usa + count * 2 > record.len() {
        return false;
    }
    let stride = record.len() / (count - 1);
    if stride < 2 {
        return false;
    }
    let check = [record[usa], record[usa + 1]];
    for index in 1..count {
        let at = index * stride - 2;
        if record[at..at + 2] != check {
            return false;
        }
        record[at] = record[usa + 2 * index];
        record[at + 1] = record[usa + 2 * index + 1];
    }
    true
}

struct Attribute<'r> {
    kind: u32,
    resident: bool,
    named: bool,
    header: &'r [u8],
    value: &'r [u8],
}

fn each_attribute(record: &[u8], mut each: impl FnMut(Attribute<'_>)) {
    let used = (u32_at(record, 0x18) as usize).min(record.len());
    let mut at = u16_at(record, 0x14) as usize;
    while at + 16 <= used {
        let kind = u32_at(record, at);
        if kind == ATTR_END {
            break;
        }
        let len = u32_at(record, at + 4) as usize;
        if len < 16 || at + len > used {
            break;
        }
        let header = &record[at..at + len];
        let resident = header[8] == 0;
        let value = if resident && len >= 0x18 {
            let start = u16_at(header, 0x14) as usize;
            let end = start + u32_at(header, 0x10) as usize;
            header.get(start..end).unwrap_or(&[])
        } else {
            &[]
        };
        each(Attribute {
            kind,
            resident,
            named: header[9] != 0,
            header,
            value,
        });
        at += len;
    }
}

/// Decodes a non-resident runlist into `(disk byte offset, byte length)` pairs; `None` for sparse
/// or malformed lists.
fn runlist(header: &[u8], cluster: u64) -> Option<Vec<(u64, u64)>> {
    if header.len() < 0x40 {
        return None;
    }
    let mut at = u16_at(header, 0x20) as usize;
    let mut lcn = 0_i64;
    let mut runs = Vec::new();
    while let Some(&head) = header.get(at) {
        if head == 0 {
            break;
        }
        let (len_bytes, off_bytes) = (usize::from(head & 0xF), usize::from(head >> 4));
        at += 1;
        if len_bytes == 0
            || len_bytes > 8
            || off_bytes == 0
            || off_bytes > 8
            || at + len_bytes + off_bytes > header.len()
        {
            return None;
        }
        let mut length = 0_u64;
        for (index, byte) in header[at..at + len_bytes].iter().enumerate() {
            length |= u64::from(*byte) << (8 * index);
        }
        at += len_bytes;
        let mut delta = 0_i64;
        for (index, byte) in header[at..at + off_bytes].iter().enumerate() {
            delta |= i64::from(*byte) << (8 * index);
        }
        let shift = 64 - 8 * off_bytes as u32;
        delta = (delta << shift) >> shift;
        at += off_bytes;
        lcn = lcn.checked_add(delta)?;
        let disk = u64::try_from(lcn).ok()?.checked_mul(cluster)?;
        runs.push((disk, length.checked_mul(cluster)?));
    }
    Some(runs)
}

fn geometry(volume: &Volume) -> Result<Geometry> {
    let mut boot = Aligned::new(ALIGN);
    let read = volume.read_at(0, boot.bytes())?;
    let boot = &boot.bytes()[..read];
    if boot.len() < 512 || &boot[3..11] != b"NTFS    " {
        return Err(invalid("not an NTFS boot sector"));
    }
    let sector = u64::from(u16_at(boot, 0x0B));
    let per_cluster = match boot[0x0D] {
        raw @ 0x81.. => 1_u64 << (256 - u32::from(raw)).min(31),
        raw => u64::from(raw),
    };
    let cluster = sector * per_cluster;
    let record = match boot[0x40] as i8 {
        raw @ ..0 => 1_usize << u32::from(raw.unsigned_abs()).min(31),
        raw => raw as usize * cluster as usize,
    };
    if !(512..=4096).contains(&sector)
        || !sector.is_power_of_two()
        || cluster == 0
        || !(256..=65536).contains(&record)
        || !record.is_power_of_two()
    {
        return Err(invalid("unsupported geometry"));
    }
    let mut first = Aligned::new(record.next_multiple_of(ALIGN));
    volume.read_at(u64_at(boot, 0x30) * cluster, first.bytes())?;
    let record0 = &mut first.bytes()[..record];
    if !fixup(record0) {
        return Err(invalid("record 0"));
    }
    let (mut data, mut bitmap) = (None, None);
    each_attribute(record0, |attribute| {
        if attribute.kind == ATTR_BITMAP && !attribute.named {
            bitmap = Some(if attribute.resident {
                (
                    attribute.value.len() as u64,
                    Some(vec![(u64::MAX, attribute.value.len() as u64)]),
                    attribute.value.to_vec(),
                )
            } else if attribute.header.len() >= 0x40 && u64_at(attribute.header, 0x10) == 0 {
                (
                    u64_at(attribute.header, 0x30),
                    runlist(attribute.header, cluster),
                    Vec::new(),
                )
            } else {
                (0, None, Vec::new())
            });
        }
        if attribute.kind == ATTR_DATA
            && !attribute.named
            && !attribute.resident
            && attribute.header.len() >= 0x40
        {
            data = Some((
                u64_at(attribute.header, 0x10),
                u64_at(attribute.header, 0x38),
                runlist(attribute.header, cluster),
            ));
        }
    });
    let Some((0, initialized, Some(extents))) = data else {
        return Err(invalid("$MFT $DATA"));
    };
    let mut runs = Vec::with_capacity(extents.len());
    let mut logical = 0;
    for (disk, len) in extents {
        runs.push(Run { logical, disk, len });
        logical += len;
    }
    if logical < initialized {
        return Err(invalid("$MFT runlist continues in an attribute list"));
    }
    let bitmap = match bitmap {
        Some((_, Some(_), resident)) if !resident.is_empty() => resident,
        Some((len, Some(extents), _)) => read_bitmap(volume, &extents, len).unwrap_or_default(),
        _ => Vec::new(),
    };
    Ok(Geometry {
        sector,
        record,
        runs,
        bytes: initialized - initialized % record as u64,
        bitmap,
    })
}

fn read_bitmap(volume: &Volume, extents: &[(u64, u64)], len: u64) -> Result<Vec<u8>> {
    let total: u64 = extents.iter().map(|(_, run)| run).sum();
    if total < len || total > 1 << 30 {
        return Err(invalid("$MFT $BITMAP"));
    }
    let mut buffer = Aligned::new((total as usize).next_multiple_of(ALIGN));
    let mut at = 0;
    for (disk, run) in extents {
        let run = *run as usize;
        if volume.read_at(*disk, &mut buffer.bytes()[at..at + run])? < run {
            return Err(invalid("short $BITMAP read"));
        }
        at += run;
    }
    Ok(buffer.bytes()[..len as usize].to_vec())
}

/// Record ranges `[start, end)` of `[first, first + count)` worth reading: in-use records per the
/// bitmap, small free gaps merged, starts aligned to `unit` records (one sector).
fn spans(bitmap: &[u8], first: u64, count: u64, unit: u64) -> Vec<(u64, u64)> {
    let end = first + count;
    if bitmap.is_empty() {
        return vec![(first, end)];
    }
    let in_use = |record: u64| {
        bitmap
            .get((record / 8) as usize)
            .is_none_or(|byte| byte >> (record % 8) & 1 == 1)
    };
    let mut out: Vec<(u64, u64)> = Vec::new();
    for record in first..end {
        if !in_use(record) {
            continue;
        }
        match out.last_mut() {
            Some(last) if record - last.1 <= GAP_RECORDS => last.1 = record + 1,
            _ => out.push((record - (record - first) % unit, record + 1)),
        }
    }
    out
}

/// Reads `$MFT` bytes `[start, start + len)` into `buffer` at `start - base`.
fn read_span(
    volume: &Volume,
    geometry: &Geometry,
    base: u64,
    start: u64,
    len: u64,
    buffer: &mut Aligned,
) -> Result<()> {
    let end = start + len;
    let mut filled = 0;
    for run in &geometry.runs {
        let (from, to) = (start.max(run.logical), end.min(run.logical + run.len));
        if from >= to {
            continue;
        }
        let want = (to - from) as usize;
        let span = want.next_multiple_of(geometry.sector as usize);
        let at = (from - base) as usize;
        let got = volume.read_at(
            run.disk + (from - run.logical),
            &mut buffer.bytes()[at..at + span],
        )?;
        if got < want {
            return Err(invalid("short read"));
        }
        filled += want as u64;
    }
    if filled != len {
        return Err(invalid("runlist gap"));
    }
    Ok(())
}

#[derive(Clone, Copy)]
struct Record {
    number: u64,
    sequence: u16,
    attributes: u32,
    mtime: i64,
    size: u64,
}

struct Name {
    /// Base record reference, sequence number included.
    owner: u64,
    parent: u64,
    start: u32,
    len: u32,
    dotted: bool,
}

#[derive(Default)]
struct Parsed {
    records: Vec<Record>,
    names: Vec<Name>,
    arena: Vec<u8>,
    /// `$DATA` sizes found in extension records, by base reference.
    sizes: Vec<(u64, u64)>,
}

fn parse(bytes: &mut [u8], first: u64, record_size: usize, out: &mut Parsed) {
    for (index, record) in bytes.chunks_exact_mut(record_size).enumerate() {
        if !fixup(record) {
            continue;
        }
        let flags = u16_at(record, 0x16);
        if flags & RECORD_IN_USE == 0 {
            continue;
        }
        let number = first + index as u64;
        let sequence = u16_at(record, 0x10);
        let base = u64_at(record, 0x20);
        let owner = if base & RECORD_MASK != 0 {
            base
        } else {
            number | (u64::from(sequence) << 48)
        };
        let mut attributes = if flags & RECORD_DIRECTORY != 0 {
            ATTR_DIRECTORY
        } else {
            0
        };
        let (mut mtime, mut size) = (UNKNOWN_MTIME, None);
        each_attribute(record, |attribute| match attribute.kind {
            ATTR_STANDARD_INFORMATION if attribute.value.len() >= 36 => {
                mtime = filetime_millis(u64_at(attribute.value, 8));
                attributes |= u32_at(attribute.value, 32);
            }
            ATTR_FILE_NAME
                if attribute.value.len() >= 0x42 && attribute.value[0x41] != NAMESPACE_DOS =>
            {
                let units = usize::from(attribute.value[0x40]);
                let Some(raw) = attribute.value.get(0x42..0x42 + 2 * units) else {
                    return;
                };
                let start = out.arena.len();
                utf16_to_utf8(raw, &mut out.arena);
                out.names.push(Name {
                    owner,
                    parent: u64_at(attribute.value, 0),
                    start: start as u32,
                    len: (out.arena.len() - start) as u32,
                    dotted: raw.first() == Some(&b'.') && raw.get(1) == Some(&0),
                });
            }
            ATTR_DATA if !attribute.named => {
                if attribute.resident {
                    size = Some(u64::from(u32_at(attribute.header, 0x10)));
                } else if attribute.header.len() >= 0x38 && u64_at(attribute.header, 0x10) == 0 {
                    size = Some(u64_at(attribute.header, 0x30));
                }
            }
            _ => {}
        });
        if base & RECORD_MASK != 0 {
            if let Some(size) = size {
                out.sizes.push((base, size));
            }
        } else {
            out.records.push(Record {
                number,
                sequence,
                attributes,
                mtime,
                size: size.unwrap_or(UNKNOWN_SIZE),
            });
        }
    }
}

/// Reads and parses the whole `$MFT` of `root`; parents stay file references.
pub(super) fn scan(root: &[u8], options: &IndexOptions, cancel: &AtomicBool) -> Result<Scanned> {
    let flags = FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_NO_BUFFERING;
    let geometry = geometry(&Volume::open_with(root, flags)?)?;
    let chunks = geometry.bytes.div_ceil(CHUNK);
    let next = AtomicU64::new(0);
    let parsed: Mutex<Vec<(u64, Parsed)>> = Mutex::new(Vec::with_capacity(chunks as usize));
    let threads = crate::threads(options.threads)
        .min(8)
        .min(chunks.max(1) as usize);
    let worker = || -> Result<()> {
        let volume = Volume::open_with(root, flags)?;
        let mut buffer = Aligned::new(CHUNK as usize + ALIGN);
        loop {
            let chunk = next.fetch_add(1, Ordering::Relaxed);
            if chunk >= chunks {
                return Ok(());
            }
            crate::check_cancel(cancel)?;
            let start = chunk * CHUNK;
            let len = CHUNK.min(geometry.bytes - start);
            let record = geometry.record as u64;
            let unit = (geometry.sector / record).max(1);
            let first = start / record;
            let mut out = Parsed::default();
            for (from, to) in spans(&geometry.bitmap, first, len / record, unit) {
                let (offset, bytes) = ((from - first) * record, (to - from) * record);
                read_span(
                    &volume,
                    &geometry,
                    start,
                    start + offset,
                    bytes,
                    &mut buffer,
                )?;
                parse(
                    &mut buffer.bytes()[offset as usize..(offset + bytes) as usize],
                    from,
                    geometry.record,
                    &mut out,
                );
            }
            parsed
                .lock()
                .map_err(|_| invalid("poisoned"))?
                .push((chunk, out));
        }
    };
    std::thread::scope(|scope| {
        #[allow(
            clippy::needless_collect,
            reason = "every worker is spawned before the first join"
        )]
        let handles: Vec<_> = (0..threads).map(|_| scope.spawn(worker)).collect();
        handles.into_iter().try_for_each(|handle| {
            handle
                .join()
                .unwrap_or_else(|_| Err(invalid("thread panicked")))
        })
    })?;
    let mut parsed = parsed.into_inner().map_err(|_| invalid("poisoned"))?;
    parsed.sort_unstable_by_key(|(chunk, _)| *chunk);
    let parsed: Vec<Parsed> = parsed.into_iter().map(|(_, out)| out).collect();
    assemble(&parsed, geometry.bytes / geometry.record as u64, options)
}

/// Position in `records` of the base record `reference` when its sequence number still matches.
fn locate(slot: &[u32], records: &[Record], reference: u64) -> Option<usize> {
    let position = *slot.get((reference & RECORD_MASK) as usize)?;
    (position != u32::MAX && records[position as usize].sequence == (reference >> 48) as u16)
        .then_some(position as usize)
}

fn assemble(parsed: &[Parsed], slots: u64, options: &IndexOptions) -> Result<Scanned> {
    let mut records: Vec<Record> =
        Vec::with_capacity(parsed.iter().map(|out| out.records.len()).sum());
    let mut slot = vec![u32::MAX; slots as usize];
    for record in parsed.iter().flat_map(|out| &out.records) {
        slot[record.number as usize] = records.len() as u32;
        records.push(*record);
    }
    let late: Vec<(usize, u64)> = parsed
        .iter()
        .flat_map(|out| &out.sizes)
        .filter_map(|(base, size)| locate(&slot, &records, *base).map(|position| (position, *size)))
        .collect();
    for (position, size) in late {
        if records[position].size == UNKNOWN_SIZE {
            records[position].size = size;
        }
    }
    let mut draft = Draft::default();
    let mut parents_frn = Vec::new();
    let mut named_dirs = vec![false; records.len()];
    for out in parsed {
        for name in &out.names {
            let Some(position) = locate(&slot, &records, name.owner) else {
                continue;
            };
            let record = &records[position];
            if record.number < FIRST_USER_RECORD
                || (!options.hidden && (name.dotted || record.attributes & ATTR_HIDDEN != 0))
            {
                continue;
            }
            let flags = flags_of(record.attributes);
            let directory = flags & FLAG_DIR != 0;
            if directory {
                if named_dirs[position] {
                    continue;
                }
                named_dirs[position] = true;
            }
            let bytes = &out.arena[name.start as usize..(name.start + name.len) as usize];
            let size = if directory { UNKNOWN_SIZE } else { record.size };
            draft.push(ROOT_PARENT, bytes, flags, size, record.mtime);
            draft
                .frns
                .push(record.number | (u64::from(record.sequence) << 48));
            parents_frn.push(name.parent);
            if draft.frns.len() > options.max_entries {
                return Err(VfsError::Limit("vfs max_entries"));
            }
        }
    }
    Ok(Scanned { draft, parents_frn })
}
