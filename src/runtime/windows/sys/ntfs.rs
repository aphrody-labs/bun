//! NTFS volume access: USN journal query/create/read and MFT enumeration through
//! `FSCTL_QUERY_USN_JOURNAL`, `FSCTL_CREATE_USN_JOURNAL`, `FSCTL_READ_USN_JOURNAL` and
//! `FSCTL_ENUM_USN_DATA`. JS holds an id for an open `\\.\X:` handle; the handles stay in
//! this module so a stale or forged id can never touch an unrelated handle of the process.
//!
//! Opening a volume requires an administrator token (elevated session or a SYSTEM task);
//! without it every call returns `ERROR_ACCESS_DENIED` and callers fall back to a directory
//! walk, never a fake result. Record layouts mirror `USN_RECORD_V2`/`V3` exactly so a caller
//! that already knows those structures (this was ported from a `bun:ffi` implementation) sees
//! the same fields.

use super::{HANDLE, Json, OwnedHandle, WinErr, WinResult};
use core::ffi::c_void;
use std::collections::HashMap;
use std::sync::Mutex;

const FSCTL_ENUM_USN_DATA: u32 = 0x0009_00b3;
const FSCTL_READ_USN_JOURNAL: u32 = 0x0009_00bb;
const FSCTL_CREATE_USN_JOURNAL: u32 = 0x0009_00e7;
const FSCTL_QUERY_USN_JOURNAL: u32 = 0x0009_00f4;

const ERROR_HANDLE_EOF: u32 = 38;
/// `ERROR_INVALID_HANDLE`, reported for an unknown volume id.
const ERROR_INVALID_HANDLE: u32 = 6;

const GENERIC_READ: u32 = 0x8000_0000;
const FILE_SHARE_ALL: u32 = 0x1 | 0x2 | 0x4;
const OPEN_EXISTING: u32 = 3;
const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;

/// Low 48 bits of a 64-bit NTFS file reference: the stable MFT record number, with the
/// 16-bit reuse sequence number in the high bits masked off.
const RECORD_MASK: u64 = 0x0000_ffff_ffff_ffff;

#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateFileW(
        name: *const u16,
        access: u32,
        share: u32,
        security: *const c_void,
        disposition: u32,
        flags: u32,
        template: HANDLE,
    ) -> HANDLE;
    fn DeviceIoControl(
        handle: HANDLE,
        code: u32,
        in_buf: *const c_void,
        in_len: u32,
        out_buf: *mut c_void,
        out_len: u32,
        returned: *mut u32,
        overlapped: *mut c_void,
    ) -> super::BOOL;
}

struct Registry {
    next: u32,
    volumes: HashMap<u32, usize>,
}

static VOLUMES: Mutex<Option<Registry>> = Mutex::new(None);

fn with_volume<T>(id: u32, f: impl FnOnce(HANDLE) -> WinResult<T>) -> WinResult<T> {
    let handle = {
        let guard = VOLUMES.lock().unwrap_or_else(|e| e.into_inner());
        guard.as_ref().and_then(|r| r.volumes.get(&id).copied())
    };
    match handle {
        Some(h) => f(h as HANDLE),
        None => Err(WinErr {
            code: ERROR_INVALID_HANDLE,
            call: "NtfsVolume",
        }),
    }
}

/// Opens `\\.\<drive>:` (a single letter, with or without a trailing colon) and returns a
/// volume id. Requires an administrator token; otherwise `ERROR_ACCESS_DENIED`.
pub(crate) fn open(drive: &str) -> WinResult<u32> {
    let letter = drive.trim_end_matches(':').trim_start_matches('\\').to_uppercase();
    let path = super::wide(&format!("\\\\.\\{letter}:"));
    // SAFETY: `path` is NUL-terminated; no template handle, default security.
    let h = unsafe {
        CreateFileW(
            path.as_ptr(),
            GENERIC_READ,
            FILE_SHARE_ALL,
            core::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            core::ptr::null_mut(),
        )
    };
    if h.is_null() || h as isize == -1 {
        return Err(WinErr::last("CreateFileW"));
    }
    let mut guard = VOLUMES.lock().unwrap_or_else(|e| e.into_inner());
    let registry = guard.get_or_insert_with(|| Registry {
        next: 1,
        volumes: HashMap::new(),
    });
    let id = registry.next;
    registry.next += 1;
    registry.volumes.insert(id, h as usize);
    Ok(id)
}

/// Closes the volume handle. Returns `false` for an already-closed or unknown id.
pub(crate) fn close(id: u32) -> bool {
    let handle = {
        let mut guard = VOLUMES.lock().unwrap_or_else(|e| e.into_inner());
        guard.as_mut().and_then(|r| r.volumes.remove(&id))
    };
    match handle {
        Some(h) => {
            drop(OwnedHandle(h as HANDLE));
            true
        }
        None => false,
    }
}

fn ioctl(h: HANDLE, code: u32, input: &[u8], output: &mut [u8], call: &'static str) -> WinResult<u32> {
    let mut returned = 0u32;
    let in_ptr = if input.is_empty() { core::ptr::null() } else { input.as_ptr().cast() };
    let out_ptr = if output.is_empty() { core::ptr::null_mut() } else { output.as_mut_ptr().cast() };
    // SAFETY: `input`/`output` are valid for their given lengths; this is a synchronous,
    // non-overlapped call so no asynchronous completion races the buffers.
    let ok = unsafe {
        DeviceIoControl(
            h,
            code,
            in_ptr,
            input.len() as u32,
            out_ptr,
            output.len() as u32,
            &mut returned,
            core::ptr::null_mut(),
        )
    };
    if ok == 0 {
        return Err(WinErr::last(call));
    }
    Ok(returned)
}

/// `USN_JOURNAL_DATA_V0` → `{ journalId, firstUsn, nextUsn, lowestValidUsn, maxUsn,
/// maximumSize }`. Numbers that exceed `Number.MAX_SAFE_INTEGER` are encoded as decimal
/// strings; `windows.ts` converts them back to `BigInt`.
pub(crate) fn journal_query(id: u32) -> WinResult<String> {
    with_volume(id, |h| {
        let mut out = [0u8; 80];
        ioctl(h, FSCTL_QUERY_USN_JOURNAL, &[], &mut out, "FSCTL_QUERY_USN_JOURNAL")?;
        let journal_id = u64::from_le_bytes(out[0..8].try_into().unwrap());
        let first_usn = i64::from_le_bytes(out[8..16].try_into().unwrap());
        let next_usn = i64::from_le_bytes(out[16..24].try_into().unwrap());
        let lowest_valid_usn = i64::from_le_bytes(out[24..32].try_into().unwrap());
        let max_usn = i64::from_le_bytes(out[32..40].try_into().unwrap());
        let maximum_size = u64::from_le_bytes(out[40..48].try_into().unwrap());
        let mut json = Json::new();
        json.begin_object()
            .field_str("journalId", &journal_id.to_string())
            .field_str("firstUsn", &first_usn.to_string())
            .field_str("nextUsn", &next_usn.to_string())
            .field_str("lowestValidUsn", &lowest_valid_usn.to_string())
            .field_str("maxUsn", &max_usn.to_string())
            .field_str("maximumSize", &maximum_size.to_string())
            .end_object();
        Ok(json.finish())
    })
}

/// Creates the USN journal (no-op if one already exists with at least this size).
pub(crate) fn journal_create(id: u32, maximum_size: u64, allocation_delta: u64) -> WinResult<()> {
    with_volume(id, |h| {
        let mut input = [0u8; 16];
        input[0..8].copy_from_slice(&maximum_size.to_le_bytes());
        input[8..16].copy_from_slice(&allocation_delta.to_le_bytes());
        ioctl(h, FSCTL_CREATE_USN_JOURNAL, &input, &mut [], "FSCTL_CREATE_USN_JOURNAL")?;
        Ok(())
    })
}

/// Enumerates every MFT record (V2 references only) from the start of the volume: `[record,
/// parentRecord, attributes, name]` tuples as a JSON array. Metadata only — names, parents and
/// attributes — never file contents.
pub(crate) fn mft_enumerate(id: u32, buffer_bytes: usize) -> WinResult<String> {
    with_volume(id, |h| {
        let mut out = vec![0u8; buffer_bytes.max(4096)];
        // MFT_ENUM_DATA_V0: StartFileReferenceNumber(8) LowUsn(8) HighUsn(8).
        let mut input = [0u8; 24];
        input[16..24].copy_from_slice(&0x7fff_ffff_ffff_ffffi64.to_le_bytes());
        let mut json = Json::new();
        json.begin_array();
        loop {
            let bytes = match ioctl(h, FSCTL_ENUM_USN_DATA, &input, &mut out, "FSCTL_ENUM_USN_DATA") {
                Ok(n) => n as usize,
                Err(e) if e.code == ERROR_HANDLE_EOF => break,
                Err(e) => return Err(e),
            };
            if bytes <= 8 {
                break;
            }
            // The 8-byte prefix is the next StartFileReferenceNumber.
            input[0..8].copy_from_slice(&out[0..8]);
            let mut off = 8usize;
            while off + 60 <= bytes {
                let len = u32::from_le_bytes(out[off..off + 4].try_into().unwrap()) as usize;
                let major = u16::from_le_bytes(out[off + 4..off + 6].try_into().unwrap());
                if len < 60 || off + len > bytes || major != 2 {
                    break;
                }
                let record = u64::from_le_bytes(out[off + 8..off + 16].try_into().unwrap()) & RECORD_MASK;
                let parent = u64::from_le_bytes(out[off + 16..off + 24].try_into().unwrap()) & RECORD_MASK;
                let attributes = u32::from_le_bytes(out[off + 52..off + 56].try_into().unwrap());
                let name_len = u16::from_le_bytes(out[off + 56..off + 58].try_into().unwrap()) as usize;
                let name_off = off + u16::from_le_bytes(out[off + 58..off + 60].try_into().unwrap()) as usize;
                let name = if name_off + name_len <= bytes {
                    let units: Vec<u16> = out[name_off..name_off + name_len]
                        .chunks_exact(2)
                        .map(|c| u16::from_le_bytes([c[0], c[1]]))
                        .collect();
                    String::from_utf16_lossy(&units)
                } else {
                    String::new()
                };
                json.begin_array()
                    .num(record as f64)
                    .num(parent as f64)
                    .num(attributes as f64)
                    .str(&name)
                    .end_array();
                off += len;
            }
        }
        json.end_array();
        Ok(json.finish())
    })
}

/// One decoded `USN_RECORD_V2`/`V3`.
struct UsnRecord {
    major: u16,
    frn: u64,
    parent_frn: u64,
    usn: i64,
    timestamp: i64,
    reason: u32,
    attributes: u32,
    name: String,
    length: usize,
}

/// Decodes one record at `buf[offset..]`; `None` when the bytes are not a valid V2/V3 record.
fn parse_usn_record(buf: &[u8], offset: usize) -> Option<UsnRecord> {
    let rest = buf.get(offset..)?;
    if rest.len() < 8 {
        return None;
    }
    let length = u32::from_le_bytes(rest[0..4].try_into().unwrap()) as usize;
    let major = u16::from_le_bytes(rest[4..6].try_into().unwrap());
    if length < 8 || length > rest.len() {
        return None;
    }
    let (frn, parent_frn, base) = match major {
        2 if length >= 60 => (
            u64::from_le_bytes(rest[8..16].try_into().unwrap()),
            u64::from_le_bytes(rest[16..24].try_into().unwrap()),
            24,
        ),
        3 if length >= 76 => (
            u64::from_le_bytes(rest[8..16].try_into().unwrap()),
            u64::from_le_bytes(rest[24..32].try_into().unwrap()),
            40,
        ),
        _ => return None,
    };
    let usn = i64::from_le_bytes(rest[base..base + 8].try_into().unwrap());
    let timestamp = i64::from_le_bytes(rest[base + 8..base + 16].try_into().unwrap());
    let reason = u32::from_le_bytes(rest[base + 16..base + 20].try_into().unwrap());
    let attributes = u32::from_le_bytes(rest[base + 28..base + 32].try_into().unwrap());
    let name_length = u16::from_le_bytes(rest[base + 32..base + 34].try_into().unwrap()) as usize;
    let name_offset = u16::from_le_bytes(rest[base + 34..base + 36].try_into().unwrap()) as usize;
    if name_offset + name_length > length {
        return None;
    }
    let units: Vec<u16> = rest[name_offset..name_offset + name_length]
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    Some(UsnRecord {
        major,
        frn,
        parent_frn,
        usn,
        timestamp,
        reason,
        attributes,
        name: String::from_utf16_lossy(&units),
        length,
    })
}

fn write_usn_record(json: &mut Json, record: &UsnRecord) {
    json.begin_object()
        .field_num("major", record.major as f64)
        .field_str("frn", &record.frn.to_string())
        .field_str("parentFrn", &record.parent_frn.to_string())
        .field_num("record", (record.frn & RECORD_MASK) as f64)
        .field_num("parentRecord", (record.parent_frn & RECORD_MASK) as f64)
        .field_str("usn", &record.usn.to_string())
        .field_str("timestamp", &record.timestamp.to_string())
        .field_num("reason", record.reason as f64)
        .field_num("attributes", record.attributes as f64)
        .field_str("name", &record.name)
        .end_object();
}

/// Reads the journal from `start_usn` without waiting (`Timeout` 0, `BytesToWaitFor` 0):
/// `{ records: [...], next }`. `start_usn` and `journal_id` are plain 64-bit values; `host.rs`
/// parses them from the decimal strings JS passes (`BigInt.toString()`, mirroring the
/// `REG_QWORD` convention) so no 64-bit value round-trips through an IEEE-754 `number`.
/// `ERROR_JOURNAL_ENTRY_DELETED` (the checkpoint fell out of the journal) and other journal
/// errors propagate to the caller, which decides to rescan.
pub(crate) fn journal_read(id: u32, start_usn: i64, journal_id: u64, buffer_bytes: usize) -> WinResult<String> {
    with_volume(id, |h| {
        let mut out = vec![0u8; buffer_bytes.max(4096)];
        // READ_USN_JOURNAL_DATA_V0: StartUsn(8) ReasonMask(4) ReturnOnlyOnClose(4) Timeout(8)
        // BytesToWaitFor(8) UsnJournalID(8).
        let mut input = [0u8; 40];
        input[0..8].copy_from_slice(&start_usn.to_le_bytes());
        input[8..12].copy_from_slice(&0xffff_ffffu32.to_le_bytes());
        input[32..40].copy_from_slice(&journal_id.to_le_bytes());
        let bytes = ioctl(h, FSCTL_READ_USN_JOURNAL, &input, &mut out, "FSCTL_READ_USN_JOURNAL")? as usize;
        let mut json = Json::new();
        if bytes < 8 {
            json.begin_object().key("records").begin_array().end_array().field_str("next", &start_usn.to_string()).end_object();
            return Ok(json.finish());
        }
        let next = i64::from_le_bytes(out[0..8].try_into().unwrap());
        json.begin_object().key("records").begin_array();
        let mut off = 8usize;
        while off < bytes {
            match parse_usn_record(&out[..bytes], off) {
                Some(record) => {
                    write_usn_record(&mut json, &record);
                    off += record.length;
                }
                None => break,
            }
        }
        json.end_array().field_str("next", &next.to_string()).end_object();
        Ok(json.finish())
    })
}
