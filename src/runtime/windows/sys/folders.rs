//! Known folders (`SHGetKnownFolderPath`). The name → GUID table lives in `windows.ts`.

use super::{HANDLE, WinErr, WinResult};

/// `E_INVALIDARG`.
const E_INVALIDARG: u32 = 0x8007_0057;
/// `KF_FLAG_DONT_VERIFY`: return the path even when the folder does not exist yet.
const KF_FLAG_DONT_VERIFY: u32 = 0x0000_4000;

#[repr(C)]
pub(crate) struct Guid {
    pub(crate) data1: u32,
    pub(crate) data2: u16,
    pub(crate) data3: u16,
    pub(crate) data4: [u8; 8],
}

#[link(name = "shell32")]
unsafe extern "system" {
    fn SHGetKnownFolderPath(id: *const Guid, flags: u32, token: HANDLE, path: *mut *mut u16)
    -> i32;
}

#[link(name = "ole32")]
unsafe extern "system" {
    fn CoTaskMemFree(p: *mut core::ffi::c_void);
}

fn hex_digit(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

/// Parses `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`, with or without braces.
pub(crate) fn parse_guid(text: &str) -> Option<Guid> {
    let bytes = text.as_bytes();
    let bytes = match bytes {
        [b'{', inner @ .., b'}'] => inner,
        _ => bytes,
    };
    if bytes.len() != 36
        || bytes[8] != b'-'
        || bytes[13] != b'-'
        || bytes[18] != b'-'
        || bytes[23] != b'-'
    {
        return None;
    }
    let mut digits = [0u8; 32];
    let mut n = 0;
    for (i, &c) in bytes.iter().enumerate() {
        if matches!(i, 8 | 13 | 18 | 23) {
            continue;
        }
        digits[n] = hex_digit(c)?;
        n += 1;
    }
    let num = |range: core::ops::Range<usize>| {
        digits[range]
            .iter()
            .fold(0u64, |acc, &d| (acc << 4) | d as u64)
    };
    let mut data4 = [0u8; 8];
    for (i, byte) in data4.iter_mut().enumerate() {
        *byte = num(16 + i * 2..18 + i * 2) as u8;
    }
    Some(Guid {
        data1: num(0..8) as u32,
        data2: num(8..12) as u16,
        data3: num(12..16) as u16,
        data4,
    })
}

/// The path of the known folder `guid` for the current user.
pub(crate) fn known_folder(guid: &str) -> WinResult<String> {
    let id = parse_guid(guid).ok_or(WinErr {
        code: E_INVALIDARG,
        call: "SHGetKnownFolderPath",
    })?;
    let mut path: *mut u16 = core::ptr::null_mut();
    // SAFETY: `id` is a valid GUID; `path` receives a CoTaskMem string freed below.
    let hr = unsafe {
        SHGetKnownFolderPath(
            &raw const id,
            KF_FLAG_DONT_VERIFY,
            core::ptr::null_mut(),
            &raw mut path,
        )
    };
    let result = if hr < 0 {
        Err(WinErr::status(hr, "SHGetKnownFolderPath"))
    } else {
        // SAFETY: on success `path` is a NUL-terminated wide string.
        Ok(unsafe { super::from_pwstr(path) })
    };
    // SAFETY: `CoTaskMemFree(NULL)` is a no-op; otherwise the string is ours to free.
    unsafe { CoTaskMemFree(path.cast()) };
    result
}
