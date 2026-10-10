//! Event log: query a channel with an XPath filter (wevtapi, loaded on first use) and write
//! an entry with `ReportEventW` (advapi32).

use super::{BOOL, HANDLE, Json, WinErr, WinResult, system_proc, wide};
use core::ffi::c_void;
use std::sync::OnceLock;

const EVT_QUERY_CHANNEL_PATH: u32 = 0x1;
const EVT_QUERY_FORWARD_DIRECTION: u32 = 0x100;
const EVT_QUERY_REVERSE_DIRECTION: u32 = 0x200;
const EVT_RENDER_EVENT_XML: u32 = 1;
const INFINITE: u32 = u32::MAX;
/// `ERROR_PROC_NOT_FOUND`: reported when wevtapi.dll or one of its exports is missing.
const ERROR_PROC_NOT_FOUND: u32 = 127;

type EvtQueryFn = unsafe extern "system" fn(HANDLE, *const u16, *const u16, u32) -> HANDLE;
type EvtNextFn = unsafe extern "system" fn(HANDLE, u32, *mut HANDLE, u32, u32, *mut u32) -> BOOL;
type EvtRenderFn =
    unsafe extern "system" fn(HANDLE, HANDLE, u32, u32, *mut c_void, *mut u32, *mut u32) -> BOOL;
type EvtCloseFn = unsafe extern "system" fn(HANDLE) -> BOOL;

#[derive(Clone, Copy)]
struct Wevt {
    query: EvtQueryFn,
    next: EvtNextFn,
    render: EvtRenderFn,
    close: EvtCloseFn,
}

fn wevt() -> WinResult<Wevt> {
    static API: OnceLock<Option<Wevt>> = OnceLock::new();
    let api = API.get_or_init(|| {
        let query = system_proc("wevtapi.dll", c"EvtQuery")?;
        let next = system_proc("wevtapi.dll", c"EvtNext")?;
        let render = system_proc("wevtapi.dll", c"EvtRender")?;
        let close = system_proc("wevtapi.dll", c"EvtClose")?;
        // SAFETY: the exports have exactly these documented signatures.
        unsafe {
            Some(Wevt {
                query: core::mem::transmute::<*mut c_void, EvtQueryFn>(query),
                next: core::mem::transmute::<*mut c_void, EvtNextFn>(next),
                render: core::mem::transmute::<*mut c_void, EvtRenderFn>(render),
                close: core::mem::transmute::<*mut c_void, EvtCloseFn>(close),
            })
        }
    });
    api.ok_or(WinErr {
        code: ERROR_PROC_NOT_FOUND,
        call: "LoadLibraryExW(wevtapi.dll)",
    })
}

struct Evt(HANDLE, EvtCloseFn);

impl Drop for Evt {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY: an open EVT_HANDLE closed once.
            unsafe { (self.1)(self.0) };
        }
    }
}

/// The rendered XML of up to `max` events of `channel` matching `xpath`, newest first when
/// `reverse`.
pub(crate) fn query(channel: &str, xpath: &str, max: u32, reverse: bool) -> WinResult<String> {
    let api = wevt()?;
    let channel_w = wide(channel);
    let xpath_w = wide(xpath);
    let flags = EVT_QUERY_CHANNEL_PATH
        | if reverse {
            EVT_QUERY_REVERSE_DIRECTION
        } else {
            EVT_QUERY_FORWARD_DIRECTION
        };
    // SAFETY: null session = local; both strings are NUL-terminated.
    let results = unsafe {
        (api.query)(
            core::ptr::null_mut(),
            channel_w.as_ptr(),
            xpath_w.as_ptr(),
            flags,
        )
    };
    if results.is_null() {
        return Err(WinErr::last("EvtQuery"));
    }
    let results = Evt(results, api.close);
    let mut j = Json::new();
    j.begin_array();
    let mut remaining = max;
    let mut buf: Vec<u16> = vec![0; 8192];
    while remaining > 0 {
        let mut batch: [HANDLE; 32] = [core::ptr::null_mut(); 32];
        let want = remaining.min(batch.len() as u32);
        let mut got = 0u32;
        // SAFETY: `batch` has room for `want` handles.
        let ok = unsafe {
            (api.next)(
                results.0,
                want,
                batch.as_mut_ptr(),
                INFINITE,
                0,
                &raw mut got,
            )
        };
        if ok == 0 {
            let err = WinErr::last("EvtNext");
            if err.code == super::ERROR_NO_MORE_ITEMS {
                break;
            }
            return Err(err);
        }
        let events: Vec<Evt> = batch[..got as usize]
            .iter()
            .map(|&h| Evt(h, api.close))
            .collect();
        for event in &events {
            loop {
                let mut used = 0u32;
                let mut props = 0u32;
                // SAFETY: `buf` is valid for its byte length.
                let ok = unsafe {
                    (api.render)(
                        core::ptr::null_mut(),
                        event.0,
                        EVT_RENDER_EVENT_XML,
                        (buf.len() * 2) as u32,
                        buf.as_mut_ptr().cast(),
                        &raw mut used,
                        &raw mut props,
                    )
                };
                if ok != 0 {
                    let units = (used as usize / 2).min(buf.len());
                    j.str(&super::from_wide(&buf[..units]));
                    break;
                }
                let err = WinErr::last("EvtRender");
                if err.code != super::ERROR_INSUFFICIENT_BUFFER {
                    return Err(err);
                }
                buf.resize((used as usize).div_ceil(2) + 1, 0);
            }
        }
        remaining -= got;
    }
    j.end_array();
    Ok(j.finish())
}

#[link(name = "advapi32")]
unsafe extern "system" {
    fn RegisterEventSourceW(server: *const u16, source: *const u16) -> HANDLE;
    fn DeregisterEventSource(h: HANDLE) -> BOOL;
    fn ReportEventW(
        h: HANDLE,
        ty: u16,
        category: u16,
        event_id: u32,
        sid: *const c_void,
        num_strings: u16,
        data_size: u32,
        strings: *const *const u16,
        data: *const c_void,
    ) -> BOOL;
}

/// Writes one entry to the Application log under `source`. `ty` is 1 (error), 2 (warning)
/// or 4 (information).
pub(crate) fn write(source: &str, ty: u16, event_id: u32, message: &str) -> WinResult<()> {
    let source_w = wide(source);
    // SAFETY: null server = local; `source_w` is NUL-terminated.
    let h = unsafe { RegisterEventSourceW(core::ptr::null(), source_w.as_ptr()) };
    if h.is_null() {
        return Err(WinErr::last("RegisterEventSourceW"));
    }
    let message_w = wide(message);
    let strings = [message_w.as_ptr()];
    // SAFETY: one NUL-terminated string; no SID and no binary data.
    let ok = unsafe {
        ReportEventW(
            h,
            ty,
            0,
            event_id,
            core::ptr::null(),
            1,
            0,
            strings.as_ptr(),
            core::ptr::null(),
        )
    };
    let result = if ok == 0 {
        Err(WinErr::last("ReportEventW"))
    } else {
        Ok(())
    };
    // SAFETY: registered above, deregistered once.
    unsafe { DeregisterEventSource(h) };
    result
}
