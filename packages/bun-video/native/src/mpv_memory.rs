use crate::memory_io::MemoryInput;
use ffmpeg_next::ffi;
use libloading::Library;
use std::{
    ffi::{CStr, c_char, c_ulong, c_void},
    ptr,
    sync::atomic::{AtomicBool, Ordering},
};

const INVALID: i32 = -22;
const NO_MEMORY: i32 = -12;

#[repr(C)]
struct StreamInfo {
    cookie: *mut c_void,
    read: Option<unsafe extern "C" fn(*mut c_void, *mut c_char, u64) -> i64>,
    seek: Option<unsafe extern "C" fn(*mut c_void, i64) -> i64>,
    size: Option<unsafe extern "C" fn(*mut c_void) -> i64>,
    close: Option<unsafe extern "C" fn(*mut c_void)>,
    cancel: Option<unsafe extern "C" fn(*mut c_void)>,
}

pub struct Protocol {
    _library: Library,
    bytes: Vec<u8>,
}

struct Cursor {
    owner: *const Protocol,
    position: usize,
    cancelled: AtomicBool,
}

unsafe extern "C" fn read(cookie: *mut c_void, buffer: *mut c_char, requested: u64) -> i64 {
    if cookie.is_null() || buffer.is_null() {
        return -1;
    }
    // SAFETY: mpv owns the cursor until close; only cancel runs concurrently with this read/seek cursor.
    let cursor = unsafe { &mut *cookie.cast::<Cursor>() };
    if cursor.cancelled.load(Ordering::Acquire) {
        return -1;
    }
    // SAFETY: the protocol owner outlives all streams until mpv_terminate_destroy returns.
    let bytes = unsafe { &(*cursor.owner).bytes };
    let remaining = bytes.len().saturating_sub(cursor.position);
    let count = remaining.min(usize::try_from(requested).unwrap_or(usize::MAX));
    if count == 0 {
        return 0;
    }
    // SAFETY: count is bounded by both the destination capacity and the remaining immutable bytes.
    unsafe {
        ptr::copy_nonoverlapping(bytes.as_ptr().add(cursor.position), buffer.cast(), count);
    }
    cursor.position += count;
    count as i64
}

unsafe extern "C" fn seek(cookie: *mut c_void, offset: i64) -> i64 {
    if cookie.is_null() || offset < 0 {
        return -1;
    }
    // SAFETY: mpv retains the cursor and owner until close; seeks share the serialized demux cursor.
    let cursor = unsafe { &mut *cookie.cast::<Cursor>() };
    if cursor.cancelled.load(Ordering::Acquire) {
        return -1;
    }
    // SAFETY: protocol bytes are immutable and live for the entire stream.
    let length = unsafe { (*cursor.owner).bytes.len() };
    let Ok(position) = usize::try_from(offset) else {
        return -1;
    };
    if position > length {
        return -1;
    }
    cursor.position = position;
    offset
}

unsafe extern "C" fn size(cookie: *mut c_void) -> i64 {
    if cookie.is_null() {
        return -1;
    }
    // SAFETY: mpv retains both pointers and bytes are bounded to 512 MiB at creation.
    unsafe { (*(*cookie.cast::<Cursor>()).owner).bytes.len() as i64 }
}

unsafe extern "C" fn close(cookie: *mut c_void) {
    if cookie.is_null() {
        return;
    }
    // SAFETY: mpv calls close once after all operations, transferring its fixed-size cursor allocation.
    unsafe {
        ptr::drop_in_place(cookie.cast::<Cursor>());
        ffi::av_free(cookie);
    }
}

unsafe extern "C" fn cancel(cookie: *mut c_void) {
    if cookie.is_null() {
        return;
    }
    // SAFETY: only the atomic flag is accessed concurrently; mpv keeps the cursor alive through cancellation.
    unsafe {
        (*cookie.cast::<Cursor>())
            .cancelled
            .store(true, Ordering::Release);
    }
}

unsafe extern "C" fn open(owner: *mut c_void, _uri: *mut c_char, info: *mut StreamInfo) -> i32 {
    if owner.is_null() || info.is_null() {
        return INVALID;
    }
    // SAFETY: a checked aligned allocation holds the cursor; mpv copies the initialized callback descriptor.
    unsafe {
        let cursor = ffi::av_malloc(std::mem::size_of::<Cursor>()).cast::<Cursor>();
        if cursor.is_null() {
            return NO_MEMORY;
        }
        ptr::write(
            cursor,
            Cursor {
                owner: owner.cast(),
                position: 0,
                cancelled: AtomicBool::new(false),
            },
        );
        ptr::write(
            info,
            StreamInfo {
                cookie: cursor.cast(),
                read: Some(read),
                seek: Some(seek),
                size: Some(size),
                close: Some(close),
                cancel: Some(cancel),
            },
        );
    }
    0
}

/// # Safety
/// All input pointers must be live; strings are NUL-terminated. The caller keeps the returned protocol
/// and this bridge library alive until mpv_terminate_destroy has finished closing every stream.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_video_mpv_memory_register(
    input: *const MemoryInput,
    player: *mut c_void,
    library: *const c_char,
    name: *const c_char,
    output: *mut *mut Protocol,
) -> i32 {
    if input.is_null()
        || player.is_null()
        || library.is_null()
        || name.is_null()
        || output.is_null()
    {
        return INVALID;
    }
    // SAFETY: caller provides readable strings, a live input owner and a writable output slot.
    let (library, bytes) = unsafe {
        *output = ptr::null_mut();
        let Ok(path) = CStr::from_ptr(library).to_str() else {
            return INVALID;
        };
        let Ok(library) = Library::new(path) else {
            return INVALID;
        };
        let Ok(bytes) = (*input).copy_bytes() else {
            return NO_MEMORY;
        };
        (library, bytes)
    };
    type Version = unsafe extern "C" fn() -> c_ulong;
    type Register = unsafe extern "C" fn(
        *mut c_void,
        *const c_char,
        *mut c_void,
        Option<unsafe extern "C" fn(*mut c_void, *mut c_char, *mut StreamInfo) -> i32>,
    ) -> i32;
    // SAFETY: these exact ABI signatures come from the pinned mpv 2.5 headers; the library remains owned.
    unsafe {
        let Ok(version) = library.get::<Version>(b"mpv_client_api_version\0") else {
            return INVALID;
        };
        if version() != ((2 << 16) | 5) {
            return INVALID;
        }
        let Ok(register) = library.get::<Register>(b"mpv_stream_cb_add_ro\0") else {
            return INVALID;
        };
        let register = *register;
        let protocol = ffi::av_malloc(std::mem::size_of::<Protocol>()).cast::<Protocol>();
        if protocol.is_null() {
            return NO_MEMORY;
        }
        ptr::write(
            protocol,
            Protocol {
                _library: library,
                bytes,
            },
        );
        let status = register(player, name, protocol.cast(), Some(open));
        if status < 0 {
            ptr::drop_in_place(protocol);
            ffi::av_free(protocol.cast());
            return status;
        }
        *output = protocol;
    }
    0
}

/// # Safety
/// The slot contains a uniquely owned live protocol or null; all mpv streams must already be destroyed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_video_mpv_memory_release(protocol: *mut *mut Protocol) {
    if protocol.is_null() {
        return;
    }
    // SAFETY: caller transfers ownership after core termination and supplies a writable pointer slot.
    unsafe {
        let owned = *protocol;
        *protocol = ptr::null_mut();
        if !owned.is_null() {
            ptr::drop_in_place(owned);
            ffi::av_free(owned.cast());
        }
    }
}
