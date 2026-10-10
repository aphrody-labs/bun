//! System-catalog signature lookup through `wintrust.dll`'s `CryptCATAdmin*` family.
//!
//! Most Windows binaries carry no embedded Authenticode signature and are instead listed in a
//! system catalog (`%SystemRoot%\System32\CatRoot\...`): the OS computes the file's Authenticode
//! hash and looks it up in the catalog database. A failed lookup means "no catalog", never
//! "signed" — callers must not infer trust from the absence of an error.
//!
//! The SHA-256 and SHA-1 admin contexts are acquired once per process and cached for its
//! lifetime (acquisition is a system call of its own and the contexts are read-only lookups),
//! mirroring the previous per-process cache in `scripts/tools/os/windex/catalog.ts`.
use super::{HANDLE, OwnedHandle, WinErr, WinResult, system_proc, wide};
use core::ffi::c_void;
use std::sync::OnceLock;

const MAX_PATH: usize = 260;
const GENERIC_READ: u32 = 0x8000_0000;
const FILE_SHARE_READ: u32 = 0x1;
const OPEN_EXISTING: u32 = 3;
const FILE_ATTRIBUTE_NORMAL: u32 = 0x80;
const ERROR_PROC_NOT_FOUND: u32 = 127;

type HCATADMIN = *mut c_void;
type HCATINFO = *mut c_void;

#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateFileW(
        name: *const u16,
        access: u32,
        share: u32,
        security: *const c_void,
        disposition: u32,
        flags: u32,
        template: HANDLE,
    ) -> HANDLE;
}

type AcquireContext2 =
    unsafe extern "system" fn(*mut HCATADMIN, *const c_void, *const u16, *const c_void, u32) -> i32;
type CalcHashFromFileHandle2 =
    unsafe extern "system" fn(HCATADMIN, HANDLE, *mut u32, *mut u8, u32) -> i32;
type EnumCatalogFromHash =
    unsafe extern "system" fn(HCATADMIN, *const u8, u32, u32, *mut HCATINFO) -> HCATINFO;
type CatalogInfoFromContext = unsafe extern "system" fn(HCATINFO, *mut u8, u32) -> i32;
type ReleaseCatalogContext = unsafe extern "system" fn(HCATADMIN, HCATINFO, u32) -> i32;
type ReleaseContext = unsafe extern "system" fn(HCATADMIN, u32) -> i32;

#[derive(Clone, Copy)]
struct Wintrust {
    acquire_context2: AcquireContext2,
    calc_hash: CalcHashFromFileHandle2,
    enum_from_hash: EnumCatalogFromHash,
    info_from_context: CatalogInfoFromContext,
    release_catalog: ReleaseCatalogContext,
    release_context: ReleaseContext,
}

fn wintrust() -> WinResult<Wintrust> {
    static API: OnceLock<Option<Wintrust>> = OnceLock::new();
    let api = API.get_or_init(|| {
        let acquire_context2 = system_proc("wintrust.dll", c"CryptCATAdminAcquireContext2")?;
        let calc_hash = system_proc("wintrust.dll", c"CryptCATAdminCalcHashFromFileHandle2")?;
        let enum_from_hash = system_proc("wintrust.dll", c"CryptCATAdminEnumCatalogFromHash")?;
        let info_from_context = system_proc("wintrust.dll", c"CryptCATCatalogInfoFromContext")?;
        let release_catalog = system_proc("wintrust.dll", c"CryptCATAdminReleaseCatalogContext")?;
        let release_context = system_proc("wintrust.dll", c"CryptCATAdminReleaseContext")?;
        // SAFETY: the exports have exactly these documented signatures.
        unsafe {
            Some(Wintrust {
                acquire_context2: core::mem::transmute::<*mut c_void, AcquireContext2>(
                    acquire_context2,
                ),
                calc_hash: core::mem::transmute::<*mut c_void, CalcHashFromFileHandle2>(calc_hash),
                enum_from_hash: core::mem::transmute::<*mut c_void, EnumCatalogFromHash>(
                    enum_from_hash,
                ),
                info_from_context: core::mem::transmute::<*mut c_void, CatalogInfoFromContext>(
                    info_from_context,
                ),
                release_catalog: core::mem::transmute::<*mut c_void, ReleaseCatalogContext>(
                    release_catalog,
                ),
                release_context: core::mem::transmute::<*mut c_void, ReleaseContext>(
                    release_context,
                ),
            })
        }
    });
    api.ok_or(WinErr {
        code: ERROR_PROC_NOT_FOUND,
        call: "GetProcAddress(wintrust.dll)",
    })
}

/// One lazily-acquired `HCATADMIN` per hash algorithm, released at process exit (Windows closes
/// leaked catalog-admin handles on process teardown; an explicit release is exposed to tests
/// through [`release_contexts`] but is not required for correctness).
struct Admins {
    sha256: Option<HCATADMIN>,
    sha1: Option<HCATADMIN>,
}

// SAFETY: `HCATADMIN` is an opaque, thread-agnostic handle per the wintrust documentation; the
// admin contexts are only ever read (hash + enumerate), never mutated concurrently in a way that
// races, and access is already serialized by `OnceLock`/the mutex it is stored behind.
unsafe impl Send for Admins {}

static ADMINS: bun_threading::Guarded<Option<Admins>> = bun_threading::Guarded::new(None);

fn acquire(api: &Wintrust, algorithm: &str) -> Option<HCATADMIN> {
    let name = wide(algorithm);
    let mut handle: HCATADMIN = core::ptr::null_mut();
    // SAFETY: `name` is NUL-terminated; a null subsystem GUID and strong-hash policy ask for the
    // default behavior keyed off the hash algorithm name, matching prior Aphrody usage.
    let ok = unsafe {
        (api.acquire_context2)(
            &raw mut handle,
            core::ptr::null(),
            name.as_ptr(),
            core::ptr::null(),
            0,
        )
    };
    (ok != 0).then_some(handle)
}

fn with_admins<T>(f: impl FnOnce(&Wintrust, &Admins) -> T) -> WinResult<Option<T>> {
    let api = wintrust()?;
    let mut guard = ADMINS.lock();
    let admins = guard.get_or_insert_with(|| Admins {
        sha256: acquire(&api, "SHA256"),
        sha1: acquire(&api, "SHA1"),
    });
    if admins.sha256.is_none() && admins.sha1.is_none() {
        return Ok(None);
    }
    Ok(Some(f(&api, admins)))
}

/// `CATALOG_INFO.wszCatalogFile` for the admin context `admin` and open file `file`, or `None`
/// when the file is not listed by that catalog database.
fn lookup(api: &Wintrust, admin: HCATADMIN, file: HANDLE) -> Option<String> {
    let mut size: u32 = 64;
    let mut hash = [0u8; 64];
    // SAFETY: `hash` and `size` describe a 64-byte buffer, the documented maximum.
    if unsafe { (api.calc_hash)(admin, file, &raw mut size, hash.as_mut_ptr(), 0) } == 0 {
        return None;
    }
    // SAFETY: `hash[..size]` was just filled in by `CryptCATAdminCalcHashFromFileHandle2`.
    let info =
        unsafe { (api.enum_from_hash)(admin, hash.as_ptr(), size, 0, core::ptr::null_mut()) };
    if info.is_null() {
        return None;
    }
    // CATALOG_INFO: DWORD cbStruct + WCHAR wszCatalogFile[MAX_PATH].
    let mut buf = vec![0u8; 4 + MAX_PATH * 2];
    let len = buf.len() as u32;
    buf[..4].copy_from_slice(&len.to_le_bytes());
    // SAFETY: `buf` is sized and its `cbStruct` field is set as the API requires.
    let ok = unsafe { (api.info_from_context)(info, buf.as_mut_ptr(), 0) };
    let name = if ok != 0 {
        let units: Vec<u16> = buf[4..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
            .collect();
        let text = super::from_wide(&units);
        if text.is_empty() {
            "catalog".to_owned()
        } else {
            text
        }
    } else {
        "catalog".to_owned()
    };
    // SAFETY: `info` was returned by `CryptCATAdminEnumCatalogFromHash` and is released exactly
    // once here.
    unsafe { (api.release_catalog)(admin, info, 0) };
    Some(name)
}

/// Full path of the system catalog that lists `path` (SHA-256 database first, then SHA-1), or
/// `None` when no catalog lists it — including when `path` cannot be opened for reading, or when
/// `wintrust.dll` is unavailable.
pub(crate) fn catalog_file(path: &str) -> WinResult<Option<String>> {
    let wide_path = wide(path);
    // SAFETY: `wide_path` is NUL-terminated.
    let handle = unsafe {
        CreateFileW(
            wide_path.as_ptr(),
            GENERIC_READ,
            FILE_SHARE_READ,
            core::ptr::null(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            core::ptr::null_mut(),
        )
    };
    if handle.is_null() || handle as isize == -1 {
        return Ok(None);
    }
    let file = OwnedHandle(handle);
    let found = with_admins(|api, admins| {
        [admins.sha256, admins.sha1]
            .into_iter()
            .flatten()
            .find_map(|admin| lookup(api, admin, file.0))
    })?;
    Ok(found.flatten())
}

/// Releases the cached admin contexts; mainly useful for tests that want a clean process state.
/// A process exit without calling this leaks no resource the OS does not already reclaim.
pub(crate) fn release_contexts() {
    let api = match wintrust() {
        Ok(api) => api,
        Err(_) => return,
    };
    let mut guard = ADMINS.lock();
    if let Some(admins) = guard.take() {
        for admin in [admins.sha256, admins.sha1].into_iter().flatten() {
            // SAFETY: `admin` was returned by `CryptCATAdminAcquireContext2` and is released
            // exactly once here.
            unsafe { (api.release_context)(admin, 0) };
        }
    }
}
