//! COM delegates for `bun:winrt` and `windows.win32`: objects whose `IUnknown` lives in native code
//! (atomic refcount, callable from any apartment or thread pool thread) and whose `Invoke` forwards to a
//! threadsafe `JSCallback`. WinRT completion handlers and event handlers are called on worker threads in
//! the MTA, which a plain `JSCallback` vtable cannot survive.
//!
//! `Invoke(this, a, b, c, d)` reads four integer argument registers; arguments flagged in `interfaces`
//! are `AddRef`ed before the call is posted, so JS receives owned references. When the last reference
//! is released the entry is called once more with a null `this`, telling JS to close the callback.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

#[cfg(windows)]
mod imp {
    use core::ffi::c_void;
    use core::sync::atomic::{AtomicU32, Ordering, fence};

    pub(super) type Entry = unsafe extern "system" fn(*mut Delegate, u64, u64, u64, u64) -> i32;

    #[repr(C)]
    struct Vtbl {
        query_interface: unsafe extern "system" fn(*mut Delegate, *const [u8; 16], *mut *mut c_void) -> i32,
        add_ref: unsafe extern "system" fn(*mut Delegate) -> u32,
        release: unsafe extern "system" fn(*mut Delegate) -> u32,
        invoke: unsafe extern "system" fn(*mut Delegate, u64, u64, u64, u64) -> i32,
    }

    #[repr(C)]
    pub(super) struct Delegate {
        vtbl: *const Vtbl,
        refs: AtomicU32,
        interfaces: u32,
        iid: [u8; 16],
        entry: Entry,
    }

    const E_NOINTERFACE: i32 = 0x8000_4002_u32 as i32;
    const E_POINTER: i32 = 0x8000_4003_u32 as i32;

    const IID_IUNKNOWN: [u8; 16] = [0, 0, 0, 0, 0, 0, 0, 0, 0xc0, 0, 0, 0, 0, 0, 0, 0x46];
    // 94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90
    const IID_IAGILEOBJECT: [u8; 16] = [
        0x94, 0x2b, 0xea, 0x94, 0xcc, 0xe9, 0xe0, 0x49, 0xc0, 0xff, 0xee, 0x64, 0xca, 0x8f, 0x5b, 0x90,
    ];

    static VTBL: Vtbl = Vtbl { query_interface, add_ref, release, invoke };

    unsafe extern "system" fn query_interface(
        this: *mut Delegate,
        riid: *const [u8; 16],
        out: *mut *mut c_void,
    ) -> i32 {
        if out.is_null() || riid.is_null() {
            return E_POINTER;
        }
        // SAFETY: COM callers pass a valid IID and out pointer; `this` is alive while they hold a reference.
        unsafe {
            let iid = *riid;
            if iid == IID_IUNKNOWN || iid == IID_IAGILEOBJECT || iid == (*this).iid {
                add_ref(this);
                *out = this.cast();
                return 0;
            }
            *out = core::ptr::null_mut();
        }
        E_NOINTERFACE
    }

    unsafe extern "system" fn add_ref(this: *mut Delegate) -> u32 {
        // SAFETY: the caller holds a reference, so `this` is alive.
        unsafe { (*this).refs.fetch_add(1, Ordering::Relaxed) + 1 }
    }

    unsafe extern "system" fn release(this: *mut Delegate) -> u32 {
        // SAFETY: the caller holds the reference it releases.
        let left = unsafe { (*this).refs.fetch_sub(1, Ordering::Release) } - 1;
        if left == 0 {
            fence(Ordering::Acquire);
            // SAFETY: last reference; the delegate was created by `create` with `heap::into_raw`.
            let entry = unsafe { (*this).entry };
            unsafe { bun_core::heap::destroy(this) };
            // SAFETY: the JS side keeps the callback open until it receives this null-`this` call.
            unsafe { entry(core::ptr::null_mut(), 0, 0, 0, 0) };
        }
        left
    }

    unsafe extern "system" fn invoke(this: *mut Delegate, a: u64, b: u64, c: u64, d: u64) -> i32 {
        // SAFETY: the caller holds a reference to `this`; flagged arguments are interface pointers.
        unsafe {
            let mask = (*this).interfaces;
            for (i, arg) in [a, b, c, d].into_iter().enumerate() {
                if mask & (1 << i) != 0 && arg != 0 {
                    let vtbl = *(arg as *const *const usize);
                    let add_ref: unsafe extern "system" fn(u64) -> u32 = core::mem::transmute(*vtbl.add(1));
                    add_ref(arg);
                }
            }
            add_ref(this);
            ((*this).entry)(this, a, b, c, d);
        }
        0
    }

    /// A delegate with one reference, owned by the caller.
    pub(super) fn create(iid: [u8; 16], entry: Entry, interfaces: u32) -> *mut Delegate {
        bun_core::heap::into_raw(Box::new(Delegate {
            vtbl: &VTBL,
            refs: AtomicU32::new(1),
            interfaces,
            iid,
            entry,
        }))
    }
}

/// `comDelegate(iidAddress, entryAddress, interfaceMask)` → address of a new delegate with one
/// reference. `Invoke` also adds one reference to the delegate itself, which JS releases after
/// running the handler, so the delegate outlives the posted call.
#[bun_jsc::host_fn]
pub(crate) fn js_com_delegate(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(windows)]
    {
        let _ = global;
        let iid_address = frame.argument(0).to_int64() as usize;
        let entry_address = frame.argument(1).to_int64() as usize;
        let interfaces = frame.argument(2).to_int64() as u32;
        if iid_address == 0 || entry_address == 0 {
            return Ok(JSValue::js_number(0.0));
        }
        // SAFETY: windows.ts passes the address of a live 16-byte GUID buffer.
        let iid = unsafe { *(iid_address as *const [u8; 16]) };
        // SAFETY: entry_address is the native entrypoint of a threadsafe JSCallback with the `Entry` signature.
        let entry: imp::Entry = unsafe { core::mem::transmute(entry_address) };
        let delegate = imp::create(iid, entry, interfaces);
        Ok(JSValue::js_number(delegate as usize as f64))
    }
    #[cfg(not(windows))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
