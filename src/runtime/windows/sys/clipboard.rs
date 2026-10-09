//! Clipboard text (`CF_UNICODETEXT`).

use super::{BOOL, HANDLE, WinErr, WinResult};

const CF_UNICODETEXT: u32 = 13;
const GMEM_MOVEABLE: u32 = 0x0002;

#[link(name = "user32")]
unsafe extern "system" {
    fn OpenClipboard(owner: HANDLE) -> BOOL;
    fn CloseClipboard() -> BOOL;
    fn EmptyClipboard() -> BOOL;
    fn GetClipboardData(format: u32) -> HANDLE;
    fn SetClipboardData(format: u32, mem: HANDLE) -> HANDLE;
    fn IsClipboardFormatAvailable(format: u32) -> BOOL;
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GlobalAlloc(flags: u32, bytes: usize) -> HANDLE;
    fn GlobalFree(mem: HANDLE) -> HANDLE;
    fn GlobalLock(mem: HANDLE) -> *mut core::ffi::c_void;
    fn GlobalUnlock(mem: HANDLE) -> BOOL;
    fn GlobalSize(mem: HANDLE) -> usize;
    fn Sleep(ms: u32);
}

/// Holds the clipboard open; another process may own it for a moment, so opening retries.
struct Open;

impl Open {
    fn new() -> WinResult<Open> {
        for _ in 0..20 {
            // SAFETY: no owner window.
            if unsafe { OpenClipboard(core::ptr::null_mut()) } != 0 {
                return Ok(Open);
            }
            // SAFETY: no preconditions.
            unsafe { Sleep(10) };
        }
        Err(WinErr::last("OpenClipboard"))
    }
}

impl Drop for Open {
    fn drop(&mut self) {
        // SAFETY: opened by `Open::new`.
        unsafe { CloseClipboard() };
    }
}

/// The clipboard text, or `None` when it holds no text.
pub(crate) fn read_text() -> WinResult<Option<String>> {
    let _open = Open::new()?;
    // SAFETY: the clipboard is open.
    if unsafe { IsClipboardFormatAvailable(CF_UNICODETEXT) } == 0 {
        return Ok(None);
    }
    // SAFETY: the clipboard is open; the handle stays owned by the clipboard.
    let mem = unsafe { GetClipboardData(CF_UNICODETEXT) };
    if mem.is_null() {
        return Err(WinErr::last("GetClipboardData"));
    }
    // SAFETY: `mem` is a global memory handle from the clipboard.
    let ptr = unsafe { GlobalLock(mem) }.cast::<u16>();
    if ptr.is_null() {
        return Err(WinErr::last("GlobalLock"));
    }
    // SAFETY: the block is `GlobalSize` bytes long and locked until `GlobalUnlock`.
    let units = unsafe { core::slice::from_raw_parts(ptr, GlobalSize(mem) / 2) };
    let text = super::from_wide(units);
    // SAFETY: locked above.
    unsafe { GlobalUnlock(mem) };
    Ok(Some(text))
}

/// Replaces the clipboard content with `text`.
pub(crate) fn write_text(text: &str) -> WinResult<()> {
    let wide = super::wide(text);
    let bytes = wide.len() * 2;
    // SAFETY: plain allocation.
    let mem = unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes) };
    if mem.is_null() {
        return Err(WinErr::last("GlobalAlloc"));
    }
    // SAFETY: `mem` was just allocated with `bytes` bytes.
    let ptr = unsafe { GlobalLock(mem) }.cast::<u16>();
    if ptr.is_null() {
        let err = WinErr::last("GlobalLock");
        // SAFETY: still owned by us.
        unsafe { GlobalFree(mem) };
        return Err(err);
    }
    // SAFETY: the block holds `wide.len()` units.
    unsafe {
        core::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
        GlobalUnlock(mem);
    }
    let open = match Open::new() {
        Ok(open) => open,
        Err(err) => {
            // SAFETY: still owned by us.
            unsafe { GlobalFree(mem) };
            return Err(err);
        }
    };
    // SAFETY: the clipboard is open; on success it takes ownership of `mem`.
    unsafe {
        EmptyClipboard();
        if SetClipboardData(CF_UNICODETEXT, mem).is_null() {
            let err = WinErr::last("SetClipboardData");
            GlobalFree(mem);
            drop(open);
            return Err(err);
        }
    }
    drop(open);
    Ok(())
}

pub(crate) fn clear() -> WinResult<()> {
    let _open = Open::new()?;
    // SAFETY: the clipboard is open.
    if unsafe { EmptyClipboard() } == 0 {
        return Err(WinErr::last("EmptyClipboard"));
    }
    Ok(())
}
