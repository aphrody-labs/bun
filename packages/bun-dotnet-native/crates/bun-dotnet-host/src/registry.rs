// SPDX-License-Identifier: MIT
//! `HKEY_LOCAL_MACHINE` reads in an explicit registry view (32-bit `WOW6432Node` or 64-bit).

use std::ffi::OsString;
use std::os::windows::ffi::{OsStrExt, OsStringExt};

use windows_sys::Win32::Foundation::ERROR_SUCCESS;
use windows_sys::Win32::System::Registry::{
    HKEY, HKEY_LOCAL_MACHINE, KEY_ENUMERATE_SUB_KEYS, KEY_WOW64_32KEY, KEY_WOW64_64KEY,
    RRF_RT_REG_DWORD, RRF_RT_REG_SZ, RegCloseKey, RegEnumKeyExW, RegGetValueW, RegOpenKeyExW,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum View {
    Bits32,
    Bits64,
}

impl View {
    fn flag(self) -> u32 {
        match self {
            Self::Bits32 => KEY_WOW64_32KEY,
            Self::Bits64 => KEY_WOW64_64KEY,
        }
    }
}

fn wide(text: &str) -> Vec<u16> {
    std::ffi::OsStr::new(text)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

/// `REG_SZ` value of `HKLM\<key>`.
pub fn string(view: View, key: &str, value: &str) -> Option<String> {
    let key = wide(key);
    let value = wide(value);
    let mut buffer = vec![0u16; 2048];
    let mut size = (buffer.len() * 2) as u32;
    // SAFETY: NUL-terminated key/value; buffer/size describe a writable buffer.
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            key.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_SZ | view.flag(),
            std::ptr::null_mut(),
            buffer.as_mut_ptr().cast(),
            &mut size,
        )
    };
    if status != ERROR_SUCCESS {
        return None;
    }
    let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    let text = OsString::from_wide(&buffer[..len]).to_string_lossy().into_owned();
    (!text.is_empty()).then_some(text)
}

/// `REG_DWORD` value of `HKLM\<key>`.
pub fn dword(view: View, key: &str, value: &str) -> Option<u32> {
    let key = wide(key);
    let value = wide(value);
    let mut data = 0u32;
    let mut size = 4u32;
    // SAFETY: NUL-terminated key/value; data/size describe a writable DWORD.
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            key.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_DWORD | view.flag(),
            std::ptr::null_mut(),
            (&raw mut data).cast(),
            &mut size,
        )
    };
    (status == ERROR_SUCCESS).then_some(data)
}

/// Subkey names of `HKLM\<key>`.
pub fn subkeys(view: View, key: &str) -> Vec<String> {
    let key = wide(key);
    let mut handle: HKEY = std::ptr::null_mut();
    // SAFETY: NUL-terminated key; handle is writable.
    let status = unsafe {
        RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            key.as_ptr(),
            0,
            KEY_ENUMERATE_SUB_KEYS | view.flag(),
            &mut handle,
        )
    };
    if status != ERROR_SUCCESS {
        return Vec::new();
    }
    let mut names = Vec::new();
    for index in 0.. {
        let mut name = [0u16; 256];
        let mut len = name.len() as u32;
        // SAFETY: open handle; name/len describe a writable buffer.
        let status = unsafe {
            RegEnumKeyExW(
                handle,
                index,
                name.as_mut_ptr(),
                &mut len,
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        if status != ERROR_SUCCESS {
            break;
        }
        names.push(String::from_utf16_lossy(&name[..len as usize]));
    }
    // SAFETY: handle opened above.
    unsafe { RegCloseKey(handle) };
    names
}
