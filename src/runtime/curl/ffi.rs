use core::ffi::{c_char, c_int, c_long, c_void};

#[repr(C)]
pub(crate) struct VersionInfo {
    pub age: c_int,
    pub version: *const c_char,
    pub version_num: u32,
    pub host: *const c_char,
    pub features: c_int,
    pub ssl_version: *const c_char,
    pub ssl_version_num: c_long,
    pub libz_version: *const c_char,
    pub protocols: *const *const c_char,
}

#[repr(C)]
pub(crate) struct Slist {
    pub data: *mut c_char,
    pub next: *mut Slist,
}

#[repr(C)]
pub(crate) struct EasyOption {
    pub name: *const c_char,
    pub id: c_int,
    pub kind: c_int,
    pub flags: u32,
}

pub(crate) fn initialize() -> c_int {
    static INIT: std::sync::OnceLock<c_int> = std::sync::OnceLock::new();
    *INIT.get_or_init(|| unsafe { curl_global_init(3) })
}

unsafe extern "C" {
    pub(super) fn curl_global_init(flags: c_long) -> c_int;
    pub(super) fn curl_easy_init() -> *mut c_void;
    pub(super) fn curl_easy_cleanup(handle: *mut c_void);
    pub(super) fn curl_easy_setopt(handle: *mut c_void, option: c_int, ...) -> c_int;
    pub(super) fn curl_easy_getinfo(handle: *mut c_void, info: c_int, ...) -> c_int;
    pub(super) fn curl_easy_perform(handle: *mut c_void) -> c_int;
    pub(super) fn curl_slist_append(list: *mut Slist, value: *const c_char) -> *mut Slist;
    pub(super) fn curl_slist_free_all(list: *mut Slist);
    pub(super) fn curl_version_info(age: c_int) -> *const VersionInfo;
    pub(super) fn curl_easy_option_by_name(name: *const c_char) -> *const EasyOption;
    #[cfg(not(windows))]
    pub(super) fn BunCurlMain(argc: c_int, argv: *mut *mut c_char) -> c_int;
    #[cfg(windows)]
    pub(super) fn BunCurlMain(argc: c_int, argv: *mut *mut u16) -> c_int;
}
