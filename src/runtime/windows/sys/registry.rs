//! Registry: read, write, enumerate and delete keys and values (advapi32).

use super::{
    ERROR_FILE_NOT_FOUND, ERROR_MORE_DATA, ERROR_NO_MORE_ITEMS, Json, WinErr, WinResult, from_wide,
    wide,
};
use core::ffi::c_void;

pub(crate) type HKEY = *mut c_void;

const KEY_QUERY_VALUE: u32 = 0x0001;
const KEY_SET_VALUE: u32 = 0x0002;
const KEY_ENUMERATE_SUB_KEYS: u32 = 0x0008;
const KEY_READ: u32 = 0x20019;
const DELETE: u32 = 0x0001_0000;
const REG_OPTION_NON_VOLATILE: u32 = 0;

pub(crate) const REG_NONE: u32 = 0;
pub(crate) const REG_SZ: u32 = 1;
pub(crate) const REG_EXPAND_SZ: u32 = 2;
pub(crate) const REG_BINARY: u32 = 3;
pub(crate) const REG_DWORD: u32 = 4;
pub(crate) const REG_DWORD_BIG_ENDIAN: u32 = 5;
pub(crate) const REG_LINK: u32 = 6;
pub(crate) const REG_MULTI_SZ: u32 = 7;
pub(crate) const REG_QWORD: u32 = 11;

#[link(name = "advapi32")]
unsafe extern "system" {
    fn RegOpenKeyExW(
        key: HKEY,
        sub_key: *const u16,
        options: u32,
        sam: u32,
        result: *mut HKEY,
    ) -> i32;
    fn RegCreateKeyExW(
        key: HKEY,
        sub_key: *const u16,
        reserved: u32,
        class: *const u16,
        options: u32,
        sam: u32,
        security: *const c_void,
        result: *mut HKEY,
        disposition: *mut u32,
    ) -> i32;
    fn RegCloseKey(key: HKEY) -> i32;
    fn RegQueryValueExW(
        key: HKEY,
        name: *const u16,
        reserved: *mut u32,
        ty: *mut u32,
        data: *mut u8,
        len: *mut u32,
    ) -> i32;
    fn RegSetValueExW(
        key: HKEY,
        name: *const u16,
        reserved: u32,
        ty: u32,
        data: *const u8,
        len: u32,
    ) -> i32;
    fn RegDeleteValueW(key: HKEY, name: *const u16) -> i32;
    fn RegDeleteKeyExW(key: HKEY, sub_key: *const u16, sam: u32, reserved: u32) -> i32;
    fn RegDeleteTreeW(key: HKEY, sub_key: *const u16) -> i32;
    fn RegQueryInfoKeyW(
        key: HKEY,
        class: *mut u16,
        class_len: *mut u32,
        reserved: *mut u32,
        sub_keys: *mut u32,
        max_sub_key_len: *mut u32,
        max_class_len: *mut u32,
        values: *mut u32,
        max_value_name_len: *mut u32,
        max_value_len: *mut u32,
        security_descriptor: *mut u32,
        last_write: *mut u64,
    ) -> i32;
    fn RegEnumKeyExW(
        key: HKEY,
        index: u32,
        name: *mut u16,
        name_len: *mut u32,
        reserved: *mut u32,
        class: *mut u16,
        class_len: *mut u32,
        last_write: *mut u64,
    ) -> i32;
    fn RegEnumValueW(
        key: HKEY,
        index: u32,
        name: *mut u16,
        name_len: *mut u32,
        reserved: *mut u32,
        ty: *mut u32,
        data: *mut u8,
        data_len: *mut u32,
    ) -> i32;
}

/// A predefined root key from its index in `windows.ts` (`HKCR`, `HKCU`, `HKLM`, `HKU`, `HKCC`).
/// The handles are the sign-extended `(LONG)0x8000000N` values of `winreg.h`.
pub(crate) fn root(index: u32) -> Option<HKEY> {
    let raw: u32 = match index {
        0 => 0x8000_0000, // HKEY_CLASSES_ROOT
        1 => 0x8000_0001, // HKEY_CURRENT_USER
        2 => 0x8000_0002, // HKEY_LOCAL_MACHINE
        3 => 0x8000_0003, // HKEY_USERS
        5 => 0x8000_0005, // HKEY_CURRENT_CONFIG
        _ => return None,
    };
    Some(raw as i32 as isize as HKEY)
}

/// `view` is 0, `KEY_WOW64_64KEY` (0x100) or `KEY_WOW64_32KEY` (0x200).
fn view_bits(view: u32) -> u32 {
    view & 0x300
}

struct Key(HKEY);

impl Drop for Key {
    fn drop(&mut self) {
        // SAFETY: opened by this module and closed once.
        unsafe { RegCloseKey(self.0) };
    }
}

/// `None` when the key does not exist.
fn open(root: HKEY, sub_key: &str, sam: u32) -> WinResult<Option<Key>> {
    let sub = wide(sub_key);
    let mut key: HKEY = core::ptr::null_mut();
    // SAFETY: `sub` is NUL-terminated; `key` receives the handle.
    let rc = unsafe { RegOpenKeyExW(root, sub.as_ptr(), 0, sam, &raw mut key) };
    match rc as u32 {
        0 => Ok(Some(Key(key))),
        ERROR_FILE_NOT_FOUND => Ok(None),
        _ => Err(WinErr::status(rc, "RegOpenKeyExW")),
    }
}

fn create(root: HKEY, sub_key: &str, sam: u32) -> WinResult<Key> {
    let sub = wide(sub_key);
    let mut key: HKEY = core::ptr::null_mut();
    // SAFETY: `sub` is NUL-terminated; optional out-params are null.
    let rc = unsafe {
        RegCreateKeyExW(
            root,
            sub.as_ptr(),
            0,
            core::ptr::null(),
            REG_OPTION_NON_VOLATILE,
            sam,
            core::ptr::null(),
            &raw mut key,
            core::ptr::null_mut(),
        )
    };
    if rc != 0 {
        return Err(WinErr::status(rc, "RegCreateKeyExW"));
    }
    Ok(Key(key))
}

/// The raw type and bytes of a value; `None` when it does not exist.
fn query(key: &Key, name: &str) -> WinResult<Option<(u32, Vec<u8>)>> {
    let name_w = wide(name);
    let mut data: Vec<u8> = vec![0; 256];
    loop {
        let mut ty = 0u32;
        let mut len = data.len() as u32;
        // SAFETY: `data` is valid for `len` bytes.
        let rc = unsafe {
            RegQueryValueExW(
                key.0,
                name_w.as_ptr(),
                core::ptr::null_mut(),
                &raw mut ty,
                data.as_mut_ptr(),
                &raw mut len,
            )
        };
        match rc as u32 {
            0 => {
                data.truncate(len as usize);
                return Ok(Some((ty, data)));
            }
            ERROR_MORE_DATA => data.resize(len as usize + 2, 0),
            ERROR_FILE_NOT_FOUND => return Ok(None),
            _ => return Err(WinErr::status(rc, "RegQueryValueExW")),
        }
    }
}

fn type_name(ty: u32) -> &'static str {
    match ty {
        REG_NONE => "REG_NONE",
        REG_SZ => "REG_SZ",
        REG_EXPAND_SZ => "REG_EXPAND_SZ",
        REG_BINARY => "REG_BINARY",
        REG_DWORD => "REG_DWORD",
        REG_DWORD_BIG_ENDIAN => "REG_DWORD_BIG_ENDIAN",
        REG_LINK => "REG_LINK",
        REG_MULTI_SZ => "REG_MULTI_SZ",
        REG_QWORD => "REG_QWORD",
        _ => "REG_UNKNOWN",
    }
}

fn utf16_units(bytes: &[u8]) -> Vec<u16> {
    bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|c| u16::from_le_bytes(*c))
        .collect()
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(DIGITS[(b >> 4) as usize] as char);
        s.push(DIGITS[(b & 15) as usize] as char);
    }
    s
}

/// Writes `"type":…,"value":…`. `REG_QWORD` is a decimal string and binary data a hex
/// string; `windows.ts` turns them into a `bigint` and a `Buffer`.
fn write_value(j: &mut Json, ty: u32, data: &[u8]) {
    j.field_str("type", type_name(ty));
    j.key("value");
    match ty {
        REG_SZ | REG_EXPAND_SZ | REG_LINK => {
            j.str(&from_wide(&utf16_units(data)));
        }
        REG_MULTI_SZ => {
            let units = utf16_units(data);
            j.begin_array();
            for part in units.split(super::is_nul) {
                if !part.is_empty() {
                    j.str(&String::from_utf16_lossy(part));
                }
            }
            j.end_array();
        }
        REG_DWORD if data.len() >= 4 => {
            j.num(u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as f64);
        }
        REG_DWORD_BIG_ENDIAN if data.len() >= 4 => {
            j.num(u32::from_be_bytes([data[0], data[1], data[2], data[3]]) as f64);
        }
        REG_QWORD if data.len() >= 8 => {
            let mut b = [0u8; 8];
            b.copy_from_slice(&data[..8]);
            j.str(&u64::from_le_bytes(b).to_string());
        }
        _ => {
            j.str(&hex(data));
        }
    }
}

/// `{"type","value"}` of one value, `None` when the key or the value is missing.
pub(crate) fn get(root: HKEY, sub_key: &str, name: &str, view: u32) -> WinResult<Option<String>> {
    let Some(key) = open(root, sub_key, KEY_QUERY_VALUE | view_bits(view))? else {
        return Ok(None);
    };
    let Some((ty, data)) = query(&key, name)? else {
        return Ok(None);
    };
    let mut j = Json::new();
    j.begin_object();
    write_value(&mut j, ty, &data);
    j.end_object();
    Ok(Some(j.finish()))
}

/// Creates the key if needed and writes the value. `data` is already encoded by `windows.ts`
/// (strings as UTF-16 by this function, numbers and binary as raw little-endian bytes).
pub(crate) fn set(
    root: HKEY,
    sub_key: &str,
    name: &str,
    ty: u32,
    data: &[u8],
    view: u32,
) -> WinResult<()> {
    let key = create(root, sub_key, KEY_SET_VALUE | view_bits(view))?;
    let name_w = wide(name);
    // SAFETY: `data` is valid for its length.
    let rc = unsafe {
        RegSetValueExW(
            key.0,
            name_w.as_ptr(),
            0,
            ty,
            data.as_ptr(),
            data.len() as u32,
        )
    };
    if rc != 0 {
        return Err(WinErr::status(rc, "RegSetValueExW"));
    }
    Ok(())
}

/// The bytes `RegSetValueExW` expects for a string type: UTF-16LE with its terminator(s).
/// `REG_MULTI_SZ` items are separated by NUL in `s`.
pub(crate) fn encode_string(s: &str, multi: bool) -> Vec<u8> {
    let mut units: Vec<u16> = s.encode_utf16().collect();
    units.push(0);
    if multi {
        units.push(0);
    }
    units.iter().flat_map(|u| u.to_le_bytes()).collect()
}

pub(crate) fn create_key(root: HKEY, sub_key: &str, view: u32) -> WinResult<()> {
    create(root, sub_key, KEY_READ | view_bits(view)).map(drop)
}

/// `false` when the value did not exist.
pub(crate) fn delete_value(root: HKEY, sub_key: &str, name: &str, view: u32) -> WinResult<bool> {
    let Some(key) = open(root, sub_key, KEY_SET_VALUE | view_bits(view))? else {
        return Ok(false);
    };
    let name_w = wide(name);
    // SAFETY: `name_w` is NUL-terminated.
    let rc = unsafe { RegDeleteValueW(key.0, name_w.as_ptr()) };
    match rc as u32 {
        0 => Ok(true),
        ERROR_FILE_NOT_FOUND => Ok(false),
        _ => Err(WinErr::status(rc, "RegDeleteValueW")),
    }
}

/// `false` when the key did not exist. `recursive` also deletes subkeys.
pub(crate) fn delete_key(root: HKEY, sub_key: &str, view: u32, recursive: bool) -> WinResult<bool> {
    let sub = wide(sub_key);
    if recursive {
        let Some(key) = open(
            root,
            sub_key,
            DELETE | KEY_ENUMERATE_SUB_KEYS | KEY_QUERY_VALUE | KEY_SET_VALUE | view_bits(view),
        )?
        else {
            return Ok(false);
        };
        // SAFETY: a null subkey empties `key` itself.
        let rc = unsafe { RegDeleteTreeW(key.0, core::ptr::null()) };
        if rc != 0 {
            return Err(WinErr::status(rc, "RegDeleteTreeW"));
        }
    }
    // SAFETY: `sub` is NUL-terminated.
    let rc = unsafe { RegDeleteKeyExW(root, sub.as_ptr(), view_bits(view), 0) };
    match rc as u32 {
        0 => Ok(true),
        ERROR_FILE_NOT_FOUND => Ok(false),
        _ => Err(WinErr::status(rc, "RegDeleteKeyExW")),
    }
}

/// `{"keys":[…],"values":[{"name","type","value"}…]}`, `None` when the key is missing.
pub(crate) fn list(root: HKEY, sub_key: &str, view: u32) -> WinResult<Option<String>> {
    let Some(key) = open(root, sub_key, KEY_READ | view_bits(view))? else {
        return Ok(None);
    };
    let (mut sub_keys, mut max_sub, mut values, mut max_name, mut max_data) =
        (0u32, 0u32, 0u32, 0u32, 0u32);
    // SAFETY: every out-param is a valid `u32` or null.
    let rc = unsafe {
        RegQueryInfoKeyW(
            key.0,
            core::ptr::null_mut(),
            core::ptr::null_mut(),
            core::ptr::null_mut(),
            &raw mut sub_keys,
            &raw mut max_sub,
            core::ptr::null_mut(),
            &raw mut values,
            &raw mut max_name,
            &raw mut max_data,
            core::ptr::null_mut(),
            core::ptr::null_mut(),
        )
    };
    if rc != 0 {
        return Err(WinErr::status(rc, "RegQueryInfoKeyW"));
    }
    let mut j = Json::new();
    j.begin_object();
    j.key("keys").begin_array();
    let mut name = vec![0u16; max_sub as usize + 1];
    let mut index = 0u32;
    loop {
        let mut len = name.len() as u32;
        // SAFETY: `name` is valid for `len` units.
        let rc = unsafe {
            RegEnumKeyExW(
                key.0,
                index,
                name.as_mut_ptr(),
                &raw mut len,
                core::ptr::null_mut(),
                core::ptr::null_mut(),
                core::ptr::null_mut(),
                core::ptr::null_mut(),
            )
        };
        match rc as u32 {
            0 => j.str(&String::from_utf16_lossy(&name[..len as usize])),
            ERROR_NO_MORE_ITEMS => break,
            // A subkey added since RegQueryInfoKeyW can be longer.
            ERROR_MORE_DATA => {
                name.resize(name.len() * 2, 0);
                continue;
            }
            _ => return Err(WinErr::status(rc, "RegEnumKeyExW")),
        };
        index += 1;
    }
    j.end_array();
    j.key("values").begin_array();
    let mut name = vec![0u16; max_name as usize + 1];
    let mut data = vec![0u8; max_data as usize + 2];
    let mut index = 0u32;
    loop {
        let mut len = name.len() as u32;
        let mut data_len = data.len() as u32;
        let mut ty = 0u32;
        // SAFETY: `name` and `data` are valid for `len` units and `data_len` bytes.
        let rc = unsafe {
            RegEnumValueW(
                key.0,
                index,
                name.as_mut_ptr(),
                &raw mut len,
                core::ptr::null_mut(),
                &raw mut ty,
                data.as_mut_ptr(),
                &raw mut data_len,
            )
        };
        match rc as u32 {
            0 => {
                j.begin_object();
                j.field_str("name", &String::from_utf16_lossy(&name[..len as usize]));
                write_value(&mut j, ty, &data[..data_len as usize]);
                j.end_object();
            }
            ERROR_NO_MORE_ITEMS => break,
            ERROR_MORE_DATA => {
                name.resize(name.len() * 2, 0);
                data.resize(data.len() * 2 + 2, 0);
                continue;
            }
            _ => return Err(WinErr::status(rc, "RegEnumValueW")),
        }
        index += 1;
    }
    j.end_array();
    j.end_object();
    Ok(Some(j.finish()))
}

/// A `REG_SZ`/`REG_EXPAND_SZ` value as a string, or a `REG_DWORD` as its decimal text.
/// Internal helper for `system.rs` and `wsl.rs`.
pub(crate) fn read_string(root: HKEY, sub_key: &str, name: &str) -> Option<String> {
    let key = open(root, sub_key, KEY_QUERY_VALUE).ok()??;
    let (ty, data) = query(&key, name).ok()??;
    match ty {
        REG_SZ | REG_EXPAND_SZ => Some(from_wide(&utf16_units(&data))),
        REG_DWORD if data.len() >= 4 => {
            Some(u32::from_le_bytes([data[0], data[1], data[2], data[3]]).to_string())
        }
        _ => None,
    }
}

pub(crate) fn read_dword(root: HKEY, sub_key: &str, name: &str) -> Option<u32> {
    let key = open(root, sub_key, KEY_QUERY_VALUE).ok()??;
    let (ty, data) = query(&key, name).ok()??;
    (ty == REG_DWORD && data.len() >= 4)
        .then(|| u32::from_le_bytes([data[0], data[1], data[2], data[3]]))
}

/// Subkey names of `sub_key`; empty when it is missing.
pub(crate) fn subkeys(root: HKEY, sub_key: &str) -> Vec<String> {
    let Ok(Some(key)) = open(root, sub_key, KEY_READ) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut name = vec![0u16; 256];
    let mut index = 0u32;
    loop {
        let mut len = name.len() as u32;
        // SAFETY: `name` is valid for `len` units.
        let rc = unsafe {
            RegEnumKeyExW(
                key.0,
                index,
                name.as_mut_ptr(),
                &raw mut len,
                core::ptr::null_mut(),
                core::ptr::null_mut(),
                core::ptr::null_mut(),
                core::ptr::null_mut(),
            )
        };
        if rc != 0 {
            break;
        }
        out.push(String::from_utf16_lossy(&name[..len as usize]));
        index += 1;
    }
    out
}
