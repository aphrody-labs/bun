//! Logical Windows drives and their capacity.

use super::{Json, WinErr, WinResult, BOOL};

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetLogicalDriveStringsW(length: u32, buffer: *mut u16) -> u32;
    fn GetDriveTypeW(root: *const u16) -> u32;
    fn GetDiskFreeSpaceExW(
        directory: *const u16,
        available: *mut u64,
        total: *mut u64,
        free: *mut u64,
    ) -> BOOL;
}

fn drive_type(value: u32) -> &'static str {
    match value {
        2 => "removable",
        3 => "fixed",
        4 => "remote",
        5 => "optical",
        6 => "ramdisk",
        _ => "unknown",
    }
}

/// Returns roots and capacity for every logical drive visible to the process.
pub(crate) fn drives_json() -> WinResult<String> {
    // A null buffer asks Windows for the required UTF-16 capacity, including the final NUL.
    let needed = unsafe { GetLogicalDriveStringsW(0, core::ptr::null_mut()) };
    if needed == 0 {
        return Err(WinErr::last("GetLogicalDriveStringsW"));
    }
    let mut buffer = vec![0u16; needed as usize];
    // SAFETY: `buffer` has the capacity returned by the sizing call.
    let written = unsafe { GetLogicalDriveStringsW(needed, buffer.as_mut_ptr()) };
    if written == 0 || written >= needed {
        return Err(WinErr::last("GetLogicalDriveStringsW"));
    }

    let mut json = Json::new();
    json.begin_array();
    let mut rest = &buffer[..written as usize];
    while !rest.is_empty() {
        let end = bun_core::strings::index_of_any16(rest, &[0]).unwrap_or(rest.len());
        let root = &rest[..end];
        rest = &rest[(end + 1).min(rest.len())..];
        if root.is_empty() {
            continue;
        }
        let path = super::from_wide(root);
        let wide = super::wide(&path);
        let mut available = 0u64;
        let mut total = 0u64;
        let mut free = 0u64;
        // SAFETY: `wide` is NUL-terminated and all output pointers refer to initialized storage.
        if unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut available, &mut total, &mut free) } == 0
        {
            return Err(WinErr::last("GetDiskFreeSpaceExW"));
        }
        // SAFETY: `wide` is NUL-terminated.
        let kind = unsafe { GetDriveTypeW(wide.as_ptr()) };
        json.begin_object()
            .field_str("root", &path)
            .field_str("type", drive_type(kind))
            .field_num("totalBytes", total as f64)
            .field_num("freeBytes", free as f64)
            .field_num("availableBytes", available as f64)
            .end_object();
    }
    json.end_array();
    Ok(json.finish())
}
