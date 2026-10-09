// SPDX-License-Identifier: Apache-2.0
//! Borrow contiguous writable Python storage without copying it or changing collectors.
use super::*;

static PENDING_RELEASES: Mutex<Vec<u64>> = Mutex::new(Vec::new());

pub(super) fn has_pending() -> bool {
    !PENDING_RELEASES
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .is_empty()
}

/// The JS collector only queues an identity. Python destructors run later on a
/// caller's interpreter thread under its GIL, never on the collector thread.
///
/// # Safety
/// `context` carries an identity from bun_py_buffer_acquire, not a dereferenceable pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_py_buffer_deallocator(_bytes: *mut c_void, context: *mut c_void) {
    guard((), || {
        PENDING_RELEASES
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .push(context as usize as u64);
    });
}

pub(super) fn drain_releases(api: &Api) {
    let pending = {
        let mut queue = PENDING_RELEASES
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        std::mem::take(&mut *queue)
    };
    for lease in pending {
        let view = host().as_mut().and_then(|h| h.buffers.remove(&lease));
        if let Some(mut view) = view {
            // SAFETY: caller holds the GIL; this is a matching retained Py_buffer.
            unsafe { (api.release_buffer)(&mut *view) };
        }
    }
}

/// Stable CPython Py_buffer layout (stable ABI since Python 3.11).
#[repr(C)]
pub(super) struct PyBuffer {
    data: *mut c_void,
    object: PyObj,
    length: isize,
    item_size: isize,
    readonly: c_int,
    dimensions: c_int,
    format: *mut c_char,
    shape: *mut isize,
    strides: *mut isize,
    suboffsets: *mut isize,
    internal: *mut c_void,
}

/// Sized ABI descriptor. A lease pins Python storage until explicit release.
#[repr(C)]
#[derive(Default)]
pub struct BunPyBuffer {
    pub size: u32,
    pub flags: u32,
    pub data: *mut c_void,
    pub length: usize,
    pub lease: u64,
}

/// Capability bit 0: contiguous writable buffer leases.
#[unsafe(no_mangle)]
pub extern "C" fn bun_py_capabilities() -> u64 {
    1
}

/// Evaluates an expression and pins its contiguous writable buffer.
/// Immutable and strided exporters are refused rather than exposed as mutable JS bytes.
///
/// # Safety
/// `expression` is a valid C string. `out` points to a writable descriptor whose
/// size matches `BunPyBuffer`. Only access `data[0..length]` while `lease` is live;
/// serialize writes with Python calls. Detach all JS views before releasing.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_py_buffer_acquire(
    expression: *const c_char,
    flags: u32,
    out: *mut BunPyBuffer,
) -> i32 {
    // SAFETY: pointer validity is the caller contract; null is rejected first.
    let Some(expression) = (unsafe { cstr_arg(expression) }) else {
        return APHRODY_PY_ERR_ARG;
    };
    if out.is_null()
        || flags != 1
        // SAFETY: caller supplies a readable descriptor when non-null.
        || unsafe { (*out).size } as usize != std::mem::size_of::<BunPyBuffer>()
    {
        set_error("shared buffer requires sized descriptor and writable flag 1");
        return APHRODY_PY_ERR_ARG;
    }
    with_gil(|api| {
        // SAFETY: all CPython operations occur under the GIL, with new references released.
        unsafe {
            let main = (api.add_module)(c"__main__".as_ptr());
            if main.is_null() {
                take_exception(api);
                return APHRODY_PY_ERR_PYTHON;
            }
            let globals = (api.module_dict)(main);
            let object = (api.run_string)(expression.as_ptr(), PY_EVAL_INPUT, globals, globals);
            if object.is_null() {
                take_exception(api);
                return APHRODY_PY_ERR_PYTHON;
            }
            let mut uninitialized = Box::<PyBuffer>::new_uninit();
            let status = (api.get_buffer)(object, uninitialized.as_mut_ptr(), 1);
            (api.decref)(object);
            if status != 0 {
                take_exception(api);
                return APHRODY_PY_ERR_PYTHON;
            }
            // PyObject_GetBuffer initializes every field on success and retains
            // the exporting object; moving the box does not move the Py_buffer.
            let mut view = uninitialized.assume_init();
            if view.length < 0 || view.readonly != 0 {
                (api.release_buffer)(&mut *view);
                set_error("exporter did not provide a writable contiguous buffer");
                return APHRODY_PY_ERR_PYTHON;
            }
            let mut slot = host();
            let h = slot.as_mut().expect("active call retains the interpreter");
            let lease = h.next_buffer;
            let Some(next) = lease.checked_add(1) else {
                (api.release_buffer)(&mut *view);
                set_error("shared buffer lease identity exhausted");
                return APHRODY_PY_ERR_STATE;
            };
            h.next_buffer = next;
            let descriptor = BunPyBuffer {
                size: std::mem::size_of::<BunPyBuffer>() as u32,
                flags: 1,
                data: view.data,
                length: view.length as usize,
                lease,
            };
            h.buffers.insert(lease, view);
            *out = descriptor;
            APHRODY_PY_OK
        }
    })
}

/// Releases exactly one pinned buffer. Unknown or already released identities fail.
#[unsafe(no_mangle)]
pub extern "C" fn bun_py_buffer_release(lease: u64) -> i32 {
    with_gil(|api| {
        let mut view = {
            let mut slot = host();
            let Some(view) = slot.as_mut().and_then(|h| h.buffers.remove(&lease)) else {
                set_error("unknown or released shared buffer lease");
                return APHRODY_PY_ERR_ARG;
            };
            view
        };
        // SAFETY: matching live Py_buffer obtained under the same CPython GIL.
        unsafe { (api.release_buffer)(&mut *view) };
        APHRODY_PY_OK
    })
}
