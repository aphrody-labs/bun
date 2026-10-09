//! Win32 side of `bun:windows`, free of JSC types so it can be exercised on its own.
//!
//! Every function returns `Result<_, WinErr>`; the host functions in `../host.rs`
//! turn a `WinErr` into a thrown `SystemError`. Results that cross into JS as
//! structured data are serialized with [`Json`] and parsed by `src/js/bun/windows.ts`.
//!
//! Only DLLs already imported by the Bun executable are linked statically
//! (kernel32, advapi32, user32, shell32, ole32, ntdll; see
//! `scripts/build/binary-expectations.ts`). `wevtapi.dll` and `combase.dll` are
//! loaded on first use from System32.

#![cfg(windows)]
#![allow(non_snake_case, non_camel_case_types, clippy::upper_case_acronyms)]

pub(crate) mod clipboard;
pub(crate) mod eventlog;
pub(crate) mod folders;
pub(crate) mod jobs;
pub(crate) mod process;
pub(crate) mod registry;
pub(crate) mod services;
pub(crate) mod storage;
pub(crate) mod system;
pub(crate) mod toast;
pub(crate) mod wsl;

use core::ffi::c_void;

pub(crate) type HANDLE = *mut c_void;
pub(crate) type BOOL = i32;

/// A failed Win32 call: the `GetLastError`/`LSTATUS`/`HRESULT` code and the API name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct WinErr {
    pub code: u32,
    pub call: &'static str,
}

impl WinErr {
    pub(crate) fn last(call: &'static str) -> WinErr {
        // SAFETY: no preconditions.
        WinErr {
            code: unsafe { GetLastError() },
            call,
        }
    }
    pub(crate) fn status(code: i32, call: &'static str) -> WinErr {
        WinErr {
            code: code as u32,
            call,
        }
    }
}

pub(crate) type WinResult<T> = Result<T, WinErr>;

pub(crate) const ERROR_FILE_NOT_FOUND: u32 = 2;
pub(crate) const ERROR_INSUFFICIENT_BUFFER: u32 = 122;
pub(crate) const ERROR_MORE_DATA: u32 = 234;
pub(crate) const ERROR_NO_MORE_ITEMS: u32 = 259;

#[link(name = "kernel32")]
unsafe extern "system" {
    pub(crate) fn GetLastError() -> u32;
    pub(crate) fn CloseHandle(h: HANDLE) -> BOOL;
    fn FormatMessageW(
        flags: u32,
        source: *const c_void,
        message_id: u32,
        language_id: u32,
        buffer: *mut u16,
        size: u32,
        args: *mut c_void,
    ) -> u32;
    fn LoadLibraryExW(name: *const u16, file: HANDLE, flags: u32) -> HANDLE;
    fn GetProcAddress(module: HANDLE, name: *const u8) -> *mut c_void;
}

/// NUL-terminated UTF-16 copy of `s`.
pub(crate) fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(core::iter::once(0)).collect()
}

pub(crate) fn is_nul(c: &u16) -> bool {
    *c == 0
}

/// `s` up to its first NUL, lossily decoded.
pub(crate) fn from_wide(s: &[u16]) -> String {
    let end = s.iter().take_while(|&&c| c != 0).count();
    String::from_utf16_lossy(&s[..end])
}

/// A NUL-terminated wide string at `p`; empty for null.
///
/// # Safety
/// `p` is null or points at a NUL-terminated UTF-16 string.
pub(crate) unsafe fn from_pwstr(p: *const u16) -> String {
    if p.is_null() {
        return String::new();
    }
    let mut len = 0usize;
    // SAFETY: caller guarantees NUL termination.
    while unsafe { *p.add(len) } != 0 {
        len += 1;
    }
    // SAFETY: `len` elements were just read.
    String::from_utf16_lossy(unsafe { core::slice::from_raw_parts(p, len) })
}

/// The system message for `code`, without the trailing period and newline.
pub(crate) fn message(code: u32) -> String {
    const FORMAT_MESSAGE_FROM_SYSTEM: u32 = 0x1000;
    const FORMAT_MESSAGE_IGNORE_INSERTS: u32 = 0x200;
    let mut buf = [0u16; 512];
    // SAFETY: `buf` is valid for its length; no inserts are expanded.
    let n = unsafe {
        FormatMessageW(
            FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
            core::ptr::null(),
            code,
            0,
            buf.as_mut_ptr(),
            buf.len() as u32,
            core::ptr::null_mut(),
        )
    };
    let text = String::from_utf16_lossy(&buf[..n as usize]);
    text.trim_end_matches(['\r', '\n', ' ', '.']).to_owned()
}

/// `GetProcAddress` on a System32 DLL loaded once per process. `None` when the DLL or the
/// export is missing.
pub(crate) fn system_proc(dll: &str, name: &core::ffi::CStr) -> Option<*mut c_void> {
    const LOAD_LIBRARY_SEARCH_SYSTEM32: u32 = 0x800;
    let dll_w = wide(dll);
    // SAFETY: `dll_w` is NUL-terminated; a module handle stays valid for the process.
    let module = unsafe {
        LoadLibraryExW(
            dll_w.as_ptr(),
            core::ptr::null_mut(),
            LOAD_LIBRARY_SEARCH_SYSTEM32,
        )
    };
    if module.is_null() {
        return None;
    }
    // SAFETY: `module` is loaded; `name` is NUL-terminated.
    let proc = unsafe { GetProcAddress(module, name.as_ptr().cast()) };
    (!proc.is_null()).then_some(proc)
}

/// Closes a kernel handle on drop.
pub(crate) struct OwnedHandle(pub HANDLE);

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        if !self.0.is_null() && self.0 as isize != -1 {
            // SAFETY: the handle is owned and closed once.
            unsafe { CloseHandle(self.0) };
        }
    }
}

/// Minimal JSON writer for the structured results handed to `windows.ts`.
#[derive(Default)]
pub(crate) struct Json {
    out: String,
    /// One flag per open container: whether the next item needs a leading comma.
    comma: Vec<bool>,
    /// A key was just written; its value takes no comma.
    after_key: bool,
}

impl Json {
    pub(crate) fn new() -> Json {
        Json::default()
    }

    fn sep(&mut self) {
        if self.after_key {
            self.after_key = false;
            return;
        }
        if let Some(c) = self.comma.last_mut() {
            if *c {
                self.out.push(',');
            }
            *c = true;
        }
    }

    pub(crate) fn begin_object(&mut self) -> &mut Self {
        self.sep();
        self.out.push('{');
        self.comma.push(false);
        self
    }

    pub(crate) fn end_object(&mut self) -> &mut Self {
        self.comma.pop();
        self.out.push('}');
        self
    }

    pub(crate) fn begin_array(&mut self) -> &mut Self {
        self.sep();
        self.out.push('[');
        self.comma.push(false);
        self
    }

    pub(crate) fn end_array(&mut self) -> &mut Self {
        self.comma.pop();
        self.out.push(']');
        self
    }

    /// An object key; the next call writes its value.
    pub(crate) fn key(&mut self, k: &str) -> &mut Self {
        self.sep();
        self.push_str(k);
        self.out.push(':');
        self.after_key = true;
        self
    }

    pub(crate) fn str(&mut self, s: &str) -> &mut Self {
        self.sep();
        self.push_str(s);
        self
    }

    pub(crate) fn num(&mut self, n: f64) -> &mut Self {
        self.sep();
        if n.is_finite() {
            self.out.push_str(&format!("{n}"));
        } else {
            self.out.push_str("null");
        }
        self
    }

    pub(crate) fn bool(&mut self, b: bool) -> &mut Self {
        self.sep();
        self.out.push_str(if b { "true" } else { "false" });
        self
    }

    pub(crate) fn field_str(&mut self, k: &str, v: &str) -> &mut Self {
        self.key(k).str(v)
    }

    pub(crate) fn field_num(&mut self, k: &str, v: f64) -> &mut Self {
        self.key(k).num(v)
    }

    pub(crate) fn field_bool(&mut self, k: &str, v: bool) -> &mut Self {
        self.key(k).bool(v)
    }

    fn push_str(&mut self, s: &str) {
        self.out.push('"');
        for ch in s.chars() {
            match ch {
                '"' => self.out.push_str("\\\""),
                '\\' => self.out.push_str("\\\\"),
                '\n' => self.out.push_str("\\n"),
                '\r' => self.out.push_str("\\r"),
                '\t' => self.out.push_str("\\t"),
                c if (c as u32) < 0x20 => self.out.push_str(&format!("\\u{:04x}", c as u32)),
                c => self.out.push(c),
            }
        }
        self.out.push('"');
    }

    pub(crate) fn finish(self) -> String {
        self.out
    }
}
