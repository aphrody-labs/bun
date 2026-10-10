//! Toast notifications through WinRT `Windows.UI.Notifications`, with `combase.dll` loaded
//! on first use.

use super::folders::Guid;
use super::{WinErr, WinResult, system_proc, wide};
use core::ffi::c_void;
use std::sync::OnceLock;

type HSTRING = *mut c_void;
/// `ERROR_PROC_NOT_FOUND`.
const ERROR_PROC_NOT_FOUND: u32 = 127;
const RO_INIT_MULTITHREADED: i32 = 1;
/// `RPC_E_CHANGED_MODE`: the thread is already a single-threaded apartment, which is fine.
const RPC_E_CHANGED_MODE: i32 = 0x8001_0106_u32 as i32;

const IID_IXML_DOCUMENT_IO: Guid = Guid {
    data1: 0x6CD0_E74E,
    data2: 0xEE65,
    data3: 0x4489,
    data4: [0x9E, 0xBF, 0xCA, 0x43, 0xE8, 0x7B, 0xA6, 0x37],
};
const IID_IXML_DOCUMENT: Guid = Guid {
    data1: 0xF7F3_A506,
    data2: 0x1E87,
    data3: 0x42D6,
    data4: [0xBC, 0xFB, 0xB8, 0xC8, 0x09, 0xFA, 0x54, 0x94],
};
const IID_ITOAST_NOTIFICATION_FACTORY: Guid = Guid {
    data1: 0x0412_4B20,
    data2: 0x82C6,
    data3: 0x4229,
    data4: [0xB1, 0x09, 0xFD, 0x9E, 0xD4, 0x66, 0x2B, 0x53],
};
const IID_ITOAST_NOTIFICATION_MANAGER_STATICS: Guid = Guid {
    data1: 0x50AC_103F,
    data2: 0xD235,
    data3: 0x4598,
    data4: [0xBB, 0xEF, 0x98, 0xFE, 0x4D, 0x1A, 0x3A, 0xD4],
};

type RoInitializeFn = unsafe extern "system" fn(i32) -> i32;
type RoUninitializeFn = unsafe extern "system" fn();
type RoActivateInstanceFn = unsafe extern "system" fn(HSTRING, *mut *mut c_void) -> i32;
type RoGetActivationFactoryFn =
    unsafe extern "system" fn(HSTRING, *const Guid, *mut *mut c_void) -> i32;
type WindowsCreateStringFn = unsafe extern "system" fn(*const u16, u32, *mut HSTRING) -> i32;
type WindowsDeleteStringFn = unsafe extern "system" fn(HSTRING) -> i32;

#[derive(Clone, Copy)]
struct Combase {
    init: RoInitializeFn,
    uninit: RoUninitializeFn,
    activate: RoActivateInstanceFn,
    factory: RoGetActivationFactoryFn,
    create_string: WindowsCreateStringFn,
    delete_string: WindowsDeleteStringFn,
}

fn combase() -> WinResult<Combase> {
    static API: OnceLock<Option<Combase>> = OnceLock::new();
    let api = API.get_or_init(|| {
        let init = system_proc("combase.dll", c"RoInitialize")?;
        let uninit = system_proc("combase.dll", c"RoUninitialize")?;
        let activate = system_proc("combase.dll", c"RoActivateInstance")?;
        let factory = system_proc("combase.dll", c"RoGetActivationFactory")?;
        let create_string = system_proc("combase.dll", c"WindowsCreateString")?;
        let delete_string = system_proc("combase.dll", c"WindowsDeleteString")?;
        // SAFETY: the exports have exactly these documented signatures.
        unsafe {
            Some(Combase {
                init: core::mem::transmute::<*mut c_void, RoInitializeFn>(init),
                uninit: core::mem::transmute::<*mut c_void, RoUninitializeFn>(uninit),
                activate: core::mem::transmute::<*mut c_void, RoActivateInstanceFn>(activate),
                factory: core::mem::transmute::<*mut c_void, RoGetActivationFactoryFn>(factory),
                create_string: core::mem::transmute::<*mut c_void, WindowsCreateStringFn>(
                    create_string,
                ),
                delete_string: core::mem::transmute::<*mut c_void, WindowsDeleteStringFn>(
                    delete_string,
                ),
            })
        }
    });
    api.ok_or(WinErr {
        code: ERROR_PROC_NOT_FOUND,
        call: "LoadLibraryExW(combase.dll)",
    })
}

fn check(hr: i32, call: &'static str) -> WinResult<()> {
    if hr < 0 {
        Err(WinErr::status(hr, call))
    } else {
        Ok(())
    }
}

struct HString(HSTRING, WindowsDeleteStringFn);

impl HString {
    fn new(api: &Combase, s: &str) -> WinResult<HString> {
        let w = wide(s);
        let mut h: HSTRING = core::ptr::null_mut();
        check(
            // SAFETY: `w` holds `len` units plus a NUL; h is a writable output pointer.
            unsafe { (api.create_string)(w.as_ptr(), (w.len() - 1) as u32, &raw mut h) },
            "WindowsCreateString",
        )?;
        Ok(HString(h, api.delete_string))
    }
}

impl Drop for HString {
    fn drop(&mut self) {
        // SAFETY: created by WindowsCreateString (null is the empty string and is accepted).
        unsafe { (self.1)(self.0) };
    }
}

/// An owned COM interface pointer. Slot `n` of the vtable is read as a function pointer of
/// the exact signature of that method.
struct Com(*mut c_void);

impl Com {
    fn slot(&self, n: usize) -> *const c_void {
        // SAFETY: `self.0` points at an object whose first word is its vtable.
        unsafe { *(*(self.0 as *const *const *const c_void)).add(n) }
    }

    fn query(&self, iid: &Guid, call: &'static str) -> WinResult<Com> {
        type QueryInterface =
            unsafe extern "system" fn(*mut c_void, *const Guid, *mut *mut c_void) -> i32;
        let mut out: *mut c_void = core::ptr::null_mut();
        // SAFETY: slot 0 is IUnknown::QueryInterface.
        let hr = unsafe {
            core::mem::transmute::<*const c_void, QueryInterface>(self.slot(0))(
                self.0,
                iid,
                &raw mut out,
            )
        };
        check(hr, call)?;
        Ok(Com(out))
    }
}

impl Drop for Com {
    fn drop(&mut self) {
        type Release = unsafe extern "system" fn(*mut c_void) -> u32;
        if !self.0.is_null() {
            // SAFETY: slot 2 is IUnknown::Release; one reference is owned.
            unsafe { core::mem::transmute::<*const c_void, Release>(self.slot(2))(self.0) };
        }
    }
}

/// Shows the toast described by `xml` (toast schema) under the app user model id `aumid`.
pub(crate) fn show(aumid: &str, xml: &str) -> WinResult<()> {
    let api = combase()?;
    // SAFETY: no preconditions.
    let hr = unsafe { (api.init)(RO_INIT_MULTITHREADED) };
    if hr < 0 && hr != RPC_E_CHANGED_MODE {
        return Err(WinErr::status(hr, "RoInitialize"));
    }
    scopeguard::defer! {
        if hr >= 0 {
            // SAFETY: balances successful initialization after all local COM references drop.
            unsafe { (api.uninit)() };
        }
    }

    let class = HString::new(&api, "Windows.Data.Xml.Dom.XmlDocument")?;
    let mut doc: *mut c_void = core::ptr::null_mut();
    check(
        // SAFETY: `class` is a valid HSTRING and doc is a writable output pointer.
        unsafe { (api.activate)(class.0, &raw mut doc) },
        "RoActivateInstance",
    )?;
    let doc = Com(doc);

    let io = doc.query(&IID_IXML_DOCUMENT_IO, "QueryInterface(IXmlDocumentIO)")?;
    let content = HString::new(&api, xml)?;
    type LoadXml = unsafe extern "system" fn(*mut c_void, HSTRING) -> i32;
    check(
        // SAFETY: IXmlDocumentIO slot 6 is LoadXml(HSTRING); content remains live.
        unsafe { core::mem::transmute::<*const c_void, LoadXml>(io.slot(6))(io.0, content.0) },
        "IXmlDocumentIO.LoadXml",
    )?;
    let xml_doc = doc.query(&IID_IXML_DOCUMENT, "QueryInterface(IXmlDocument)")?;

    let class = HString::new(&api, "Windows.UI.Notifications.ToastNotification")?;
    let mut factory: *mut c_void = core::ptr::null_mut();
    check(
        // SAFETY: class and IID remain live; factory is a writable output pointer.
        unsafe { (api.factory)(class.0, &IID_ITOAST_NOTIFICATION_FACTORY, &raw mut factory) },
        "RoGetActivationFactory(ToastNotification)",
    )?;
    let factory = Com(factory);
    type CreateToastNotification =
        unsafe extern "system" fn(*mut c_void, *mut c_void, *mut *mut c_void) -> i32;
    let mut toast: *mut c_void = core::ptr::null_mut();
    check(
        // SAFETY: slot 6 is CreateToastNotification; xml_doc is live and toast is writable.
        unsafe {
            core::mem::transmute::<*const c_void, CreateToastNotification>(factory.slot(6))(
                factory.0,
                xml_doc.0,
                &raw mut toast,
            )
        },
        "CreateToastNotification",
    )?;
    let toast = Com(toast);

    let class = HString::new(&api, "Windows.UI.Notifications.ToastNotificationManager")?;
    let mut statics: *mut c_void = core::ptr::null_mut();
    check(
        // SAFETY: class and IID remain live; statics is a writable output pointer.
        unsafe {
            (api.factory)(
                class.0,
                &IID_ITOAST_NOTIFICATION_MANAGER_STATICS,
                &raw mut statics,
            )
        },
        "RoGetActivationFactory(ToastNotificationManager)",
    )?;
    let statics = Com(statics);
    let id = HString::new(&api, aumid)?;
    type CreateNotifierWithId =
        unsafe extern "system" fn(*mut c_void, HSTRING, *mut *mut c_void) -> i32;
    let mut notifier: *mut c_void = core::ptr::null_mut();
    check(
        // SAFETY: slot 7 is CreateToastNotifierWithId; id is live and notifier is writable.
        unsafe {
            core::mem::transmute::<*const c_void, CreateNotifierWithId>(statics.slot(7))(
                statics.0,
                id.0,
                &raw mut notifier,
            )
        },
        "CreateToastNotifierWithId",
    )?;
    let notifier = Com(notifier);
    type Show = unsafe extern "system" fn(*mut c_void, *mut c_void) -> i32;
    // SAFETY: IToastNotifier slot 6 is Show(IToastNotification*).
    check(
        unsafe {
            core::mem::transmute::<*const c_void, Show>(notifier.slot(6))(notifier.0, toast.0)
        },
        "IToastNotifier.Show",
    )
}
